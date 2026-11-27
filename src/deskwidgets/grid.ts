// Desktop widget grid (docs/features/desktop-widgets.md). Pure: widgets live on a grid of square
// cells (small 1×1, medium 2×1, large 2×2), packed from the top-left down each column, the way
// the desktop fills on macOS. Positions the person chose are kept when they still fit; everything
// else flows into the first free spot. Cells are CSS pixels, so a higher display scaling simply
// gives fewer cells and the layout is clamped into them.

export type Size = "small" | "medium" | "large";
export const SIZES: readonly Size[] = ["small", "medium", "large"];
/** Width × height in cells. */
export const SPAN: Record<Size, readonly [number, number]> = { small: [1, 1], medium: [2, 1], large: [2, 2] };

export interface GridItem {
  id: string;
  kind: string;
  size: Size | string;
  /** Top-left cell; -1 = "first free spot". */
  col: number;
  row: number;
  params: Record<string, string>;
}

export interface Grid {
  cols: number;
  rows: number;
  /** Cell edge and gap, CSS px. */
  cell: number;
  gap: number;
  /** Where cell (0, 0) starts, CSS px from the window's top-left. */
  left: number;
  top: number;
}

export interface Placed extends GridItem {
  size: Size;
  col: number;
  row: number;
}

export interface LayoutResult {
  placed: Placed[];
  /** Widgets that don't fit on this monitor right now (kept, shown again when there's room). */
  overflow: string[];
}

export const CELL = 152;
export const GAP = 16;
export const MARGIN = 24;

export const sizeOf = (s: string): Size => (SIZES.includes(s as Size) ? (s as Size) : "small");
export const spanOf = (s: string) => SPAN[sizeOf(s)];

/** The grid for a window of `w` × `h` CSS px, keeping `topInset` free (the Top Bar). */
export function gridFor(w: number, h: number, opts: { topInset?: number; cell?: number; gap?: number; margin?: number } = {}): Grid {
  const cell = opts.cell ?? CELL;
  const gap = opts.gap ?? GAP;
  const margin = opts.margin ?? MARGIN;
  const top = margin + Math.max(0, opts.topInset ?? 0);
  const fit = (room: number) => (Number.isFinite(room) && room >= cell ? Math.floor((room + gap) / (cell + gap)) : 0);
  return { cols: fit(w - 2 * margin), rows: fit(h - top - margin), cell, gap, left: margin, top };
}

/** CSS rect of a widget at (col, row). */
export function rectOf(col: number, row: number, size: string, g: Grid) {
  const [sw, sh] = spanOf(size);
  return {
    x: g.left + col * (g.cell + g.gap),
    y: g.top + row * (g.cell + g.gap),
    w: sw * g.cell + (sw - 1) * g.gap,
    h: sh * g.cell + (sh - 1) * g.gap,
  };
}

export function fits(col: number, row: number, size: string, g: Grid): boolean {
  const [sw, sh] = spanOf(size);
  return Number.isInteger(col) && Number.isInteger(row) && col >= 0 && row >= 0 && col + sw <= g.cols && row + sh <= g.rows;
}

export function overlaps(a: { col: number; row: number; size: string }, b: { col: number; row: number; size: string }): boolean {
  const [aw, ah] = spanOf(a.size);
  const [bw, bh] = spanOf(b.size);
  return a.col < b.col + bw && b.col < a.col + aw && a.row < b.row + bh && b.row < a.row + ah;
}

/** First free spot for `size`, scanning down each column from the left. */
export function firstFree(taken: { col: number; row: number; size: string }[], size: string, g: Grid): { col: number; row: number } | null {
  for (let col = 0; col < g.cols; col++) {
    for (let row = 0; row < g.rows; row++) {
      if (fits(col, row, size, g) && !taken.some((t) => overlaps({ col, row, size }, t))) return { col, row };
    }
  }
  return null;
}

/** Places every widget: chosen spots first (in order), then the rest top-left down. */
export function layout(items: GridItem[], g: Grid): LayoutResult {
  const placed: Placed[] = [];
  const pending: GridItem[] = [];
  for (const it of items) {
    const size = sizeOf(it.size);
    if (it.col >= 0 && it.row >= 0 && fits(it.col, it.row, size, g) && !placed.some((p) => overlaps({ ...it, size }, p))) placed.push({ ...it, size });
    else pending.push(it);
  }
  const overflow: string[] = [];
  for (const it of pending) {
    const size = sizeOf(it.size);
    const at = firstFree(placed, size, g);
    if (at) placed.push({ ...it, size, ...at });
    else overflow.push(it.id);
  }
  // Reading order of the input, so the page's list (and focus order) doesn't jump around.
  const order = new Map(items.map((it, i) => [it.id, i]));
  placed.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  return { placed, overflow };
}

