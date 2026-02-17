// src/index.ts
// Main entry point for ClawScope - exports the full frontend server
// This ensures all routes (/sessions, /tasks, /activity, /timeline, /graph, etc.) are available

export { startFrontendServer, startFrontendServer as startServer } from './frontend.js';
