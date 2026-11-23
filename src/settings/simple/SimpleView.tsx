// Simple mode (docs/SETTINGS_SIMPLE.md, concept B): a page opens on a few visual cards for the
// settings people use most. Everything else on the page is under "More options" (MoreOptions.tsx),
// which expands in place. Each card shows what it changes: a real pack preview, a real mini Dock,
// the actual window-button dots, an illustration of the corner or drag.
import React from "react";
import { invoke } from "@tauri-apps/api/core";
import type { LensConfig, WindowsThemeInfo } from "../../types/lens";
import { applyThemePack, packById, recommendedPacks } from "../../themes/packs";
import { readSchedule } from "../../themes/schedule";
import { PackCard } from "../../components/ThemeGallery";
import { DOCK_STYLES, DockScenePreview, dockStyleOf, dockAlignmentOf, withDock } from "../../dock/styles";
import { DEFAULT_AI_CONFIG } from "../../ai/contract";
import { Segmented, Toggle } from "../../ui";
import { useStartupBlock } from "../../hooks/useStartupBlock";
import type { PageId } from "../registry";
import "./simple.css";

const ACCENTS_DARK = ["#FAFAFA", "#60A5FA", "#818CF8", "#C084FC", "#F472B6", "#F87171", "#FB923C", "#34D399"];
const ACCENTS_LIGHT = ["#18181B", "#2563EB", "#4F46E5", "#9333EA", "#DB2777", "#DC2626", "#C2410C", "#047857"];

const ORDERS = [
  { id: "yellow-green-red", label: "Windows order", dots: ["y", "g", "r"] },
  { id: "green-yellow-red", label: "Green first", dots: ["g", "y", "r"] },
  { id: "red-yellow-green", label: "Mac order", dots: ["r", "y", "g"] },
] as const;

export interface SimpleProps {
  page: PageId;
  config: LensConfig;
  winTheme: WindowsThemeInfo;
  accent: string;
  updateConfig: (c: LensConfig) => void;
  /** Applies a whole new config produced by a theme change (keeps folder styling in step). */
  onApplyConfig: (c: LensConfig) => void;
  /** Opens "More options" at a section. */
  onMore: (section?: string) => void;
}

/** A card with a title, a one-line explainer and its visual control. */
const Card: React.FC<{ title: string; desc?: string; wide?: boolean; children: React.ReactNode; className?: string }> = ({
  title,
  desc,
  wide,
  children,
  className,
}) => (
  <section className={`ss-card ${wide ? "wide" : ""} ${className ?? ""}`}>
    <div className="ss-card-head">
      <h3 className="ss-card-title">{title}</h3>
      {desc && <p className="ss-card-desc">{desc}</p>}
    </div>
    {children}
  </section>
);

const Appearance: React.FC<SimpleProps> = ({ config, winTheme, onApplyConfig, updateConfig, onMore }) => {
  const pack = packById(config.theme.preset);
  const light = pack?.scheme === "light";
  const schedule = readSchedule(config);
  const appearance = schedule.enabled ? "auto" : light ? "light" : "dark";
  const packs = recommendedPacks().slice(0, 8);
  const swatches = light ? ACCENTS_LIGHT : ACCENTS_DARK;

  const setAppearance = (next: "light" | "dark" | "auto") => {
    const current = config.theme.preset;
    const isLight = (id: string) => packById(id)?.scheme === "light";
    const dayPack = isLight(current) ? current : isLight(schedule.dayPack) ? schedule.dayPack : "alabaster-daylight";
    const nightPack = !isLight(current) && packById(current) ? current : !isLight(schedule.nightPack) ? schedule.nightPack : "obsidian";
    let out: LensConfig = { ...config, themeSchedule: { ...schedule, dayPack, nightPack, enabled: next === "auto" } };
    if (next === "light" && !isLight(current)) out = applyThemePack(out, dayPack);
    if (next === "dark" && isLight(current)) out = applyThemePack(out, nightPack);
    onApplyConfig(out);
  };

  return (
    <div className="ss-grid">
      <Card title="Theme" desc="Restyles the Dock, the top bar, Settings and app frames." wide>
        <div className="ss-packs" role="radiogroup" aria-label="Theme">
          {packs.map((p) => (
            <PackCard
              key={p.id}
              pack={p}
              size="small"
              meta={false}
              active={config.theme.preset === p.id}
              accent={p.accentMode === "windows" ? winTheme.accentHex : p.accent}
              onApply={(id) => onApplyConfig(applyThemePack(config, id))}
            />
          ))}
        </div>
        <button type="button" className="ss-link" onClick={() => onMore("choose")}>
          All themes ›
        </button>
      </Card>
      <Card title="Light or dark" desc={appearance === "auto" ? "Follows sunrise and sunset." : "Switches between your light and dark themes."}>
        <Segmented
          label="Light or dark"
          value={appearance}
          options={[
            { id: "light", label: "Light" },
            { id: "dark", label: "Dark" },
            { id: "auto", label: "Auto" },
          ]}
          onChange={setAppearance}
        />
      </Card>
      <Card title="Accent" desc="The colour of highlights, toggles and focus.">
        <div className="ss-swatches" role="radiogroup" aria-label="Accent colour">
          {swatches.map((hex) => {
            const on = config.theme.accentMode === "custom" && config.theme.customAccent.toUpperCase() === hex;
            return (
              <button
                key={hex}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={`Accent ${hex}`}
                className={`ss-swatch ${on ? "on" : ""}`}
                data-hex={hex}
                ref={(el) => el?.style.setProperty("--sw", hex)}
                onClick={() => updateConfig({ ...config, theme: { ...config.theme, accentMode: "custom", customAccent: hex } })}
              />
            );
          })}
        </div>
      </Card>
      <Card title="Living wallpaper" desc="Animated backdrops, the real sky, or your own gradient.">
        <button type="button" className="ss-living" onClick={() => onMore("creator")}>
          <span className="ss-living-art" aria-hidden />
          <span className="ss-living-label">Choose a living wallpaper ›</span>
        </button>
      </Card>
    </div>
  );
};

