// Presses with weight (DESIGN.md §5.1–5.2): the press-in starts on pointer-down (not on click),
// the pressed state stays visible for at least PRESS_MIN_MS, and the release springs back in CSS
// ([data-pressed] + [data-weight] in selectionBar.css / magicSearch.css). Space and Enter press the
// same way. A local helper until the shared press primitives (feature/feel-system) land; the
// attribute names match them, so swapping is a one-line change per component.
import type React from "react";

export type Weight = "light" | "medium" | "heavy";

/** The pressed look is held at least this long, so a fast click never flashes invisibly. */
export const PRESS_MIN_MS = 90;

/** Pure: how long to keep the pressed state after a release at `releasedAt` (press at `pressedAt`). */
export function holdLeft(pressedAt: number, releasedAt: number, min = PRESS_MIN_MS): number {
  return Math.max(0, min - Math.max(0, releasedAt - pressedAt));
}

const pressedAt = new WeakMap<Element, number>();

function down(el: Element) {
  pressedAt.set(el, performance.now());
  el.setAttribute("data-pressed", "");
}

function up(el: Element) {
  const at = pressedAt.get(el);
  if (at === undefined) return;
  pressedAt.delete(el);
  const left = holdLeft(at, performance.now());
  if (left <= 0) el.removeAttribute("data-pressed");
  else window.setTimeout(() => el.removeAttribute("data-pressed"), left);
}

/** Spread on an interactive element: `<button {...press("medium")}>`. */
export function press(weight: Weight = "medium") {
  return {
    "data-weight": weight,
    onPointerDown: (e: React.PointerEvent) => {
      if (e.button === 0) down(e.currentTarget);
    },
    onPointerUp: (e: React.PointerEvent) => up(e.currentTarget),
    onPointerLeave: (e: React.PointerEvent) => up(e.currentTarget),
    onPointerCancel: (e: React.PointerEvent) => up(e.currentTarget),
    onKeyDown: (e: React.KeyboardEvent) => {
      if ((e.key === " " || e.key === "Enter") && !e.repeat) down(e.currentTarget);
    },
    onKeyUp: (e: React.KeyboardEvent) => {
      if (e.key === " " || e.key === "Enter") up(e.currentTarget);
    },
  };
}
