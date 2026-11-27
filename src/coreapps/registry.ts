// The Lens core apps: one list shared by the Launcher, Command (/timer), the Dock pin and the
// window shell. Mirrors src-tauri/src/coreapps/mod.rs (ids, titles, glyphs); a bun test keeps
// them in step.
import { invoke } from "@tauri-apps/api/core";
import { lensAppIconSvg, lensAppIconUrl } from "../icons/lensApps";
import { oops } from "../ui/oops";

export type CoreAppId = "monitor" | "startup" | "timer" | "calculator" | "color" | "notes" | "power" | "network" | "clipboard" | "feeds" | "messages";

export interface CoreAppInfo {
  id: CoreAppId;
  title: string;
  /** Short name for the Launcher and the window title ("Monitor"). */
  short: string;
  /** One plain-English line. */
  blurb: string;
  /** Search words for the Launcher. */
  keywords: string;
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
    settingsTab: "monitor",
  },
  {
    id: "startup",
    title: "Lens Startup & Uninstall",
    short: "Startup & Uninstall",
    blurb: "Choose what starts with Windows and remove apps with their own uninstaller.",
    keywords: "startup apps boot login uninstall remove programs installed apps leftovers",
    settingsTab: "apps",
  },
  {
    id: "timer",
    title: "Lens Timer",
    short: "Timer",
    blurb: "Timers, pomodoro focus, a stopwatch and alarms.",
    keywords: "timer countdown pomodoro focus stopwatch alarm clock",
  },
  {
    id: "calculator",
    title: "Lens Calculator",
    short: "Calculator",
    blurb: "Maths with history, unit conversion and a programmer mode.",
    keywords: "calculator calc maths math convert units programmer hex binary currency",
  },
  {
    id: "color",
    title: "Lens Color",
    short: "Color",
    blurb: "Pick colours from the screen, keep a palette and check contrast.",
    keywords: "color colour picker eyedropper palette contrast wcag accessibility hex",
    settingsTab: "theme",
  },
  {
    id: "notes",
    title: "Lens Notes",
    short: "Notes",
    blurb: "Notes and to-dos, pinned to your desktop if you like.",
    keywords: "notes note todo to-do checklist sticky stickies memo",
  },
  {
    id: "power",
    title: "Lens Power",
    short: "Power",
    blurb: "Battery health, charge history and power mode.",
    keywords: "power battery health capacity cycles charge power mode energy",
    settingsTab: "power",
  },
  {
    id: "network",
    title: "Lens Network",
    short: "Network",
    blurb: "Your connection, addresses and which apps are online right now.",
    keywords: "network internet wifi wi-fi ip address connections who is using my internet speed test",
    settingsTab: "network",
  },
  {
    id: "clipboard",
    title: "Lens Clipboard",
    short: "Clipboard",
    blurb: "Everything you copied, with pins, search and paste-as.",
    keywords: "clipboard history copy paste pins",
  },
  {
    id: "feeds",
    title: "Lens Feeds",
    short: "Feeds",
    blurb: "News and the people you follow in one slim column, with a digest.",
    keywords: "feeds rss news bluesky mastodon github youtube reddit social timeline digest",
    settingsTab: "notifications#feeds",
  },
  {
    id: "messages",
    title: "Lens Messages",
    short: "Messages",
    blurb: "One inbox over the messengers you already use. Lens reads unread counts only.",
    keywords: "messages inbox chat unread discord slack telegram whatsapp matrix signal teams",
    settingsTab: "notifications#messages",
  },
];

export const PIN_PREFIX = "lens-app:";

export const coreApp = (id: string): CoreAppInfo | undefined => CORE_APPS.find((a) => a.id === id);

/** The app's icon: Lens's own set (src/icons/lensApps.ts, DESIGN.md §3.7). */
export const iconSvg = (a: CoreAppInfo): string => lensAppIconSvg(a.id);

export const iconUrl = (a: CoreAppInfo) => lensAppIconUrl(a.id);

export function openCoreApp(id: CoreAppId, view?: string, find?: string): Promise<void> {
  return invoke<void>("coreapp_open", { id, view: view ?? null, find: find ?? null });
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
  feeds: "feeds",
  inbox: "messages",
};

/** The view a slash word opens ("/stopwatch" → Timer › Stopwatch). */
export const SLASH_VIEW: Record<string, string> = { stopwatch: "stopwatch", pomodoro: "pomodoro", uninstall: "uninstall", todo: "todo" };

const STUBS = new WeakSet<object>();

/** Slash words for companion apps that aren't core apps ("/thumbdesk", "/controller"). */
export const COMPANION_SLASH: Record<string, { name: string; description: string; command: string }> = {
  thumbdesk: { name: "ThumbDesk", description: "Open ThumbDesk: use the PC from a controller", command: "thumbdesk_open" },
  controller: { name: "Controller mode", description: "Open ThumbDesk: use the PC from a controller", command: "thumbdesk_open" },
};

/** Command template stubs for the `/` suggestions. `template: ""` makes them actions. */
export function coreAppTemplates(taken: { id: string }[]) {
  const ids = new Set(taken.map((t) => t.id));
  const stub = (id: string, name: string, description: string) => {
    const t = { id, name, description, template: "", provider: "local", input: "none", options: [] as string[], output: "action", builtin: true, enabled: true };
    STUBS.add(t);
    return t;
  };
  const core = Object.entries(SLASH)
    .filter(([word]) => !ids.has(word))
    .map(([word, id]) => {
      const a = coreApp(id)!;
      return stub(word, a.title, `Open ${a.title}`);
    });
  const companions = Object.entries(COMPANION_SLASH)
    .filter(([word]) => !ids.has(word))
    .map(([word, c]) => stub(word, c.name, c.description));
  return [...core, ...companions];
}

/** True for the stubs above (so a user template that happens to share a word is never hijacked). */
export const isCoreAppStub = (t: object | null | undefined) => !!t && STUBS.has(t);

/** Opens the core app behind a slash word; false when the word isn't one. */
export function runCoreAppSlash(word: string): boolean {
  const companion = COMPANION_SLASH[word];
  if (companion) {
    // Opens ThumbDesk if it's installed; otherwise Settings › Gaming › Use a controller offers it.
    invoke(companion.command).catch(() => invoke("open_dock_popout_tab_cmd", { tab: "gaming#controller" }).catch(oops("open the controller settings")));
    return true;
  }
  const id = SLASH[word];
  if (!id) return false;
  openCoreApp(id, SLASH_VIEW[word]).catch(oops(`open ${coreApp(id)?.title ?? "that app"}`));
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
      openCoreApp(a.id).catch(oops(`open ${a.title}`));
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
