# 🔮 ClawScope

**Dashboard UI for OpenClaw** — Visualize your agent's memory, sessions, and activity in real-time.

![ClawScope Screenshot](docs/screenshot.png)

## Features

### 🔍 Global Search
- Hybrid search (lexical + semantic) across all memories
- Filter by source, date, confidence
- Real-time results with snippets

### 📅 Timeline View
- Day-grouped events (tool calls, sessions, cron jobs, alerts)
- Collapsible sections
- Auto-refresh every 30s

### 🕸️ Knowledge Graph
- Interactive force-directed graph visualization (D3.js)
- Zoom/pan + drag nodes
- Filter by entity and confidence level
- Click nodes to see relationships

### 📊 Activity Feed
- Real-time tool usage, session state changes
- Cron job executions, warnings, errors

### 📋 Scheduled Tasks
- View all cron jobs
- Next run times
- Enable/disable status

## Tech Stack

- **Backend:** Node.js + TypeScript + HTTP server
- **Frontend:** Vanilla JS + D3.js (no framework)
- **Database:** SQLite (via `@akashabot/openclaw-memory-offline-core`)
- **Port:** 3101 (default)

## Installation

```bash
npm install
npm run build
npm start
```

Or use the frontend server directly:
```bash
node dist/frontend.js
```

## Configuration

ClawScope reads from the OpenClaw memory database at:
```
~/.openclaw/memory/offline.sqlite
```

## Endpoints

| Endpoint | Description |
|----------|-------------|
| `/` | Search UI |
| `/timeline` | Timeline view |
| `/graph` | Knowledge graph |
| `/memory/search` | Search API |
| `/graph-data` | Graph JSON for D3.js |
| `/sessions` | Active sessions |
| `/activity` | Activity feed |
| `/tasks` | Scheduled tasks |

## Related Projects

- [openclaw-memory-offline-sqlite](https://github.com/AkashaBot/openclaw-memory-offline-sqlite) — Core SQLite memory engine
- [openclaw-memory-offline-sqlite-plugin](https://github.com/AkashaBot/openclaw-memory-offline-sqlite-plugin) — OpenClaw plugin

## License

MIT

---

Part of the [OpenClaw](https://openclaw.ai) ecosystem.
