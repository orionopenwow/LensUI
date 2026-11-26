// The curated widget gallery (docs/plans/MAGIC_WAVES.md §4, wave M2). Each widget says up front
// which sites Lens will fetch from for it; the person approves those on the consent screen before
// it's added. Local widgets never touch the network. Every widget turns the data Lens fetched
// into an Adaptive Card (the safe subset in format.ts), so nothing from a site runs as code.
import type { CardElement } from "./format";
import { parseFeed } from "./format";

export interface ParamSpec {
  key: string;
  label: string;
  placeholder?: string;
  help?: string;
  /** Initial value in the add form. */
  initial?: string;
}

export interface WidgetDef {
  id: string;
  name: string;
  /** One plain line for the gallery. */
  desc: string;
  /** Who makes the data source, and its licence or terms. */
  credit: string;
  /** Local widgets never fetch. */
  local: boolean;
  params: ParamSpec[];
  /** The hosts Lens will fetch from for these settings (shown on the consent screen). */
  hosts: (p: Record<string, string>) => string[];
  /** The address Lens fetches, or null when the settings aren't complete (or the widget is local). */
  url: (p: Record<string, string>) => string | null;
  /** Shortest time between fetches. */
  refreshMinutes: number;
  /** Turns fetched text into a card. Local widgets get "" and read `ctx`. */
  toCard: (body: string, p: Record<string, string>, ctx: WidgetCtx) => CardElement[];
  /** Checks the settings before adding; returns a plain problem or null. */
  check?: (p: Record<string, string>) => string | null;
}

export interface WidgetCtx {
  now: Date;
  /** Lens's own system numbers (local widgets only). */
  telemetry?: { cpuUsage: number; memPercent: number; memUsedGb: number; memTotalGb: number; uptimeMinutes: number } | null;
}

