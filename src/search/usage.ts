import { invoke } from "@tauri-apps/api/core";
import type * as Gen from "../types/generated";

/**
 * Learned ranking. Every time the user picks a result we record its key and the query they typed,
 * in %APPDATA%\LensUI\search-usage.json (via record_search_usage_cmd). Results the user picks often,
 * and recently, rise; a result picked for the same query before rises most.
 */
export type UsageEntry = Gen.UsageEntry;
export type SearchUsage = Gen.SearchUsage;

let cache: SearchUsage = { items: {}, queries: {} };
let loaded = false;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

export function loadUsage(): Promise<void> {
  if (loaded) return Promise.resolve();
  if (!loading) {
    loading = invoke<SearchUsage>("get_search_usage_cmd")
      .then((u) => {
        if (u && typeof u === "object") cache = { items: u.items ?? {}, queries: u.queries ?? {} };
      })
      .catch(() => {})
      .finally(() => {
        loaded = true;
        listeners.forEach((fn) => fn());
      });
  }
  return loading;
}

export function onUsageLoaded(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getUsage(): SearchUsage {
  return cache;
}

/** Test seam. */
export function setUsageForTests(u: SearchUsage) {
  cache = u;
  loaded = true;
}

export function normalizeQueryKey(q: string): string {
  return q.trim().toLowerCase().slice(0, 24);
}

export function recordUsage(key: string, query: string) {
  const now = Math.floor(Date.now() / 1000);
  const e = cache.items[key] ?? { c: 0, t: 0 };
  cache.items[key] = { c: e.c + 1, t: now };
  const qk = normalizeQueryKey(query);
  if (qk) {
    const m = (cache.queries[qk] ??= {});
    m[key] = (m[key] ?? 0) + 1;
  }
  invoke("record_search_usage_cmd", { key, query }).catch(() => {});
}

/**
 * Boost for an item: frequency (log-scaled) decayed by age (half-life 14 days), plus a strong boost when
 * the same query (or a shorter prefix of it) led to this item before.
 */
export function usageBoost(key: string, query: string, usage: SearchUsage = cache, nowSec = Date.now() / 1000): number {
  let boost = 0;
  const e = usage.items[key];
  if (e && e.c > 0) {
    const ageDays = Math.max(0, (nowSec - e.t) / 86400);
    const decay = Math.pow(0.5, ageDays / 14);
    boost += Math.min(140, 45 * Math.log2(1 + e.c)) * (0.35 + 0.65 * decay);
  }
  const qk = normalizeQueryKey(query);
  if (qk) {
    for (let len = qk.length; len >= 1; len--) {
      const hits = usage.queries[qk.slice(0, len)]?.[key];
      if (hits) {
        // Exact query match counts fully; a shorter typed prefix counts less.
        boost += Math.min(260, 120 + 40 * Math.log2(1 + hits)) * (len / qk.length);
        break;
      }
    }
  }
  return boost;
}
