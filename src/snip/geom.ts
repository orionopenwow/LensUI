// Region maths for the selection overlay — mirrors src-tauri/src/snip/geom.rs.
// The overlay is one window over the whole virtual desktop, so CSS px ↔ physical px is linear.

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const right = (r: Rect) => r.x + r.w;
export const bottom = (r: Rect) => r.y + r.h;
export const area = (r: Rect) => (r.w <= 0 || r.h <= 0 ? 0 : r.w * r.h);
export const contains = (r: Rect, x: number, y: number) => x >= r.x && y >= r.y && x < right(r) && y < bottom(r);

/** The rect spanned by a drag from a to b (inclusive of both end pixels). */
export function normalize(ax: number, ay: number, bx: number, by: number): Rect {
  return { x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.abs(ax - bx) + 1, h: Math.abs(ay - by) + 1 };
}

/** CSS rect → physical rect, rounding outward so no selected pixel is lost. */
export function cssToPhysical(css: Rect, origin: { x: number; y: number }, dpr: number): Rect {
  const d = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
  const x0 = Math.floor(css.x * d);
  const y0 = Math.floor(css.y * d);
  const x1 = Math.ceil((css.x + Math.max(0, css.w)) * d);
  const y1 = Math.ceil((css.y + Math.max(0, css.h)) * d);
  return { x: origin.x + x0, y: origin.y + y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
}

export function physicalToCss(r: Rect, origin: { x: number; y: number }, dpr: number): Rect {
  const d = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
  return { x: (r.x - origin.x) / d, y: (r.y - origin.y) / d, w: r.w / d, h: r.h / d };
}

/** The smallest candidate containing the point (candidates top-most first; ties keep the first). */
export function snapTarget(candidates: Rect[], px: number, py: number, minSize = 4): Rect | null {
  let best: Rect | null = null;
  for (const c of candidates) {
    if (c.w < minSize || c.h < minSize || !contains(c, px, py)) continue;
    if (!best || area(c) < area(best)) best = c;
  }
  return best;
}

/** Moves each edge onto the nearest candidate edge within `threshold`. */
export function snapEdges(r: Rect, candidates: Rect[], threshold: number): Rect {
  const snap1 = (v: number, edges: number[]) => {
    let best = v;
    let dist = threshold + 1;
    for (const e of edges) {
      const d = Math.abs(e - v);
      if (d < dist) {
        dist = d;
        best = e;
      }
    }
    return best;
  };
  const xs = candidates.flatMap((c) => [c.x, right(c)]);
  const ys = candidates.flatMap((c) => [c.y, bottom(c)]);
  const l = snap1(r.x, xs);
  const t = snap1(r.y, ys);
  const rr = snap1(right(r), xs);
  const b = snap1(bottom(r), ys);
  if (rr <= l || b <= t) return r;
  return { x: l, y: t, w: rr - l, h: b - t };
}

export function intersect(a: Rect, b: Rect): Rect {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const r = Math.min(right(a), right(b));
  const bt = Math.min(bottom(a), bottom(b));
  return r <= x || bt <= y ? { x: 0, y: 0, w: 0, h: 0 } : { x, y, w: r - x, h: bt - y };
}

/** Bounding box of a freeform lasso (physical points). */
export function boundsOf(points: { x: number; y: number }[]): Rect | null {
  if (points.length < 3) return null;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const x = Math.floor(Math.min(...xs));
  const y = Math.floor(Math.min(...ys));
  return { x, y, w: Math.ceil(Math.max(...xs)) - x + 1, h: Math.ceil(Math.max(...ys)) - y + 1 };
}
