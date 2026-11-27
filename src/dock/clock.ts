/**
 * Two-line Dock clock (Unified style): the time on top, a short "weekday day month" below, both
 * in the user's locale and with Windows' 12/24-hour choice when Lens knows it.
 */
export interface StackedClock {
  time: string;
  date: string;
}

/** `clock24`: true / false from Windows, null or undefined to follow the locale. */
export function stackedClock(now: Date, clock24?: boolean | null, locale?: string | string[]): StackedClock {
  const loc = locale ?? [];
  const hour12 = clock24 === true ? false : clock24 === false ? true : undefined;
  let time: string;
  let date: string;
  try {
    time = now.toLocaleTimeString(loc, { hour: "numeric", minute: "2-digit", ...(hour12 === undefined ? {} : { hour12 }) });
  } catch {
    time = `${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`;
  }
  try {
    // "Thu 26 Nov" in en-GB, "Thu Nov 26" in en-US: the locale's order, without commas.
    date = now.toLocaleDateString(loc, { weekday: "short", day: "numeric", month: "short" }).replace(/,/g, "").replace(/\s+/g, " ").trim();
  } catch {
    date = now.toDateString().slice(0, 10);
  }
  return { time, date };
}
