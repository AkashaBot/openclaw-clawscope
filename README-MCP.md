# ClawScope MCP Server

ClawScope exposes its data to other AI clients via an MCP (Model Context Protocol) server.

## Available Tools

### Sessions
- `clawscope_list_sessions` - List all OpenClaw sessions (main, sub-agents, isolated)

### Tasks
- `clawscope_list_tasks` - List all scheduled cron tasks/jobs

### Activity
- `clawscope_get_activity` - Get recent activity from OpenClaw logs
  - Params: `limit` (optional, default: 50)

### Memory
- `clawscope_search_memory` - Search the offline memory database
  - Params: `query` (required), `limit` (optional, default: 10)
- `clawscope_get_graph` - Get knowledge graph data (entities and facts)
  - Params: `entity` (optional, filter by entity name)
- `clawscope_get_graph_stats` - Get knowledge graph statistics

## Integration

### Claude Desktop

Add to your Claude Desktop config (`%APPDATA%\Claude\claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "clawscope": {
      "command": "node",
      "args": ["C:\\Users\\algon\\clawd\\projects\\openclaw-mission-control\\dist\\mcp-server.js"],
      "env": {
        "OPENCLAW_MEMORY_DB": "C:\\Users\\algon\\.openclaw\\memory\\offline.sqlite"
      }
    }
  }
}
```

### Cursor / Windsurf

Similar configuration in your MCP settings file.

## Building

```bash
cd projects/openclaw-mission-control
npm install
npm run build
```

## Running

```bash
npm run start:mcp
```

The server communicates via stdio (MCP standard).
