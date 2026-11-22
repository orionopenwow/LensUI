import { useEffect, useRef } from "react";
import type { LensConfig } from "../types/lens";
import { applyThemePack, packById } from "./packs";

/**
 * Time-of-day theme switching: one pack for day, one for night, switched either at fixed
 * clock times or at local sunrise / sunset computed offline from a latitude and longitude.
 */
export interface ThemeSchedule {
  enabled: boolean;
  /** "fixed" uses dayStart / nightStart; "sun" uses sunrise / sunset at latitude / longitude. */
  mode: "fixed" | "sun";
  dayPack: string;
  nightPack: string;
  /** Local 24h "HH:MM". */
  dayStart: string;
  nightStart: string;
  /** Degrees; north and east are positive. */
  latitude: number;
  longitude: number;
}

export const DEFAULT_THEME_SCHEDULE: ThemeSchedule = {
  enabled: false,
  mode: "fixed",
  dayPack: "alabaster-daylight",
  nightPack: "obsidian",
  dayStart: "07:00",
  nightStart: "19:00",
  latitude: 0,
  longitude: 0,
};

/** LensConfig plus the optional schedule field (see wiring notes: `themeSchedule`). */
export type ConfigWithSchedule = LensConfig & { themeSchedule?: Partial<ThemeSchedule> | null };

/** Fills in and sanitizes whatever is stored in config, so callers always get a complete schedule. */
export function readSchedule(config: LensConfig | null | undefined): ThemeSchedule {
  const raw = (config as ConfigWithSchedule | null | undefined)?.themeSchedule ?? {};
  const d = DEFAULT_THEME_SCHEDULE;
  const time = (v: unknown, fallback: string) =>
    typeof v === "string" && parseClock(v) !== null ? v : fallback;
  const deg = (v: unknown, limit: number) =>
    typeof v === "number" && Number.isFinite(v) ? Math.max(-limit, Math.min(limit, v)) : 0;
  return {
    enabled: raw.enabled === true,
    mode: raw.mode === "sun" ? "sun" : "fixed",
    dayPack: typeof raw.dayPack === "string" && raw.dayPack ? raw.dayPack : d.dayPack,
    nightPack: typeof raw.nightPack === "string" && raw.nightPack ? raw.nightPack : d.nightPack,
    dayStart: time(raw.dayStart, d.dayStart),
    nightStart: time(raw.nightStart, d.nightStart),
    latitude: deg(raw.latitude, 90),
    longitude: deg(raw.longitude, 180),
  };
}

/** "HH:MM" -> minutes after midnight, or null if malformed. */
export function parseClock(text: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h <= 23 && min <= 59 ? h * 60 + min : null;
}

const RAD = Math.PI / 180;
const J2000 = 2451545.0;

export interface SunTimes {
  /** null during polar day or polar night. */
  sunrise: Date | null;
  sunset: Date | null;
  /** Set when the sun does not cross the horizon that day. */
  polar: "day" | "night" | null;
}

/**
 * Sunrise and sunset for the solar day containing `date` at the given coordinates
 * (the standard "sunrise equation"; accurate to a few minutes away from the poles).
 * Pure math, no network, no time-zone database: results are absolute instants.
 */
export function sunTimes(date: Date, latitude: number, longitude: number): SunTimes {
  const julian = date.getTime() / 86400000 + 2440587.5;
  // Solar day number whose local solar noon is nearest to `date`.
  const n = Math.round(julian - J2000 + longitude / 360);
  const meanSolarNoon = n - longitude / 360;
  const meanAnomaly = (((357.5291 + 0.98560028 * meanSolarNoon) % 360) + 360) % 360;
  const m = meanAnomaly * RAD;
  const center = 1.9148 * Math.sin(m) + 0.02 * Math.sin(2 * m) + 0.0003 * Math.sin(3 * m);
  const eclipticLon = ((((meanAnomaly + center + 180 + 102.9372) % 360) + 360) % 360) * RAD;
  const transit = J2000 + meanSolarNoon + 0.0053 * Math.sin(m) - 0.0069 * Math.sin(2 * eclipticLon);
  const sinDecl = Math.sin(eclipticLon) * Math.sin(23.4397 * RAD);
  const cosDecl = Math.cos(Math.asin(sinDecl));
  const lat = latitude * RAD;
  // -0.833 degrees: atmospheric refraction plus the sun's apparent radius.
  const cosHour =
    (Math.sin(-0.833 * RAD) - Math.sin(lat) * sinDecl) / (Math.cos(lat) * cosDecl);
  if (cosHour > 1) return { sunrise: null, sunset: null, polar: "night" };
  if (cosHour < -1) return { sunrise: null, sunset: null, polar: "day" };
  const hourAngle = Math.acos(cosHour) / RAD;
  const toDate = (j: number) => new Date((j - 2440587.5) * 86400000);
  return {
    sunrise: toDate(transit - hourAngle / 360),
    sunset: toDate(transit + hourAngle / 360),
    polar: null,
  };
}

/** True when `date` falls in the schedule's daytime. */
export function isDaytime(schedule: ThemeSchedule, date: Date): boolean {
  if (schedule.mode === "sun") {
    const sun = sunTimes(date, schedule.latitude, schedule.longitude);
    if (sun.polar) return sun.polar === "day";
    const t = date.getTime();
    return t >= sun.sunrise!.getTime() && t < sun.sunset!.getTime();
  }
  const day = parseClock(schedule.dayStart) ?? 7 * 60;
  const night = parseClock(schedule.nightStart) ?? 19 * 60;
  const now = date.getHours() * 60 + date.getMinutes();
  if (day === night) return true;
  // Normal case: day 07:00 -> night 19:00. Also handles a "day" that wraps past midnight.
  return day < night ? now >= day && now < night : now >= day || now < night;
}

/** The pack id that should be active at `date`, or null when scheduling is off. */
export function packForNow(schedule: ThemeSchedule, date: Date): string | null {
  if (!schedule.enabled) return null;
  return isDaytime(schedule, date) ? schedule.dayPack : schedule.nightPack;
}

/**
 * Applies the scheduled pack. Pass `enabled = true` from exactly ONE surface (the Dock, which
 * is always running) so two windows never race to write the config.
 *
 * It only acts when the scheduled target changes (sunrise, sunset, or the schedule itself being
 * edited) and at startup. If the user picks another pack by hand in between, that choice
 * stands until the next switch-over.
 */
export function useThemeSchedule(
  config: LensConfig | null,
  updateConfig: (next: LensConfig) => Promise<void> | void,
  enabled: boolean
): void {
  const configRef = useRef(config);
  configRef.current = config;
  const updateRef = useRef(updateConfig);
  updateRef.current = updateConfig;
  const lastTarget = useRef<string | null>(null);

  const schedule = readSchedule(config);
  const scheduleKey = JSON.stringify(schedule);

  useEffect(() => {
    if (!enabled) return;
    const check = () => {
      const cfg = configRef.current;
      if (!cfg) return;
      const target = packForNow(readSchedule(cfg), new Date());
      if (target === lastTarget.current) return;
      lastTarget.current = target;
      if (target && cfg.theme.preset !== target && packById(target)) {
        void updateRef.current(applyThemePack(cfg, target));
      }
    };
    check();
    const timer = window.setInterval(check, 60_000);
    return () => window.clearInterval(timer);
    // Re-evaluate immediately when the schedule is edited or the config first loads.
  }, [enabled, scheduleKey, config === null]);
}
