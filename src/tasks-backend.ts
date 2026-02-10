// src/tasks-backend.ts
// Minimal stub backend for Mission Control scheduled tasks / calendar view.

export type TaskKind = 'cron_job' | 'reminder' | 'heartbeat';

export interface ScheduledTask {
  id: string;
  kind: TaskKind;
  name: string;
  nextRunAt: string | null; // ISO, null if one-shot already executed
  schedule: string; // human or cron description
  active: boolean;
  source: string; // e.g. 'cron', 'system', 'user'
  owner?: string;  // who created/owns the task (gateway, plugin, user)
  description?: string; // human-readable description of what this task does
}

export interface TaskBackend {
  listTasks(): Promise<ScheduledTask[]>;
}

export class InMemoryTaskBackend implements TaskBackend {
  private tasks: ScheduledTask[];

  constructor(seed?: ScheduledTask[]) {
    this.tasks = seed && seed.length ? seed : this.defaultSeed();
  }

  // TODO: replace this stub with a backend that calls the real OpenClaw cron API
  // and maps cron jobs -> ScheduledTask. For now, we keep a small seed snapshot
  // so that the UI can be exercised.
  private defaultSeed(): ScheduledTask[] {
    const now = Date.now();
    const iso = (deltaMs: number) => new Date(now + deltaMs).toISOString();

    return [
      {
        id: 't1',
        kind: 'heartbeat',
        name: 'HEARTBEAT main session',
        nextRunAt: iso(1000 * 60 * 10),
        schedule: 'every ~10 minutes (gateway heartbeat)',
        active: true,
        source: 'system',
        owner: 'gateway',
        description: 'Execute HEARTBEAT.md for the main session (Moltbook checks, comms, and time-based reports).',
      },
      {
        id: 't2',
        kind: 'cron_job',
        name: 'Moltbook status check',
        nextRunAt: iso(1000 * 60 * 30),
        schedule: '*/30 * * * *',
        active: true,
        source: 'cron',
        owner: 'moltbook-sre',
        description: 'Ping Moltbook API, update status, and log availability / latency.',
      },
      {
        id: 't3',
        kind: 'reminder',
        name: '[RAPPORT] openclaw-mission-control – search backend',
        nextRunAt: null,
        schedule: 'one-shot – executed at 08:00 today',
        active: false,
        source: 'cron',
        owner: 'user',
        description: 'One-shot report reminder for openclaw-mission-control (search backend status).',
      },
    ];
  }

  async listTasks(): Promise<ScheduledTask[]> {
    return this.tasks.slice();
  }
}
