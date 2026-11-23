/**
 * Loop-safe scene clock.
 *
 * Motion follows wall-clock time, so a dropped frame never slows the backdrop down. A long gap
 * (pause, sleep, a hidden window, a stalled tab) is capped at `maxStep`, so resuming continues from
 * the moment it stopped instead of snapping ahead. The scene phase wraps every `loop` seconds; looks
 * only use whole multiples of the phase, so the wrap itself is invisible.
 */
export const TAU = Math.PI * 2;

export class LoopClock {
  private t = 0;
  private last: number | null = null;
  private paused = false;

  constructor(
    public loop = 20,
    private readonly maxStep = 0.25,
    private readonly now: () => number = () => (typeof performance !== "undefined" ? performance.now() : Date.now())
  ) {}

  /** Scene seconds since start (monotonic, never jumps by more than maxStep per tick). */
  tick(): number {
    const n = this.now();
    if (this.paused) {
      this.last = n;
      return this.t;
    }
    if (this.last !== null) {
      const dt = Math.max(0, (n - this.last) / 1000);
      this.t += Math.min(dt, this.maxStep);
    }
    this.last = n;
    return this.t;
  }

  get time(): number {
    return this.t;
  }

  set time(v: number) {
    this.t = Math.max(0, v);
  }

  setPaused(p: boolean): void {
    this.paused = p;
    this.last = null;
  }

  get isPaused(): boolean {
    return this.paused;
  }
}

/** Phase in [0, 2π) for scene time `t` and loop length `loop` seconds. */
export function phaseAt(t: number, loop: number): number {
  const L = loop > 0 ? loop : 20;
  const f = (t / L) % 1;
  return (f < 0 ? f + 1 : f) * TAU;
}

/** Times (seconds) of the frames an export renders: `fps × seconds` frames, the last one before the loop point. */
export function exportFrameTimes(seconds: number, fps: number): number[] {
  const n = Math.max(1, Math.round(seconds * fps));
  return Array.from({ length: n }, (_, i) => i / fps);
}
