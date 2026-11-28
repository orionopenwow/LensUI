// Desktop widget kinds and the pure bits each widget needs (docs/features/desktop-widgets.md).
// Everything here reads data Lens already has on this PC; nothing fetches.
import type { Size } from "./grid";

export type KindId = "calendar" | "clock" | "weather" | "batteries" | "music" | "notes" | "today" | "gallery";

export interface KindDef {
  id: KindId;
  name: string;
  /** One line for the gallery. */
  desc: string;
  sizes: readonly Size[];
  /** Words the gallery search also matches. */
  words: string;
  /** Uses the network (through an approved Dashboard widget). */
  fetches: boolean;
}

export const KINDS: readonly KindDef[] = [
  { id: "batteries", name: "Batteries", desc: "This PC's battery: charge, charging and time left.", sizes: ["small", "medium", "large"], words: "battery power charge laptop", fetches: false },
  { id: "calendar", name: "Calendar", desc: "The time, today's date and this month, with today's items on the large size.", sizes: ["small", "medium", "large"], words: "calendar date month clock time day today", fetches: false },
  { id: "clock", name: "Clock", desc: "An analog clock, and a world clock with four cities.", sizes: ["small", "medium", "large"], words: "time world clock cities analog", fetches: false },
  { id: "music", name: "Now playing", desc: "What's playing, with play, pause and skip.", sizes: ["small", "medium", "large"], words: "music now playing spotify media song", fetches: false },
  { id: "notes", name: "Notes", desc: "Your latest Lens Notes. Click one to open it.", sizes: ["small", "medium", "large"], words: "notes shelf memo", fetches: false },
  { id: "today", name: "Today", desc: "Today's items from the Lens calendar. Tick them off here.", sizes: ["small", "medium", "large"], words: "reminders today calendar tasks todo events", fetches: false },
  { id: "weather", name: "Weather", desc: "A Weather widget you added on the Dashboard, on your desktop.", sizes: ["small", "medium", "large"], words: "weather forecast temperature", fetches: true },
  { id: "gallery", name: "From the Dashboard", desc: "Other widgets you added on the Dashboard (feeds, releases, prices, clocks, this PC).", sizes: ["small", "medium", "large"], words: "dashboard feed rss github crypto system", fetches: true },
];

export const kindDef = (id: string) => KINDS.find((k) => k.id === id);

export const SIZE_LABEL: Record<Size, string> = { small: "Small", medium: "Medium", large: "Large" };

/** Gallery search: name, description or extra words. */
export function searchKinds(q: string, kinds: readonly KindDef[] = KINDS): KindDef[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [...kinds];
  return kinds.filter((k) => words.every((w) => `${k.name} ${k.desc} ${k.words}`.toLowerCase().includes(w)));
}

// ---- clock -------------------------------------------------------------------------------------

export const DEFAULT_ZONES = ["local", "America/New_York", "Europe/London", "Asia/Tokyo"];

export function validZone(z: string): boolean {
  if (z === "local") return true;
  try {
    new Intl.DateTimeFormat("en", { timeZone: z });
    return true;
  } catch {
    return false;
  }
}

/** Up to four valid zones from a comma list; the defaults fill any gap. */
export function parseZones(s: string | undefined): string[] {
  const got = (s ?? "")
    .split(",")
    .map((z) => z.trim())
    .filter((z) => z && validZone(z));
  const out = [...new Set(got)].slice(0, 4);
  for (const d of DEFAULT_ZONES) if (out.length < 4 && !out.includes(d)) out.push(d);
  return out;
}

export function cityOf(zone: string): string {
  if (zone === "local") return "Here";
  return zone.split("/").pop()!.replace(/_/g, " ");
}

/** Hours, minutes and seconds of `now` in `zone`. */
export function timeIn(now: Date, zone: string): { h: number; m: number; s: number } {
  if (zone === "local") return { h: now.getHours(), m: now.getMinutes(), s: now.getSeconds() };
  try {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(now);
    const n = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
    return { h: n("hour") % 24, m: n("minute"), s: n("second") };
  } catch {
    return { h: now.getHours(), m: now.getMinutes(), s: now.getSeconds() };
  }
}

/** Hand angles in degrees (12 o'clock = 0). The second hand moves on its own (CSS). */
export function handAngles(t: { h: number; m: number; s: number }) {
  return { hour: ((t.h % 12) + t.m / 60) * 30, minute: (t.m + t.s / 60) * 6, second: t.s * 6 };
}

/** CSS animation-delay that puts a 60 s sweep at the current second. */
export function secondDelay(now: Date): string {
  return `-${(now.getSeconds() + now.getMilliseconds() / 1000).toFixed(2)}s`;
}

/** "+5h", "−3h", "" for the same offset. */
export function offsetLabel(now: Date, zone: string): string {
  if (zone === "local") return "Today";
  const t = timeIn(now, zone);
  let d = t.h * 60 + t.m - (now.getHours() * 60 + now.getMinutes());
  if (d > 720) d -= 1440;
  if (d < -720) d += 1440;
  if (d === 0) return "Same time";
  const h = Math.round((d / 60) * 2) / 2;
  return `${h > 0 ? "+" : "−"}${Math.abs(h)}h`;
}

export function hhmm(t: { h: number; m: number }, hour12 = true): string {
  const m = String(t.m).padStart(2, "0");
  if (!hour12) return `${String(t.h).padStart(2, "0")}:${m}`;
  const h = t.h % 12 || 12;
  return `${h}:${m}`;
}

