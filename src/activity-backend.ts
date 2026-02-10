// src/activity-backend.ts
// Minimal stub backend for Mission Control activity feed.

export type ActivityKind =
  | 'session_start'
  | 'session_end'
  | 'message'
  | 'tool'
  | 'cron'
  | 'system';

export interface ActivityEvent {
  id: string;
  ts: string; // ISO
  kind: ActivityKind;
  sessionKey?: string | null;
  agentId?: string | null;
  channel?: string | null;
  summary: string;
  details?: any;
}

export interface ActivityBackend {
  listActivity(params?: { since?: string; limit?: number }): Promise<ActivityEvent[]>;
}

// For now this is a stub with a few fake events for UI development.
export class InMemoryActivityBackend implements ActivityBackend {
  private events: ActivityEvent[];

  constructor(seed?: ActivityEvent[]) {
    this.events = (seed && seed.length ? seed : this.defaultSeed()).sort(
      (a, b) => (a.ts < b.ts ? 1 : -1), // newest first
    );
  }

  private defaultSeed(): ActivityEvent[] {
    const now = Date.now();
    const iso = (deltaMs: number) => new Date(now - deltaMs).toISOString();

    return [
      {
        id: 'e3',
        ts: iso(1_000 * 60 * 1),
        kind: 'tool',
        sessionKey: 'agent:main:main',
        agentId: 'main',
        channel: 'whatsapp',
        summary: 'Tool memory_recall used (offline sqlite)',
        details: { tool: 'memory_recall', query: 'offline memory', items: 3 },
      },
      {
        id: 'e2',
        ts: iso(1_000 * 60 * 3),
        kind: 'session_start',
        sessionKey: 'agent:main:main',
        agentId: 'main',
        channel: 'whatsapp',
        summary: 'Session main started (WhatsApp)',
        details: { model: 'gpt-5.1' },
      },
      {
        id: 'e1',
        ts: iso(1_000 * 60 * 10),
        kind: 'cron',
        sessionKey: null,
        agentId: 'heartbeat',
        channel: null,
        summary: 'Heartbeat check executed (Moltbook + comms)',
        details: { job: 'heartbeat-main' },
      },
    ];
  }

  async listActivity(params?: { since?: string; limit?: number }): Promise<ActivityEvent[]> {
    const limit = params?.limit ?? 20;
    let out = this.events;
    if (params?.since) {
      out = out.filter((e) => e.ts >= params.since!);
    }
    return out.slice(0, limit);
  }
}
