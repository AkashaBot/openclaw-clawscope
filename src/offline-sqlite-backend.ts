// src/offline-sqlite-backend.ts
// SearchBackend implementation backed by openclaw-memory-offline-sqlite core.

import os from 'node:os';
import path from 'node:path';

import {
  openDb,
  initSchema,
  searchItems,
  hybridSearch,
  type MemConfig,
  type LexicalResult,
  type HybridResult,
} from '@akashabot/openclaw-memory-offline-core';

import type { SearchBackend, SearchRequest, SearchItem, SearchMode } from './search.js';

export type OfflineBackendOptions = {
  dbPath?: string;
  defaultMode?: SearchMode;      // 'lexical' | 'semantic' | 'hybrid' (semantic maps to hybrid)
  defaultTopK?: number;          // final results count (limit)
  defaultCandidates?: number;    // pre‑selection size
  semanticWeight?: number;       // 0..1, weight of embedding score in hybrid

  // Embedding backend (Ollama) configuration – should match memory-offline-sqlite plugin.
  ollamaBaseUrl?: string;
  embeddingModel?: string;
  ollamaTimeoutMs?: number;
};

function defaultDbPath() {
  // Same default as the memory-offline-sqlite plugin: ~/.openclaw/memory/offline.sqlite
  const base = path.join(os.homedir(), '.openclaw', 'memory');
  return path.join(base, 'offline.sqlite');
}

export class OfflineSqliteSearchBackend implements SearchBackend {
  private cfg: Required<OfflineBackendOptions>;

  constructor(options: OfflineBackendOptions = {}) {
    this.cfg = {
      dbPath: options.dbPath ?? defaultDbPath(),
      defaultMode: options.defaultMode ?? 'hybrid',
      defaultTopK: options.defaultTopK ?? 20,
      defaultCandidates: options.defaultCandidates ?? 80,
      semanticWeight: options.semanticWeight ?? 0.7,
      ollamaBaseUrl: options.ollamaBaseUrl ?? 'http://127.0.0.1:11434',
      embeddingModel: options.embeddingModel ?? 'bge-m3',
      ollamaTimeoutMs: options.ollamaTimeoutMs ?? 3000,
    };
  }

  async search(req: SearchRequest): Promise<SearchItem[]> {
    const mode = (req.mode ?? this.cfg.defaultMode) as SearchMode;
    const limit = req.limit ?? this.cfg.defaultTopK;
    const candidates = req.k ?? this.cfg.defaultCandidates;
    const query = req.query.trim();

    if (!query) return [];

    const db = openDb(this.cfg.dbPath);
    initSchema(db);

    if (mode === 'lexical') {
      return this.searchLexical(db, query, limit);
    }

    // For now, "semantic" and "hybrid" both go through the hybridSearch helper.
    return this.searchHybrid(db, query, limit, candidates);
  }

  private async searchLexical(db: any, query: string, limit: number): Promise<SearchItem[]> {
    const res = searchItems(db, query, limit);
    const results = (res.results ?? []) as LexicalResult[];

    return results.map((r) => {
      const item = (r as any).item ?? (r as any);
      const text: string = String(item.text ?? '');

      return {
        id: String(item.id),
        kind: 'memory',
        source: item.source ?? 'openclaw',
        title: item.title ?? undefined,
        snippet: buildSnippet(text),
        score: (r as any).score ?? (r as any).lexicalScore ?? 0,
        score_fts: (r as any).lexicalScore ?? (r as any).score ?? undefined,
        score_embed: undefined,
        created_at: item.created_at ?? undefined,
        payload: {
          memory_id: item.id,
          text,
          tags: item.tags ?? null,
          source: item.source ?? null,
          source_id: item.source_id ?? null,
        },
      } satisfies SearchItem;
    });
  }

  private async searchHybrid(db: any, query: string, limit: number, candidates: number): Promise<SearchItem[]> {
    const memCfg: MemConfig = {
      dbPath: this.cfg.dbPath,
      ollamaBaseUrl: this.cfg.ollamaBaseUrl,
      embeddingModel: this.cfg.embeddingModel,
      ollamaTimeoutMs: this.cfg.ollamaTimeoutMs,
    };

    // Escape query via searchItems helper (same pattern as plugin recall())
    const escapedQuery = searchItems(db, query, 1).escapedQuery;
    const results = (await hybridSearch(db, memCfg, escapedQuery, {
      topK: limit,
      candidates,
      semanticWeight: this.cfg.semanticWeight,
    })) as HybridResult[];

    return results.map((r) => {
      const item = (r as any).item ?? (r as any);
      const text: string = String(item.text ?? '');

      return {
        id: String(item.id),
        kind: 'memory',
        source: item.source ?? 'openclaw',
        title: item.title ?? undefined,
        snippet: buildSnippet(text),
        score: (r as any).score ?? 0,
        score_fts: (r as any).lexicalScore ?? undefined,
        score_embed: (r as any).semanticScore ?? undefined,
        created_at: item.created_at ?? undefined,
        payload: {
          memory_id: item.id,
          text,
          tags: item.tags ?? null,
          source: item.source ?? null,
          source_id: item.source_id ?? null,
        },
      } satisfies SearchItem;
    });
  }
}

function buildSnippet(text: string, maxLen = 220): string {
  const singleLine = text.replace(/\s+/g, ' ').trim();
  if (singleLine.length <= maxLen) return singleLine;
  return singleLine.slice(0, maxLen) + '…';
}
