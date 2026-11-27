// Flows (DESIGN.md §5.3): everything comes from somewhere.
//   growFrom(el, trigger)     a pop-out / card grows from the rect of what opened it
//   returnTo(el, trigger)     …and closing returns it there, quicker
//   staggerIn(items)          a list arrives in order: --lens-stagger per item, first 6 only
//   swapIn(el, "forward")     a content swap slides 6px in the direction of travel and crossfades
// All of them are transform/opacity only, read the motion tokens, collapse under reduced motion,
// and are interruptible: a new flow on an element reverses or replaces the running one from where
// it is, never from the end, and rapid toggling never queues.
import type { Box } from "./flip";
import { clearPose, glide, type GlideHandle, type Pose } from "./glide";

/** Items after this arrive together (DESIGN.md §5.3). */
export const STAGGER_CAP = 6;
/** The slide of a content swap, px. */
export const SWAP_SHIFT = 6;
/** A grow never starts smaller than this (a 28px icon into a 400px panel would smear the text). */
export const GROW_MIN_SCALE = 0.86;
/** …nor further than this from where the panel lands, px (the window is already in place). */
export const GROW_MAX_SHIFT = 14;

export interface GrowPose {
  /** The start pose (opacity 0) in the element's own coordinates. */
  from: Pose;
  /** transform-origin: the trigger's centre, clamped into the element's box. */
  origin: string;
  /** The same as a CSS transform, for CSS-driven flows (the surface glide's --lens-glide-from). */
  transform: string;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round = (v: number) => Math.round(v * 100) / 100;

/**
 * Where an element at `target` should start so that it reads as growing out of `trigger` (both in
 * the same coordinate space). The origin sits on the trigger's centre (clamped to the target), the
 * scale is the trigger's share of the target (floored at GROW_MIN_SCALE), and when the trigger is
 * outside the target the start is nudged towards it by up to GROW_MAX_SHIFT px.
 */
export function growPose(trigger: Box, target: Box, opts: { minScale?: number; maxShift?: number } = {}): GrowPose {
  const minScale = opts.minScale ?? GROW_MIN_SCALE;
  const maxShift = opts.maxShift ?? GROW_MAX_SHIFT;
  const cx = trigger.left + trigger.width / 2;
  const cy = trigger.top + trigger.height / 2;
  const ox = clamp(cx - target.left, 0, target.width);
  const oy = clamp(cy - target.top, 0, target.height);
  const share = target.width > 0 && target.height > 0 ? Math.max(trigger.width / target.width, trigger.height / target.height) : 1;
  const scale = round(clamp(share, minScale, 1));
  const x = round(clamp(cx - (target.left + ox), -maxShift, maxShift));
  const y = round(clamp(cy - (target.top + oy), -maxShift, maxShift));
  const from: Pose = { opacity: 0, scale };
  if (x) from.x = x;
  if (y) from.y = y;
  const transform = `${x || y ? `translate(${x}px, ${y}px) ` : ""}scale(${scale})`;
  return { from, origin: `${round(ox)}px ${round(oy)}px`, transform };
}

const running = new WeakMap<Element, GlideHandle>();

function boxOfEl(el: Element): Box {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

/** Grow `el` (at rest in its final place) out of `trigger` (a rect in viewport coordinates). */
export function growFrom(el: Element | null | undefined, trigger: Box, opts: { minScale?: number } = {}): GlideHandle {
  if (!el) return glide(null, {}, {});
  // Reopened while closing: drop the held close pose and grow again.
  running.get(el)?.cancel();
  clearPose(el);
  const g = growPose(trigger, boxOfEl(el), opts);
  const h = glide(el, g.from, { opacity: 1 }, { duration: "base", ease: "out", origin: g.origin });
  running.set(el, h);
  return h;
}

/** Close back into `trigger`: quicker than the grow, ends transparent and held (then hide it). */
export function returnTo(el: Element | null | undefined, trigger: Box, opts: { minScale?: number } = {}): GlideHandle {
  if (!el) return glide(null, {}, {});
  const prev = running.get(el);
  // Interrupted mid-grow: run the same path backwards from where it is.
  if (prev?.reverse?.()) return prev;
  const g = growPose(trigger, boxOfEl(el), opts);
  const h = glide(el, { opacity: 1 }, g.from, { duration: "exit", ease: "exit", origin: g.origin, hold: true });
  running.set(el, h);
  return h;
}

/** Delay of list item `index` in ms: `step` per item for the first `cap`, then all together. */
export function staggerDelay(index: number, step = staggerStep(), cap = STAGGER_CAP): number {
  if (index <= 0 || step <= 0) return 0;
  return Math.min(index, cap) * step;
}

/** --lens-stagger as the page has it now (0 under reduced motion). */
export function staggerStep(): number {
  if (typeof document === "undefined" || typeof getComputedStyle !== "function") return 30;
  const v = getComputedStyle(document.documentElement).getPropertyValue("--lens-stagger").trim();
  const m = v.match(/^(\d*\.?\d+)ms$/);
  return m ? parseFloat(m[1]) : 30;
}

/** A list arriving: each item glides in, in order. Leaving lists don't stagger (use glideOut). */
export function staggerIn(items: Iterable<Element> | ArrayLike<Element>, from: Pose = { y: 4, opacity: 0 }): GlideHandle[] {
  const step = staggerStep();
  return Array.from(items).map((el, i) => {
    running.get(el)?.cancel();
    const h = glide(el, { opacity: 0, ...from }, { opacity: 1 }, { duration: "base", ease: "out", delay: staggerDelay(i, step) });
    running.set(el, h);
    return h;
  });
}

export type SwapDirection = "forward" | "back" | "none";

/** Direction of travel between two positions in an ordered list (pages, steps). */
export function swapDirection(prev: number, next: number): SwapDirection {
  if (prev < 0 || next < 0 || prev === next) return "none";
  return next > prev ? "forward" : "back";
}

/** Start pose of new content: forward comes from the right, back from the left. */
export function swapPose(dir: SwapDirection): Pose {
  if (dir === "none") return { opacity: 0 };
  return { x: dir === "forward" ? SWAP_SHIFT : -SWAP_SHIFT, opacity: 0 };
}

/** Swap in new content (already rendered in place). */
export function swapIn(el: Element | null | undefined, dir: SwapDirection): GlideHandle {
  if (!el) return glide(null, {}, {});
  running.get(el)?.cancel();
  const h = glide(el, swapPose(dir), { opacity: 1 }, { duration: "base", ease: "out" });
  running.set(el, h);
  return h;
}
