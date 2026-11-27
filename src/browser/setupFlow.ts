// Lens Browser setup (first open, re-run from Settings › Lens Browser): what each step offers and
// what Done writes. Pure, tested in src/__tests__/browserSetup.test.ts.
//
// Rules (same as the Lens setup, src/setup/flow.ts):
//   * Nothing changes while you look around: choices live in a draft.
//   * Done writes the draft once (and runs the import you picked, which leaves an undo receipt).
//   * Skip, on any step, writes only "seen".
import type { BrowserSettings } from "./api";
import { DEFAULT_APPEARANCE, DEFAULT_BROWSER_AI } from "./api";
import { validStyle, type TabStyle } from "./tabModes";

export const STEPS = ["welcome", "import", "look", "privacy", "ai", "done"] as const;
export type SetupStep = (typeof STEPS)[number];

/** Search engines, in alphabetical order: Lens doesn't recommend one. */
export const SEARCH_ENGINES: { url: string; name: string; note: string }[] = [
  { url: "https://www.bing.com/search?q={q}", name: "Bing", note: "Microsoft" },
  { url: "https://search.brave.com/search?q={q}", name: "Brave Search", note: "Own index, no profiling" },
  { url: "https://duckduckgo.com/?q={q}", name: "DuckDuckGo", note: "No search history kept" },
  { url: "https://www.ecosia.org/search?q={q}", name: "Ecosia", note: "Plants trees with ad income" },
  { url: "https://www.google.com/search?q={q}", name: "Google", note: "Google account features" },
  { url: "https://www.startpage.com/do/search?q={q}", name: "Startpage", note: "Google results, private" },
];

export interface SetupDraft {
  /** Import from this browser profile on Done (null: nothing). */
  importFrom: { browser: string; profile: string; label: string } | null;
  tabsLayout: "vertical" | "horizontal";
  tabStyle: TabStyle;
  blockTrackers: boolean;
  searchUrl: string;
  aiEnabled: boolean;
}

export function initialDraft(s: BrowserSettings): SetupDraft {
  const a = { ...DEFAULT_APPEARANCE, ...(s.appearance ?? {}) };
  return {
    importFrom: null,
    tabsLayout: a.tabsLayout === "horizontal" ? "horizontal" : "vertical",
    tabStyle: validStyle(a.tabStyle),
    blockTrackers: s.blockTrackers,
    searchUrl: s.searchUrl,
    aiEnabled: { ...DEFAULT_BROWSER_AI, ...(s.ai ?? {}) }.enabled,
  };
}

/** The settings Done writes: the draft's choices, marked seen. Everything else is kept. */
export function applyDraft(s: BrowserSettings, d: SetupDraft): BrowserSettings {
  const appearance = { ...DEFAULT_APPEARANCE, ...(s.appearance ?? {}), tabsLayout: d.tabsLayout, tabStyle: d.tabStyle };
  const ai = { ...DEFAULT_BROWSER_AI, ...(s.ai ?? {}), enabled: d.aiEnabled };
  const searchUrl = SEARCH_ENGINES.some((e) => e.url === d.searchUrl) || d.searchUrl === s.searchUrl ? d.searchUrl : s.searchUrl;
  return { ...s, appearance, ai, blockTrackers: d.blockTrackers, searchUrl, setupSeen: true };
}

/** Skip: only "seen" changes. */
export function skipSettings(s: BrowserSettings): BrowserSettings {
  return { ...s, setupSeen: true };
}

/** One line per choice for the Done step, in plain words. */
export function summary(d: SetupDraft, original: BrowserSettings): string[] {
  const engine = SEARCH_ENGINES.find((e) => e.url === d.searchUrl)?.name ?? "your current search engine";
  const style = d.tabsLayout === "vertical" ? "Tabs in the sidebar" : `Tabs on top, ${d.tabStyle} style`;
  return [
    d.importFrom ? `Bring over bookmarks, history and tabs from ${d.importFrom.label} (you can remove the import in one step)` : "Nothing imported",
    style,
    d.blockTrackers ? "Lens blocks ads and trackers" : "Ads and trackers are not blocked",
    `Search with ${engine}${d.searchUrl === original.searchUrl ? " (unchanged)" : ""}`,
    d.aiEnabled ? "AI panel on: it asks before it acts" : "AI off: no AI features in Lens Browser",
  ];
}

/** Next/previous step, clamped. */
export function stepAfter(step: SetupStep, dir: 1 | -1): SetupStep {
  const i = STEPS.indexOf(step) + dir;
  return STEPS[Math.max(0, Math.min(STEPS.length - 1, i))];
}

/** What Lens Browser sends on its own (shown on the privacy step and in Settings). */
export const SENDS: { what: string; to: string; when: string }[] = [
  { what: "Ad and tracker lists (EasyList, EasyPrivacy)", to: "easylist.to", when: "Once a week, only while blocking is on" },
  { what: "Site icons", to: "the site you visited", when: "Once per site, refreshed monthly; off with Site icons" },
  { what: "Update check", to: "github.com (Lens releases)", when: "As set in Settings › About; same as the rest of Lens" },
];
