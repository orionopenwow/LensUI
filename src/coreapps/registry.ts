// The Lens core apps: one list shared by the Launcher, Command (/timer), the Dock pin and the
// window shell. Mirrors src-tauri/src/coreapps/mod.rs (ids, titles, glyphs); a bun test keeps
// them in step.
import { invoke } from "@tauri-apps/api/core";

export type CoreAppId = "monitor" | "startup" | "timer" | "calculator" | "color" | "notes" | "power" | "network" | "clipboard";

export interface CoreAppInfo {
  id: CoreAppId;
  title: string;
  /** Short name for the Launcher and the window title ("Monitor"). */
  short: string;
  /** One plain-English line. */
  blurb: string;
  /** Search words for the Launcher. */
  keywords: string;
  /** Stroked SVG path on a 24×24 grid (same as the Rust registry). */
  glyph: string;
  tint: [string, string];
  /** Settings page with the Windows side of the same thing, when there is one. */
  settingsTab?: string;
}

export const CORE_APPS: CoreAppInfo[] = [
  {
    id: "monitor",
    title: "Lens Monitor",
    short: "Monitor",
    blurb: "What's using your PC right now, and what's slowing it down.",
    keywords: "monitor task manager processes cpu ram memory gpu disk network slow performance end task",
    glyph: "M3 12h4l3-8 4 16 3-8h4",
    tint: ["#3B82F6", "#1E3A8A"],
    settingsTab: "monitor",
  },
  {
    id: "startup",
    title: "Lens Startup & Uninstall",
    short: "Startup & Uninstall",
    blurb: "Choose what starts with Windows and remove apps with their own uninstaller.",
    keywords: "startup apps boot login uninstall remove programs installed apps leftovers",
    glyph: "M12 3v9M7.5 6.5a7 7 0 1 0 9 0",
    tint: ["#F97316", "#9A3412"],
    settingsTab: "apps",
  },
  {
    id: "timer",
    title: "Lens Timer",
    short: "Timer",
    blurb: "Timers, pomodoro focus, a stopwatch and alarms.",
    keywords: "timer countdown pomodoro focus stopwatch alarm clock",
    glyph: "M12 8v5l3 2M9 2h6M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16z",
    tint: ["#EF4444", "#7F1D1D"],
  },
  {
    id: "calculator",
    title: "Lens Calculator",
    short: "Calculator",
    blurb: "Maths with history, unit conversion and a programmer mode.",
    keywords: "calculator calc maths math convert units programmer hex binary currency",
    glyph: "M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM8 7h8M8 12h1M12 12h1M16 12h0M8 16h1M12 16h1M16 16h0",
    tint: ["#64748B", "#1E293B"],
  },
  {
    id: "color",
    title: "Lens Color",
    short: "Color",
    blurb: "Pick colours from the screen, keep a palette and check contrast.",
    keywords: "color colour picker eyedropper palette contrast wcag accessibility hex",
    glyph: "M12 3a9 9 0 1 0 0 18c1 0 1.5-.8 1.5-1.5 0-1-.8-1.4-.8-2.3 0-.9.7-1.6 1.6-1.6H16a5 5 0 0 0 5-5C21 6.6 17 3 12 3zM7.5 11.5h0M10 7.5h0M14.5 7.5h0",
    tint: ["#A855F7", "#581C87"],
    settingsTab: "theme",
  },
  {
    id: "notes",
    title: "Lens Notes",
    short: "Notes",
    blurb: "Notes and to-dos, pinned to your desktop if you like.",
    keywords: "notes note todo to-do checklist sticky stickies memo",
    glyph: "M5 3h10l4 4v14H5zM14 3v5h5M8 12h8M8 16h5",
    tint: ["#EAB308", "#713F12"],
  },
  {
    id: "power",
    title: "Lens Power",
    short: "Power",
    blurb: "Battery health, charge history and power mode.",
    keywords: "power battery health capacity cycles charge power mode energy",
    glyph: "M4 8h14v8H4zM18 11h2v2h-2M9 9.5 7.5 12h3L9 14.5",
    tint: ["#22C55E", "#14532D"],
    settingsTab: "power",
  },
  {
    id: "network",
    title: "Lens Network",
    short: "Network",
    blurb: "Your connection, addresses and which apps are online right now.",
    keywords: "network internet wifi wi-fi ip address connections who is using my internet speed test",
    glyph: "M2 9a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 19.5h0",
    tint: ["#06B6D4", "#164E63"],
    settingsTab: "network",
  },
  {
    id: "clipboard",
    title: "Lens Clipboard",
    short: "Clipboard",
    blurb: "Everything you copied, with pins, search and paste-as.",
    keywords: "clipboard history copy paste pins",
    glyph: "M9 3h6v3H9zM7 5H5v16h14V5h-2M8 11h8M8 15h6",
    tint: ["#14B8A6", "#134E4A"],
  },
];

