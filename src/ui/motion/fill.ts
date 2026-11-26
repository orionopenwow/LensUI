// Bars, meters and level waves without layout animation (docs/SMOOTHNESS.md, R3).
// The element keeps its full size and the CSS scales it: `transform: scaleX(var(--fill))` (or
// scaleY for a level bar), so a changing value moves on the compositor instead of re-laying out
// the page every frame. `offset` places a segment of a stacked bar: translateX(calc(var(--fill-o) * 100%)).
import type { CSSProperties } from "react";

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

/** CSS variables for a bar filled to `fraction` (0..1), optionally starting at `offset` (0..1). */
export function fillStyle(fraction: number, offset?: number): CSSProperties {
  const s: Record<string, string> = { "--fill": String(+clamp01(fraction).toFixed(4)) };
  if (offset !== undefined) s["--fill-o"] = String(+clamp01(offset).toFixed(4));
  return s as CSSProperties;
}
