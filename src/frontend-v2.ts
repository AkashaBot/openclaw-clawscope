// src/frontend-v2.ts
// Modern, clean UI for ClawScope with all pages

import http from 'http';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import type { SearchBackend, SearchMode } from './search.js';
import { getGraphStats, getEntityGraph, getAllFacts, extractFactsSimple, openDb, initSchema, runMigrations } from '@akashabot/openclaw-memory-offline-core';

const { OfflineSqliteSearchBackend } = await import('./offline-sqlite-backend.js');
const { InMemoryActivityBackend } = await import('./activity-backend.js');
const { InMemoryTaskBackend } = await import('./tasks-backend.js');

const backend: SearchBackend = new OfflineSqliteSearchBackend();
const activityBackend = new InMemoryActivityBackend();
const taskBackend = new InMemoryTaskBackend();

let lastExtractAt: number = 0;

// Boot-time bootstrap: attempt to refresh facts from memory on startup
(async () => {
  try {
    const db = openDb(getDbPath());
    runMigrations(db);
    initSchema(db);
    const count = await extractFactsSimple(getDbPath());
    lastExtractAt = Date.now();
    console.log('[Boot] Initial facts rebuild completed:', Array.isArray(count) ? count.length : 0, 'entries');
  } catch (err: any) {
    console.error('[Boot] Initial facts rebuild failed:', err?.message ?? err);
  }
})();

// =============================================================================
// DESIGN SYSTEM
// =============================================================================
const styles = `
:root {
  --bg-primary: #0a0f1a;
  --bg-secondary: #111827;
  --bg-card: #1a2234;
  --bg-hover: #243049;
  --border: #2d3748;
  --border-light: #374151;
  --text-primary: #f1f5f9;
  --text-secondary: #94a3b8;
  --text-muted: #64748b;
  --accent: #22c55e;
  --accent-glow: rgba(34, 197, 94, 0.15);
  --accent-blue: #3b82f6;
  --accent-purple: #a855f7;
  --accent-orange: #f97316;
  --accent-red: #ef4444;
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 14px;
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.3);
  --shadow-md: 0 4px 12px rgba(0,0,0,0.4);
}

* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: var(--bg-primary);
  color: var(--text-primary);
  line-height: 1.5;
  min-height: 100vh;
}

/* Header */
.header {
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border);
  padding: 0.75rem 1.5rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  position: sticky;
  top: 0;
  z-index: 50;
}

.logo {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  font-weight: 600;
  font-size: 1.1rem;
  color: var(--text-primary);
  text-decoration: none;
}

.logo-icon {
  width: 28px;
  height: 28px;
  background: linear-gradient(135deg, var(--accent) 0%, #059669 100%);
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1rem;
}

.nav {
  display: flex;
  gap: 0.25rem;
  background: var(--bg-card);
  padding: 4px;
  border-radius: var(--radius-md);
}

.nav-item {
  padding: 0.4rem 0.75rem;
  border-radius: var(--radius-sm);
  text-decoration: none;
  font-size: 0.85rem;
  color: var(--text-secondary);
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.nav-item:hover { color: var(--text-primary); background: var(--bg-hover); }
.nav-item.active { background: var(--accent-glow); color: var(--accent); }

/* Status bar */
.status-bar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 1.5rem;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border);
  font-size: 0.75rem;
  color: var(--text-muted);
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 8px var(--accent);
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
.status-dot.warn { background: var(--accent-orange); box-shadow: 0 0 8px var(--accent-orange); }
.status-dot.error { background: var(--accent-red); box-shadow: 0 0 8px var(--accent-red); }

.status-stats { display: flex; gap: 1rem; margin-left: auto; }
.stat { display: flex; align-items: center; gap: 0.3rem; }
.stat-value { color: var(--text-primary); font-weight: 600; font-variant-numeric: tabular-nums; }

/* Main */
.main { padding: 1.5rem; max-width: 1600px; margin: 0 auto; }

/* Layouts */
.layout-grid { display: grid; grid-template-columns: 1fr 320px; gap: 1.5rem; }
@media (max-width: 1024px) { .layout-grid { grid-template-columns: 1fr; } .sidebar { display: none; } }

/* Cards */
.card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  overflow: hidden;
  margin-bottom: 1rem;
}

.card-header {
  padding: 0.875rem 1.25rem;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  transition: background 0.2s;
}

.card-header:hover { background: var(--bg-hover); }
.card-title { font-size: 0.9rem; font-weight: 600; display: flex; align-items: center; gap: 0.5rem; }
.card-badge { background: var(--bg-secondary); color: var(--text-muted); font-size: 0.7rem; padding: 0.2rem 0.5rem; border-radius: 999px; }
.card-body { padding: 1rem 1.25rem; max-height: 250px; overflow-y: auto; }
.card-body.collapsed { display: none; }
.card-body::-webkit-scrollbar { width: 4px; }
.card-body::-webkit-scrollbar-track { background: transparent; }
.card-body::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

/* Form elements */
.input {
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 0.65rem 1rem;
  color: var(--text-primary);
  font-size: 0.9rem;
  transition: border-color 0.2s, box-shadow 0.2s;
  width: 100%;
}

.input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-glow); }
.input::placeholder { color: var(--text-muted); }

.select {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 0.5rem 0.75rem;
  color: var(--text-secondary);
  font-size: 0.8rem;
  cursor: pointer;
}

.select:focus { outline: none; border-color: var(--accent); }

.btn {
  padding: 0.5rem 1rem;
  border-radius: var(--radius-sm);
  border: none;
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: 500;
  transition: all 0.2s;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}

.btn-primary { background: var(--accent); color: #000; }
.btn-primary:hover { background: #16a34a; transform: translateY(-1px); }
.btn-secondary { background: var(--bg-hover); color: var(--text-secondary); border: 1px solid var(--border); }
.btn-secondary:hover { background: var(--border); color: var(--text-primary); }

/* Search */
.search-container { margin-bottom: 1.5rem; }
.search-box { display: flex; gap: 0.5rem; margin-bottom: 0.75rem; }
.search-filters { display: flex; gap: 0.5rem; flex-wrap: wrap; }

/* Results */
.results { display: flex; flex-direction: column; gap: 0.5rem; }

.result-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 1rem;
  cursor: pointer;
  transition: all 0.2s;
}

.result-card:hover { border-color: var(--border-light); transform: translateY(-1px); box-shadow: var(--shadow-md); }
.result-header { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.4rem; }
.result-text { font-size: 0.9rem; color: var(--text-primary); margin-bottom: 0.4rem; }
.result-meta { font-size: 0.75rem; color: var(--text-muted); display: flex; gap: 0.75rem; }

/* Badges */
.badge {
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 0.2rem 0.5rem;
  border-radius: 999px;
  font-weight: 600;
}

.badge-memory { background: var(--accent-glow); color: var(--accent); }
.badge-session { background: rgba(249,115,22,0.15); color: var(--accent-orange); }
.badge-cron { background: rgba(59,130,246,0.15); color: var(--accent-blue); }
.badge-alert { background: rgba(239,68,68,0.15); color: var(--accent-red); }
.badge-tool { background: rgba(168,85,247,0.15); color: var(--accent-purple); }

/* List items */
.list-item { padding: 0.5rem 0; border-bottom: 1px solid var(--border); font-size: 0.85rem; color: var(--text-secondary); }
.list-item:last-child { border-bottom: none; }
.list-item:hover { color: var(--text-primary); }
.list-item-time { color: var(--text-muted); font-size: 0.7rem; font-family: ui-monospace, monospace; }

/* Tags */
.tags { display: flex; flex-wrap: wrap; gap: 0.35rem; }
.tag { background: var(--bg-secondary); color: var(--text-muted); font-size: 0.7rem; padding: 0.25rem 0.5rem; border-radius: var(--radius-sm); cursor: pointer; transition: all 0.2s; }
.tag:hover { background: var(--bg-hover); color: var(--text-primary); }

/* Empty */
.empty { text-align: center; padding: 2rem; color: var(--text-muted); font-size: 0.85rem; }
.empty-icon { font-size: 2rem; margin-bottom: 0.5rem; opacity: 0.5; }

/* Spinner */
.spinner { width: 20px; height: 20px; border: 2px solid var(--border); border-top-color: var(--accent); border-radius: 50%; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

/* Detail panel */
.detail-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); opacity: 0; visibility: hidden; transition: all 0.3s; z-index: 100; }
.detail-overlay.open { opacity: 1; visibility: visible; }

.detail-panel {
  position: fixed;
  right: 0;
  top: 0;
  width: 420px;
  max-width: 100%;
  height: 100%;
  background: var(--bg-secondary);
  border-left: 1px solid var(--border);
  transform: translateX(100%);
  transition: transform 0.3s ease;
  z-index: 101;
  overflow-y: auto;
}

.detail-panel.open { transform: translateX(0); }
.detail-header { padding: 1rem 1.25rem; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; background: var(--bg-secondary); }
.detail-title { font-size: 1rem; font-weight: 600; }
.detail-close { background: none; border: none; color: var(--text-muted); font-size: 1.5rem; cursor: pointer; line-height: 1; }
.detail-close:hover { color: var(--text-primary); }
.detail-body { padding: 1.25rem; }
.detail-pre { background: var(--bg-primary); padding: 0.75rem; border-radius: var(--radius-sm); font-size: 0.75rem; overflow-x: auto; white-space: pre-wrap; word-break: break-word; }

/* Toast */
.toast-container { position: fixed; bottom: 1.5rem; right: 1.5rem; display: flex; flex-direction: column; gap: 0.5rem; z-index: 200; }
.toast { padding: 0.75rem 1rem; border-radius: var(--radius-md); font-size: 0.85rem; animation: slideIn 0.3s ease; box-shadow: var(--shadow-md); }
.toast-success { background: #065f46; border-left: 3px solid var(--accent); }
.toast-error { background: #7f1d1d; border-left: 3px solid var(--accent-red); }
.toast-info { background: #1e3a5f; border-left: 3px solid var(--accent-blue); }
@keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }

/* Timeline specific */
.timeline { display: flex; flex-direction: column; gap: 1rem; }
.day-group { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-lg); overflow: hidden; }
.day-header { background: var(--bg-secondary); padding: 0.75rem 1rem; font-size: 0.9rem; font-weight: 600; display: flex; justify-content: space-between; cursor: pointer; }
.day-header:hover { background: var(--bg-hover); }
.day-count { font-size: 0.75rem; color: var(--text-muted); font-weight: normal; }
.day-events { padding: 0.5rem 0; }
.day-events.collapsed { display: none; }

.event {
  display: grid;
  grid-template-columns: 60px 80px 1fr;
  gap: 0.75rem;
  align-items: start;
  padding: 0.6rem 1rem;
  cursor: pointer;
  transition: background 0.15s;
}

.event:hover { background: var(--bg-hover); }
.event-time { font-size: 0.75rem; color: var(--text-muted); font-family: ui-monospace, monospace; }
.event-kind { font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.05em; padding: 0.15rem 0.4rem; border-radius: 999px; text-align: center; }
.event-kind.tool { background: rgba(168,85,247,0.15); color: var(--accent-purple); }
.event-kind.session { background: rgba(249,115,22,0.15); color: var(--accent-orange); }
.event-kind.cron { background: rgba(59,130,246,0.15); color: var(--accent-blue); }
.event-kind.alert { background: rgba(239,68,68,0.15); color: var(--accent-red); }
.event-kind.memory { background: var(--accent-glow); color: var(--accent); }
.event-summary { font-size: 0.85rem; color: var(--text-primary); }

/* Graph */
.graph-container { width: 100%; height: calc(100vh - 160px); background: var(--bg-card); border-radius: var(--radius-lg); border: 1px solid var(--border); overflow: hidden; }
.graph-controls { display: flex; gap: 0.75rem; padding: 1rem; align-items: center; flex-wrap: wrap; }

/* Settings */
.settings-section { margin-bottom: 1.5rem; }
.settings-label { display: block; font-size: 0.85rem; font-weight: 500; margin-bottom: 0.5rem; color: var(--text-secondary); }
.settings-row { display: flex; gap: 0.75rem; align-items: center; margin-bottom: 0.75rem; }

/* DB */
.db-table { width: 100%; border-collapse: collapse; font-size: 0.8rem; }
.db-table th, .db-table td { padding: 0.5rem 0.75rem; text-align: left; border-bottom: 1px solid var(--border); }
.db-table th { background: var(--bg-secondary); font-weight: 600; color: var(--text-secondary); position: sticky; top: 0; }
.db-table tr:hover td { background: var(--bg-hover); }

/* Keyboard shortcuts */
.kbd { display: inline-block; padding: 0.15rem 0.4rem; font-size: 0.7rem; font-family: ui-monospace, monospace; background: var(--bg-secondary); border: 1px solid var(--border); border-radius: var(--radius-sm); color: var(--text-muted); }
`;

