// Edge Shelf tab geometry (Dropover/Yoink-style): a thin tab on a screen edge that grows into a
// mini Shelf panel on hover or drag-over. Pure; tested.

export type Edge = "left" | "right" | "top" | "bottom";

export interface Rect { x: number; y: number; w: number; h: number }

export interface EdgeSettings {
  enabled: boolean;
  edge: Edge;
  /** Position along the edge, 0 (start) … 1 (end). */
  offset: number;
  /** Tab thickness and length in px (logical). */
  thickness: number;
  length: number;
  panel: { w: number; h: number };
  /** Hover delay before expanding (drag-over expands at once). */
  hoverMs: number;
}

export const DEFAULT_EDGE: EdgeSettings = {
  enabled: false,
  edge: "right",
  offset: 0.42,
  thickness: 6,
  length: 96,
  panel: { w: 300, h: 420 },
  hoverMs: 220,
};

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));

/** The collapsed tab, flush with the work-area edge. */
export function tabRect(area: Rect, s: EdgeSettings): Rect {
  const off = clamp(s.offset, 0, 1);
  if (s.edge === "left" || s.edge === "right") {
    const y = Math.round(area.y + clamp(off * area.h - s.length / 2, 0, area.h - s.length));
    const x = s.edge === "left" ? area.x : area.x + area.w - s.thickness;
    return { x, y, w: s.thickness, h: s.length };
  }
  const x = Math.round(area.x + clamp(off * area.w - s.length / 2, 0, area.w - s.length));
  const y = s.edge === "top" ? area.y : area.y + area.h - s.thickness;
  return { x, y, w: s.length, h: s.thickness };
}

/** The expanded panel: grows out of the tab, centred on it, kept inside the work area (8 px margin). */
export function panelRect(area: Rect, s: EdgeSettings, margin = 8): Rect {
  const t = tabRect(area, s);
  const { w, h } = s.panel;
  if (s.edge === "left" || s.edge === "right") {
    const y = clamp(t.y + t.h / 2 - h / 2, area.y + margin, area.y + area.h - h - margin);
    const x = s.edge === "left" ? area.x + margin : area.x + area.w - w - margin;
    return { x: Math.round(x), y: Math.round(y), w, h };
  }
  const x = clamp(t.x + t.w / 2 - w / 2, area.x + margin, area.x + area.w - w - margin);
  const y = s.edge === "top" ? area.y + margin : area.y + area.h - h - margin;
  return { x: Math.round(x), y: Math.round(y), w, h };
}

/** A slightly larger invisible hit zone so the tab is easy to reach (Fitts) without being wide. */
export function hitRect(area: Rect, s: EdgeSettings, slop = 10): Rect {
  const t = tabRect(area, s);
  if (s.edge === "left") return { x: t.x, y: t.y - slop, w: t.w + slop, h: t.h + 2 * slop };
  if (s.edge === "right") return { x: t.x - slop, y: t.y - slop, w: t.w + slop, h: t.h + 2 * slop };
  if (s.edge === "top") return { x: t.x - slop, y: t.y, w: t.w + 2 * slop, h: t.h + slop };
  return { x: t.x - slop, y: t.y - slop, w: t.w + 2 * slop, h: t.h + slop };
}

export const contains = (r: Rect, x: number, y: number) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;

/** Where along the edge a drag-to-move left the tab, as a 0..1 offset. */
export function offsetFromPoint(area: Rect, edge: Edge, x: number, y: number): number {
  const v = edge === "left" || edge === "right" ? (y - area.y) / area.h : (x - area.x) / area.w;
  return Math.round(clamp(v, 0.05, 0.95) * 100) / 100;
}

/** The tab hides while a fullscreen app or game is in front, and while dragging nothing over it
 *  when the user chose "only when dragging". */
export function tabVisible(s: EdgeSettings, fullscreen: boolean, onlyWhileDragging: boolean, dragging: boolean): boolean {
  if (!s.enabled || fullscreen) return false;
  return onlyWhileDragging ? dragging : true;
}
