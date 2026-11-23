import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  ArrowLeft, ArrowRight, Bookmark as BookmarkIcon, BookOpen, Captions, Download, ExternalLink, Fingerprint, History as HistoryIcon, Lock, NotebookPen, PanelLeft,
  PanelRight, PictureInPicture2, Plus, RotateCw, Search, Sparkles, Star, X, ZoomIn,
} from "lucide-react";
import { useLensState } from "../hooks/useLensState";
import { shelfAdd } from "../shelf/contract";
import { applyDither } from "../style/dither";
import "../style/dither.css";
import {
  archived as listArchived, bookmarkToggle, browserState, DEFAULT_APPEARANCE, DEFAULT_BROWSER_AI, EVT_BROWSER_DOWNLOADS, EVT_BROWSER_STATE, findInPage, folderAdd,
  folderToggle, glance, historyNav, historySearch, navigate, notesGet, notesSet, openBackground, pageEvents, pageRead, pip, reopenClosed, setOverlay,
  settingsSet, setViewport, setZoom, spaceAdd, spaceLock, spaceSwitch, tabActivate, tabClose, tabMove, tabMute, tabPin, tidy, unarchive,
  type Appearance, type ArchivedTab, type BrowserAi, type BrowserView, type Download as Dl, type HistoryEntry, type ImportSource, type MenuEvent,
} from "./api";
import { AgentPanel, type AgentSeed, type QuickAsk } from "./AgentPanel";
import { AiPanel } from "./AiPanel";
import { Key } from "./ApprovalCard";
import { BookmarksPanel } from "./BookmarksPanel";
import { CustomisePanel } from "./CustomisePanel";
import { ImportPanel, type ImportSeed } from "./ImportPanel";
import { breadcrumb, classifyAddress, dropIndex, hostOf, relTime } from "./model";
import { Avatar, Sidebar, type ChatRef } from "./Sidebar";
import { TranscriptPanel, type TranscriptSeed } from "./TranscriptPanel";
import "./Browser.css";

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
  const [address, setAddress] = useState(initial?.address ?? "");
  const [editing, setEditing] = useState(!!initial?.address);
  const [suggest, setSuggest] = useState<HistoryEntry[]>(initial?.suggestions ?? []);
  const [find, setFind] = useState<string | null>(initial?.find ?? null);
  const [findInfo, setFindInfo] = useState<{ found: boolean; total: number } | null>(initial?.find !== undefined ? { found: (initial.findTotal ?? 0) > 0, total: initial.findTotal ?? 0 } : null);
  const [quick, setQuick] = useState<QuickAsk | null>(null);
  const [awaiting, setAwaiting] = useState(initial?.agent?.pending ? 1 : 0);
  const [toast, setToast] = useState<string | null>(null);
  const [downloads, setDownloads] = useState<Dl[]>(initial?.view.downloads ?? []);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [arch, setArch] = useState<ArchivedTab[]>([]);
  const [crashed, setCrashed] = useState(false);
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

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2200);
  };
  const apply = useCallback((p: Promise<BrowserView>) => p.then(setView).catch((e) => flash(String(e))), []);
  const saveSettings = (patch: Partial<NonNullable<typeof s>["settings"]>) => {
    if (!s) return;
    const settings = { ...s.settings, ...patch };
    setView({ ...view!, state: { ...s, settings } });
    if (live) void settingsSet(settings).then(setView).catch((e) => flash(String(e)));
  };

  // AI off: nothing AI-related stays open.
  useEffect(() => {
    if (!aiOn && (panel === "ask" || panel === "transcript")) setPanel(null);
  }, [aiOn, panel]);

  useEffect(() => {
    if (!live) return;
    browserState().then(setView).catch(() => {});
    const un1 = listen<BrowserView>(EVT_BROWSER_STATE, (e) => setView(e.payload));
    const un2 = listen<Dl[]>(EVT_BROWSER_DOWNLOADS, (e) => setDownloads(e.payload));
    return () => {
      un1.then((u) => u());
      un2.then((u) => u());
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
      void setViewport(r.left, r.top, r.width, r.height).catch(() => {});
    };
    const ro = new ResizeObserver(send);
    ro.observe(el);
    send();
    return () => ro.disconnect();
  }, [live, panel, sideOpen, find, view?.glance, appearance.tabsLayout, glanceSummary]);

  // The page draws above the frame UI, so hide it while the address suggestions are open.
  const overlay = (editing && suggest.length > 0) || crashed;
  useEffect(() => {
    if (live) void setOverlay(overlay).catch(() => {});
  }, [overlay, live]);

  useEffect(() => {
    if (!live || !editing) return;
    const t = window.setTimeout(() => historySearch(address, 6).then(setSuggest).catch(() => {}), 90);
    return () => window.clearTimeout(t);
  }, [address, editing, live]);

  useEffect(() => {
    if (!live) return;
    if (panel === "history") {
      historySearch("", 60).then(setHistory).catch(() => {});
      listArchived().then(setArch).catch(() => {});
    }
    if (panel === "notes" && url) notesGet(url).then(setNotes).catch(() => {});
  }, [panel, live, view, url]);

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
          setEditing(true);
          window.setTimeout(() => addrRef.current?.focus(), 0);
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
          void bookmarkToggle().then((on) => flash(on ? "Bookmarked" : "Bookmark removed")).catch(() => {});
          break;
        case "ctrl+j":
          if (aiOn) setPanel((p) => (p === "ask" ? null : "ask"));
          break;
        case "ctrl+shift+k":
          void tidy().then((r) => flash(`Tidied: ${r.duplicatesClosed} duplicates closed, ${r.archived} archived`)).catch(() => {});
          break;
      }
    },
    [tab, apply, aiOn]
  );

  const onMenu = useCallback(
    async (ev: MenuEvent) => {
      if (ev.action === "key") return combo((ev as MenuEvent & { key: string }).key);
      if (ev.action === "glance") return void openGlance(ev.linkUrl);
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
          await navigator.clipboard?.writeText(md).catch(() => {});
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
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const c = `ctrl+${e.shiftKey ? "shift+" : ""}${e.key.toLowerCase()}`;
      if (["ctrl+l", "ctrl+t", "ctrl+w", "ctrl+f", "ctrl+j", "ctrl+shift+t", "ctrl+d", "ctrl+shift+k"].includes(c)) {
        e.preventDefault();
        combo(c);
      }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [combo]);

  const go = async (input: string, newTab = false) => {
    setEditing(false);
    setSuggest([]);
    if (!live) return;
    try {
      const r = await navigate(input, newTab);
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
  } as React.CSSProperties;
  const sleeping = s.tabs.filter((t) => t.life === "sleeping" && !t.archivedMs).length;
  const audible = s.tabs.find((t) => t.audible && t.spaceId === s.activeSpace && t.id !== s.activeTab);
  const spaceTabs = s.tabs.filter((t) => t.spaceId === s.activeSpace && !t.archivedMs).sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.order - b.order);

  return (
    <div
      ref={rootRef}
      className={`lb-root${sideOpen && !horizontal ? "" : " no-side"}${panel ? " has-panel" : ""} lb-${appearance.density}${appearance.scheme === "auto" ? "" : ` lb-scheme-${appearance.scheme}`}`}
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
          onToggleFolder={(id) => void apply(folderToggle(id))}
          onDrop={(id, before, folder) => {
            const d = dropIndex(s, before, folder);
            void apply(tabMove(id, d.index, d.folder));
          }}
          onOpenUrl={(u, bg) => (bg ? void apply(openBackground(u)) : void go(u, true))}
          onChat={() => setPanel("ask")}
          onCollapse={() => setSideOpen(false)}
          onTidy={() => void tidy().then((r) => flash(`Tidied: ${r.duplicatesClosed} duplicates closed, ${r.archived} archived`)).catch((e) => flash(String(e)))}
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
          <button className="lb-icon-btn" aria-label="Back" onClick={() => void historyNav("back").catch(() => {})}><ArrowLeft size={16} /></button>
          <button className="lb-icon-btn" aria-label="Forward" onClick={() => void historyNav("forward").catch(() => {})}><ArrowRight size={16} /></button>
          <button className="lb-icon-btn" aria-label="Reload" onClick={() => void historyNav("reload").catch(() => {})}><RotateCw size={15} /></button>

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
                    if (e.key === "Enter") void go(address, e.altKey || e.ctrlKey);
                    if (e.key === "Escape") { setEditing(false); setSuggest([]); }
                  }}
                  placeholder={aiOn && ai.askInAddressBar ? "Search, enter an address, or start with ask" : "Search or enter an address"}
                  aria-label="Address"
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
            {!editing && tab ? (
              <button className={`lb-icon-btn sm${view.bookmarked ? " is-on" : ""}`} aria-label={view.bookmarked ? "Remove bookmark" : "Bookmark"} onClick={() => combo("ctrl+d")}>
                <Star size={14} fill={view.bookmarked ? "currentColor" : "none"} />
              </button>
            ) : null}
            {editing && suggest.length ? (
              <ul className="lb-suggest" role="listbox">
                {suggest.map((h) => (
                  <li key={h.url} role="option" aria-selected={false} onMouseDown={() => void go(h.url)}>
                    <Avatar url={h.url} title={h.title} size={14} />
                    <span className="lb-tab-title">{h.title || hostOf(h.url)}</span>
                    <span className="lb-mono lb-dim">{hostOf(h.url)}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          {Math.abs(zoom - 1) > 0.01 ? <button className="lb-chip" onClick={() => void setZoom(1)}><ZoomIn size={12} /> {Math.round(zoom * 100)}%</button> : null}
          {aiOn && ai.pageSummaries ? (
            <button className="lb-icon-btn" aria-label="Reader view" onClick={() => { setPanel("ask"); setQuick({ prompt: "Show this page as a clean reader view in Markdown, keeping headings and links", url, page: true }); }}>
              <BookOpen size={15} />
            </button>
          ) : null}
          <button className="lb-icon-btn" aria-label="Picture in picture" onClick={() => void pip().catch(() => {})}><PictureInPicture2 size={15} /></button>
          {aiOn && awaiting ? (
            <button className="lb-approve-pill" onClick={() => setPanel("ask")}>
              <Sparkles size={12} /> Approve {awaiting} action{awaiting > 1 ? "s" : ""} <Key k="Ctrl J" />
            </button>
          ) : null}
          <button className={`lb-icon-btn${panel ? " is-on" : ""}`} aria-label={panel ? "Hide side panel" : "Show side panel"} onClick={() => setPanel(panel ? null : aiOn ? "ask" : "bookmarks")}>
            <PanelRight size={15} />
          </button>
        </header>

        {horizontal ? (
          <div className="lb-hstrip" role="tablist" aria-label="Tabs">
            {spaceTabs.map((t) => (
              <button key={t.id} role="tab" aria-selected={t.id === s.activeTab} className={`lb-htab${t.id === s.activeTab ? " is-active" : ""}${t.life === "sleeping" ? " is-sleeping" : ""}`} onClick={() => void apply(tabActivate(t.id))} onAuxClick={(e) => e.button === 1 && void apply(tabClose(t.id))}>
                <Avatar url={t.url} title={t.title} size={14} />
                <span className="lb-tab-title">{t.title || hostOf(t.url)}</span>
                {t.badge === "approve" && aiOn ? <span className="lb-pill">approve</span> : null}
              </button>
            ))}
            <button className="lb-icon-btn sm" aria-label="New tab" onClick={() => combo("ctrl+t")}><Plus size={13} /></button>
          </div>
        ) : null}

        {find !== null ? (
          <div className="lb-find">
            <Search size={14} className="lb-dim" />
            <input
              autoFocus
              value={find}
              placeholder="Find on page"
              aria-label="Find on page"
              onChange={(e) => { setFind(e.target.value); void findInPage(e.target.value).then(setFindInfo).catch(() => {}); }}
              onKeyDown={(e) => {
                if (e.key === "Enter") void findInPage(find, e.shiftKey).then(setFindInfo).catch(() => {});
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
              <span className="lb-mono lb-dim">{findInfo ? `${findInfo.total} found` : ""}</span>
            )}
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
            <button className="lb-btn lb-btn-sm" onClick={() => { setGlanceSummary(null); void glance("close").catch(() => {}); }}>Close <Key k="Esc" /></button>
            {glanceSummary ? <p className="lb-glance-sum">{glanceSummary}</p> : null}
          </div>
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
              <button className="lb-btn lb-btn-primary" onClick={() => { setCrashed(false); failures.current = 0; void historyNav("reload").catch(() => {}); }}>
                <RotateCw size={14} /> Reload <Key k="⏎" />
              </button>
            </div>
          ) : (
            initial?.mockPage ??
            (tab ? null : (
              <div className="lb-start lens-dither lens-dither-vignette">
                <h1>Lens Browser</h1>
                <p className="lb-dim">Type an address or a search{aiOn && ai.askInAddressBar ? ", or start with ask to ask about a page" : ""}.</p>
                {aiOn && ai.agentInNewTabs ? (
                  <form className="lb-compose lb-start-ask" onSubmit={(e) => { e.preventDefault(); const q = new FormData(e.currentTarget).get("q"); if (q) { setPanel("ask"); setQuick({ prompt: String(q), page: false }); } }}>
                    <Sparkles size={14} className="lb-dim" />
                    <input name="q" placeholder="Ask anything, or give me a task" aria-label="Ask" />
                    <Key k="⏎" />
                  </form>
                ) : null}
                <p className="lb-mono lb-dim">Ctrl L address · Ctrl T new tab · Ctrl Shift T reopen · Ctrl Shift K tidy</p>
              </div>
            ))
          )}
        </div>
      </main>

      {panel ? (
        <aside className="lb-panel" aria-label={panelTabs.find((p) => p[0] === panel)?.[1]}>
          <div className="lb-panel-head" role="tablist" aria-label="Side panel">
            {panelTabs.map(([id, label, Icon]) => (
              <button key={id} role="tab" aria-selected={panel === id} className={`lb-ptab${panel === id ? " is-on" : ""}`} onClick={() => setPanel(id)}>
                <Icon size={13} />
                <span>{label}</span>
              </button>
            ))}
          </div>
          {aiOn ? (
            <div className="lb-panel-body" style={{ display: panel === "ask" ? undefined : "none" }}>
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
          {panel === "transcript" && aiOn ? (
            <div className="lb-panel-body">
              <TranscriptPanel url={url} seed={initial?.transcript} onAsk={(prompt, text) => { setPanel("ask"); setQuick({ prompt, selection: text, url }); }} />
            </div>
          ) : null}
          {panel === "bookmarks" ? (
            <div className="lb-panel-body">
              <BookmarksPanel view={view} onView={setView} onOpen={(u, bg) => (bg ? void apply(openBackground(u)) : void go(u, true))} live={live} />
            </div>
          ) : null}
          {panel === "notes" ? (
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
          {panel === "downloads" ? (
            <div className="lb-panel-body lb-list">
              {downloads.length === 0 ? <div className="lb-empty"><p className="lb-dim">Nothing downloaded yet.</p></div> : null}
              {downloads.map((d) => (
                <div key={d.id} className="lb-row">
                  <Download size={14} className={d.state === "failed" ? "lb-never" : "lb-dim"} />
                  <span className="lb-tab-title">{(d.path || d.url).split(/[\\/]/).pop()}</span>
                  <span className="lb-mono lb-dim">{d.state === "downloading" ? "…" : d.state === "done" ? relTime(d.startedMs, initial?.now) : "failed"}</span>
                  {d.path && d.state === "done" ? <button className="lb-chip" onClick={() => void invoke("browser_download_reveal", { id: d.id }).catch((e) => flash(String(e)))}>Show in folder <Key k="⏎" /></button> : null}
                </div>
              ))}
              <p className="lb-mono lb-dim lb-note">Rules by file type live in Settings › Lens Browser.</p>
            </div>
          ) : null}
          {panel === "history" ? (
            <div className="lb-panel-body lb-list">
              {history.map((h) => (
                <button key={h.url} className="lb-row" onClick={() => void go(h.url)}>
                  <Avatar url={h.url} title={h.title} size={14} />
                  <span className="lb-tab-title">{h.title || h.url}</span>
                  <span className="lb-mono lb-dim">{relTime(h.lastVisitMs, initial?.now)}</span>
                </button>
              ))}
              {arch.length ? <div className="lb-head"><span>Archived tabs</span><span className="lb-mono lb-head-right">{arch.length}</span></div> : null}
              {arch.map((a) => (
                <button key={a.id} className="lb-row" onClick={() => void apply(unarchive(a.id))}>
                  <Avatar url={a.url} title={a.title} size={14} />
                  <span className="lb-tab-title">{a.title || a.url}</span>
                  <span className="lb-mono lb-dim">{a.space}</span>
                </button>
              ))}
            </div>
          ) : null}
          {panel === "customise" ? (
            <div className="lb-panel-body lb-scroll-y">
              <CustomisePanel value={appearance} onChange={(a) => saveSettings({ appearance: a })} />
            </div>
          ) : null}
          {panel === "import" ? (
            <div className="lb-panel-body lb-scroll-y">
              <ImportPanel seed={initial?.importSeed} />
            </div>
          ) : null}
          {panel === "ai" ? (
            <div className="lb-panel-body lb-scroll-y">
              <AiPanel value={ai} onChange={(v) => saveSettings({ ai: v })} status={initial ? initial.aiStatus ?? null : undefined} />
            </div>
          ) : null}
        </aside>
      ) : null}

      {toast ? <div className="lb-toast" role="status">{toast}</div> : null}
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
    void aiCancel(id).catch(() => {});
    (unlisten as (() => void) | null)?.();
    if (!out) set("No local model answered in time.");
  } catch (e) {
    set(String(e));
  }
}

export type { ImportSource };
