// What the Dashboard remembers on this PC: the layout, and (only while learned ordering is on)
// how often each card was opened. Nothing else, and nothing leaves the PC. Turning learning off
// or pressing "Forget" clears the counts.
import { LAYOUTS, type LayoutId } from "./store";

const LAYOUT_KEY = "lens.dashboard.layout.v1";
const OPENS_KEY = "lens.dashboard.opens.v1";
/** Keep at most this many cards' counts, so the store can't grow without bound. */
export const MAX_OPENS = 200;

const ls = (): Storage | null => {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
};

export function readLayout(): LayoutId {
  const v = ls()?.getItem(LAYOUT_KEY);
  return LAYOUTS.some((l) => l.id === v) ? (v as LayoutId) : "glance";
}

export function writeLayout(id: LayoutId): void {
  try {
    ls()?.setItem(LAYOUT_KEY, id);
  } catch {
    /* storage full or blocked: the layout just isn't remembered */
  }
}

export function readOpens(): Record<string, number> {
  try {
    const v = JSON.parse(ls()?.getItem(OPENS_KEY) ?? "{}");
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    const out: Record<string, number> = {};
    for (const [k, n] of Object.entries(v)) if (typeof n === "number" && n > 0 && Number.isFinite(n)) out[k] = Math.floor(n);
    return out;
  } catch {
    return {};
  }
}

/** Saves the counts, keeping only the most-opened MAX_OPENS cards. */
export function writeOpens(opens: Record<string, number>): void {
  const top = Object.entries(opens)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_OPENS);
  try {
    if (top.length === 0) ls()?.removeItem(OPENS_KEY);
    else ls()?.setItem(OPENS_KEY, JSON.stringify(Object.fromEntries(top)));
  } catch {
    /* not remembered */
  }
}

export function clearOpens(): void {
  try {
    ls()?.removeItem(OPENS_KEY);
  } catch {
    /* nothing to clear */
  }
}
