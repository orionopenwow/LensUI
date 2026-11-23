// The Dock's hold-to-talk button: press and hold to talk, release to send, slide off or Esc to
// cancel, double-tap to latch hands-free. Pure (mirrors src-tauri/src/voice/hold.rs).

export type HoldEffect = "start" | "send" | "cancel" | "latch";

export interface HoldState {
  pressedAt: number | null;
  active: boolean;
  latched: boolean;
  /** This press began while latched (it's the stop tap). */
  stopping: boolean;
  lastTapUp: number | null;
}

export const HOLD0: HoldState = { pressedAt: null, active: false, latched: false, stopping: false, lastTapUp: null };
export const TAP_MS = 250;
export const DOUBLE_TAP_MS = 350;

export function holdPress(s: HoldState, now: number): [HoldState, HoldEffect[]] {
  if (s.pressedAt !== null) return [s, []];
  if (s.latched) return [{ ...s, pressedAt: now, stopping: true }, []];
  return [{ ...s, pressedAt: now, active: true }, ["start"]];
}

export function holdRelease(s: HoldState, now: number): [HoldState, HoldEffect[]] {
  if (s.pressedAt === null) return [s, []];
  const held = now - s.pressedAt;
  if (s.stopping) return [{ ...HOLD0 }, ["send"]];
  if (!s.active) return [{ ...s, pressedAt: null }, []];
  if (held < TAP_MS) {
    if (s.lastTapUp !== null && s.pressedAt - s.lastTapUp <= DOUBLE_TAP_MS) {
      return [{ pressedAt: null, active: true, latched: true, stopping: false, lastTapUp: null }, ["latch"]];
    }
    // A quick tap that isn't a double-tap: nothing said yet, cancel quietly.
    return [{ ...HOLD0, lastTapUp: now }, ["cancel"]];
  }
  return [{ ...HOLD0 }, ["send"]];
}

/** Pointer slid off the button, or Esc. */
export function holdCancel(s: HoldState): [HoldState, HoldEffect[]] {
  if (!s.active && !s.latched) return [{ ...s, pressedAt: null }, []];
  return [{ ...HOLD0 }, ["cancel"]];
}
