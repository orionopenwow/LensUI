// FLIP: let layout change in one frame, then glide each element from where it was to where it is
// with a transform. This is how Lens animates anything that changes size or position (Dock search,
// list reorders, expanding rows) without animating width/height/top/left.
//
//   const moved = captureFlip(row.children);   // before the state change
//   setOpen(true);                              // layout changes (in a layout effect:)
//   moved.play();                               // after React has committed
import { glide, type GlideHandle, type GlideOptions } from "./glide";

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface FlipDelta {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  /** Nothing visible would move: skip the animation. */
  still: boolean;
}

/** The transform that makes an element now at `last` look as if it were still at `first`. */
export function flipDelta(first: Box, last: Box): FlipDelta {
  const scaleX = last.width > 0 ? first.width / last.width : 1;
  const scaleY = last.height > 0 ? first.height / last.height : 1;
  const x = first.left - last.left;
  const y = first.top - last.top;
  const still = Math.abs(x) < 0.5 && Math.abs(y) < 0.5 && Math.abs(scaleX - 1) < 0.01 && Math.abs(scaleY - 1) < 0.01;
  return { x, y, scaleX, scaleY, still };
}

export type FlipMode =
  /** Move and scale (icons, cards, anything that may stretch for a moment). */
  | "scale"
  /** Move only (text). */
  | "move"
  /** Reveal by clipping from the old box to the new one (inputs and text fields: no stretched text). */
  | "clip";

export interface FlipOptions extends GlideOptions {
  /** Mode per element; default "scale". */
  mode?: FlipMode | ((el: Element) => FlipMode);
}

export interface FlipCapture {
  /** Call after layout has changed. Elements that left the page are skipped. */
  play(opts?: FlipOptions): GlideHandle[];
}

const boxOf = (el: Element): Box => {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
};

export function captureFlip(elements: Iterable<Element> | ArrayLike<Element> | null | undefined): FlipCapture {
  const first = new Map<Element, Box>();
  if (elements) for (const el of Array.from(elements)) first.set(el, boxOf(el));
  return {
    play(opts: FlipOptions = {}) {
      const handles: GlideHandle[] = [];
      for (const [el, a] of first) {
        if (!el.isConnected) continue;
        const b = boxOf(el);
        const d = flipDelta(a, b);
        if (d.still || b.width === 0 || b.height === 0) continue;
        const mode = typeof opts.mode === "function" ? opts.mode(el) : (opts.mode ?? "scale");
        const base: GlideOptions = { duration: "slow", ease: "out", ...opts, origin: "0 0" };
        if (mode === "clip") {
          // Same origin: reveal from the old size. Any offset is handled by moving.
          const right = Math.max(0, b.width - a.width);
          const bottom = Math.max(0, b.height - a.height);
          handles.push(glide(el, { x: d.x, y: d.y, clip: [0, right, bottom, 0] }, { clip: [0, 0, 0, 0] }, base));
        } else if (mode === "move") {
          handles.push(glide(el, { x: d.x, y: d.y }, {}, base));
        } else {
          handles.push(glide(el, { x: d.x, y: d.y, scaleX: d.scaleX, scaleY: d.scaleY }, {}, base));
        }
      }
      return handles;
    },
  };
}
