/**
 * Pure helpers for the productivity-input features: hot corners, Alt+drag, app-summon hotkeys,
 * Do Not Disturb quiet hours and the calendar's first day of the week. Unit-tested in
 * src/__tests__/productivity.test.ts. Every default here is "off", matching the Rust side.
 */
import type * as Gen from "../types/generated";
import type { LensConfig } from "../types/lens";

export type HotCornersConfig = Gen.HotCornersConfig;
export type AltDragConfig = Gen.AltDragConfig;
export type AppSummonConfig = Gen.AppSummonConfig;
export type SummonBinding = Gen.SummonBinding;
export type DndSchedule = Gen.DndSchedule;
export type DndRange = Gen.DndRange;
export type DndStatus = Gen.DndStatus;

export type CornerKey = "topLeft" | "topRight" | "bottomLeft" | "bottomRight";
export const CORNER_KEYS: CornerKey[] = ["topLeft", "topRight", "bottomLeft", "bottomRight"];
export const CORNER_LABELS: Record<CornerKey, string> = {
  topLeft: "Top left",
  topRight: "Top right",
  bottomLeft: "Bottom left",
  bottomRight: "Bottom right",
};

export const CORNER_ACTIONS: { id: string; label: string }[] = [
  { id: "none", label: "Nothing" },
  { id: "overview", label: "Overview" },
  { id: "show-desktop", label: "Show desktop" },
  { id: "launcher", label: "Launcher" },
  { id: "palette", label: "Command palette" },
  { id: "widgets", label: "Widgets" },
  { id: "quick-settings", label: "Quick Settings" },
  { id: "notifications", label: "Notifications" },
  { id: "lock", label: "Lock screen" },
];

export const DEFAULT_HOT_CORNERS: HotCornersConfig = {
  enabled: false,
  topLeft: "overview",
  topRight: "none",
  bottomLeft: "none",
  bottomRight: "none",
  dwellMs: 250,
  sizePx: 3,
  allMonitors: true,
};

export const DEFAULT_ALT_DRAG: AltDragConfig = {
  enabled: false,
  modifier: "alt",
  resize: true,
  raise: true,
  restoreMaximized: true,
  exclude: [],
};

export const DEFAULT_APP_SUMMON: AppSummonConfig = { enabled: false, bindings: [] };

export const DEFAULT_DND_SCHEDULE: DndSchedule = {
  enabled: false,
  ranges: [{ startMin: 22 * 60, endMin: 7 * 60, days: [0, 1, 2, 3, 4, 5, 6] }],
  autoFullscreen: false,
};

type Partial2<T> = { [K in keyof T]?: T[K] };
type WithProductivity = LensConfig & {
  hotCorners?: Partial2<HotCornersConfig>;
  altDrag?: Partial2<AltDragConfig>;
  appSummon?: Partial2<AppSummonConfig>;
  dndSchedule?: Partial2<DndSchedule>;
};

export function readHotCorners(config: LensConfig): HotCornersConfig {
  return { ...DEFAULT_HOT_CORNERS, ...((config as WithProductivity | null)?.hotCorners ?? {}) };
}
export function readAltDrag(config: LensConfig): AltDragConfig {
  const raw = (config as WithProductivity | null)?.altDrag ?? {};
  return { ...DEFAULT_ALT_DRAG, ...raw, exclude: raw.exclude ?? [] };
}
export function readAppSummon(config: LensConfig): AppSummonConfig {
  const raw = (config as WithProductivity | null)?.appSummon ?? {};
  return { ...DEFAULT_APP_SUMMON, ...raw, bindings: raw.bindings ?? [] };
}
export function readDndSchedule(config: Partial<LensConfig> | null | undefined): DndSchedule {
  const raw = ((config ?? {}) as WithProductivity).dndSchedule ?? {};
  return { ...DEFAULT_DND_SCHEDULE, ...raw, ranges: raw.ranges ?? DEFAULT_DND_SCHEDULE.ranges };
}

export const normalizeApp = (raw: string): string => {
  const base = (raw.trim().split(/[\\/]/).pop() ?? "").trim().toLowerCase();
  if (!base) return "";
  return base.endsWith(".exe") ? base : `${base}.exe`;
};

// ===== Hotkeys =====

const MOD_KEYS = new Set(["Control", "Alt", "Shift", "Meta", "OS", "AltGraph"]);

/**
 * Turns a keydown into the backend's canonical form ("ctrl+alt+KeyT"), or null while only
 * modifiers are down / for keys a summon hotkey can't use.
 */
export function eventToHotkey(e: {
  code: string;
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}): string | null {
  if (MOD_KEYS.has(e.key)) return null;
  const code = e.code;
  const ok =
    /^Key[A-Z]$/.test(code) ||
    /^Digit[0-9]$/.test(code) ||
    /^F([1-9]|1[0-9]|2[0-4])$/.test(code) ||
    code === "Space" ||
    code === "Backquote" ||
    code === "Enter";
  if (!ok) return null;
  const parts: string[] = [];
  if (e.ctrlKey) parts.push("ctrl");
  if (e.altKey) parts.push("alt");
  if (e.shiftKey) parts.push("shift");
  if (e.metaKey) parts.push("super");
  parts.push(code);
  return parts.join("+");
}

