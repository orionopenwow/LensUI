// Magic Mouse grab gesture (docs/plans/MAGIC_WAVES.md §4, owner decision: hold the left button
// about 400 ms, then drag). A short click stays a normal click; moving before the hold time
// passes is a normal drag (selecting text, moving a window). Pure state machine: the native
// side feeds it pointer events and acts on the result. Nothing here captures the screen.

export type GesturePhase = "idle" | "pressed" | "armed" | "grabbing" | "passthrough";

export interface GestureState {
  phase: GesturePhase;
  /** Where the button went down (screen px). */
  origin: { x: number; y: number } | null;
  /** When the button went down (ms). */
  downAt: number;
  /** The grab rectangle while grabbing (screen px, normalised). */
  rect: { x: number; y: number; w: number; h: number } | null;
}

export type GestureEvent =
  | { type: "down"; x: number; y: number; t: number; button?: "left" | "right" | "middle" }
  | { type: "move"; x: number; y: number; t: number }
  | { type: "tick"; t: number }
  | { type: "up"; x: number; y: number; t: number }
  | { type: "cancel" };

export type GestureResult =
  | { kind: "none" }
  | { kind: "click" }
  /** The pointer moved before the hold time: hand the drag back to Windows untouched. */
  | { kind: "passthrough" }
  /** Held long enough: show the "magic ready" pointer. */
  | { kind: "armed" }
  | { kind: "grab"; rect: { x: number; y: number; w: number; h: number } };

export interface GestureOptions {
  /** Hold time before a drag becomes a grab (owner default 400 ms; 200–1200). */
  holdMs: number;
  /** Pointer travel (px) that counts as moving. */
  slopPx: number;
  /** Smallest grab that counts (px on each side). */
  minGrabPx: number;
}

export const DEFAULT_GESTURE: GestureOptions = { holdMs: 400, slopPx: 6, minGrabPx: 8 };

export const IDLE: GestureState = { phase: "idle", origin: null, downAt: 0, rect: null };

function rectFrom(a: { x: number; y: number }, b: { x: number; y: number }) {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}

export function step(state: GestureState, ev: GestureEvent, opts: GestureOptions = DEFAULT_GESTURE): [GestureState, GestureResult] {
  if (ev.type === "cancel") return [IDLE, { kind: "none" }];
  switch (state.phase) {
    case "idle":
      if (ev.type === "down" && (ev.button ?? "left") === "left") {
        return [{ phase: "pressed", origin: { x: ev.x, y: ev.y }, downAt: ev.t, rect: null }, { kind: "none" }];
      }
      return [state, { kind: "none" }];
    case "pressed": {
      const o = state.origin!;
      if (ev.type === "up") return [IDLE, { kind: "click" }];
      if (ev.type === "move" || ev.type === "tick") {
        const moved = ev.type === "move" && Math.hypot(ev.x - o.x, ev.y - o.y) > opts.slopPx;
        if (moved && ev.t - state.downAt < opts.holdMs) return [{ ...state, phase: "passthrough" }, { kind: "passthrough" }];
        if (ev.t - state.downAt >= opts.holdMs) {
          const armed: GestureState = { ...state, phase: "armed" };
          if (moved && ev.type === "move") return [{ ...armed, phase: "grabbing", rect: rectFrom(o, ev) }, { kind: "armed" }];
          return [armed, { kind: "armed" }];
        }
      }
      return [state, { kind: "none" }];
    }
    case "armed": {
      const o = state.origin!;
      if (ev.type === "up") return [IDLE, { kind: "click" }];
      if (ev.type === "move" && Math.hypot(ev.x - o.x, ev.y - o.y) > opts.slopPx) {
        return [{ ...state, phase: "grabbing", rect: rectFrom(o, ev) }, { kind: "none" }];
      }
      return [state, { kind: "none" }];
    }
    case "grabbing": {
      const o = state.origin!;
      if (ev.type === "move") return [{ ...state, rect: rectFrom(o, ev) }, { kind: "none" }];
      if (ev.type === "up") {
        const rect = rectFrom(o, ev);
        if (rect.w < opts.minGrabPx || rect.h < opts.minGrabPx) return [IDLE, { kind: "none" }];
        return [IDLE, { kind: "grab", rect }];
      }
      return [state, { kind: "none" }];
    }
    case "passthrough":
      if (ev.type === "up") return [IDLE, { kind: "none" }];
      return [state, { kind: "none" }];
  }
}

/** Runs a list of events and returns the results that weren't "none" (for tests and replays). */
export function run(events: GestureEvent[], opts: GestureOptions = DEFAULT_GESTURE): GestureResult[] {
  let s = IDLE;
  const out: GestureResult[] = [];
  for (const e of events) {
    const [next, r] = step(s, e, opts);
    s = next;
    if (r.kind !== "none") out.push(r);
  }
  return out;
}
