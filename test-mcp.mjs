// Test MCP server by calling it directly
import { spawn } from 'child_process';
import path from 'path';

const mcpPath = path.join(process.cwd(), 'dist', 'mcp-server.js');
const proc = spawn('node', [mcpPath], {
  env: { ...process.env, OPENCLAW_MEMORY_DB: path.join(process.env.USERPROFILE || '', '.openclaw', 'memory', 'offline.sqlite') }
});

let output = '';
proc.stderr.on('data', (d) => { output += d.toString(); console.error('[stderr]', d.toString()); });
proc.stdout.on('data', (d) => { output += d.toString(); console.log('[stdout]', d.toString()); });

// Send a test message to list tools
const initMsg = JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'test', version: '1.0.0' }
  }
}) + '\n';

proc.stdin.write(initMsg);

setTimeout(() => {
  console.log('\n=== Output so far ===');
  console.log(output);
  proc.kill();
  process.exit(0);
}, 3000);