// =============================================================================
// PAGE TEMPLATES
// =============================================================================

const navHtml = (active: string) => `
<div class="header">
  <a href="/" class="logo"><div class="logo-icon">🔮</div><span>ClawScope</span></a>
  <nav class="nav">
    <a href="/" class="nav-item ${active === 'search' ? 'active' : ''}">🔍 Search</a>
    <a href="/timeline" class="nav-item ${active === 'timeline' ? 'active' : ''}">📅 Timeline</a>
    <a href="/graph" class="nav-item ${active === 'graph' ? 'active' : ''}">🕸️ Graph</a>
    <a href="/db" class="nav-item ${active === 'db' ? 'active' : ''}">🗄️ DB</a>
    <a href="/settings" class="nav-item ${active === 'settings' ? 'active' : ''}">⚙️ Settings</a>
  </nav>
</div>`;

const statusBarHtml = `
<div class="status-bar">
  <span class="status-dot" id="status-dot"></span>
  <span id="status-text">Checking...</span>
  <div class="status-stats">
    <span class="stat"><span class="stat-value" id="stat-sessions">—</span> sessions</span>
    <span class="stat"><span class="stat-value" id="stat-tasks">—</span> tasks</span>
    <span class="stat"><span class="stat-value" id="stat-memories">—</span> memories</span>
  </div>
</div>`;

