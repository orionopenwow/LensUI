/**
 * Living Themes settings and location. Everything here stays on this PC (localStorage, shared by
 * every Lens window). Nothing is sent anywhere; the only network use in the family is the opt-in
 * weather fetch in ./weather.ts, which is off by default.
 *
 * Location, in order:
 *   1. a manual city or latitude/longitude typed in Theme & Look → Living themes;
 *   2. the Theme Schedule location (the same one the Sky Clock uses);
 *   3. an approximation from the time zone (a representative city for the zone, or the zone's
 *      UTC offset × 15° for longitude when the zone is unknown).
 */
import { getSkyLocation } from "../scenes/skyclock";
import type { WeatherKind } from "./sky";

export type LivingMotion = "still" | "subtle";

export interface LivingSettings {
  location: { mode: "auto" | "manual"; latitude: number; longitude: number; label: string };
  /** Glass and accent follow the sky colour (living packs, and any pack while a living wallpaper runs). */
  tint: boolean;
  motion: LivingMotion;
  clouds: boolean;
  /** One continuous sky across all monitors (each screen shows its slice). */
  spanMonitors: boolean;
  weather: { online: boolean; manual: WeatherKind };
}

export const DEFAULT_LIVING: LivingSettings = {
  location: { mode: "auto", latitude: 0, longitude: 0, label: "" },
  tint: false,
  motion: "subtle",
  clouds: true,
  spanMonitors: false,
  weather: { online: false, manual: "clear" },
};

const KEY = "lens.living.v1";

function storage(): Storage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

export function readLiving(): LivingSettings {
  const st = storage();
  let raw: Partial<LivingSettings> = {};
  try {
    raw = st ? (JSON.parse(st.getItem(KEY) ?? "{}") as Partial<LivingSettings>) : {};
  } catch {
    raw = {};
  }
  return normaliseLiving(raw);
}

export function normaliseLiving(raw: Partial<LivingSettings>): LivingSettings {
  const d = DEFAULT_LIVING;
  const loc = { ...d.location, ...(raw.location ?? {}) };
  const num = (v: unknown, lo: number, hi: number, dflt: number) => (typeof v === "number" && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : dflt);
  const kinds: WeatherKind[] = ["clear", "cloudy", "rain", "snow", "fog", "storm"];
  return {
    location: {
      mode: loc.mode === "manual" ? "manual" : "auto",
      latitude: num(loc.latitude, -90, 90, 0),
      longitude: num(loc.longitude, -180, 180, 0),
      label: typeof loc.label === "string" ? loc.label.slice(0, 80) : "",
    },
    tint: raw.tint === true,
    motion: raw.motion === "still" ? "still" : "subtle",
    clouds: raw.clouds !== false,
    spanMonitors: raw.spanMonitors === true,
    weather: {
      online: raw.weather?.online === true,
      manual: kinds.includes(raw.weather?.manual as WeatherKind) ? (raw.weather!.manual as WeatherKind) : "clear",
    },
  };
}

type Listener = (s: LivingSettings) => void;
const listeners = new Set<Listener>();

export function writeLiving(patch: Partial<LivingSettings>): LivingSettings {
  const next = normaliseLiving({ ...readLiving(), ...patch });
  try {
    storage()?.setItem(KEY, JSON.stringify(next));
  } catch {
    /* private mode / quota: keep the in-memory change */
  }
  listeners.forEach((l) => l(next));
  return next;
}

/** Called on changes from this window and (via the storage event) from other Lens windows. */
export function onLivingChange(l: Listener): () => void {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) l(readLiving());
  };
  if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(l);
    if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
  };
}

// ---- Location -------------------------------------------------------------------------------

