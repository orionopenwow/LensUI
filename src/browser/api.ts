// Typed wrappers for the Lens Browser commands (src-tauri/src/commands/browser.rs).
import { invoke } from "@tauri-apps/api/core";

export type TabLife = "live" | "sleeping";

export interface Space {
  id: string;
  name: string;
  icon?: string | null;
  color?: string | null;
  profile: string;
  locked?: boolean;
}

export interface Folder {
  id: string;
  spaceId: string;
  name: string;
  collapsed: boolean;
}

export interface Tab {
  id: string;
  spaceId: string;
  folderId?: string | null;
  url: string;
  title: string;
  favicon?: string | null;
  pinned: boolean;
  muted: boolean;
  audible: boolean;
  life: TabLife;
  lastActiveMs: number;
  order: number;
  zoom: number;
  scrollY: number;
  badge?: string | null;
  archivedMs?: number | null;
  busy?: boolean;
}

export interface Bookmark {
  id: string;
  url: string;
  title: string;
  createdMs: number;
  folder?: string | null;
}

export interface Appearance {
  scheme: "auto" | "light" | "dark";
  accent: string | null;
  dither: number;
  grain: number;
  tabsLayout: "vertical" | "horizontal";
  /** Horizontal tab style (src/browser/tabModes.ts); missing in settings saved before it existed. */
  tabStyle?: "curved" | "joined" | "compact" | "dynamic" | "merged";
  density: "compact" | "comfortable";
  typeface: "lens" | "system" | "mono" | "serif";
  /** The vertical tab sidebar (missing in settings saved before it existed). */
  sidebar?: SidebarPrefs;
  /** The reader view's text (missing in settings saved before it existed). */
  reader?: ReaderPrefs;
}

export interface ReaderPrefs {
  /** Text size in px, 14–26. */
  size: number;
  width: "narrow" | "medium" | "wide";
  face: "serif" | "sans";
}
export const DEFAULT_READER: ReaderPrefs = { size: 18, width: "medium", face: "serif" };

export interface SidebarPrefs {
  /** 200–380 px, full mode only. */
  width: number;
  /** Full list, or a narrow stack of icons. */
  mode: "full" | "stack";
  side: "left" | "right";
  /** Today / Earlier, by site, or one list. */
  group: "time" | "site" | "none";
  showChats: boolean;
  showMedia: boolean;
  showSpaces: boolean;
}

export const DEFAULT_SIDEBAR: SidebarPrefs = { width: 248, mode: "full", side: "left", group: "time", showChats: true, showMedia: true, showSpaces: true };
export const SIDEBAR_WIDTH = { min: 200, max: 380 } as const;

export interface BrowserAi {
  enabled: boolean;
  agentInNewTabs: boolean;
  pageSummaries: boolean;
  askInAddressBar: boolean;
  transcripts: boolean;
}

export const DEFAULT_APPEARANCE: Appearance = { scheme: "auto", accent: null, dither: 40, grain: 20, tabsLayout: "vertical", tabStyle: "dynamic", density: "comfortable", typeface: "lens", sidebar: DEFAULT_SIDEBAR, reader: DEFAULT_READER };
export const DEFAULT_BROWSER_AI: BrowserAi = { enabled: true, agentInNewTabs: false, pageSummaries: true, askInAddressBar: true, transcripts: true };

export interface BrowserSettings {
  appearance?: Appearance;
  ai?: BrowserAi;
  archiveAfterDays?: number;
  downloadRules?: { ext: string; folder: string }[];
  sleepAfterMin: number;
  maxLiveTabs: number;
  searchUrl: string;
  blockTrackers: boolean;
  lensContextMenu: boolean;
  pageMarks?: boolean;
  defaultZoom: number;
  /** Zoom remembered per site (host → factor). */
  siteZoom?: Record<string, number>;
  /** Sites where "Lens blocks ads and trackers" is off. */
  blockingAllow?: string[];
  /** Fetch real site icons (once per site, from the site). */
  favicons?: boolean;
  /** The first-open setup was finished or skipped. */
  setupSeen?: boolean;
}