const text = (t: string, extra: Partial<Extract<CardElement, { type: "TextBlock" }>> = {}): CardElement => ({ type: "TextBlock", text: t, ...extra });
const num = (v: unknown, digits = 0) => (typeof v === "number" && Number.isFinite(v) ? v.toFixed(digits) : "–");
const json = (body: string): Record<string, unknown> | null => {
  try {
    const v = JSON.parse(body);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};
const hostOf = (url: string | undefined): string | null => {
  try {
    const u = new URL(url ?? "");
    return u.protocol === "https:" ? u.hostname.toLowerCase() : null;
  } catch {
    return null;
  }
};

/** WMO weather codes (Open-Meteo) in plain words. */
export function weatherWords(code: number): string {
  if (code === 0) return "Clear";
  if (code <= 2) return "Partly cloudy";
  if (code === 3) return "Cloudy";
  if (code === 45 || code === 48) return "Fog";
  if (code >= 51 && code <= 57) return "Drizzle";
  if (code >= 61 && code <= 67) return "Rain";
  if (code >= 71 && code <= 77) return "Snow";
  if (code >= 80 && code <= 82) return "Showers";
  if (code >= 85 && code <= 86) return "Snow showers";
  if (code >= 95) return "Thunderstorm";
  return "—";
}

const coord = (s: string | undefined, max: number) => {
  const n = Number(s);
  return Number.isFinite(n) && Math.abs(n) <= max ? n : null;
};

export const GALLERY: readonly WidgetDef[] = [
  {
    id: "weather",
    name: "Weather",
    desc: "Now, today's high and low, and wind for one place.",
    credit: "Open-Meteo (open-meteo.com), free and open data, CC BY 4.0.",
    local: false,
    params: [
      { key: "place", label: "Place name", placeholder: "Phoenix", help: "Only shown on the widget." },
      { key: "lat", label: "Latitude", placeholder: "33.45" },
      { key: "lon", label: "Longitude", placeholder: "-112.07" },
      { key: "units", label: "Units (c or f)", initial: "c" },
    ],
    hosts: () => ["api.open-meteo.com"],
    url: (p) => {
      const lat = coord(p.lat, 90);
      const lon = coord(p.lon, 180);
      if (lat === null || lon === null) return null;
      const f = (p.units ?? "c").toLowerCase().startsWith("f");
      return `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1${f ? "&temperature_unit=fahrenheit&wind_speed_unit=mph" : ""}`;
    },
    check: (p) => (coord(p.lat, 90) === null || coord(p.lon, 180) === null ? "Enter a latitude (−90 to 90) and longitude (−180 to 180)." : null),
    refreshMinutes: 30,
    toCard: (body, p) => {
      const d = json(body);
      const cur = (d?.current ?? {}) as Record<string, unknown>;
      const daily = (d?.daily ?? {}) as Record<string, unknown[]>;
      const unit = (p.units ?? "c").toLowerCase().startsWith("f") ? "°F" : "°C";
      const wind = (p.units ?? "c").toLowerCase().startsWith("f") ? "mph" : "km/h";
      if (!d || cur.temperature_2m === undefined) return [text("No weather for that place right now.", { isSubtle: true })];
      return [
        text(p.place || "Weather", { weight: "bolder" }),
        {
          type: "ColumnSet",
          columns: [
            { width: "auto", items: [text(`${num(cur.temperature_2m)}${unit}`, { size: "extraLarge", weight: "bolder" })] },
            { width: "stretch", items: [text(weatherWords(Number(cur.weather_code)), { isSubtle: true })] },
          ],
        },
        {
          type: "FactSet",
          facts: [
            { title: "High", value: `${num(daily.temperature_2m_max?.[0])}${unit}` },
            { title: "Low", value: `${num(daily.temperature_2m_min?.[0])}${unit}` },
            { title: "Wind", value: `${num(cur.wind_speed_10m)} ${wind}` },
          ],
        },
      ];
    },
  },
  {
    id: "rss",
    name: "News feed",
    desc: "The newest posts from one RSS or Atom feed.",
    credit: "Whichever site publishes the feed.",
    local: false,
    params: [{ key: "url", label: "Feed address", placeholder: "https://example.com/feed.xml", help: "Must start with https://." }],
    hosts: (p) => {
      const h = hostOf(p.url);
      return h ? [h] : [];
    },
    url: (p) => (hostOf(p.url) ? p.url : null),
    check: (p) => (hostOf(p.url) ? null : "Enter the feed's full https:// address."),
    refreshMinutes: 30,
    toCard: (body) => {
      const items = parseFeed(body, 6);
      if (!items.length) return [text("That address didn't return a feed.", { isSubtle: true })];
      return [
        { type: "Container", items: items.map((i) => text(i.title, { wrap: true })) },
        { type: "ActionSet", actions: items.filter((i) => i.url).slice(0, 1).map((i) => ({ type: "Action.OpenUrl" as const, title: "Open the newest", url: i.url })) },
      ];
    },
  },
  {
    id: "github-release",
    name: "GitHub release",
    desc: "The latest release of one public repository.",
    credit: "GitHub's public REST API (no sign-in).",
    local: false,
    params: [{ key: "repo", label: "Repository", placeholder: "orionopenwow/LensUI", initial: "orionopenwow/LensUI" }],
    hosts: () => ["api.github.com"],
    url: (p) => (/^[\w.-]+\/[\w.-]+$/.test(p.repo ?? "") ? `https://api.github.com/repos/${p.repo}/releases/latest` : null),
    check: (p) => (/^[\w.-]+\/[\w.-]+$/.test(p.repo ?? "") ? null : "Enter owner/name, for example orionopenwow/LensUI."),
    refreshMinutes: 60,
    toCard: (body, p) => {
      const d = json(body);
      if (!d || typeof d.tag_name !== "string") return [text(p.repo || "GitHub", { weight: "bolder" }), text("No published release yet.", { isSubtle: true })];
      const when = typeof d.published_at === "string" ? new Date(d.published_at).toLocaleDateString() : "";
      return [
        text(p.repo, { weight: "bolder" }),
        text(String(d.name || d.tag_name), { size: "medium" }),
        { type: "FactSet", facts: [{ title: "Version", value: String(d.tag_name) }, ...(when ? [{ title: "Published", value: when }] : [])] },
        ...(typeof d.html_url === "string" ? [{ type: "ActionSet" as const, actions: [{ type: "Action.OpenUrl" as const, title: "Release notes", url: d.html_url }] }] : []),
      ];
    },
  },
  {
    id: "crypto",
    name: "Crypto prices",
    desc: "Price and 24-hour change for a few coins.",
    credit: "CoinGecko public API (no key; their attribution terms apply).",
    local: false,
    params: [
      { key: "ids", label: "Coins (CoinGecko ids, comma separated)", initial: "bitcoin,ethereum" },
      { key: "currency", label: "Currency", initial: "usd" },
    ],
    hosts: () => ["api.coingecko.com"],
    url: (p) => {
      const ids = (p.ids ?? "").split(",").map((s) => s.trim().toLowerCase()).filter((s) => /^[a-z0-9-]{1,40}$/.test(s)).slice(0, 6);
      const cur = (p.currency ?? "usd").trim().toLowerCase();
      if (!ids.length || !/^[a-z]{3,5}$/.test(cur)) return null;
      return `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(",")}&vs_currencies=${cur}&include_24hr_change=true`;
    },
    check: (p) => ((p.ids ?? "").trim() ? null : "Enter at least one coin, for example bitcoin."),
    refreshMinutes: 10,
    toCard: (body, p) => {
      const d = json(body);
      const cur = (p.currency ?? "usd").trim().toLowerCase();
      if (!d || !Object.keys(d).length) return [text("No prices right now.", { isSubtle: true })];
      return [
        {
          type: "FactSet",
          facts: Object.entries(d).map(([coin, v]) => {
            const r = (v ?? {}) as Record<string, number>;
            const ch = r[`${cur}_24h_change`];
            return { title: coin, value: `${num(r[cur], r[cur] < 1 ? 4 : 2)} ${cur.toUpperCase()}${typeof ch === "number" ? `  ${ch >= 0 ? "+" : ""}${ch.toFixed(1)}%` : ""}` };
          }),
        },
        text("Data from CoinGecko", { size: "small", isSubtle: true }),
      ];
    },
  },
  {
    id: "clocks",
    name: "World clocks",
    desc: "The time in a few places. Works offline.",
    credit: "Your PC's own clock and time zone data.",
    local: true,
    params: [{ key: "zones", label: "Time zones (comma separated)", initial: "UTC,Europe/London,Asia/Tokyo", help: "IANA names such as America/New_York." }],
    hosts: () => [],
    url: () => null,
    refreshMinutes: 1,
    toCard: (_b, p, ctx) => {
      const zones = (p.zones ?? "UTC").split(",").map((z) => z.trim()).filter(Boolean).slice(0, 6);
      return [
        {
          type: "FactSet",
          facts: zones.map((z) => {
            try {
              return { title: z.split("/").pop()!.replace(/_/g, " "), value: ctx.now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", timeZone: z }) };
            } catch {
              return { title: z, value: "Unknown time zone" };
            }
          }),
        },
      ];
    },
  },
  {
    id: "system",
    name: "This PC",
    desc: "Processor and memory use. Works offline.",
    credit: "Lens's own system readings on this PC.",
    local: true,
    params: [],
    hosts: () => [],
    url: () => null,
    refreshMinutes: 1,
    toCard: (_b, _p, ctx) => {
      const t = ctx.telemetry;
      if (!t) return [text("Readings aren't available right now.", { isSubtle: true })];
      const up = t.uptimeMinutes >= 60 ? `${Math.floor(t.uptimeMinutes / 60)} h ${t.uptimeMinutes % 60} min` : `${t.uptimeMinutes} min`;
      return [
        {
          type: "FactSet",
          facts: [
            { title: "Processor", value: `${num(t.cpuUsage)}%` },
            { title: "Memory", value: `${num(t.memUsedGb, 1)} of ${num(t.memTotalGb, 1)} GB (${num(t.memPercent)}%)` },
            { title: "Up for", value: up },
          ],
        },
      ];
    },
  },
];

export const galleryDef = (id: string) => GALLERY.find((g) => g.id === id);

/** The settings a new widget starts with. */
export function initialParams(def: WidgetDef): Record<string, string> {
  return Object.fromEntries(def.params.map((p) => [p.key, p.initial ?? ""]));
}
