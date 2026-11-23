// Typed wrappers for the Lens Browser commands (src-tauri/src/commands/browser.rs).
import { invoke } from "@tauri-apps/api/core";

export type TabLife = "live" | "sleeping";

export interface Space {
  id: string;
  name: string;
  icon?: string | null;
  color?: string | null;
  profile: string;
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
}

export interface Bookmark {
  id: string;
  url: string;
  title: string;
  createdMs: number;
}

export interface BrowserSettings {
  sleepAfterMin: number;
  maxLiveTabs: number;
  searchUrl: string;
  blockTrackers: boolean;
  lensContextMenu: boolean;
  defaultZoom: number;
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
}

export const DEFAULT_CAPS: Capabilities = { readPage: true, search: true, navigate: true, fillForms: true, submit: true };

export interface ActResult {
  decision: Decision;
  ran: boolean;
  needsOk: boolean;
  message: string;
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
export const historyNav = (action: "back" | "forward" | "reload") => invoke<void>("browser_history_nav", { action });
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
export const settingsSet = (settings: BrowserSettings) => invoke<BrowserView>("browser_settings_set", { settings });
export const pageRead = <T = PageSnapshot>(op: "snapshot" | "readable" | "status", tab?: string) => invoke<T>("browser_page", { op, tab: tab ?? null });
export const pageEvents = () => invoke<MenuEvent[]>("browser_events");
export const agentCheck = (action: PageAction, caps?: Capabilities) => invoke<Decision>("browser_agent_check", { action, caps: caps ?? null });
export const agentDescribe = (element: number, tab?: string) => invoke<ElementDescription>("browser_agent_describe", { element, tab: tab ?? null });
export const agentAct = (req: { tab?: string; element?: number; action: PageAction; caps?: Capabilities; approved?: boolean }) =>
  invoke<ActResult>("browser_agent_act", { req: { tab: req.tab ?? null, element: req.element ?? null, action: req.action, caps: req.caps ?? null, approved: !!req.approved } });
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
