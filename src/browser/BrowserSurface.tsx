import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  ArrowLeft, ArrowRight, Bookmark as BookmarkIcon, BookOpen, Captions, ChevronDown, ChevronUp, Download, ExternalLink, Fingerprint, Globe, History as HistoryIcon, Lock,
  Minus, NotebookPen, PanelLeft, PanelRight, PictureInPicture2, Plus, RotateCw, Search, SlidersHorizontal, Sparkles, Star, X,
} from "lucide-react";
import { glideIn, useLingering, usePresence, type Pose } from "../ui/motion";
import { useLensState } from "../hooks/useLensState";
import { shelfAdd } from "../shelf/contract";
import { applyDither } from "../style/dither";
import "../style/dither.css";
import {
  archived as listArchived, bookmarkToggle, browserState, DEFAULT_APPEARANCE, DEFAULT_BROWSER_AI, DEFAULT_SIDEBAR, SIDEBAR_WIDTH, EVT_BROWSER_DOWNLOADS, EVT_BROWSER_STATE, findInPage, folderAdd,
  folderToggle, glance, historyNav, historySearch, navigate, notesGet, notesSet, openBackground, pageEvents, pageRead, pip, reopenClosed, setOverlay,
  settingsSet, setViewport, setZoom, spaceAdd, spaceLock, spaceSwitch, tabActivate, tabClose, tabDuplicate, tabMove, tabMute, tabPin, tidy, unarchive,
  type Appearance, type ArchivedTab, type BrowserAi, type BrowserView, type Download as Dl, type HistoryEntry, type ImportSource, type MenuEvent,
  EVT_BROWSER_PERMISSION, EVT_BROWSER_PERMISSION_DONE, permissionAnswer, permissionForget, permissionsList, permissionsWaiting,
  type PermissionAnswer, type PermissionAsk, type PermissionKind, type SitePermissions,
  split as splitCmd, shield as shieldCmd, shieldAllow, type Shield,
} from "./api";
import { ShieldButton, SplitDivider, SplitDropZone, SplitPill } from "./SplitView";
import { clampRatio, pairFor, partnerOf, splitOf, splitRects, type Rect } from "./split";
import { askFor, lateFor, PermissionBar, PermissionTimedOut, SiteStrip } from "./SitePermissions";
import { AgentPanel, type AgentSeed, type QuickAsk } from "./AgentPanel";
import { AiPanel } from "./AiPanel";
import { Key } from "./ApprovalCard";
import { BookmarksPanel } from "./BookmarksPanel";
import { CustomisePanel } from "./CustomisePanel";
import { ImportPanel, type ImportSeed } from "./ImportPanel";
import { DownloadsPanel, HistoryPanel } from "./Lists";
import { breadcrumb, classifyAddress, dropIndex, hostOf } from "./model";
import { cycleTab, IDLE_NAV, navFromStatus, suggestions, tabAt, zoomStep, type NavState, type PageStatus, type Suggestion } from "./nav";
import { ErrorPage, ReaderPage, StartPage, type ReaderSeed } from "./Pages";
import { Avatar, Sidebar, type ChatRef } from "./Sidebar";
import { applyProposal, propose, summarisePrompt, sidebarPrefs, type TabActionKind, type TabProposal } from "./tabAi";
import { TranscriptPanel, type TranscriptSeed } from "./TranscriptPanel";
import "./Browser.css";
import { oops, quiet } from "./oops";
import { toastBus } from "../ui/toastBus";

type Panel = "ask" | "transcript" | "downloads" | "history" | "bookmarks" | "notes" | "customise" | "import" | "ai" | null;

export interface BrowserInitial {
  view: BrowserView;
  panel?: Panel;
  agent?: AgentSeed;
  transcript?: TranscriptSeed;
  importSeed?: ImportSeed;
  aiStatus?: Parameters<typeof AiPanel>[0]["status"];
  chats?: ChatRef[];
  /** Parity only: draws a stand-in page where the real tab webview would sit. */
  mockPage?: React.ReactNode;
  now?: number;
  address?: string;
  suggestions?: HistoryEntry[];
  find?: string;
  findTotal?: number;
  glanceSummary?: string;
  /** Parity: toolbar state (back/forward, loading, a load error) the live app reads from the page. */
  nav?: Partial<NavState>;
  /** Parity: show the new-tab page. */
  start?: boolean;
  /** Parity: a permission request that timed out unanswered. */
  late?: PermissionAsk[];
  /** Parity: the reader view, open on this text. */
  reader?: ReaderSeed;
  /** Parity: history for the start page and the History panel. */
  history?: HistoryEntry[];
  /** Parity: which suggestion row is highlighted. */
  selected?: number;
  /** Parity: site permission requests waiting, and remembered answers. */
  asks?: PermissionAsk[];
  perms?: SitePermissions;
  /** Parity: a Lens plan waiting in the sidebar. */
  proposal?: TabProposal;
  /** Parity: a tab being dragged over the page (split view drop zones). */
  dragTab?: string;
  /** Parity: the address bar's ads-and-trackers shield. */
  shield?: Shield;
  /** Parity: the stand-in page for the right side of a split. */
  mockPageRight?: React.ReactNode;
}

/** Parity: where a split's stand-in page sits (the live app places native webviews instead). */
const mockAt = (r: Rect): React.CSSProperties => ({ left: r.x, width: r.w });

/** `https://host[:port]` of a web page, or "" (mirrors `permissions::origin_of`). */
function originOf(url: string): string {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.origin : "";
  } catch {
    return "";
  }
}

function forgetLocal(p: SitePermissions, origin: string, kind: PermissionKind | null): SitePermissions {
  const next = { ...p };
  if (!kind) delete next[origin];
  else {
    const m = { ...(next[origin] ?? {}) };
    delete m[kind];
    if (Object.keys(m).length) next[origin] = m;
    else delete next[origin];
  }
  return next;
}

const SUGGEST_ICON: Record<Suggestion["kind"], React.ComponentType<{ size?: number; className?: string }>> = {
  tab: PanelRight, bookmark: Star, history: HistoryIcon, url: Globe, search: Search, ask: Sparkles,
};
/** Shortcuts the frame handles itself (the page agent forwards the same set while a page has focus). */
const FRAME_KEYS = new Set([
  "ctrl+l", "ctrl+t", "ctrl+w", "ctrl+f", "ctrl+j", "ctrl+shift+t", "ctrl+d", "ctrl+shift+k", "ctrl+shift+a", "ctrl+tab", "ctrl+shift+tab", "ctrl+h", "ctrl+r",
  "ctrl+shift+s", "ctrl+shift+x",
  "ctrl+=", "ctrl++", "ctrl+shift++", "ctrl+shift+=", "ctrl+-", "ctrl+shift+_", "ctrl+0", "ctrl+1", "ctrl+2", "ctrl+3", "ctrl+4", "ctrl+5", "ctrl+6", "ctrl+7", "ctrl+8", "ctrl+9",
]);

/** Glides an element in when `on` turns true (suggestions, the find bar). */
function useEnter<T extends HTMLElement>(on: boolean, from: Pose = { y: -4, opacity: 0 }) {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    if (on) glideIn(ref.current, from, { duration: "fast" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on]);
  return ref;
}

const QUICK: Record<string, string> = {
  ask: "Answer my question about this",
  summarise: "Summarise this: a TL;DR line, then key points",
  explain: "Explain this simply, with one example",
  translate: `Translate this into ${navigator.language || "English"}`,
  rewrite: "Rewrite this to be clearer and shorter",
  extract: "Extract the tables, links, dates and to-dos as Markdown lists",
};

