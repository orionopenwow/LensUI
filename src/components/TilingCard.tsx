import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { LayoutGrid, Columns3, Rows3, PanelLeft, Square, Spline, X, Plus } from "lucide-react";
import type { LensConfig } from "../types/lens";
import { PillFillBar } from "./PillFillBar";
import type * as Gen from "../types/generated";

/** Mirrors win_tiler::TilingConfig (LensConfig.tiling). */
export interface TilingConfig {
  enabled: boolean;
  layout: string;
  gap: number;
  masterRatio: number;
  newWindow: "end" | "master" | string;
  floatApps: string[];
}

export type TilingStatus = Gen.TilingStatus;

interface TilingHotkey {
  keys: string;
  action: string;
  arg: string;
  label: string;
}

export const DEFAULT_TILING: TilingConfig = {
  enabled: false,
  layout: "master-stack",
  gap: 8,
  masterRatio: 0.6,
  newWindow: "end",
  floatApps: ["calculatorapp.exe", "taskmgr.exe"],
};

export const TILING_LAYOUTS: { id: string; label: string; icon: React.ReactNode }[] = [
  { id: "master-stack", label: "Master-Stack", icon: <PanelLeft size={13} strokeWidth={2.3} /> },
  { id: "columns", label: "Columns", icon: <Columns3 size={13} strokeWidth={2.3} /> },
  { id: "rows", label: "Rows", icon: <Rows3 size={13} strokeWidth={2.3} /> },
  { id: "grid", label: "Grid", icon: <LayoutGrid size={13} strokeWidth={2.3} /> },
  { id: "dwindle", label: "Dwindle", icon: <Spline size={13} strokeWidth={2.3} /> },
  { id: "monocle", label: "Monocle", icon: <Square size={13} strokeWidth={2.3} /> },
];

type WithTiling = LensConfig & { tiling?: Partial<TilingConfig> };

export function readTiling(config: LensConfig): TilingConfig {
  return { ...DEFAULT_TILING, ...((config as WithTiling).tiling ?? {}) };
}

const normalizeApp = (raw: string) => {
  const base = (raw.trim().split(/[\\/]/).pop() ?? "").trim().toLowerCase();
  if (!base) return "";
  return base.endsWith(".exe") ? base : `${base}.exe`;
};

interface Props {
  config: LensConfig;
  onUpdateConfig: (next: LensConfig) => Promise<void> | void;
}

