import React, { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ChevronLeft, ChevronRight, Layers, Plus, Trash2, X } from "lucide-react";
import type { LensConfig } from "../types/lens";
import { TILING_LAYOUTS, useTilingStyles } from "./TilingCard";
import type * as Gen from "../types/generated";

/** Mirrors win_workspaces::WorkspaceDef / WorkspacesConfig (LensConfig.workspaces). */
export type WorkspaceDef = Gen.WorkspaceDef;

export interface WorkspacesConfig {
  enabled: boolean;
  mode: "auto" | "virtual-desktops" | "groups" | string;
  followAssigned: boolean;
  workspaces: WorkspaceDef[];
}

export interface WorkspaceStatus {
  enabled: boolean;
  mode: "virtual-desktops" | "groups" | string;
  active: number;
  workspaces: { index: number; id: string; name: string; color: string; layout: string; windowCount: number | null }[];
  desktopCount: number;
  appRulesActive: boolean;
  note: string;
}

const MAX_WORKSPACES = 9;
const COLORS = ["#60A5FA", "#34D399", "#FBBF24", "#F472B6", "#A78BFA", "#FB923C", "#22D3EE", "#F87171"];

const ws = (id: string, name: string, color: string): WorkspaceDef => ({ id, name, color, layout: "", apps: [], floatApps: [] });

export const DEFAULT_WORKSPACES: WorkspacesConfig = {
  enabled: false,
  mode: "auto",
  followAssigned: true,
  workspaces: [ws("ws-1", "Main", "#60A5FA"), ws("ws-2", "Work", "#34D399"), ws("ws-3", "Play", "#FBBF24")],
};

type WithWorkspaces = LensConfig & { workspaces?: Partial<WorkspacesConfig> };

export function readWorkspaces(config: LensConfig): WorkspacesConfig {
  const raw = (config as WithWorkspaces).workspaces ?? {};
  const merged = { ...DEFAULT_WORKSPACES, ...raw };
  if (!merged.workspaces || merged.workspaces.length === 0) merged.workspaces = DEFAULT_WORKSPACES.workspaces;
  return merged as WorkspacesConfig;
}

const normalizeApp = (raw: string) => {
  const base = (raw.trim().split(/[\\/]/).pop() ?? "").trim().toLowerCase();
  if (!base) return "";
  return base.endsWith(".exe") ? base : `${base}.exe`;
};

function useWorkspaceStatus() {
  const [status, setStatus] = useState<WorkspaceStatus | null>(null);
  useEffect(() => {
    invoke<WorkspaceStatus>("get_workspaces_status_cmd").then(setStatus).catch(() => {});
    const un = listen<WorkspaceStatus>("lens://workspaces-changed", (e) => setStatus(e.payload));
    return () => {
      un.then((f) => f());
    };
  }, []);
  return [status, setStatus] as const;
}

const switchTo = (target: string, set: (s: WorkspaceStatus) => void) =>
  invoke<WorkspaceStatus>("switch_workspace_cmd", { target })
    .then(set)
    .catch(() => {});

/** App-rule editor: chips + an input. */
const AppList: React.FC<{ apps: string[]; placeholder: string; onChange: (apps: string[]) => void; label: string }> = ({
  apps,
  placeholder,
  onChange,
  label,
}) => {
  const [draft, setDraft] = useState("");
  const add = () => {
    const a = normalizeApp(draft);
    setDraft("");
    if (a && !apps.includes(a)) onChange([...apps, a]);
  };
  return (
    <div className="cc-chip-grid">
      {apps.map((a) => (
        <span key={a} className="cc-chip lens-app-chip">
          {a.replace(/\.exe$/, "")}
          <button type="button" className="lens-app-chip-x" aria-label={`Remove ${a}`} onClick={() => onChange(apps.filter((x) => x !== a))}>
            <X size={11} strokeWidth={2.6} />
          </button>
        </span>
      ))}
      <span className="lens-app-add">
        <input
          className="cc-input"
          value={draft}
          placeholder={placeholder}
          aria-label={label}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
          }}
        />
        <button type="button" className="cc-btn-ghost" aria-label={label} onClick={add}>
          <Plus size={13} strokeWidth={2.6} />
        </button>
      </span>
    </div>
  );
};

