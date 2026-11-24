// Toolbar state for the active tab, and the words for a page that failed to load.
// Pure, so it is unit-tested (src/__tests__/browserNav.test.ts) and drawn by the parity scenes.
import type { BrowserState, Bookmark, HistoryEntry, Tab } from "./api";
import { classifyAddress, hostOf } from "./model";

/** What the page agent's `status` reports (src-tauri/src/browser/page_agent.js). */
export interface PageStatus {
  canBack?: boolean;
  canForward?: boolean;
  ready?: string;
  error?: string;
  hasVideo?: boolean;
  url?: string;
}

export interface NavState {
  canBack: boolean;
  canForward: boolean;
  loading: boolean;
  /** Chromium net error code ("ERR_NAME_NOT_RESOLVED"), or "" when the page loaded. */
  error: string;
  hasVideo: boolean;
}

export const IDLE_NAV: NavState = { canBack: false, canForward: false, loading: false, error: "", hasVideo: false };

export function navFromStatus(s: PageStatus | null | undefined): NavState {
  if (!s) return IDLE_NAV;
  const error = (s.error || "").trim();
  return {
    canBack: !!s.canBack,
    canForward: !!s.canForward,
    loading: !error && !!s.ready && s.ready !== "complete",
    error,
    hasVideo: !!s.hasVideo,
  };
}

export interface ErrorInfo {
  kind: "offline" | "dns" | "refused" | "timeout" | "cert" | "blocked" | "other";
  title: string;
  body: string;
  /** Retrying can't help (a certificate problem): offer Back first. */
  unsafe: boolean;
}

/** Plain words for a Chromium net error. `online` is `navigator.onLine`. */
export function errorInfo(code: string, url: string, online = true): ErrorInfo {
  const host = hostOf(url) || "This page";
  const c = code.toUpperCase();
  if (!online || /INTERNET_DISCONNECTED|NETWORK_CHANGED|ADDRESS_UNREACHABLE|PROXY_CONNECTION_FAILED/.test(c)) {
    return { kind: "offline", title: "You're offline", body: "Check the Wi-Fi or cable, then try again. Your tabs are kept as they are.", unsafe: false };
  }
  if (/NAME_NOT_RESOLVED|NAME_RESOLUTION_FAILED|DNS_/.test(c)) {
    return { kind: "dns", title: "That address wasn't found", body: `${host} doesn't seem to exist. Check the spelling, or search for it instead.`, unsafe: false };
  }
  if (/CERT_|SSL_|INSECURE_RESPONSE|BAD_SSL/.test(c)) {
    return { kind: "cert", title: "This connection isn't private", body: `${host} couldn't prove who it is. Lens won't open it, because someone could be reading what you send.`, unsafe: true };
  }
  if (/CONNECTION_REFUSED|CONNECTION_RESET|CONNECTION_CLOSED|CONNECTION_FAILED|EMPTY_RESPONSE/.test(c)) {
    return { kind: "refused", title: "The site didn't answer", body: `${host} refused the connection or closed it. It may be down for a moment.`, unsafe: false };
  }
  if (/TIMED_OUT|TIMEOUT/.test(c)) {
    return { kind: "timeout", title: "The site took too long", body: `${host} didn't respond in time. It may be busy, or your connection may be slow.`, unsafe: false };
  }
  if (/BLOCKED_BY/.test(c)) {
    return { kind: "blocked", title: "This page was blocked", body: `Something on this PC blocked ${host}: a filter, an administrator rule or security software.`, unsafe: false };
  }
  return { kind: "other", title: "This page didn't load", body: `${host} couldn't be opened.`, unsafe: false };
}

// ---- Address bar suggestions ----

export interface Suggestion {
  kind: "tab" | "bookmark" | "history" | "url" | "search" | "ask";
  /** Stable key for React and aria-activedescendant. */
  key: string;
  title: string;
  /** Host or hint shown on the right. */
  detail: string;
  /** What Enter does with it: a URL to open, text to search, or a tab id to switch to. */
  value: string;
  url?: string;
}

export interface SuggestInput {
  tabs: Tab[];
  bookmarks: Bookmark[];
  history: HistoryEntry[];
  activeTab?: string | null;
  /** The address bar may hand "ask …" to the AI panel. */
  ask?: boolean;
  limit?: number;
}

const norm = (s: string) => s.toLowerCase();
const stripScheme = (u: string) => u.replace(/^https?:\/\/(www\.)?/i, "");

/** How well `q` matches a page: 3 host starts with it, 2 a word in the title starts with it, 1 contains. */
export function matchScore(q: string, url: string, title: string): number {
  const n = norm(q.trim());
  if (!n) return 0;
  const u = norm(stripScheme(url));
  const t = norm(title);
  if (u.startsWith(n)) return 3;
  if (t.startsWith(n) || t.includes(` ${n}`)) return 2;
  return u.includes(n) || t.includes(n) ? 1 : 0;
}

/**
 * Rows under the address bar. The first row is always what Enter does with the typed text
 * (go, search or ask); then open tabs (switching beats opening a copy), bookmarks and history,
 * best match first, one row per URL.
 */