// Main Search Page
const searchPageHtml = `
<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>ClawScope — Search</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${styles}</style></head>
<body>
${navHtml('search')}
${statusBarHtml}
<main class="main">
  <div class="layout-grid">
    <div class="content">
      <div class="card">
        <div class="card-body">
          <form id="search-form" class="search-box">
            <input type="text" class="input" id="search-input" placeholder="Search your offline memory..." autofocus />
            <button type="submit" class="btn btn-primary">Search</button>
          </form>
          <div class="search-filters">
            <select class="select" id="mode-select">
              <option value="hybrid">Hybrid</option>
              <option value="lexical">Lexical</option>
              <option value="semantic">Semantic</option>
            </select>
            <input type="text" class="select" id="source-filter" placeholder="Filter source..." style="width:auto" />
          </div>
        </div>
      </div>
      <div class="results" id="results">
        <div class="empty"><div class="empty-icon">🔍</div><div>Search your offline memory</div><div style="margin-top:0.5rem;font-size:0.75rem">Press <span class="kbd">Enter</span> or click Search</div></div>
      </div>
    </div>
    <aside class="sidebar">
      <div class="card">
        <div class="card-header" data-toggle="sessions-body"><span class="card-title">💬 Sessions</span><span class="card-badge" id="sessions-count">0</span></div>
        <div class="card-body" id="sessions-body"><div class="empty" style="padding:1rem">No sessions</div></div>
      </div>
      <div class="card">
        <div class="card-header" data-toggle="tasks-body"><span class="card-title">⏰ Tasks</span><span class="card-badge" id="tasks-count">0</span></div>
        <div class="card-body" id="tasks-body"><div class="empty" style="padding:1rem">No tasks</div></div>
      </div>
      <div class="card">
        <div class="card-header" data-toggle="categories-body"><span class="card-title">🏷️ Categories</span></div>
        <div class="card-body" id="categories-body"><div class="tags" id="categories-tags"></div></div>
      </div>
    </aside>
  </div>
</main>
<div class="detail-overlay" id="detail-overlay"></div>
<div class="detail-panel" id="detail-panel">
  <div class="detail-header"><span class="detail-title" id="detail-title">Details</span><button class="detail-close" id="detail-close">×</button></div>
  <div class="detail-body" id="detail-body"></div>
</div>
<div class="toast-container" id="toast-container"></div>
<script>
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/'/g,'&#39;').replace(/"/g,'&quot;');
const formatTime = ts => { try { return new Date(ts).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'}); } catch { return '?'; } };

// Toggle cards
document.querySelectorAll('[data-toggle]').forEach(el => {
  el.addEventListener('click', () => {
    const targetId = el.getAttribute('data-toggle');
    const target = $(targetId);
    if (target) target.classList.toggle('collapsed');
  });
});

function showToast(msg, type) {
  const c = $('toast-container');
  const t = document.createElement('div');
  t.className = 'toast toast-' + (type || 'info');
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => t.remove(), 4000);
}

function showDetail(title, content) {
  $('detail-title').textContent = title;
  $('detail-body').innerHTML = content;
  $('detail-overlay').classList.add('open');
  $('detail-panel').classList.add('open');
}

function hideDetail() {
  $('detail-overlay').classList.remove('open');
  $('detail-panel').classList.remove('open');
}

$('detail-close').addEventListener('click', hideDetail);
$('detail-overlay').addEventListener('click', hideDetail);

async function loadStatus() {
  try {
    const [sessions, tasks] = await Promise.all([
      fetch('/sessions').then(r => r.ok ? r.json() : []).catch(() => []),
      fetch('/tasks').then(r => r.ok ? r.json() : []).catch(() => [])
    ]);
    const sessionsArr = Array.isArray(sessions) ? sessions : (sessions.sessions || []);
    const tasksArr = Array.isArray(tasks) ? tasks : [];
    
    $('stat-sessions').textContent = sessionsArr.length;
    $('stat-tasks').textContent = tasksArr.length;
    $('sessions-count').textContent = sessionsArr.length;
    $('tasks-count').textContent = tasksArr.length;
    
    $('status-dot').className = 'status-dot';
    $('status-text').textContent = 'All systems operational';
    
    if (sessionsArr.length > 0) {
      $('sessions-body').innerHTML = sessionsArr.slice(0,6).map(s => 
        '<div class="list-item"><div>' + esc(s.displayName || s.key || 'Session') + '</div><div class="list-item-time">' + (s.updatedAt ? formatTime(s.updatedAt) : '') + '</div></div>'
      ).join('');
    }
    if (tasksArr.length > 0) {
      $('tasks-body').innerHTML = tasksArr.slice(0,6).map((t, i) => 
        '<div class="list-item" data-task-index="' + i + '"><div>' + esc(t.name || t.id || 'Task') + '</div><div class="list-item-time">' + (t.enabled ? '✓' : '⏸') + '</div></div>'
      ).join('');
      // Add click handlers for tasks
      document.querySelectorAll('#tasks-body .list-item').forEach(item => {
        item.addEventListener('click', function() {
          const idx = parseInt(this.getAttribute('data-task-index'));
          const task = tasksArr[idx];
          showDetail('Task: ' + (task.name || task.id), '<pre class="detail-pre">' + esc(JSON.stringify(task, null, 2)) + '</pre>');
        });
      });
      // Store tasks for detail view
      window._tasksList = tasksArr;
    }
  } catch (e) {
    $('status-dot').className = 'status-dot error';
    $('status-text').textContent = 'Error';
    console.error('loadStatus error:', e);
  }
}

async function loadCategories() {
  try {
    const resp = await fetch('/memory/categories');
    if (!resp.ok) return;
    const cats = await resp.json();
    if (cats && cats.length > 0) {
      $('categories-tags').innerHTML = cats.map(c => '<span class="tag" data-category="' + esc(c) + '">' + esc(c) + '</span>').join('');
      // Add click handlers for tags
      document.querySelectorAll('#categories-tags .tag').forEach(tag => {
        tag.addEventListener('click', function() {
          const cat = this.getAttribute('data-category');
          if (cat) {
            $('search-input').value = 'tag:' + cat;
            $('search-form').dispatchEvent(new Event('submit'));
          }
        });
      });
    }
  } catch (e) { console.error('loadCategories error:', e); }
}

async function loadMemoryCount() {
  try {
    const resp = await fetch('/memory/stats');
    if (resp.ok) {
      const stats = await resp.json();
      $('stat-memories').textContent = stats.totalItems || stats.count || '—';
    }
  } catch (e) { $('stat-memories').textContent = '—'; }
}

$('search-form').addEventListener('submit', async e => {
  e.preventDefault();
  const q = $('search-input').value.trim();
  const mode = $('mode-select').value;
  const source = $('source-filter').value.trim();
  if (!q) return;
  
  $('results').innerHTML = '<div class="empty"><div class="spinner" style="margin:0 auto 0.5rem"></div><div>Searching...</div></div>';
  
  try {
    let url = '/memory/search?q=' + encodeURIComponent(q) + '&mode=' + mode + '&limit=20';
    if (source) url += '&source=' + encodeURIComponent(source);
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('Search failed: ' + resp.status);
    const items = await resp.json();
    
    if (!items || items.length === 0) {
      $('results').innerHTML = '<div class="empty"><div class="empty-icon">🔍</div><div>No results found</div></div>';
      return;
    }
    
    $('results').innerHTML = items.map(function(item, i) {
      const snippet = item.snippet || (item.text ? item.text.slice(0,200) : '');
      const created = item.created_at || item.createdAt || '';
      return '<div class="result-card" data-index="' + i + '">' +
        '<div class="result-header"><span class="badge badge-memory">Memory</span><span style="color:var(--text-muted);font-size:0.7rem">' + esc(item.source || 'unknown') + '</span></div>' +
        '<div class="result-text">' + esc(snippet) + (item.text && item.text.length > 200 ? '...' : '') + '</div>' +
        '<div class="result-meta"><span>Score: ' + (item.score ? item.score.toFixed(2) : '—') + '</span><span>' + (created ? new Date(created).toLocaleDateString() : '') + '</span></div>' +
      '</div>';
    }).join('');
    
    // Store items for detail view
    window._searchResults = items;
    
    // Attach click handlers
    document.querySelectorAll('.result-card').forEach(function(el) {
      el.addEventListener('click', function() {
        const idx = parseInt(this.getAttribute('data-index'));
        const item = window._searchResults[idx];
        showDetail('Result ' + (idx + 1), '<pre class="detail-pre">' + esc(JSON.stringify(item, null, 2)) + '</pre>');
      });
    });
    
    showToast('Found ' + items.length + ' results', 'success');
  } catch (err) {
    $('results').innerHTML = '<div class="empty"><div class="empty-icon">⚠️</div><div>Error: ' + esc(err.message) + '</div></div>';
    showToast(err.message, 'error');
  }
});

document.addEventListener('keydown', function(e) {
  if (e.key === '/' && document.activeElement !== $('search-input')) {
    e.preventDefault();
    $('search-input').focus();
  }
  if (e.key === 'Escape') hideDetail();
});

loadStatus();
loadCategories();
loadMemoryCount();

// Apply saved preferences
const savedMode = localStorage.getItem('clawscope-search-mode');
if (savedMode) $('mode-select').value = savedMode;
const savedLimit = localStorage.getItem('clawscope-results-limit');
if (savedLimit) { /* limit is set in search but not persisted in UI */ }

setInterval(loadStatus, 30000);
</script></body></html>`;

