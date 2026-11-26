// Lens Studio v2 shell (wave M0): Dock / Theme / Desktop workspaces sharing one draft with undo
// and redo. The workspaces are placeholders; later waves mount today's editors inside them on
// the real surfaces. Nothing is applied from here yet.
import React, { useCallback, useEffect, useState } from "react";
import { Redo2, Undo2 } from "lucide-react";
import { canRedo, canUndo, dirty, edit, open, redo, undo, type Draft, type Workspace } from "./draft";
import "./studio-v2.css";

const TABS: { id: Workspace; label: string; desc: string }[] = [
  { id: "dock", label: "Dock", desc: "Style, size, edge and pinned apps, on the real Dock." },
  { id: "theme", label: "Theme", desc: "Colours, materials and accent, previewed on real windows." },
  { id: "desktop", label: "Desktop", desc: "Wallpaper, widgets and layout for a whole desktop." },
];

export interface StudioShellProps<T> {
  initial: T;
  /** Renders the workspace body for a tab; gets the draft value and a setter that records undo. */
  render?: (tab: Workspace, value: T, set: (next: T) => void) => React.ReactNode;
}

export function StudioShell<T>({ initial, render }: StudioShellProps<T>) {
  const [tab, setTab] = useState<Workspace>("dock");
  const [draft, setDraft] = useState<Draft<T>>(() => open(initial));
  const set = useCallback((next: T) => setDraft((d) => edit(d, next)), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) {
        e.preventDefault();
        setDraft((d) => undo(d));
      } else if (k === "y" || (k === "z" && e.shiftKey)) {
        e.preventDefault();
        setDraft((d) => redo(d));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const current = TABS.find((t) => t.id === tab)!;
  return (
    <section className="sv2" aria-label="Lens Studio">
      <header className="sv2-head">
        <div className="sv2-tabs" role="tablist" aria-label="Workspace">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`sv2-tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls="sv2-panel"
              className={`sv2-tab${tab === t.id ? " on" : ""}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="sv2-history">
          <button type="button" className="sv2-icon" aria-label="Undo" disabled={!canUndo(draft)} onClick={() => setDraft((d) => undo(d))}>
            <Undo2 size={14} aria-hidden />
          </button>
          <button type="button" className="sv2-icon" aria-label="Redo" disabled={!canRedo(draft)} onClick={() => setDraft((d) => redo(d))}>
            <Redo2 size={14} aria-hidden />
          </button>
          <button type="button" className="sv2-apply" disabled aria-disabled="true">
            {dirty(draft) ? "Apply (later update)" : "No changes"}
          </button>
        </div>
      </header>
      <div id="sv2-panel" role="tabpanel" aria-labelledby={`sv2-tab-${tab}`} className="sv2-panel">
        {render ? render(tab, draft.present, set) : <p className="sv2-placeholder">{current.desc}</p>}
      </div>
    </section>
  );
}