/** Representative coordinates for common IANA zones (rounded to 0.1°). */
const ZONES: Record<string, [number, number]> = {
  "Europe/London": [51.5, -0.1], "Europe/Dublin": [53.3, -6.3], "Europe/Lisbon": [38.7, -9.1],
  "Europe/Paris": [48.9, 2.4], "Europe/Berlin": [52.5, 13.4], "Europe/Madrid": [40.4, -3.7],
  "Europe/Rome": [41.9, 12.5], "Europe/Amsterdam": [52.4, 4.9], "Europe/Brussels": [50.8, 4.4],
  "Europe/Zurich": [47.4, 8.5], "Europe/Vienna": [48.2, 16.4], "Europe/Prague": [50.1, 14.4],
  "Europe/Warsaw": [52.2, 21.0], "Europe/Stockholm": [59.3, 18.1], "Europe/Oslo": [59.9, 10.8],
  "Europe/Copenhagen": [55.7, 12.6], "Europe/Helsinki": [60.2, 24.9], "Europe/Athens": [38.0, 23.7],
  "Europe/Istanbul": [41.0, 29.0], "Europe/Kyiv": [50.5, 30.5], "Europe/Kiev": [50.5, 30.5],
  "Europe/Moscow": [55.8, 37.6], "Europe/Bucharest": [44.4, 26.1], "Atlantic/Reykjavik": [64.1, -21.9],
  "America/New_York": [40.7, -74.0], "America/Toronto": [43.7, -79.4], "America/Chicago": [41.9, -87.6],
  "America/Denver": [39.7, -105.0], "America/Phoenix": [33.4, -112.1], "America/Los_Angeles": [34.1, -118.2],
  "America/Vancouver": [49.3, -123.1], "America/Anchorage": [61.2, -149.9], "Pacific/Honolulu": [21.3, -157.9],
  "America/Halifax": [44.6, -63.6], "America/St_Johns": [47.6, -52.7], "America/Mexico_City": [19.4, -99.1],
  "America/Bogota": [4.7, -74.1], "America/Lima": [-12.0, -77.0], "America/Santiago": [-33.4, -70.7],
  "America/Sao_Paulo": [-23.6, -46.6], "America/Argentina/Buenos_Aires": [-34.6, -58.4],
  "America/Caracas": [10.5, -66.9], "Africa/Cairo": [30.0, 31.2], "Africa/Lagos": [6.5, 3.4],
  "Africa/Nairobi": [-1.3, 36.8], "Africa/Johannesburg": [-26.2, 28.0], "Africa/Casablanca": [33.6, -7.6],
  "Asia/Dubai": [25.2, 55.3], "Asia/Tehran": [35.7, 51.4], "Asia/Karachi": [24.9, 67.0],
  "Asia/Kolkata": [19.1, 72.9], "Asia/Calcutta": [19.1, 72.9], "Asia/Dhaka": [23.8, 90.4],
  "Asia/Bangkok": [13.8, 100.5], "Asia/Jakarta": [-6.2, 106.8], "Asia/Singapore": [1.3, 103.8],
  "Asia/Kuala_Lumpur": [3.1, 101.7], "Asia/Manila": [14.6, 121.0], "Asia/Shanghai": [31.2, 121.5],
  "Asia/Hong_Kong": [22.3, 114.2], "Asia/Taipei": [25.0, 121.6], "Asia/Seoul": [37.6, 127.0],
  "Asia/Tokyo": [35.7, 139.7], "Asia/Jerusalem": [31.8, 35.2], "Asia/Riyadh": [24.7, 46.7],
  "Australia/Perth": [-31.9, 115.9], "Australia/Adelaide": [-34.9, 138.6], "Australia/Brisbane": [-27.5, 153.0],
  "Australia/Sydney": [-33.9, 151.2], "Australia/Melbourne": [-37.8, 145.0], "Australia/Hobart": [-42.9, 147.3],
  "Pacific/Auckland": [-36.8, 174.8], "Pacific/Fiji": [-18.1, 178.4],
};

/** Rough location from the time zone: no network, no permission prompts. */
export function locationFromTimeZone(zone: string | undefined, offsetMinutesEast: number): { latitude: number; longitude: number } {
  if (zone && ZONES[zone]) {
    const [latitude, longitude] = ZONES[zone];
    return { latitude, longitude };
  }
  // Unknown zone: longitude from the UTC offset; a mid-latitude guess in the right hemisphere.
  const south = !!zone && /^(Australia|Antarctica)\/|^Pacific\/(Auckland|Chatham)|^America\/(Argentina|Sao_Paulo|Santiago|Montevideo|Asuncion|La_Paz|Lima)|^Africa\/(Johannesburg|Maputo|Harare|Windhoek|Gaborone)/.test(zone);
  return { latitude: south ? -30 : 40, longitude: Math.max(-180, Math.min(180, offsetMinutesEast / 4)) };
}