// Timeline Page
const timelinePageHtml = `
<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>ClawScope — Timeline</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${styles}</style></head>
<body>
${navHtml('timeline')}
${statusBarHtml}
<main class="main">
  <div class="card" style="margin-bottom:1rem">
    <div class="card-body" style="padding:0.75rem 1rem;display:flex;gap:0.75rem;align-items:center;flex-wrap:wrap">
      <select class="select" id="days-filter"><option value="1">Today</option><option value="3">3 days</option><option value="7" selected>7 days</option><option value="30">30 days</option></select>
      <select class="select" id="kind-filter"><option value="all">All types</option><option value="tool">🔧 Tools</option><option value="session">💬 Sessions</option><option value="cron">⏰ Cron</option><option value="alert">⚠️ Alerts</option><option value="memory">🧠 Memory</option></select>
      <button class="btn btn-secondary" id="refresh-btn">🔄 Refresh</button>
      <label style="display:flex;align-items:center;gap:0.4rem;font-size:0.75rem;color:var(--text-muted)"><input type="checkbox" id="auto-refresh"> Auto (30s)</label>
      <span style="margin-left:auto;font-size:0.75rem;color:var(--text-muted)" id="status"></span>
    </div>
  </div>
  <div class="timeline" id="timeline"><div class="empty"><div class="spinner" style="margin:0 auto 0.5rem"></div><div>Loading...</div></div></div>
</main>
<div class="detail-overlay" id="detail-overlay"></div>
<div class="detail-panel" id="detail-panel">
  <div class="detail-header"><span class="detail-title" id="detail-title">Event Details</span><button class="detail-close" id="detail-close">×</button></div>
  <div class="detail-body" id="detail-body"></div>
</div>
<script>
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const formatDate = ts => { try { return new Date(ts).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'}); } catch { return '?'; } };
const formatTime = ts => { try { return new Date(ts).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'}); } catch { return '?'; } };

function hideDetail() { $('detail-overlay').classList.remove('open'); $('detail-panel').classList.remove('open'); }
$('detail-close').onclick = hideDetail; $('detail-overlay').onclick = hideDetail;

function showEventDetail(ev) {
  const kindIcon = {tool:'🔧',session:'💬',cron:'⏰',alert:'⚠️',memory:'🧠'}[ev.kind]||'📌';
  $('detail-title').textContent = kindIcon + ' ' + (ev.kind||'Event');
  $('detail-body').innerHTML = 
    '<div style="margin-bottom:0.5rem">'+esc(ev.summary||'')+'</div>'+
    '<div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:1rem">'+(ev.ts?new Date(ev.ts).toLocaleString():'')+'</div>'+
    '<details open><summary style="cursor:pointer;color:var(--text-secondary);font-size:0.8rem">Full data</summary><pre class="detail-pre">'+esc(JSON.stringify(ev,null,2))+'</pre></details>';
  $('detail-overlay').classList.add('open');
  $('detail-panel').classList.add('open');
}

function renderTimeline(events, kindFilter) {
  let filtered = kindFilter === 'all' ? events : events.filter(function(e) { return e.kind === kindFilter; });
  if (!filtered.length) { $('timeline').innerHTML = '<div class="empty"><div class="empty-icon">📅</div><div>No events to display</div></div>'; return; }
  
  var groups = {};
  filtered.forEach(function(e) { var d = formatDate(e.ts); if (!groups[d]) groups[d] = []; groups[d].push(e); });
  
  // Store events for detail view
  window._timelineEvents = events;
  
  var html = '';
  Object.keys(groups).forEach(function(day) {
    var evs = groups[day].sort(function(a,b) { return new Date(b.ts) - new Date(a.ts); });
    html += '<div class="day-group">' +
      '<div class="day-header"><span>' + day + '</span><span class="day-count">' + evs.length + ' events</span></span></div>' +
      '<div class="day-events">';
    
    evs.forEach(function(e, i) {
      var icon = {tool:'🔧',session:'💬',cron:'⏰',alert:'⚠️',memory:'🧠'}[e.kind] || '📌';
      var idx = events.indexOf(e);
      html += '<div class="event" data-idx="' + idx + '">' +
        '<span class="event-time">' + formatTime(e.ts) + '</span>' +
        '<span class="badge badge-' + (e.kind || 'memory') + '">' + icon + ' ' + e.kind + '</span>' +
        '<span class="event-summary">' + esc(e.summary || '') + '</span>' +
      '</div>';
    });
    
    html += '</div></div>';
  });
  
  $('timeline').innerHTML = html;
  
  document.querySelectorAll('.event').forEach(function(el) {
    el.addEventListener('click', function() {
      var idx = parseInt(this.getAttribute('data-idx'));
      showEventDetail(window._timelineEvents[idx]);
    });
  });
  document.querySelectorAll('.day-header').forEach(function(h) {
    h.addEventListener('click', function() {
      this.nextElementSibling.classList.toggle('collapsed');
    });
  });
}

async function loadTimeline(force = false) {
  const days = parseInt($('days-filter').value) || 7;
  const since = new Date(Date.now() - days * 24*60*60*1000).toISOString();
  $('status').textContent = 'Loading...';
  
  try {
    const resp = await fetch('/timeline-data?since='+encodeURIComponent(since)+'&limit=100');
    if (!resp.ok) throw new Error('HTTP '+resp.status);
    const events = await resp.json();
    renderTimeline(events, $('kind-filter').value);
    $('status').textContent = events.length + ' events';
  } catch (err) {
    $('timeline').innerHTML = '<div class="empty"><div class="empty-icon">⚠️</div><div>Error: '+esc(err.message)+'</div></div>';
    $('status').textContent = 'Error';
  }
}

$('refresh-btn').onclick = () => loadTimeline(true);
$('days-filter').onchange = () => loadTimeline();
$('kind-filter').onchange = () => loadTimeline();

let autoTimer = null;
$('auto-refresh').onchange = function() {
  if (this.checked) { autoTimer = setInterval(() => loadTimeline(true), 30000); }
  else { clearInterval(autoTimer); autoTimer = null; }
};

loadTimeline();

// Load status bar stats
async function loadStatusBarStats() {
  try {
    const [sessions, tasks, stats] = await Promise.all([
      fetch('/sessions').then(r => r.ok ? r.json() : []).catch(() => []),
      fetch('/tasks').then(r => r.ok ? r.json() : []).catch(() => []),
      fetch('/memory/stats').then(r => r.ok ? r.json() : {}).catch(() => ({}))
    ]);
    var sessionsArr = Array.isArray(sessions) ? sessions : (sessions.sessions || []);
    var tasksArr = Array.isArray(tasks) ? tasks : [];
    $('stat-sessions').textContent = sessionsArr.length;
    $('stat-tasks').textContent = tasksArr.length;
    $('stat-memories').textContent = stats.totalItems || '—';
    $('status-dot').className = 'status-dot';
    $('status-text').textContent = 'All systems operational';
  } catch (e) {
    $('status-dot').className = 'status-dot error';
    $('status-text').textContent = 'Error';
  }
}
loadStatusBarStats();
</script></body></html>`;

