// Lesson completion conditions. A tiny, safe expression language (no eval):
//
//   config.dock.style == slim
//   config.ai.enabled == true && ui.tab == ai
//   config.voice exists
//   ui.surface != settings || event:palette-opened
//   event:command-intent
//   true
//
// Paths start at config, ui or wallpaper; values are bare words, numbers, true/false or "quoted".
// `&&` binds tighter than `||`. Unknown paths are undefined, so `x == y` is simply false.
import type { GuideState } from "./types";

export type Value = string | number | boolean | null | undefined;

const ROOTS = new Set(["config", "ui", "wallpaper"]);

export function resolvePath(state: GuideState & { wallpaper?: unknown }, path: string): unknown {
  const parts = path.split(".");
  if (!ROOTS.has(parts[0])) throw new Error(`unknown root "${parts[0]}" in ${path}`);
  let cur: unknown = (state as unknown as Record<string, unknown>)[parts[0]];
  for (const p of parts.slice(1)) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

function parseValue(raw: string): Value {
  const t = raw.trim();
  if (/^".*"$/.test(t) || /^'.*'$/.test(t)) return t.slice(1, -1);
  if (t === "true") return true;
  if (t === "false") return false;
  if (t === "null") return null;
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  return t;
}

function compare(a: unknown, op: string, b: Value): boolean {
  switch (op) {
    case "==":
      return a === b || (typeof a === "string" && typeof b === "string" && a.toLowerCase() === b.toLowerCase());
    case "!=":
      return !compare(a, "==", b);
    case ">":
      return typeof a === "number" && typeof b === "number" && a > b;
    case "<":
      return typeof a === "number" && typeof b === "number" && a < b;
    case ">=":
      return typeof a === "number" && typeof b === "number" && a >= b;
    case "<=":
      return typeof a === "number" && typeof b === "number" && a <= b;
  }
  throw new Error(`unknown operator ${op}`);
}

function evalTerm(term: string, state: GuideState): boolean {
  const t = term.trim();
  if (!t) throw new Error("empty condition");
  if (t === "true") return true;
  if (t === "false") return false;
  const ev = t.match(/^event:([a-z0-9-]+)$/);
  if (ev) return state.events.has(ev[1]);
  const ex = t.match(/^([a-zA-Z0-9_.]+)\s+exists$/);
  if (ex) {
    const v = resolvePath(state, ex[1]);
    return v !== undefined && v !== null;
  }
  const cmp = t.match(/^([a-zA-Z0-9_.]+)\s*(==|!=|>=|<=|>|<)\s*(.+)$/);
  if (cmp) return compare(resolvePath(state, cmp[1]), cmp[2], parseValue(cmp[3]));
  throw new Error(`can't read condition "${t}"`);
}

/** Evaluate a condition. Throws on malformed input (lesson files are validated in tests). */
export function evaluate(expr: string, state: GuideState): boolean {
  return expr.split("||").some((alt) => alt.split("&&").every((term) => evalTerm(term, state)));
}

/** Same as evaluate, but a malformed or failing condition just reads as "not done yet". */
export function safeEvaluate(expr: string | null | undefined, state: GuideState): boolean {
  if (!expr) return false;
  try {
    return evaluate(expr, state);
  } catch {
    return false;
  }
}

/** Throws with a readable message if the expression can't be parsed. Used by tests. */
export function validate(expr: string): void {
  const probe: GuideState = { config: {}, ui: {}, events: new Set() };
  evaluate(expr, probe);
}