// Building an Intl.DateTimeFormat costs about a millisecond, and the sky previews ask for the zone
// on every frame. The zone only changes when the person moves the clock, so it is read at most
// once a minute.
let zoneCache: { zone: string | undefined; at: number } | null = null;
export function systemTimeZone(now = Date.now()): string | undefined {
  if (zoneCache && now - zoneCache.at < 60_000 && now >= zoneCache.at) return zoneCache.zone;
  let zone: string | undefined;
  try {
    zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    zone = undefined;
  }
  zoneCache = { zone, at: now };
  return zone;
}

/** Where the Living Themes think you are. */
export function resolveLocation(s: LivingSettings = readLiving(), now = new Date()): { latitude: number; longitude: number; source: "manual" | "schedule" | "timezone" } {
  if (s.location.mode === "manual" && !(s.location.latitude === 0 && s.location.longitude === 0)) {
    return { latitude: s.location.latitude, longitude: s.location.longitude, source: "manual" };
  }
  const sched = getSkyLocation();
  if (!(sched.latitude === 0 && sched.longitude === 0)) return { ...sched, source: "schedule" };
  return { ...locationFromTimeZone(systemTimeZone(), -now.getTimezoneOffset()), source: "timezone" };
}

/** A few cities for the manual picker (rounded to 0.1°: enough for the sky, nothing more). */
export const CITIES: { name: string; latitude: number; longitude: number }[] = [
  { name: "London", latitude: 51.5, longitude: -0.1 },
  { name: "New York", latitude: 40.7, longitude: -74.0 },
  { name: "Los Angeles", latitude: 34.1, longitude: -118.2 },
  { name: "Tokyo", latitude: 35.7, longitude: 139.7 },
  { name: "Sydney", latitude: -33.9, longitude: 151.2 },
  { name: "Tromsø", latitude: 69.6, longitude: 19.0 },
  { name: "Reykjavík", latitude: 64.1, longitude: -21.9 },
  { name: "Dubai", latitude: 25.2, longitude: 55.3 },
  { name: "Singapore", latitude: 1.3, longitude: 103.8 },
  { name: "São Paulo", latitude: -23.6, longitude: -46.6 },
  { name: "Cape Town", latitude: -33.9, longitude: 18.4 },
  { name: "Paris", latitude: 48.9, longitude: 2.4 },
  { name: "Berlin", latitude: 52.5, longitude: 13.4 },
  { name: "Mumbai", latitude: 19.1, longitude: 72.9 },
  { name: "Mexico City", latitude: 19.4, longitude: -99.1 },
];

/** Parses "51.5, -0.12" or a city name from CITIES. Coordinates are rounded to 0.1°. */
export function parseLocation(text: string): { latitude: number; longitude: number; label: string } | null {
  const t = text.trim();
  const m = t.match(/^(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)$/);
  const r1 = (v: number) => Math.round(v * 10) / 10;
  if (m) {
    const lat = Number(m[1]), lon = Number(m[2]);
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
    return { latitude: r1(lat), longitude: r1(lon), label: `${r1(lat)}, ${r1(lon)}` };
  }
  const c = CITIES.find((x) => x.name.toLowerCase() === t.toLowerCase());
  return c ? { latitude: c.latitude, longitude: c.longitude, label: c.name } : null;
}

// ---- Time-lapse scrubber --------------------------------------------------------------------

let override: Date | null = null;
const timeListeners = new Set<(d: Date | null) => void>();

/** Previews in this window (the settings tiles) can show another time of day. */
export function setPreviewTime(d: Date | null) {
  override = d;
  timeListeners.forEach((l) => l(d));
}
export function previewTime(): Date | null {
  return override;
}
export function onPreviewTime(l: (d: Date | null) => void): () => void {
  timeListeners.add(l);
  return () => timeListeners.delete(l);
}