// Graph Page
const graphPageHtml = `
<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>ClawScope — Knowledge Graph</title>
<script src="https://d3js.org/d3.v7.min.js"></script>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${styles}
.node { cursor: pointer; }
.node circle { stroke: var(--accent); stroke-width: 2px; fill: var(--accent); transition: all 0.2s; opacity: 0.85; }
.node circle:hover { stroke: var(--accent-blue); stroke-width: 3px; fill: var(--accent-blue); opacity: 1; }
.node text { font-size: 11px; fill: var(--text-primary); pointer-events: none; text-shadow: 0 1px 2px rgba(0,0,0,0.8); }
.link { stroke: var(--border-light); stroke-opacity: 0.6; }
</style></head>
<body>
${navHtml('graph')}
<main class="main">
  <div class="card" style="margin-bottom:1rem">
    <div class="card-body graph-controls">
      <input type="text" class="input" id="entity-filter" placeholder="Filter by entity..." style="width:200px">
      <select class="select" id="confidence-filter">
        <option value="0">All confidence</option>
        <option value="0.5">High (0.5+)</option>
        <option value="0.7">Very high (0.7+)</option>
      </select>
      <button class="btn btn-secondary" id="refresh-btn">🔄 Refresh</button>
      <button class="btn btn-secondary" id="reset-btn">Reset</button>
      <div style="margin-left:auto;display:flex;gap:1rem;font-size:0.75rem;color:var(--text-muted)" id="stats"></div>
    </div>
  </div>
  <div class="graph-container" id="graph"></div>
</main>
<div class="detail-overlay" id="detail-overlay"></div>
<div class="detail-panel" id="detail-panel">
  <div class="detail-header"><span class="detail-title" id="detail-title">Entity</span><button class="detail-close" id="detail-close">×</button></div>
  <div class="detail-body" id="detail-body"></div>
</div>
<script>
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
let sim, svg, g, link, node, data = null;

function hideDetail() { $('detail-overlay').classList.remove('open'); $('detail-panel').classList.remove('open'); }
$('detail-close').onclick = hideDetail; $('detail-overlay').onclick = hideDetail;

function showNodeDetails(d) {
  const edges = data.edges.filter(e => e.source.id === d.id || e.target.id === d.id);
  $('detail-title').textContent = d.label;
  $('detail-body').innerHTML = edges.length ? 
    '<ul style="list-style:none;padding:0">'+edges.map(e => {
      const other = e.source.id === d.id ? e.target.label : e.source.label;
      return '<li style="padding:0.4rem 0;border-bottom:1px solid var(--border)">'+esc(e.label)+' → '+esc(other)+' <span style="color:var(--text-muted)">'+(e.confidence*100).toFixed(0)+'%</span></li>';
    }).join('')+'</ul>' :
    '<div style="color:var(--text-muted)">No connections</div>';
  $('detail-overlay').classList.add('open');
  $('detail-panel').classList.add('open');
}

function initGraph(graphData) {
  data = graphData;
  $('graph').innerHTML = '';
  
  data.edges = data.edges.map(e => ({ source: e.from, target: e.to, label: e.label, confidence: e.confidence }));
  
  const width = $('graph').clientWidth;
  const height = $('graph').clientHeight;
  
  svg = d3.select('#graph').append('svg').attr('width', width).attr('height', height);
  g = svg.append('g');
  
  const zoom = d3.zoom().scaleExtent([0.1, 4]).on('zoom', e => g.attr('transform', e.transform));
  svg.call(zoom);
  
  link = g.append('g').selectAll('line').data(data.edges).join('line').attr('class', 'link').attr('stroke-width', d => Math.max(1, d.confidence * 3));
  
  node = g.append('g').selectAll('g').data(data.nodes).join('g').attr('class', 'node')
    .call(d3.drag().on('start', dragStart).on('drag', dragged).on('end', dragEnd));
  
  node.append('circle').attr('r', d => {
    const conns = data.edges.filter(e => (e.source.id||e.source) === d.id || (e.target.id||e.target) === d.id).length;
    return Math.max(8, Math.min(25, 8 + conns * 2));
  });
  
  node.append('text').attr('dy', 4).attr('dx', 20).text(d => d.label.length > 15 ? d.label.slice(0,15)+'…' : d.label);
  node.on('click', (e, d) => showNodeDetails(d));
  
  sim = d3.forceSimulation(data.nodes)
    .force('link', d3.forceLink(data.edges).id(d => d.id).distance(100))
    .force('charge', d3.forceManyBody().strength(-200))
    .force('center', d3.forceCenter(width/2, height/2))
    .force('collision', d3.forceCollide().radius(30));
  
  sim.on('tick', () => {
    link.attr('x1', d => d.source.x).attr('y1', d => d.source.y).attr('x2', d => d.target.x).attr('y2', d => d.target.y);
    node.attr('transform', d => 'translate('+d.x+','+d.y+')');
  });
  
  $('stats').innerHTML = '<span><b>'+(data.stats?.totalEntities||data.nodes.length)+'</b> entities</span><span><b>'+(data.stats?.totalFacts||data.edges.length)+'</b> facts</span>';
}

function dragStart(e, d) { if (!e.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; }
function dragged(e, d) { d.fx = e.x; d.fy = e.y; }
function dragEnd(e, d) { if (!e.active) sim.alphaTarget(0); d.fx = null; d.fy = null; }

async function loadGraph() {
  const entity = $('entity-filter').value.trim();
  const minConf = $('confidence-filter').value;
  let url = '/graph-data?limit=200&minConfidence='+minConf;
  if (entity) url += '&entity='+encodeURIComponent(entity);
  
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('Failed to load graph');
    const graphData = await resp.json();
    if (graphData.nodes?.length > 0) initGraph(graphData);
    else $('graph').innerHTML = '<div class="empty"><div class="empty-icon">🕸️</div><div>No graph data found</div></div>';
  } catch (err) {
    $('graph').innerHTML = '<div class="empty"><div class="empty-icon">⚠️</div><div>Error: '+esc(err.message)+'</div></div>';
  }
}

$('refresh-btn').onclick = loadGraph;
$('reset-btn').onclick = () => { $('entity-filter').value = ''; $('confidence-filter').value = '0'; loadGraph(); };
$('entity-filter').onkeypress = e => { if (e.key === 'Enter') loadGraph(); };

loadGraph();
window.onresize = () => { if (data) { sim.force('center', d3.forceCenter($('graph').clientWidth/2, $('graph').clientHeight/2)); sim.alpha(0.3).restart(); } };

// Load status bar stats
async function loadStatusBarStats() {
  try {
    const [sessions, tasks, stats] = await Promise.all([
      fetch('/sessions').then(r => r.ok ? r.json() : []).catch(() => []),
      fetch('/tasks').then(r => r.ok ? r.json() : []).catch(() => []),
      fetch('/memory/stats').then(r => r.ok ? r.json() : {}).catch(() => ({}))
    ]);
    var sessionsArr = Array.isArray(sessions) ? sessions : (sessions.sessions || []);
    var tasksArr = Array.isArray(tasks) ? tasks : [];
    $('stat-sessions').textContent = sessionsArr.length;
    $('stat-tasks').textContent = tasksArr.length;
    $('stat-memories').textContent = stats.totalItems || '—';
    $('status-dot').className = 'status-dot';
    $('status-text').textContent = 'All systems operational';
  } catch (e) {
    $('status-dot').className = 'status-dot error';
    $('status-text').textContent = 'Error';
  }
}
loadStatusBarStats();
</script></body></html>`;