interface Props {
  config: LensConfig;
  onUpdateConfig: (next: LensConfig) => Promise<void> | void;
}

/** Control Center card: named workspaces with their own layout and app rules (opt-in). */
export const WorkspacesCard: React.FC<Props> = ({ config, onUpdateConfig }) => {
  useTilingStyles();
  const wsCfg = readWorkspaces(config);
  const [status, setStatus] = useWorkspaceStatus();

  const save = (patch: Partial<WorkspacesConfig>) =>
    onUpdateConfig({ ...(config as WithWorkspaces), workspaces: { ...wsCfg, ...patch } } as LensConfig);
  const saveWs = (i: number, patch: Partial<WorkspaceDef>) =>
    save({ workspaces: wsCfg.workspaces.map((w, k) => (k === i ? { ...w, ...patch } : w)) });

  const addWorkspace = () => {
    if (wsCfg.workspaces.length >= MAX_WORKSPACES) return;
    const ids = new Set(wsCfg.workspaces.map((w) => w.id));
    let n = wsCfg.workspaces.length + 1;
    while (ids.has(`ws-${n}`)) n++;
    save({
      workspaces: [...wsCfg.workspaces, ws(`ws-${n}`, `Workspace ${wsCfg.workspaces.length + 1}`, COLORS[wsCfg.workspaces.length % COLORS.length])],
    });
  };

  const groupsMode = status ? status.mode === "groups" : wsCfg.mode === "groups";
  const active = status?.active ?? 0;

  return (
    <div className="cc-card lens-ws-card">
      <div className="cc-row">
        <div>
          <div className="cc-label">Workspaces</div>
          <div className="cc-desc">Named spaces with their own tiling layout and apps. Switch from the Top Bar or Alt+Shift+1–3.</div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={wsCfg.enabled}
          aria-label="Workspaces"
          className={`cc-toggle ${wsCfg.enabled ? "on" : ""}`}
          onClick={() => save({ enabled: !wsCfg.enabled })}
        />
      </div>

      <div className="cc-row">
        <div>
          <div className="cc-label">Built On</div>
          <div className="cc-desc">
            {status?.enabled
              ? status.mode === "groups"
                ? "Lens window groups: switching minimises one group and restores the next."
                : `Windows virtual desktops (${status.desktopCount} found).`
              : "Automatic uses Windows virtual desktops when available."}
          </div>
        </div>
        <div className="cc-chip-grid">
          {[
            { id: "auto", label: "Automatic" },
            { id: "virtual-desktops", label: "Windows desktops" },
            { id: "groups", label: "Lens groups" },
          ].map((m) => (
            <button key={m.id} type="button" className={`cc-chip ${wsCfg.mode === m.id ? "active" : ""}`} onClick={() => save({ mode: m.id })}>
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {status?.note && <div className="lens-ws-note">{status.note}</div>}

      <div className="lens-ws-list">
        {wsCfg.workspaces.map((w, i) => (
          <div key={w.id} className={`lens-ws-item ${wsCfg.enabled && i === active ? "active" : ""}`}>
            <div className="lens-ws-head">
              <button
                type="button"
                className="lens-ws-num"
                style={{ background: w.color }}
                aria-label={`Switch to ${w.name}`}
                disabled={!wsCfg.enabled}
                onClick={() => switchTo(String(i + 1), setStatus)}
              >
                {i + 1}
              </button>
              <input
                className="cc-input lens-ws-name"
                value={w.name}
                maxLength={24}
                aria-label={`Name of workspace ${i + 1}`}
                onChange={(e) => saveWs(i, { name: e.target.value })}
              />
              <span className="lens-ws-colors" role="radiogroup" aria-label="Colour">
                {COLORS.slice(0, 5).map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={w.color === c}
                    aria-label={`Colour ${c}`}
                    className={`lens-ws-color ${w.color === c ? "active" : ""}`}
                    style={{ background: c }}
                    onClick={() => saveWs(i, { color: c })}
                  />
                ))}
              </span>
              {wsCfg.workspaces.length > 1 && (
                <button
                  type="button"
                  className="cc-btn-ghost"
                  aria-label={`Remove ${w.name}`}
                  onClick={() => save({ workspaces: wsCfg.workspaces.filter((_, k) => k !== i) })}
                >
                  <Trash2 size={13} strokeWidth={2.3} />
                </button>
              )}
            </div>

            <div className="lens-ws-field">
              <span className="cc-desc">Layout</span>
              <div className="cc-chip-grid">
                <button type="button" className={`cc-chip ${w.layout === "" ? "active" : ""}`} onClick={() => saveWs(i, { layout: "" })}>
                  Default
                </button>
                {TILING_LAYOUTS.map((l) => (
                  <button key={l.id} type="button" className={`cc-chip ${w.layout === l.id ? "active" : ""}`} onClick={() => saveWs(i, { layout: l.id })}>
                    {l.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="lens-ws-field">
              <span className="cc-desc">
                Opens here
                {!groupsMode && <span className="lens-ws-hint">Lens groups only</span>}
              </span>
              <AppList
                apps={w.apps}
                placeholder="spotify.exe"
                label={`Add an app that opens on ${w.name}`}
                onChange={(apps) => saveWs(i, { apps })}
              />
            </div>

            <div className="lens-ws-field">
              <span className="cc-desc">Floats</span>
              <AppList apps={w.floatApps} placeholder="app.exe" label={`Add an app that floats on ${w.name}`} onChange={(floatApps) => saveWs(i, { floatApps })} />
            </div>
          </div>
        ))}
      </div>

      <div className="cc-row">
        <div>
          <div className="cc-label">Follow Apps To Their Workspace</div>
          <div className="cc-desc">When an app with an &ldquo;Opens here&rdquo; rule starts, switch to its workspace instead of leaving it there minimised.</div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={wsCfg.followAssigned}
          aria-label="Follow apps to their workspace"
          className={`cc-toggle ${wsCfg.followAssigned ? "on" : ""}`}
          onClick={() => save({ followAssigned: !wsCfg.followAssigned })}
        />
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" className="cc-btn" disabled={wsCfg.workspaces.length >= MAX_WORKSPACES} onClick={addWorkspace}>
          <Plus size={13} strokeWidth={2.6} style={{ marginRight: 5 }} /> Add Workspace
        </button>
      </div>
    </div>
  );
};

/**
 * Top Bar workspace switcher. Replaces the "< Desktops > +" strip while workspaces are on:
 * numbered pills (click to switch), mouse wheel cycles, arrows step.
 */
export const WorkspaceStrip: React.FC = () => {
  useTilingStyles();
  const [status, setStatus] = useWorkspaceStatus();
  const wheelLock = useRef(0);
  if (!status || !status.enabled) return null;
  return (
    <div
      className="session-strip lens-ws-strip"
      role="tablist"
      aria-label="Workspaces"
      onWheel={(e) => {
        const now = Date.now();
        if (now - wheelLock.current < 260) return;
        wheelLock.current = now;
        switchTo(e.deltaY > 0 || e.deltaX > 0 ? "next" : "prev", setStatus);
      }}
    >
      <button type="button" className="topbar-icon-btn" style={{ height: 22, padding: "0 5px" }} aria-label="Previous workspace" onClick={() => switchTo("prev", setStatus)}>
        <ChevronLeft size={14} strokeWidth={2.3} />
      </button>
      {status.workspaces.map((w) => (
        <button
          key={w.id}
          type="button"
          role="tab"
          aria-selected={w.index === status.active}
          className={`lens-ws-pill ${w.index === status.active ? "active" : ""}`}
          onClick={() => switchTo(String(w.index + 1), setStatus)}
        >
          <span className="lens-ws-pill-dot" style={{ background: w.color }} />
          <span className="lens-ws-pill-label">{w.index === status.active ? w.name : w.index + 1}</span>
        </button>
      ))}
      <button type="button" className="topbar-icon-btn" style={{ height: 22, padding: "0 5px" }} aria-label="Next workspace" onClick={() => switchTo("next", setStatus)}>
        <ChevronRight size={14} strokeWidth={2.3} />
      </button>
      <button
        type="button"
        className="topbar-icon-btn"
        style={{ height: 22, padding: "0 5px" }}
        aria-label="All desktops"
        onClick={() => invoke("switch_virtual_desktop_cmd", { direction: "overview" }).catch(() => {})}
      >
        <Layers size={13} strokeWidth={2.2} />
      </button>
    </div>
  );
};