export function suggestions(input: string, src: SuggestInput): Suggestion[] {
  const q = input.trim();
  const limit = src.limit ?? 7;
  const out: Suggestion[] = [];
  const kind = classifyAddress(q);
  if (kind) {
    if (kind.kind === "url") out.push({ kind: "url", key: "go", title: stripScheme(kind.value), detail: "Go", value: kind.value, url: kind.value });
    else if (kind.kind === "ask" && src.ask) out.push({ kind: "ask", key: "ask", title: kind.value, detail: "Ask about this page", value: q });
    else out.push({ kind: "search", key: "search", title: kind.kind === "ask" ? q : kind.value, detail: "Search", value: kind.kind === "ask" ? q : kind.value });
  }
  if (!q) return out;
  const seen = new Set<string>(out.filter((o) => o.url).map((o) => stripScheme(o.url!).replace(/\/$/, "")));
  const rows: { score: number; s: Suggestion }[] = [];
  const push = (bonus: number, s: Suggestion) => {
    const id = stripScheme(s.url ?? "").replace(/\/$/, "");
    const score = matchScore(q, s.url ?? "", s.title);
    if (!score || seen.has(id)) return;
    seen.add(id);
    rows.push({ score: score + bonus, s });
  };
  for (const t of src.tabs) {
    if (t.id === src.activeTab || t.archivedMs) continue;
    push(1.5, { kind: "tab", key: `tab-${t.id}`, title: t.title || hostOf(t.url), detail: "Switch to tab", value: t.id, url: t.url });
  }
  for (const b of src.bookmarks) {
    push(0.3, { kind: "bookmark", key: `bm-${b.id}`, title: b.title || hostOf(b.url), detail: hostOf(b.url), value: b.url, url: b.url });
  }
  src.history.forEach((h, i) => {
    // History arrives in frecency order: keep that order among equal matches.
    push(-i * 0.001, { kind: "history", key: `h-${h.url}`, title: h.title || hostOf(h.url), detail: hostOf(h.url), value: h.url, url: h.url });
  });
  rows.sort((a, b) => b.score - a.score);
  return [...out, ...rows.map((r) => r.s)].slice(0, limit);
}

// ---- Tabs by keyboard ----

/** The active space's tabs in the order the sidebar draws them (pinned first). */
export function orderedTabs(s: BrowserState): Tab[] {
  return s.tabs
    .filter((t) => t.spaceId === s.activeSpace && !t.archivedMs)
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.order - b.order);
}

/** Ctrl+Tab / Ctrl+Shift+Tab: wraps around. */
export function cycleTab(s: BrowserState, dir: 1 | -1): string | null {
  const tabs = orderedTabs(s);
  if (tabs.length < 2) return null;
  const i = tabs.findIndex((t) => t.id === s.activeTab);
  return tabs[(i + dir + tabs.length) % tabs.length].id;
}

/** Ctrl+1…8 picks by position; Ctrl+9 is always the last tab. */
export function tabAt(s: BrowserState, n: number): string | null {
  const tabs = orderedTabs(s);
  if (!tabs.length) return null;
  const t = n >= 9 ? tabs[tabs.length - 1] : tabs[n - 1];
  return t && t.id !== s.activeTab ? t.id : null;
}

// ---- Zoom ----

export const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5];

/** The next browser zoom level up or down from `z`. */
export function zoomStep(z: number, dir: 1 | -1): number {
  if (dir > 0) return ZOOM_STEPS.find((s) => s > z + 0.005) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1];
  return [...ZOOM_STEPS].reverse().find((s) => s < z - 0.005) ?? ZOOM_STEPS[0];
}

// ---- History and the start page ----

export interface DayGroup {
  label: string;
  items: HistoryEntry[];
}

/** History newest first, under "Today", "Yesterday", then the date. */
export function groupByDay(entries: HistoryEntry[], now = Date.now()): DayGroup[] {
  const day = (ms: number) => {
    const d = new Date(ms);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  };
  const today = day(now);
  const groups = new Map<number, HistoryEntry[]>();
  for (const e of [...entries].sort((a, b) => b.lastVisitMs - a.lastVisitMs)) {
    const k = day(e.lastVisitMs);
    groups.set(k, [...(groups.get(k) ?? []), e]);
  }
  return [...groups.entries()].map(([k, items]) => ({
    label: k === today ? "Today" : k === today - 86_400_000 ? "Yesterday" : new Date(k).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" }),
    items,
  }));
}

/** Most visited sites, one per host, for the start page. */
export function topSites(history: HistoryEntry[], n = 8): { host: string; url: string; title: string; visits: number }[] {
  const by = new Map<string, { host: string; url: string; title: string; visits: number; best: number }>();
  for (const h of history) {
    const host = hostOf(h.url);
    if (!host) continue;
    const cur = by.get(host);
    if (!cur) by.set(host, { host, url: h.url, title: h.title, visits: h.visits, best: h.visits });
    else {
      cur.visits += h.visits;
      if (h.visits > cur.best) {
        cur.best = h.visits;
        cur.url = h.url;
        cur.title = h.title;
      }
    }
  }
  return [...by.values()].sort((a, b) => b.visits - a.visits).slice(0, n).map(({ best: _best, ...r }) => r);
}

/** A download's file name from its path or URL. */
export function fileName(pathOrUrl: string): string {
  const tail = pathOrUrl.split(/[\\/]/).pop() ?? pathOrUrl;
  const clean = tail.split(/[?#]/)[0];
  try {
    return decodeURIComponent(clean) || pathOrUrl;
  } catch {
    return clean || pathOrUrl;
  }
}