/** Two tabs side by side; `left` takes `ratio` of the width. */
export interface Split {
  left: string;
  right: string;
  ratio: number;
}

export interface BrowserState {
  version: number;
  spaces: Space[];
  folders: Folder[];
  tabs: Tab[];
  activeSpace: string;
  activeTab?: string | null;
  bookmarks: Bookmark[];
  settings: BrowserSettings;
  nextId: number;
  /** Recently closed tabs, newest last (Ctrl+Shift+T reopens the last). */
  closed?: { tab: Tab; closedMs: number }[];
  /** Site permissions answered "on this site" or "Block". */
  sitePermissions?: SitePermissions;
  /** Split views (two tabs side by side). */
  splits?: Split[];
}

export interface Download {
  id: number;
  url: string;
  path?: string | null;
  state: "downloading" | "done" | "failed";
  startedMs: number;
}

export interface BrowserView {
  state: BrowserState;
  bookmarked: boolean;
  live: string[];
  downloads: Download[];
  unlocked?: string[];
  glance?: string | null;
}

export interface HistoryEntry {
  url: string;
  title: string;
  lastVisitMs: number;
  visits: number;
}

/** What the page agent reports about an element (src-tauri/src/browser/gating.rs `Target`). */
export interface Target {
  tag: string;
  role: string;
  inputType: string;
  name: string;
  label: string;
  text: string;
  autocomplete: string;
  href: string;
  inForm: boolean;
  formHasPassword: boolean;
  formHasCard: boolean;
  isCaptcha: boolean;
}

export interface PageElement extends Target {
  ref: number;
  rect: [number, number, number, number];
}

export interface PageSnapshot {
  url: string;
  title: string;
  lang: string;
  text: string;
  elements: PageElement[];
  notes: string[];
  hasPasswordField: boolean;
  captcha: boolean;
  scrollY: number;
}

export interface ElementDescription {
  ok: boolean;
  msg?: string;
  target: Target;
  rect: [number, number, number, number];
  dpr: number;
  look: { bg: string; fg: string; radius: string; font: string; weight: string };
  context: string;
  fields: { label: string; value: string }[];
  notes: string[];
  host: string;
  title: string;
  at: number;
}

export type PageAction =
  | { do: "read_page" }
  | { do: "scroll"; dy: number }
  | { do: "click"; target: Partial<Target> }
  | { do: "type"; target: Partial<Target>; text: string }
  | { do: "select"; target: Partial<Target>; value: string }
  | { do: "submit"; target: Partial<Target> }
  | { do: "navigate"; url: string }
  | { do: "search"; query: string };

export type Risk = "auto" | "ask_first" | "blocked";
export type Category =
  | "read" | "scroll" | "navigate" | "search" | "type" | "click" | "submit"
  | "booking" | "send" | "delete" | "purchase" | "login" | "secret" | "captcha";

export interface Decision {
  risk: Risk;
  category: Category;
  reason: string;
}

export interface Capabilities {
  readPage: boolean;
  search: boolean;
  navigate: boolean;
  fillForms: boolean;
  submit: boolean;
  /** Off (blocked) by default; switching on needs a hold, and the agent still asks first. */
  payments: boolean;
}

export const DEFAULT_CAPS: Capabilities = { readPage: true, search: true, navigate: true, fillForms: true, submit: true, payments: false };

export interface ActResult {
  decision: Decision;
  ran: boolean;
  needsOk: boolean;
  message: string;
  /** Why the agent-safety gate made the step wait or refused it. */
  safety?: { code: string; severity: string; detail: string }[];
  /** With `needsOk`: the one-time token for this exact step. Send it back once the person approves. */
  approvalToken?: string;
  /** With `needsOk` after an approval that didn't count: missing | unknown | expired | mismatch. */
  approvalRefused?: string;
}

export interface MenuEvent {
  action: string;
  selection: string;
  linkUrl: string;
  imageUrl: string;
  hasVideo: boolean;
  isYouTube: boolean;
  url: string;
  title: string;
  videoTime: number | null;
  at: number;
}