/** Control Center card: automatic tiling (opt-in). */
export const TilingCard: React.FC<Props> = ({ config, onUpdateConfig }) => {
  useTilingStyles();
  const tiling = readTiling(config);
  const [status, setStatus] = useState<TilingStatus | null>(null);
  const [hotkeys, setHotkeys] = useState<TilingHotkey[]>([]);
  const [newApp, setNewApp] = useState("");
  const [showKeys, setShowKeys] = useState(false);

  useEffect(() => {
    invoke<TilingStatus>("get_tiling_status_cmd").then(setStatus).catch(() => {});
    invoke<TilingHotkey[]>("get_auto_tiling_hotkeys_cmd").then(setHotkeys).catch(() => {});
    const un = listen<TilingStatus>("lens://tiling-changed", (e) => setStatus(e.payload));
    return () => {
      un.then((f) => f());
    };
  }, []);

  const save = (patch: Partial<TilingConfig>) =>
    onUpdateConfig({ ...(config as WithTiling), tiling: { ...tiling, ...patch } } as LensConfig);

  const addApp = () => {
    const app = normalizeApp(newApp);
    if (!app || tiling.floatApps.includes(app)) {
      setNewApp("");
      return;
    }
    save({ floatApps: [...tiling.floatApps, app] });
    setNewApp("");
  };

  const statusLine = (() => {
    if (!tiling.enabled) return "Off. Windows stay wherever you put them.";
    if (!status) return "Starting…";
    if (status.paused) return "Paused while a fullscreen app is in front.";
    const layout = TILING_LAYOUTS.find((l) => l.id === status.layout)?.label ?? status.layout;
    const from = status.layoutFromWorkspace ? " (from this workspace)" : "";
    return `${status.tiled} tiled · ${status.floating} floating · ${layout}${from}`;
  })();

  return (
    <div className="cc-card lens-tiling-card">
      <div className="cc-row">
        <div>
          <div className="cc-label">Automatic tiling</div>
          <div className="cc-desc">
            New windows snap into the layout by themselves. Maximised, minimised, fullscreen and game windows are left
            alone, and a window you move yourself starts floating.
          </div>
        </div>
        <button data-weight="light"
          type="button"
          role="switch"
          aria-checked={tiling.enabled}
          aria-label="Automatic tiling"
          className={`cc-toggle ${tiling.enabled ? "on" : ""}`}
          onClick={() => save({ enabled: !tiling.enabled })}
        />
      </div>

      <div className="cc-desc lens-tiling-status" aria-live="polite">
        <span className={`lens-tiling-dot ${tiling.enabled && status && !status.paused ? "on" : ""}`} />
        {statusLine}
      </div>

      <div>
        <div className="cc-label" style={{ marginTop: 2 }}>Default Layout</div>
        <div className="cc-desc">Each workspace can pick its own.</div>
      </div>
      <div className="cc-chip-grid">
        {TILING_LAYOUTS.map((l) => (
          <button data-weight="light"
            key={l.id}
            type="button"
            className={`cc-chip lens-chip-icon ${tiling.layout === l.id ? "active" : ""}`}
            onClick={() => save({ layout: l.id })}
          >
            {l.icon}
            {l.label}
          </button>
        ))}
      </div>

      <PillFillBar
        label="Gap"
        value={tiling.gap}
        min={0}
        max={32}
        step={1}
        unit="px"
        fillColor="#60A5FA"
        icon={<LayoutGrid size={14} strokeWidth={2.4} />}
        onChange={(v) => save({ gap: Math.round(v) })}
      />
      <PillFillBar
        label="Master width"
        value={Math.round(tiling.masterRatio * 100)}
        min={20}
        max={80}
        step={1}
        unit="%"
        fillColor="#34D399"
        icon={<PanelLeft size={14} strokeWidth={2.4} />}
        onChange={(v) => save({ masterRatio: Math.round(v) / 100 })}
      />

      <div className="cc-row">
        <div>
          <div className="cc-label">New windows open</div>
          <div className="cc-desc">Where a window you just opened goes in the layout</div>
        </div>
        <div className="cc-chip-grid">
          {[
            { id: "end", label: "At the end" },
            { id: "master", label: "As master" },
          ].map((o) => (
            <button data-weight="light"
              key={o.id}
              type="button"
              className={`cc-chip ${tiling.newWindow === o.id ? "active" : ""}`}
              onClick={() => save({ newWindow: o.id })}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div className="cc-label">Always float</div>
      <div className="cc-desc">These apps are never tiled.</div>
      <div className="cc-chip-grid">
        {tiling.floatApps.map((app) => (
          <span key={app} className="cc-chip lens-app-chip">
            {app.replace(/\.exe$/, "")}
            <button data-weight="light"
              type="button"
              className="lens-app-chip-x"
              aria-label={`Stop floating ${app}`}
              onClick={() => save({ floatApps: tiling.floatApps.filter((a) => a !== app) })}
            >
              <X size={11} strokeWidth={2.6} />
            </button>
          </span>
        ))}
        <span className="lens-app-add">
          <input
            className="cc-input"
            value={newApp}
            placeholder="app.exe"
            aria-label="App to always float"
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

      <div className="cc-row">
        <div>
          <div className="cc-label">Tiling shortcuts</div>
          <div className="cc-desc">Work after turning on Keyboard Tiling shortcuts and restarting Lens.</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0, whiteSpace: "nowrap" }}>
          <button data-weight="medium"
            type="button"
            className="cc-btn-ghost"
            disabled={!tiling.enabled}
            onClick={() => invoke("tiling_action_cmd", { action: "retile", arg: "" }).catch(() => {})}
          >
            Re-tile now
          </button>
          <button data-weight="medium" type="button" className="cc-btn-ghost" onClick={() => setShowKeys((s) => !s)}>
            {showKeys ? "Hide keys" : "Show keys"}
          </button>
        </div>
      </div>
      {showKeys && hotkeys.length > 0 && (
        <div className="lens-keys-table" role="table" aria-label="Tiling shortcuts">
          {hotkeys.map((k) => (
            <div key={k.keys} className="lens-keys-row" role="row">
              <span role="cell" className="lens-keys-combo">
                {k.keys.split("+").map((p, i) => (
                  <kbd key={i}>{p}</kbd>
                ))}
              </span>
              <span role="cell" className="cc-desc">
                {k.label}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/** Shared styles for TilingCard and WorkspacesCard (injected once; no new global CSS file). */
export const TILING_CARD_CSS = `
.lens-tiling-status { display: flex; align-items: center; gap: 7px; font-variant-numeric: tabular-nums; }
.lens-tiling-dot { width: 7px; height: 7px; border-radius: 999px; background: rgb(var(--lens-ink) / 0.22); flex-shrink: 0; }
.lens-tiling-dot.on { background: #34D399; box-shadow: 0 0 0 3px rgb(52 211 153 / 0.16); }
.lens-chip-icon { display: inline-flex; align-items: center; gap: 6px; }
.lens-app-chip { display: inline-flex; align-items: center; gap: 4px; padding-right: 5px; }
.lens-app-chip-x { display: inline-flex; align-items: center; justify-content: center; width: 17px; height: 17px; border-radius: 999px; color: var(--lens-fg-secondary); }
.lens-app-chip-x:hover { background: rgb(var(--lens-ink) / 0.1); color: var(--lens-fg); }
.lens-app-add { display: inline-flex; align-items: center; gap: 4px; }
.lens-app-add .cc-input { width: 128px; height: 28px; padding: 0 9px; font-size: 12px; }
.lens-keys-table { display: flex; flex-direction: column; gap: 2px; padding: 4px 0; }
.lens-keys-row { display: grid; grid-template-columns: 196px 1fr; align-items: center; gap: 10px; padding: 3px 0; }
.lens-keys-combo { display: inline-flex; gap: 3px; flex-wrap: wrap; }
.lens-keys-combo kbd { font-family: inherit; font-size: 10.5px; font-weight: 600; padding: 2px 6px; border-radius: 5px; color: var(--lens-fg); background: rgb(var(--lens-ink) / 0.07); border: 1px solid rgb(var(--lens-ink) / 0.12); border-bottom-width: 2px; }
.lens-ws-list { display: flex; flex-direction: column; gap: 8px; }
.lens-ws-item { display: flex; flex-direction: column; gap: 8px; padding: 10px; border-radius: 10px; background: rgb(var(--lens-ink) / 0.03); border: 1px solid rgb(var(--lens-ink) / 0.08); }
.lens-ws-item.active { border-color: rgb(var(--lens-ink) / 0.22); }
.lens-ws-head { display: flex; align-items: center; gap: 8px; }
.lens-ws-num { width: 22px; height: 22px; border-radius: 7px; display: inline-flex; align-items: center; justify-content: center; font-size: 11.5px; font-weight: 700; color: var(--lens-on-fg); font-variant-numeric: tabular-nums; flex-shrink: 0; }
.lens-ws-name { flex: 1; min-width: 0; height: 28px; padding: 0 9px; font-size: 12.5px; }
.lens-ws-colors { display: inline-flex; gap: 4px; }
.lens-ws-color { width: 14px; height: 14px; border-radius: 999px; border: 2px solid transparent; }
.lens-ws-color.active { border-color: var(--lens-fg); }
.lens-ws-field { display: grid; grid-template-columns: 74px 1fr; align-items: center; gap: 8px; }
.lens-ws-hint { display: block; font-size: 10px; color: var(--lens-fg-muted); margin-top: 1px; }
.lens-ws-note { padding: 8px 10px; border-radius: 9px; background: rgb(251 191 36 / 0.08); border: 1px solid rgb(251 191 36 / 0.22); color: var(--lens-fg-secondary); font-size: 11px; line-height: 1.45; }
.lens-ws-strip { display: inline-flex; align-items: center; gap: 2px; }
.lens-ws-pill { display: inline-flex; align-items: center; gap: 5px; height: 22px; padding: 0 8px; border-radius: 6px; font-size: 11px; font-weight: 500; color: var(--lens-fg-secondary); font-variant-numeric: tabular-nums; transition: background var(--lens-dur-fast) var(--lens-ease-out), color var(--lens-dur-fast) var(--lens-ease-out); }
.lens-ws-pill:hover { background: rgb(var(--lens-ink) / 0.07); color: var(--lens-fg); }
.lens-ws-pill.active { background: color-mix(in oklch, var(--lens-accent) 24%, rgb(var(--lens-ink) / 0.09)); color: var(--lens-fg-strong, var(--lens-fg)); }
.lens-ws-pill .lens-ws-pill-dot { width: 6px; height: 6px; border-radius: 999px; }
.lens-ws-pill-label { max-width: 76px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
`;

/** Adds TILING_CARD_CSS to the document once. */
export function useTilingStyles() {
  useEffect(() => {
    if (document.getElementById("lens-tiling-css")) return;
    const el = document.createElement("style");
    el.id = "lens-tiling-css";
    el.textContent = TILING_CARD_CSS;
    document.head.appendChild(el);
  }, []);
}
