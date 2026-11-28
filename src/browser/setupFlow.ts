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
import { applyTheme, STOCK_THEMES } from "./themes";

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
  /** A stock theme (src/browser/themes.ts). */
  theme: string;
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
    theme: a.theme && STOCK_THEMES.some((t) => t.id === a.theme) ? a.theme : "lens",
  };
}

/** The settings Done writes: the draft's choices, marked seen. Everything else is kept. */
export function applyDraft(s: BrowserSettings, d: SetupDraft): BrowserSettings {
  const before = { ...DEFAULT_APPEARANCE, ...(s.appearance ?? {}), tabsLayout: d.tabsLayout, tabStyle: d.tabStyle };
  // A theme only rewrites its own fields, and only when the person picked a different one.
  const appearance = d.theme !== (s.appearance?.theme ?? "lens") ? applyTheme(before, d.theme) : before;
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
    `${STOCK_THEMES.find((t) => t.id === d.theme)?.label ?? "Lens"} theme`,
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

/** What is new in Lens Browser, for the welcome (one line each, in plain words). */
export const NOVEL: { id: string; title: string; line: string }[] = [
  { id: "ai", title: "An AI beside every page", line: "Ask about a page, summarise it, or hand it a task. It stops for your OK first." },
  { id: "magic", title: "Magic right-click", line: "Right-click anything, on a page or your desktop, to explain, translate or save it." },
  { id: "brain", title: "Context that keeps up", line: "Add pages, files and notes to Lens's context, so answers fit what you're doing." },
  { id: "agents", title: "Bring your own agents", line: "Claude Code, Codex or a local model can drive Lens through MCP, with approvals." },
  { id: "colour", title: "Make it yours", line: "Stock themes, your own accent, backdrops, tab colours, density and type." },
];

/** The tour: one slide per idea, each with what to try. */
export const TOUR: { id: string; title: string; body: string; tries: string[] }[] = [
  { id: "ai", title: "Ask the page", body: "Press Ctrl J, or start the address bar with \"ask\". Lens reads the page you're on and answers beside it.", tries: ["Summarise a long article in five lines", "Ask a question the page doesn't answer directly", "Let it fill a form, then approve before it submits"] },
  { id: "magic", title: "Magic right-click", body: "Right-click a word, an image or a link to explain, translate, rewrite or keep it on your Shelf. The same menu works on files in Explorer.", tries: ["Right-click a sentence and pick Explain", "Right-click an image and save it to your Shelf"] },
  { id: "brain", title: "Context and the living brain", body: "Add a page, a file or a note to Lens's context and answers take it into account, in the browser, in Command and on the desktop. You decide what goes in, and you can clear it any time.", tries: ["Right-click a page and pick Add to context", "Ask a question that needs two pages at once"] },
  { id: "agents", title: "Connect your own agents", body: "Lens speaks MCP. Point Claude Code, Codex or your own agent at Lens and it can open tabs, read pages and act, always through Lens's approval card.", tries: ["Settings › AI & Command › MCP", "Every agent action shows who asked and what it will do"] },
  { id: "colour", title: "Colour and themes", body: "Pick a stock theme or make your own: accent, light or dark, backdrop, dither and grain, tab colours by site, density and typeface.", tries: ["Open Make it yours from the address bar menu", "Turn on tab colours to tell sites apart at a glance"] },
];
