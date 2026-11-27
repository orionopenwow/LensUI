import React, { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Play, Plus, Trash2 } from "lucide-react";
import type { LensConfig } from "../types/lens";
import type * as Gen from "../types/generated";
import { eventToHotkey, hotkeyParts, readAppSummon, type AppSummonConfig, type SummonBinding } from "../utils/productivity";
import "./ProductivityCards.css";

interface Props {
  config: LensConfig;
  onUpdateConfig: (next: LensConfig) => Promise<void> | void;
}

/** One-click starting points. Hotkeys avoid every combination Lens already uses. */
const PRESETS: { name: string; path: string; hotkey: string }[] = [
  { name: "Terminal", path: "wt.exe", hotkey: "ctrl+alt+Backquote" },
  { name: "Notepad", path: "notepad.exe", hotkey: "ctrl+alt+shift+KeyN" },
  { name: "Calculator", path: "calc.exe", hotkey: "ctrl+alt+shift+KeyC" },
  { name: "File Explorer", path: "explorer.exe", hotkey: "ctrl+alt+shift+KeyF" },
];

const newId = () => `sum-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

const KeyRecorder: React.FC<{ value: string; onChange: (v: string) => void; label: string }> = ({ value, onChange, label }) => {
  const [recording, setRecording] = useState(false);
  return (
    <button data-weight="medium"
      type="button"
      className={`as-keys ${recording ? "recording" : ""}`}
      aria-label={`${label} shortcut: ${value ? hotkeyParts(value).join(" + ") : "none"}. Click, then press the keys.`}
      onClick={() => setRecording(true)}
      onBlur={() => setRecording(false)}
      onKeyDown={(e) => {
        if (!recording) return;
        e.preventDefault();
        e.stopPropagation();
        if (e.key === "Escape") {
          setRecording(false);
          return;
        }
        const hk = eventToHotkey(e);
        if (hk) {
          onChange(hk);
          setRecording(false);
        }
      }}
    >
      {recording ? (
        "Press the keys…"
      ) : value ? (
        hotkeyParts(value).map((p, i) => <kbd key={i}>{p}</kbd>)
      ) : (
        "Set shortcut"
      )}
    </button>
  );
};

/** Control Center card: one hotkey per app that shows it, hides it, or starts it (opt-in). */
export const AppSummonCard: React.FC<Props> = ({ config, onUpdateConfig }) => {
  const as = readAppSummon(config);
  const [statuses, setStatuses] = useState<Gen.SummonBindingStatus[]>([]);
  const [tryMsg, setTryMsg] = useState<Record<string, string>>({});

  const refreshStatus = useCallback(() => {
    invoke<Gen.SummonBindingStatus[]>("get_app_summon_status_cmd").then((s) => setStatuses(s ?? [])).catch(() => {});
  }, []);

  useEffect(() => {
    // Saving re-registers the hotkeys on the backend; read the result a moment later.
    const t = window.setTimeout(refreshStatus, 350);
    return () => window.clearTimeout(t);
  }, [refreshStatus, JSON.stringify(as)]);

  const save = (patch: Partial<AppSummonConfig>) => onUpdateConfig({ ...config, appSummon: { ...as, ...patch } } as LensConfig);
  const update = (id: string, patch: Partial<SummonBinding>) =>
    save({ bindings: as.bindings.map((b) => (b.id === id ? { ...b, ...patch } : b)) });

  const add = (preset?: (typeof PRESETS)[number]) =>
    save({
      enabled: true,
      bindings: [
        ...as.bindings,
        { id: newId(), name: preset?.name ?? "", path: preset?.path ?? "", hotkey: preset?.hotkey ?? "", enabled: true },
      ],
    });

  const tryIt = (b: SummonBinding) =>
    invoke<string>("summon_app_cmd", { path: b.path })
      .then((a) => setTryMsg((m) => ({ ...m, [b.id]: a === "launch" ? "Started it" : a === "hide" ? "Hid it" : "Brought it forward" })))
      .catch((e) => setTryMsg((m) => ({ ...m, [b.id]: String(e) })));

  const unusedPresets = PRESETS.filter((p) => !as.bindings.some((b) => b.path.toLowerCase() === p.path));

  return (
    <div className="cc-card">
      <div className="cc-row">
        <div>
          <div className="cc-label">App hotkeys</div>
          <div className="cc-desc">
            One shortcut per app: it brings the app forward, hides it again if it's already in front, and starts it if it
            isn't running. Great for a drop-down terminal.
          </div>
        </div>
        <button data-weight="light"
          type="button"
          role="switch"
          aria-checked={as.enabled}
          aria-label="App hotkeys"
          className={`cc-toggle ${as.enabled ? "on" : ""}`}
          onClick={() => save({ enabled: !as.enabled })}
        />
      </div>

      {/* B-58: off means dimmed, never click-dead. These options are set-up for later, so they stay
          usable (mouse and keyboard alike) while the feature is off. */}
      <div className={as.enabled ? "" : "pi-dim"} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {as.bindings.length > 0 && (
          <div className="as-list">
            {as.bindings.map((b) => {
              const st = statuses.find((s) => s.id === b.id);
              const msg = tryMsg[b.id] ?? st?.message ?? "";
              return (
                <div key={b.id} className="as-row">
                  <div className="as-row-main">
                    <div className="as-row-line">
                      <input
                        className="cc-input"
                        value={b.name}
                        placeholder="Name"
                        aria-label="App name"
                        style={{ maxWidth: 120 }}
                        onChange={(e) => update(b.id, { name: e.target.value })}
                      />
                      <input
                        className="cc-input"
                        value={b.path}
                        placeholder="app.exe or full path"
                        aria-label="App to open"
                        spellCheck={false}
                        onChange={(e) => update(b.id, { path: e.target.value })}
                      />
                    </div>
                    <div className="as-row-line">
                      <KeyRecorder label={b.name || "App"} value={b.hotkey} onChange={(hotkey) => update(b.id, { hotkey })} />
                      {msg && <span className={`as-msg ${st?.ok && !tryMsg[b.id] ? "ok" : st && !st.ok && st.message !== "Off" ? "bad" : ""}`}>{msg}</span>}
                    </div>
                  </div>
                  <div className="as-row-actions">
                    <button data-weight="light"
                      type="button"
                      role="switch"
                      aria-checked={b.enabled}
                      aria-label={`${b.name || "App"} hotkey`}
                      className={`cc-toggle ${b.enabled ? "on" : ""}`}
                      onClick={() => update(b.id, { enabled: !b.enabled })}
                    />
                    <div style={{ display: "flex", gap: 2 }}>
                      <button data-weight="medium" type="button" className="pi-icon-btn" aria-label={`Try ${b.name || "app"}`} disabled={!b.path} onClick={() => tryIt(b)}>
                        <Play size={13} strokeWidth={2.4} />
                      </button>
                      <button data-weight="medium"
                        type="button"
                        className="pi-icon-btn"
                        aria-label={`Remove ${b.name || "app"}`}
                        onClick={() => save({ bindings: as.bindings.filter((x) => x.id !== b.id) })}
                      >
                        <Trash2 size={13} strokeWidth={2.4} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="as-presets">
          {unusedPresets.map((p) => (
            <button data-weight="light" key={p.path} type="button" className="cc-chip" onClick={() => add(p)}>
              <Plus size={12} strokeWidth={2.6} style={{ marginRight: 4, verticalAlign: -2 }} />
              {p.name}
              <span className="as-msg" style={{ marginLeft: 6 }}>
                {hotkeyParts(p.hotkey).join("+")}
              </span>
            </button>
          ))}
          <button data-weight="medium" type="button" className="cc-btn-ghost" onClick={() => add()}>
            <Plus size={13} strokeWidth={2.6} style={{ marginRight: 4, verticalAlign: -2 }} />
            Other app
          </button>
        </div>
      </div>
    </div>
  );
};
