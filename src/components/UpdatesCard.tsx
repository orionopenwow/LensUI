import React, { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useLensUpdate } from "../update/useLensUpdate";
import { notesLines } from "../update/model";
import "../update/update.css";

interface UpdateSettings {
  mode: "off" | "notify" | "auto" | string;
  lastCheckMs: number;
}

const MODES: { id: string; label: string; desc: string }[] = [
  { id: "off", label: "Off", desc: "Never checks." },
  { id: "notify", label: "Tell me", desc: "Checks once a day and lets you decide." },
  { id: "auto", label: "Get it ready", desc: "Downloads signed updates in the background. You choose when to restart." },
];

/**
 * Settings › About & Testing › Updates: update mode, "Check now", what's new, and "Restart to
 * update". Updates come from GitHub Releases and are signature-checked before anything installs.
 * Backend: win_update.rs. The Top Bar pill and `/update` in Command use the same state.
 */
export const UpdatesCard: React.FC = () => {
  const [settings, setSettings] = useState<UpdateSettings | null>(null);
  const { status, check, download, restart } = useLensUpdate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);

  useEffect(() => {
    invoke<UpdateSettings>("get_update_settings_cmd").then(setSettings).catch(() => setSettings(null));
  }, []);

  const run = async (f: () => Promise<unknown>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await f();
    } catch (e) {
      setError(String(e));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  // "Check for updates…" in the tray menu opens this card and asks for a check.
  useEffect(() => {
    const un = listen("lens://update-check-now", () => void run(check));
    return () => void un.then((f) => f()).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [check]);

  const setMode = (mode: string) => {
    invoke<UpdateSettings>("set_update_settings_cmd", { settings: { ...(settings ?? { lastCheckMs: 0 }), mode } })
      .then(setSettings)
      .catch(() => {});
  };

  const state = status.state;
  const shown = error ?? (status.message || (settings ? MODES.find((m) => m.id === settings.mode)?.desc : "Updates are unavailable in this build."));
  const notes = state === "available" || state === "ready" || state === "downloading" ? notesLines(status.notes) : [];

  return (
    <div className="cc-card">
      <div className="cc-label">Updates</div>
      <div className="cc-desc">
        From GitHub Releases, checked against Lens' signing key before anything installs. Nothing installs until you choose Restart to
        update. To roll back, run the previous installer from the Releases page.
      </div>

      <div className="cc-chip-grid" role="radiogroup" aria-label="Update mode">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={settings?.mode === m.id}
            aria-label={`${m.label}: ${m.desc}`}
            className={`cc-chip ${settings?.mode === m.id ? "active" : ""}`}
            onClick={() => setMode(m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="cc-row">
        <div className="cc-desc lu-state" role="status">
          {shown}
        </div>
        <div className="lu-actions">
          {state !== "ready" && state !== "installing" && (
            <button type="button" className="cc-btn-ghost" disabled={busy || state === "downloading"} onClick={() => void run(check)}>
              {busy && state !== "downloading" ? "Checking…" : "Check now"}
            </button>
          )}
          {state === "available" && (
            <button type="button" className="cc-btn" disabled={busy} onClick={() => void run(download)}>
              Download {status.newVersion}
            </button>
          )}
          {(state === "ready" || state === "installing") && (
            <button type="button" className="cc-btn" disabled={busy || state === "installing"} onClick={() => void run(restart)}>
              {state === "installing" ? "Updating…" : `Restart to update to ${status.newVersion ?? "the new version"}`}
            </button>
          )}
        </div>
      </div>

      {notes.length > 0 && (
        <details className="lu-sheet" open={state === "ready"}>
          <summary className="cc-desc">What's new in {status.newVersion}</summary>
          <div className="lu-notes">
            {notes.map((l, i) => (
              <p key={i}>{l}</p>
            ))}
          </div>
        </details>
      )}
    </div>
  );
};
