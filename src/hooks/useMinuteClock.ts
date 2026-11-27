// A clock for things that show hours and minutes (the Top Bar's clock, the Dock's): it wakes once
// a minute, on the minute, and not at all while its window is hidden. The Top Bar used to redraw
// itself every second to show a time that changes once a minute, and the Dock's clock could be up
// to 15 seconds late.
import { useEffect, useState } from "react";

/** Milliseconds from `now` until the next whole minute (never 0: a tick on the minute waits a full one). */
export function msToNextMinute(now: Date): number {
  const into = now.getSeconds() * 1000 + now.getMilliseconds();
  return 60_000 - into;
}

/** The current time, updated on each minute while `active` and the page is visible. */
export function useMinuteClock(active = true): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!active) return;
    let timer = 0;
    const arm = () => {
      window.clearTimeout(timer);
      if (document.hidden) return;
      // +20 ms: land just after the minute, so the new minute is what gets read.
      timer = window.setTimeout(() => {
        setNow(new Date());
        arm();
      }, msToNextMinute(new Date()) + 20);
    };
    // Coming back (shown again, tab visible again): the time shown may be old.
    const refresh = () => {
      if (!document.hidden) setNow(new Date());
      arm();
    };
    refresh();
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [active]);
  return now;
}
