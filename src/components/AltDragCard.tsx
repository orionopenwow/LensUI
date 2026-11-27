import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  ArrowDownLeft,
  ArrowDownRight,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpLeft,
  ArrowUpRight,
  Plus,
  X,
  Move,
} from "lucide-react";
import type { LensConfig } from "../types/lens";
import type * as Gen from "../types/generated";
import { normalizeApp, readAltDrag, type AltDragConfig } from "../utils/productivity";
import "./ProductivityCards.css";

interface Props {
  config: LensConfig;
  onUpdateConfig: (next: LensConfig) => Promise<void> | void;
}

const MODIFIERS: { id: string; label: string; keys: string[]; hint: string }[] = [
  { id: "alt", label: "Alt", keys: ["Alt"], hint: "" },
  { id: "alt+shift", label: "Alt + Shift", keys: ["Alt", "Shift"], hint: "" },
  { id: "ctrl+alt", label: "Ctrl + Alt", keys: ["Ctrl", "Alt"], hint: "Ctrl+Alt is AltGr on many keyboards; pick it only if you never type with AltGr." },
];

const ZONES = [ArrowUpLeft, ArrowUp, ArrowUpRight, ArrowLeft, null, ArrowRight, ArrowDownLeft, ArrowDown, ArrowDownRight];

const Toggle: React.FC<{ label: string; desc: string; on: boolean; onChange: () => void }> = ({ label, desc, on, onChange }) => (
  <div className="cc-row">
    <div>
      <div className="cc-label">{label}</div>
      <div className="cc-desc">{desc}</div>
    </div>
    <button data-weight="light" type="button" role="switch" aria-checked={on} aria-label={label} className={`cc-toggle ${on ? "on" : ""}`} onClick={onChange} />
  </div>
);

/** Control Center card: Alt + drag to move and Alt + right-drag to resize windows (opt-in). */
export const AltDragCard: React.FC<Props> = ({ config, onUpdateConfig }) => {
  const ad = readAltDrag(config);
  const [status, setStatus] = useState<Gen.AltDragStatus | null>(null);
  const [newApp, setNewApp] = useState("");

  useEffect(() => {
    if (!ad.enabled) {
      setStatus(null);
      return;
    }
    const poll = () => invoke<Gen.AltDragStatus>("get_alt_drag_status_cmd").then(setStatus).catch(() => {});
    const first = window.setTimeout(poll, 300);
    const timer = window.setInterval(poll, 4000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [ad.enabled]);

  const save = (patch: Partial<AltDragConfig>) => onUpdateConfig({ ...config, altDrag: { ...ad, ...patch } } as LensConfig);

  const mod = MODIFIERS.find((m) => m.id === ad.modifier) ?? MODIFIERS[0];

  const addApp = () => {
    const app = normalizeApp(newApp);
    setNewApp("");
    if (!app || ad.exclude.includes(app)) return;
    save({ exclude: [...ad.exclude, app] });
  };

  const statusLine = (() => {
    if (!ad.enabled) return { text: "Off. Clicks with Alt held go to the app as usual.", tone: "" };
    if (!status) return { text: "Starting…", tone: "" };
    if (!status.hookActive) return { text: status.lastProblem || "Waiting for Windows to allow the mouse watcher…", tone: "warn" };
    if (status.reinstalls > 0)
      return { text: `Ready · Windows reset the watcher ${status.reinstalls}× and Lens restored it`, tone: "on" };
    return { text: `Ready · hold ${mod.label} and drag any window`, tone: "on" };
  })();

  return (
    <div className="cc-card">
      <div className="cc-row">
        <div>
          <div className="cc-label">{mod.label} + drag windows</div>
          <div className="cc-desc">
            Hold {mod.label} and drag anywhere inside a window to move it. Drag with the right button to resize from the
            nearest edge or corner. Fullscreen apps, games and administrator windows are never touched.
          </div>
        </div>
        <button data-weight="light"
          type="button"
          role="switch"
          aria-checked={ad.enabled}
          aria-label="Modifier and drag to move windows"
          className={`cc-toggle ${ad.enabled ? "on" : ""}`}
          onClick={() => save({ enabled: !ad.enabled })}
        />
      </div>

      <div className="cc-desc pi-status" aria-live="polite">
        <span className={`pi-dot ${statusLine.tone}`} />
        {statusLine.text}
      </div>

      {/* B-58: off means dimmed, never click-dead. These options are set-up for later, so they stay
          usable (mouse and keyboard alike) while the feature is off. */}
      <div className={ad.enabled ? "" : "pi-dim"} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <div className="cc-label">Hold</div>
          <div className="cc-chip-grid" style={{ marginTop: 8 }}>
            {MODIFIERS.map((m) => (
              <button data-weight="light"
                key={m.id}
                type="button"
                className={`cc-chip ${ad.modifier === m.id ? "active" : ""}`}
                onClick={() => save({ modifier: m.id })}
              >
                {m.label}
              </button>
            ))}
          </div>
          {mod.hint && <div className="cc-desc" style={{ marginTop: 6 }}>{mod.hint}</div>}
        </div>

        <div className="ad-demo">
          <div className="ad-zones" aria-hidden="true">
            {ZONES.map((Icon, i) => (
              <span key={i}>{Icon ? <Icon size={11} strokeWidth={2.4} /> : <Move size={11} strokeWidth={2.4} />}</span>
            ))}
          </div>
          <div className="cc-desc">
            Right-drag in the outer parts of a window to pull that edge or corner; the middle grabs the nearest corner.
            The other edges stay put.
          </div>
        </div>

        <Toggle label="Right-drag resizes" desc={`${mod.label} + right button resizes the window`} on={ad.resize} onChange={() => save({ resize: !ad.resize })} />
        <Toggle label="Bring to front" desc="The window you grab comes to the front" on={ad.raise} onChange={() => save({ raise: !ad.raise })} />
        <Toggle
          label="Drag maximised windows out"
          desc="A maximised window shrinks back and follows the pointer"
          on={ad.restoreMaximized}
          onChange={() => save({ restoreMaximized: !ad.restoreMaximized })}
        />

        <div>
          <div className="cc-label">Never move</div>
          <div className="cc-desc">Apps that use {mod.label} + drag themselves, like drawing or 3D apps.</div>
        </div>
        <div className="cc-chip-grid">
          {ad.exclude.map((app) => (
            <span key={app} className="cc-chip pi-app-chip">
              {app.replace(/\.exe$/, "")}
              <button data-weight="light"
                type="button"
                className="pi-app-chip-x"
                aria-label={`Allow ${app} again`}
                onClick={() => save({ exclude: ad.exclude.filter((a) => a !== app) })}
              >
                <X size={11} strokeWidth={2.6} />
              </button>
            </span>
          ))}
          <span className="pi-app-add">
            <input
              className="cc-input"
              value={newApp}
              placeholder="app.exe"
              aria-label="App to never move"
              onChange={(e) => setNewApp(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addApp();
              }}
            />
            <button data-weight="medium" type="button" className="cc-btn-ghost" onClick={addApp} aria-label="Add app">
              <Plus size={13} strokeWidth={2.6} />
            </button>
          </span>
        </div>
      </div>
    </div>
  );
};