export const EVT_BROWSER_STATE = "lens://browser/state";
export const EVT_BROWSER_DOWNLOADS = "lens://browser/downloads";
export const EVT_BROWSER_PERMISSION = "lens://browser/permission";
export const EVT_BROWSER_PERMISSION_DONE = "lens://browser/permission-done";

/** A site permission Lens asks about (see browser/permissions.rs). */
export type PermissionKind = "camera" | "microphone" | "location" | "notifications" | "clipboard" | "downloads";
export const PERMISSION_KINDS: PermissionKind[] = ["camera", "microphone", "location", "notifications", "clipboard", "downloads"];
/** Remembered answers: origin → kind → allowed. */
export type SitePermissions = Record<string, Partial<Record<PermissionKind, boolean>>>;
export interface PermissionAsk {
  id: number;
  tab: string;
  origin: string;
  kind: PermissionKind;
}
export type PermissionAnswer = "once" | "site" | "block";
export const permissionAnswer = (id: number, answer: PermissionAnswer) => invoke<void>("browser_permission_answer", { id, answer });
export const permissionsWaiting = () => invoke<PermissionAsk[]>("browser_permissions_waiting");
export const permissionsList = () => invoke<SitePermissions>("browser_permissions_list");
export const permissionForget = (origin: string, kind: PermissionKind | null) => invoke<SitePermissions>("browser_permission_forget", { origin, kind });

export const browserOpen = (url?: string) => invoke<BrowserView>("browser_open", { url: url ?? null });
export const browserState = () => invoke<BrowserView>("browser_state");
export const setViewport = (x: number, y: number, w: number, h: number) => invoke<void>("browser_set_viewport", { x, y, w, h });
export const setOverlay = (on: boolean) => invoke<void>("browser_set_overlay", { on });
export const navigate = (input: string, newTab = false) =>
  invoke<{ view: BrowserView | null; ask: string | null }>("browser_navigate", { input, newTab });
export const tabActivate = (id: string) => invoke<BrowserView>("browser_tab_activate", { id });
export const tabClose = (id: string) => invoke<BrowserView>("browser_tab_close", { id });
export const tabMove = (id: string, index: number, folder: string | null) => invoke<BrowserView>("browser_tab_move", { id, index, folder });
export const tabPin = (id: string, on: boolean) => invoke<BrowserView>("browser_tab_pin", { id, on });
export const tabMute = (id: string, on: boolean) => invoke<BrowserView>("browser_tab_mute", { id, on });
export const tabSleep = (id: string) => invoke<BrowserView>("browser_tab_sleep", { id });
export const tabDuplicate = (id: string) => invoke<BrowserView>("browser_tab_duplicate", { id });
export const historyNav = (action: "back" | "forward" | "reload" | "stop") => invoke<void>("browser_history_nav", { action });
export const setZoom = (zoom: number) => invoke<number>("browser_zoom", { zoom });
export const findInPage = (text: string, back = false) => invoke<{ found: boolean; total: number }>("browser_find", { text, back });
export const spaceAdd = (name: string) => invoke<BrowserView>("browser_space_add", { name });
export const spaceRemove = (id: string) => invoke<BrowserView>("browser_space_remove", { id });
export const spaceSwitch = (id: string) => invoke<BrowserView>("browser_space_switch", { id });
export const folderAdd = (space: string, name: string) => invoke<BrowserView>("browser_folder_add", { space, name });
export const folderRemove = (id: string) => invoke<BrowserView>("browser_folder_remove", { id });
export const folderToggle = (id: string) => invoke<BrowserView>("browser_folder_toggle", { id });
export const bookmarkToggle = () => invoke<boolean>("browser_bookmark_toggle");
export const historySearch = (query: string, limit = 20) => invoke<HistoryEntry[]>("browser_history_search", { query, limit });
export const historyClear = (sinceMs: number) => invoke<void>("browser_history_clear", { sinceMs });
export const historyRemove = (url: string) => invoke<void>("browser_history_remove", { url });
/** Clears finished downloads from the list (files stay). With `id`, removes only that one. */
export const downloadsClear = (id?: number) => invoke<Download[]>("browser_downloads_clear", { id: id ?? null });
export const settingsSet = (settings: BrowserSettings) => invoke<BrowserView>("browser_settings_set", { settings });
export const pageRead = <T = PageSnapshot>(op: "snapshot" | "readable" | "status", tab?: string) => invoke<T>("browser_page", { op, tab: tab ?? null });
export const pageEvents = () => invoke<MenuEvent[]>("browser_events");
export const agentCheck = (action: PageAction, caps?: Capabilities, url?: string) =>
  invoke<Decision>("browser_agent_check", { action, caps: caps ?? null, url: url ?? null });