type PanelDef = [Exclude<Panel, null>, string, React.ComponentType<{ size?: number }>];
const PAGE_PANELS: PanelDef[] = [
  ["ask", "Ask", Sparkles],
  ["transcript", "Transcript", Captions],
  ["bookmarks", "Bookmarks", BookmarkIcon],
  ["notes", "Notes", NotebookPen],
  ["history", "History", HistoryIcon],
  ["downloads", "Downloads", Download],
];
const SETTINGS_PANELS: PanelDef[] = [
  ["customise", "Make it yours", PanelRight],
  ["import", "Import", Download],
  ["ai", "AI", Sparkles],
];

/** Light/dark tokens for when the browser's own scheme differs from Lens's. */
const SCHEME_TOKENS: Record<"light" | "dark", Record<string, string>> = {
  dark: {
    "--lens-pack-base": "#0a0a0b", "--lens-bg-base": "#0a0a0b", "--lens-bg-surface": "#111113", "--lens-bg-elevated": "#18181b", "--lens-bg-hover": "rgba(255,255,255,.06)",
    "--lens-fg": "#ededef", "--lens-fg-strong": "#fafafa", "--lens-fg-secondary": "#b4b4b9", "--lens-fg-muted": "#86868c", "--lens-border": "rgba(255,255,255,.08)",
    "--lens-border-strong": "rgba(255,255,255,.14)", "--lens-on-fg": "#0a0a0b",
  },
  light: {
    "--lens-pack-base": "#f5f5f3", "--lens-bg-base": "#f5f5f3", "--lens-bg-surface": "#fbfbfa", "--lens-bg-elevated": "#ffffff", "--lens-bg-hover": "rgba(0,0,0,.05)",
    "--lens-fg": "#1c1c1e", "--lens-fg-strong": "#0a0a0b", "--lens-fg-secondary": "#4a4a50", "--lens-fg-muted": "#6e6e75", "--lens-border": "rgba(0,0,0,.08)",
    "--lens-border-strong": "rgba(0,0,0,.14)", "--lens-on-fg": "#ffffff",
  },
};

const TYPEFACES: Record<Appearance["typeface"], string> = {
  lens: "",
  system: '"Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif',
  mono: 'ui-monospace, "Cascadia Mono", Consolas, monospace',
  serif: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
};

