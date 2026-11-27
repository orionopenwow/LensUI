// "Remind me" on a to-do in Lens Notes: a few honest choices that become a Lens Timer countdown or
// a one-off alarm. Pure; the same backend rings whether or not either window is open.

export interface ReminderChoice {
  id: "hour" | "evening" | "morning";
  /** "In an hour", "This evening", "Tomorrow morning". */
  label: string;
  /** The local time it rings, "18:00". */
  at: string;
  /** A countdown (seconds from now) or a one-off alarm at a local time of day. */
  kind: "timer" | "alarm";
  seconds?: number;
  hour?: number;
  minute?: number;
}

const two = (n: number) => String(n).padStart(2, "0");
export const hhmm = (d: Date) => `${two(d.getHours())}:${two(d.getMinutes())}`;

export const EVENING_HOUR = 18;
export const MORNING_HOUR = 9;

/** The choices at `now` (local time). "This evening" only while the evening is still ahead. */
export function reminderChoices(now: Date): ReminderChoice[] {
  const mins = now.getHours() * 60 + now.getMinutes();
  const out: ReminderChoice[] = [{ id: "hour", label: "In an hour", at: hhmm(new Date(now.getTime() + 3_600_000)), kind: "timer", seconds: 3600 }];
  // Leave at least half an hour, or it is the same as "soon".
  if (mins <= EVENING_HOUR * 60 - 30) out.push({ id: "evening", label: "This evening", at: `${two(EVENING_HOUR)}:00`, kind: "alarm", hour: EVENING_HOUR, minute: 0 });
  // A one-off alarm rings the next time the clock shows that time: later today before 9, else tomorrow.
  out.push({ id: "morning", label: mins < MORNING_HOUR * 60 ? "This morning" : "Tomorrow morning", at: `${two(MORNING_HOUR)}:00`, kind: "alarm", hour: MORNING_HOUR, minute: 0 });
  return out;
}

/** A to-do line as a reminder label: no checkbox, no markdown, at most 60 characters. */
export function reminderLabel(todoLine: string): string {
  const s = todoLine
    .replace(/^\s*[-*]\s+\[[ xX]\]\s?/, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/[*_`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return (s.length > 60 ? `${s.slice(0, 59).trimEnd()}…` : s) || "To-do";
}

/** What Lens says once the reminder is set. */
export function reminderSet(choice: ReminderChoice, label: string): string {
  return `Lens Timer will remind you at ${choice.at}: ${label}`;
}
