import React from "react";
import type { LensConfig } from "../types/lens";
import { useStylePick } from "../dock/useStylePick";
import {
  DOCK_STYLES,
  DockScenePreview,
  dockAlignmentOf,
  dockSystemAreaOf,
  withDock,
  type DockAlignment,
  type DockSystemAreaMode,
} from "../dock/styles";
import { ValueSlider } from "./ThemeTab";
import { Section } from "../settings/ui/primitives";
import {
  LAUNCH_CHOICES,
  MAGNIFICATION_CHOICES,
  STYLE_ICON_MAX,
  STYLE_ICON_MIN,
  clearSeparators,
  dockAdvancedSummary,
  dockAdvancedView,
  setAutoClosePopouts,
  setPopoutCloseDelay,
  POPOUT_DELAY_CHOICES,
  setFileDropOpen,
  setLaunchAnimation,
  setMagnification,
  setMagnificationRange,
  setMiddleClickNewInstance,
  setMinimizeFeedback,
  setScrollCyclesWindows,
  setShowLabels,
  setStyleIconSize,
  sharedStyleIconSize,
  toggleSeparatorAfter,
} from "../dock/advanced";
import { dockStyleLabel } from "../dock/styles";

interface Props {
  config: LensConfig;
  accent: string;
  updateConfig: (next: LensConfig) => void;
  /** Section a deep link asked for ("advanced" opens the Advanced section). */
  section?: string;
}

const Seg: React.FC<{
  label: string;
  desc?: string;
  value: string;
  options: { id: string; label: string }[];
  disabled?: boolean;
  onChange: (id: string) => void;
}> = ({ label, desc, value, options, disabled, onChange }) => (
  <div className="tux-row">
    <div className="tux-row-text">
      <div className="cc-label">{label}</div>
      {desc && <div className="cc-desc">{desc}</div>}
    </div>
    <div className="tux-seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button data-weight="light" key={o.id} type="button" role="radio" aria-checked={value === o.id} className={value === o.id ? "active" : ""} disabled={disabled} onClick={() => onChange(o.id)}>
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
    <button data-weight="light" type="button" role="switch" aria-checked={on} aria-label={label} className={`cc-toggle ${on ? "on" : ""}`} onClick={() => onChange(!on)} />
  </div>
);

/** Dock & Top Bar tab, Dock half: style → position → size → auto-hide → system area. */
export const DockTab: React.FC<Props> = ({ config, accent, updateConfig, section }) => {
  const [style, pickStyle] = useStylePick(config, updateConfig);
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
            <button data-weight="light"
              key={d.id}
              type="button"
              role="radio"
              aria-checked={style === d.id}
              data-dock-style={d.id}
              className={`tux-dock-card ${style === d.id ? "active" : ""}`}
              onClick={() => pickStyle(d.id)}
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

      <DockAdvanced config={config} updateConfig={updateConfig} open={section === "advanced"} />
    </>
  );
};

/**
 * 5. Advanced: the Dock settings that already worked but had no row (magnification, launch
 * animation, app names, per-style icon size, dividers…). Closed until asked for. Every click is
 * one helper from src/dock/advanced.ts, so the rows are covered by dockAdvanced.test.ts.
 */
