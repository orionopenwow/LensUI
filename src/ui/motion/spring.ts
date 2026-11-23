// A damped spring sampled into a CSS linear() easing, so springs run on the compositor through the
// Web Animations API instead of a JavaScript loop. Pure maths: unit-tested.

export interface SpringOptions {
  /** Higher is snappier. Default 380. */
  stiffness?: number;
  /** Higher settles sooner with less overshoot. Default 30 (a little bounce). */
  damping?: number;
  mass?: number;
}

/** Position of a unit spring (0 → 1) at time t seconds, starting at rest. */
export function springAt(t: number, { stiffness = 380, damping = 30, mass = 1 }: SpringOptions = {}): number {
  const w0 = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));
  if (zeta < 1) {
    const wd = w0 * Math.sqrt(1 - zeta * zeta);
    return 1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t));
  }
  // Critically damped (and, close enough for UI, over-damped).
  return 1 - Math.exp(-w0 * t) * (1 + w0 * t);
}

/** Seconds until the spring stays within `epsilon` of rest. Capped at 1.2 s. */
export function springDuration(opts: SpringOptions = {}, epsilon = 0.002): number {
  const step = 1 / 120;
  let settledAt = 0;
  for (let t = 0; t <= 1.2; t += step) {
    if (Math.abs(1 - springAt(t, opts)) > epsilon) settledAt = t + step;
  }
  return Math.min(1.2, Math.max(0.12, settledAt));
}

/** `{ easing: "linear(…)", duration: ms }` for use with element.animate(). */
export function springEasing(opts: SpringOptions = {}, samples = 32): { easing: string; duration: number } {
  const seconds = springDuration(opts);
  const pts: string[] = [];
  for (let i = 0; i <= samples; i++) {
    const v = i === samples ? 1 : springAt((i / samples) * seconds, opts);
    pts.push(String(Math.round(v * 1000) / 1000));
  }
  return { easing: `linear(${pts.join(", ")})`, duration: Math.round(seconds * 1000) };
}
