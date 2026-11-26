// Press weight for Lens Music surfaces (DESIGN.md §5.1–5.2) until the shared primitives from the
// feel system land: one delegated listener per surface root marks the pressed element with
// `data-pressed` on pointer-down (within the frame) and keeps it for at least 90 ms, so even the
// quickest click shows its press. The look (sink, depth, spring release) is CSS on
// `[data-weight][data-pressed]` in music.css. Keyboard Space/Enter press the same way.
import { useEffect, type RefObject } from "react";

export const MIN_PRESS_MS = 90;

/** How long a press must still be held after release (pure; tested). */
export function holdLeft(pressedAt: number, releasedAt: number, min = MIN_PRESS_MS): number {
  return Math.max(0, min - Math.max(0, releasedAt - pressedAt));
}

export function usePressWeight(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    let target: HTMLElement | null = null;
    let at = 0;
    let raf = 0;
    const release = () => {
      const t = target;
      if (!t) return;
      target = null;
      const started = performance.now();
      const wait = holdLeft(at, started);
      const step = (now: number) => {
        if (now - started >= wait) t.removeAttribute("data-pressed");
        else raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    };
    const press = (e: Event) => {
      const t = (e.target as HTMLElement | null)?.closest?.<HTMLElement>("[data-weight]");
      if (!t || (t as HTMLButtonElement).disabled || t.getAttribute("aria-disabled") === "true") return;
      cancelAnimationFrame(raf);
      target?.removeAttribute("data-pressed");
      target = t;
      at = performance.now();
      t.setAttribute("data-pressed", "");
    };
    const key = (e: KeyboardEvent) => {
      if ((e.key === " " || e.key === "Enter") && !e.repeat) press(e);
    };
    const keyUp = (e: KeyboardEvent) => {
      if (e.key === " " || e.key === "Enter") release();
    };
    el.addEventListener("pointerdown", press);
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    el.addEventListener("keydown", key);
    el.addEventListener("keyup", keyUp);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("pointerdown", press);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      el.removeEventListener("keydown", key);
      el.removeEventListener("keyup", keyUp);
    };
  }, [root]);
}
