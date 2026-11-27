// Lens's own pages inside the content area: the new-tab page, the page shown when a site fails
// to load, and the reader view. All are frame UI (the tab's webview is hidden while they show).
import React, { useLayoutEffect, useMemo, useRef } from "react";
import { CloudOff, Download, History as HistoryIcon, Minus, Plus, RotateCw, Search, ShieldAlert, Sparkles, TriangleAlert, Undo2, X } from "lucide-react";
import { glideIn } from "../ui/motion";
import type { Bookmark, HistoryEntry, ReaderPrefs, Tab } from "./api";
import { READER_SIZE, clampReader, parseReadable, readerWorthIt, readingLabel, stepSize, type Inline } from "./reader";
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
    <div className="lb-start lb-newtab lb-glow" role="region" aria-label="New tab">
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
          <button data-weight="light" className="lb-chip lb-newtab-ask" onClick={() => p.onAsk(input.current?.value.trim() || "What can you help me with here?")}>
            <Sparkles size={12} /> Ask instead <Key k="Ctrl J" />
          </button>
        ) : null}

        {empty ? (
          <div className="lb-newtab-empty">
            <p>Nothing here yet. Sites you visit often will show up on this page.</p>
            <button data-weight="medium" className="lb-btn lb-btn-sm" onClick={p.onImport}><Download size={13} /> Bring bookmarks from another browser</button>
          </div>
        ) : null}

        {sites.length ? (
          <section aria-label="Most visited">
            <div className="lb-head"><span>Most visited</span><button data-weight="light" className="lb-chip lb-head-right" onClick={p.onHistory}><HistoryIcon size={12} /> History <Key k="Ctrl H" /></button></div>
            <div className="lb-tiles">
              {sites.map((s) => (
                <button data-weight="heavy" key={s.host} className="lb-tile" onClick={() => p.onGo(s.url)} aria-label={`${s.host}, visited ${s.visits} times`}>
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
                <button data-weight="heavy" key={b.id} className="lb-tile" onClick={() => p.onGo(b.url)} aria-label={b.title || hostOf(b.url)}>
                  <Avatar url={b.url} title={b.title} size={28} />
                  <span className="lb-tile-name">{b.title || hostOf(b.url)}</span>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {closed.length ? (
          <section aria-label="Recently closed">
            <div className="lb-head"><span>Recently closed</span><button data-weight="light" className="lb-chip lb-head-right" onClick={p.onReopen}><Undo2 size={12} /> Reopen last <Key k="Ctrl Shift T" /></button></div>
            <div className="lb-newtab-list">
              {closed.map((c, i) => (
                <button data-weight="light" key={`${c.tab.id}-${i}`} className="lb-row" onClick={() => p.onGo(c.tab.url)}>
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
    <div className="lb-start lb-error lb-glow lb-glow-quiet" role="alert">
      <Icon size={24} className={info.unsafe ? "lb-never" : "lb-dim"} />
      <h1>{info.title}</h1>
      <p className="lb-error-body">{info.body}</p>
      <div className="lb-error-actions">
        {info.unsafe && p.canBack ? (
          <button data-weight="heavy" className="lb-btn lb-btn-primary" onClick={p.onBack} autoFocus>Go back <Key k="⏎" /></button>
        ) : (
          <button data-weight="heavy" className="lb-btn lb-btn-primary" onClick={p.onRetry} autoFocus><RotateCw size={14} /> Try again <Key k="⏎" /></button>
        )}
        {info.unsafe ? <button data-weight="medium" className="lb-btn" onClick={p.onRetry}>Try again</button> : p.canBack ? <button data-weight="medium" className="lb-btn" onClick={p.onBack}>Go back</button> : null}
        {info.kind === "dns" && host ? <button data-weight="medium" className="lb-btn" onClick={() => p.onSearch(host)}><Search size={14} /> Search for {host}</button> : null}
      </div>
      <p className="lb-mono lb-dim">{host ? `${host} · ` : ""}{p.code}</p>
    </div>
  );
}

/** What the reader is open on: one tab's text at one address. */
export interface ReaderSeed {
  tabId: string;
  /** The tab's address when the reader opened; the reader closes when the tab moves on. */
  tabUrl?: string;
  url: string;
  title: string;
  text: string;
}

interface ReaderProps {
  /** The page agent's readable text for the tab (markdown-ish: "# ", "- ", "[text](url)"). */
  text: string;
  title: string;
  url: string;
  prefs?: Partial<ReaderPrefs> | null;
  /** Summarise and Ask show only when the browser's AI is on. */
  ask: boolean;
  onPrefs(p: ReaderPrefs): void;
  onClose(): void;
  onGo(url: string): void;
  /** Side actions: the AI panel summarises, or opens for a question about, this page. */
  onSummarise(): void;
  onAsk(): void;
}

const inline = (parts: Inline[], onGo: (url: string) => void) =>
  parts.map((p, i) =>
    p.href ? (
      <a key={i} href={p.href} onClick={(e) => { e.preventDefault(); onGo(p.href!); }}>{p.text}</a>
    ) : (
      <React.Fragment key={i}>{p.text}</React.Fragment>
    )
  );

/**
 * Reader view: the page's own text, set by Lens. Local: it shows text the page already gave the
 * frame, loads nothing (no images, no fonts, no scripts), and works with AI turned off.
 * Summarise and Ask are side actions that hand the same text to the AI panel.
 */
export function ReaderPage(p: ReaderProps) {
  const root = useRef<HTMLDivElement>(null);
  const doc = useMemo(() => parseReadable(p.text, { title: p.title, url: p.url }), [p.text, p.title, p.url]);
  const prefs = clampReader(p.prefs);
  const worth = readerWorthIt(doc);
  useLayoutEffect(() => {
    glideIn(root.current, { y: 6, opacity: 0 }, { duration: "fast" });
    root.current?.focus();
  }, []);
  const label = readingLabel(doc);
  const widths: ReaderPrefs["width"][] = ["narrow", "medium", "wide"];
  return (
    <div
      className={`lb-reader lb-reader-${prefs.face} lb-reader-w-${prefs.width} lb-reader-s-${prefs.size}`}
      ref={root}
      role="region"
      aria-label="Reader view"
      tabIndex={-1}
    >
      <div className="lb-reader-bar" role="toolbar" aria-label="Reader">
        <span className="lb-mono lb-dim lb-reader-meta">{[doc.host, label].filter(Boolean).join(" · ")}</span>
        <span className="lb-reader-tools">
          <button data-weight="medium" className="lb-icon-btn sm" aria-label="Smaller text" disabled={prefs.size <= READER_SIZE.min} onClick={() => p.onPrefs(stepSize(prefs, -1))}><Minus size={12} /></button>
          <span className="lb-mono lb-reader-size" aria-live="polite" aria-label={`Text size ${prefs.size}`}>{prefs.size}</span>
          <button data-weight="medium" className="lb-icon-btn sm" aria-label="Larger text" disabled={prefs.size >= READER_SIZE.max} onClick={() => p.onPrefs(stepSize(prefs, 1))}><Plus size={12} /></button>
          <span className="lb-reader-seg" role="radiogroup" aria-label="Column width">
            {widths.map((w) => (
              <button data-weight="light" key={w} role="radio" aria-checked={prefs.width === w} className={`lb-chip${prefs.width === w ? " is-on" : ""}`} onClick={() => p.onPrefs({ ...prefs, width: w })}>{w === "narrow" ? "Narrow" : w === "medium" ? "Medium" : "Wide"}</button>
            ))}
          </span>
          <span className="lb-reader-seg" role="radiogroup" aria-label="Typeface">
            <button data-weight="light" role="radio" aria-checked={prefs.face === "serif"} className={`lb-chip${prefs.face === "serif" ? " is-on" : ""}`} onClick={() => p.onPrefs({ ...prefs, face: "serif" })}>Serif</button>
            <button data-weight="light" role="radio" aria-checked={prefs.face === "sans"} className={`lb-chip${prefs.face === "sans" ? " is-on" : ""}`} onClick={() => p.onPrefs({ ...prefs, face: "sans" })}>Sans</button>
          </span>
          {p.ask && doc.words ? (
            <>
              <button data-weight="light" className="lb-chip" onClick={p.onSummarise}><Sparkles size={12} /> Summarise</button>
              <button data-weight="light" className="lb-chip" onClick={p.onAsk}>Ask <Key k="Ctrl J" /></button>
            </>
          ) : null}
          <button data-weight="light" className="lb-chip" onClick={p.onClose}><X size={12} /> Close <Key k="Esc" /></button>
        </span>
      </div>
      <article className="lb-reader-col">
        <h1>{doc.title}</h1>
        {!worth ? (
          <p className="lb-reader-note">{doc.words ? "There isn't much to read on this page. Here is the text Lens found." : "Lens couldn't find any text to read on this page."}</p>
        ) : null}
        {doc.blocks.map((b, i) => {
          if (b.kind === "heading") {
            const H = (`h${Math.min(6, Math.max(2, b.level))}`) as "h2";
            return <H key={i}>{inline(b.inline, p.onGo)}</H>;
          }
          if (b.kind === "list") return <ul key={i}>{b.items.map((it, j) => <li key={j}>{inline(it, p.onGo)}</li>)}</ul>;
          return <p key={i}>{inline(b.inline, p.onGo)}</p>;
        })}
      </article>
    </div>
  );
}
