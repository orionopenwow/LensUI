import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface UpdateSettings {
  mode: "off" | "notify" | "auto" | string;
  lastCheckMs: number;
}

interface UpdateStatus {
  state: "not-configured" | "up-to-date" | "available" | "error" | string;
  currentVersion: string;
  newVersion: string | null;
  notes: string | null;
  message: string;
}

const MODES: { id: string; label: string; desc: string }[] = [
  { id: "off", label: "Off", desc: "Never checks." },
  { id: "notify", label: "Tell me", desc: "Checks once a day and lets you decide." },
  { id: "auto", label: "Install", desc: "Installs signed updates, then asks to restart." },
];

/**
 * Control Center card: update mode and a manual check. Updates come from GitHub Releases and are
 * signature-checked before installing. Backend: win_update.rs.
 */
export const UpdatesCard: React.FC = () => {
  const [settings, setSettings] = useState<UpdateSettings | null>(null);
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    invoke<UpdateSettings>("get_update_settings_cmd").then(setSettings).catch(() => setSettings(null));
  }, []);

  const setMode = (mode: string) => {
    invoke<UpdateSettings>("set_update_settings_cmd", { settings: { ...(settings ?? { lastCheckMs: 0 }), mode } })
      .then(setSettings)
      .catch(() => {});
  };

  const check = async () => {
    setBusy(true);
    try {
      setStatus(await invoke<UpdateStatus>("check_for_update_cmd"));
    } catch (e) {
      setStatus({ state: "error", currentVersion: "", newVersion: null, notes: null, message: String(e) });
    } finally {
      setBusy(false);
    }
  };

  const install = async () => {
    setBusy(true);
    try {
      const v = await invoke<string>("install_update_cmd");
      setStatus({ state: "up-to-date", currentVersion: v, newVersion: null, notes: null, message: `Installed ${v}. Lens UI will restart.` });
    } catch (e) {
      setStatus({ state: "error", currentVersion: "", newVersion: null, notes: null, message: String(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="cc-card">
      <div className="cc-label">Updates</div>
      <div className="cc-desc">
        From GitHub Releases, checked against Lens' signing key before anything installs. To roll back, run the
        previous installer from the Releases page.
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
        <div className="cc-desc">
          {status ? status.message : settings ? MODES.find((m) => m.id === settings.mode)?.desc : "Updates are unavailable in this build."}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="cc-btn-ghost" disabled={busy} onClick={check}>
            Check now
          </button>
          {status?.state === "available" && (
            <button type="button" className="cc-btn" disabled={busy} onClick={install}>
              Install {status.newVersion}
            </button>
          )}
        </div>
      </div>

      {status?.state === "available" && status.notes && (
        <pre className="cc-input" style={{ whiteSpace: "pre-wrap", fontSize: 11, maxHeight: 160, overflow: "auto", userSelect: "text" }}>
          {status.notes}
        </pre>
      )}
    </div>
  );
};