// DB Page
const dbPageHtml = `
<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>ClawScope — Database</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${styles}</style></head>
<body>
${navHtml('db')}
${statusBarHtml}
<main class="main">
  <div class="card">
    <div class="card-header"><span class="card-title">📊 Memory Items</span><span class="card-badge" id="items-count">0</span></div>
    <div class="card-body" style="max-height:none;overflow-x:auto">
      <table class="db-table" id="items-table">
        <thead><tr><th>ID</th><th>Source</th><th>Text</th><th>Tags</th><th>Created</th></tr></thead>
        <tbody id="items-body"><tr><td colspan="5" style="text-align:center">Loading...</td></tr></tbody>
      </table>
    </div>
  </div>
  <div class="card">
    <div class="card-header"><span class="card-title">📈 Statistics</span></div>
    <div class="card-body" id="stats-body">Loading...</div>
  </div>
</main>
<div class="detail-overlay" id="detail-overlay"></div>
<div class="detail-panel" id="detail-panel">
  <div class="detail-header"><span class="detail-title" id="detail-title">Details</span><button class="detail-close" id="detail-close">×</button></div>
  <div class="detail-body" id="detail-body"></div>
</div>
<script>
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

function hideDetail() { $('detail-overlay').classList.remove('open'); $('detail-panel').classList.remove('open'); }
$('detail-close').onclick = hideDetail; $('detail-overlay').onclick = hideDetail;

let _dbItems = [];

async function loadItems() {
  try {
    const resp = await fetch('/memory/items?limit=50');
    if (!resp.ok) throw new Error('Failed');
    const items = await resp.json();
    _dbItems = items;
    $('items-count').textContent = items.length;
    $('items-body').innerHTML = items.map((item, idx) => 
      '<tr data-idx="' + idx + '" style="cursor:pointer">'+
        '<td style="font-family:monospace;font-size:0.7rem">'+esc(item.id?.slice(0,8)||'—')+'</td>'+
        '<td>'+esc(item.source||'—')+'</td>'+
        '<td>'+esc((item.text||'').slice(0,80))+(item.text?.length>80?'...':'')+'</td>'+
        '<td>'+(item.tags||'').split(',').filter(Boolean).map(t=>'<span class="tag">'+esc(t.trim())+'</span>').join(' ')||'—'+'</td>'+
        '<td style="font-size:0.75rem;color:var(--text-muted)">'+(item.created_at?new Date(item.created_at).toLocaleString():'—')+'</td>'+
      '</tr>'
    ).join('');
    // Add click handlers
    document.querySelectorAll('#items-body tr[data-idx]').forEach(row => {
      row.addEventListener('click', function() {
        const idx = parseInt(this.getAttribute('data-idx'));
        const item = _dbItems[idx];
        $('detail-title').textContent = 'Memory Item';
        $('detail-body').innerHTML = '<pre class="detail-pre">' + esc(JSON.stringify(item, null, 2)) + '</pre>';
        $('detail-overlay').classList.add('open');
        $('detail-panel').classList.add('open');
      });
    });
  } catch (err) {
    $('items-body').innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--accent-red)">Error: '+esc(err.message)+'</td></tr>';
  }
}

async function loadStats() {
  try {
    const resp = await fetch('/memory/stats');
    if (!resp.ok) throw new Error('Failed');
    const stats = await resp.json();
    $('stats-body').innerHTML = 
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:1rem">'+
        '<div><div style="font-size:1.5rem;font-weight:700;color:var(--accent)">'+(stats.totalItems||0)+'</div><div style="font-size:0.8rem;color:var(--text-muted)">Total items</div></div>'+
        '<div><div style="font-size:1.5rem;font-weight:700;color:var(--accent-blue)">'+(stats.totalFacts||0)+'</div><div style="font-size:0.8rem;color:var(--text-muted)">Facts</div></div>'+
        '<div><div style="font-size:1.5rem;font-weight:700;color:var(--accent-purple)">'+(stats.totalEntities||0)+'</div><div style="font-size:0.8rem;color:var(--text-muted)">Entities</div></div>'+
      '</div>';
  } catch { $('stats-body').innerHTML = '<div style="color:var(--text-muted)">No stats available</div>'; }
}

loadItems();
loadStats();

// Load status bar stats
async function loadStatusBarStats() {
  try {
    const [sessions, tasks, memStats] = await Promise.all([
      fetch('/sessions').then(r => r.ok ? r.json() : []).catch(() => []),
      fetch('/tasks').then(r => r.ok ? r.json() : []).catch(() => []),
      fetch('/memory/stats').then(r => r.ok ? r.json() : {}).catch(() => ({}))
    ]);
    var sessionsArr = Array.isArray(sessions) ? sessions : (sessions.sessions || []);
    var tasksArr = Array.isArray(tasks) ? tasks : [];
    $('stat-sessions').textContent = sessionsArr.length;
    $('stat-tasks').textContent = tasksArr.length;
    $('stat-memories').textContent = memStats.totalItems || '—';
    $('status-dot').className = 'status-dot';
    $('status-text').textContent = 'All systems operational';
  } catch (e) {
    $('status-dot').className = 'status-dot error';
    $('status-text').textContent = 'Error';
  }
}
loadStatusBarStats();
</script></body></html>`;