export const agentDescribe = (element: number, tab?: string) => invoke<ElementDescription>("browser_agent_describe", { element, tab: tab ?? null });
/** The request `browser_agent_act` takes. There is no "approved" flag: a step that needs your OK
 *  runs only when the token Lens Core issued for that exact step comes back with it. */
export function actRequest(req: { tab?: string; element?: number; action: PageAction; caps?: Capabilities; approvalToken?: string | null }) {
  return { tab: req.tab ?? null, element: req.element ?? null, action: req.action, caps: req.caps ?? null, approvalToken: req.approvalToken || null };
}
export const agentAct = (req: Parameters<typeof actRequest>[0]) => invoke<ActResult>("browser_agent_act", { req: actRequest(req) });
export const untrusted = (url: string, text: string) => invoke<string>("browser_untrusted", { url, text });
export const captions = (lang?: string, tab?: string) => invoke<CaptionReply>("browser_captions", { lang: lang ?? null, tab: tab ?? null });
export const seek = (seconds: number) => invoke<void>("browser_seek", { seconds });
export const pip = () => invoke<boolean>("browser_pip");
export const downloadReveal = (id: number) => invoke<void>("browser_download_reveal", { id });

export interface CaptionReply {
  done: boolean;
  error?: "no_captions" | "not_youtube" | "bad_track" | string;
  video?: { id: string; title: string; author: string; seconds: number } | null;
  track?: { lang: string; name: string; auto: boolean };
  tracks?: { lang: string; name: string; auto: boolean }[];
  body?: string;
}

// ---- Import ("Bring everything with you") ----
export type Engine = "chromium" | "firefox" | "arc";
export interface ImportProfile { id: string; label: string }
export interface ImportSource { browser: string; label: string; engine: Engine; profiles: ImportProfile[] }
export interface ImportKinds { bookmarks: boolean; history: boolean; tabs: boolean; spaces: boolean }
export interface ImportCounts { bookmarks: number; history: number; openTabs: number; pinnedTabs: number; spaces: number; folders?: number; splits?: number; rules?: number; notes: string[] }
export interface ImportApplied { bookmarks: number; history: number; tabs: number; spaces: number }
export interface ImportProgress { browser: string; step: "bookmarks" | "history" | "tabs" | "spaces" | "done"; state: "running" | "done" | "skipped" | "failed"; count: number; note?: string | null }
export const EVT_BROWSER_IMPORT = "lens://browser/import";
export const importDetect = () => invoke<ImportSource[]>("browser_import_detect");
export const importPreview = (browser: string, profile: string, kinds: ImportKinds) => invoke<ImportCounts>("browser_import_preview", { browser, profile, kinds });
export interface ImportItem { url: string; title: string; folder: string; pinned: boolean }
/** What the other browser was set to: its search engine (as a Lens search address when usable) and home page. */
export interface ImportDefaults { searchName?: string | null; searchUrl?: string | null; homepage?: string | null }
export interface ImportItems { bookmarks: ImportItem[]; tabs: ImportItem[]; truncated: boolean; defaults: ImportDefaults }
/** One past import: what it added, so it can be removed in one step. */
export interface ImportReceipt { id: string; label: string; atMs: number; bookmarks: number; tabs: number; spaces: number; history: number; searchChanged: boolean }
export const importItems = (browser: string, profile: string) => invoke<ImportItems>("browser_import_items", { browser, profile });
/** `skip`: URLs of bookmarks and tabs left unticked. `adoptSearch`: also use that browser's search engine. */
export const importRun = (browser: string, profile: string, kinds: ImportKinds, skip: string[] = [], adoptSearch = false) =>
  invoke<ImportApplied>("browser_import_run", { browser, profile, kinds, skip, adoptSearch });
