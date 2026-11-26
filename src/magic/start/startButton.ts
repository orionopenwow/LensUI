// Magic button (docs/plans/MAGIC_WAVES.md §4; owner decision: when on, a Windows-key tap opens
// Lens Magic Start only). The native Win-tap hook stays the owner of the key; this is the
// contract it follows. Rules that never change:
// - Off (the default): Windows behaves exactly as it does without Lens.
// - Ctrl+Esc always opens Windows Start.
// - Win+<any key> combinations (Win+L, Win+D, Win+Tab, …) are never touched.
// - If Lens doesn't acknowledge a tap within the watchdog (300 ms), Windows Start opens instead
//   and the hook stands down until Lens answers again.

export type StartMode = "windows" | "magic";

export type KeyEvent =
  | { type: "winDown"; t: number }
  | { type: "otherKey"; t: number }
  | { type: "winUp"; t: number }
  | { type: "ack"; t: number }
  | { type: "tick"; t: number }
  | { type: "ctrlEsc"; t: number };

export type StartAction = "none" | "openMagic" | "openWindowsStart" | "passToWindows";

export interface StartState {
  mode: StartMode;
  /** The Win key is down and no other key has been pressed with it. */
  pendingTap: boolean;
  /** A Magic open was asked for and Lens hasn't acknowledged yet (since this time). */
  awaitingAck: number | null;
  /** The hook stood down after a missed ack; taps go to Windows until Lens answers. */
  stoodDown: boolean;
}

export const WATCHDOG_MS = 300;

export function initial(on: boolean): StartState {
  return { mode: on ? "magic" : "windows", pendingTap: false, awaitingAck: null, stoodDown: false };
}

export function step(s: StartState, e: KeyEvent): [StartState, StartAction] {
  if (e.type === "ctrlEsc") return [{ ...s, pendingTap: false }, "openWindowsStart"];
  if (s.mode === "windows") return [s, "passToWindows"];
  switch (e.type) {
    case "winDown":
      return [{ ...s, pendingTap: true }, "none"];
    case "otherKey":
      // A Win+<key> combination: Windows handles it, untouched.
      return [{ ...s, pendingTap: false }, "passToWindows"];
    case "winUp":
      if (!s.pendingTap) return [s, "passToWindows"];
      if (s.stoodDown) return [{ ...s, pendingTap: false }, "openWindowsStart"];
      return [{ ...s, pendingTap: false, awaitingAck: e.t }, "openMagic"];
    case "ack":
      return [{ ...s, awaitingAck: null, stoodDown: false }, "none"];
    case "tick":
      if (s.awaitingAck !== null && e.t - s.awaitingAck >= WATCHDOG_MS) {
        return [{ ...s, awaitingAck: null, stoodDown: true }, "openWindowsStart"];
      }
      return [s, "none"];
  }
}