const DockAdvanced: React.FC<{ config: LensConfig; updateConfig: (next: LensConfig) => void; open: boolean }> = ({ config, updateConfig, open }) => {
  const view = dockAdvancedView(config);
  const styleName = dockStyleLabel(view.style);
  const shared = sharedStyleIconSize(config, view.style);
  const otherSizes = view.customSizes.filter((s) => s.style !== view.style);
  const dividers = view.separators.filter((s) => s.on).length;
  return (
    <Section id="advanced" title="Advanced" summary={dockAdvancedSummary(view)} defaultOpen={open} forceOpen={open}>
      <div className="cc-card">
        <Seg
          label="Magnification"
          desc="Icons grow under the pointer."
          value={view.magnification}
          options={MAGNIFICATION_CHOICES}
          onChange={(id) => updateConfig(setMagnification(config, id))}
        />
        {view.magnification !== "off" && (
          <ValueSlider
            label="Magnification reach"
            hint="icons each side"
            value={view.magnificationRange}
            min={1}
            max={4}
            onChange={(v) => updateConfig(setMagnificationRange(config, v))}
          />
        )}
        <Seg
          label="Launch animation"
          desc="What an icon does when you open its app."
          value={view.launchAnimation}
          options={LAUNCH_CHOICES}
          onChange={(id) => updateConfig(setLaunchAnimation(config, id))}
        />
        <Toggle
          label="Minimise pulse"
          desc="An app's icon pulses once when one of its windows is minimised or brought back."
          on={view.minimizeFeedback}
          onChange={(v) => updateConfig(setMinimizeFeedback(config, v))}
        />
      </div>

      <div className="cc-card">
        <Toggle
          label="Show app names"
          desc="Beside the icons on Taskbar and Studio, under them on the other styles."
          on={view.showLabels}
          onChange={(v) => updateConfig(setShowLabels(config, v))}
        />
        <Toggle
          label="Scroll to switch windows"
          desc="Turn the mouse wheel over an app to step through its open windows."
          on={view.scrollCyclesWindows}
          onChange={(v) => updateConfig(setScrollCyclesWindows(config, v))}
        />
        <Toggle
          label="Drop files on apps"
          desc="Drop a file on an app in the Dock to open it with that app."
          on={view.fileDropOpen}
          onChange={(v) => updateConfig(setFileDropOpen(config, v))}
        />
        <Toggle
          label="Middle-click opens a new window"
          desc="Middle-click an app to start another window of it."
          on={view.middleClickNewInstance}
          onChange={(v) => updateConfig(setMiddleClickNewInstance(config, v))}
        />
        <Toggle
          label="Close pop-outs when the pointer leaves"
          desc="Quick Settings and Settings on the Dock close a moment after you move away. Never while the pointer is over them."
          on={view.autoClosePopouts}
          onChange={(v) => updateConfig(setAutoClosePopouts(config, v))}
        />
        <Seg
          label="Close after"
          desc={view.autoClosePopouts ? "How long a pop-out waits once the pointer has left it." : "Turn on closing pop-outs above to choose."}
          value={view.popoutCloseDelay}
          options={POPOUT_DELAY_CHOICES}
          disabled={!view.autoClosePopouts}
          onChange={(id) => updateConfig(setPopoutCloseDelay(config, id))}
        />
      </div>

      <div className="cc-card">
        <div className="tux-row">
          <div className="tux-row-text">
            <div className="cc-label">Icon size for {styleName}</div>
            <div className="cc-desc">
              {view.styleIconSizeIsCustom
                ? `${styleName} keeps its own size. The other styles use the size above.`
                : `${styleName} uses the size above (${shared} px here). Move the slider to give this style its own.`}
            </div>
          </div>
          {view.styleIconSizeIsCustom && (
            <button data-weight="medium" type="button" className="cc-btn-ghost tux-small-btn" onClick={() => updateConfig(setStyleIconSize(config, view.style, null))}>
              Use the shared size
            </button>
          )}
        </div>
        <ValueSlider
          label={`${styleName} icons`}
          value={view.styleIconSize}
          min={STYLE_ICON_MIN}
          max={STYLE_ICON_MAX}
          step={2}
          unit="px"
          onChange={(v) => updateConfig(setStyleIconSize(config, view.style, v))}
        />
        {otherSizes.length > 0 && (
          <div className="tux-row">
            <div className="tux-row-text">
              <div className="cc-label">Other styles with their own size</div>
              <div className="cc-desc">Press one to hand it back to the shared size.</div>
            </div>
            <div className="cc-chip-grid">
              {otherSizes.map((s) => (
                <button data-weight="light" key={s.style} type="button" className="cc-chip" aria-label={`${s.label}: ${s.size} px. Use the shared size`} onClick={() => updateConfig(setStyleIconSize(config, s.style, null))}>
                  {s.label} · {s.size} px
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="cc-card">
        <div className="tux-row">
          <div className="tux-row-text">
            <div className="cc-label">Dividers</div>
            <div className="cc-desc">
              {view.separators.length === 0
                ? "Pin an app to the Dock to put a divider after it."
                : "Pick the apps that get a thin divider after them. Also in each app's right-click menu."}
            </div>
          </div>
          {dividers > 0 && (
            <button data-weight="medium" type="button" className="cc-btn-ghost tux-small-btn" onClick={() => updateConfig(clearSeparators(config))}>
              Remove all
            </button>
          )}
        </div>
        {view.separators.length > 0 && (
          <div className="cc-chip-grid" role="group" aria-label="Divider after">
            {view.separators.map((s) => (
              <button data-weight="light"
                key={s.id}
                type="button"
                role="switch"
                aria-checked={s.on}
                aria-label={`Divider after ${s.name}`}
                className={`cc-chip ${s.on ? "active" : ""}`}
                onClick={() => updateConfig(toggleSeparatorAfter(config, s.id))}
              >
                {s.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </Section>
  );
};
