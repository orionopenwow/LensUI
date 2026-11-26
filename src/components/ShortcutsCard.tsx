// Settings › Windows & Keys › Keyboard shortcuts: every Lens shortcut on one sheet, in plain words.
// The ones kept in the main config can be changed here: press Change, then the new keys; a key that
// belongs to Windows or to another Lens shortcut is refused, one most apps use gets a warning.
// "Reset to simple defaults" puts every changeable shortcut back (src/keys/shortcuts.ts).
import React, { useEffect, useMemo, useState } from "react";
import type { LensConfig } from "../types/lens";
import { comboFromEvent, comboProblem, shortcutsFor, withShortcut, withSimpleShortcuts, type ShortcutId } from "../keys/shortcuts";
import { snipStatus } from "../snip/api";
import "./ShortcutsCard.css";

interface Props {
  config: LensConfig;
  onUpdateConfig: (next: LensConfig) => Promise<void> | void;
}

export const ShortcutsCard: React.FC<Props> = ({ config, onUpdateConfig }) => {
  // Snip keeps its shortcut in its own settings file; show the real one, not a guess.
  const [snip, setSnip] = useState<string | undefined>(undefined);
  useEffect(() => {
    let live = true;
    snipStatus()
      .then((st) => live && setSnip(st?.settings?.hotkey))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  const all = useMemo(() => shortcutsFor(config, { snip }), [config, snip]);
  const [recording, setRecording] = useState<ShortcutId | null>(null);
  const [message, setMessage] = useState<{ id: ShortcutId; text: string; level: "block" | "note" } | null>(null);
  const isSimple = all.every((s) => !s.editable || s.keys === s.simple);

  const onKey = (id: ShortcutId) => (e: React.KeyboardEvent) => {
    if (e.key === "Escape" && !e.ctrlKey && !e.altKey && !e.metaKey) {
      setRecording(null);
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    const combo = comboFromEvent(e);
    if (!combo) return;
    const problem = comboProblem(combo, id, all);
    if (problem?.level === "block") {
      setMessage({ id, text: problem.message, level: "block" });
      return;
    }
    setRecording(null);
    setMessage(problem ? { id, text: problem.message, level: "note" } : null);
    void onUpdateConfig(withShortcut(config, id, combo));
  };

  return (
    <div className="cc-card ks-card">
      <div className="cc-row ks-head">
        <div>
          <div className="cc-label">Keyboard shortcuts</div>
          <div className="cc-desc">Everything Lens listens for. Windows' own keys (Win+L, Ctrl+Alt+Del, Alt+Tab) are never taken.</div>
        </div>
        <button
          type="button"
          className="cc-btn-ghost"
          disabled={isSimple}
          onClick={() => {
            setMessage(null);
            setRecording(null);
            void onUpdateConfig(withSimpleShortcuts(config));
          }}
        >
          Reset to simple defaults
        </button>
      </div>
      <ul className="ks-list" aria-label="Keyboard shortcuts">
        {all.map((s) => (
          <li key={s.id} className="ks-row">
            <div className="ks-text">
              <span className="ks-name">{s.name}</span>
              {(s.when || s.where) && (
                <span className="ks-sub">
                  {s.when ? `When ${s.when.charAt(0).toLowerCase()}${s.when.slice(1)}` : ""}
                  {s.when && s.where ? " · " : ""}
                  {s.where ? `Change in ${s.where}` : ""}
                </span>
              )}
              {message?.id === s.id && (
                <span className={`ks-msg ${message.level === "block" ? "is-block" : ""}`} role="status">
                  {message.text}
                </span>
              )}
            </div>
            {recording === s.id ? (
              <button type="button" className="ks-keys is-recording" autoFocus onKeyDown={onKey(s.id)} onBlur={() => setRecording(null)}>
                Press the new keys…
              </button>
            ) : (
              <kbd className="ks-keys">{s.keys}</kbd>
            )}
            {s.editable && recording !== s.id && (
              <button
                type="button"
                className="cc-btn-ghost ks-change"
                aria-label={`Change the shortcut for ${s.name}`}
                onClick={() => {
                  setMessage(null);
                  setRecording(s.id);
                }}
              >
                Change
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};
