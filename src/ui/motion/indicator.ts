// The sliding selection indicator of segmented controls and tabs (DESIGN.md §5.2): the selected
// pill *slides* to the new option, FLIP, transform only, with --lens-ease-out; it never jumps.
//
//   const box = useRef<HTMLDivElement>(null);
//   const ind = useRef<HTMLSpanElement>(null);
//   useSlidingIndicator(box, ind, value);          // active option: [aria-checked="true"], .active
//   <div ref={box}><span ref={ind} className="…-ind" aria-hidden /> …options… </div>
//
// The indicator's resting place is two custom properties (--lens-ind-x / --lens-ind-w) that the
// CSS turns into left/width once, instantly; the move between options is a transform from the old
// box to the new one. No re-render: everything happens in a layout effect.
import { useLayoutEffect, useRef, type RefObject } from "react";
import { flipDelta, type Box } from "./flip";
import { glide, type GlideHandle } from "./glide";

const ACTIVE = '[aria-checked="true"], [aria-selected="true"], .active';

/** The indicator's box for an option, relative to the container's padding box. */
export function indicatorBox(option: { offsetLeft: number; offsetTop: number; offsetWidth: number; offsetHeight: number }): Box {
  return { left: option.offsetLeft, top: option.offsetTop, width: option.offsetWidth, height: option.offsetHeight };
}

export function useSlidingIndicator(container: RefObject<HTMLElement | null>, indicator: RefObject<HTMLElement | null>, activeKey: unknown) {
  const last = useRef<Box | null>(null);
  const running = useRef<GlideHandle | null>(null);
  useLayoutEffect(() => {
    const box = container.current;
    const ind = indicator.current;
    if (!box || !ind) return;
    const opt = box.querySelector<HTMLElement>(ACTIVE);
    if (!opt) {
      ind.dataset.on = "false";
      last.current = null;
      return;
    }
    const next = indicatorBox(opt);
    ind.style.setProperty("--lens-ind-x", `${next.left}px`);
    ind.style.setProperty("--lens-ind-y", `${next.top}px`);
    ind.style.setProperty("--lens-ind-w", `${next.width}px`);
    ind.style.setProperty("--lens-ind-h", `${next.height}px`);
    ind.dataset.on = "true";
    const prev = last.current;
    last.current = next;
    if (!prev) return;
    const d = flipDelta(prev, next);
    if (d.still) return;
    // Interrupted: start from where the running slide is now, not from its end.
    let from = { x: d.x, y: d.y, scaleX: d.scaleX, scaleY: d.scaleY };
    if (running.current) {
      const r = ind.getBoundingClientRect();
      const o = box.getBoundingClientRect();
      const now = { left: r.left - o.left - box.clientLeft, top: r.top - o.top - box.clientTop, width: r.width, height: r.height };
      running.current.cancel();
      const dn = flipDelta(now, next);
      from = { x: dn.x, y: dn.y, scaleX: dn.scaleX, scaleY: dn.scaleY };
    }
    const h = glide(ind, from, {}, { duration: "base", ease: "out", origin: "0 0" });
    running.current = h;
    h.finished.then(() => {
      if (running.current === h) running.current = null;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey]);
}
