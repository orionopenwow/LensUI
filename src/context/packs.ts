// Context packs, frontend helpers: budget meter, trim plan (mirrors shelf/packs.rs plan_trim),
// local auto-trim, and the "Send to Claude" request. Pure where possible so it tests under bun.
import type { AiRequest } from "../ai/contract";
import type { PackView, TrimStep } from "./contract";

export const TRIM_FLOOR_TOKENS = 64;
export const BUDGET_PRESETS = [4_000, 8_000, 16_000, 24_000, 32_000, 64_000, 128_000, 200_000];

/** Same rule as Rust `plan_trim`: one per-item cap so the pack fits; only larger items shrink. */
export function planTrim(items: { id: string; tokens: number }[], budget: number): TrimStep[] {
  const total = items.reduce((s, i) => s + i.tokens, 0);
  if (total <= budget || !items.length) return [];
  const fits = (cap: number) => items.reduce((s, i) => s + Math.min(i.tokens, cap), 0) <= budget;
  let cap = TRIM_FLOOR_TOKENS;
  if (fits(TRIM_FLOOR_TOKENS)) {
    let lo = TRIM_FLOOR_TOKENS;
    let hi = Math.max(...items.map((i) => i.tokens));
    while (lo < hi) {
      const mid = lo + Math.ceil((hi - lo) / 2);
      if (fits(mid)) lo = mid;
      else hi = mid - 1;
    }
    cap = lo;
  }
  return items.filter((i) => i.tokens > cap).map((i) => ({ id: i.id, from_tokens: i.tokens, to_tokens: cap }));
}

export type BudgetLevel = "ok" | "near" | "over";

/** Meter colour: ok under 80 %, near up to 100 %, over beyond. */
export function budgetLevel(total: number, budget: number): BudgetLevel {
  if (total > budget) return "over";
  if (total >= budget * 0.8) return "near";
  return "ok";
}

export function formatTokens(n: number): string {
  if (n < 1000) return `${n}`;
  if (n < 10_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return `${Math.round(n / 1000)}k`;
}

export function meterPercent(total: number, budget: number): number {
  if (budget <= 0) return 100;
  return Math.max(0, Math.min(100, Math.round((total / budget) * 100)));
}

/** Total after trimming (what the pack will actually cost). */
export function trimmedTotal(view: Pick<PackView, "items" | "trim_plan">): number {
  const cap = new Map(view.trim_plan.map((s) => [s.id, s.to_tokens]));
  return view.items.filter((i) => !i.missing).reduce((s, i) => s + (cap.get(i.id) ?? i.approx_tokens), 0);
}

export type Summarise = (text: string, maxTokens: number) => Promise<string>;

/**
 * Auto-trim: summarise each over-budget item with the *local* model. Items whose summary fails
 * are left out of the result, so the backend falls back to `head_trim` for them.
 */
export async function autoTrim(
  plan: TrimStep[],
  textOf: (id: string) => Promise<string>,
  summarise: Summarise,
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const step of plan) {
    try {
      const text = await textOf(step.id);
      const s = (await summarise(text, step.to_tokens)).trim();
      if (s) out[step.id] = s;
    } catch {
      /* fall back to head_trim on the backend */
    }
  }
  return out;
}

export function summarisePrompt(maxTokens: number): string {
  const words = Math.max(30, Math.round(maxTokens * 0.7));
  return `Summarise this in at most ${words} words for use as context later. Keep names, numbers, dates, decisions and quotes that matter. Reply with the summary only.`;
}

/** "Send to Claude": the pack goes as Shelf context; Lens AI's privacy rules still apply (consent card). */
export function claudeRequest(packName: string, markdown: string, question?: string): AiRequest {
  return {
    prompt: question?.trim() || `Here is my context pack “${packName}”. Read it and tell me you're ready; then I'll ask questions about it.`,
    context: { shelf_text: markdown },
    provider: "claude",
    allow_tools: false,
  };
}

/** The chip Lens Command shows for the active pack. */
export function activePackChip(view: PackView | null): { label: string; detail: string; localOnly: boolean } | null {
  if (!view) return null;
  const n = view.items.filter((i) => !i.missing).length;
  return {
    label: `Pack · ${view.pack.name}`,
    detail: `${n} item${n === 1 ? "" : "s"} · ${formatTokens(trimmedTotal(view))} tok`,
    localOnly: view.local_only,
  };
}
