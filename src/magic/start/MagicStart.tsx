// Lens Magic Start panel (wave M4; docs/MAGIC.md "Magic Start"). What a Windows-key tap opens while
// the Magic button is on. Presentational only: the window (MagicStartWindow.tsx) owns the data and
// the commands; the Magic preview in Settings shows the same panel with sample data.
// Power stays with Windows: Lock is offered, everything else opens Windows Start.
import React from "react";
import { AppWindow, Archive, Camera, FileText, LayoutDashboard, Lock, NotebookPen, Power, Search, Sparkles } from "lucide-react";
import { LensCloud } from "../../presence/LensCloud";
import { LazyPathIcon } from "../../search/ResultIcon";
import type { MagicActionId, StartEntry } from "./model";
import "./MagicStart.css";

const ACTION_ICON: Record<MagicActionId, React.ComponentType<{ size?: number; strokeWidth?: number }>> = {
  magic: Sparkles,
  snip: Camera,
  dashboard: LayoutDashboard,
  shelfNote: NotebookPen,
  shelf: Archive,
  windowsStart: AppWindow,
};

export interface MagicStartPanelProps {
  query: string;
  onQuery: (q: string) => void;
  pinned: StartEntry[];
  actions: StartEntry[];
  recent: StartEntry[];
  results: StartEntry[];
  /** Index into the keyboard order (results while searching, else pinned → actions → recent). */
  selected: number;
  onRun: (e: StartEntry) => void;
  onLock: () => void;
  onWindowsStart: () => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  inputRef?: React.Ref<HTMLInputElement>;
  status?: string;
  /** Sample data (Settings preview): no app icons are looked up. */
  demo?: boolean;
}

export const MagicStartPanel: React.FC<MagicStartPanelProps> = (p) => {
  const searching = p.query.trim().length > 0;
  let idx = 0;
  const row = (e: StartEntry, variant: "tile" | "row") => {
    const i = idx++;
    const active = i === p.selected;
    return (
      <button
        key={e.key}
        type="button"
        role="option"
        aria-selected={active}
        id={`mstart-opt-${i}`}
        data-idx={i}
        data-weight={variant === "tile" ? "medium" : "light"}
        className={`mstart-${variant}${active ? " is-active" : ""}`}
        onClick={() => p.onRun(e)}
      >
        <span className="mstart-icon" aria-hidden="true">
          {entryIcon(e, p.demo)}
        </span>
        <span className="mstart-label">{e.label}</span>
        {variant === "row" && "hint" in e && e.hint ? <span className="mstart-hint-r">{e.hint}</span> : null}
      </button>
    );
  };

  return (
    <section className="mstart" aria-label="Magic Start" onKeyDown={p.onKeyDown}>
      <header className="mstart-head">
        <span className="mstart-orb" aria-hidden="true">
          <LensCloud />
        </span>
        <label className="mstart-search">
          <Search size={14} strokeWidth={2.4} aria-hidden="true" />
          <input
            ref={p.inputRef}
            value={p.query}
            onChange={(e) => p.onQuery(e.target.value)}
            placeholder="Search apps"
            aria-label="Search apps"
            role="combobox"
            aria-expanded="true"
            aria-controls="mstart-list"
            aria-activedescendant={p.selected >= 0 ? `mstart-opt-${p.selected}` : undefined}
            spellCheck={false}
            autoComplete="off"
          />
        </label>
      </header>

      <div id="mstart-list" className="mstart-body" role="listbox" aria-label={searching ? "Results" : "Start"}>
        {searching ? (
          p.results.length ? (
            <div className="mstart-rows">{p.results.map((e) => row(e, "row"))}</div>
          ) : (
            <p className="mstart-empty" role="status">No app called “{p.query.trim()}”. Windows Start, below, searches files and settings too.</p>
          )
        ) : (
          <>
            <h2 className="mstart-h">Pinned</h2>
            {p.pinned.length ? (
              <div className="mstart-grid">{p.pinned.map((e) => row(e, "tile"))}</div>
            ) : (
              <p className="mstart-empty">Pin apps from the Dock or the Launcher and they show here.</p>
            )}
            <h2 className="mstart-h">Magic</h2>
            <div className="mstart-actions">{p.actions.map((e) => row(e, "tile"))}</div>
            <h2 className="mstart-h">Recent</h2>
            {p.recent.length ? (
              <div className="mstart-rows">{p.recent.map((e) => row(e, "row"))}</div>
            ) : (
              <p className="mstart-empty">Files you open and things you keep on the Shelf show here.</p>
            )}
          </>
        )}
      </div>

      <footer className="mstart-foot">
        <span className="mstart-note" role="status">
          {p.status || "Ctrl+Esc always opens Windows Start."}
        </span>
        <button type="button" className="mstart-btn" data-weight="medium" onClick={p.onLock}>
          <Lock size={13} strokeWidth={2.4} aria-hidden="true" /> Lock
        </button>
        <button type="button" className="mstart-btn" data-weight="medium" onClick={p.onWindowsStart} aria-label="Windows Start, for power and everything else">
          <Power size={13} strokeWidth={2.4} aria-hidden="true" /> Windows Start
        </button>
      </footer>
    </section>
  );
};

function entryIcon(e: StartEntry, demo?: boolean): React.ReactNode {
  if (e.kind === "action") {
    const I = ACTION_ICON[e.action];
    return <I size={18} strokeWidth={2.2} />;
  }
  if (e.kind === "shelf") return <Archive size={16} strokeWidth={2.2} />;
  const fallback = e.kind === "app" ? <AppWindow size={18} strokeWidth={2.2} /> : <FileText size={16} strokeWidth={2.2} />;
  return demo ? fallback : <LazyPathIcon path={e.path} size={e.kind === "app" ? 28 : 18} fallback={fallback} />;
}

/** The Settings preview: the real panel with sample entries; nothing runs. */
export const MagicStart: React.FC = () => {
  const [query, setQuery] = React.useState("");
  const pinned: StartEntry[] = [
    { kind: "app", key: "p1", label: "Lens Browser", path: "browser" },
    { kind: "app", key: "p2", label: "Files", path: "files" },
    { kind: "app", key: "p3", label: "Terminal", path: "terminal" },
  ];
  const actions: StartEntry[] = [
    { kind: "action", key: "a1", label: "Ask Magic", action: "magic" },
    { kind: "action", key: "a2", label: "Snip", action: "snip" },
  ];
  const recent: StartEntry[] = [{ kind: "file", key: "r1", label: "Sample report.pdf", path: "report", hint: "Today" }];
  return (
    <MagicStartPanel
      demo
      query={query}
      onQuery={setQuery}
      pinned={pinned}
      actions={actions}
      recent={recent}
      results={pinned.filter((e) => e.label.toLowerCase().includes(query.trim().toLowerCase()))}
      selected={-1}
      onRun={() => {}}
      onLock={() => {}}
      onWindowsStart={() => {}}
      status="Preview: Ctrl+Esc always opens Windows Start."
    />
  );
};