// Settings Page
const settingsPageHtml = `
<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>ClawScope — Settings</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${styles}</style></head>
<body>
${navHtml('settings')}
${statusBarHtml}
<main class="main">
  <div class="card">
    <div class="card-header"><span class="card-title">🔮 About ClawScope</span></div>
    <div class="card-body">
      <p style="margin-bottom:1rem">ClawScope is a dashboard for OpenClaw offline memory and knowledge graph.</p>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:1rem">
        <div style="background:var(--bg-secondary);padding:1rem;border-radius:var(--radius-md)">
          <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.25rem">Memory Backend</div>
          <div style="font-weight:600">SQLite + FTS5</div>
        </div>
        <div style="background:var(--bg-secondary);padding:1rem;border-radius:var(--radius-md)">
          <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.25rem">Embeddings</div>
          <div style="font-weight:600">Ollama (bge-m3)</div>
        </div>
        <div style="background:var(--bg-secondary);padding:1rem;border-radius:var(--radius-md)">
          <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.25rem">Search</div>
          <div style="font-weight:600" id="search-mode-display">Hybrid (lexical + semantic)</div>
        </div>
      </div>
    </div>
  </div>
  <div class="card">
    <div class="card-header"><span class="card-title">⚙️ Search Preferences</span></div>
    <div class="card-body">
      <div class="settings-section">
        <label class="settings-label">Default Search Mode</label>
        <div class="settings-row">
          <select class="select" id="search-mode-select" style="width:auto;min-width:150px">
            <option value="hybrid">Hybrid (recommended)</option>
            <option value="lexical">Lexical (keyword)</option>
            <option value="semantic">Semantic (AI)</option>
          </select>
          <button class="btn btn-secondary" id="save-search-mode">Save</button>
        </div>
        <p style="font-size:0.75rem;color:var(--text-muted);margin-top:0.5rem">
          Hybrid combines keyword search with AI-powered semantic matching for best results.
        </p>
      </div>
      <div class="settings-section">
        <label class="settings-label">Results Limit</label>
        <div class="settings-row">
          <select class="select" id="results-limit-select" style="width:auto;min-width:150px">
            <option value="10">10 results</option>
            <option value="20" selected>20 results</option>
            <option value="50">50 results</option>
            <option value="100">100 results</option>
          </select>
          <button class="btn btn-secondary" id="save-results-limit">Save</button>
        </div>
      </div>
      <div id="settings-result" style="margin-top:1rem;font-size:0.85rem"></div>
    </div>
  </div>
  <div class="card">
    <div class="card-header"><span class="card-title">📊 Database Info</span></div>
    <div class="card-body" id="db-info">Loading...</div>
  </div>
  <div class="card">
    <div class="card-header"><span class="card-title">⚡ Actions</span></div>
    <div class="card-body">
      <div style="display:flex;gap:0.75rem;flex-wrap:wrap">
        <button class="btn btn-primary" id="extract-facts-btn">🧠 Extract Facts from Memory</button>
        <button class="btn btn-secondary" id="clear-cache-btn">🗑️ Clear Browser Cache</button>
      </div>
      <div id="action-result" style="margin-top:1rem;font-size:0.85rem"></div>
    </div>
  </div>
  <div class="card">
    <div class="card-header"><span class="card-title">🔗 Links</span></div>
    <div class="card-body">
      <div style="display:flex;flex-direction:column;gap:0.5rem">
        <a href="https://github.com/AkashaBot/openclaw-memory-offline-sqlite" target="_blank" style="color:var(--accent)">📦 openclaw-memory-offline-sqlite</a>
        <a href="https://github.com/AkashaBot/openclaw-memory-offline-sqlite-plugin" target="_blank" style="color:var(--accent)">🔌 openclaw-memory-offline-sqlite-plugin</a>
        <a href="https://docs.openclaw.ai" target="_blank" style="color:var(--accent)">📚 OpenClaw Docs</a>
      </div>
    </div>
  </div>
</main>
<script>
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

// Load saved preferences
const savedMode = localStorage.getItem('clawscope-search-mode') || 'hybrid';
const savedLimit = localStorage.getItem('clawscope-results-limit') || '20';
$('search-mode-select').value = savedMode;
$('results-limit-select').value = savedLimit;
$('search-mode-display').textContent = {hybrid:'Hybrid (lexical + semantic)',lexical:'Lexical (keyword)',semantic:'Semantic (AI)'}[savedMode] || 'Hybrid';

$('save-search-mode').addEventListener('click', function() {
  const mode = $('search-mode-select').value;
  localStorage.setItem('clawscope-search-mode', mode);
  $('search-mode-display').textContent = {hybrid:'Hybrid (lexical + semantic)',lexical:'Lexical (keyword)',semantic:'Semantic (AI)'}[mode];
  $('settings-result').innerHTML = '<span style="color:var(--accent)">✓ Search mode saved: ' + mode + '</span>';
});

$('save-results-limit').addEventListener('click', function() {
  const limit = $('results-limit-select').value;
  localStorage.setItem('clawscope-results-limit', limit);
  $('settings-result').innerHTML = '<span style="color:var(--accent)">✓ Results limit saved: ' + limit + '</span>';
});

async function loadStats() {
  try {
    const [sessions, tasks, stats] = await Promise.all([
      fetch('/sessions').then(r => r.ok ? r.json() : []).catch(() => []),
      fetch('/tasks').then(r => r.ok ? r.json() : []).catch(() => []),
      fetch('/memory/stats').then(r => r.ok ? r.json() : {}).catch(() => ({}))
    ]);
    
    const sessionsArr = Array.isArray(sessions) ? sessions : (sessions.sessions || []);
    const tasksArr = Array.isArray(tasks) ? tasks : [];
    
    $('stat-sessions').textContent = sessionsArr.length;
    $('stat-tasks').textContent = tasksArr.length;
    $('stat-memories').textContent = stats.totalItems || '—';
    $('status-dot').className = 'status-dot';
    $('status-text').textContent = 'All systems operational';
    
    $('db-info').innerHTML = 
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:1rem">'+
        '<div><div style="font-size:1.5rem;font-weight:700;color:var(--accent)">'+(stats.totalItems||0)+'</div><div style="font-size:0.8rem;color:var(--text-muted)">Memory Items</div></div>'+
        '<div><div style="font-size:1.5rem;font-weight:700;color:var(--accent-blue)">'+(stats.totalFacts||0)+'</div><div style="font-size:0.8rem;color:var(--text-muted)">Facts Extracted</div></div>'+
        '<div><div style="font-size:1.5rem;font-weight:700;color:var(--accent-purple)">'+(stats.totalEntities||0)+'</div><div style="font-size:0.8rem;color:var(--text-muted)">Entities</div></div>'+
        '<div><div style="font-size:1.5rem;font-weight:700;color:var(--accent-orange)">'+(stats.totalPredicates||0)+'</div><div style="font-size:0.8rem;color:var(--text-muted)">Predicates</div></div>'+
      '</div>';
  } catch (e) {
    $('status-dot').className = 'status-dot error';
    $('status-text').textContent = 'Error';
    $('db-info').innerHTML = '<div style="color:var(--text-muted)">Unable to load database info</div>';
  }
}

$('extract-facts-btn').addEventListener('click', async function() {
  this.disabled = true;
  this.textContent = '⏳ Extracting...';
  $('action-result').innerHTML = '<span style="color:var(--text-muted)">Processing...</span>';
  
  try {
    const resp = await fetch('/extract-facts');
    const data = await resp.json();
    if (data.success) {
      $('action-result').innerHTML = '<span style="color:var(--accent)">✓ Extracted ' + data.count + ' facts</span>';
    } else {
      throw new Error(data.error || 'Unknown error');
    }
  } catch (err) {
    $('action-result').innerHTML = '<span style="color:var(--accent-red)">Error: ' + esc(err.message) + '</span>';
  }
  
  this.disabled = false;
  this.textContent = '🧠 Extract Facts from Memory';
  loadStats();
});

$('clear-cache-btn').addEventListener('click', function() {
  localStorage.clear();
  $('action-result').innerHTML = '<span style="color:var(--accent)">✓ Browser cache cleared</span>';
});

loadStats();
</script></body></html>`;

// =============================================================================
// SERVER
// =============================================================================
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3101;

// Helper to read JSON files
function readJsonFile(filePath: string): any {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
  } catch {}
  return null;
}

