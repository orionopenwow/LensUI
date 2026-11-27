// One clock for every desktop widget (docs/features/desktop-widgets.md): a single 1 s timer that
// runs only while some widget listens and the host is on screen. Widgets never start timers of
// their own; minute listeners are called when the minute changes. Paused (hidden for a game,
// covered by windows, edit mode off-screen) means no timer at all.
import { useEffect, useRef, useState } from "react";

export type TickKind = "second" | "minute";
type Listener = (now: Date) => void;

const listeners: Record<TickKind, Set<Listener>> = { second: new Set(), minute: new Set() };
let timer: ReturnType<typeof setInterval> | null = null;
let paused = false;
let lastMinute = -1;

/** For tests: replaceable clock and timer functions. */
export const clock = {
  now: () => new Date(),
  every: (fn: () => void, ms: number) => setInterval(fn, ms),
  stop: (t: ReturnType<typeof setInterval>) => clearInterval(t),
};

function pulse() {
  const now = clock.now();
  for (const f of [...listeners.second]) f(now);
  const m = now.getHours() * 60 + now.getMinutes();
  if (m !== lastMinute) {
    lastMinute = m;
    for (const f of [...listeners.minute]) f(now);
  }
}

function sync() {
  const want = !paused && (listeners.second.size > 0 || listeners.minute.size > 0);
  if (want && timer === null) {
    timer = clock.every(pulse, 1000);
  } else if (!want && timer !== null) {
    clock.stop(timer);
    timer = null;
  }
}

/** Listen to the shared tick; returns the way to stop listening. */
export function subscribe(kind: TickKind, fn: Listener): () => void {
  listeners[kind].add(fn);
  sync();
  return () => {
    listeners[kind].delete(fn);
    sync();
  };
}

/** Stops (true) or resumes the one timer. Resuming catches every listener up at once. */
export function setTickPaused(p: boolean) {
  if (paused === p) return;
  paused = p;
  if (!p) {
    lastMinute = -1;
    pulse();
  }
  sync();
}

export function tickPaused(): boolean {
  return paused;
}

/** For tests and the perf scenario: is the timer running, and how many listen. */
export function tickDebug() {
  return { running: timer !== null, seconds: listeners.second.size, minutes: listeners.minute.size, paused };
}

/** The current time, updated every second or every minute by the shared tick. */
export function useTick(kind: TickKind): Date {
  const [now, setNow] = useState(() => clock.now());
  useEffect(() => subscribe(kind, setNow), [kind]);
  return now;
}

/** Calls `fn` on the shared tick every `everySeconds` seconds (and once now). */
export function useEvery(everySeconds: number, fn: () => void, enabled = true) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!enabled) return;
    let n = 0;
    ref.current();
    const kind: TickKind = everySeconds >= 60 && everySeconds % 60 === 0 ? "minute" : "second";
    const step = kind === "minute" ? everySeconds / 60 : Math.max(1, Math.round(everySeconds));
    return subscribe(kind, () => {
      n++;
      if (n % step === 0) ref.current();
    });
  }, [everySeconds, enabled]);
}
