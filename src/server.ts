// src/server.ts
// ClawScope server with UI + API

import http from 'node:http';
import type { SearchBackend } from './search.js';

// Dynamic import helper to load TS backend without .js shim
let backendPromise: Promise<SearchBackend> | null = null;
async function getBackend(): Promise<SearchBackend> {
  if (!backendPromise) {
    backendPromise = (async () => {
      try {
        const mod = await import('./offline-sqlite-backend.js');
        const Clazz = (mod as any).OfflineSqliteSearchBackend ?? (mod as any).default;
        if (!Clazz) throw new Error('No export found for OfflineSqliteSearchBackend');
        console.log('Dynamic backend loaded from offline-sqlite-backend.ts:', Clazz.name || 'OfflineSqliteSearchBackend');
        return new Clazz() as SearchBackend;
      } catch (e) {
        console.error('Failed to load TS backend dynamically:', e);
        throw e;
      }
    })();
  }
  return backendPromise;
}

// We'll instantiate backend at runtime
let backendInstance: SearchBackend | null = null;
async function ensureBackend() {
  if (!backendInstance) {
    backendInstance = await getBackend();
  }
  // Log when backend is ready
  console.log('Backend ready:', backendInstance?.constructor?.name ?? 'Unknown');
  return backendInstance!;
}


// Handle uncaught errors
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
  process.exit(1);
});

// Primary backend will be loaded dynamically at runtime
// const backend: SearchBackend = new OfflineSqliteSearchBackend();


const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>OpenClaw ClawScope</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 0; padding: 0; background: #0b1120; color: #e5e7eb; }
    header { padding: 1rem 1.5rem; border-bottom: 1px solid #1f2937; }
    header h1 { font-size: 1.2rem; margin: 0; }
    main { padding: 1.5rem; max-width: 900px; }
    .search-bar { display: flex; gap: 0.5rem; margin-bottom: 1.5rem; }
    input[type="text"] { flex: 1; padding: 0.6rem 0.8rem; border-radius: 6px; border: 1px solid #374151; background: #111827; color: #e5e7eb; font-size: 1rem; }
    select, button { padding: 0.6rem 1rem; border-radius: 6px; border: 1px solid #374151; background: #1f2937; color: #e5e7eb; cursor: pointer; }
    button:hover { background: #374151; }
    .results { display: flex; flex-direction: column; gap: 0.75rem; }
    .result { padding: 1rem; border-radius: 8px; background: #111827; border: 1px solid #1f2937; }
    .result-header { display: flex; gap: 0.5rem; align-items: baseline; margin-bottom: 0.25rem; }
    .badge { font-size: 0.7rem; text-transform: uppercase; padding: 0.15rem 0.5rem; border-radius: 4px; background: #065f46; color: #6ee7b7; }
    .source { font-size: 0.7rem; color: #6b7280; }
    .snippet { font-size: 0.9rem; color: #e5e7eb; margin-top: 0.25rem; }
    .meta { font-size: 0.75rem; color: #6b7280; margin-top: 0.5rem; }
    .empty { color: #6b7280; font-style: italic; }
    .error { color: #f87171; }
  </style>
</head>
<body>
  <header><h1>🔮 OpenClaw ClawScope</h1></header>
  <main>
    <form class="search-bar" id="form">
      <input type="text" id="q" placeholder="Search memories..." autofocus />
      <select id="mode">
        <option value="lexical">Lexical</option>
        <option value="hybrid" selected>Hybrid</option>
      </select>
      <button type="submit">Search</button>
    </form>
    <div class="results" id="results">
      <div class="empty">Type a query and press Enter to search your offline memory.</div>
    </div>
  </main>
  <script>
    document.getElementById('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const q = document.getElementById('q').value.trim();
      const mode = document.getElementById('mode').value;
      if (!q) return;
      
      const resultsEl = document.getElementById('results');
      resultsEl.innerHTML = '<div class="empty">Searching...</div>';
      
      try {
        const res = await fetch('/memory/search?q=' + encodeURIComponent(q) + '&mode=' + mode + '&limit=10');
        const items = await res.json();
        
        if (!items.length) {
          resultsEl.innerHTML = '<div class="empty">No results found.</div>';
          return;
        }
        
        resultsEl.innerHTML = items.map(item => {
          const date = item.created_at ? new Date(item.created_at).toLocaleDateString() : '';
          return '<div class="result">' +
            '<div class="result-header">' +
              '<span class="badge">' + (item.kind || 'memory') + '</span>' +
              (item.source ? '<span class="source">' + item.source + '</span>' : '') +
            '</div>' +
            '<div class="snippet">' + (item.snippet || item.text || '') + '</div>' +
            '<div class="meta">Score: ' + (item.score || 0).toFixed(2) + (date ? ' · ' + date : '') + '</div>' +
          '</div>';
        }).join('');
      } catch (err) {
        resultsEl.innerHTML = '<div class="error">Error: ' + err.message + '</div>';
      }
    });
  </script>
</body>
</html>`;

const server = http.createServer(async (req, res) => {
  if (!req.url) {
    res.statusCode = 400;
    res.end('Missing URL');
    return;
  }

  const url = new URL(req.url, 'http://localhost');

  // Serve UI for SPA routes (root + common UI paths)
  const uiRoutes = new Set(['/', '/timeline', '/graph', '/settings', '/db']);
  if (req.method === 'GET' && uiRoutes.has(url.pathname)) {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(html);
    return;
  }

  // API endpoint
  if (req.method === 'GET' && url.pathname === '/memory/search') {
    const q = url.searchParams.get('q') || '';
    const mode = (url.searchParams.get('mode') as any) || 'hybrid';
    const limit = parseInt(url.searchParams.get('limit') || '20', 10);

    try {
      const backend = await ensureBackend();
      const items = await backend.search({ query: q, mode, limit });
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(items, null, 2));
    } catch (err: any) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: err?.message || 'search failed' }));
    }
    return;
  }

  res.statusCode = 404;
  res.end('Not found');
});

export function startServer(port = 3101) {
  server.listen(port, () => {
    console.log(`Mission Control listening on http://localhost:${port}`);
  });
}

console.log('Starting ClawScope...');
startServer();
console.log('Server started, waiting for connections...');
