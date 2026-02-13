// src/frontend.ts
// Very simple HTTP server for a minimal Mission Control UI.

import http from 'http';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { exec as cpExec } from 'child_process';
function promisifyExec(fn: any) {
  return (...args: any[]) =>
    new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
      fn(...args, (err: any, stdout: string, stderr: string) => {
        if (err) {
          reject(err);
        } else {
          resolve({ stdout, stderr });
        }
      });
    });
}
import { OfflineSqliteSearchBackend } from './offline-sqlite-backend.js';
import type { SearchBackend, SearchMode } from './search.js';
import { InMemoryActivityBackend } from './activity-backend.js';
import { InMemoryTaskBackend } from './tasks-backend.js';
import { getGraphStats, getEntityGraph, getAllFacts, exportGraphJson } from '@akashabot/openclaw-memory-offline-core';
import Database from 'better-sqlite3';

const exec = promisifyExec(cpExec);

const backend: SearchBackend = new OfflineSqliteSearchBackend();
const activityBackend = new InMemoryActivityBackend();
const taskBackend = new InMemoryTaskBackend();

// Simple in-memory cache for sessions
let lastSessionsJson: any = null;
let lastSessionsAt = 0;
const SESSIONS_TTL_MS = 15 * 60 * 1000; // 15 minutes

// Shared styles for all pages (P0 + P1 + P2 improvements)
const sharedStyles = `
  body { font-family: system-ui, -apple-system, BlinkMacSystemFont, sans-serif; margin: 0; padding: 0; background: #0b1120; color: #e5e7eb; }
  header { padding: 0.75rem 1.5rem; border-bottom: 1px solid #1f2937; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem; }
  header h1 { font-size: 1.1rem; margin: 0; display: flex; align-items: center; gap: 0.5rem; }
  nav { display: flex; gap: 0.5rem; align-items: center; }
  nav a { color: #9ca3af; text-decoration: none; font-size: 0.85rem; padding: 0.25rem 0.5rem; border-radius: 0.25rem; }
  nav a:hover { background: rgba(255,255,255,0.05); color: #e5e7eb; }
  nav a.active { background: #111827; color: #e5e7eb; }
  .health-bar { display: flex; align-items: center; gap: 0.5rem; font-size: 0.75rem; padding: 0.5rem 1rem; background: #020617; border-bottom: 1px solid #1f2937; }
  .health-dot { width: 8px; height: 8px; border-radius: 50%; }
  .health-dot.ok { background: #22c55e; box-shadow: 0 0 8px rgba(34,197,94,0.5); }
  .health-dot.warn { background: #f59e0b; box-shadow: 0 0 8px rgba(245,158,11,0.5); }
  .health-dot.error { background: #ef4444; box-shadow: 0 0 8px rgba(239,68,68,0.5); }
  .stats-row { display: flex; gap: 1.5rem; font-size: 0.75rem; color: #9ca3af; }
  .stat { display: flex; align-items: center; gap: 0.25rem; }
  .stat-value { color: #e5e7eb; font-weight: 600; }
  main { padding: 1rem 1.5rem; }
  .spinner { display: inline-block; width: 16px; height: 16px; border: 2px solid #374151; border-top-color: #22c55e; border-radius: 50%; animation: spin 0.8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .empty { color: #6b7280; font-size: 0.9rem; padding: 1rem; text-align: center; }
  .loading { display: flex; align-items: center; justify-content: center; gap: 0.5rem; color: #6b7280; font-size: 0.85rem; padding: 2rem; }
  /* P1: Collapsible sidebar */
  .sidebar-toggle { background: #111827; border: 1px solid #374151; color: #9ca3af; padding: 0.25rem 0.5rem; border-radius: 0.25rem; cursor: pointer; font-size: 0.75rem; }
  .sidebar-toggle:hover { background: #1f2937; color: #e5e7eb; }
  .sidebar { transition: opacity 0.2s, max-width 0.2s; overflow: hidden; }
  .sidebar.collapsed { max-width: 0; opacity: 0; padding: 0; margin: 0; }
  /* P1: Detail panel */
  .detail-panel { position: fixed; right: 0; top: 0; width: 400px; max-width: 100%; height: 100%; background: #020617; border-left: 1px solid #1f2937; padding: 1rem; transform: translateX(100%); transition: transform 0.2s; z-index: 100; overflow-y: auto; }
  .detail-panel.open { transform: translateX(0); }
  .detail-panel h3 { margin: 0 0 0.5rem; font-size: 1rem; display: flex; justify-content: space-between; align-items: center; }
  .detail-panel pre { font-size: 0.7rem; white-space: pre-wrap; background: #111827; padding: 0.5rem; border-radius: 0.375rem; margin: 0.5rem 0; }
  .detail-close { background: none; border: none; color: #9ca3af; cursor: pointer; font-size: 1.2rem; padding: 0; }
  .detail-close:hover { color: #e5e7eb; }
  /* P1: Auto-refresh toggle */
  .auto-refresh { display: flex; align-items: center; gap: 0.5rem; font-size: 0.75rem; color: #9ca3af; }
  .auto-refresh input { accent-color: #22c55e; width: 14px; height: 14px; }
  /* P2: Toast notifications */
  .toast-container { position: fixed; bottom: 1rem; right: 1rem; display: flex; flex-direction: column; gap: 0.5rem; z-index: 200; }
  .toast { padding: 0.75rem 1rem; border-radius: 0.5rem; font-size: 0.8rem; animation: slideIn 0.3s; max-width: 300px; }
  .toast.success { background: #065f46; border: 1px solid #22c55e; color: #bbf7d0; }
  .toast.error { background: #7f1d1d; border: 1px solid #ef4444; color: #fecaca; }
  .toast.info { background: #1e3a5f; border: 1px solid #3b82f6; color: #bfdbfe; }
  @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
  /* P2: Keyboard hints */
  .kbd { display: inline-block; padding: 0.1rem 0.3rem; font-size: 0.65rem; font-family: ui-monospace, monospace; background: #1f2937; border: 1px solid #374151; border-radius: 0.25rem; color: #9ca3af; }
`;

