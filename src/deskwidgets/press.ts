// Press weight for desktop widgets (DESIGN.md §5.1–5.2, "light to look at, weighty to touch").
// Every interactive element declares data-weight="light|medium|heavy"; the CSS (deskwidgets.css)
// draws the sink. This hook only marks the press: it starts on pointerdown (within the frame, not
// on click), stays at least MIN_HOLD_MS so a quick click is still seen, and plays for Space/Enter
// too. The release springs back through CSS. A local stand-in until the shared press primitives
// (src/ui/press) land; the markup already uses their data-weight attribute.
import { useEffect, type RefObject } from "react";

export const MIN_HOLD_MS = 90;
export type Weight = "light" | "medium" | "heavy";

/** How long a release must wait so the press was visible for at least MIN_HOLD_MS. Pure. */
export function releaseDelay(pressedAt: number, now: number, min = MIN_HOLD_MS): number {
  return Math.max(0, min - Math.max(0, now - pressedAt));
}

const pressable = (t: EventTarget | null, root: HTMLElement): HTMLElement | null => {
  const el = (t as Element | null)?.closest?.("[data-weight]") as HTMLElement | null;
  if (!el || !root.contains(el)) return null;
  if ((el as HTMLButtonElement).disabled || el.getAttribute("aria-disabled") === "true") return null;
  return el;
};

export function usePressWeight(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const host = root.current;
    if (!host) return;
    const since = new WeakMap<HTMLElement, number>();
    let current: HTMLElement | null = null;
    const press = (el: HTMLElement) => {
      current = el;
      since.set(el, performance.now());
      el.dataset.pressed = "";
    };
    // The hold is counted in frames, not with a timer: the release lands on the first frame after
    // MIN_HOLD_MS, so a press is never shorter than that and never queued behind a timer.
    const release = (el: HTMLElement | null) => {
      if (!el) return;
      if (current === el) current = null;
      const at = since.get(el) ?? 0;
      const step = () => {
        if (current === el) return; // pressed again meanwhile
        if (releaseDelay(at, performance.now()) > 0) requestAnimationFrame(step);
        else delete el.dataset.pressed;
      };
      step();
    };
    const down = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const el = pressable(e.target, host);
      if (el) press(el);
    };
    const up = () => release(current);
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const el = pressable(e.target, host);
      if (!el) return;
      if (e.type === "keydown" && !e.repeat) press(el);
      else if (e.type === "keyup") release(el);
    };
    host.addEventListener("pointerdown", down);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    host.addEventListener("keydown", key);
    host.addEventListener("keyup", key);
    return () => {
      host.removeEventListener("pointerdown", down);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      host.removeEventListener("keydown", key);
      host.removeEventListener("keyup", key);
    };
  }, [root]);
}
