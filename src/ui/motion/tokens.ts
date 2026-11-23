// Motion tokens for the engine: read from the CSS tokens (src/styles/motion.css) so code-driven
// motion and CSS transitions share one vocabulary and one reduced-motion switch.

export type DurationToken = "instant" | "fast" | "base" | "slow" | "slower" | "exit";
export type EaseToken = "out" | "in-out" | "exit" | "drawer" | "spring";

/** Fallbacks match motion.css; used where there is no document (tests) or the token is missing. */
export const DURATION_MS: Record<DurationToken, number> = { instant: 80, fast: 140, base: 180, slow: 240, slower: 360, exit: 120 };
export const EASE: Record<EaseToken, string> = {
  out: "cubic-bezier(0.22, 1, 0.36, 1)",
  "in-out": "cubic-bezier(0.65, 0, 0.35, 1)",
  exit: "cubic-bezier(0.4, 0, 1, 1)",
  drawer: "cubic-bezier(0.32, 0.72, 0, 1)",
  spring: "cubic-bezier(0.22, 1, 0.36, 1)", // replaced by a sampled spring (spring.ts) when used
};

export function parseMs(value: string): number | null {
  const m = value.trim().match(/^(-?\d*\.?\d+)(ms|s)$/);
  if (!m) return null;
  return m[2] === "s" ? parseFloat(m[1]) * 1000 : parseFloat(m[1]);
}

function cssVar(name: string): string {
  if (typeof document === "undefined" || typeof getComputedStyle !== "function") return "";
  try {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  } catch {
    return "";
  }
}

/** Duration of a token in ms as the page currently has it (1 when motion is reduced). */
export function duration(token: DurationToken | number): number {
  if (typeof token === "number") return reducedMotion() ? Math.min(token, 1) : token;
  const live = parseMs(cssVar(`--lens-dur-${token}`));
  return live ?? DURATION_MS[token];
}

export function ease(token: EaseToken | string): string {
  if (token in EASE) {
    const live = cssVar(`--lens-ease-${token}`);
    // linear() springs and beziers both work as WAAPI easings; multi-line values need collapsing.
    return live ? live.replace(/\s+/g, " ") : EASE[token as EaseToken];
  }
  return token;
}

/** True when Windows "Animation effects" is off or Lens is set to reduce motion (and not forced on). */
export function reducedMotion(): boolean {
  if (typeof document === "undefined") return false;
  const mode = document.documentElement.getAttribute("data-motion");
  if (mode === "reduce") return true;
  if (mode === "full") return false;
  try {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  } catch {
    return false;
  }
}