// Timeline page HTML template (P0 + P1 improvements)
const timelineHtml = String.raw`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>OpenClaw ClawScope – Timeline</title>
  <style>${sharedStyles}
    .controls { display: flex; gap: 0.5rem; margin-bottom: 1rem; flex-wrap: wrap; align-items: center; }
    .controls select, .controls button { padding: 0.4rem 0.6rem; border-radius: 0.375rem; border: 1px solid #374151; background: #111827; color: #e5e7eb; cursor: pointer; font-size: 0.8rem; }
    .controls button:hover { background: #1f2937; }
    .status { font-size: 0.75rem; color: #6b7280; margin-left: auto; }
    .status.ok { color: #22c55e; }
    .status.error { color: #ef4444; }
    .timeline { display: flex; flex-direction: column; gap: 0.5rem; }
    .day-group { border: 1px solid #1f2937; border-radius: 0.5rem; overflow: hidden; }
    .day-header { background: #111827; padding: 0.5rem 0.75rem; font-size: 0.85rem; font-weight: 600; display: flex; justify-content: space-between; cursor: pointer; }
    .day-header:hover { background: #1f2937; }
    .day-header .count { font-size: 0.7rem; color: #6b7280; font-weight: normal; }
    .day-events { padding: 0.5rem 0.75rem; display: flex; flex-direction: column; gap: 0.4rem; max-height: 500px; overflow-y: auto; }
    .day-events.collapsed { display: none; }
    .event { display: grid; grid-template-columns: 70px auto 1fr; gap: 0.75rem; align-items: start; padding: 0.5rem; border-radius: 0.375rem; cursor: pointer; transition: background 0.15s; }
    .event:hover { background: rgba(255,255,255,0.03); }
    .event.selected { background: rgba(56,189,248,0.1); border: 1px solid rgba(56,189,248,0.3); }
    .event-time { font-size: 0.75rem; color: #6b7280; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    .event-kind { font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.05em; padding: 0.15rem 0.4rem; border-radius: 999px; text-align: center; }
    .event-kind.tool { background: rgba(56,189,248,0.15); color: #38bdf8; border: 1px solid rgba(56,189,248,0.3); }
    .event-kind.session { background: rgba(249,115,22,0.15); color: #f97316; border: 1px solid rgba(249,115,22,0.3); }
    .event-kind.cron { background: rgba(34,197,94,0.15); color: #22c55e; border: 1px solid rgba(34,197,94,0.3); }
    .event-kind.alert { background: rgba(239,68,68,0.15); color: #ef4444; border: 1px solid rgba(239,68,68,0.3); }
    .event-kind.memory { background: rgba(168,85,247,0.15); color: #a855f7; border: 1px solid rgba(168,85,247,0.3); }
    .event-summary { font-size: 0.8rem; color: #e5e7eb; line-height: 1.4; }
    .detail-panel { position: fixed; right: 0; top: 0; width: 400px; max-width: 100%; height: 100%; background: #020617; border-left: 1px solid #1f2937; padding: 1rem; transform: translateX(100%); transition: transform 0.2s; z-index: 100; overflow-y: auto; }
    .detail-panel.open { transform: translateX(0); }
    .detail-panel h3 { margin: 0 0 0.5rem; font-size: 1rem; }
    .detail-panel pre { font-size: 0.7rem; white-space: pre-wrap; background: #111827; padding: 0.5rem; border-radius: 0.375rem; }
    .detail-close { position: absolute; top: 0.5rem; right: 0.5rem; background: none; border: none; color: #9ca3af; cursor: pointer; font-size: 1.2rem; }
    .auto-refresh { display: flex; align-items: center; gap: 0.5rem; font-size: 0.75rem; color: #9ca3af; }
    .auto-refresh input { accent-color: #22c55e; }
  </style>
</head>
<body>
  <header>
    <h1>📅 Timeline</h1>
    <nav>
      <a href="/">🔍 Search</a>
      <a href="/timeline" class="active">📅 Timeline</a>
      <a href="/graph">🕸️ Graph</a>
      <a href="/settings">⚙️ Settings</a>
    </nav>
  </header>
  <div class="health-bar" id="health-bar">
    <span class="health-dot ok" id="health-dot"></span>
    <span id="health-text">Checking...</span>
    <div class="stats-row" id="stats-row" style="margin-left:auto;"></div>
  </div>
  <main>
    <div class="controls">
      <select id="days-filter">
        <option value="1">Today</option>
        <option value="3">3 days</option>
        <option value="7" selected>7 days</option>
        <option value="30">30 days</option>
      </select>
      <select id="kind-filter">
        <option value="all">All types</option>
        <option value="tool">🔧 Tools</option>
        <option value="session">💬 Sessions</option>
        <option value="cron">⏰ Cron</option>
        <option value="alert">⚠️ Alerts</option>
        <option value="memory">🧠 Memory</option>
      </select>
      <button id="refresh-btn">🔄 Refresh</button>
      <button id="clear-cache-btn">🗑️ Clear cache</button>
      <label class="auto-refresh"><input type="checkbox" id="auto-refresh" /> Auto (30s)</label>
      <span id="status" class="status"></span>
    </div>
    <div id="timeline" class="timeline">
      <div class="loading"><span class="spinner"></span> Loading timeline...</div>
    </div>
  </main>
  <div id="detail-panel" class="detail-panel">
    <h3>Event Details <button class="detail-close" id="detail-close">×</button></h3>
    <div id="detail-content"></div>
  </div>
  <div class="toast-container" id="toast-container"></div>
  <script>
    const timelineEl = document.getElementById('timeline');
    const statusEl = document.getElementById('status');
    const daysFilter = document.getElementById('days-filter');
    const kindFilter = document.getElementById('kind-filter');
    const refreshBtn = document.getElementById('refresh-btn');
    const clearCacheBtn = document.getElementById('clear-cache-btn');
    const autoRefreshCb = document.getElementById('auto-refresh');
    const detailPanel = document.getElementById('detail-panel');
    const detailContent = document.getElementById('detail-content');
    const detailClose = document.getElementById('detail-close');
    const toastContainer = document.getElementById('toast-container');

    const CACHE_KEY = 'mc_timeline_cache';
    const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
    const AUTO_REFRESH_MS = 30000; // 30 seconds
    let autoRefreshTimer = null;
    const healthDot = document.getElementById('health-dot');
    const healthText = document.getElementById('health-text');
    const statsRow = document.getElementById('stats-row');

    // P0: Health bar + stats
    async function loadHealthStats() {
      try {
        const [sessionsRes, tasksRes, activityRes] = await Promise.all([
          fetch('/sessions').catch(() => null),
          fetch('/tasks').catch(() => null),
          fetch('/activity').catch(() => null)
        ]);
        
        let sessionsCount = 0, tasksCount = 0, alertsCount = 0, eventsCount = 0;
        
        if (sessionsRes && sessionsRes.ok) {
          const data = await sessionsRes.json();
          sessionsCount = Array.isArray(data) ? data.length : (data.sessions?.length || 0);
        }
        if (tasksRes && tasksRes.ok) {
          const tasks = await tasksRes.json();
          tasksCount = Array.isArray(tasks) ? tasks.length : 0;
        }
        if (activityRes && activityRes.ok) {
          const activity = await activityRes.json();
          eventsCount = Array.isArray(activity) ? activity.length : 0;
          alertsCount = activity.filter(e => e.kind === 'alert').length;
        }

        // Update health indicator
        if (healthDot && healthText) {
          if (alertsCount > 0) {
            healthDot.className = 'health-dot warn';
            healthText.textContent = alertsCount + ' alert(s)';
          } else {
            healthDot.className = 'health-dot ok';
            healthText.textContent = 'All systems operational';
          }
        }

        // Update stats row
        if (statsRow) {
          statsRow.innerHTML = 
            '<span class="stat"><span class="stat-value">' + sessionsCount + '</span> sessions</span>' +
            '<span class="stat"><span class="stat-value">' + tasksCount + '</span> tasks</span>' +
            '<span class="stat"><span class="stat-value">' + eventsCount + '</span> events</span>';
        }
      } catch (err) {
        if (healthText) healthText.textContent = 'Status unavailable';
        if (healthDot) healthDot.className = 'health-dot error';
      }
    }

    // Load health stats on page load
    loadHealthStats();

    function getStatus() {
      try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (!raw) return { events: [], lastFetch: 0, lastTs: null };
        const parsed = JSON.parse(raw);
        // Validate cache structure
        if (!parsed || !Array.isArray(parsed.events)) {
          localStorage.removeItem(CACHE_KEY);
          return { events: [], lastFetch: 0, lastTs: null };
        }
        return parsed;
      } catch (e) {
        console.error('[timeline] cache error:', e);
        localStorage.removeItem(CACHE_KEY);
        return { events: [], lastFetch: 0, lastTs: null };
      }
    }

    function setStatus(data) {
      localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    }

    function formatDate(ts) {
      try { return new Date(ts).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); } catch { return '?'; }
    }

    function formatTime(ts) {
      try { return new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }); } catch { return '?'; }
    }

    function groupByDay(events) {
      const groups = {};
      events.forEach(ev => {
        const day = formatDate(ev.ts);
        if (!groups[day]) groups[day] = [];
        groups[day].push(ev);
      });
      return Object.entries(groups).map(([day, evs]) => ({ day, events: evs.sort((a,b) => new Date(b.ts) - new Date(a.ts)) }));
    }

    function renderTimeline(events, kindFilter) {
      let filtered = events;
      if (kindFilter !== 'all') {
        filtered = events.filter(ev => ev.kind === kindFilter);
      }

      if (!filtered.length) {
        timelineEl.innerHTML = '<div class="empty">No events to display</div>';
        return;
      }

      const groups = groupByDay(filtered);
      timelineEl.innerHTML = groups.map(g => 
        '<div class="day-group">' +
          '<div class="day-header"><span>' + g.day + '</span><span class="count">' + g.events.length + ' events</span></div>' +
          '<div class="day-events">' + g.events.map(ev => {
            const kindIcon = ev.kind === 'tool' ? '🔧' : ev.kind === 'session' ? '💬' : ev.kind === 'cron' ? '⏰' : ev.kind === 'alert' ? '⚠️' : ev.kind === 'memory' ? '🧠' : '📌';
            return '<div class="event" data-event-id="' + escapeHtml(ev.id || '') + '" data-event=\'' + escapeHtml(JSON.stringify(ev).replace(/'/g, "&#39;")) + '\'>' +
              '<span class="event-time">' + formatTime(ev.ts) + '</span>' +
              '<span class="event-kind ' + ev.kind + '">' + kindIcon + ' ' + ev.kind + '</span>' +
              '<span class="event-summary">' + escapeHtml(ev.summary || '') + '</span>' +
            '</div>';
          }).join('') + '</div>' +
        '</div>'
      ).join('');

      // P1: Click on events to show detail panel
      timelineEl.querySelectorAll('.event').forEach(el => {
        el.addEventListener('click', () => {
          try {
            const data = JSON.parse(el.getAttribute('data-event') || '{}');
            showEventDetail(data);
          } catch (e) {}
        });
      });

      // P1: Click on day header to collapse/expand
      timelineEl.querySelectorAll('.day-header').forEach(header => {
        header.addEventListener('click', () => {
          const events = header.nextElementSibling;
          if (events) events.classList.toggle('collapsed');
        });
      });
    }

    // P1: Detail panel for events
    function showEventDetail(ev) {
      if (!ev || !detailPanel || !detailContent) return;
      const kindIcon = ev.kind === 'tool' ? '🔧' : ev.kind === 'session' ? '💬' : ev.kind === 'cron' ? '⏰' : ev.kind === 'alert' ? '⚠️' : ev.kind === 'memory' ? '🧠' : '📌';
      detailContent.innerHTML = 
        '<div style="margin-bottom:0.5rem;"><span class="event-kind ' + (ev.kind || '') + '">' + kindIcon + ' ' + (ev.kind || 'unknown') + '</span></div>' +
        '<div style="font-size:0.9rem;color:#e5e7eb;margin-bottom:0.5rem;">' + escapeHtml(ev.summary || '') + '</div>' +
        '<div style="font-size:0.75rem;color:#6b7280;margin-bottom:0.5rem;">' + (ev.ts ? new Date(ev.ts).toLocaleString() : '') + '</div>' +
        '<details open><summary style="cursor:pointer;color:#9ca3af;font-size:0.75rem;">Full data</summary>' +
        '<pre>' + escapeHtml(JSON.stringify(ev, null, 2)) + '</pre>' +
        '</details>';
      detailPanel.classList.add('open');
    }

    if (detailClose) {
      detailClose.addEventListener('click', () => {
        detailPanel.classList.remove('open');
      });
    }

    // P2: Toast notifications
    function showToast(message, type) {
      if (!toastContainer) return;
      const toast = document.createElement('div');
      toast.className = 'toast ' + (type || 'info');
      toast.textContent = message;
      toastContainer.appendChild(toast);
      setTimeout(() => toast.remove(), 4000);
    }

    // P1: Auto-refresh toggle
    if (autoRefreshCb) {
      autoRefreshCb.addEventListener('change', () => {
        if (autoRefreshCb.checked) {
          autoRefreshTimer = setInterval(() => loadTimeline(true), AUTO_REFRESH_MS);
          showToast('Auto-refresh enabled (30s)', 'info');
        } else {
          if (autoRefreshTimer) clearInterval(autoRefreshTimer);
          autoRefreshTimer = null;
          showToast('Auto-refresh disabled', 'info');
        }
      });
    }

    function escapeHtml(str) {
      return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function showStatus(msg, isError) {
      statusEl.textContent = msg;
      statusEl.className = 'status ' + (isError ? 'error' : 'ok');
    }

    async function loadTimeline(forceRefresh = false) {
      console.log('[timeline] loadTimeline called, forceRefresh=', forceRefresh);
      const cache = getStatus();
      const now = Date.now();
      const daysAgo = parseInt(daysFilter.value) || 7;
      const since = new Date(now - daysAgo * 24 * 60 * 60 * 1000).toISOString();

      // Use cache if fresh and not forcing refresh
      if (!forceRefresh && cache.lastFetch > 0 && (now - cache.lastFetch) < CACHE_TTL_MS) {
        console.log('[timeline] using cache, events=', cache.events.length);
        renderTimeline(cache.events, kindFilter.value);
        showStatus('From cache (' + cache.events.length + ' events)', false);
        return;
      }

      console.log('[timeline] fetching from server...');
      showStatus('Fetching...', false);
      timelineEl.innerHTML = '<div class="loading"><span class="spinner"></span> Loading timeline...</div>';

      try {
        // Fetch with since parameter for incremental update
        const url = '/timeline-data?since=' + encodeURIComponent(since) + '&limit=50'; // Reduced from 100
        console.log('[timeline] fetch url=', url);
        
        // Add timeout to fetch
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
          console.log('[timeline] fetch timeout, aborting');
          controller.abort();
        }, 15000); // Increased from 8s to 15s
        
        const resp = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);
        console.log('[timeline] fetch response status=', resp.status);
        
        if (!resp.ok) throw new Error('HTTP ' + resp.status);

        const newEvents = await resp.json();
        console.log('[timeline] received events=', newEvents.length);
        
        // Merge with cached events (dedupe by id)
        const eventMap = new Map();
        [...cache.events, ...newEvents].forEach(ev => {
          if (ev && ev.id) eventMap.set(ev.id, ev);
        });

        // Sort by timestamp desc and keep recent
        const allEvents = Array.from(eventMap.values()).sort((a, b) => new Date(b.ts) - new Date(a.ts));
        const maxEvents = 500;
        const trimmed = allEvents.slice(0, maxEvents);

        // Update cache
        const lastTs = trimmed[0]?.ts || null;
        setStatus({ events: trimmed, lastFetch: now, lastTs });

        renderTimeline(trimmed, kindFilter.value);
        showStatus('Updated (' + newEvents.length + ' new, ' + trimmed.length + ' total)', false);
      } catch (err) {
        console.error('[timeline] error:', err);
        showStatus('Error: ' + err.message, true);
        // Fall back to cache if available
        if (cache.events.length) {
          renderTimeline(cache.events, kindFilter.value);
        } else {
          timelineEl.innerHTML = '<div class="empty">Failed to load timeline: ' + err.message + '</div>';
        }
      }
    }

    // Initial load
    loadTimeline();

    // Event listeners
    refreshBtn.addEventListener('click', () => loadTimeline(true));
    clearCacheBtn.addEventListener('click', () => {
      localStorage.removeItem(CACHE_KEY);
      loadTimeline(true);
    });
    daysFilter.addEventListener('change', () => loadTimeline());
    kindFilter.addEventListener('change', () => {
      const cache = getStatus();
      renderTimeline(cache.events, kindFilter.value);
    });

    // P1: Auto-refresh toggle (default OFF)
    let autoRefreshInterval = null;
    // autoRefreshCb already declared above
    if (autoRefreshCb) {
      autoRefreshCb.addEventListener('change', () => {
        if (autoRefreshCb.checked) {
          autoRefreshInterval = setInterval(() => loadTimeline(true), 60000);
          showToast('Auto-refresh enabled (60s)', 'info');
        } else {
          clearInterval(autoRefreshInterval);
          showToast('Auto-refresh disabled', 'info');
        }
      });
    }

    // P1: Detail panel for timeline events
    const tlDetailPanel = document.getElementById('tl-detail-panel');
    const tlDetailContent = document.getElementById('tl-detail-content');
    const tlDetailClose = document.getElementById('tl-detail-close');
    if (tlDetailClose && tlDetailPanel) {
      tlDetailClose.addEventListener('click', () => tlDetailPanel.classList.remove('open'));
    }
    function showEventDetail(ev) {
      if (!tlDetailPanel || !tlDetailContent) return;
      const safe = JSON.stringify(ev, null, 2);
      const escaped = safe.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      tlDetailContent.innerHTML = '<pre>' + escaped + '</pre>';
      tlDetailPanel.classList.add('open');
    }

    // P2: Toast helper for timeline page
    function showToast(msg, type) {
      const tc = document.getElementById('tl-toast-container');
      if (!tc) return;
      const t = document.createElement('div');
      t.className = 'toast ' + (type || 'info');
      t.textContent = msg;
      tc.appendChild(t);
      setTimeout(() => t.remove(), 4000);
    }
  </script>
</body>
</html>`;