const Dock: React.FC<SimpleProps> = ({ config, accent, updateConfig }) => {
  const style = dockStyleOf(config);
  const alignment = dockAlignmentOf(config);
  const dock = config.dock;
  const setDock = (patch: Partial<LensConfig["dock"]>) => updateConfig({ ...config, dock: { ...dock, ...patch } });
  const styles = DOCK_STYLES.slice(0, 6);
  return (
    <div className="ss-grid">
      <Card title="Dock style" desc="Each one is the real Dock, shown small." wide>
        <div className="ss-docks" role="radiogroup" aria-label="Dock style">
          {styles.map((d) => (
            <button
              key={d.id}
              type="button"
              role="radio"
              aria-checked={style === d.id}
              className={`ss-dock ${style === d.id ? "on" : ""}`}
              onClick={() => updateConfig(withDock({ ...config, dock: { ...dock, iconSize: d.recommendedIconSize } }, { style: d.id }))}
            >
              <DockScenePreview styleId={d.id} accent={accent} alignment={alignment} height={52} />
              <span className="ss-dock-name">{d.label}</span>
            </button>
          ))}
        </div>
      </Card>
      <Card title="Size" desc={`${dock.iconSize} px icons`}>
        <div className="ss-size">
          <input
            type="range"
            min={32}
            max={54}
            step={2}
            value={dock.iconSize}
            aria-label="Dock icon size"
            onChange={(e) => setDock({ iconSize: Number(e.target.value) })}
          />
          <div className="ss-size-demo" aria-hidden>
            {[0, 1, 2].map((i) => (
              <span key={i} className="ss-size-icon" ref={(el) => el?.style.setProperty("--k", String(dock.iconSize / 40))} />
            ))}
          </div>
        </div>
      </Card>
      <Card title="Auto-hide" desc="Slides away so it never covers your windows.">
        <div className={`ss-autohide ah-${dock.autoHide}`} aria-hidden>
          <span className="ss-ah-win" />
          <span className="ss-ah-dock" />
        </div>
        <Segmented
          label="Dock auto-hide"
          value={(dock.autoHide as "never" | "overlap" | "always") ?? "never"}
          options={[
            { id: "never", label: "Never" },
            { id: "overlap", label: "When covered" },
            { id: "always", label: "Always" },
          ]}
          onChange={(v) => setDock({ autoHide: v })}
        />
      </Card>
      <Card title="Screen edge" desc="Where the Dock sits.">
        <div className="ss-edges" role="radiogroup" aria-label="Screen edge">
          {(["bottom", "left", "right", "top"] as const).map((e) => (
            <button
              key={e}
              type="button"
              role="radio"
              aria-checked={(dock.position ?? "bottom") === e}
              aria-label={e}
              className={`ss-edge edge-${e} ${(dock.position ?? "bottom") === e ? "on" : ""}`}
              onClick={() => setDock({ position: e })}
            >
              <span className="ss-edge-bar" />
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
};

const Keys: React.FC<SimpleProps> = ({ config, updateConfig }) => {
  const startupBlock = useStartupBlock();
  const wc = config.windowControls;
  const order = wc.order === "green-yellow-red" || wc.order === "red-yellow-green" ? wc.order : "yellow-green-red";
  const corners = config.hotCorners;
  const drag = config.altDrag;
  return (
    <div className="ss-grid">
      <Card title="Window buttons" desc="The minimise, maximise and close buttons Lens draws on windows." wide>
        <div className="ss-orders" role="radiogroup" aria-label="Window button order">
          {ORDERS.map((o) => (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={wc.enabled && order === o.id}
              className={`ss-order ${wc.enabled && order === o.id ? "on" : ""}`}
              onClick={() => updateConfig({ ...config, windowControls: { ...wc, enabled: true, order: o.id } })}
            >
              <span className="ss-dots" aria-hidden>
                {o.dots.map((d, i) => (
                  <span key={i} className={`ss-dot ${d}`} />
                ))}
              </span>
              <span>{o.label}</span>
            </button>
          ))}
          <button
            type="button"
            role="radio"
            aria-checked={!wc.enabled}
            className={`ss-order ${!wc.enabled ? "on" : ""}`}
            onClick={() => updateConfig({ ...config, windowControls: { ...wc, enabled: false } })}
          >
            <span className="ss-dots native" aria-hidden>
              <span>–</span>
              <span>□</span>
              <span>×</span>
            </span>
            <span>Windows buttons</span>
          </button>
        </div>
      </Card>
      <Card title="Start with Windows" desc={startupBlock ?? "Lens starts when you sign in."}>
        <Toggle
          label="Start Lens with Windows"
          checked={!!config.func.runOnStartup}
          disabled={!!startupBlock && !config.func.runOnStartup}
          onChange={(v) => updateConfig({ ...config, func: { ...config.func, runOnStartup: v } })}
        />
      </Card>
      <Card title="Hot corners" desc="Push the pointer into a corner to show all windows.">
        <div className="ss-corner" aria-hidden>
          <span className="ss-corner-dot" />
        </div>
        <Toggle
          label="Hot corners"
          checked={!!corners?.enabled}
          disabled={!corners}
          onChange={(v) => corners && updateConfig({ ...config, hotCorners: { ...corners, enabled: v } })}
        />
      </Card>
      <Card title="Alt + drag" desc="Hold Alt and drag anywhere in a window to move it.">
        <div className="ss-altdrag" aria-hidden>
          <span className="ss-ad-win" />
          <span className="ss-ad-key">Alt</span>
        </div>
        <Toggle
          label="Alt + drag to move windows"
          checked={!!drag?.enabled}
          disabled={!drag}
          onChange={(v) => drag && updateConfig({ ...config, altDrag: { ...drag, enabled: v } })}
        />
      </Card>
    </div>
  );
};

const Ai: React.FC<SimpleProps> = ({ config, updateConfig, onMore }) => {
  const ai = { ...DEFAULT_AI_CONFIG, ...(config.ai ?? {}) };
  const setAi = (patch: Partial<typeof ai>) => updateConfig({ ...config, ai: { ...ai, ...patch } });
  const cmdOn = !!config.command?.enabled;
  const engines = [
    { id: "script", label: "Offline", desc: "Instant, no model" },
    { id: "local", label: "On this PC", desc: "Ollama, LM Studio" },
    { id: "claude", label: "Claude", desc: "Smartest, asks first" },
  ] as const;
  return (
    <div className="ss-grid">
      <Card title="Lens assistant" desc="Off until you turn it on. Risky actions always ask for your OK." wide>
        <Toggle label="Turn on the Lens assistant" checked={ai.enabled} onChange={(v) => setAi({ enabled: v })} />
        <div className="ss-engines" role="radiogroup" aria-label="Assistant engine">
          {engines.map((e) => (
            <button
              key={e.id}
              type="button"
              role="radio"
              aria-checked={ai.provider === e.id}
              disabled={!ai.enabled}
              className={`ss-engine eng-${e.id} ${ai.provider === e.id ? "on" : ""}`}
              onClick={() => setAi({ provider: e.id })}
            >
              <span className="ss-engine-art" aria-hidden />
              <span className="ss-engine-name">{e.label}</span>
              <span className="ss-engine-desc">{e.desc}</span>
            </button>
          ))}
        </div>
        {ai.provider === "claude" && (
          <button type="button" className="ss-link" onClick={() => onMore("engine")}>
            Connect Claude ›
          </button>
        )}
      </Card>
      <Card title="Lens Command" desc="One box to launch, ask and run actions.">
        <div className="ss-command" aria-hidden>
          <span className="ss-cmd-bar">Ask or search…</span>
        </div>
        <Toggle
          label="Lens Command"
          checked={cmdOn}
          onChange={(v) => updateConfig({ ...config, command: { ...(config.command ?? {}), enabled: v } })}
        />
      </Card>
      <Card title="Magic right-click" desc="Ctrl + Alt + right-click anything for summaries, transcripts and more.">
        <div className="ss-magic" aria-hidden>
          <span className="ss-magic-menu">
            <span />
            <span />
            <span />
          </span>
        </div>
        <button type="button" className="ss-link" onClick={() => onMore("magic")}>
          Set it up ›
        </button>
      </Card>
      <Card title="Voice" desc="Hold to talk, or say “Lens…”.">
        <button type="button" className="ss-link" onClick={() => invoke("toggle_surface", { label: "palette" }).catch(() => onMore("voice"))}>
          Try the assistant ›
        </button>
        <button type="button" className="ss-link" onClick={() => onMore("voice")}>
          Voice settings ›
        </button>
      </Card>
    </div>
  );
};

const VIEWS: Partial<Record<PageId, React.FC<SimpleProps>>> = { appearance: Appearance, dock: Dock, keys: Keys, ai: Ai };

export const SimpleView: React.FC<SimpleProps> = (props) => {
  const View = VIEWS[props.page];
  return View ? (
    <div className="ss-view" data-simple-page={props.page}>
      <View {...props} />
    </div>
  ) : null;
};
