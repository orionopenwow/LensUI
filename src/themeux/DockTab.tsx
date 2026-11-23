import React from "react";
import type { LensConfig } from "../types/lens";
import {
  DOCK_STYLES,
  DockScenePreview,
  dockAlignmentOf,
  dockStyleOf,
  dockSystemAreaOf,
  withDock,
  type DockAlignment,
  type DockSystemAreaMode,
} from "../dock/styles";
import { ValueSlider } from "./ThemeTab";

interface Props {
  config: LensConfig;
  accent: string;
  updateConfig: (next: LensConfig) => void;
}

const Seg: React.FC<{
  label: string;
  desc?: string;
  value: string;
  options: { id: string; label: string }[];
  onChange: (id: string) => void;
}> = ({ label, desc, value, options, onChange }) => (
  <div className="tux-row">
    <div className="tux-row-text">
      <div className="cc-label">{label}</div>
      {desc && <div className="cc-desc">{desc}</div>}
    </div>
    <div className="tux-seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} type="button" role="radio" aria-checked={value === o.id} className={value === o.id ? "active" : ""} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  </div>
);

const Toggle: React.FC<{ label: string; desc: string; on: boolean; onChange: (v: boolean) => void }> = ({ label, desc, on, onChange }) => (
  <div className="tux-row">
    <div className="tux-row-text">
      <div className="cc-label">{label}</div>
      <div className="cc-desc">{desc}</div>
    </div>
    <button type="button" role="switch" aria-checked={on} aria-label={label} className={`cc-toggle ${on ? "on" : ""}`} onClick={() => onChange(!on)} />
  </div>
);

/** Dock & Top Bar tab, Dock half: style → position → size → auto-hide → system area. */
export const DockTab: React.FC<Props> = ({ config, accent, updateConfig }) => {
  const style = dockStyleOf(config);
  const alignment = dockAlignmentOf(config);
  const systemArea = dockSystemAreaOf(config);
  const dock = config.dock;
  const setDock = (patch: Partial<LensConfig["dock"]>) => updateConfig({ ...config, dock: { ...dock, ...patch } });

  return (
    <>
      <div>
        <div className="cc-section-title">Dock</div>
        <div className="cc-section-sub">Pick a layout first, then fine-tune where it sits and how big it is.</div>
      </div>

      {/* 1. Style */}
      <div className="cc-card">
        <div className="tux-row-text">
          <div className="cc-label">Dock style</div>
          <div className="cc-desc">Picking a style also sets a matching icon size. You can change it below.</div>
        </div>
        <div className="tux-dock-grid" role="radiogroup" aria-label="Dock style">
          {DOCK_STYLES.map((d) => (
            <button
              key={d.id}
              type="button"
              role="radio"
              aria-checked={style === d.id}
              data-dock-style={d.id}
              className={`tux-dock-card ${style === d.id ? "active" : ""}`}
              onClick={() => updateConfig(withDock({ ...config, dock: { ...dock, iconSize: d.recommendedIconSize } }, { style: d.id }))}
            >
              <DockScenePreview styleId={d.id} accent={accent} alignment={alignment} height={56} />
              <span className="tux-pack-name">
                <span className="tux-pack-label">{d.label}</span>
                {style === d.id && <span className="tux-pack-dot" />}
              </span>
              <span className="tux-pack-desc">{d.description}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 2. Position */}
      <div className="cc-card">
        <Seg
          label="Screen edge"
          value={dock.position ?? "bottom"}
          options={[
            { id: "bottom", label: "Bottom" },
            { id: "left", label: "Left" },
            { id: "right", label: "Right" },
            { id: "top", label: "Top" },
          ]}
          onChange={(id) => setDock({ position: id })}
        />
        <Seg
          label="App alignment"
          desc={style === "taskbar" ? "Left matches the classic Windows 10 taskbar." : "Where the apps sit along the edge."}
          value={alignment}
          options={[
            { id: "center", label: "Centre" },
            { id: "left", label: "Start" },
          ]}
          onChange={(id) => updateConfig(withDock(config, { alignment: id as DockAlignment }))}
        />
        <Seg
          label="System area"
          desc="Clock, tray and quick settings. Auto uses the Top Bar when it is on."
          value={systemArea}
          options={[
            { id: "auto", label: "Auto" },
            { id: "dock", label: "In Dock" },
            { id: "topbar", label: "In Top Bar" },
          ]}
          onChange={(id) => updateConfig(withDock(config, { systemArea: id as DockSystemAreaMode }))}
        />
      </div>

      {/* 3. Size */}
      <div className="cc-card">
        <div className="cc-label">Size</div>
        <ValueSlider label="Icon size" value={dock.iconSize} min={32} max={54} step={2} unit="px" onChange={(v) => setDock({ iconSize: v })} />
        <ValueSlider label="Hover zoom" value={Math.round(dock.hoverScale * 100)} min={100} max={140} step={2} unit="%" onChange={(v) => setDock({ hoverScale: v / 100 })} />
        <ValueSlider label="Gap from edge" value={dock.groundedMarginBottom} min={0} max={14} unit="px" onChange={(v) => setDock({ groundedMarginBottom: v })} />
      </div>

      {/* 4. Behaviour */}
      <div className="cc-card">
        <Seg
          label="Auto-hide"
          desc="Slides away so it never covers your windows."
          value={dock.autoHide}
          options={[
            { id: "never", label: "Never" },
            { id: "overlap", label: "When covered" },
            { id: "always", label: "Always" },
          ]}
          onChange={(id) => setDock({ autoHide: id })}
        />
        <Toggle
          label="Hide the Windows taskbar"
          desc="Off by default. Lens always brings the taskbar back when it closes, even after a crash."
          on={config.func.hideNativeTaskbar}
          onChange={(v) => updateConfig({ ...config, func: { ...config.func, hideNativeTaskbar: v } })}
        />
        <Toggle label="Live window previews" desc="Hovering a running app shows live pictures of its windows." on={!!dock.livePreviews} onChange={(v) => setDock({ livePreviews: v })} />
        <Toggle label="Lock the Dock" desc="Stops apps being dragged, unpinned or removed by accident." on={!!dock.locked} onChange={(v) => setDock({ locked: v })} />
        <Toggle
          label="Suggest apps you usually open now"
          desc="Learned on this PC from your Dock launches; no AI model and nothing sent anywhere. Shows while Lens AI is on."
          on={!!dock.suggestedApps}
          onChange={(v) => setDock({ suggestedApps: v })}
        />
      </div>
    </>
  );
};