export const importReceipts = () => invoke<ImportReceipt[]>("browser_import_receipts");
export const importUndo = (id: string) => invoke<BrowserView>("browser_import_undo", { id });

// ---- Sessions, tidy, archive, bookmarks, glance, media, locks, notes ----
export interface ArchivedTab { id: string; url: string; title: string; archivedMs: number; space: string }
export const reopenClosed = () => invoke<BrowserView>("browser_reopen_closed");
export const tidy = () => invoke<{ duplicatesClosed: number; archived: number }>("browser_tidy");
export const archived = (query?: string) => invoke<ArchivedTab[]>("browser_archived", { query: query ?? null });
export const unarchive = (id: string) => invoke<BrowserView>("browser_unarchive", { id });
export const openBackground = (url: string) => invoke<BrowserView>("browser_open_background", { url });
export const bookmarkUpdate = (id: string, title?: string, folder?: string) => invoke<BrowserView>("browser_bookmark_update", { id, title: title ?? null, folder: folder ?? null });
export const bookmarkRemove = (id: string) => invoke<BrowserView>("browser_bookmark_remove", { id });
export const glance = (action: "open" | "close" | "promote" | "read", url?: string) => invoke<string | null>("browser_glance", { action, url: url ?? null });
export const media = (tab: string, action: "status" | "toggle") => invoke<{ ok: boolean; playing?: boolean; title?: string }>("browser_media", { tab, action });
export const spaceLock = (id: string, lock: boolean) => invoke<string>("browser_space_lock", { id, lock });
export const spaceUnlockForever = (id: string) => invoke<void>("browser_space_unlock_forever", { id });
export const notesGet = (url: string) => invoke<string>("browser_notes_get", { url });
export const notesSet = (url: string, text: string) => invoke<void>("browser_notes_set", { url, text });
export const focusPage = () => invoke<void>("browser_focus_page");

/** Rough memory saved by sleeping tabs (a WebView2 renderer for a typical page is ~60–120 MB). */
export const SLEEP_SAVING_MB = 80;

// ---- Split view, ads and trackers, favicons, privacy ----
export const split = (action: "with" | "close" | "swap" | "ratio", o: { tab?: string; other?: string; ratio?: number } = {}) =>
  invoke<BrowserView>("browser_split", { action, tab: o.tab ?? null, other: o.other ?? null, ratio: o.ratio ?? null });
export interface Shield { on: boolean; site: string; allowed: boolean; blocked: number }
export const shield = (tab?: string) => invoke<Shield>("browser_shield", { tab: tab ?? null });
export const shieldAllow = (site: string, allow: boolean) => invoke<Shield>("browser_shield_allow", { site, allow });
export interface ListStatus { id: string; name: string; licence: string; home: string; fetchedMs: number; failedMs: number; bytes: number }
export interface BlockingStatus { on: boolean; rules: number; skipped: number; lists: ListStatus[]; updating: boolean }
export const blockingStatus = () => invoke<BlockingStatus>("browser_blocking_status");
export const blockingUpdate = () => invoke<BlockingStatus>("browser_blocking_update");
export const EVT_BROWSER_ICONS = "lens://browser/icons";
export const favicons = () => invoke<Record<string, string>>("browser_favicons");
export const faviconsClear = () => invoke<void>("browser_favicons_clear");
export interface SentRequest { purpose: "filter_list" | "favicon"; host: string; atMs: number; ok: boolean }
export const sentRequests = () => invoke<SentRequest[]>("browser_sent");
