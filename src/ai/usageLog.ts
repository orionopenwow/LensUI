/**
 * A small local log of AI requests for the AI settings card: when, which provider/model, whether it left
 * the PC, and token counts. Never stores prompts, answers or context. Kept in local storage, capped.
 */
export interface UsageEntry {
  ts: number;
  provider: string;
  model: string;
  cloud: boolean;
  input?: number;
  output?: number;
  ok: boolean;
}

export const USAGE_KEY = "lens.ai.usage.v1";
export const USAGE_MAX = 50;

export function readUsage(): UsageEntry[] {
  try {
    const v = JSON.parse(localStorage.getItem(USAGE_KEY) || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function logUsage(e: UsageEntry) {
  try {
    localStorage.setItem(USAGE_KEY, JSON.stringify([e, ...readUsage()].slice(0, USAGE_MAX)));
  } catch {
    /* ignore */
  }
}

export function clearUsage() {
  try {
    localStorage.removeItem(USAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function usageTotals(list: UsageEntry[]): { requests: number; cloud: number; tokens: number } {
  return list.reduce(
    (t, e) => ({ requests: t.requests + 1, cloud: t.cloud + (e.cloud ? 1 : 0), tokens: t.tokens + (e.input ?? 0) + (e.output ?? 0) }),
    { requests: 0, cloud: 0, tokens: 0 }
  );
}