const KEY_LABELS: Record<string, string> = { ctrl: "Ctrl", alt: "Alt", shift: "Shift", super: "Win", Backquote: "`", Space: "Space", Enter: "Enter" };

/** "ctrl+alt+KeyT" → ["Ctrl", "Alt", "T"] for <kbd> chips. */
export function hotkeyParts(canonical: string): string[] {
  if (!canonical) return [];
  return canonical.split("+").map((p) => {
    if (KEY_LABELS[p]) return KEY_LABELS[p];
    if (/^Key[A-Z]$/.test(p)) return p.slice(3);
    if (/^Digit[0-9]$/.test(p)) return p.slice(5);
    return p.length <= 4 ? p.toUpperCase() : p;
  });
}

// ===== Quiet hours =====

export const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];
export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function minToTime(min: number): string {
  const m = Math.max(0, Math.min(24 * 60 - 1, Math.round(min)));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function timeToMin(text: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (h > 23 || mm > 59) return null;
  return h * 60 + mm;
}

/** Mirrors win_notifications::range_active (Rust is the authority; this drives the preview). */
export function rangeActive(r: DndRange, weekday: number, minute: number): boolean {
  const on = (d: number) => r.days.includes(d);
  const prev = (weekday + 6) % 7;
  if (r.startMin === r.endMin) return on(weekday);
  if (r.startMin < r.endMin) return on(weekday) && minute >= r.startMin && minute < r.endMin;
  return (on(weekday) && minute >= r.startMin) || (on(prev) && minute < r.endMin);
}

/** "Every day", "Weekdays", "Weekends", "Mon, Wed, Fri". */
export function describeDays(days: number[]): string {
  const set = [...new Set(days)].filter((d) => d >= 0 && d < 7).sort();
  if (set.length === 7) return "Every day";
  if (set.length === 0) return "No days";
  if (set.join() === "1,2,3,4,5") return "Weekdays";
  if (set.join() === "0,6") return "Weekends";
  return set.map((d) => DAY_NAMES[d].slice(0, 3)).join(", ");
}

export function describeRange(r: DndRange): string {
  if (r.startMin === r.endMin) return `All day · ${describeDays(r.days)}`;
  const overnight = r.endMin < r.startMin ? " (overnight)" : "";
  return `${minToTime(r.startMin)}–${minToTime(r.endMin)}${overnight} · ${describeDays(r.days)}`;
}

/** One status line for the pane. */
export function describeDndStatus(s: DndStatus | null | undefined, manual: boolean): string {
  if (manual) return "Pop-ups are paused. Timers still alert.";
  if (!s || !s.active) return "Notifications pop up as they arrive.";
  if (s.reason === "schedule")
    return s.untilMin != null ? `Quiet hours until ${minToTime(s.untilMin)}. Timers still alert.` : "Quiet hours. Timers still alert.";
  if (s.reason === "fullscreen") return "Paused while a fullscreen app or presentation is in front.";
  return "Pop-ups are paused.";
}

// ===== First day of the week =====

export type WeekStartPref = "auto" | "0" | "1" | "6";
export const WEEK_START_KEY = "lens_week_start";

/** Locale default: Intl weekInfo where available (1 = Monday … 7 = Sunday), else a short list. */
export function localeWeekStart(locale: string): number {
  try {
    const loc = new Intl.Locale(locale) as Intl.Locale & {
      weekInfo?: { firstDay: number };
      getWeekInfo?: () => { firstDay: number };
    };
    const info = loc.getWeekInfo?.() ?? loc.weekInfo;
    if (info && typeof info.firstDay === "number") return info.firstDay % 7;
  } catch {
    /* fall through */
  }
  const region = (locale.split(/[-_]/)[1] ?? "").toUpperCase();
  const sunday = ["US", "CA", "JP", "BR", "MX", "IL", "IN", "PH", "KR", "TW", "ZA", "AU", "HK", "SA"];
  const saturday = ["AE", "EG", "IR", "AF", "DZ", "KW", "QA", "OM", "BH", "JO", "SY", "IQ", "LY", "SD"];
  if (!region) return 0;
  if (sunday.includes(region)) return 0;
  if (saturday.includes(region)) return 6;
  return 1;
}

export function resolveWeekStart(pref: string | null | undefined, locale: string): number {
  if (pref === "0" || pref === "1" || pref === "6") return Number(pref);
  return localeWeekStart(locale);
}

/** Weekday headers starting at `start` (0 = Sunday). */
export function weekdayLabels(start: number): string[] {
  const base = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
  return Array.from({ length: 7 }, (_, i) => base[(start + i) % 7]);
}

/** Empty cells before day 1 when the month starts on `firstDow` and weeks start on `start`. */
export function leadingBlanks(firstDow: number, start: number): number {
  return (firstDow - start + 7) % 7;
}
