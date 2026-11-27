// The press state machine (DESIGN.md §5.1–5.2), with no DOM and no React so its timing is
// unit-tested. One machine per pressed element; it only ever writes one attribute:
//
//   data-press="in"    sinking / held down  (CSS: --lens-press-in, --lens-ease-out)
//   data-press="out"   springing back       (CSS: --lens-press-release, --lens-ease-spring)
//   (no attribute)     at rest
//
// Rules it guarantees:
//   * the press-in starts in the same event as pointerdown / keydown (no waiting for click);
//   * the pressed state lasts at least `holdMin` ms (90) even for an instant click: the release
//     is scheduled, never skipped;
//   * a pointer that leaves or is cancelled releases at once (nothing was activated);
//   * disabled controls never press;
//   * pressing again while it springs back sinks again from where it is (CSS transitions reverse
//     from their current value), so rapid presses never queue.
import type { PressWeight } from "../motion/tokens";

export interface PressHost {
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  hasAttribute(name: string): boolean;
}

export interface PressClock {
  now(): number;
  set(fn: () => void, ms: number): unknown;
  clear(id: unknown): void;
}

export interface PressTiming {
  /** Minimum time the pressed state stays visible (--lens-press-hold-min). */
  holdMin(): number;
  /** How long the release runs for this weight, before the attribute is cleared. */
  release(weight: PressWeight): number;
}

/** The release transition can start a frame after the attribute changes; clearing the attribute
 * ends it (the component's own transition list takes over), so wait one more frame. */
export const RELEASE_SLACK_MS = 32;

export type PressState = "idle" | "in" | "out";

export const WEIGHTS: readonly PressWeight[] = ["light", "medium", "heavy"];

export function weightOf(host: PressHost): PressWeight {
  const w = host.getAttribute("data-weight");
  return w === "light" || w === "heavy" ? w : "medium";
}

export function isDisabled(host: PressHost): boolean {
  return host.hasAttribute("disabled") || host.getAttribute("aria-disabled") === "true" || host.hasAttribute("data-no-press");
}

export class PressMachine {
  state: PressState = "idle";
  private downAt = 0;
  private timer: unknown = null;

  constructor(
    private host: PressHost,
    private clock: PressClock,
    private timing: PressTiming
  ) {}

  private clearTimer() {
    if (this.timer !== null) this.clock.clear(this.timer);
    this.timer = null;
  }

  /** Pointer down or Space/Enter down. Returns false when the control can't be pressed. */
  down(): boolean {
    if (isDisabled(this.host)) return false;
    this.clearTimer();
    this.downAt = this.clock.now();
    this.state = "in";
    this.host.setAttribute("data-press", "in");
    return true;
  }

  /** Pointer up or key up: release, but not before the minimum hold has passed. */
  up() {
    if (this.state !== "in" || this.timer !== null) return;
    const wait = Math.max(0, this.timing.holdMin() - (this.clock.now() - this.downAt));
    if (wait > 0) {
      this.timer = this.clock.set(() => {
        this.timer = null;
        this.release();
      }, wait);
    } else this.release();
  }

  /** Pointer left, pointer cancelled, focus lost: spring back now. */
  cancel() {
    if (this.state !== "in") return;
    this.clearTimer();
    this.release();
  }

  /** Spring back to rest (also used when pending work answers). */
  release() {
    this.clearTimer();
    this.state = "out";
    this.host.setAttribute("data-press", "out");
    this.timer = this.clock.set(() => {
      this.timer = null;
      this.state = "idle";
      this.host.removeAttribute("data-press");
    }, this.timing.release(weightOf(this.host)) + RELEASE_SLACK_MS);
  }

  /** Drop everything (element left the page). */
  dispose() {
    this.clearTimer();
    this.state = "idle";
    this.host.removeAttribute("data-press");
  }
}