/** Writes the resolved spots back, so the next layout is stable. Overflowing widgets keep -1. */
export function settle(items: GridItem[], g: Grid): GridItem[] {
  const { placed } = layout(items, g);
  const at = new Map(placed.map((p) => [p.id, p]));
  return items.map((it) => {
    const p = at.get(it.id);
    return p ? { ...it, size: p.size, col: p.col, row: p.row } : { ...it, size: sizeOf(it.size), col: -1, row: -1 };
  });
}

/** Moves a widget to (col, row); widgets in the way move to the next free spots. */
export function moveTo(items: GridItem[], id: string, col: number, row: number, g: Grid): GridItem[] {
  const me = items.find((i) => i.id === id);
  if (!me || !fits(col, row, me.size, g)) return settle(items, g);
  const target = { col, row, size: me.size };
  // The moved widget first, so it gets its spot; the ones it lands on lose theirs and reflow.
  const rest = settle(items, g).filter((i) => i.id !== id).map((i) => (i.col >= 0 && overlaps(i, target) ? { ...i, col: -1, row: -1 } : i));
  const moved = settle([{ ...me, col, row }, ...rest], g);
  const byId = new Map(moved.map((m) => [m.id, m]));
  return items.map((i) => byId.get(i.id)!);
}

/** Changes a widget's size; it keeps its spot when it still fits, and neighbours make room. */
export function resize(items: GridItem[], id: string, size: Size, g: Grid): GridItem[] {
  const me = items.find((i) => i.id === id);
  if (!me) return items;
  const settled = settle(items, g);
  const cur = settled.find((i) => i.id === id)!;
  if (cur.col >= 0 && fits(cur.col, cur.row, size, g)) return moveTo(settled.map((i) => (i.id === id ? { ...i, size } : i)), id, cur.col, cur.row, g);
  // Too big for its spot (at the right or bottom edge): the first spot where it fits.
  return settle(settled.map((i) => (i.id === id ? { ...i, size, col: -1, row: -1 } : i)), g);
}

let seq = 0;
export function newId(kind: string, now = Date.now()): string {
  seq = (seq + 1) % 1296;
  return `${kind.replace(/[^a-z0-9]/gi, "").slice(0, 12) || "w"}-${now.toString(36)}${seq.toString(36)}`;
}

/** Adds a widget at a chosen cell (a drop from the gallery) or the first free spot. */
export function addItem(items: GridItem[], item: Omit<GridItem, "col" | "row"> & { col?: number; row?: number }, g: Grid): GridItem[] {
  const next: GridItem = { ...item, size: sizeOf(item.size), col: item.col ?? -1, row: item.row ?? -1 };
  const all = [...settle(items, g), { ...next, col: -1, row: -1 }];
  return next.col >= 0 && next.row >= 0 && fits(next.col, next.row, next.size, g) ? moveTo(all, next.id, next.col, next.row, g) : settle(all, g);
}

export function removeItem(items: GridItem[], id: string): GridItem[] {
  return items.filter((i) => i.id !== id);
}

/** The cell a dragged widget's top-left snaps to, from its top-left in CSS px (clamped in). */
export function snapCell(x: number, y: number, size: string, g: Grid): { col: number; row: number } {
  const [sw, sh] = spanOf(size);
  const pitch = g.cell + g.gap;
  const col = Math.round((x - g.left) / pitch);
  const row = Math.round((y - g.top) / pitch);
  return { col: Math.max(0, Math.min(Math.max(0, g.cols - sw), col)), row: Math.max(0, Math.min(Math.max(0, g.rows - sh), row)) };
}

/** The cell under a point (for drops from the gallery), or null outside the grid. */
export function cellAt(x: number, y: number, g: Grid): { col: number; row: number } | null {
  const pitch = g.cell + g.gap;
  const col = Math.floor((x - g.left) / pitch);
  const row = Math.floor((y - g.top) / pitch);
  return col >= 0 && row >= 0 && col < g.cols && row < g.rows ? { col, row } : null;
}