// ---- calendar ----------------------------------------------------------------------------------

/** The first day of the week for this PC's language (0 Sunday … 6 Saturday); Sunday if unknown. */
export function weekStart(locale?: string): number {
  try {
    const loc = new Intl.Locale(locale ?? navigator.language) as Intl.Locale & { weekInfo?: { firstDay: number }; getWeekInfo?: () => { firstDay: number } };
    const day = (loc.getWeekInfo?.() ?? loc.weekInfo)?.firstDay;
    return typeof day === "number" ? day % 7 : 0;
  } catch {
    return 0;
  }
}

/** The month of `year`/`month` (0-based) as weeks of day numbers, null where a week has no day
 *  of this month; weeks start on `first` (0 Sunday). Always whole weeks, 4 to 6 of them. */
export function monthGrid(year: number, month: number, first = 0): (number | null)[][] {
  const days = new Date(year, month + 1, 0).getDate();
  const lead = (new Date(year, month, 1).getDay() - first + 7) % 7;
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** Narrow weekday letters in grid order ("S M T W T F S" for Sunday first). */
export function weekdayLetters(first = 0, locale?: string): string[] {
  const f = new Intl.DateTimeFormat(locale, { weekday: "narrow" });
  // 2026-11-01 is a Sunday.
  return Array.from({ length: 7 }, (_, i) => f.format(new Date(2026, 10, 1 + ((first + i) % 7))));
}

// ---- flyout ------------------------------------------------------------------------------------

/** Where a widget starts when it flies out (and ends when it is drawn back in): shrunk onto the
 *  origin point, as a transform from its own place. `t` is 0 at the origin, 1 in place. */
export function flyFrom(rect: { x: number; y: number; w: number; h: number }, origin: { x: number; y: number }, scale = 0.18): { dx: number; dy: number; scale: number } {
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  return { dx: origin.x - cx, dy: origin.y - cy, scale };
}

/** Stagger for each widget: the nearest to the origin leaves first and comes back last, so the
 *  fly-out and the draw-in mirror each other. Returns a delay in ms per index; total ≤ `span`. */
export function flyStagger(rects: { x: number; y: number; w: number; h: number }[], origin: { x: number; y: number }, step = 32, span = 180): number[] {
  const dist = rects.map((r) => Math.hypot(r.x + r.w / 2 - origin.x, r.y + r.h / 2 - origin.y));
  const order = dist.map((d, i) => [d, i] as const).sort((a, b) => a[0] - b[0]);
  const each = order.length > 1 ? Math.min(step, span / (order.length - 1)) : 0;
  const out = new Array<number>(rects.length).fill(0);
  order.forEach(([, i], rank) => (out[i] = Math.round(rank * each)));
  return out;
}

// ---- today -------------------------------------------------------------------------------------

/** The Lens calendar's events (localStorage `lens_calendar_events_v1`). */
export interface CalEvent {
  id: string;
  dateKey: string;
  time: string;
  title: string;
  done: boolean;
}

export const CALENDAR_KEY = "lens_calendar_events_v1";
const pad = (n: number) => String(n).padStart(2, "0");
export const dateKeyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function readCalendar(raw: string | null): CalEvent[] {
  try {
    const v = JSON.parse(raw ?? "[]");
    return Array.isArray(v) ? v.filter((e) => e && typeof e.id === "string" && typeof e.title === "string") : [];
  } catch {
    return [];
  }
}

/** Today's open items, timed ones first by time, then untimed. */
export function todayOpen(events: CalEvent[], now: Date): CalEvent[] {
  const key = dateKeyOf(now);
  return events
    .filter((e) => e.dateKey === key && !e.done)
    .sort((a, b) => (a.time ? 0 : 1) - (b.time ? 0 : 1) || a.time.localeCompare(b.time) || a.title.localeCompare(b.title));
}

/** The same list with one item ticked off (everything else untouched). */
export function tickOff(events: CalEvent[], id: string): CalEvent[] {
  return events.map((e) => (e.id === id ? { ...e, done: true } : e));
}

// ---- weather -----------------------------------------------------------------------------------

export interface WeatherNow {
  temp: number;
  code: number;
  hi: number | null;
  lo: number | null;
  wind: number | null;
  unit: "°C" | "°F";
}

/** Open-Meteo's answer (the gallery Weather widget's address) as the few numbers shown. */
export function weatherFrom(body: string, units: string | undefined): WeatherNow | null {
  try {
    const d = JSON.parse(body);
    const t = d?.current?.temperature_2m;
    if (typeof t !== "number") return null;
    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
    return {
      temp: t,
      code: Number(d.current.weather_code ?? -1),
      hi: num(d.daily?.temperature_2m_max?.[0]),
      lo: num(d.daily?.temperature_2m_min?.[0]),
      wind: num(d.current.wind_speed_10m),
      unit: (units ?? "c").toLowerCase().startsWith("f") ? "°F" : "°C",
    };
  } catch {
    return null;
  }
}

// ---- batteries ---------------------------------------------------------------------------------

/** stroke-dasharray for a ring of radius `r` filled to `percent`. */
export function ringDash(percent: number | null | undefined, r: number): string {
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, typeof percent === "number" && Number.isFinite(percent) ? percent : 0));
  return `${((p / 100) * c).toFixed(2)} ${c.toFixed(2)}`;
}

export function timeLeft(seconds: number | null | undefined): string | null {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0) return null;
  const m = Math.round(seconds / 60);
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min left` : `${m} min left`;
}
