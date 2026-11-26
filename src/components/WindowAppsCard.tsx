import React, { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Lock } from "lucide-react";
import type { LensConfig, RunningWindow } from "../types/lens";
import type { WindowRule } from "../types/generated";
import { appKey, buildRows, protectionQueries, summaryLine, withButtons } from "../windowapps/model";
import "./WindowAppsCard.css";

interface Props {
  config: LensConfig;
  onUpdateConfig: (next: LensConfig) => Promise<void> | void;
}

const SIDES: { id: string; label: string }[] = [
  { id: "top-right", label: "Right" },
  { id: "top-left", label: "Left" },
];

/**
 * Settings › Windows › Apps and window buttons. One list of the apps Lens has seen: a switch for
 * Lens's window buttons per app (stored in `windowControls.excludedProcesses`), which apps a rule
 * leaves alone, and a locked "Protected" badge on the apps Lens never touches (anti-cheat games,
 * Windows shell hosts and Lens itself; `win_rules::is_protected_process`). Also which side the
 * buttons sit on. Model: src/windowapps/model.ts.
 */
export const WindowAppsCard: React.FC<Props> = ({ config, onUpdateConfig }) => {
  const wc = config.windowControls;
  const [running, setRunning] = useState<RunningWindow[]>([]);
  const [rules, setRules] = useState<WindowRule[]>([]);
  const [protectedKeys, setProtectedKeys] = useState<ReadonlySet<string>>(new Set());
  const [manual, setManual] = useState("");

  const refresh = useCallback(() => {
    invoke<RunningWindow[]>("get_running_windows")
      .then((w) => Array.isArray(w) && setRunning(w))
      .catch(() => undefined);
    invoke<WindowRule[]>("get_window_rules_cmd")
      .then((r) => Array.isArray(r) && setRules(r))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Ask the backend which of these apps are on its built-in protected lists.
  const excluded = useMemo(() => wc.excludedProcesses ?? [], [wc.excludedProcesses]);
  useEffect(() => {
    const queries = protectionQueries(running, excluded);
    if (queries.length === 0) return;
    let live = true;
    invoke<boolean[]>("protected_processes_cmd", { processes: queries.map((q) => q.query) })
      .then((flags) => {
        if (live && Array.isArray(flags)) setProtectedKeys(new Set(queries.filter((_, i) => flags[i]).map((q) => q.key)));
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [running, excluded]);

  const rows = useMemo(() => buildRows(running, excluded, rules, protectedKeys), [running, excluded, rules, protectedKeys]);

  const setButtons = (app: string, on: boolean) =>
    void onUpdateConfig({ ...config, windowControls: { ...wc, excludedProcesses: withButtons(excluded, app, on) } });

  const addManual = () => {
    if (!appKey(manual)) return;
    setButtons(manual, false);
    setManual("");
  };

  return (
    <div className="cc-card" data-guide-id="window-apps-card">
      <div className="cc-row">
        <div>
          <div className="cc-label">Apps and window buttons</div>
          <div className="cc-desc">
            Choose which apps get Lens's window buttons. Games with anti-cheat, fullscreen apps and Windows' own shell are always left
            alone; that can't be switched off.
          </div>
        </div>
        <button type="button" className="cc-btn-ghost" onClick={refresh}>
          Refresh
        </button>
      </div>

      <div className="cc-row">
        <div>
          <div className="cc-label">Buttons on the</div>
          <div className="cc-desc">
            Left is used where a window's title bar is free there. Apps with tabs or tools in the title bar (browsers, File Explorer,
            Terminal) keep their buttons on the right.
          </div>
        </div>
        <div className="cc-chip-grid" role="radiogroup" aria-label="Window button side">
          {SIDES.map((s) => (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={wc.position === s.id}
              className={`cc-chip ${wc.position === s.id ? "active" : ""}`}
              onClick={() => void onUpdateConfig({ ...config, windowControls: { ...wc, position: s.id } })}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="cc-desc wa-summary" role="status">
        {summaryLine(rows)}
      </div>
      <ul className="wa-list" aria-label="Apps">
        {rows.map((r) => (
          <li key={r.key} className="wa-row">
            <div className="wa-text">
              <span className="wa-name">{r.name}</span>
              <span className="wa-sub">
                {r.protected
                  ? "Lens never touches this app"
                  : r.leftAlone
                    ? "Left alone by a rule below"
                    : r.running
                      ? "Running"
                      : "Not running"}
              </span>
            </div>
            {r.protected ? (
              <span className="wa-badge" data-protected>
                <Lock size={11} strokeWidth={2.4} aria-hidden />
                Protected
              </span>
            ) : r.leftAlone ? (
              <span className="wa-badge">Left alone</span>
            ) : (
              <button
                type="button"
                role="switch"
                aria-checked={r.buttons}
                aria-label={`Window buttons on ${r.name}`}
                className={`cc-toggle ${r.buttons ? "on" : ""}`}
                onClick={() => setButtons(r.name, !r.buttons)}
              />
            )}
          </li>
        ))}
      </ul>

      <div className="cc-row">
        <div>
          <div className="cc-label">Another app</div>
          <div className="cc-desc">Type its file name to keep Lens's buttons off it, e.g. obs64.exe.</div>
        </div>
        <div className="wa-add">
          <input
            className="cc-input"
            value={manual}
            aria-label="App file name"
            placeholder="app.exe"
            onChange={(e) => setManual(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addManual();
            }}
          />
          <button type="button" className="cc-btn-ghost" disabled={!appKey(manual)} onClick={addManual}>
            Add
          </button>
        </div>
      </div>
    </div>
  );
};