const graphHtml = String.raw`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>OpenClaw ClawScope – Knowledge Graph</title>
  <script src="https://d3js.org/d3.v7.min.js"></script>
  <style>
    ${sharedStyles}
    .graph-container { width: 100%; height: calc(100vh - 120px); background: #020617; border-radius: 0.5rem; overflow: hidden; }
    .node { cursor: pointer; }
    .node circle { stroke: #374151; stroke-width: 2px; fill: #1f2937; transition: all 0.2s; }
    .node circle:hover { stroke: #22c55e; stroke-width: 3px; fill: #064e3b; }
    .node text { font-size: 11px; fill: #e5e7eb; pointer-events: none; }
    .link { stroke: #374151; stroke-opacity: 0.6; }
    .link-label { font-size: 9px; fill: #9ca3af; }
    .node-details { position: absolute; top: 80px; right: 1rem; width: 300px; background: #111827; border: 1px solid #374151; border-radius: 0.5rem; padding: 1rem; }
    .node-details h3 { margin: 0 0 0.5rem 0; font-size: 1rem; color: #22c55e; }
    .node-details .close { position: absolute; top: 0.5rem; right: 0.5rem; background: none; border: none; color: #9ca3af; cursor: pointer; font-size: 1.2rem; }
    .node-details ul { margin: 0; padding-left: 1rem; font-size: 0.85rem; }
    .node-details li { margin: 0.25rem 0; color: #e5e7eb; }
    .controls { display: flex; gap: 1rem; align-items: center; padding: 0.75rem 1rem; background: #020617; border-bottom: 1px solid #1f2937; }
    .controls input, .controls select { padding: 0.4rem 0.6rem; border-radius: 0.375rem; border: 1px solid #374151; background: #111827; color: #e5e7eb; font-size: 0.85rem; }
    .controls button { padding: 0.4rem 0.8rem; border-radius: 0.375rem; border: 1px solid #374151; background: #1f2937; color: #e5e7eb; cursor: pointer; }
    .controls button:hover { background: #374151; }
    .stats-panel { font-size: 0.75rem; color: #9ca3af; margin-left: auto; display: flex; gap: 1rem; }
    .stats-panel span { display: flex; align-items: center; gap: 0.3rem; }
    .stats-panel .value { color: #22c55e; font-weight: 600; }
    .legend { display: flex; gap: 1rem; font-size: 0.75rem; color: #9ca3af; padding: 0.5rem 1rem; background: #020617; }
    .legend-item { display: flex; align-items: center; gap: 0.3rem; }
    .legend-color { width: 12px; height: 12px; border-radius: 50%; }
  </style>
</head>
<body>
  <header>
    <h1>🕸️ Knowledge Graph</h1>
    <nav>
      <a href="/" style="color:#9ca3af;text-decoration:none;padding:0.25rem 0.5rem;font-size:0.85rem;">🔍 Search</a>
      <a href="/timeline" style="color:#9ca3af;text-decoration:none;padding:0.25rem 0.5rem;font-size:0.85rem;">📅 Timeline</a>
      <a href="/graph" style="color:#e5e7eb;text-decoration:none;background:#111827;padding:0.25rem 0.5rem;border-radius:0.25rem;font-size:0.85rem;">🕸️ Graph</a>
      <a href="/settings" style="color:#9ca3af;text-decoration:none;padding:0.25rem 0.5rem;font-size:0.85rem;">⚙️ Settings</a>
    </nav>
  </header>
  <div class="controls">
    <input type="text" id="entity-filter" placeholder="Filter by entity..." style="width: 200px;" />
    <select id="confidence-filter">
      <option value="0">All confidence</option>
      <option value="0.5">High (0.5+)</option>
      <option value="0.7">Very high (0.7+)</option>
      <option value="0.9">Certain (0.9+)</option>
    </select>
    <button id="refresh-btn">Refresh</button>
    <button id="reset-btn">Reset View</button>
    <div class="stats-panel" id="stats-panel">
      <span>Loading...</span>
    </div>
  </div>
  <div class="graph-container" id="graph"></div>
  <div class="node-details" id="node-details" style="display:none;">
    <button class="close" id="close-details">×</button>
    <h3 id="details-title">Entity</h3>
    <ul id="details-list"></ul>
  </div>
  <script>
    const graphEl = document.getElementById('graph');
    const entityFilter = document.getElementById('entity-filter');
    const confidenceFilter = document.getElementById('confidence-filter');
    const refreshBtn = document.getElementById('refresh-btn');
    const resetBtn = document.getElementById('reset-btn');
    const statsPanel = document.getElementById('stats-panel');
    const nodeDetails = document.getElementById('node-details');
    const detailsTitle = document.getElementById('details-title');
    const detailsList = document.getElementById('details-list');
    const closeDetails = document.getElementById('close-details');

    let simulation, svg, g, link, node;
    let currentData = null;

    function initGraph(data) {
      currentData = data;
      graphEl.innerHTML = '';
      
      // Transform edges: from/to → source/target for D3
      data.edges = data.edges.map(e => ({
        source: e.from,
        target: e.to,
        label: e.label,
        confidence: e.confidence
      }));
      
      const width = graphEl.clientWidth;
      const height = graphEl.clientHeight;
      
      svg = d3.select('#graph')
        .append('svg')
        .attr('width', width)
        .attr('height', height);
        
      g = svg.append('g');

      // Zoom behavior
      const zoom = d3.zoom()
        .scaleExtent([0.1, 4])
        .on('zoom', (event) => g.attr('transform', event.transform));
      svg.call(zoom);

      // Create links
      link = g.append('g')
        .selectAll('line')
        .data(data.edges)
        .join('line')
        .attr('class', 'link')
        .attr('stroke-width', d => Math.max(1, d.confidence * 3));

      // Create nodes
      node = g.append('g')
        .selectAll('g')
        .data(data.nodes)
        .join('g')
        .attr('class', 'node')
        .call(d3.drag()
          .on('start', dragStarted)
          .on('drag', dragged)
          .on('end', dragEnded));

      node.append('circle')
        .attr('r', d => {
          const connections = data.edges.filter(e => {
            const src = typeof e.source === 'object' ? e.source.id : e.source;
            const tgt = typeof e.target === 'object' ? e.target.id : e.target;
            return src === d.id || tgt === d.id;
          }).length;
          return Math.max(8, Math.min(25, 8 + connections * 2));
        });

      node.append('text')
        .attr('dy', 4)
        .attr('dx', 20)
        .text(d => d.label.length > 15 ? d.label.slice(0, 15) + '…' : d.label);

      node.on('click', (event, d) => showNodeDetails(d, data));

      // Force simulation
      simulation = d3.forceSimulation(data.nodes)
        .force('link', d3.forceLink(data.edges).id(d => d.id).distance(100))
        .force('charge', d3.forceManyBody().strength(-200))
        .force('center', d3.forceCenter(width / 2, height / 2))
        .force('collision', d3.forceCollide().radius(30));

      simulation.on('tick', () => {
        link
          .attr('x1', d => d.source.x)
          .attr('y1', d => d.source.y)
          .attr('x2', d => d.target.x)
          .attr('y2', d => d.target.y);
        node.attr('transform', d => 'translate(' + d.x + ',' + d.y + ')');
      });

      // Update stats
      updateStats(data);
    }

    function dragStarted(event, d) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event, d) {
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragEnded(event, d) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }

    function showNodeDetails(d, data) {
      const edges = data.edges.filter(e => {
        const src = typeof e.source === 'object' ? e.source.id : e.source;
        const tgt = typeof e.target === 'object' ? e.target.id : e.target;
        return src === d.id || tgt === d.id;
      });
      detailsTitle.textContent = d.label;
      detailsList.innerHTML = edges.map(e => {
        const src = typeof e.source === 'object' ? e.source.id : e.source;
        const tgt = typeof e.target === 'object' ? e.target.id : e.target;
        const arrow = src === d.id ? '→ ' + tgt : '← ' + src;
        return '<li>' + e.label + ' ' + arrow + ' <span style="color:#6b7280;">(' + (e.confidence * 100).toFixed(0) + '%)</span></li>';
      }).join('');
      nodeDetails.style.display = 'block';
    }

    function updateStats(data) {
      const stats = data.stats || {};
      statsPanel.innerHTML = 
        '<span><span class="value">' + (stats.totalFacts || data.edges.length) + '</span> facts</span>' +
        '<span><span class="value">' + (stats.totalEntities || data.nodes.length) + '</span> entities</span>' +
        '<span><span class="value">' + (stats.totalPredicates || 0) + '</span> predicates</span>';
    }

    async function loadData() {
      const entity = entityFilter.value.trim();
      const minConf = confidenceFilter.value;
      let url = '/graph-data?limit=200&minConfidence=' + minConf;
      if (entity) url += '&entity=' + encodeURIComponent(entity);
      
      try {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error('Failed to load graph');
        const data = await resp.json();
        if (data.nodes && data.nodes.length > 0) {
          initGraph(data);
        } else {
          graphEl.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#9ca3af;">No graph data found. Add some facts first!</div>';
          statsPanel.innerHTML = '<span>No data</span>';
        }
      } catch (err) {
        graphEl.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#ef4444;">Error: ' + err.message + '</div>';
      }
    }

    // Event listeners
    refreshBtn.addEventListener('click', loadData);
    resetBtn.addEventListener('click', () => {
      entityFilter.value = '';
      confidenceFilter.value = '0';
      loadData();
    });
    closeDetails.addEventListener('click', () => {
      nodeDetails.style.display = 'none';
    });
    entityFilter.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') loadData();
    });

    // Initial load
    loadData();

    // Resize handler
    window.addEventListener('resize', () => {
      if (currentData) {
        simulation.force('center', d3.forceCenter(graphEl.clientWidth / 2, graphEl.clientHeight / 2));
        simulation.alpha(0.3).restart();
      }
    });
  </script>
</body>
</html>`;

