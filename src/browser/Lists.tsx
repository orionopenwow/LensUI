// The History and Downloads side panels.
import React, { useEffect, useState } from "react";
import { Download, FolderOpen, RotateCw, Search, Trash2, X } from "lucide-react";
import { downloadReveal, downloadsClear, historyClear, historyRemove, historySearch, type ArchivedTab, type Download as Dl, type HistoryEntry } from "./api";
import { elapsed, hostOf, relTime } from "./model";
import { fileName, groupByDay } from "./nav";
import { Avatar } from "./Sidebar";

interface HistoryProps {
  live: boolean;
  now?: number;
  seed?: HistoryEntry[];
  /** Changes when the browser state changes, so the list stays current. */
  stamp?: unknown;
  archived: ArchivedTab[];
  onOpen(url: string, background: boolean): void;
  onUnarchive(id: string): void;
  onError(msg: string): void;
}

export function HistoryPanel(p: HistoryProps) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<HistoryEntry[]>(p.seed ?? []);
  const [confirm, setConfirm] = useState<"hour" | "all" | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!p.live) return;
    const t = window.setTimeout(() => historySearch(query, 200).then(setItems).catch((e) => p.onError(String(e))), query ? 120 : 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, p.live, p.stamp, tick]);

  const shown = p.live ? items : items.filter((h) => !query || `${h.title} ${h.url}`.toLowerCase().includes(query.toLowerCase()));
  const groups = groupByDay(shown, p.now);
  const clear = (what: "hour" | "all") => {
    if (confirm !== what) return setConfirm(what);
    setConfirm(null);
    const now = p.now ?? Date.now();
    void historyClear(what === "hour" ? now - 3600_000 : 0).then(() => setTick((n) => n + 1)).catch((e) => p.onError(String(e)));
  };

  return (
    <>
      <div className="lb-list-tools">
        <label className="lb-filter">
          <Search size={13} className="lb-dim" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search history" aria-label="Search history" />
          {query ? <button data-weight="medium" className="lb-icon-btn sm" aria-label="Clear search" onClick={() => setQuery("")}><X size={12} /></button> : null}
        </label>
        <div className="lb-list-actions">
          <button data-weight="light" className={`lb-chip${confirm === "hour" ? " is-warn" : ""}`} onClick={() => clear("hour")} onBlur={() => setConfirm(null)}>
            {confirm === "hour" ? "Really clear the last hour?" : "Clear last hour"}
          </button>
          <button data-weight="light" className={`lb-chip${confirm === "all" ? " is-warn" : ""}`} onClick={() => clear("all")} onBlur={() => setConfirm(null)}>
            {confirm === "all" ? "Really clear everything?" : "Clear all"}
          </button>
        </div>
      </div>
      <div className="lb-list" role="list" aria-label="History">
        {shown.length === 0 ? (
          <div className="lb-empty"><p className="lb-dim">{query ? `Nothing in your history matches “${query}”.` : "Pages you visit will be listed here."}</p></div>
        ) : null}
        {groups.map((g) => (
          <React.Fragment key={g.label}>
            <div className="lb-head"><span>{g.label}</span><span className="lb-mono lb-head-right">{g.items.length}</span></div>
            {g.items.map((h) => (
              <div key={h.url} className="lb-row lb-row-split" role="listitem">
                <button data-weight="light" className="lb-row-main" onClick={(e) => p.onOpen(h.url, e.ctrlKey || e.metaKey)} onAuxClick={(e) => e.button === 1 && p.onOpen(h.url, true)}>
                  <Avatar url={h.url} title={h.title} size={14} />
                  <span className="lb-tab-title">{h.title || h.url}</span>
                  <span className="lb-mono lb-dim">{g.label === "Today" ? relTime(h.lastVisitMs, p.now) : new Date(h.lastVisitMs).toTimeString().slice(0, 5)}</span>
                </button>
                <button data-weight="light"
                  className="lb-icon-btn sm lb-row-x"
                  aria-label={`Remove ${h.title || hostOf(h.url)} from history`}
                  onClick={() => {
                    setItems((list) => list.filter((x) => x.url !== h.url));
                    if (p.live) void historyRemove(h.url).catch((e) => p.onError(String(e)));
                  }}
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </React.Fragment>
        ))}
        {p.archived.length ? <div className="lb-head"><span>Archived tabs</span><span className="lb-mono lb-head-right">{p.archived.length}</span></div> : null}
        {p.archived.map((a) => (
          <button data-weight="light" key={a.id} className="lb-row" onClick={() => p.onUnarchive(a.id)}>
            <Avatar url={a.url} title={a.title} size={14} />
            <span className="lb-tab-title">{a.title || a.url}</span>
            <span className="lb-mono lb-dim">{a.space}</span>
          </button>
        ))}
      </div>
    </>
  );
}

interface DownloadsProps {
  items: Dl[];
  live: boolean;
  now?: number;
  onChange(list: Dl[]): void;
  onRetry(url: string): void;
  onError(msg: string): void;
}

export function DownloadsPanel(p: DownloadsProps) {
  // Running downloads show elapsed time, so tick once a second while any is running.
  const running = p.items.some((d) => d.state === "downloading");
  const [, setBeat] = useState(0);
  useEffect(() => {
    if (!running || !p.live) return;
    const id = window.setInterval(() => setBeat((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [running, p.live]);
  const now = p.live ? Date.now() : p.now ?? Date.now();
  const finished = p.items.filter((d) => d.state !== "downloading").length;
  const clear = (id?: number) => {
    if (!p.live) return p.onChange(p.items.filter((d) => d.state === "downloading" || (id !== undefined && d.id !== id)));
    void downloadsClear(id).then(p.onChange).catch((e) => p.onError(String(e)));
  };
  return (
    <>
      {finished ? (
        <div className="lb-list-tools">
          <div className="lb-list-actions">
            <span className="lb-mono lb-dim">{running ? `${p.items.length - finished} running · ` : ""}{finished} finished</span>
            <button data-weight="light" className="lb-chip lb-push" onClick={() => clear()}><Trash2 size={12} /> Clear list</button>
          </div>
        </div>
      ) : null}
      <div className="lb-list" role="list" aria-label="Downloads">
        {p.items.length === 0 ? (
          <div className="lb-empty">
            <Download size={18} className="lb-dim" />
            <p className="lb-dim">Nothing downloaded yet. Files you download appear here and stay listed after a restart.</p>
          </div>
        ) : null}
        {p.items.map((d) => {
          const name = fileName(d.path || d.url);
          return (
            <div key={d.id} className={`lb-dl is-${d.state}`} role="listitem">
              <Download size={14} className={d.state === "failed" ? "lb-never" : "lb-dim"} />
              <div className="lb-dl-text">
                <span className="lb-tab-title">{name}</span>
                <span className="lb-mono lb-dim">
                  {d.state === "downloading" ? `Downloading · ${elapsed(now - d.startedMs)}` : d.state === "done" ? `${hostOf(d.url) || "Saved"} · ${relTime(d.startedMs, now)}` : "Interrupted"}
                </span>
                {d.state === "downloading" ? <span className="lb-dl-bar" role="progressbar" aria-label={`Downloading ${name}`} /> : null}
              </div>
              {d.path && d.state === "done" ? (
                <button data-weight="light" className="lb-chip" onClick={() => void downloadReveal(d.id).catch((e) => p.onError(String(e)))}><FolderOpen size={12} /> Show in folder</button>
              ) : null}
              {d.state === "failed" ? <button data-weight="light" className="lb-chip" onClick={() => p.onRetry(d.url)}><RotateCw size={12} /> Try again</button> : null}
              {d.state !== "downloading" ? <button data-weight="medium" className="lb-icon-btn sm" aria-label={`Remove ${name} from the list`} onClick={() => clear(d.id)}><X size={12} /></button> : null}
            </div>
          );
        })}
        <p className="lb-mono lb-dim lb-note">Rules by file type live in Settings › Lens Browser. Lens never opens a download for you.</p>
      </div>
    </>
  );
}
