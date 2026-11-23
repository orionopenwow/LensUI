import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  ArrowLeft, ArrowRight, BookOpen, Captions, Download, History as HistoryIcon, PanelLeft, PanelRight, PictureInPicture2,
  RotateCw, Search, Sparkles, Star, X, ZoomIn,
} from "lucide-react";
import { useLensState } from "../hooks/useLensState";
import { shelfAdd } from "../shelf/contract";
import {
  bookmarkToggle, browserState, EVT_BROWSER_DOWNLOADS, EVT_BROWSER_STATE, findInPage, folderAdd, folderToggle, historyNav,
  historySearch, navigate, pageEvents, pageRead, pip, setOverlay, setViewport, spaceAdd, spaceSwitch, tabActivate, tabClose,
  tabMove, tabMute, tabPin, setZoom, type BrowserView, type Download as Dl, type HistoryEntry, type MenuEvent,
} from "./api";
import { AgentPanel, type AgentSeed, type QuickAsk } from "./AgentPanel";
import { breadcrumb, classifyAddress, dropIndex, hostOf, relTime } from "./model";
import { Avatar, Sidebar, type ChatRef } from "./Sidebar";
import { TranscriptPanel, type TranscriptSeed } from "./TranscriptPanel";
import "./Browser.css";

type Panel = "ask" | "transcript" | "downloads" | "history" | null;

export interface BrowserInitial {
  view: BrowserView;
  panel?: Panel;
  agent?: AgentSeed;
  transcript?: TranscriptSeed;
  chats?: ChatRef[];
  /** Parity only: draws a stand-in page where the real tab webview would sit. */
  mockPage?: React.ReactNode;
  now?: number;
  address?: string;
  suggestions?: HistoryEntry[];
}

const QUICK: Record<string, string> = {
  ask: "Answer my question about this",
  summarise: "Summarise this: a TL;DR line, then key points",
  explain: "Explain this simply, with one example",
  translate: `Translate this into ${navigator.language || "English"}`,
  rewrite: "Rewrite this to be clearer and shorter",
  extract: "Extract the tables, links, dates and to-dos as Markdown lists",
};

const PANELS: [Exclude<Panel, null>, string, React.ComponentType<{ size?: number }>][] = [
  ["ask", "Ask", Sparkles],
  ["transcript", "Transcript", Captions],
  ["downloads", "Downloads", Download],
  ["history", "History", HistoryIcon],
];