// Get memory DB path
function getDbPath(): string {
  return path.join(os.homedir(), '.openclaw', 'memory', 'offline.sqlite');
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://localhost');
  
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }
  
  // Pages
  if (url.pathname === '/' || url.pathname === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(searchPageHtml);
    return;
  }
  
  if (url.pathname === '/timeline') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(timelinePageHtml);
    return;
  }
  
  if (url.pathname === '/graph') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(graphPageHtml);
    return;
  }
  
  if (url.pathname === '/db') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(dbPageHtml);
    return;
  }
  
  if (url.pathname === '/settings') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(settingsPageHtml);
    return;
  }
  
  // API: Memory Search
  if (url.pathname === '/memory/search') {
    const q = url.searchParams.get('q') || '';
    const mode = (url.searchParams.get('mode') || 'hybrid') as SearchMode;
    const limit = parseInt(url.searchParams.get('limit') || '20');
    const source = url.searchParams.get('source') || undefined;
    
    try {
      const results = await backend.search({ query: q, mode, limit, sources: source ? [source] : undefined });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(results));
    } catch (err: any) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }
  
  // API: Memory Categories
  if (url.pathname === '/memory/categories') {
    try {
      const { getMemoryCategories } = await import('./offline-sqlite-backend.js');
      const cats = await getMemoryCategories();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(cats.map(c => c.tag)));
    } catch {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(['personal', 'work', 'project', 'reminder', 'preference']));
    }
    return;
  }
  
  // API: Memory Stats
  if (url.pathname === '/memory/stats') {
    try {
      const db = openDb(getDbPath());
      runMigrations(db);
      initSchema(db);
      const stats = getGraphStats(db);
      // Also count items directly
      const itemCount = db.prepare('SELECT COUNT(*) as count FROM items').get() as { count: number };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        totalItems: itemCount?.count || 0,
        totalFacts: stats.totalFacts || 0,
        totalEntities: stats.totalEntities || 0,
        totalPredicates: stats.totalPredicates || 0
      }));
    } catch (err: any) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ totalItems: 0, totalFacts: 0, totalEntities: 0, totalPredicates: 0, error: err.message }));
    }
    return;
  }
  
  // API: Memory Items (for DB page)
  if (url.pathname === '/memory/items') {
    try {
      const db = openDb(getDbPath());
      runMigrations(db);
      initSchema(db);
      const limit = parseInt(url.searchParams.get('limit') || '50');
      const items = db.prepare('SELECT id, source, text, tags, created_at FROM items ORDER BY created_at DESC LIMIT ?').all(limit);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(items));
    } catch {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('[]');
    }
    return;
  }
  
  // API: Sessions
  if (url.pathname === '/sessions') {
    const data = readJsonFile(path.join(os.homedir(), '.openclaw', 'agents', 'main', 'sessions', 'sessions.json'));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data || []));
    return;
  }
  
  // API: Tasks
  if (url.pathname === '/tasks') {
    const data = readJsonFile(path.join(os.homedir(), '.openclaw', 'cron', 'jobs.json'));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data?.jobs || []));
    return;
  }
  
  // API: Activity
  if (url.pathname === '/activity') {
    try {
      const activity = await activityBackend.listActivity({ limit: 20 });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(activity));
    } catch {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('[]');
    }
    return;
  }
  
  // API: Timeline Data
  if (url.pathname === '/timeline-data') {
    try {
      const since = url.searchParams.get('since') || new Date(Date.now() - 7*24*60*60*1000).toISOString();
      const limit = parseInt(url.searchParams.get('limit') || '100');
      
      // Combine sessions, tasks, and activity
      const sessions = readJsonFile(path.join(os.homedir(), '.openclaw', 'agents', 'main', 'sessions', 'sessions.json')) || [];
      const tasks = readJsonFile(path.join(os.homedir(), '.openclaw', 'cron', 'jobs.json'))?.jobs || [];
      
      const events: any[] = [];
      
      // Add session events
      (Array.isArray(sessions) ? sessions : (sessions.sessions || [])).forEach((s: any) => {
        events.push({
          id: s.sessionId || s.key || Math.random().toString(),
          ts: s.updatedAt ? new Date(s.updatedAt).toISOString() : new Date().toISOString(),
          kind: 'session',
          summary: s.displayName || s.key || 'Session activity',
          details: s
        });
      });
      
      // Add cron events
      tasks.forEach((t: any) => {
        if (t.state?.lastRunAtMs) {
          events.push({
            id: t.id,
            ts: new Date(t.state.lastRunAtMs).toISOString(),
            kind: 'cron',
            summary: t.name || 'Scheduled task',
            details: t
          });
        }
      });
      
      // Add activity events (tools, alerts, etc.)
      try {
        const activity = await activityBackend.listActivity({ since, limit: 100 });
        activity.forEach((a: any) => {
          // Map activity kinds to timeline kinds
          let kind = a.kind;
          if (kind === 'session_start' || kind === 'session_end') kind = 'session';
          if (kind === 'tool') kind = 'tool';
          if (kind === 'system') kind = 'alert';
          events.push({
            id: a.id,
            ts: a.ts,
            kind: kind,
            summary: a.summary,
            details: a
          });
        });
      } catch {}
      
      // Filter and sort
      const filtered = events.filter(e => e.ts >= since).sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime()).slice(0, limit);
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(filtered));
    } catch {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('[]');
    }
    return;
  }
  
  // API: Graph Data
  if (url.pathname === '/graph-data') {
    try {
      const limit = parseInt(url.searchParams.get('limit') || '5000');
      const minConf = parseFloat(url.searchParams.get('minConfidence') || '0');
      const entity = url.searchParams.get('entity') || undefined;
      
      const db = openDb(getDbPath());
      runMigrations(db);
      initSchema(db);
      
      let graphData: { nodes: any[]; edges: any[] } = { nodes: [], edges: [] };
      
      if (entity) {
        const entityGraph = getEntityGraph(db, entity);
        // getEntityGraph returns edges, need to extract nodes
        const nodeMap = new Map<string, { id: string; label: string }>();
        for (const edge of entityGraph) {
          if (!nodeMap.has(edge.subject)) nodeMap.set(edge.subject, { id: edge.subject, label: edge.subject });
          if (!nodeMap.has(edge.object)) nodeMap.set(edge.object, { id: edge.object, label: edge.object });
          graphData.edges.push({ from: edge.subject, to: edge.object, label: edge.predicate, confidence: edge.confidence });
        }
        graphData.nodes = Array.from(nodeMap.values());
      } else {
        // Build graph from all facts - pass limit to getAllFacts
        const facts = getAllFacts(db, undefined, limit);
        const nodeMap = new Map<string, { id: string; label: string }>();
        
        for (const fact of facts) {
          if (fact.confidence < minConf) continue;
          
          if (!nodeMap.has(fact.subject)) nodeMap.set(fact.subject, { id: fact.subject, label: fact.subject });
          if (!nodeMap.has(fact.object)) nodeMap.set(fact.object, { id: fact.object, label: fact.object });
          
          graphData.edges.push({
            from: fact.subject,
            to: fact.object,
            label: fact.predicate,
            confidence: fact.confidence
          });
        }
        
        graphData.nodes = Array.from(nodeMap.values());
      }
      
      const stats = getGraphStats(db);
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ...graphData, stats }));
    } catch (err: any) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ nodes: [], edges: [], stats: {}, error: err.message }));
    }
    return;
  }
  
  // API: Extract Facts
  if (url.pathname === '/extract-facts') {
    try {
      const db = openDb(getDbPath());
      runMigrations(db);
      initSchema(db);
      
      const facts = await extractFactsSimple(getDbPath());
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, count: facts.length }));
    } catch (err: any) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }
  
  // 404
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log('ClawScope UI listening on http://0.0.0.0:' + PORT);
});
