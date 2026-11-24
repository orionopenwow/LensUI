// Lens's own pages inside the content area: the new-tab page and the page shown when a site
// fails to load. Both are frame UI (the tab's webview is hidden while they show).
import React, { useRef } from "react";
import { CloudOff, Download, History as HistoryIcon, RotateCw, Search, ShieldAlert, Sparkles, TriangleAlert, Undo2 } from "lucide-react";
import type { Bookmark, HistoryEntry, Tab } from "./api";
import { Key } from "./ApprovalCard";
import { hostOf, relTime } from "./model";
import { errorInfo, topSites } from "./nav";
import { Avatar } from "./Sidebar";

export const SHORTCUTS: [string, string][] = [
  ["Ctrl L", "Address"],
  ["Ctrl T", "New tab"],
  ["Ctrl W", "Close"],
  ["Ctrl Shift T", "Reopen"],
  ["Ctrl Tab", "Next tab"],
  ["Ctrl 1–9", "Tab by number"],
  ["Ctrl F", "Find"],
  ["Ctrl H", "History"],
  ["Ctrl + / −", "Zoom"],
  ["Ctrl Shift A", "Find a tab"],
  ["Ctrl Shift K", "Tidy"],
];

interface StartProps {
  history: HistoryEntry[];
  bookmarks: Bookmark[];
  closed: { tab: Tab; closedMs: number }[];
  ask: boolean;
  now?: number;
  onGo(input: string): void;
  onAsk(prompt: string): void;
  onReopen(): void;
  onImport(): void;
  onHistory(): void;
}

/** The new-tab page: search, the sites you use most, bookmarks, and what you just closed. */
export function StartPage(p: StartProps) {
  const input = useRef<HTMLInputElement>(null);
  const sites = topSites(p.history, 8);
  const marks = p.bookmarks.slice(0, 8);
  const closed = [...p.closed].reverse().slice(0, 4);
  const empty = sites.length === 0 && marks.length === 0;
  return (
    <div className="lb-start lb-newtab lens-dither lens-dither-vignette" role="region" aria-label="New tab">
      <div className="lb-newtab-col">
        <h1>Lens Browser</h1>
        <form
          className="lb-compose lb-newtab-search"
          onSubmit={(e) => {
            e.preventDefault();
            const q = input.current?.value.trim();
            if (q) p.onGo(q);
          }}
        >
          <Search size={15} className="lb-dim" />
          <input ref={input} name="q" placeholder={p.ask ? "Search, enter an address, or start with ask" : "Search or enter an address"} aria-label="Search or enter an address" autoComplete="off" />
          <Key k="⏎" />
        </form>
        {p.ask ? (
          <button className="lb-chip lb-newtab-ask" onClick={() => p.onAsk(input.current?.value.trim() || "What can you help me with here?")}>
            <Sparkles size={12} /> Ask instead <Key k="Ctrl J" />
          </button>
        ) : null}

        {empty ? (
          <div className="lb-newtab-empty">
            <p>Nothing here yet. Sites you visit often will show up on this page.</p>
            <button className="lb-btn lb-btn-sm" onClick={p.onImport}><Download size={13} /> Bring bookmarks from another browser</button>
          </div>
        ) : null}

        {sites.length ? (
          <section aria-label="Most visited">
            <div className="lb-head"><span>Most visited</span><button className="lb-chip lb-head-right" onClick={p.onHistory}><HistoryIcon size={12} /> History <Key k="Ctrl H" /></button></div>
            <div className="lb-tiles">
              {sites.map((s) => (
                <button key={s.host} className="lb-tile" onClick={() => p.onGo(s.url)} aria-label={`${s.host}, visited ${s.visits} times`}>
                  <Avatar url={s.url} title={s.title} size={28} />
                  <span className="lb-tile-name">{s.host}</span>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {marks.length ? (
          <section aria-label="Bookmarks">
            <div className="lb-head"><span>Bookmarks</span></div>
            <div className="lb-tiles">
              {marks.map((b) => (
                <button key={b.id} className="lb-tile" onClick={() => p.onGo(b.url)} aria-label={b.title || hostOf(b.url)}>
                  <Avatar url={b.url} title={b.title} size={28} />
                  <span className="lb-tile-name">{b.title || hostOf(b.url)}</span>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {closed.length ? (
          <section aria-label="Recently closed">
            <div className="lb-head"><span>Recently closed</span><button className="lb-chip lb-head-right" onClick={p.onReopen}><Undo2 size={12} /> Reopen last <Key k="Ctrl Shift T" /></button></div>
            <div className="lb-newtab-list">
              {closed.map((c, i) => (
                <button key={`${c.tab.id}-${i}`} className="lb-row" onClick={() => p.onGo(c.tab.url)}>
                  <Avatar url={c.tab.url} title={c.tab.title} size={14} />
                  <span className="lb-tab-title">{c.tab.title || hostOf(c.tab.url)}</span>
                  <span className="lb-mono lb-dim">{c.closedMs ? relTime(c.closedMs, p.now) : hostOf(c.tab.url)}</span>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        <dl className="lb-keys" aria-label="Keyboard shortcuts">
          {SHORTCUTS.map(([k, what]) => (
            <div key={k}><dt><Key k={k} /></dt><dd>{what}</dd></div>
          ))}
        </dl>
      </div>
    </div>
  );
}

interface ErrorProps {
  code: string;
  url: string;
  online?: boolean;
  canBack: boolean;
  onRetry(): void;
  onBack(): void;
  onSearch(query: string): void;
}

/** Shown instead of the engine's own error page: what went wrong in plain words, and what to do. */
export function ErrorPage(p: ErrorProps) {
  const info = errorInfo(p.code, p.url, p.online ?? true);
  const Icon = info.kind === "offline" ? CloudOff : info.kind === "cert" ? ShieldAlert : TriangleAlert;
  const host = hostOf(p.url);
  return (
    <div className="lb-start lb-error lens-dither lens-dither-vignette" role="alert">
      <Icon size={24} className={info.unsafe ? "lb-never" : "lb-dim"} />
      <h1>{info.title}</h1>
      <p className="lb-error-body">{info.body}</p>
      <div className="lb-error-actions">
        {info.unsafe && p.canBack ? (
          <button className="lb-btn lb-btn-primary" onClick={p.onBack} autoFocus>Go back <Key k="⏎" /></button>
        ) : (
          <button className="lb-btn lb-btn-primary" onClick={p.onRetry} autoFocus><RotateCw size={14} /> Try again <Key k="⏎" /></button>
        )}
        {info.unsafe ? <button className="lb-btn" onClick={p.onRetry}>Try again</button> : p.canBack ? <button className="lb-btn" onClick={p.onBack}>Go back</button> : null}
        {info.kind === "dns" && host ? <button className="lb-btn" onClick={() => p.onSearch(host)}><Search size={14} /> Search for {host}</button> : null}
      </div>
      <p className="lb-mono lb-dim">{host ? `${host} · ` : ""}{p.code}</p>
    </div>
  );
}