export function BrowserSurface({ initial }: { initial?: BrowserInitial }) {
  useLensState();
  const [view, setView] = useState<BrowserView | null>(initial?.view ?? null);
  const [panel, setPanel] = useState<Panel>(initial?.panel ?? "ask");
  const [sideOpen, setSideOpen] = useState(true);
  const [address, setAddress] = useState(initial?.address ?? "");
  const [editing, setEditing] = useState(!!initial?.address);
  const [suggest, setSuggest] = useState<HistoryEntry[]>(initial?.suggestions ?? []);
  const [find, setFind] = useState<string | null>(null);
  const [findInfo, setFindInfo] = useState<{ found: boolean; total: number } | null>(null);
  const [quick, setQuick] = useState<QuickAsk | null>(null);
  const [awaiting, setAwaiting] = useState(initial?.agent?.pending ? 1 : 0);
  const [toast, setToast] = useState<string | null>(null);
  const [downloads, setDownloads] = useState<Dl[]>(initial?.view.downloads ?? []);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const pageRef = useRef<HTMLDivElement>(null);
  const addrRef = useRef<HTMLInputElement>(null);
  const live = !initial;

  const s = view?.state;
  const tab = s?.tabs.find((t) => t.id === s.activeTab) ?? null;
  const url = tab?.url ?? "";

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2200);
  };
  const apply = useCallback((p: Promise<BrowserView>) => p.then(setView).catch((e) => flash(String(e))), []);

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
  }, [live, panel, sideOpen, find]);

  // The page draws above the frame UI, so hide it while the address suggestions are open.
  const overlay = editing && suggest.length > 0;
  useEffect(() => {
    if (live) void setOverlay(overlay).catch(() => {});
  }, [overlay, live]);

  useEffect(() => {
    if (!live || !editing) return;
    const t = window.setTimeout(() => historySearch(address, 6).then(setSuggest).catch(() => {}), 90);
    return () => window.clearTimeout(t);
  }, [address, editing, live]);

  useEffect(() => {
    if (live && panel === "history") historySearch("", 60).then(setHistory).catch(() => {});
  }, [panel, live, view]);

  const onMenu = useCallback(
    async (ev: MenuEvent) => {
      const sel = ev.selection?.trim();
      if (QUICK[ev.action]) {
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
          setPanel("transcript");
          return;
      }
    },
    []
  );

  // Collect Lens right-click choices from the active page.
  useEffect(() => {
    if (!live) return;
    const id = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      pageEvents().then((evs) => evs.forEach((e) => void onMenu(e))).catch(() => {});
    }, 400);
    return () => window.clearInterval(id);
  }, [live, onMenu]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "l") {
        e.preventDefault();
        addrRef.current?.focus();
      } else if (mod && e.key.toLowerCase() === "t") {
        e.preventDefault();
        setAddress("");
        setEditing(true);
        addrRef.current?.focus();
      } else if (mod && e.key.toLowerCase() === "w" && tab) {
        e.preventDefault();
        void apply(tabClose(tab.id));
      } else if (mod && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setFind("");
      } else if (mod && e.key.toLowerCase() === "j") {
        e.preventDefault();
        setPanel((p) => (p === "ask" ? null : "ask"));
      }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [tab, apply]);

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
  const crumbs = breadcrumb(url);
  const zoom = tab?.zoom ?? 1;

  return (
    <div className={`lb-root${sideOpen ? "" : " no-side"}${panel ? " has-panel" : ""}`}>
      {sideOpen ? (
        <Sidebar
          view={view}
          chats={initial?.chats ?? []}
          activeChat={null}
          now={initial?.now}
          onSearch={() => addrRef.current?.focus()}
          onSpace={(id) => void apply(spaceSwitch(id))}
          onNewSpace={() => void apply(spaceAdd(`Space ${s.spaces.length + 1}`))}
          onNewTab={() => { setAddress(""); setEditing(true); addrRef.current?.focus(); }}
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
          onOpenUrl={(u) => void go(u, true)}
          onChat={() => setPanel("ask")}
          onCollapse={() => setSideOpen(false)}
        />
      ) : null}

      <main className="lb-main">
        <header className="lb-top" data-tauri-drag-region>
          {sideOpen ? null : <button className="lb-icon-btn" aria-label="Show sidebar" onClick={() => setSideOpen(true)}><PanelLeft size={16} /></button>}
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
                  placeholder="Search, enter an address, or start with ask"
                  aria-label="Address"
                  autoFocus
                />
                {kind ? <span className="lb-kbd">{kind.kind === "ask" ? "Ask ↵" : kind.kind === "url" ? "Go ↵" : "Search ↵"}</span> : null}
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
              <button className={`lb-icon-btn sm${view.bookmarked ? " is-on" : ""}`} aria-label={view.bookmarked ? "Remove bookmark" : "Bookmark"} onClick={() => void bookmarkToggle().then(() => browserState().then(setView)).catch(() => {})}>
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
          <button className="lb-icon-btn" aria-label="Reader view" onClick={() => { setPanel("ask"); setQuick({ prompt: "Show this page as a clean reader view in Markdown, keeping headings and links", url, page: true }); }}><BookOpen size={15} /></button>
          <button className="lb-icon-btn" aria-label="Picture in picture" onClick={() => void pip().catch(() => {})}><PictureInPicture2 size={15} /></button>
          {awaiting ? (
            <button className="lb-approve-pill" onClick={() => setPanel("ask")}>
              <Sparkles size={12} /> Approve {awaiting} action{awaiting > 1 ? "s" : ""} <span className="lb-kbd">Ctrl J</span>
            </button>
          ) : null}
          <button className={`lb-icon-btn${panel ? " is-on" : ""}`} aria-label={panel ? "Hide side panel" : "Show side panel"} onClick={() => setPanel(panel ? null : "ask")}>
            <PanelRight size={15} />
          </button>
        </header>

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
            <span className="lb-mono lb-dim">{findInfo ? `${findInfo.total} found` : ""}</span>
            <button className="lb-icon-btn sm" aria-label="Close find" onClick={() => { setFind(null); setFindInfo(null); }}><X size={12} /></button>
          </div>
        ) : null}

        <div className="lb-page" ref={pageRef}>
          {initial?.mockPage ?? (tab ? null : (
            <div className="lb-start">
              <h1>Lens Browser</h1>
              <p className="lb-dim">Type an address or a search. Start with <span className="lb-kbd">ask</span> to ask about the page.</p>
            </div>
          ))}
        </div>
      </main>

      {panel ? (
        <aside className="lb-panel" aria-label={PANELS.find((p) => p[0] === panel)?.[1]}>
          <div className="lb-panel-head" role="tablist" aria-label="Side panel">
            {PANELS.map(([id, label, Icon]) => (
              <button key={id} role="tab" aria-selected={panel === id} className={`lb-ptab${panel === id ? " is-on" : ""}`} onClick={() => setPanel(id)}>
                <Icon size={13} />
                <span>{label}</span>
              </button>
            ))}
          </div>
          <div className="lb-panel-body" style={{ display: panel === "ask" ? undefined : "none" }}>
            <AgentPanel seed={initial?.agent} quick={quick} onAwaiting={setAwaiting} now={initial?.now} />
          </div>
          {panel === "transcript" ? (
            <div className="lb-panel-body">
              <TranscriptPanel
                url={url}
                seed={initial?.transcript}
                onAsk={(prompt, text) => {
                  setPanel("ask");
                  setQuick({ prompt, selection: text, url });
                }}
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
                  {d.path && d.state === "done" ? <button className="lb-chip" onClick={() => void invoke("browser_download_reveal", { id: d.id }).catch((e) => flash(String(e)))}>Show in folder</button> : null}
                </div>
              ))}
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
            </div>
          ) : null}
        </aside>
      ) : null}

      {toast ? <div className="lb-toast" role="status">{toast}</div> : null}
    </div>
  );
}
