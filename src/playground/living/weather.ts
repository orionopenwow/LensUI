/**
 * Weather for the "Weather Window" living theme.
 *
 * Off by default: the theme shows the weather you pick by hand. Only when "Use live weather
 * (Open-Meteo)" is switched on does Lens ask api.open-meteo.com (free, no key, no account) for
 * the current weather code. The request carries the latitude and longitude rounded to 0.1°
 * (about 11 km) and nothing else; the answer is cached for 30 minutes, so at most two requests an
 * hour. No other part of the Living Themes uses the network.
 */
import type { LivingSettings } from "./settings";
import { resolveLocation } from "./settings";
import type { WeatherKind } from "./sky";

export const WEATHER_TTL_MS = 30 * 60_000;
const CACHE_KEY = "lens.living.weather.v1";

/** WMO weather interpretation code -> our six looks. */
export function kindFromWmo(code: number): WeatherKind {
  if (code === 0 || code === 1) return "clear";
  if (code === 2 || code === 3) return "cloudy";
  if (code === 45 || code === 48) return "fog";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if (code >= 95 && code <= 99) return "storm";
  return "cloudy";
}

export const round1 = (v: number) => Math.round(v * 10) / 10;

/** The only URL this module ever requests. */
export function weatherUrl(latitude: number, longitude: number): string {
  return `https://api.open-meteo.com/v1/forecast?latitude=${round1(latitude).toFixed(1)}&longitude=${round1(longitude).toFixed(1)}&current=weather_code`;
}

interface Cache {
  at: number;
  lat: number;
  lon: number;
  kind: WeatherKind;
}

let memory: Cache | null = null;
let inFlight: Promise<void> | null = null;
const listeners = new Set<() => void>();

export function onWeather(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

function readCache(): Cache | null {
  if (memory) return memory;
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(CACHE_KEY) : null;
    memory = raw ? (JSON.parse(raw) as Cache) : null;
  } catch {
    memory = null;
  }
  return memory;
}

function writeCache(c: Cache | null) {
  memory = c;
  try {
    if (typeof localStorage === "undefined") return;
    if (c) localStorage.setItem(CACHE_KEY, JSON.stringify(c));
    else localStorage.removeItem(CACHE_KEY);
  } catch {
    /* ignore */
  }
}

/** Forget any fetched weather (called when live weather is switched off). */
export function clearWeatherCache() {
  writeCache(null);
}

type Fetcher = (url: string, init: { signal?: AbortSignal }) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

/** Fetches once if the cache is stale. Errors are swallowed: the manual choice stays in use. */
export async function refreshWeather(s: LivingSettings, now = Date.now(), fetcher: Fetcher | undefined = typeof fetch !== "undefined" ? (fetch as unknown as Fetcher) : undefined): Promise<void> {
  if (!s.weather.online || !fetcher) return;
  const loc = resolveLocation(s);
  const lat = round1(loc.latitude), lon = round1(loc.longitude);
  const c = readCache();
  if (c && c.lat === lat && c.lon === lon && now - c.at < WEATHER_TTL_MS) return;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), 8000) : null;
    try {
      const res = await fetcher(weatherUrl(lat, lon), { signal: ctl?.signal });
      if (!res.ok) return;
      const body = (await res.json()) as { current?: { weather_code?: number } };
      const code = body?.current?.weather_code;
      if (typeof code !== "number") return;
      writeCache({ at: now, lat, lon, kind: kindFromWmo(code) });
      listeners.forEach((l) => l());
    } catch {
      /* offline, blocked, timed out: keep the manual weather */
    } finally {
      if (timer) clearTimeout(timer);
      inFlight = null;
    }
  })();
  return inFlight;
}

/** The weather to draw now. Starts a background refresh when live weather is on and stale. */
export function currentWeather(s: LivingSettings, now = Date.now()): WeatherKind {
  if (!s.weather.online) return s.weather.manual;
  const c = readCache();
  if (!c || now - c.at >= WEATHER_TTL_MS) void refreshWeather(s, now);
  // A cached answer up to 6 hours old beats a guess; after that, the manual choice.
  return c && now - c.at < 6 * 3_600_000 ? c.kind : s.weather.manual;
}
