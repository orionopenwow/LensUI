// Mixer row order: apps playing now first, then the rest, each most-recently-audible first.
// Rows only move when an app starts or stops playing, so the list never jumps under the pointer.

export interface MixState {
  /** pids in display order */
  order: number[];
  /** pids that were playing at the last update */
  active: Set<number>;
}

export const emptyMix = (): MixState => ({ order: [], active: new Set() });

export function reorderSessions(prev: MixState, now: { pid: number; active: boolean }[]): MixState {
  const present = new Map(now.map((s) => [s.pid, s.active]));
  const active = new Set(now.filter((s) => s.active).map((s) => s.pid));
  // Keep existing rows in place.
  let order = prev.order.filter((pid) => present.has(pid));
  const started = now.filter((s) => s.active && !prev.active.has(s.pid)).map((s) => s.pid);
  const stopped = now.filter((s) => !s.active && prev.active.has(s.pid)).map((s) => s.pid);
  const fresh = now.filter((s) => !prev.order.includes(s.pid) && !s.active).map((s) => s.pid);
  order = order.filter((pid) => !started.includes(pid) && !stopped.includes(pid));
  const playing = order.filter((pid) => active.has(pid));
  const idle = order.filter((pid) => !active.has(pid));
  return {
    // Just started → top of "playing now"; just stopped → top of the rest (it was heard most recently).
    order: [...started, ...playing, ...stopped, ...idle, ...fresh],
    active,
  };
}