const html = String.raw`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>OpenClaw ClawScope – Global Search</title>
  <style>
    body { font-family: system-ui, -apple-system, BlinkMacSystemFont, sans-serif; margin: 0; padding: 0; background: #0b1120; color: #e5e7eb; }
    header { padding: 0.75rem 1.5rem; border-bottom: 1px solid #1f2937; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem; }
    header h1 { font-size: 1.1rem; margin: 0; }
    .health-bar { display: flex; align-items: center; gap: 0.5rem; font-size: 0.75rem; padding: 0.5rem 1rem; background: #020617; border-bottom: 1px solid #1f2937; }
    .health-dot { width: 8px; height: 8px; border-radius: 50%; }
    .health-dot.ok { background: #22c55e; box-shadow: 0 0 8px rgba(34,197,94,0.5); }
    .health-dot.warn { background: #f59e0b; box-shadow: 0 0 8px rgba(245,158,11,0.5); }
    .health-dot.error { background: #ef4444; box-shadow: 0 0 8px rgba(239,68,68,0.5); }
    .stats-row { display: flex; gap: 1.5rem; font-size: 0.75rem; color: #9ca3af; }
    .stat { display: flex; align-items: center; gap: 0.25rem; }
    .stat-value { color: #e5e7eb; font-weight: 600; }
    main { padding: 1rem 1.5rem; }
    .search-bar { display: flex; gap: 0.5rem; margin-bottom: 1rem; flex-wrap: wrap; }
    .search-bar input[type="text"] { flex: 1; min-width: 200px; padding: 0.5rem 0.75rem; border-radius: 0.375rem; border: 1px solid #374151; background: #020617; color: #e5e7eb; }
    .search-bar select, .search-bar button { padding: 0.5rem 0.75rem; border-radius: 0.375rem; border: 1px solid #374151; background: #111827; color: #e5e7eb; cursor: pointer; }
    .search-bar button:hover { background: #1f2937; }
    .spinner { display: inline-block; width: 16px; height: 16px; border: 2px solid #374151; border-top-color: #22c55e; border-radius: 50%; animation: spin 0.8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .results { display: flex; flex-direction: column; gap: 0.75rem; }
    .result { padding: 0.75rem 1rem; border-radius: 0.5rem; background: #020617; border: 1px solid #111827; }
    .result-header { display: flex; gap: 0.5rem; align-items: baseline; margin-bottom: 0.25rem; }
    .badge { font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.05em; padding: 0.1rem 0.4rem; border-radius: 999px; border: 1px solid #4b5563; color: #e5e7eb; }
    .badge.memory { border-color: #22c55e; color: #bbf7d0; }
    .source { font-size: 0.65rem; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.05em; }
    .snippet { font-size: 0.85rem; color: #e5e7eb; }
    .meta { margin-top: 0.25rem; font-size: 0.7rem; color: #9ca3af; display: flex; gap: 0.75rem; flex-wrap: wrap; }
    .empty { font-size: 0.9rem; color: #9ca3af; }
    .scroll-panel { max-height: 200px; overflow-y: auto; padding-right: 0.5rem; }
    .scroll-panel::-webkit-scrollbar { width: 6px; }
    .scroll-panel::-webkit-scrollbar-track { background: #111827; border-radius: 3px; }
    .scroll-panel::-webkit-scrollbar-thumb { background: #374151; border-radius: 3px; }
    .scroll-panel::-webkit-scrollbar-thumb:hover { background: #4b5563; }
  </style>
</head>
<body>
  <header>
    <h1>🔍 Global Search</h1>
    <nav style="display:flex;gap:0.75rem;align-items:center;">
      <a href="/" style="color:#e5e7eb;text-decoration:none;background:#111827;padding:0.25rem 0.5rem;border-radius:0.25rem;font-size:0.85rem;">🔍 Search</a>
      <a href="/timeline" style="color:#9ca3af;text-decoration:none;padding:0.25rem 0.5rem;font-size:0.85rem;">📅 Timeline</a>
      <a href="/graph" style="color:#9ca3af;text-decoration:none;padding:0.25rem 0.5rem;font-size:0.85rem;">🕸️ Graph</a>
      <a href="/settings" style="color:#9ca3af;text-decoration:none;padding:0.25rem 0.5rem;font-size:0.85rem;">⚙️ Settings</a>
      <span style="font-size:0.75rem;color:#6b7280;margin-left:0.5rem;">ClawScope</span>
    </nav>
  </header>
  <div class="health-bar" id="health-bar">
    <span class="health-dot ok" id="health-dot"></span>
    <span id="health-text">Checking...</span>
    <button class="sidebar-toggle" id="sidebar-toggle" title="Toggle sidebar">☰</button>
    <div class="stats-row" id="stats-row" style="margin-left:auto;"></div>
  </div>
  <main>
    <div style="display:flex; gap:1.5rem; align-items:flex-start; flex-wrap:wrap;">
      <div style="flex:2; min-width:0;">
        <h2 style="font-size:0.9rem; font-weight:600; margin:0 0 0.5rem 0; color:#9ca3af;">Global Search <span style="color:#6b7280;font-weight:normal;">(press <span class="kbd">Enter</span> to search)</span></h2>
        <form class="search-bar" id="search-form">
      <input type="text" id="q" name="q" placeholder="Search memories (offline sqlite)…" autofocus />
      <select id="mode" name="mode">
        <option value="hybrid" selected>hybrid</option>
        <option value="lexical">lexical</option>
        <option value="semantic">semantic</option>
      </select>
      <input type="text" id="source" name="source" placeholder="source (optional)" style="max-width: 10rem;" />
      <button type="submit">Search</button>
    </form>
    <section id="results" class="results">
      <div class="empty">Type a query and hit Enter to search your offline memory.</div>
    </section>
      </div>
      <div id="sidebar" class="sidebar" style="flex:1.3; min-width:260px; display:flex; flex-direction:column; gap:1rem;">
        <section id="sessions" style="border:1px solid #111827; border-radius:0.5rem; padding:0.75rem 0.9rem; background:#020617;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.4rem;">
            <h2 style="font-size:0.9rem; font-weight:600; margin:0; color:#e5e7eb;">Sessions</h2>
          </div>
          <div id="sessions-list" class="scroll-panel" style="display:flex; flex-direction:column; gap:0.3rem; font-size:0.8rem; color:#9ca3af;">
            <div class="empty">Session inspector (stub) – wired to main session.</div>
          </div>
          <div id="sessions-detail" style="margin-top:0.5rem; font-size:0.75rem; color:#9ca3af; border-top:1px solid #111827; padding-top:0.4rem;"></div>
        </section>
        <section id="activity" style="border:1px solid #111827; border-radius:0.5rem; padding:0.75rem 0.9rem; background:#020617;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.4rem;">
            <h2 style="font-size:0.9rem; font-weight:600; margin:0; color:#e5e7eb;">Activity feed</h2>
          </div>
          <div id="activity-list" class="scroll-panel" style="display:flex; flex-direction:column; gap:0.45rem; font-size:0.8rem; color:#9ca3af;">
            <div class="empty">No activity loaded yet.</div>
          </div>
          <div id="activity-detail" style="margin-top:0.5rem; font-size:0.75rem; color:#9ca3af; border-top:1px solid #111827; padding-top:0.4rem;"></div>
        </section>
        <section id="tasks" style="border:1px solid #111827; border-radius:0.5rem; padding:0.75rem 0.9rem; background:#020617;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.4rem;">
            <h2 style="font-size:0.9rem; font-weight:600; margin:0; color:#e5e7eb;">Scheduled tasks</h2>
          </div>
          <div id="tasks-list" class="scroll-panel" style="display:flex; flex-direction:column; gap:0.3rem; font-size:0.8rem; color:#9ca3af;">
            <div class="empty">No tasks loaded yet.</div>
          </div>
          <div id="tasks-detail" style="margin-top:0.5rem; font-size:0.75rem; color:#9ca3af; border-top:1px solid #111827; padding-top:0.4rem;"></div>
        </section>
        <section id="categories" style="border:1px solid #111827; border-radius:0.5rem; padding:0.75rem 0.9rem; background:#020617;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.4rem;">
            <h2 style="font-size:0.9rem; font-weight:600; margin:0; color:#e5e7eb;">Categories</h2>
          </div>
          <div id="categories-list" class="scroll-panel" style="display:flex; flex-wrap:wrap; gap:0.35rem; font-size:0.75rem;">
            <div class="empty">No categories loaded.</div>
          </div>
        </section>
      </div>
    </div>
  </main>
  <div class="toast-container" id="toast-container"></div>
  <div id="detail-panel" class="detail-panel">
    <h3>Details <button class="detail-close" id="detail-close">×</button></h3>
    <div id="detail-content"></div>
  </div>
  <script>
    const form = document.getElementById('search-form');
    const resultsNode = document.getElementById('results');
    const input = document.getElementById('q');
    const modeSelect = document.getElementById('mode');
    const sourceInput = document.getElementById('source');
    const activityList = document.getElementById('activity-list');
    const tasksList = document.getElementById('tasks-list');
    const activityDetail = document.getElementById('activity-detail');
    const tasksDetail = document.getElementById('tasks-detail');
    const sessionsList = document.getElementById('sessions-list');
    const sessionsDetail = document.getElementById('sessions-detail');
    const healthDot = document.getElementById('health-dot');
    const healthText = document.getElementById('health-text');
    const statsRow = document.getElementById('stats-row');
    const sidebarToggle = document.getElementById('sidebar-toggle');
    const sidebar = document.getElementById('sidebar');
    const toastContainer = document.getElementById('toast-container');
    const detailPanel = document.getElementById('detail-panel');
    const detailContent = document.getElementById('detail-content');
    const detailClose = document.getElementById('detail-close');

    // P2: Toast notifications
    function showToast(message, type) {
      if (!toastContainer) return;
      const toast = document.createElement('div');
      toast.className = 'toast ' + (type || 'info');
      toast.textContent = message;
      toastContainer.appendChild(toast);
      setTimeout(() => toast.remove(), 4000);
    }

    // P1: Collapsible sidebar
    if (sidebarToggle && sidebar) {
      sidebarToggle.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
        sidebarToggle.textContent = sidebar.classList.contains('collapsed') ? '☰' : '✕';
      });
    }

    // P1: Detail panel close
    if (detailClose && detailPanel) {
      detailClose.addEventListener('click', () => {
        detailPanel.classList.remove('open');
      });
    }

    console.log('[MC] frontend boot: form=', !!form, 'input=', !!input, 'modeSelect=', !!modeSelect, 'sourceInput=', !!sourceInput);

    // P0: Health bar + stats
    async function loadHealthStats() {
      try {
        const [sessionsRes, tasksRes, activityRes] = await Promise.all([
          fetch('/sessions').catch(() => null),
          fetch('/tasks').catch(() => null),
          fetch('/activity').catch(() => null)
        ]);
        
        let sessionsCount = 0, tasksCount = 0, alertsCount = 0, eventsCount = 0;
        
        if (sessionsRes && sessionsRes.ok) {
          const data = await sessionsRes.json();
          sessionsCount = Array.isArray(data) ? data.length : (data.sessions?.length || 0);
        }
        if (tasksRes && tasksRes.ok) {
          const tasks = await tasksRes.json();
          tasksCount = Array.isArray(tasks) ? tasks.length : 0;
        }
        if (activityRes && activityRes.ok) {
          const activity = await activityRes.json();
          eventsCount = Array.isArray(activity) ? activity.length : 0;
          alertsCount = activity.filter(e => e.kind === 'alert').length;
        }

        if (healthDot && healthText) {
          if (alertsCount > 0) {
            healthDot.className = 'health-dot warn';
            healthText.textContent = alertsCount + ' alert(s)';
          } else {
            healthDot.className = 'health-dot ok';
            healthText.textContent = 'All systems operational';
          }
        }

        if (statsRow) {
          statsRow.innerHTML = 
            '<span class="stat"><span class="stat-value">' + sessionsCount + '</span> sessions</span>' +
            '<span class="stat"><span class="stat-value">' + tasksCount + '</span> tasks</span>' +
            '<span class="stat"><span class="stat-value">' + eventsCount + '</span> events</span>';
        }
      } catch (err) {
        if (healthText) healthText.textContent = 'Status unavailable';
        if (healthDot) healthDot.className = 'health-dot error';
      }
    }
    loadHealthStats();

    // Load side panels safely - don't let errors break the main search
    try { loadSessions(); } catch (e) { console.error('[MC] loadSessions error:', e); }
    try { loadActivity(); } catch (e) { console.error('[MC] loadActivity error:', e); }
    try { loadTasks(); } catch (e) { console.error('[MC] loadTasks error:', e); }
    try { loadCategories(); } catch (e) { console.error('[MC] loadCategories error:', e); }

    if (!form) {
      console.error('[MC] search form not found, aborting listener setup');
    } else {
      form.addEventListener('submit', async (e) => {
      e.preventDefault();
      console.log('[MC] submit handler fired');
      const q = input.value.trim();
      const mode = modeSelect.value || 'hybrid';
      const sourceFilter = sourceInput.value.trim().toLowerCase();
      console.log('[MC] submit values', { q, mode, sourceFilter });
      if (!q) {
        console.log('[MC] empty query, ignoring submit');
        return;
      }

      resultsNode.innerHTML = '<div class="empty">Searching…</div>';

      try {
        console.log('[MC] calling /memory/search');
        const resp = await fetch('/memory/search?q=' + encodeURIComponent(q) + '&mode=' + encodeURIComponent(mode) + '&limit=20');
        console.log('[MC] /memory/search status', resp.status);
        if (!resp.ok) {
          const text = await resp.text();
          console.error('[MC] /memory/search error', resp.status, text);
          resultsNode.innerHTML = '<div class="empty">Error: ' + resp.status + ' ' + text + '</div>';
          return;
        }
        let items = await resp.json();
        console.log('[MC] /memory/search items', items?.length);
        if (!Array.isArray(items) || items.length === 0) {
          console.log('[MC] no items returned from backend');
          resultsNode.innerHTML = '<div class="empty">No results.</div>';
          return;
        }

        // Optional filter by source
        if (sourceFilter) {
          console.log('[MC] applying sourceFilter to items');
          items = items.filter((item) => {
            const src = String(item.source ?? '').toLowerCase();
            return src.includes(sourceFilter);
          });
        }

        if (!items.length) {
          console.log('[MC] items empty after applying sourceFilter');
          resultsNode.innerHTML = '<div class="empty">No results for this source filter.</div>';
          return;
        }

        console.log('[MC] rendering', items.length, 'items');
        resultsNode.innerHTML = '';

        const info = document.createElement('div');
        info.className = 'empty';
        info.textContent =
          'Sorted by relevance (score desc) – mode: ' + mode + ' – ' + items.length + ' result(s)' +
          (sourceFilter ? ' – source contains: ' + sourceFilter : '');
        resultsNode.appendChild(info);

        items.forEach((item, index) => {
          const div = document.createElement('article');
          div.className = 'result';

          const kind = (item.kind || 'item').toUpperCase();
          const source = item.source || 'unknown';
          const createdAt = item.created_at || null;
          const snippet = item.snippet || '';
          const score = typeof item.score === 'number' ? item.score.toFixed(3) : null;
          const scoreFts = typeof item.score_fts === 'number' ? item.score_fts.toFixed(3) : null;
          const scoreEmbed = typeof item.score_embed === 'number' ? item.score_embed.toFixed(3) : null;
          const fullText = item.payload && item.payload.text ? String(item.payload.text) : '';

          let createdAtHtml = '';
          if (createdAt) {
            try { createdAtHtml = new Date(createdAt).toLocaleString(); } catch {}
          }

          const rank = index + 1;

          const container = document.createElement('div');
          container.innerHTML =
            '<div class="result-header">' +
              '<span class="badge ' + (item.kind || '') + '">#' + rank + ' ' + kind + '</span>' +
              '<span class="source">' + source + '</span>' +
              (score ? '<span class="source" style="margin-left:auto;">score: ' + score + '</span>' : '') +
            '</div>' +
            '<div class="snippet">' + escapeHtml(snippet) + '</div>' +
            '<div class="meta">' +
              (createdAtHtml ? '<span>' + createdAtHtml + '</span>' : '') +
              (scoreFts ? '<span>fts: ' + scoreFts + '</span>' : '') +
              (scoreEmbed ? '<span>embed: ' + scoreEmbed + '</span>' : '') +
            '</div>';

          const details = document.createElement('details');
          const summary = document.createElement('summary');
          summary.textContent = 'Afficher le détail (markdown)';
          details.appendChild(summary);

          const detailDiv = document.createElement('div');
          detailDiv.style.marginTop = '0.5rem';
          detailDiv.style.fontSize = '0.85rem';
          detailDiv.innerHTML = renderMarkdown(fullText || '[no full text payload]');
          details.appendChild(detailDiv);

          container.appendChild(details);
          div.appendChild(container);
          resultsNode.appendChild(div);
        });
      } catch (err) {
        console.error('[MC] search handler error', err);
        resultsNode.innerHTML = '<div class="empty">Error: ' + err + '</div>';
      }
    });
    }

    function escapeHtml(str) {
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    // Minimal Markdown-ish renderer: escape HTML and wrap paragraphs.
    function renderMarkdown(src) {
      const text = typeof src === 'string' ? src : String(src || '');
      const escaped = escapeHtml(text);
      const parts = escaped.split('\n\n');
      const out = [];
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i].trim();
        if (!p) continue;
        // preserve single line breaks inside paragraph
        out.push('<p>' + p.replace('\n', '<br/>') + '</p>');
      }
      return out.join('');
    }

    async function loadSessions() {
      if (!sessionsList) return;
      sessionsList.innerHTML = '<div class="empty">Loading sessions…</div>';
      try {
        const resp = await fetch('/sessions');
        if (!resp.ok) {
          const text = await resp.text();
          sessionsList.innerHTML = '<div class="empty">Error loading sessions: ' + resp.status + ' ' + text + '</div>';
          return;
        }
        const data = await resp.json();
        const sessions = Array.isArray(data) ? data : (data.sessions || []);
        if (!sessions.length) {
          sessionsList.innerHTML = '<div class="empty">No sessions.</div>';
          return;
        }
        const total = sessions.length;
        const displaySessions = sessions.slice(0, 15);
        sessionsList.innerHTML = '<div class="empty" style="margin-bottom:0.3rem;">Showing ' + displaySessions.length + ' of ' + total + '</div>';
        displaySessions.forEach((s) => {
          const row = document.createElement('button');
          row.type = 'button';
          row.style.display = 'flex';
          row.style.flexDirection = 'column';
          row.style.textAlign = 'left';
          row.style.background = 'transparent';
          row.style.border = 'none';
          row.style.padding = '0.15rem 0';
          row.style.cursor = 'pointer';

          const label = s.label || s.name || s.id || 'Session';
          const id = s.id || s.sessionKey || '';
          const channel = (s.channel || (s.deliveryContext && s.deliveryContext.channel) || '');
          const model = (s.model || (s.stats && s.stats.model) || '');

          row.innerHTML =
            '<div style="font-size:0.8rem;color:#e5e7eb;">' + escapeHtml(label) + '</div>' +
            '<div style="font-size:0.7rem;color:#9ca3af;">' + escapeHtml(id) + (channel ? ' · ' + escapeHtml(channel) : '') + (model ? ' · ' + escapeHtml(model) : '') + '</div>';

          row.addEventListener('click', () => {
            if (!sessionsDetail) return;
            const safe = escapeHtml(JSON.stringify(s, null, 2));
            sessionsDetail.innerHTML = '<div style="font-size:0.7rem;color:#9ca3af;">Session details:</div>' +
              '<pre style="margin:0.15rem 0 0; white-space:pre-wrap; font-size:0.7rem; background:#020617;border:1px solid #111827;border-radius:4px;padding:0.4rem;">' + safe + '</pre>';
          });

          sessionsList.appendChild(row);
        });
      } catch (err) {
        sessionsList.innerHTML = '<div class="empty">Error loading sessions: ' + err + '</div>';
      }
    }

    async function loadActivity() {
      console.log('[MC] loadActivity()');
      try {
        const resp = await fetch('/activity');
        console.log('[MC] /activity status', resp.status);
        if (!resp.ok) {
          console.error('[MC] /activity error', resp.status);
          activityList.innerHTML = '<div class="empty">Error loading activity: ' + resp.status + '</div>';
          return;
        }
        const items = await resp.json();
        console.log('[MC] /activity items', Array.isArray(items) ? items.length : null);
        if (!Array.isArray(items) || items.length === 0) {
          activityList.innerHTML = '<div class="empty">No recent activity.</div>';
          return;
        }
        activityList.innerHTML = '';
        items.forEach(function (ev) {
          const row = document.createElement('button');
          row.type = 'button';
          row.style.display = 'flex';
          row.style.flexDirection = 'column';
          row.style.textAlign = 'left';
          row.style.background = 'transparent';
          row.style.border = 'none';
          row.style.padding = '0.15rem 0';
          row.style.cursor = 'pointer';

          const ts = ev.ts ? new Date(ev.ts).toLocaleTimeString() : '';
          const kindRaw = ev.kind || '';
          const kind = kindRaw.toUpperCase();
          const summary = ev.summary || '';

          let kindColor = '#9ca3af';
          let kindIcon = '';
          if (kindRaw === 'tool') { kindColor = '#38bdf8'; kindIcon = '🔧 '; }
          else if (kindRaw === 'cron') { kindColor = '#22c55e'; kindIcon = '⏰ '; }
          else if (kindRaw === 'session') { kindColor = '#f97316'; kindIcon = '💬 '; }
          else if (kindRaw === 'alert') { kindColor = '#ef4444'; kindIcon = '⚠️ '; }

          row.innerHTML =
            '<div style="display:flex;justify-content:space-between;align-items:center;">' +
              '<span style="font-size:0.7rem;color:#6b7280;">' + escapeHtml(ts) + '</span>' +
              '<span style="font-size:0.65rem;text-transform:uppercase;letter-spacing:0.05em;color:' + kindColor + ';">' + kindIcon + escapeHtml(kind) + '</span>' +
            '</div>' +
            '<div style="font-size:0.8rem;color:#e5e7eb;">' + escapeHtml(summary) + '</div>';

          row.addEventListener('click', function () {
            showActivityDetail(ev);
          });

          activityList.appendChild(row);
        });
      } catch (err) {
        activityList.innerHTML = '<div class="empty">Error loading activity: ' + err + '</div>';
      }
    }

    async function loadTasks() {
      try {
        const resp = await fetch('/tasks');
        console.log('[MC] /tasks status', resp.status);
        if (!resp.ok) {
          console.error('[MC] /tasks error', resp.status);
          tasksList.innerHTML = '<div class="empty">Error loading tasks: ' + resp.status + '</div>';
          return;
        }
        const items = await resp.json();
        console.log('[MC] /tasks items', Array.isArray(items) ? items.length : null);
        if (!Array.isArray(items) || items.length === 0) {
          tasksList.innerHTML = '<div class="empty">No scheduled tasks.</div>';
          return;
        }
        tasksList.innerHTML = '';
        items.forEach(function (t) {
          const row = document.createElement('button');
          row.type = 'button';
          row.style.display = 'flex';
          row.style.flexDirection = 'column';
          row.style.textAlign = 'left';
          row.style.background = 'transparent';
          row.style.border = 'none';
          row.style.padding = '0.15rem 0';
          row.style.cursor = 'pointer';

          const name = t.name || t.id || 'Task';
          const schedule = t.schedule || '';
          const nextRunAt = t.nextRun ? new Date(t.nextRun).toLocaleString() : '—';
          const enabled = t.enabled !== false;
          const agentId = t.agentId || '';

          row.innerHTML =
            '<div style="display:flex;justify-content:space-between;align-items:center;">' +
              '<span style="font-size:0.7rem;color:#6b7280;">' + escapeHtml(agentId) + '</span>' +
              '<span style="font-size:0.7rem;color:' + (enabled ? '#22c55e' : '#f97316') + ';">' + (enabled ? 'ON' : 'OFF') + '</span>' +
            '</div>' +
            '<div style="font-size:0.8rem;color:#e5e7eb;">' + escapeHtml(name) + '</div>' +
            '<div style="font-size:0.7rem;color:#9ca3af;">' + escapeHtml(schedule) + (t.nextRun ? ' · Next: ' + escapeHtml(nextRunAt) : '') + '</div>';

          row.addEventListener('click', function () {
            showTaskDetail(t);
          });

          tasksList.appendChild(row);
        });
      } catch (err) {
        tasksList.innerHTML = '<div class="empty">Error loading tasks: ' + err + '</div>';
      }
    }

    function showActivityDetail(ev) {
      if (!ev) {
        activityDetail.innerHTML = '';
        return;
      }
      const safe = escapeHtml(JSON.stringify(ev, null, 2));
      activityDetail.innerHTML = '<div style="font-size:0.7rem;color:#9ca3af;">Activity details:</div>' +
        '<pre style="margin:0.15rem 0 0; white-space:pre-wrap; font-size:0.7rem; background:#020617;border:1px solid #111827;border-radius:4px;padding:0.4rem;">' + safe + '</pre>';
    }

    function showTaskDetail(t) {
      if (!t) {
        tasksDetail.innerHTML = '';
        return;
      }
      const safe = escapeHtml(JSON.stringify(t, null, 2));
      tasksDetail.innerHTML = '<div style="font-size:0.7rem;color:#9ca3af;">Task details:</div>' +
        '<pre style="margin:0.15rem 0 0; white-space:pre-wrap; font-size:0.7rem; background:#020617;border:1px solid #111827;border-radius:4px;padding:0.4rem;">' + safe + '</pre>';
    }

    async function loadCategories() {
      const categoriesList = document.getElementById('categories-list');
      if (!categoriesList) return;

      try {
        const resp = await fetch('/memory/categories');
        if (!resp.ok) {
          categoriesList.innerHTML = '<div class="empty">Failed to load categories</div>';
          return;
        }
        const categories = await resp.json();
        if (!Array.isArray(categories) || categories.length === 0) {
          categoriesList.innerHTML = '<div class="empty">No categories found</div>';
          return;
        }

        // Display top 20 categories as clickable chips
        categoriesList.innerHTML = categories.slice(0, 20).map(cat =>
          '<button class="category-chip" data-tag="' + escapeHtml(cat.tag) + '" style="background:#1f2937;border:1px solid #374151;color:#e5e7eb;padding:0.2rem 0.5rem;border-radius:0.25rem;cursor:pointer;font-size:0.7rem;">' +
          escapeHtml(cat.tag) + ' <span style="color:#6b7280;">(' + cat.count + ')</span></button>'
        ).join('');

        // Add click handlers
        categoriesList.querySelectorAll('.category-chip').forEach(chip => {
          chip.addEventListener('click', () => {
            const tag = chip.getAttribute('data-tag');
            if (tag && input) {
              input.value = tag;
              if (form) form.dispatchEvent(new Event('submit'));
            }
          });
        });
      } catch (e) {
        console.error('[MC] loadCategories error:', e);
        categoriesList.innerHTML = '<div class="empty">Error loading categories</div>';
      }
    }
  </script>
</body>
</html>`;