export function BrowserSurface({ initial }: { initial?: BrowserInitial }) {
  useLensState();
  const [view, setView] = useState<BrowserView | null>(initial?.view ?? null);
  const [panel, setPanel] = useState<Panel>(initial?.panel === undefined ? "ask" : initial.panel);
  const [sideOpen, setSideOpen] = useState(true);
  const [proposal, setProposal] = useState<TabProposal | null>(initial?.proposal ?? null);
  const [findSignal, setFindSignal] = useState(0);
  const [address, setAddress] = useState(initial?.address ?? "");
  const [editing, setEditing] = useState(!!initial?.address);
  const [suggest, setSuggest] = useState<HistoryEntry[]>(initial?.suggestions ?? []);
  const [find, setFind] = useState<string | null>(initial?.find ?? null);
  const [findInfo, setFindInfo] = useState<{ found: boolean; total: number } | null>(initial?.find !== undefined ? { found: (initial.findTotal ?? 0) > 0, total: initial.findTotal ?? 0 } : null);
  const [quick, setQuick] = useState<QuickAsk | null>(null);
  const [awaiting, setAwaiting] = useState(initial?.agent?.pending ? 1 : 0);
  const [toast, setToast] = useState<string | null>(null);
  const [downloads, setDownloads] = useState<Dl[]>(initial?.view.downloads ?? []);
  const [recent, setRecent] = useState<HistoryEntry[]>(initial?.history ?? []);
  const [nav, setNav] = useState<NavState>({ ...IDLE_NAV, ...(initial?.nav ?? {}) });
  const [startOpen, setStartOpen] = useState(!!initial?.start);
  const [sel, setSel] = useState(initial?.selected ?? 0);
  const [arch, setArch] = useState<ArchivedTab[]>([]);
  const [crashed, setCrashed] = useState(false);
  // Reader view: the active page's own text, set by Lens (local; nothing is loaded).
  const [reader, setReader] = useState<ReaderSeed | null>(initial?.reader ?? null);
  // Site permissions: requests waiting for an answer, remembered answers, and the site strip.
  const [asks, setAsks] = useState<PermissionAsk[]>(initial?.asks ?? []);
  const [perms, setPerms] = useState<SitePermissions>(initial?.perms ?? {});
  const [siteOpen, setSiteOpen] = useState(!!initial?.perms && !initial?.asks?.length);
  const [notes, setNotes] = useState("");
  const [glanceSummary, setGlanceSummary] = useState<string | null>(initial?.glanceSummary ?? null);
  const rootRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const addrRef = useRef<HTMLInputElement>(null);
  const failures = useRef(0);
  const live = !initial;

  const s = view?.state;
  const tab = s?.tabs.find((t) => t.id === s.activeTab) ?? null;
  const url = tab?.url ?? "";
  const appearance: Appearance = { ...DEFAULT_APPEARANCE, ...(s?.settings.appearance ?? {}) };
  const ai: BrowserAi = { ...DEFAULT_BROWSER_AI, ...(s?.settings.ai ?? {}) };
  const aiOn = ai.enabled;
  const space = s?.spaces.find((x) => x.id === s.activeSpace);
  const locked = !!space?.locked && !(view?.unlocked ?? []).includes(space.id);

  const origin = originOf(url);
  // Split view: the active tab's pair, the tab being dragged over the page, the page's area.
  const sp = splitOf(s, tab?.id);
  const [dragTab, setDragTab] = useState<string | null>(initial?.dragTab ?? null);
  const [area, setArea] = useState<Rect>({ x: 0, y: 0, w: 0, h: 0 });
  const [ratio, setRatio] = useState<number | null>(null);
  const shownSplit = sp ? { ...sp, ratio: ratio ?? sp.ratio } : null;
  const ratioFrame = useRef(0);
  // The address bar's ads-and-trackers shield.
  const [shieldState, setShield] = useState<Shield | null>(initial?.shield ?? null);
  const ask = askFor(asks, tab?.id);
  // Requests that timed out unanswered (Lens blocked them): said once on their tab.
  const [late, setLate] = useState<PermissionAsk[]>(initial?.late ?? []);
  const lateAsk = ask ? undefined : lateFor(late, tab?.id);
  const answer = (a: PermissionAsk, how: PermissionAnswer) => {
    setAsks((xs) => xs.filter((x) => x.id !== a.id));
    if (how !== "once") setPerms((p) => ({ ...p, [a.origin]: { ...(p[a.origin] ?? {}), [a.kind]: how === "site" } }));
    if (live) void permissionAnswer(a.id, how).catch((e) => flash(String(e)));
  };
  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2200);
  };
  // Failures reported by any part of the browser (`oops(...)`, src/browser/oops.ts) show here.
  useEffect(() => {
    let seen = toastBus.items[toastBus.items.length - 1]?.id ?? 0;
    return toastBus.subscribe((items) => {
      const last = items[items.length - 1];
      if (!last || last.id <= seen) return;
      seen = last.id;
      setToast(last.text);
      window.setTimeout(() => setToast((t) => (t === last.text ? null : t)), last.kind === "error" ? 4200 : 2200);
    });
  }, []);

  // The side panel slides; it stays mounted until it has left, then the page gets the room back
  // in one step (the native page view is never resized mid-animation).
  const panelP = usePresence<HTMLElement>(!!panel, {
    enter: { x: 24, opacity: 0 }, exit: { x: 24, opacity: 0 }, enterOptions: { duration: "base", ease: "drawer" }, exitOptions: { duration: "exit", ease: "exit" }, initial: false,
  });
  const lastPanel = useRef<Panel>(panel);
  if (panel) lastPanel.current = panel;
  const shown: Panel = panel ?? (panelP.mounted ? lastPanel.current : null);
  const toastP = useLingering<string>(toast, { enter: { y: 8, opacity: 0 }, exit: { y: 8, opacity: 0 }, enterOptions: { additive: true }, exitOptions: { additive: true } });

  const rows: Suggestion[] =
    editing && s && address.trim() !== url
      ? suggestions(address, { tabs: s.tabs.filter((t) => t.spaceId === s.activeSpace), bookmarks: s.bookmarks, history: suggest, activeTab: s.activeTab, ask: aiOn && ai.askInAddressBar })
      : [];
  const suggestRef = useEnter<HTMLUListElement>(rows.length > 0);
  const findRef = useEnter<HTMLDivElement>(find !== null);
  const tabLive = !!tab && !!view?.live.includes(tab.id);
  const apply = useCallback((p: Promise<BrowserView>) => p.then(setView).catch((e) => flash(String(e))), []);
  const saveSettings = (patch: Partial<NonNullable<typeof s>["settings"]>) => {
    if (!s) return;
    const settings = { ...s.settings, ...patch };
    setView({ ...view!, state: { ...s, settings } });
    if (live) void settingsSet(settings).then(setView).catch((e) => flash(String(e)));
  };

  // The sidebar's look, and Lens acting on tabs: every plan is shown in the sidebar first and only
  // applied from its Apply button (Summarise changes nothing, it opens the Ask panel).
  const sidePrefs = sidebarPrefs(appearance.sidebar, DEFAULT_SIDEBAR, SIDEBAR_WIDTH);
  const proposeRef = useRef<(k: TabActionKind) => void>(() => {});
  proposeRef.current = (k) => {
    if (!s) return;
    if (k === "summarise") {
      setProposal(null);
      if (!aiOn) return;
      setPanel("ask");
      setQuick({ prompt: summarisePrompt(s), page: false });
      return;
    }
    const plan = propose(k, s, initial?.now ?? Date.now());
    if (!plan) {
      setProposal(null);
      flash(k === "duplicates" ? "No duplicate tabs" : k === "tidy" ? "Nothing to tidy" : "No site has two loose tabs");
      return;
    }
    setProposal(plan);
  };
  const applyPlan = async () => {
    const plan = proposal;
    setProposal(null);
    if (!plan || !s) return;
    if (!live) return flash(`Applied: ${plan.title}`);
    let cur = s;
    const take = (v: BrowserView) => {
      cur = v.state;
      setView(v);
      return v;
    };
    try {
      await applyProposal(plan, true, {
        tidy: () => tidy().then((r) => flash(`Tidied: ${r.duplicatesClosed} duplicates closed, ${r.archived} archived`)),
        closeTab: (id) => tabClose(id).then(take),
        addFolder: async (name) => {
          const before = new Set(cur.folders.map((f) => f.id));
          const v = take(await folderAdd(cur.activeSpace, name));
          return v.state.folders.find((f) => !before.has(f.id))?.id ?? null;
        },
        moveToFolder: async (id, folderId) => {
          const d = dropIndex(cur, null, folderId);
          take(await tabMove(id, d.index, d.folder));
        },
      });
      if (plan.kind !== "tidy") flash(`Done: ${plan.title}`);
    } catch (e) {
      flash(String(e));
    }
    void browserState().then(setView).catch(quiet);
  };
  // A plan is for the tabs as they were: switching space drops it.
  const planSpace = useRef(s?.activeSpace);
  useEffect(() => {
    if (planSpace.current !== s?.activeSpace) setProposal(null);
    planSpace.current = s?.activeSpace;
  }, [s?.activeSpace]);

  // AI off: nothing AI-related stays open.
  useEffect(() => {
    if (!aiOn && (panel === "ask" || panel === "transcript")) setPanel(null);
  }, [aiOn, panel]);

  useEffect(() => {
    if (!live) return;
    browserState().then(setView).catch(quiet);
    const un1 = listen<BrowserView>(EVT_BROWSER_STATE, (e) => setView(e.payload));
    const un2 = listen<Dl[]>(EVT_BROWSER_DOWNLOADS, (e) => setDownloads(e.payload));
    permissionsWaiting().then(setAsks).catch(quiet);
    permissionsList().then(setPerms).catch(quiet);
    const un3 = listen<PermissionAsk>(EVT_BROWSER_PERMISSION, (e) => setAsks((xs) => [...xs.filter((x) => x.id !== e.payload.id), e.payload]));
    const un4 = listen<{ id: number; reason?: string }>(EVT_BROWSER_PERMISSION_DONE, (e) =>
      setAsks((xs) => {
        const gone = xs.find((x) => x.id === e.payload.id);
        if (gone && e.payload.reason === "timeout") setLate((l) => [...l.filter((x) => x.tab !== gone.tab), gone].slice(-8));
        return xs.filter((x) => x.id !== e.payload.id);
      })
    );
    return () => {
      un1.then((u) => u());
      un2.then((u) => u());
      un3.then((u) => u());
      un4.then((u) => u());
    };
  }, [live]);

  // The dither texture follows the browser's own Dither and Grain settings.
  useEffect(() => {
    if (rootRef.current) applyDither(rootRef.current, { dither: appearance.dither, grain: appearance.grain });
  }, [appearance.dither, appearance.grain, appearance.scheme, view === null]);

  // Report where the page goes; the backend moves the tab webview there.
  useLayoutEffect(() => {
    if (!live || !pageRef.current) return;
    const el = pageRef.current;
    const send = () => {
      const r = el.getBoundingClientRect();
      setArea({ x: r.left, y: r.top, w: r.width, h: r.height });
      void setViewport(r.left, r.top, r.width, r.height).catch(quiet);
    };
    const ro = new ResizeObserver(send);
    ro.observe(el);
    send();
    return () => ro.disconnect();
  }, [live, panelP.mounted, sideOpen, find, view?.glance, appearance.tabsLayout, glanceSummary, sidePrefs.side, sidePrefs.mode, sidePrefs.width]);

  useLayoutEffect(() => {
    if (live || !pageRef.current) return;
    const r = pageRef.current.getBoundingClientRect();
    setArea({ x: r.left, y: r.top, w: r.width, h: r.height });
  }, [live, panelP.mounted, sideOpen]);

  // The shield's count, while a page is showing.
  useEffect(() => {
    if (!live || !tab) return;
    let gone = false;
    const read = () => void shieldCmd(tab.id).then((x) => { if (!gone) setShield(x); }).catch(quiet);
    read();
    const id = window.setInterval(() => document.visibilityState === "visible" && read(), 1500);
    return () => { gone = true; window.clearInterval(id); };
  }, [live, tab?.id, tab?.url]);

  // The page draws above the frame UI, so hide it while suggestions, the new-tab page or an
  // error page are showing.
  // The icon stack's Lens menu and plan float over the page, so the page hides while they show.
  const [stackPop, setStackPop] = useState(false);
  const overlay = !!dragTab || rows.length > 0 || crashed || startOpen || !!nav.error || !!reader || (sideOpen && sidePrefs.mode === "stack" && (stackPop || !!proposal));
  useEffect(() => {
    if (live) void setOverlay(overlay).catch(quiet);
  }, [overlay, live]);

  useEffect(() => {
    if (!live || !editing) return;
    const t = window.setTimeout(() => historySearch(address, 6).then(setSuggest).catch(quiet), 90);
    return () => window.clearTimeout(t);
  }, [address, editing, live]);

  useEffect(() => {
    if (!live) return;
    if (panel === "history") listArchived().then(setArch).catch(oops("load archived tabs"));
    if (panel === "notes" && url) notesGet(url).then(setNotes).catch(oops("load your notes for this page"));
  }, [panel, live, view, url]);

  // Keep the highlighted suggestion inside the list as it changes.
  useEffect(() => {
    if (!initial) setSel(0);
  }, [address, initial]);

  // The new-tab page lists the sites used most.
  const showStart = startOpen || (!!view && !tab);
  useEffect(() => {
    if (live && showStart) historySearch("", 80).then(setRecent).catch(quiet);
  }, [live, showStart]);

  // Toolbar truth: ask the active page whether it can go back or forward, whether it is still
  // loading, and whether it is the engine's error page.
  const tabId = tab?.id;
  useEffect(() => {
    if (!live) return;
    setNav(IDLE_NAV);
    if (!tabId || !tabLive) return;
    let gone = false;
    const read = () => {
      if (document.visibilityState !== "visible") return;
      pageRead<PageStatus>("status", tabId)
        .then((st) => {
          if (gone) return;
          const next = navFromStatus(st);
          setNav((cur) => (JSON.stringify(cur) === JSON.stringify(next) ? cur : next));
        })
        .catch(quiet);
    };
    read();
    const id = window.setInterval(read, 600);
    return () => {
      gone = true;
      window.clearInterval(id);
    };
  }, [live, tabId, tabLive]);

  const zoomTo = useCallback((z: number) => {
    if (live) void setZoom(z).catch((e) => flash(String(e)));
  }, [live]);
  const reload = useCallback(() => {
    setNav((n) => ({ ...n, loading: true, error: "" }));
    void historyNav("reload").catch(oops("reload the page"));
  }, []);

  // Reader view opens on the text the page agent already extracts; it closes when the tab or the
  // address changes, so it never shows one page's text under another page's address.
  const toggleReader = useCallback(async () => {
    if (reader) return setReader(null);
    if (!tab) return;
    if (!live) return;
    try {
      const r = await pageRead<{ text: string; url: string; title?: string }>("readable");
      setReader({ tabId: tab.id, tabUrl: tab.url, url: r.url || tab.url, title: r.title || tab.title, text: r.text || "" });
    } catch {
      flash("Couldn't read this page. Try again once it has loaded.");
    }
  }, [reader, tab, live]);
  useEffect(() => {
    if (reader && live && (!tab || tab.id !== reader.tabId || tab.url !== reader.tabUrl)) setReader(null);
  }, [reader, live, tab]);

  const openGlance = useCallback(async (u: string) => {
    setGlanceSummary(null);
    try {
      await glance("open", u);
    } catch (e) {
      flash(String(e));
    }
  }, []);

  const combo = useCallback(
    (k: string) => {
      switch (k) {
        case "ctrl+l":
          addrRef.current?.focus();
          setEditing(true);
          break;
        case "ctrl+t":
          setAddress("");
          setStartOpen(true);
          setEditing(true);
          window.setTimeout(() => addrRef.current?.focus(), 0);
          break;
        case "ctrl+tab":
        case "ctrl+shift+tab": {
          const next = s ? cycleTab(s, k === "ctrl+tab" ? 1 : -1) : null;
          if (next) { setStartOpen(false); void apply(tabActivate(next)); }
          break;
        }
        case "ctrl+h":
          setPanel((p) => (p === "history" ? null : "history"));
          break;
        case "ctrl+r":
          reload();
          break;
        case "alt+left":
          void historyNav("back").catch(oops("go back"));
          break;
        case "alt+right":
          void historyNav("forward").catch(oops("go forward"));
          break;
        case "esc":
          if (reader) setReader(null);
          else if (startOpen && tab) setStartOpen(false);
          else if (nav.loading) void historyNav("stop").then(() => setNav((n) => ({ ...n, loading: false }))).catch(oops("stop loading"));
          break;
        case "ctrl+=":
        case "ctrl++":
        case "ctrl+shift++":
        case "ctrl+shift+=":
          zoomTo(zoomStep(tab?.zoom ?? 1, 1));
          break;
        case "ctrl+-":
        case "ctrl+shift+_":
          zoomTo(zoomStep(tab?.zoom ?? 1, -1));
          break;
        case "ctrl+0":
          zoomTo(1);
          break;
        case "ctrl+w":
          if (tab) void apply(tabClose(tab.id));
          break;
        case "ctrl+shift+t":
          void apply(reopenClosed());
          break;
        case "ctrl+f":
          setFind("");
          break;
        case "ctrl+d":
          void bookmarkToggle().then((on) => flash(on ? "Bookmarked" : "Bookmark removed")).catch(oops("change the bookmark"));
          break;
        case "ctrl+j":
          if (aiOn) setPanel((p) => (p === "ask" ? null : "ask"));
          break;
        case "ctrl+shift+k":
          // Tidy shows its plan in the sidebar first; nothing changes until Apply.
          setSideOpen(true);
          proposeRef.current("tidy");
          break;
        case "ctrl+shift+a":
          setSideOpen(true);
          setFindSignal((n) => n + 1);
          break;
        case "ctrl+shift+s":
          // Split the active tab with the most recent other tab, or close the split.
          if (tab) void apply(splitOf(s, tab.id) ? splitCmd("close", { tab: tab.id }) : splitCmd("with", { tab: tab.id }));
          break;
        case "ctrl+shift+x":
          if (tab && splitOf(s, tab.id)) void apply(splitCmd("swap", { tab: tab.id }));
          break;
        default: {
          const n = /^ctrl\+([1-9])$/.exec(k);
          const id = n && s ? tabAt(s, Number(n[1])) : null;
          if (id) { setStartOpen(false); void apply(tabActivate(id)); }
        }
      }
    },
    [tab, apply, aiOn, s, startOpen, nav.loading, zoomTo, reload, reader]
  );

  const onMenu = useCallback(
    async (ev: MenuEvent) => {
      if (ev.action === "key") return combo((ev as MenuEvent & { key: string }).key);
      if (ev.action === "glance") return void openGlance(ev.linkUrl);
      if (ev.action.startsWith("mark:")) {
        // In-page Lens marks (docs/IN_PAGE_LENS.md). Copies happen in the page; these need Lens.
        const kind = ev.action.slice(5);
        const text = ev.selection?.trim() || "";
        if (kind === "shelf" || kind === "context") {
          await shelfAdd({ kind: "text", title: (text || ev.title).slice(0, 80), text: text || ev.linkUrl || ev.url, url: ev.linkUrl || ev.url, tags: kind === "context" ? ["context"] : [] }).catch((e) => flash(String(e)));
          return flash(kind === "context" ? "Added to Shelf as context" : "Saved to Shelf");
        }
        if (kind === "transcript-shelf" || kind === "transcript-copy") {
          if (aiOn && ai.transcripts) setPanel("transcript");
          return;
        }
        const quick = QUICK[kind === "summarize" ? "summarise" : kind];
        if (quick && aiOn) {
          setPanel("ask");
          setQuick({ prompt: quick, selection: text || undefined, url: ev.url, title: ev.title, page: !text });
          return;
        }
        if (kind === "more" || kind === "command" || quick) {
          if (!aiOn) return flash("Turn on the AI helper to ask about this");
          setPanel("ask");
          setQuick({ prompt: text || "Help me with this page", selection: undefined, url: ev.url, title: ev.title, page: !text });
          return;
        }
        return;
      }
      const sel = ev.selection?.trim();
      if (QUICK[ev.action]) {
        if (!aiOn) return;
        setPanel("ask");
        setQuick({ prompt: QUICK[ev.action], selection: sel || undefined, url: ev.url, title: ev.title, page: !sel });
        return;
      }
      switch (ev.action) {
        case "shelf_add":
        case "context_add":
          await shelfAdd({
            kind: sel ? "selection" : ev.linkUrl ? "text" : "page",
            title: sel ? sel.slice(0, 80) : ev.title,
            text: sel || (ev.linkUrl ? ev.linkUrl : (await pageRead<{ text: string }>("readable").catch(() => ({ text: "" }))).text),
            url: ev.linkUrl || ev.url,
            tags: ev.action === "context_add" ? ["context"] : [],
          }).catch((e) => flash(String(e)));
          flash(ev.action === "context_add" ? "Added to Shelf as context" : "Added to Shelf");
          return;
        case "copy_markdown": {
          const md = sel ? `> ${sel.replace(/\n/g, "\n> ")}\n\n— [${ev.title}](${ev.url})` : `[${ev.title}](${ev.url})`;
          await navigator.clipboard?.writeText(md).catch(oops("copy the page"));
          flash("Copied as Markdown");
          return;
        }
        case "transcribe":
        case "yt_transcript":
          if (aiOn && ai.transcripts) setPanel("transcript");
          return;
      }
    },
    [combo, openGlance, aiOn, ai.transcripts]
  );

  // Collect Lens right-click choices and shortcuts from the active page. Repeated failures from a
  // live page mean the renderer died: show the crashed-tab page.
  useEffect(() => {
    if (!live) return;
    const id = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      pageEvents()
        .then((evs) => {
          failures.current = 0;
          if (crashed) setCrashed(false);
          evs.forEach((e) => void onMenu(e));
        })
        .catch((e) => {
          if (/didn't answer/.test(String(e)) && tab && view?.live.includes(tab.id)) {
            failures.current += 1;
            if (failures.current >= 8) setCrashed(true);
          }
        });
    }, 300);
    return () => window.clearInterval(id);
  }, [live, onMenu, crashed, tab, view?.live]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement;
      if (e.key === "F5") {
        e.preventDefault();
        return combo("ctrl+r");
      }
      if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        e.preventDefault();
        return combo(e.key === "ArrowLeft" ? "alt+left" : "alt+right");
      }
      if (e.key === "Escape" && !typing) return combo("esc");
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const c = `ctrl+${e.shiftKey ? "shift+" : ""}${e.key.toLowerCase()}`;
      if (FRAME_KEYS.has(c)) {
        e.preventDefault();
        combo(c);
      }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [combo]);

  const go = async (input: string, newTab = false) => {
    const fresh = newTab || (startOpen && !!tab);
    setEditing(false);
    setSuggest([]);
    setStartOpen(false);
    if (!live) return;
    setNav((n) => ({ ...n, loading: true, error: "" }));
    try {
      const r = await navigate(input, fresh);
      if (r.ask) {
        setPanel("ask");
        setQuick({ prompt: r.ask, url, page: true });
      } else if (r.view) setView(r.view);
    } catch (e) {
      flash(String(e));
    }
  };

  if (!view || !s) return <div className="lb-root lb-loading" />;
  const kind = classifyAddress(address);
  const showKind = kind && (kind.kind !== "ask" || (aiOn && ai.askInAddressBar)) ? kind : kind?.kind === "ask" ? { kind: "search" as const, value: kind.value } : kind;
  const pick = (r: Suggestion, newTab = false) => {
    if (r.kind !== "tab") return void go(r.value, newTab);
    setEditing(false);
    setSuggest([]);
    setStartOpen(false);
    void apply(tabActivate(r.value));
  };
  const active = rows[Math.min(sel, rows.length - 1)];
  const running = downloads.filter((d) => d.state === "downloading").length;
  const zoomPct = Math.round((tab?.zoom ?? 1) * 100);
  const findStep = (back: boolean) => find && void findInPage(find, back).then(setFindInfo).catch(oops("search the page"));
  const crumbs = breadcrumb(url);
  const zoom = tab?.zoom ?? 1;
  const pagePanels = PAGE_PANELS.filter(([id]) => (id === "ask" ? aiOn : id === "transcript" ? aiOn && ai.transcripts : true));
  const inSettings = panel === "customise" || panel === "import" || panel === "ai";
  const panelTabs = inSettings ? SETTINGS_PANELS : pagePanels;
  const horizontal = appearance.tabsLayout === "horizontal";
  const schemeVars = appearance.scheme === "auto" ? {} : SCHEME_TOKENS[appearance.scheme];
  const rootStyle = {
    ...schemeVars,
    ...(appearance.accent ? { "--lens-accent": appearance.accent } : {}),
    ...(TYPEFACES[appearance.typeface] ? { "--lens-font": TYPEFACES[appearance.typeface] } : {}),
    "--lb-side": `${sidePrefs.mode === "stack" ? 56 : sidePrefs.width}px`,
  } as React.CSSProperties;
  const sleeping = s.tabs.filter((t) => t.life === "sleeping" && !t.archivedMs).length;
  const audible = s.tabs.find((t) => t.audible && t.spaceId === s.activeSpace && t.id !== s.activeTab);
  const spaceTabs = s.tabs.filter((t) => t.spaceId === s.activeSpace && !t.archivedMs).sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.order - b.order);

  return (
    <div
      ref={rootRef}
      data-guide-id="browser"
      className={`lb-root${sideOpen && !horizontal ? "" : " no-side"}${shown ? " has-panel" : ""} lb-${appearance.density}${appearance.scheme === "auto" ? "" : ` lb-scheme-${appearance.scheme}`}${sidePrefs.side === "right" ? " lb-side-right" : ""}${sidePrefs.mode === "stack" ? " lb-side-stack" : ""}`}
      style={rootStyle}
      data-lb-scheme={appearance.scheme}
    >
      {sideOpen && !horizontal ? (
        <Sidebar
          view={view}
          chats={aiOn ? initial?.chats ?? [] : []}
          activeChat={null}
          now={initial?.now}
          sleeping={sleeping}
          media={audible ? { id: audible.id, title: audible.title || hostOf(audible.url), url: audible.url, muted: audible.muted } : null}
          onSearch={() => addrRef.current?.focus()}
          onSpace={(id) => void apply(spaceSwitch(id))}
          onNewSpace={() => void apply(spaceAdd(`Space ${s.spaces.length + 1}`))}
          onNewTab={() => combo("ctrl+t")}
          onNewFolder={() => void apply(folderAdd(s.activeSpace, "New folder"))}
          onActivate={(id) => void apply(tabActivate(id))}
          onClose={(id) => void apply(tabClose(id))}
          onMute={(id, on) => void apply(tabMute(id, on))}
          onPin={(id, on) => void apply(tabPin(id, on))}
          onDuplicate={(id) => void apply(tabDuplicate(id))}
          loading={nav.loading}
          onToggleFolder={(id) => void apply(folderToggle(id))}
          onDrop={(id, before, folder) => {
            const d = dropIndex(s, before, folder);
            void apply(tabMove(id, d.index, d.folder));
          }}
          onOpenUrl={(u, bg) => (bg ? void apply(openBackground(u)) : void go(u, true))}
          onChat={() => setPanel("ask")}
          onCollapse={() => setSideOpen(false)}
          prefs={sidePrefs}
          onPrefs={(patch) => saveSettings({ appearance: { ...appearance, sidebar: { ...sidePrefs, ...patch } } })}
          ai={aiOn}
          proposal={proposal}
          onPropose={(k) => proposeRef.current(k)}
          onCancelProposal={() => setProposal(null)}
          onApplyProposal={() => void applyPlan()}
          findSignal={findSignal}
          onPopover={setStackPop}
          onDragTab={setDragTab}
          onLock={() => space && void spaceLock(space.id, !space.locked).then(() => browserState().then(setView)).catch((e) => flash(String(e)))}
          onSettings={() => setPanel(inSettings ? null : "customise")}
        />
      ) : null}

      <main className="lb-main">
        <header className="lb-top" data-tauri-drag-region>
          {sideOpen && !horizontal ? null : (
            <button className="lb-icon-btn" aria-label="Show sidebar" onClick={() => { setSideOpen(true); if (horizontal) saveSettings({ appearance: { ...appearance, tabsLayout: "vertical" } }); }}>
              <PanelLeft size={16} />
            </button>
          )}
          <button className="lb-icon-btn" aria-label="Back" disabled={!nav.canBack} onClick={() => combo("alt+left")}><ArrowLeft size={16} /></button>
          <button className="lb-icon-btn" aria-label="Forward" disabled={!nav.canForward} onClick={() => combo("alt+right")}><ArrowRight size={16} /></button>
          {nav.loading ? (
            <button className="lb-icon-btn" aria-label="Stop loading" onClick={() => combo("esc")}><X size={15} /></button>
          ) : (
            <button className="lb-icon-btn" aria-label="Reload" disabled={!tab} onClick={reload}><RotateCw size={15} /></button>
          )}

          <div className={`lb-addr${editing ? " is-editing" : ""}`}>
            {editing ? (
              <>
                <Search size={14} className="lb-dim" />
                <input
                  ref={addrRef}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  onBlur={() => window.setTimeout(() => { setEditing(false); setSuggest([]); }, 120)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      if (active && sel > 0) pick(active, e.altKey || e.ctrlKey);
                      else void go(address, e.altKey || e.ctrlKey);
                    }
                    if (e.key === "ArrowDown" && rows.length) { e.preventDefault(); setSel((i) => (i + 1) % rows.length); }
                    if (e.key === "ArrowUp" && rows.length) { e.preventDefault(); setSel((i) => (i - 1 + rows.length) % rows.length); }
                    if (e.key === "Tab" && !e.shiftKey && active?.url && sel > 0) { e.preventDefault(); setAddress(active.url); }
                    if (e.key === "Escape") { setEditing(false); setSuggest([]); if (tab) setStartOpen(false); }
                  }}
                  placeholder={aiOn && ai.askInAddressBar ? "Search, enter an address, or start with ask" : "Search or enter an address"}
                  aria-label="Address"
                  role="combobox"
                  aria-expanded={rows.length > 0}
                  aria-controls="lb-suggest"
                  aria-autocomplete="list"
                  aria-activedescendant={active ? `lb-sg-${rows.indexOf(active)}` : undefined}
                  autoComplete="off"
                  spellCheck={false}
                  autoFocus
                />
                {showKind ? <Key k={showKind.kind === "ask" ? "Ask ⏎" : showKind.kind === "url" ? "Go ⏎" : "Search ⏎"} /> : null}
              </>
            ) : (
              <button className="lb-addr-view" onClick={() => { setAddress(url); setEditing(true); window.setTimeout(() => addrRef.current?.select(), 0); }} aria-label="Edit address">
                {tab ? <Avatar url={url} title={tab.title} size={14} /> : null}
                <span className="lb-crumbs">
                  {crumbs.map((c, i) => (
                    <React.Fragment key={i}>
                      {i ? <span className="lb-crumb-sep">/</span> : null}
                      <span className={i === 0 ? "lb-crumb-host" : "lb-crumb"}>{c}</span>
                    </React.Fragment>
                  ))}
                </span>
              </button>
            )}
            {!editing && tab && origin ? (
              <button className={`lb-icon-btn sm${siteOpen ? " is-on" : ""}`} aria-label={`Site permissions for ${hostOf(url)}`} aria-expanded={siteOpen} onClick={() => setSiteOpen((o) => !o)}>
                <SlidersHorizontal size={13} />
              </button>
            ) : null}
            {!editing && tab && shieldState ? (
              <ShieldButton
                shield={shieldState}
                onToggle={() => {
                  const next = !shieldState.allowed;
                  setShield({ ...shieldState, allowed: next, blocked: next ? 0 : shieldState.blocked });
                  if (live) void shieldAllow(shieldState.site, next).then(setShield).catch(oops("change blocking for this site"));
                  flash(next ? `Ads and trackers allowed on ${shieldState.site}` : `Lens blocks ads and trackers on ${shieldState.site} again`);
                }}
              />
            ) : null}
            {!editing && tab ? (
              <button className={`lb-icon-btn sm${view.bookmarked ? " is-on" : ""}`} aria-label={view.bookmarked ? "Remove bookmark" : "Bookmark"} onClick={() => combo("ctrl+d")}>
                <Star size={14} fill={view.bookmarked ? "currentColor" : "none"} />
              </button>
            ) : null}
            {rows.length ? (
              <ul className="lb-suggest" role="listbox" id="lb-suggest" aria-label="Suggestions" ref={suggestRef}>
                {rows.map((r, i) => {
                  const Icon = SUGGEST_ICON[r.kind];
                  const on = r === active;
                  return (
                    <li key={r.key} id={`lb-sg-${i}`} role="option" aria-selected={on} className={on ? "is-on" : undefined} onMouseEnter={() => setSel(i)} onMouseDown={(e) => { e.preventDefault(); pick(r, e.ctrlKey || e.metaKey); }}>
                      {r.url && r.kind !== "url" ? <Avatar url={r.url} title={r.title} size={14} /> : <Icon size={14} className="lb-dim" />}
                      <span className="lb-tab-title">{r.title}</span>
                      <span className="lb-mono lb-dim">{r.detail}</span>
                      {on ? <Key k={r.kind === "tab" ? "Switch ⏎" : r.kind === "ask" ? "Ask ⏎" : r.kind === "search" ? "Search ⏎" : "Go ⏎"} /> : null}
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>

          {Math.abs(zoom - 1) > 0.01 ? (
            <span className="lb-zoom" role="group" aria-label="Zoom">
              <button className="lb-icon-btn sm" aria-label="Zoom out" onClick={() => zoomTo(zoomStep(zoom, -1))}><Minus size={12} /></button>
              <button className="lb-zoom-val lb-mono" aria-label={`Zoom ${zoomPct}%. Reset to 100%`} onClick={() => zoomTo(1)}>{zoomPct}%</button>
              <button className="lb-icon-btn sm" aria-label="Zoom in" onClick={() => zoomTo(zoomStep(zoom, 1))}><Plus size={12} /></button>
            </span>
          ) : null}
          {downloads.length ? (
            <button className={`lb-icon-btn lb-tray${panel === "downloads" ? " is-on" : ""}`} aria-label={running ? `Downloads: ${running} running` : "Downloads"} onClick={() => setPanel(panel === "downloads" ? null : "downloads")}>
              <Download size={15} />
              {running ? <span className="lb-tray-n" aria-hidden>{running}</span> : null}
            </button>
          ) : null}
          {tab && shownSplit ? (
            <SplitPill
              split={shownSplit}
              tabs={s.tabs}
              active={tab.id}
              onActivate={(id) => void apply(tabActivate(id))}
              onSwap={() => void apply(splitCmd("swap", { tab: tab.id }))}
              onClose={() => void apply(splitCmd("close", { tab: tab.id }))}
            />
          ) : null}
          {tab && !showStart ? (
            <button className={`lb-icon-btn${reader ? " is-on" : ""}`} aria-label={reader ? "Close reader view" : "Reader view"} aria-pressed={!!reader} onClick={() => void toggleReader()}>
              <BookOpen size={15} />
            </button>
          ) : null}
          <button className="lb-icon-btn" aria-label={live && !nav.hasVideo ? "Picture in picture (no video on this page)" : "Picture in picture"} disabled={live && !nav.hasVideo} onClick={() => void pip().then((ok) => { if (!ok) flash("This page doesn't allow picture in picture"); }).catch(oops("start picture in picture"))}><PictureInPicture2 size={15} /></button>
          {aiOn && awaiting ? (
            <button className="lb-approve-pill" onClick={() => setPanel("ask")}>
              <Sparkles size={12} /> Approve {awaiting} action{awaiting > 1 ? "s" : ""} <Key k="Ctrl J" />
            </button>
          ) : null}
          <button className={`lb-icon-btn${panel ? " is-on" : ""}`} aria-label={panel ? "Hide side panel" : "Show side panel"} onClick={() => setPanel(panel ? null : aiOn ? "ask" : "bookmarks")}>
            <PanelRight size={15} />
          </button>
          {nav.loading ? <span className="lb-loadbar" role="status" aria-label="Loading page" /> : null}
        </header>

        {horizontal ? (
          <div className="lb-hstrip" role="tablist" aria-label="Tabs">
            {spaceTabs.map((t) => (
              <div
                key={t.id}
                role="tab"
                tabIndex={t.id === s.activeTab ? 0 : -1}
                aria-selected={t.id === s.activeTab}
                className={`lb-htab${t.id === s.activeTab ? " is-active" : ""}${t.life === "sleeping" ? " is-sleeping" : ""}`}
                onClick={() => void apply(tabActivate(t.id))}
                onAuxClick={(e) => e.button === 1 && void apply(tabClose(t.id))}
                onKeyDown={(e) => {
                  if (e.target !== e.currentTarget) return;
                  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); void apply(tabActivate(t.id)); }
                  if (e.key === "Delete") void apply(tabClose(t.id));
                  const to = e.key === "ArrowRight" ? e.currentTarget.nextElementSibling : e.key === "ArrowLeft" ? e.currentTarget.previousElementSibling : null;
                  if (to instanceof HTMLElement && to.getAttribute("role") === "tab") to.focus();
                }}
              >
                <Avatar url={t.url} title={t.title} size={14} />
                <span className="lb-tab-title">{t.title || hostOf(t.url)}</span>
                {t.badge === "approve" && aiOn ? <span className="lb-pill">approve</span> : null}
                <button className="lb-icon-btn sm lb-tab-x" aria-label={`Close ${t.title || hostOf(t.url)}`} onClick={(e) => { e.stopPropagation(); void apply(tabClose(t.id)); }}><X size={11} /></button>
              </div>
            ))}
            <button className="lb-icon-btn sm" aria-label="New tab" onClick={() => combo("ctrl+t")}><Plus size={13} /></button>
          </div>
        ) : null}

        {find !== null ? (
          <div className="lb-find" ref={findRef} role="search">
            <Search size={14} className="lb-dim" />
            <input
              autoFocus
              value={find}
              placeholder="Find on page"
              aria-label="Find on page"
              onChange={(e) => { setFind(e.target.value); void findInPage(e.target.value).then(setFindInfo).catch(oops("search the page")); }}
              onKeyDown={(e) => {
                if (e.key === "Enter") findStep(e.shiftKey);
                if (e.key === "Escape") { setFind(null); setFindInfo(null); }
              }}
            />
            {find && findInfo && findInfo.total === 0 ? (
              <>
                <span className="lb-mono lb-dim">no matches</span>
                {aiOn ? (
                  <button className="lb-chip" onClick={() => { setPanel("ask"); setQuick({ prompt: `This page doesn't contain the words "${find}". Answer what I'm looking for from the page: ${find}`, url, page: true }); }}>
                    <Sparkles size={12} /> Ask about this page <Key k="⏎" />
                  </button>
                ) : null}
              </>
            ) : (
              <span className="lb-mono lb-dim" aria-live="polite">{find && findInfo ? `${findInfo.total} found` : ""}</span>
            )}
            <button className="lb-icon-btn sm" aria-label="Previous match" disabled={!find || !findInfo?.total} onClick={() => findStep(true)}><ChevronUp size={13} /></button>
            <button className="lb-icon-btn sm" aria-label="Next match" disabled={!find || !findInfo?.total} onClick={() => findStep(false)}><ChevronDown size={13} /></button>
            <button className="lb-icon-btn sm" aria-label="Close find" onClick={() => { setFind(null); setFindInfo(null); }}><X size={12} /></button>
          </div>
        ) : null}

        {view.glance ? (
          <div className="lb-glance-bar">
            <span className="lb-ok-tag"><ExternalLink size={13} /> Glance</span>
            <span className="lb-mono lb-dim">{hostOf(view.glance)}</span>
            {aiOn && ai.pageSummaries && glanceSummary === null ? (
              <button className="lb-chip" onClick={() => void glanceSummarise(setGlanceSummary)}><Sparkles size={12} /> 5-second summary <Key k="S" /></button>
            ) : null}
            <span className="lb-push" />
            <button className="lb-btn lb-btn-sm lb-btn-primary" onClick={() => void glance("promote").catch((e) => flash(String(e)))}>Open as tab <Key k="⏎" /></button>
            <button className="lb-btn lb-btn-sm" onClick={() => { setGlanceSummary(null); void glance("close").catch(quiet); }}>Close <Key k="Esc" /></button>
            {glanceSummary ? <p className="lb-glance-sum">{glanceSummary}</p> : null}
          </div>
        ) : null}

        {ask ? (
          <div onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); answer(ask, "block"); } }}>
            <PermissionBar ask={ask} more={asks.length - 1} onAnswer={(a) => answer(ask, a)} />
          </div>
        ) : lateAsk ? (
          <div onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); setLate((l) => l.filter((x) => x.id !== lateAsk.id)); } }}>
            <PermissionTimedOut ask={lateAsk} onClose={() => setLate((l) => l.filter((x) => x.id !== lateAsk.id))} />
          </div>
        ) : siteOpen && origin ? (
          <SiteStrip
            origin={origin}
            saved={perms}
            onClose={() => setSiteOpen(false)}
            onForget={(k) => void (live ? permissionForget(origin, k).then(setPerms) : Promise.resolve(forgetLocal(perms, origin, k)).then(setPerms)).catch((e) => flash(String(e)))}
          />
        ) : null}

        <div className="lb-page" ref={pageRef}>
          {locked ? (
            <div className="lb-start lens-dither lens-dither-vignette">
              <Lock size={22} />
              <h1>{space?.name} is locked</h1>
              <p className="lb-dim">Its tabs stay hidden until you unlock it.</p>
              <button className="lb-btn lb-btn-primary" onClick={() => space && void spaceLock(space.id, false).then((how) => { if (how === "unavailable") flash("Windows Hello isn't set up, so this space only hides its tabs."); return browserState().then(setView); }).catch((e) => flash(String(e)))}>
                <Fingerprint size={14} /> Unlock with Windows Hello <Key k="⏎" />
              </button>
            </div>
          ) : crashed ? (
            <div className="lb-start lens-dither lens-dither-vignette">
              <h1>This tab stopped responding</h1>
              <p className="lb-dim">{hostOf(url)} crashed or froze. Your other tabs are fine.</p>
              <button className="lb-btn lb-btn-primary" onClick={() => { setCrashed(false); failures.current = 0; void historyNav("reload").catch(oops("reload the page")); }}>
                <RotateCw size={14} /> Reload <Key k="⏎" />
              </button>
            </div>
          ) : nav.error && tab ? (
            <ErrorPage
              code={nav.error}
              url={url}
              online={typeof navigator === "undefined" ? true : navigator.onLine}
              canBack={nav.canBack}
              onRetry={reload}
              onBack={() => combo("alt+left")}
              onSearch={(q) => void go(q)}
            />
          ) : reader && tab ? (
            <ReaderPage
              text={reader.text}
              title={reader.title}
              url={reader.url}
              prefs={appearance.reader}
              ask={aiOn && ai.pageSummaries}
              onPrefs={(r) => saveSettings({ appearance: { ...appearance, reader: r } })}
              onClose={() => setReader(null)}
              onGo={(u) => { setReader(null); void go(u, false); }}
              onSummarise={() => { setPanel("ask"); setQuick({ prompt: QUICK.summarise, url: reader.url, page: true }); }}
              onAsk={() => setPanel("ask")}
            />
          ) : showStart ? (
            <StartPage
              history={recent}
              bookmarks={s.bookmarks}
              closed={s.closed ?? []}
              ask={aiOn}
              now={initial?.now}
              onGo={(q) => void go(q, !!tab)}
              onAsk={(prompt) => { setPanel("ask"); setQuick({ prompt, page: false }); }}
              onReopen={() => { setStartOpen(false); void apply(reopenClosed()); }}
              onImport={() => setPanel("import")}
              onHistory={() => setPanel("history")}
            />
          ) : shownSplit && !live && area.w > 0 ? (
            // Parity: stand-ins where the core puts the two pages.
            <>
              {splitRects({ ...area, x: 0, y: 0 }, shownSplit.ratio).map((r, i) => (
                <div key={i} className={`lb-split-mock${(i === 0 ? shownSplit.left : shownSplit.right) === tab?.id ? " is-active" : ""}`} style={mockAt(r)}>
                  {i === 0 ? initial?.mockPage ?? null : initial?.mockPageRight ?? initial?.mockPage ?? null}
                </div>
              ))}
            </>
          ) : (
            // The real page is hidden while a tab is dragged over it; so is the stand-in.
            dragTab ? null : initial?.mockPage ?? null
          )}
          {shownSplit && tab && area.w > 0 && !overlay ? (
            <SplitDivider
              area={area}
              split={shownSplit}
              onRatio={(r) => {
                setRatio(clampRatio(r));
                if (!live) return;
                cancelAnimationFrame(ratioFrame.current);
                ratioFrame.current = requestAnimationFrame(() => void splitCmd("ratio", { tab: tab.id, ratio: r }).catch(quiet));
              }}
              onCommit={(r) => void apply(splitCmd("ratio", { tab: tab.id, ratio: r })).then(() => setRatio(null))}
            />
          ) : null}
          {dragTab && tab && dragTab !== tab.id && area.w > 0 ? (
            <SplitDropZone
              area={area}
              dragged={s.tabs.find((t) => t.id === dragTab) ?? null}
              onDrop={(side, id) => {
                setDragTab(null);
                const pair = pairFor(side, tab.id, id);
                if (pair) void apply(splitCmd("with", { tab: pair.left, other: pair.right }));
              }}
              onCancel={() => setDragTab(null)}
            />
          ) : null}
        </div>
      </main>

      {shown ? (
        <aside className="lb-panel" ref={panelP.ref} aria-label={panelTabs.find((p) => p[0] === shown)?.[1]} aria-hidden={panel ? undefined : true}>
          <div className={`lb-panel-head${panelTabs.length > 4 ? " is-tight" : ""}`} role="tablist" aria-label="Side panel">
            {panelTabs.map(([id, label, Icon]) => (
              <button key={id} role="tab" aria-selected={shown === id} aria-label={label} className={`lb-ptab${shown === id ? " is-on" : ""}`} onClick={() => setPanel(id)}>
                <Icon size={13} />
                <span>{label}</span>
              </button>
            ))}
          </div>
          {aiOn ? (
            <div className="lb-panel-body" hidden={shown !== "ask"}>
              <AgentPanel
                seed={initial?.agent}
                quick={quick}
                onAwaiting={setAwaiting}
                now={initial?.now}
                acting={tab ? { tabId: tab.id, url: tab.url, title: tab.title, kept: Math.max(0, view.live.length - 1) } : null}
                onOpenUrl={(u) => void go(u, true)}
              />
            </div>
          ) : null}
          {shown === "transcript" && aiOn ? (
            <div className="lb-panel-body">
              <TranscriptPanel url={url} seed={initial?.transcript} onAsk={(prompt, text) => { setPanel("ask"); setQuick({ prompt, selection: text, url }); }} />
            </div>
          ) : null}
          {shown === "bookmarks" ? (
            <div className="lb-panel-body">
              <BookmarksPanel view={view} onView={setView} onOpen={(u, bg) => (bg ? void apply(openBackground(u)) : void go(u, true))} live={live} />
            </div>
          ) : null}
          {shown === "notes" ? (
            <div className="lb-panel-body lb-notes">
              <p className="lb-dim">Notes for {hostOf(url) || "this page"}, kept on this PC. Works on PDFs too.</p>
              <textarea
                className="lb-input lb-notes-area"
                value={notes}
                placeholder="Write a note about this page…"
                aria-label="Page notes"
                onChange={(e) => setNotes(e.target.value)}
                onBlur={() => url && live && void notesSet(url, notes).catch((e) => flash(String(e)))}
              />
            </div>
          ) : null}
          {shown === "downloads" ? (
            <div className="lb-panel-body">
              <DownloadsPanel items={downloads} live={live} now={initial?.now} onChange={setDownloads} onRetry={(u) => void go(u, true)} onError={flash} />
            </div>
          ) : null}
          {shown === "history" ? (
            <div className="lb-panel-body">
              <HistoryPanel
                live={live}
                now={initial?.now}
                seed={initial?.history}
                stamp={view}
                archived={arch}
                onOpen={(u, bg) => (bg ? void apply(openBackground(u)) : void go(u, true))}
                onUnarchive={(id) => void apply(unarchive(id))}
                onError={flash}
              />
            </div>
          ) : null}
          {shown === "customise" ? (
            <div className="lb-panel-body lb-scroll-y">
              <CustomisePanel value={appearance} onChange={(a) => saveSettings({ appearance: a })} />
            </div>
          ) : null}
          {shown === "import" ? (
            <div className="lb-panel-body lb-scroll-y">
              <ImportPanel seed={initial?.importSeed} searchUrl={s.settings.searchUrl} onChanged={() => live && void browserState().then(setView).catch(quiet)} />
            </div>
          ) : null}
          {shown === "ai" ? (
            <div className="lb-panel-body lb-scroll-y">
              <AiPanel value={ai} onChange={(v) => saveSettings({ ai: v })} status={initial ? initial.aiStatus ?? null : undefined} />
            </div>
          ) : null}
        </aside>
      ) : null}

      {toastP.mounted ? <div className="lb-toast" role="status" ref={toastP.ref}>{toastP.value}</div> : null}
    </div>
  );
}

/** A local, at most ~5-second summary of the Glance page (2 sentences). */
async function glanceSummarise(set: (s: string | null) => void) {
  set("Reading…");
  try {
    const text = await glance("read");
    if (!text) return set("Nothing to summarise.");
    const { aiAsk, listenAiEvents, aiCancel } = await import("../ai/client");
    let out = "";
    let unlisten: (() => void) | null = null;
    const id = await aiAsk({ prompt: "Summarise this page in two short sentences.", context: { page_text: text.slice(0, 12000) }, provider: "local", allow_tools: false });
    const done = new Promise<void>((resolve) => {
      void listenAiEvents((ev) => {
        if (ev.payload.id !== id) return;
        if (ev.kind === "delta") {
          out += ev.payload.text;
          set(out);
        }
        if (ev.kind === "done") resolve();
      }).then((u) => (unlisten = u));
    });
    await Promise.race([done, new Promise((r) => setTimeout(r, 5000))]);
    void aiCancel(id).catch(quiet);
    (unlisten as (() => void) | null)?.();
    if (!out) set("No local model answered in time.");
  } catch (e) {
    set(String(e));
  }
}

export type { ImportSource };
