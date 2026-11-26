// Split view, the UI side: the same layout maths as the core (model.rs split_rects), where a
// dragged tab lands, and the divider. Pure, tested in src/__tests__/browserSplit.test.ts.
import type { BrowserState, Split } from "./api";

export const SPLIT_MIN = 0.2;
export const SPLIT_MAX = 0.8;
/** Logical px between the two pages; the frame draws the divider here. */
export const SPLIT_GAP = 6;

export interface Rect { x: number; y: number; w: number; h: number }

export function clampRatio(r: number): number {
  return Number.isFinite(r) ? Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, r)) : 0.5;
}

/** Mirrors `model::split_rects` exactly (whole pixels, gap between, right edge reaches the end). */
export function splitRects(area: Rect, ratio: number): [Rect, Rect] {
  const r = clampRatio(ratio);
  const usable = Math.max(2, area.w - SPLIT_GAP);
  const lw = Math.max(1, Math.round(usable * r));
  const rx = Math.round(area.x + lw + SPLIT_GAP);
  const rw = Math.max(1, area.x + area.w - rx);
  const h = Math.max(1, area.h);
  return [{ x: area.x, y: area.y, w: lw, h }, { x: rx, y: area.y, w: rw, h }];
}

export function splitOf(s: BrowserState | null | undefined, tab: string | null | undefined): Split | null {
  if (!s || !tab) return null;
  return (s.splits ?? []).find((x) => x.left === tab || x.right === tab) ?? null;
}

export function partnerOf(s: BrowserState | null | undefined, tab: string | null | undefined): string | null {
  const sp = splitOf(s, tab);
  return sp ? (sp.left === tab ? sp.right : sp.left) : null;
}

/** Which half of the page a dragged tab is over. */
export function dropSide(clientX: number, area: Rect): "left" | "right" {
  return clientX < area.x + area.w / 2 ? "left" : "right";
}

/** The pair to create when `dragged` is dropped on `side` of the page showing `active`. */
export function pairFor(side: "left" | "right", active: string, dragged: string): { left: string; right: string } | null {
  if (!active || !dragged || active === dragged) return null;
  return side === "left" ? { left: dragged, right: active } : { left: active, right: dragged };
}

/** The ratio for the divider dragged to `clientX` (centre of the gap under the pointer). */
export function ratioAt(clientX: number, area: Rect): number {
  const usable = Math.max(2, area.w - SPLIT_GAP);
  return clampRatio((clientX - area.x - SPLIT_GAP / 2) / usable);
}

/** Keyboard on the divider: arrows move it 2 %, Home/End to the limits, 5 (or =) centres it. */
export function ratioKey(key: string, ratio: number): number | null {
  switch (key) {
    case "ArrowLeft": return clampRatio(ratio - 0.02);
    case "ArrowRight": return clampRatio(ratio + 0.02);
    case "Home": return SPLIT_MIN;
    case "End": return SPLIT_MAX;
    case "5": case "=": return 0.5;
    default: return null;
  }
}
