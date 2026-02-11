// src/mcp-server.ts
// ClawScope MCP Server - expose dashboard data to other AI clients

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import childProcess from 'child_process';
import os from 'node:os';
import path from 'node:path';
import {
  openDb,
  initSchema,
  runMigrations,
  searchItems,
  hybridSearch,
  getEntityGraph,
  getAllFacts,
  getGraphStats,
  exportGraphJson,
  type MemConfig,
} from '@akashabot/openclaw-memory-offline-core';

const exec = (cmd: string, options?: any): Promise<{ stdout: string; stderr: string }> => {
  return new Promise((resolve, reject) => {
    childProcess.exec(cmd, { encoding: 'utf8', ...(options || {}) }, (err, stdout, stderr) => {
      if (err) reject(err);
      else resolve({ stdout: stdout as unknown as string, stderr: stderr as unknown as string });
    });
  });
};

// Default DB path
const DB_PATH = process.env.OPENCLAW_MEMORY_DB || path.join(os.homedir(), '.openclaw', 'memory', 'offline.sqlite');

// Initialize database
const db = openDb(DB_PATH);
initSchema(db);
runMigrations(db);

// Create MCP server
const server = new McpServer({
  name: 'clawscope',
  version: '0.1.0',
}, {
  capabilities: {
    tools: {},
  },
});

// ============================================================================
// Helper: Run openclaw CLI command
// ============================================================================

async function runOpenclaw(args: string): Promise<string> {
  const { stdout } = await exec(`openclaw ${args}`, { timeout: 15000 });
  return stdout.replace(/\x1b\[[0-9;]*m/g, ''); // Strip ANSI
}

// ============================================================================
// Sessions Tools
// ============================================================================

server.tool(
  'clawscope_list_sessions',
  'List all OpenClaw sessions (main, sub-agents, isolated)',
  {},
  async () => {
    try {
      const output = await runOpenclaw('sessions --json');
      const jsonStart = output.search(/[\[{]/);
      const data = JSON.parse(jsonStart >= 0 ? output.slice(jsonStart) : output);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    } catch (e: any) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: e.message }) }] };
    }
  }
);

// ============================================================================
// Tasks Tools
// ============================================================================

server.tool(
  'clawscope_list_tasks',
  'List all scheduled cron tasks/jobs',
  {},
  async () => {
    try {
      const output = await runOpenclaw('cron list --json');
      const jsonStart = output.search(/[\[{]/);
      const data = JSON.parse(jsonStart >= 0 ? output.slice(jsonStart) : output);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    } catch (e: any) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: e.message }) }] };
    }
  }
);

// ============================================================================
// Activity Tools
// ============================================================================

server.tool(
  'clawscope_get_activity',
  'Get recent activity from OpenClaw logs (tools, sessions, cron, alerts)',
  {
    limit: z.number().optional().describe('Number of log entries to fetch (default: 50)')
  },
  async (params) => {
    try {
      const limit = params.limit ?? 50;
      const output = await runOpenclaw(`logs --json --limit ${limit}`);
      const lines = output.split('\n').filter(l => l.trim().startsWith('{'));
      const events: any[] = [];

      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          if (parsed.type !== 'log') continue;

          const subsystem = parsed.subsystem || '';
          const message = parsed.message || '';
          const level = parsed.level || 'debug';

          // Tool usage
          if (subsystem === 'agent/embedded' && message.includes('tool ')) {
            const toolMatch = message.match(/tool=(\w+)/);
            const actionMatch = message.match(/tool (start|end)/);
            if (toolMatch && actionMatch) {
              events.push({
                ts: parsed.time,
                kind: 'tool',
                summary: `${actionMatch[1] === 'start' ? '▶' : '✓'} ${toolMatch[1]}`,
                level
              });
            }
          }
          // Session state changes
          else if (subsystem === 'diagnostic' && message.includes('session state')) {
            events.push({
              ts: parsed.time,
              kind: 'session',
              summary: message.slice(0, 100),
              level
            });
          }
          // Cron jobs
          else if (subsystem === 'cron' || message.includes('cron')) {
            events.push({
              ts: parsed.time,
              kind: 'cron',
              summary: message.slice(0, 100),
              level
            });
          }
          // Alerts (warnings/errors)
          else if ((level === 'warn' || level === 'error') && !message.includes('Config was last written by a newer OpenClaw')) {
            events.push({
              ts: parsed.time,
              kind: 'alert',
              summary: message.slice(0, 150),
              level
            });
          }
        } catch { /* skip malformed */ }
      }

      return { content: [{ type: 'text', text: JSON.stringify(events.slice(0, limit), null, 2) }] };
    } catch (e: any) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: e.message }) }] };
    }
  }
);

// ============================================================================
// Memory Tools (proxy to offline-sqlite)
// ============================================================================

server.tool(
  'clawscope_search_memory',
  'Search the offline memory database (hybrid search)',
  {
    query: z.string().describe('Search query'),
    limit: z.number().optional().describe('Max results (default: 10)')
  },
  async (params) => {
    try {
      const limit = params.limit ?? 10;
      const result = searchItems(db, params.query, limit);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (e: any) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: e.message }) }] };
    }
  }
);

server.tool(
  'clawscope_get_graph',
  'Get knowledge graph data (entities and facts)',
  {
    entity: z.string().optional().describe('Filter by entity name')
  },
  async (params) => {
    try {
      if (params.entity) {
        const graph = getEntityGraph(db, params.entity);
        return { content: [{ type: 'text', text: JSON.stringify(graph, null, 2) }] };
      } else {
        const graph = exportGraphJson(db);
        return { content: [{ type: 'text', text: JSON.stringify(graph, null, 2) }] };
      }
    } catch (e: any) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: e.message }) }] };
    }
  }
);

server.tool(
  'clawscope_get_graph_stats',
  'Get knowledge graph statistics',
  {},
  async () => {
    try {
      const stats = getGraphStats(db);
      return { content: [{ type: 'text', text: JSON.stringify(stats, null, 2) }] };
    } catch (e: any) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: e.message }) }] };
    }
  }
);

// ============================================================================
// Start Server
// ============================================================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[ClawScope MCP Server] Running on stdio');
}

main().catch(console.error);