const pluginBaseUrl = process.env.CLAWSCOPE_PLUGIN_BASE_URL || process.env.OPENCLAW_HTTP_BASE || process.env.OPENCLAW_GATEWAY_URL || 'http://127.0.0.1:3000';

function formatSchedule(schedule: any): string {
  if (!schedule) return 'unknown';
  if (schedule.kind === 'cron') return schedule.expr || 'cron';
  if (schedule.kind === 'every') {
    const mins = Math.round(((schedule.everyMs || 0) / 60000));
    return mins ? `every ${mins}min` : 'every';
  }
  if (schedule.kind === 'at') return schedule.at ? `once at ${schedule.at}` : 'once';
  return 'unknown';
}

async function fetchTasksFromPlugin(): Promise<any[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const url = new URL('/clawscope/cron?includeDisabled=true', pluginBaseUrl).toString();
    const resp = await fetch(url, { headers: { 'Accept': 'application/json' }, signal: controller.signal });
    if (!resp.ok) throw new Error(`plugin ${resp.status}`);
    const data = await resp.json();
    const jobs = Array.isArray(data) ? data : (data.jobs || []);
    return jobs.map((job: any) => ({
      id: job.id,
      name: job.name,
      enabled: job.enabled !== false,
      schedule: formatSchedule(job.schedule),
      nextRun: job.nextRunAt || null,
      agentId: job.agentId || job.owner || null,
      kind: job.kind,
      description: job.description,
      payloadSummary: job.payloadSummary
    }));
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchSessionsFromPlugin(): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const url = new URL('/clawscope/sessions', pluginBaseUrl).toString();
    const resp = await fetch(url, { headers: { 'Accept': 'application/json' }, signal: controller.signal });
    if (!resp.ok) throw new Error(`plugin ${resp.status}`);
    return await resp.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchActivityFromPlugin(limit = 100): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const url = new URL('/clawscope/activity?limit=' + limit, pluginBaseUrl).toString();
    const resp = await fetch(url, { headers: { 'Accept': 'application/json' }, signal: controller.signal });
    if (!resp.ok) throw new Error(`plugin ${resp.status}`);
    return await resp.json();
  } finally {
    clearTimeout(timeout);
  }
}