export const PIN_PREFIX = "lens-app:";

export const coreApp = (id: string): CoreAppInfo | undefined => CORE_APPS.find((a) => a.id === id);

export function iconSvg(a: CoreAppInfo): string {
  return `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><defs><linearGradient id='g' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='${a.tint[0]}'/><stop offset='1' stop-color='${a.tint[1]}'/></linearGradient></defs><rect x='2' y='2' width='60' height='60' rx='16' fill='url(#g)'/><rect x='2.5' y='2.5' width='59' height='59' rx='15.5' fill='none' stroke='white' stroke-opacity='.18'/><g transform='translate(14 14) scale(1.5)' fill='none' stroke='white' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'><path d='${a.glyph}'/></g></svg>`;
}

export const iconUrl = (a: CoreAppInfo) => `data:image/svg+xml,${encodeURIComponent(iconSvg(a))}`;

export function openCoreApp(id: CoreAppId, view?: string): Promise<void> {
  return invoke<void>("coreapp_open", { id, view: view ?? null });
}

/** Dock pin for a core app (the Dock opens it through `launch_app_cmd`). */
export function pinEntry(a: CoreAppInfo) {
  return { id: `lens-app-${a.id}`, name: a.title, path: `${PIN_PREFIX}${a.id}`, iconHint: null };
}

/** Slash words Command accepts ("/timer", "/monitor"). Ids that Command already uses win. */
export const SLASH: Record<string, CoreAppId> = {
  monitor: "monitor",
  startup: "startup",
  uninstall: "startup",
  timer: "timer",
  pomodoro: "timer",
  stopwatch: "timer",
  calc: "calculator",
  calculator: "calculator",
  color: "color",
  colour: "color",
  notes: "notes",
  todo: "notes",
  power: "power",
  battery: "power",
  network: "network",
  clipboard: "clipboard",
};

/** The view a slash word opens ("/stopwatch" → Timer › Stopwatch). */
export const SLASH_VIEW: Record<string, string> = { stopwatch: "stopwatch", pomodoro: "pomodoro", uninstall: "uninstall", todo: "todo" };

const STUBS = new WeakSet<object>();

/** Command template stubs for the `/` suggestions. `template: ""` makes them actions. */
export function coreAppTemplates(taken: { id: string }[]) {
  const ids = new Set(taken.map((t) => t.id));
  return Object.entries(SLASH)
    .filter(([word]) => !ids.has(word))
    .map(([word, id]) => {
      const a = coreApp(id)!;
      const t = { id: word, name: a.title, description: `Open ${a.title}`, template: "", provider: "local", input: "none", options: [] as string[], output: "action", builtin: true, enabled: true };
      STUBS.add(t);
      return t;
    });
}

/** True for the stubs above (so a user template that happens to share a word is never hijacked). */
export const isCoreAppStub = (t: object | null | undefined) => !!t && STUBS.has(t);

/** Opens the core app behind a slash word; false when the word isn't one. */
export function runCoreAppSlash(word: string): boolean {
  const id = SLASH[word];
  if (!id) return false;
  openCoreApp(id, SLASH_VIEW[word]).catch(() => {});
  return true;
}

/** Launcher / Command palette entries: one per core app, shown like an installed app. */
export function coreAppSearchItems() {
  return CORE_APPS.map((a) => ({
    key: `lens:coreapp:${a.id}`,
    kind: "app" as const,
    title: a.title,
    subtitle: a.blurb,
    keywords: `lens ${a.short} ${a.keywords}`,
    iconUrl: iconUrl(a),
    badge: "Lens",
    run: () => {
      openCoreApp(a.id).catch(() => {});
    },
  }));
}

/**
 * Core apps only show for real word matches ("mon", "timer", "battery"), never for loose fuzzy
 * hits, so they don't crowd unrelated searches like "spo" for Spotify.
 */
export function coreAppMatches(query: string, item: { key: string; title: string; keywords?: string }): boolean {
  if (!item.key.startsWith("lens:coreapp:")) return true;
  const words = `${item.title} ${item.keywords ?? ""}`.toLowerCase().split(/[^a-z0-9-]+/).filter(Boolean);
  const toks = query.toLowerCase().split(/\s+/).filter(Boolean);
  return toks.length > 0 && toks.every((t) => words.some((w) => w.startsWith(t)));
}
