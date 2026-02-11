// src/search.ts
// Abstraction layer for global search, independent from the actual backend

export type SearchMode = 'lexical' | 'semantic' | 'hybrid';

export type SearchRequest = {
  query: string;
  mode?: SearchMode;   // default: 'hybrid'
  limit?: number;      // default: 20
  k?: number;          // default: 80
  kinds?: string[];    // e.g. ['memory', 'doc'] – v1: ['memory']
  sources?: string[];  // e.g. ['whatsapp', 'github']
};

export type SearchItem = {
  id: string;
  kind: string;        // 'memory' | 'doc' | 'convo' | ...
  source?: string;
  title?: string;
  snippet: string;
  score: number;
  score_fts?: number;
  score_embed?: number;
  created_at?: string; // ISO
  payload?: any;
};

export interface SearchBackend {
  search(req: SearchRequest): Promise<SearchItem[]>;
  getCategories?(): Promise<{ tag: string; count: number }[]>;
}

/**
 * Placeholder implementation used while OpenClaw offline-sqlite backend
 * is not yet wired. This lets us build the UI + HTTP API without depending
 * on the final plugin integration.
 */
export class InMemorySearchBackend implements SearchBackend {
  private items: SearchItem[] = [];

  constructor(seed?: SearchItem[]) {
    if (seed) this.items = seed;
  }

  add(item: SearchItem) {
    this.items.push(item);
  }

  async search(req: SearchRequest): Promise<SearchItem[]> {
    const { query, limit = 20 } = req;
    const q = query.toLowerCase();

    const filtered = this.items.filter((item) => {
      const haystack = (item.title ?? '') + ' ' + item.snippet;
      return haystack.toLowerCase().includes(q);
    });

    // Simple scoring: count occurrences in title+snippet
    const scored = filtered.map((item) => {
      const haystack = (item.title ?? '') + ' ' + item.snippet;
      const occurrences = (haystack.toLowerCase().match(new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
      return {
        ...item,
        score: occurrences || 1,
      } as SearchItem;
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }
}