const SETTINGS_PATH = process.env.CLAWSCOPE_SETTINGS_PATH || path.join(process.cwd(), 'clawscope.settings.json');

function loadLocalSettings(): any {
  try {
    if (!fs.existsSync(SETTINGS_PATH)) return {};
    const raw = fs.readFileSync(SETTINGS_PATH, 'utf8');
    return JSON.parse(raw || '{}');
  } catch {
    return {};
  }
}

function saveLocalSettings(data: any) {
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(data, null, 2), 'utf8');
}

const server = http.createServer(async (req, res) => {
  if (!req.url) {
    res.statusCode = 400;
    res.end('Missing URL');
    return;
  }

  const url = new URL(req.url, 'http://localhost');

  if (req.method === 'GET' && url.pathname === '/') {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(html);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/sessions') {
    const now = Date.now();
    if (lastSessionsJson && now - lastSessionsAt < SESSIONS_TTL_MS) {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(lastSessionsJson, null, 2));
      return;
    }

    try {
      const data = await fetchSessionsFromPlugin();
      lastSessionsJson = data;
      lastSessionsAt = now;
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(data, null, 2));
    } catch (err: any) {
      // Fallback to CLI
      try {
        const { stdout } = await exec('openclaw sessions --json', { cwd: process.cwd() });
        const cleanStdout = stdout.replace(/\x1b\[[0-9;]*m/g, '');
        const jsonStart = cleanStdout.search(/[\[{]/);
        const jsonStr = jsonStart >= 0 ? cleanStdout.slice(jsonStart) : cleanStdout;
        const data = JSON.parse(jsonStr);
        lastSessionsJson = data;
        lastSessionsAt = now;
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(data, null, 2));
      } catch (e: any) {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify([], null, 2));
      }
    }
    return;
  }

  if (req.method === 'GET' && url.pathname === '/memory/search') {
    const q = url.searchParams.get('q') || '';
    const mode = (url.searchParams.get('mode') as SearchMode | null) || 'hybrid';
    const limit = parseInt(url.searchParams.get('limit') || '20', 10);

    try {
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

  if (req.method === 'GET' && url.pathname === '/memory/categories') {
    try {
      if (!backend.getCategories) {
        res.statusCode = 501;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Categories not supported by backend' }));
        return;
      }
      const categories = await backend.getCategories();
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(categories, null, 2));
    } catch (err: any) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: err?.message || 'failed to get categories' }));
    }
    return;
  }

  if (req.method === 'GET' && url.pathname === '/activity') {
    try {
      let data: any = null;
      try {
        data = await fetchActivityFromPlugin(200);
      } catch (e: any) {
        data = null;
      }

      let lines: string[] = [];
      if (Array.isArray(data)) {
        lines = data.map((x) => (typeof x === 'string' ? x : JSON.stringify(x)));
      } else if (data && Array.isArray(data.lines)) {
        lines = data.lines;
      } else if (data && Array.isArray(data.logs)) {
        lines = data.logs.map((x: any) => (typeof x === 'string' ? x : JSON.stringify(x)));
      }

      // Fallback to CLI if plugin not reachable or empty
      if (!lines.length) {
        let stdout = '';
        try {
          const result = await exec('openclaw logs --json --limit 100', { cwd: process.cwd(), timeout: 12000 });
          stdout = result.stdout;
        } catch (e: any) {
          stdout = e?.stdout || '';
        }
        const cleanStdout = stdout.replace(/\x1b\[[0-9;]*m/g, '');
        lines = cleanStdout.split('\n').filter(Boolean);
      }

      // Strip ANSI and parse JSON lines
      const events: any[] = [];
      for (const line of lines) {
        if (!line.trim() || !line.startsWith('{')) continue;
        try {
          const parsed = JSON.parse(line);
          if (parsed.type && parsed.type !== 'log') continue;
          const subsystem = parsed.subsystem || '';
          const message = parsed.message || '';
          const level = parsed.level || 'debug';

          if (subsystem === 'agent/embedded' && message.includes('tool ')) {
            const toolMatch = message.match(/tool=(\w+)/);
            const actionMatch = message.match(/tool (start|end)/);
            if (toolMatch && actionMatch) {
              events.push({
                id: parsed.time + '-' + toolMatch[1],
                ts: parsed.time,
                kind: 'tool',
                summary: `${actionMatch[1] === 'start' ? '▶' : '✓'} ${toolMatch[1]}`,
                level
              });
            }
          } else if (subsystem === 'diagnostic' && message.includes('session state')) {
            const stateMatch = message.match(/new=(\w+)/);
            if (stateMatch) {
              events.push({
                id: parsed.time + '-session',
                ts: parsed.time,
                kind: 'session',
                summary: `Session ${stateMatch[1]}`,
                level
              });
            }
          } else if (subsystem === 'cron' || message.includes('cron')) {
            events.push({
              id: parsed.time + '-cron',
              ts: parsed.time,
              kind: 'cron',
              summary: message.slice(0, 60),
              level
            });
          } else if ((level === 'warn' || level === 'error') && !message.includes('Config was last written by a newer OpenClaw')) {
            events.push({
              id: parsed.time + '-warn',
              ts: parsed.time,
              kind: 'alert',
              summary: message.slice(0, 80),
              level
            });
          }
        } catch {}
      }

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(events.slice(-30).reverse(), null, 2));
    } catch (err: any) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: err?.message || 'activity failed' }));
    }
    return;
  }

  if (req.method === 'GET' && url.pathname === '/tasks') {
    try {
      // Prefer plugin endpoint (OpenClaw HTTP) if available
      const items = await fetchTasksFromPlugin();
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(items, null, 2));
    } catch (err: any) {
      // Fallback to CLI if plugin not reachable
      try {
        const { stdout } = await exec('openclaw cron list --json', { cwd: process.cwd() });
        const cleanStdout = stdout.replace(/\x1b\[[0-9;]*m/g, '');
        const jsonStart = cleanStdout.search(/[\[{]/);
        const jsonStr = jsonStart >= 0 ? cleanStdout.slice(jsonStart) : cleanStdout;
        const data = JSON.parse(jsonStr);
        const jobs = data.jobs || [];
        const items = jobs.map((job: any) => ({
          id: job.id,
          name: job.name,
          enabled: job.enabled !== false,
          schedule: job.schedule?.kind === 'cron' ? job.schedule.expr :
                    job.schedule?.kind === 'every' ? `every ${Math.round((job.schedule.everyMs || 0) / 60000)}min` :
                    job.schedule?.kind === 'at' ? `once at ${job.schedule.at}` : 'unknown',
          nextRun: job.nextRunAt || null,
          agentId: job.agentId
        }));
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(items, null, 2));
      } catch (e: any) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: e?.message || err?.message || 'tasks failed' }));
      }
    }
    return;
  }

  // Timeline page (HTML)
  if (req.method === 'GET' && url.pathname === '/timeline') {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(timelineHtml);
    return;
  }

  // Timeline data endpoint (JSON with since filter)
  if (req.method === 'GET' && url.pathname === '/timeline-data') {
    const since = url.searchParams.get('since') || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const limit = parseInt(url.searchParams.get('limit') || '50', 10); // Reduced from 100
    
    try {
      let stdout = '';
      try {
        const result = await exec('openclaw logs --json --limit ' + limit, { cwd: process.cwd(), timeout: 15000 });
        stdout = result.stdout;
      } catch (e: any) {
        // exec throws on stderr, but stdout may still be valid
        stdout = e?.stdout || '';
      }
      const cleanStdout = stdout.replace(/\x1b\[[0-9;]*m/g, '');
      const lines = cleanStdout.split('\n');
      const events: any[] = [];
      const sinceTs = new Date(since).getTime();
      
      for (const line of lines) {
        if (!line.trim() || !line.startsWith('{')) continue;
        try {
          const parsed = JSON.parse(line);
          if (parsed.type !== 'log') continue;
          
          const eventTs = new Date(parsed.time).getTime();
          if (eventTs < sinceTs) continue; // Skip events before 'since'
          
          const subsystem = parsed.subsystem || '';
          const message = parsed.message || '';
          const level = parsed.level || 'debug';
          
          // Tool usage
          if (subsystem === 'agent/embedded' && message.includes('tool ')) {
            const toolMatch = message.match(/tool=(\w+)/);
            const actionMatch = message.match(/tool (start|end)/);
            if (toolMatch && actionMatch) {
              events.push({
                id: parsed.time + '-' + toolMatch[1],
                ts: parsed.time,
                kind: 'tool',
                summary: `${actionMatch[1] === 'start' ? '▶' : '✓'} ${toolMatch[1]}`,
                level: level
              });
            }
          }
          // Session state changes
          else if (subsystem === 'diagnostic' && message.includes('session state')) {
            const stateMatch = message.match(/new=(\w+)/);
            if (stateMatch) {
              events.push({
                id: parsed.time + '-session',
                ts: parsed.time,
                kind: 'session',
                summary: `Session ${stateMatch[1]}`,
                level: level
              });
            }
          }
          // Memory operations
          else if (subsystem === 'memory' || message.includes('memory') || message.includes('Memory')) {
            events.push({
              id: parsed.time + '-memory',
              ts: parsed.time,
              kind: 'memory',
              summary: message.slice(0, 80),
              level: level
            });
          }
          // Cron jobs
          else if (subsystem === 'cron' || message.includes('cron')) {
            events.push({
              id: parsed.time + '-cron',
              ts: parsed.time,
              kind: 'cron',
              summary: message.slice(0, 60),
              level: level
            });
          }
          // Warnings and errors (skip version mismatch)
          else if ((level === 'warn' || level === 'error') && !message.includes('Config was last written by a newer OpenClaw')) {
            events.push({
              id: parsed.time + '-alert',
              ts: parsed.time,
              kind: 'alert',
              summary: message.slice(0, 80),
              level: level
            });
          }
        } catch {}
      }
      
      // Sort by timestamp descending
      events.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
      
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(events, null, 2));
    } catch (err: any) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: err?.message || 'timeline-data failed' }));
    }
    return;
  }

  // Graph page (HTML)
  if (req.method === 'GET' && url.pathname === '/graph') {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(graphHtml);
    return;
  }

  // Graph data endpoint (JSON)
  if (req.method === 'GET' && url.pathname === '/graph-data') {
    const entity = url.searchParams.get('entity') || undefined;
    const minConfidence = parseFloat(url.searchParams.get('minConfidence') || '0');
    const limit = parseInt(url.searchParams.get('limit') || '200', 10);
    
    try {
      const dbPath = path.join(os.homedir(), '.openclaw', 'memory', 'offline.sqlite');
      const db = new Database(dbPath);
      db.pragma('journal_mode = WAL');
      
      const graphData = exportGraphJson(db, { entity, minConfidence, limit });
      const stats = getGraphStats(db);
      
      db.close();
      
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ...graphData, stats }, null, 2));
    } catch (err: any) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: err?.message || 'graph-data failed' }));
    }
    return;
  }

  // Settings page
  if (req.method === 'GET' && url.pathname === '/settings') {
    const settingsHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>OpenClaw ClawScope – Settings</title>
  <style>${sharedStyles}
    .settings-grid { display: grid; gap: 1rem; max-width: 800px; }
    .settings-card { background: #111827; border: 1px solid #1f2937; border-radius: 0.5rem; padding: 1rem; }
    .settings-card h3 { margin: 0 0 0.75rem; font-size: 0.95rem; color: #e5e7eb; display: flex; align-items: center; gap: 0.5rem; }
    .settings-card p { margin: 0 0 0.5rem; font-size: 0.85rem; color: #9ca3af; }
    .field-row { display: flex; flex-direction: column; gap: 0.35rem; margin: 0.4rem 0; }
    label { font-size: 0.8rem; color: #9ca3af; }
    select, input[type="text"] { padding: 0.4rem 0.6rem; border-radius: 0.375rem; border: 1px solid #374151; background: #0b1120; color: #e5e7eb; font-size: 0.85rem; }
    .btn { background: #111827; border: 1px solid #374151; color: #e5e7eb; padding: 0.45rem 0.8rem; border-radius: 0.375rem; cursor: pointer; font-size: 0.8rem; }
    .btn:hover { background: #1f2937; }
    .btn-primary { background: #2563eb; border-color: #2563eb; }
    .btn-primary:hover { background: #1d4ed8; }
    .hint { font-size: 0.75rem; color: #6b7280; }
    .status-pill { display:inline-block; padding:0.2rem 0.5rem; border-radius:999px; font-size:0.7rem; }
    .status-ok { background: rgba(34,197,94,0.15); color:#22c55e; border:1px solid rgba(34,197,94,0.3); }
    .status-warn { background: rgba(245,158,11,0.15); color:#f59e0b; border:1px solid rgba(245,158,11,0.3); }
    .config-block { background: #020617; border-radius: 0.375rem; padding: 0.75rem; margin-top: 0.5rem; }
    pre { margin: 0; font-size: 0.75rem; color: #9ca3af; white-space: pre-wrap; }
  </style>
</head>
<body>
  <header>
    <h1>⚙️ Settings</h1>
    <nav style="display:flex;gap:0.75rem;align-items:center;">
      <a href="/" style="color:#9ca3af;text-decoration:none;padding:0.25rem 0.5rem;font-size:0.85rem;">🔍 Search</a>
      <a href="/timeline" style="color:#9ca3af;text-decoration:none;padding:0.25rem 0.5rem;font-size:0.85rem;">📅 Timeline</a>
      <a href="/graph" style="color:#9ca3af;text-decoration:none;padding:0.25rem 0.5rem;font-size:0.85rem;">🕸️ Graph</a>
      <a href="/settings" style="color:#e5e7eb;text-decoration:none;background:#111827;padding:0.25rem 0.5rem;border-radius:0.25rem;font-size:0.85rem;">⚙️ Settings</a>
      <span style="font-size:0.75rem;color:#6b7280;margin-left:0.5rem;">ClawScope</span>
    </nav>
  </header>
  <div class="health-bar">
    <span class="health-dot ok"></span>
    <span>Local ClawScope settings (no OpenClaw restart)</span>
  </div>
  <main>
    <div class="settings-grid">
      <div class="settings-card">
        <h3>🧠 Fact Extraction Mode</h3>
        <p>Controls how facts are extracted from captured messages for the Knowledge Graph.</p>
        <div class="field-row">
          <label for="extractionMode">extractionMode</label>
          <select id="extractionMode">
            <option value="simple">simple (regex)</option>
            <option value="ner">ner (BERT)</option>
            <option value="hybrid">hybrid (simple + ner)</option>
          </select>
          <div class="hint">Saved locally for ClawScope only.</div>
        </div>
      </div>

      <div class="settings-card">
        <h3>🔍 Search Mode</h3>
        <p>Controls how memory search works.</p>
        <div class="field-row">
          <label for="searchMode">mode</label>
          <select id="searchMode">
            <option value="lexical">lexical</option>
            <option value="hybrid">hybrid</option>
          </select>
        </div>
        <div class="field-row">
          <label for="topK">topK</label>
          <input id="topK" type="text" placeholder="e.g. 5" />
        </div>
      </div>

      <div class="settings-card">
        <h3>💾 Save</h3>
        <p>Persist these settings to <code>clawscope.settings.json</code>.</p>
        <button class="btn btn-primary" id="saveBtn">Save settings</button>
        <span id="saveStatus" class="status-pill status-warn" style="margin-left:0.5rem; display:none;">…</span>
      </div>

      <div class="settings-card">
        <h3>📊 Current Status</h3>
        <p>Loaded from memory database.</p>
        <div id="status-info" class="config-block">
          <pre id="status-text">Loading...</pre>
        </div>
      </div>
    </div>
  </main>
  <script>
    async function loadSettings() {
      const res = await fetch('/settings/config');
      const data = await res.json();
      document.getElementById('extractionMode').value = data.extractionMode || 'simple';
      document.getElementById('searchMode').value = data.mode || 'hybrid';
      document.getElementById('topK').value = data.topK || '';
    }

    async function saveSettings() {
      const payload = {
        extractionMode: document.getElementById('extractionMode').value,
        mode: document.getElementById('searchMode').value,
        topK: document.getElementById('topK').value ? parseInt(document.getElementById('topK').value, 10) : undefined
      };
      const res = await fetch('/settings/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const status = document.getElementById('saveStatus');
      status.style.display = 'inline-block';
      if (res.ok) {
        status.textContent = 'Saved';
        status.className = 'status-pill status-ok';
      } else {
        status.textContent = 'Error';
        status.className = 'status-pill status-warn';
      }
      setTimeout(() => { status.style.display = 'none'; }, 2000);
    }

    document.getElementById('saveBtn').addEventListener('click', saveSettings);

    (async () => {
      try {
        await loadSettings();
        const res = await fetch('/settings/status');
        const data = await res.json();
        document.getElementById('status-text').textContent = JSON.stringify(data, null, 2);
      } catch (err) {
        document.getElementById('status-text').textContent = 'Error: ' + err.message;
      }
    })();
  </script>
</body>
</html>`;
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(settingsHtml);
    return;
  }

  // Settings config API (local)
  if (req.method === 'GET' && url.pathname === '/settings/config') {
    const cfg = loadLocalSettings();
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(cfg, null, 2));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/settings/save') {
    try {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        const data = body ? JSON.parse(body) : {};
        saveLocalSettings(data);
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: true }));
      });
    } catch (err: any) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: err?.message || 'save failed' }));
    }
    return;
  }

  // Settings status API
  if (req.method === 'GET' && url.pathname === '/settings/status') {
    try {
      const dbPath = path.join(os.homedir(), '.openclaw', 'memory', 'offline.sqlite');
      const db = new Database(dbPath);
      db.pragma('journal_mode = WAL');
      
      const stats = getGraphStats(db);
      const factsCount = db.prepare('SELECT COUNT(*) as count FROM facts').get() as { count: number };
      const itemsCount = db.prepare('SELECT COUNT(*) as count FROM items').get() as { count: number };
      
      db.close();

      const cfg = loadLocalSettings();
      
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        memory: {
          items: itemsCount.count,
          facts: factsCount.count,
        },
        graph: stats,
        settings: cfg,
      }, null, 2));
    } catch (err: any) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: err?.message || 'status failed' }));
    }
    return;
  }

  res.statusCode = 404;
  res.end('Not found');
});

export function startFrontendServer(port = 3101, host = '0.0.0.0') {
  server.listen(port, host, () => {
    console.log(`ClawScope UI listening on http://${host}:${port}`);
  });
}

startFrontendServer();
