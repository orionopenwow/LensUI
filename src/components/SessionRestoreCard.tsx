import React, { useState } from "react";
import type { LensConfig, SavedSession } from "../types/lens";
import {
  DEFAULT_SESSION_LAYOUT,
  SESSION_LAYOUTS,
  captureSessionApps,
  describeRestore,
  restoreSession,
  sessionLayout,
  withCapturedSession,
  withNewSession,
} from "../utils/sessions";

interface Props {
  config: LensConfig;
  onUpdateConfig: (next: LensConfig) => Promise<void> | void;
  /** Color for newly saved sessions (pass the active accent). */
  accentHex?: string;
}

const appName = (path: string) => (path.split(/[\\/]/).pop() ?? path).replace(/\.exe$/i, "");

/** Save the apps that are open now as a session, and bring a session back with one click. */
export const SessionRestoreCard: React.FC<Props> = ({ config, onUpdateConfig, accentHex = "#60A5FA" }) => {
  const [name, setName] = useState("");
  const [newLayout, setNewLayout] = useState(DEFAULT_SESSION_LAYOUT);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const skippedNote = (skipped: string[]) =>
    skipped.length ? ` Left out (can't be reopened by Lens): ${skipped.slice(0, 4).join(", ")}.` : "";

  const saveNew = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      const { apps, skipped } = await captureSessionApps();
      if (apps.length === 0) {
        setStatus("No app windows are open to save.");
        return;
      }
      await onUpdateConfig(withNewSession(config, trimmed, accentHex, apps, newLayout));
      setName("");
      setStatus(`Saved "${trimmed}" with ${apps.length} app${apps.length === 1 ? "" : "s"}.${skippedNote(skipped)}`);
    } catch (e) {
      setStatus(`Couldn't read open windows: ${String(e)}`);
    }
  };

  const recapture = async (session: SavedSession) => {
    try {
      const { apps, skipped } = await captureSessionApps();
      await onUpdateConfig(withCapturedSession(config, session.id, apps, sessionLayout(session)));
      setStatus(`"${session.name}" now holds ${apps.length} app${apps.length === 1 ? "" : "s"}.${skippedNote(skipped)}`);
    } catch (e) {
      setStatus(`Couldn't read open windows: ${String(e)}`);
    }
  };

  const restore = async (session: SavedSession) => {
    if (busyId) return;
    setBusyId(session.id);
    try {
      const result = await restoreSession(session, setStatus);
      await onUpdateConfig({ ...config, activeSessionId: session.id });
      setStatus(describeRestore(session, result));
    } catch (e) {
      setStatus(`Couldn't restore "${session.name}": ${String(e)}`);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="cc-card">
      <div className="cc-label">Session Restore</div>
      <div className="cc-desc">
        A session remembers which apps were open and how they were arranged. Restore reopens the ones
        that are missing, then tiles them.
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <input
          className="cc-input"
          style={{ flex: 1 }}
          placeholder="Name for the apps open right now"
          value={name}
          maxLength={40}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") saveNew();
          }}
        />
        <button type="button" className="cc-btn" onClick={saveNew}>
          Save Open Apps
        </button>
      </div>
      <div className="cc-chip-grid">
        {SESSION_LAYOUTS.map((l) => (
          <button
            key={l.id}
            type="button"
            className={`cc-chip ${newLayout === l.id ? "active" : ""}`}
            onClick={() => setNewLayout(l.id)}
          >
            {l.label}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {config.sessions.map((s) => {
          const layout = sessionLayout(s);
          const layoutLabel = SESSION_LAYOUTS.find((l) => l.id === layout)?.label ?? layout;
          const open = openId === s.id;
          return (
            <div key={s.id} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div className="cc-row" style={{ padding: "6px 0" }}>
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setOpenId(open ? null : s.id)}
                  style={{ display: "flex", alignItems: "center", gap: 8, textAlign: "left", minWidth: 0 }}
                >
                  <span style={{ width: 9, height: 9, borderRadius: 999, background: s.color, flexShrink: 0 }} />
                  <span style={{ minWidth: 0 }}>
                    <span className="cc-label">
                      {s.name}
                      {config.activeSessionId === s.id ? " · active" : ""}
                    </span>
                    <span className="cc-desc" style={{ display: "block" }}>
                      {s.apps.length === 0
                        ? "No apps saved yet"
                        : `${s.apps.length} app${s.apps.length === 1 ? "" : "s"} · ${layoutLabel}`}
                    </span>
                  </span>
                </button>
                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  <button type="button" className="cc-btn-ghost" onClick={() => recapture(s)}>
                    Update
                  </button>
                  <button
                    type="button"
                    className="cc-btn"
                    disabled={s.apps.length === 0 || busyId !== null}
                    style={{ opacity: s.apps.length === 0 || busyId !== null ? 0.5 : 1 }}
                    onClick={() => restore(s)}
                  >
                    {busyId === s.id ? "Restoring…" : "Restore"}
                  </button>
                </div>
              </div>

              {open && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingLeft: 17 }}>
                  <div className="cc-chip-grid">
                    {SESSION_LAYOUTS.map((l) => (
                      <button
                        key={l.id}
                        type="button"
                        className={`cc-chip ${layout === l.id ? "active" : ""}`}
                        onClick={() => onUpdateConfig(withCapturedSession(config, s.id, s.apps, l.id))}
                      >
                        {l.label}
                      </button>
                    ))}
                  </div>
                  {s.apps.length > 0 && (
                    <div className="cc-chip-grid">
                      {s.apps.map((path) => (
                        <button
                          key={path}
                          type="button"
                          className="cc-chip"
                          aria-label={`Remove ${appName(path)} from ${s.name}`}
                          onClick={() =>
                            onUpdateConfig(
                              withCapturedSession(
                                config,
                                s.id,
                                s.apps.filter((p) => p !== path),
                                layout
                              )
                            )
                          }
                        >
                          {appName(path)} ×
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {status && <div className="cc-desc">{status}</div>}
    </div>
  );
};
