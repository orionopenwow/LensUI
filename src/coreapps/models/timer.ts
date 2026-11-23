// Lens Timer: the stopwatch state machine and alarm helpers. Timers and alarms themselves run in
// Rust (coreapps/timers.rs) so they ring with the window closed. Pure.

export interface Stopwatch {
  running: boolean;
  /** When the current run started (ms). */
  startedAt: number | null;
  /** Time banked from earlier runs (ms). */
  banked: number;
  /** Elapsed time at each lap, oldest first (ms). */
  laps: number[];
}

export const STOPWATCH0: Stopwatch = { running: false, startedAt: null, banked: 0, laps: [] };

export type StopwatchAction = { type: "start"; now: number } | { type: "stop"; now: number } | { type: "lap"; now: number } | { type: "reset" };

export const elapsed = (s: Stopwatch, now: number) => s.banked + (s.running && s.startedAt != null ? Math.max(0, now - s.startedAt) : 0);

export function stopwatch(s: Stopwatch, a: StopwatchAction): Stopwatch {
  switch (a.type) {
    case "start":
      return s.running ? s : { ...s, running: true, startedAt: a.now };
    case "stop":
      return s.running ? { ...s, running: false, startedAt: null, banked: elapsed(s, a.now) } : s;
    case "lap":
      return s.running ? { ...s, laps: [...s.laps, elapsed(s, a.now)].slice(-200) } : s;
    case "reset":
      return s.running ? s : STOPWATCH0;
  }
}

/** Lap lengths (each lap minus the one before) with the fastest and slowest marked. */
export function splits(laps: number[]): { n: number; split: number; total: number; best: boolean; worst: boolean }[] {
  const out = laps.map((t, i) => ({ n: i + 1, split: t - (i ? laps[i - 1] : 0), total: t, best: false, worst: false }));
  if (out.length >= 2) {
    const min = Math.min(...out.map((l) => l.split));
    const max = Math.max(...out.map((l) => l.split));
    out.forEach((l) => {
      l.best = l.split === min;
      l.worst = l.split === max;
    });
  }
  return out;
}

export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Bit 0 = Monday … bit 6 = Sunday (matches timers.rs). */
export function describeDays(mask: number): string {
  const m = mask & 0x7f;
  if (m === 0) return "Once";
  if (m === 0x7f) return "Every day";
  if (m === 0b0011111) return "Weekdays";
  if (m === 0b1100000) return "Weekends";
  return DAYS.filter((_, i) => m & (1 << i)).join(", ");
}

export const toggleDay = (mask: number, day: number) => (mask ^ (1 << day)) & 0x7f;

/** "7:30", "07:30", "7.30pm", "19:30", "7pm", "730" → [hour, minute] (24 h). */
export function parseTime(text: string): [number, number] | null {
  const t = text.trim().toLowerCase().replace(/\s+/g, "");
  const m = /^(\d{1,2})(?:[:.h]?(\d{2}))?(am|pm|a|p)?$/.exec(t);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  const ap = m[3];
  if (min > 59) return null;
  if (ap) {
    if (h < 1 || h > 12) return null;
    if (ap.startsWith("p") && h !== 12) h += 12;
    if (ap.startsWith("a") && h === 12) h = 0;
  }
  if (h > 23) return null;
  return [h, min];
}

/** Minutes east of UTC for the alarm thread (JS's offset has the opposite sign). */
export const tzOffsetMin = (d = new Date()) => -d.getTimezoneOffset();

export const PRESETS = [
  { label: "1 min", secs: 60 },
  { label: "3 min", secs: 180 },
  { label: "5 min", secs: 300 },
  { label: "10 min", secs: 600 },
  { label: "15 min", secs: 900 },
  { label: "25 min", secs: 1500 },
  { label: "45 min", secs: 2700 },
  { label: "1 h", secs: 3600 },
];

/** Progress 0–1 of a countdown. */
export function progress(durationMs: number, remainingMs: number): number {
  if (durationMs <= 0) return 0;
  return Math.min(1, Math.max(0, 1 - remainingMs / durationMs));
}

/** Time left on a timer or pomodoro phase at `now` (ms). */
export function remainingOf(t: { endsAtMs: number | null; remainingMs: number; done: boolean }, now: number): number {
  if (t.done) return 0;
  return t.endsAtMs != null ? Math.max(0, t.endsAtMs - now) : Math.max(0, t.remainingMs);
}
