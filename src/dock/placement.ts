/**
 * Where a Dock hover card goes so it stays inside the screen's usable area on every edge and in
 * every Dock style. Pure: positions are the card's CSS anchor (the card's CSS translates it by
 * -50% / -100% per edge, see DockSurface.css), sizes are its measured box.
 */
export type CardEdge = "bottom" | "top" | "left" | "right";

export interface CardPlacementInput {
  edge: CardEdge;
  /** Anchor from the icon: centre x for bottom/top, the icon's outer side for left/right. */
  x: number;
  /** Icon top (bottom edge), bottom (top edge) or centre y (left/right). */
  y: number;
  /** Measured card size (0 until known: a 248 × 160 guess is used). */
  w: number;
  h: number;
  /** The usable area: the Dock window's viewport less the Top Bar. */
  viewW: number;
  viewH: number;
  /** Reserved at the top (Top Bar), px. */
  topInset?: number;
  /** Gap from the icon and margin from the area's sides, px. */
  gap?: number;
  margin?: number;
}

const clamp = (v: number, lo: number, hi: number) => (hi < lo ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v)));

/** The `left` / `top` style for the card. */
export function placeHoverCard(p: CardPlacementInput): { left: number; top: number } {
  const w = p.w > 0 ? p.w : 248;
  const h = p.h > 0 ? p.h : 160;
  const gap = p.gap ?? 12;
  const m = p.margin ?? 8;
  const topMin = (p.topInset ?? 0) + m;
  const bottomMax = p.viewH - m;
  switch (p.edge) {
    case "left":
      return { left: clamp(p.x + gap, m, p.viewW - m - w), top: clamp(p.y, topMin + h / 2, bottomMax - h / 2) };
    case "right":
      return { left: clamp(p.x - gap, m + w, p.viewW - m), top: clamp(p.y, topMin + h / 2, bottomMax - h / 2) };
    case "top":
      return { left: clamp(p.x, m + w / 2, p.viewW - m - w / 2), top: clamp(p.y + gap, topMin, bottomMax - h) };
    default:
      return { left: clamp(p.x, m + w / 2, p.viewW - m - w / 2), top: clamp(p.y - gap, topMin + h, bottomMax) };
  }
}

/** The card's box on screen for a placement (to check it in tests). */
export function cardBox(edge: CardEdge, pos: { left: number; top: number }, w: number, h: number) {
  switch (edge) {
    case "left":
      return { left: pos.left, top: pos.top - h / 2, right: pos.left + w, bottom: pos.top + h / 2 };
    case "right":
      return { left: pos.left - w, top: pos.top - h / 2, right: pos.left, bottom: pos.top + h / 2 };
    case "top":
      return { left: pos.left - w / 2, top: pos.top, right: pos.left + w / 2, bottom: pos.top + h };
    default:
      return { left: pos.left - w / 2, top: pos.top - h, right: pos.left + w / 2, bottom: pos.top };
  }
}
