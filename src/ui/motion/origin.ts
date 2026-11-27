// Pop-outs grow from their trigger across windows (DESIGN.md §5.3, docs/SMOOTHNESS.md D2/D3).
//
// Each Lens surface is its own native window, positioned by the backend before it is shown, and
// the native window is never resized or moved mid-animation. So the trigger's window tells the
// pop-out where the trigger is on screen, and the pop-out animates its *content root* from that
// point inside its already-placed window:
//
//   trigger side   <button data-opens="quicksettings">…   (installOriginBeacon() runs per window)
//                  → on pointerdown / Enter / Space, emits lens://surface-origin with the
//                    trigger's screen rect
//   pop-out side   useGrowFromTrigger("quicksettings", rootRef)
//                  → on the backend's "pre" (window placed, still transparent) sets
//                    --lens-glide-from and transform-origin on the root, so the existing
//                    .lens-glide-* enter grows from the trigger and .is-closing returns to it,
//                    quicker. No origin (keyboard shortcut, search, stale) → the default glide.
import { useEffect, type RefObject } from "react";
import { emit, listen } from "@tauri-apps/api/event";
import type { Box } from "./flip";
import { growPose } from "./flow";

export const ORIGIN_EVENT = "lens://surface-origin";
/** An origin older than this when the pop-out opens is ignored (it opened some other way). */
export const ORIGIN_MAX_AGE_MS = 1500;
/** A trigger further than this from the pop-out's window is on another monitor or stale. */
export const ORIGIN_MAX_DISTANCE = 600;

export interface SurfaceOrigin {
  label: string;
  /** The trigger's rect in screen coordinates (CSS px). */
  left: number;
  top: number;
  width: number;
  height: number;
  at: number;
}

/** The trigger rect inside the pop-out window, or null when it is too far away to be meaningful. */
export function localOrigin(o: SurfaceOrigin, win: { screenX: number; screenY: number; innerWidth: number; innerHeight: number }): Box | null {
  const left = o.left - win.screenX;
  const top = o.top - win.screenY;
  const dx = left < 0 ? -left : Math.max(0, left - win.innerWidth);
  const dy = top < 0 ? -top : Math.max(0, top - win.innerHeight);
  if (Math.hypot(dx, dy) > ORIGIN_MAX_DISTANCE) return null;
  return { left, top, width: o.width, height: o.height };
}

/** Layout box of an element ignoring its transforms (the glide pose must not skew the maths). */
export function layoutBox(el: HTMLElement): Box {
  let left = 0;
  let top = 0;
  let n: HTMLElement | null = el;
  while (n) {
    left += n.offsetLeft;
    top += n.offsetTop;
    n = n.offsetParent as HTMLElement | null;
  }
  return { left, top, width: el.offsetWidth, height: el.offsetHeight };
}

let beaconInstalled = false;

/** Trigger side: announce the rect of any [data-opens] control as it is pressed. Once per window. */
export function installOriginBeacon(doc: Document | undefined = typeof document !== "undefined" ? document : undefined) {
  if (!doc || beaconInstalled) return;
  beaconInstalled = true;
  const announce = (target: EventTarget | null) => {
    const el = target instanceof Element ? target.closest<HTMLElement>("[data-opens]") : null;
    const label = el?.dataset.opens;
    if (!el || !label) return;
    const r = el.getBoundingClientRect();
    const view = doc.defaultView ?? window;
    const o: SurfaceOrigin = { label, left: view.screenX + r.left, top: view.screenY + r.top, width: r.width, height: r.height, at: Date.now() };
    emit(ORIGIN_EVENT, o).catch(() => {});
  };
  doc.addEventListener("pointerdown", (e) => e.button === 0 && announce(e.target), { capture: true, passive: true });
  doc.addEventListener(
    "keydown",
    (e) => {
      if ((e.key === "Enter" || e.key === " ") && !e.repeat) announce(e.target);
    },
    { capture: true, passive: true }
  );
}

function clear(el: HTMLElement) {
  el.style.removeProperty("--lens-glide-from");
  el.style.removeProperty("transform-origin");
  delete el.dataset.growFrom;
}

/**
 * Pop-out side: grow the content root from its trigger when it opens, return there when it closes.
 * Works with the CSS glide of useSurfaceGlide / useSurfaceTransition (.lens-glide-*): only the
 * start pose and origin change, so the timing, interruption and exit acknowledgement stay theirs.
 */
export function useGrowFromTrigger(label: string, ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    let last: SurfaceOrigin | null = null;
    const apply = () => {
      const el = ref.current;
      if (!el) return;
      const o = last;
      if (!o || Date.now() - o.at > ORIGIN_MAX_AGE_MS) return clear(el);
      const local = localOrigin(o, window);
      if (!local) return clear(el);
      const g = growPose(local, layoutBox(el));
      el.style.setProperty("--lens-glide-from", g.transform);
      el.style.setProperty("transform-origin", g.origin);
      el.dataset.growFrom = "trigger";
    };
    const offOrigin = listen<SurfaceOrigin>(ORIGIN_EVENT, (e) => {
      if (e.payload?.label !== label) return;
      last = e.payload;
      // The origin can arrive just after "pre"; the root is still in its entry pose then.
      if (ref.current?.classList.contains("is-pre-open")) apply();
    });
    const offGlide = listen<{ label: string; state: string }>("lens://surface-glide", (e) => {
      if (e.payload?.label !== label) return;
      if (e.payload.state === "pre") apply();
    });
    return () => {
      offOrigin.then((f) => f());
      offGlide.then((f) => f());
    };
  }, [label, ref]);
}
