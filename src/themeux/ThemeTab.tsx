import React, { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ChevronDown, Check, RotateCcw, Pipette } from "lucide-react";
import type { LensConfig, WindowsThemeInfo } from "../types/lens";
import {
  CONTROL_STYLES,
  FOLDER_THEMES,
  FRAME_STYLES,
  allPacks,
  applyThemePack,
  packById,
  recommendedPacks,
  type ThemePack,
} from "../themes/packs";
import { readSchedule } from "../themes/schedule";
import { SHAPE_STYLES, normalizeShapeStyle } from "../themes/shapes/shapes";
import { ColorWheel } from "../components/ColorWheel";
import { ThemeGallery, PackCard } from "../components/ThemeGallery";
import { ThemeScheduleCard } from "../components/ThemeScheduleCard";
import { WallpaperCard } from "../components/WallpaperCard";
import { AmbientPreview, AmbientWallpaperOptions, AnimatedBackdropSwitch, packPalette } from "../playground/ambient/controls";
import { SavedThemesCard } from "../components/SavedThemesCard";
import { ThemeSharingCard } from "../plugins/ThemeSharingCard";
import { AccessibilityCard } from "../components/AccessibilityCard";
import { CursorSuiteCard } from "../components/CursorSuiteCard";
import { DockScenePreview, dockStyleLabel, dockStyleOf, dockAlignmentOf } from "../dock/styles";
import type { WallpaperState } from "../surfaces/wallpaperTypes";

interface Props {
  config: LensConfig;
  winTheme: WindowsThemeInfo;
  updateConfig: (next: LensConfig) => void;
  /** Applies a pack (parent keeps any side state such as the folder-theme picker in sync). */
  onApplyPack: (next: LensConfig) => void;
  onOpenTab: (tab: "dock" | "folders") => void;
}

/* ---------- small shared pieces ---------- */

/** Label on the left, slider in the middle, right-aligned tabular value on the right. */
export const ValueSlider: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
  hint?: string;
}> = ({ label, value, min, max, step = 1, unit = "", onChange, hint }) => {
  const id = `tux-${label.replace(/\W+/g, "-").toLowerCase()}`;
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="tux-slider">
      <label htmlFor={id} className="tux-slider-label">
        {label}
        {hint && <span className="tux-slider-hint">{hint}</span>}
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ "--tux-fill": `${pct}%` } as React.CSSProperties}
      />
      <output htmlFor={id} className="tux-value">
        {value}
        {unit}
      </output>
    </div>
  );
};

function Chips<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { id: T; label: string; swatch?: React.ReactNode }[];
  onChange: (id: T) => void;
}) {
  return (
    <div className="tux-field">
      <div className="tux-field-label">{label}</div>
      <div className="cc-chip-grid" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={value === o.id}
            className={`cc-chip tux-chip ${value === o.id ? "active" : ""}`}
            onClick={() => onChange(o.id)}
          >
            {o.swatch}
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Collapsible "Customise" section: header shows a one-line summary while closed. */
const Section: React.FC<{
  id: string;
  title: string;
  summary: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}> = ({ id, title, summary, open, onToggle, children }) => (
  <div className={`tux-section ${open ? "open" : ""}`}>
    <button
      type="button"
      className="tux-section-head"
      data-cc-section={id}
      aria-expanded={open}
      aria-controls={`tux-sec-${id}`}
      onClick={onToggle}
    >
      <span className="tux-section-title">{title}</span>
      <span className="tux-section-summary">{summary}</span>
      <ChevronDown size={15} className="tux-chevron" aria-hidden />
    </button>
    {open && (
      <div className="tux-section-body" id={`tux-sec-${id}`}>
        {children}
      </div>
    )}
  </div>
);

/* ---------- labels ---------- */

const ICON_THEME_LABEL: Record<string, string> = {
  "obsidian-squircle": "Obsidian",
  "frosted-glass": "Frosted",
  monochrome: "Matte",
  "accent-duotone": "Duotone",
  native: "Full colour",
};
const ICON_SHAPE_LABEL: Record<string, string> = { squircle: "Squircle", rounded: "Rounded", circle: "Circle", borderless: "No backdrop" };
const CONTROL_LABEL: Record<string, string> = {
  "traffic-classic": "Classic",
  "traffic-muted": "Soft",
  "minimal-dots": "Small dots",
  "accent-pills": "Pills",
};
const FONTS = [
  { id: "rounded-arial", label: "Rounded Arial", font: '"Arial Rounded MT Bold", "Arial Rounded", sans-serif' },
  { id: "inter-sans", label: "Modern Sans", font: '"Segoe UI Variable Display", "Inter", system-ui, sans-serif' },
  { id: "tech-mono", label: "Tech Mono", font: '"Cascadia Code", Consolas, monospace' },
  { id: "editorial-serif", label: "Serif", font: "Georgia, Cambria, serif" },
];
const SIZES = [
  { id: "compact", label: "Compact", iconSize: 34, barH: 30, scale: 94 },
  { id: "standard", label: "Standard", iconSize: 40, barH: 34, scale: 100 },
  { id: "spacious", label: "Spacious", iconSize: 46, barH: 38, scale: 106 },
  { id: "large", label: "Large", iconSize: 52, barH: 42, scale: 112 },
];
const ACCENTS_DARK = ["#FAFAFA", "#60A5FA", "#818CF8", "#C084FC", "#F472B6", "#F87171", "#FB923C", "#FBBF24", "#34D399", "#22D3EE"];
const ACCENTS_LIGHT = ["#18181B", "#2563EB", "#4F46E5", "#9333EA", "#DB2777", "#DC2626", "#C2410C", "#B45309", "#047857", "#0E7490"];

const TRAFFIC: Record<string, [string, string, string]> = {
  "traffic-classic": ["#28c840", "#febc2e", "#ff5f57"],
  "traffic-muted": ["#3ec969", "#f0be4a", "#f06761"],
  "minimal-dots": ["#34d399", "#fbbf24", "#fb7185"],
  "accent-pills": ["#22c55e", "#eab308", "#ef4444"],
};

function isLightHex(hex: string): boolean {
  const c = hex.replace("#", "");
  if (c.length !== 6) return false;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b > 160;
}

/* ---------- hero preview ---------- */

const HeroPreview: React.FC<{ config: LensConfig; accent: string; pack?: ThemePack }> = ({ config, accent, pack }) => {
  const wc = config.windowControls;
  const frame = wc.frameStyle ?? "obsidian-hairline";
  const radius = Math.round((config.theme.borderRadius ?? 8) * 0.7);
  const opacity = Math.round((config.theme.glassOpacity ?? 0.96) * 100);
  let dots = TRAFFIC[wc.style] ?? TRAFFIC["traffic-classic"];
  if (wc.order === "red-yellow-green") dots = [dots[2], dots[1], dots[0]];
  const pill = wc.style === "accent-pills";
  const border =
    frame === "none"
      ? "1px solid transparent"
      : frame === "obsidian-hairline" || accent.toUpperCase() === "#FAFAFA"
        ? "1px solid rgb(var(--lens-ink) / 0.18)"
        : `1px solid ${accent}`;
  return (
    <div className="tux-hero-preview" aria-hidden>
      {pack && (
        <AmbientPreview
          packId={pack.id}
          palette={packPalette(pack, accent)}
          style={{ borderRadius: 8, overflow: "hidden" }}
        />
      )}
      <DockScenePreview styleId={dockStyleOf(config)} accent={accent} alignment={dockAlignmentOf(config)} height={136} showWindow={false} />
      <div
        className="tux-hero-window"
        style={{
          borderRadius: radius,
          border,
          background: `color-mix(in srgb, var(--lens-pack-elevated, #18181b) ${opacity}%, transparent)`,
          boxShadow: frame === "neon" ? `0 0 10px ${accent}88` : "0 6px 16px rgb(0 0 0 / 0.3)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ width: 44, height: 4, borderRadius: 2, background: "rgb(var(--lens-ink) / 0.5)" }} />
          {wc.enabled ? (
            <span style={{ display: "flex", gap: 3 }}>
              {dots.map((c, i) => (
                <span key={i} style={{ width: pill ? 10 : 6, height: pill ? 5 : 6, borderRadius: 3, background: c }} />
              ))}
            </span>
          ) : (
            <span style={{ fontSize: 8, letterSpacing: "0.1em", color: "var(--lens-fg-secondary)" }}>— ❐ ×</span>
          )}
        </div>
        <span style={{ width: "70%", height: 4, borderRadius: 2, background: "var(--lens-fg)", opacity: 0.85 }} />
        <span style={{ width: "48%", height: 4, borderRadius: 2, background: "rgb(var(--lens-ink) / 0.3)" }} />
        <span style={{ display: "flex", gap: 4, marginTop: 2 }}>
          <span style={{ width: 28, height: 8, borderRadius: Math.min(4, radius), background: accent }} />
          <span style={{ width: 22, height: 8, borderRadius: Math.min(4, radius), border: "1px solid rgb(var(--lens-ink) / 0.25)" }} />
        </span>
      </div>
    </div>
  );
};

/* ---------- the tab ---------- */

type Appearance = "dark" | "light" | "auto";

export const ThemeTab: React.FC<Props> = ({ config, winTheme, updateConfig, onApplyPack, onOpenTab }) => {
  const [browseAll, setBrowseAll] = useState(false);
  const [alsoDock, setAlsoDock] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [wheelOpen, setWheelOpen] = useState(false);
  const [wallpaper, setWallpaper] = useState<WallpaperState | null>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const pack = packById(config.theme.preset);
  const light = pack?.scheme === "light";
  const accent = config.theme.accentMode === "custom" ? config.theme.customAccent : winTheme.accentHex;
  const schedule = readSchedule(config);
  const appearance: Appearance = schedule.enabled ? "auto" : light ? "light" : "dark";
  const total = allPacks().length;
  const recommended = recommendedPacks();

  useEffect(() => {
    invoke<WallpaperState>("get_wallpaper_state_cmd").then(setWallpaper).catch(() => {});
  }, [open.wallpaper]);

  // Close the accent popover on Escape or a click outside it.
  useEffect(() => {
    if (!wheelOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setWheelOpen(false);
    const onDown = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setWheelOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [wheelOpen]);

  const apply = (packId: string) => onApplyPack(applyThemePack(config, packId, { applyDockStyle: alsoDock }));

  const setTheme = (patch: Partial<LensConfig["theme"]>) => updateConfig({ ...config, theme: { ...config.theme, ...patch } });

  // Light / Dark / Auto: switch between the user's light and dark packs, remembering the one they leave.
  const setAppearance = (next: Appearance) => {
    const current = config.theme.preset;
    const isLightPack = (id: string) => packById(id)?.scheme === "light";
    const dayPack = isLightPack(current) ? current : isLightPack(schedule.dayPack) ? schedule.dayPack : "alabaster-daylight";
    const nightPack = !isLightPack(current) && packById(current) ? current : !isLightPack(schedule.nightPack) ? schedule.nightPack : "obsidian";
    const sched = { ...schedule, dayPack, nightPack, enabled: next === "auto" };
    let out: LensConfig = { ...config, themeSchedule: sched };
    if (next === "light" && !isLightPack(current)) out = applyThemePack(out, dayPack);
    if (next === "dark" && isLightPack(current)) out = applyThemePack(out, nightPack);
    onApplyPack(out);
  };

  const modified =
    !!pack &&
    ((pack.accentMode === "custom" && (config.theme.accentMode !== "custom" || config.theme.customAccent.toUpperCase() !== pack.accent.toUpperCase())) ||
      (pack.accentMode === "windows" && config.theme.accentMode !== "windows") ||
      config.theme.borderRadius !== pack.radius ||
      (config.iconStyle?.theme ?? "") !== pack.iconTheme ||
      (config.windowControls.frameStyle ?? "") !== pack.frameStyle);

  const swatches = light ? ACCENTS_LIGHT : ACCENTS_DARK;
  const accentIsSwatch = config.theme.accentMode === "custom" && swatches.includes(config.theme.customAccent.toUpperCase());

  const toggle = (id: string) => setOpen((o) => ({ ...o, [id]: !o[id] }));

  const wc = config.windowControls;
  const orderLabel = !wc.enabled ? "Windows buttons" : wc.order === "red-yellow-green" ? "R·Y·G" : "G·Y·R";
  const frameLabel = FRAME_STYLES.find((f) => f.id === wc.frameStyle)?.label ?? "Hairline";
  const folderLabel = FOLDER_THEMES.find((f) => f.id === (config.folderStyle?.theme ?? "accent"))?.label ?? "Accent";
  const shapeStyle = normalizeShapeStyle(config.theme.shapeStyle);
  const shapeLabel = SHAPE_STYLES.find((st) => st.id === shapeStyle)?.label ?? "Classic";
  const fontLabel = FONTS.find((f) => f.id === (config.theme.fontFamily ?? "rounded-arial"))?.label ?? "Rounded Arial";
  const sizeLabel = SIZES.find((s) => s.scale === (config.theme.uiScale ?? 100))?.label;
  const t = config.theme as LensConfig["theme"] & { motion?: string; contrast?: string; locale?: string };
  const MOTION_LABEL: Record<string, string> = { system: "Follow Windows", reduce: "Reduced", full: "Full" };
  const motionLabel = MOTION_LABEL[t.motion ?? "system"] ?? "Follow Windows";
  const contrastLabel = t.contrast === "high" ? "High contrast" : "Standard contrast";
  const ws = wallpaper?.settings;
  const wallpaperSummary = !wallpaper
    ? "Lens wallpaper and accent from wallpaper"
    : ws?.enabled && wallpaper.path
      ? `On · ${wallpaper.path.split(/[\\/]/).pop()} · ${ws.fit}`
      : "Off · using your Windows wallpaper";

  const noFrameColours = !!winTheme.osFeatures && !winTheme.osFeatures.frameColors;

  return (
    <>
      {noFrameColours && (
        <div className="cc-card" role="note">
          <div className="cc-label">
            {winTheme.osFamily === "windows" ? "Running on Windows 10" : "Running outside Windows"}
          </div>
          <div className="cc-desc">
            {winTheme.osFamily === "windows"
              ? "Lens runs on Windows 10. App titlebars follow dark mode, but window frame colours, rounded corners and glass need Windows 11, so those options are switched off."
              : "The Lens interface runs here, but desktop integration (Dock windows, system controls, window styling) is Windows-only for now. Linux and macOS support are on the roadmap."}
          </div>
        </div>
      )}
      {/* ===== a. Current theme ===== */}
      <section className="cc-card tux-hero" aria-label="Current theme">
        <div className="tux-hero-top">
          <HeroPreview config={config} accent={accent} pack={pack} />
          <div className="tux-hero-info">
            <div className="tux-eyebrow">Current theme</div>
            <div className="tux-hero-name">
              {pack?.label ?? "Custom"}
              {modified && <span className="tux-badge muted">Edited</span>}
            </div>
            <div className="cc-desc">{pack?.description ?? "Your own mix of colours and styles."}</div>
            <div className="tux-hero-facts">
              <span>{light ? "Light" : "Dark"}</span>
              <span>{dockStyleLabel(dockStyleOf(config))} dock</span>
              <span>{ICON_THEME_LABEL[config.iconStyle?.theme ?? ""] ?? "Obsidian"} icons</span>
            </div>
            <div className="tux-appearance">
              <div className="tux-seg" role="radiogroup" aria-label="Appearance">
                {(["dark", "light", "auto"] as Appearance[]).map((a) => (
                  <button key={a} type="button" role="radio" aria-checked={appearance === a} className={appearance === a ? "active" : ""} onClick={() => setAppearance(a)}>
                    {a === "dark" ? "Dark" : a === "light" ? "Light" : "Auto"}
                  </button>
                ))}
              </div>
              {appearance === "auto" && (
                <div className="tux-help">
                  {packById(schedule.dayPack)?.label ?? "Light"} by day, {packById(schedule.nightPack)?.label ?? "Dark"} at night. Times are under Schedule.
                </div>
              )}
            </div>
            <AnimatedBackdropSwitch />
            {modified && pack && (
              <button type="button" className="cc-btn-ghost tux-small-btn" onClick={() => onApplyPack(applyThemePack(config, pack.id))}>
                <RotateCcw size={12} /> Reset to {pack.label}
              </button>
            )}
          </div>
        </div>

        <div className="tux-hero-controls">
          <div className="tux-field">
            <div className="tux-field-label">Accent colour</div>
            <div className="tux-swatches" role="radiogroup" aria-label="Accent colour">
              <button
                type="button"
                role="radio"
                aria-checked={config.theme.accentMode === "windows"}
                aria-label={`Windows accent ${winTheme.accentHex}`}
                className={`tux-swatch tux-swatch-win ${config.theme.accentMode === "windows" ? "active" : ""}`}
                style={{ background: winTheme.accentHex }}
                onClick={() => setTheme({ accentMode: "windows" })}
              >
                <span>Win</span>
              </button>
              {swatches.map((hex) => {
                const on = config.theme.accentMode === "custom" && config.theme.customAccent.toUpperCase() === hex;
                return (
                  <button
                    key={hex}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    aria-label={`Accent ${hex}`}
                    className={`tux-swatch ${on ? "active" : ""}`}
                    style={{ background: hex }}
                    onClick={() => setTheme({ accentMode: "custom", customAccent: hex })}
                  >
                    {on && <Check size={12} strokeWidth={3} color={isLightHex(hex) ? "#18181B" : "#FFFFFF"} />}
                  </button>
                );
              })}
              <div className="tux-pop-anchor" ref={popRef}>
                <button
                  type="button"
                  aria-haspopup="dialog"
                  aria-expanded={wheelOpen}
                  aria-label="Custom accent colour"
                  className={`tux-swatch tux-swatch-more ${!accentIsSwatch && config.theme.accentMode === "custom" ? "active" : ""}`}
                  style={!accentIsSwatch && config.theme.accentMode === "custom" ? { background: config.theme.customAccent } : undefined}
                  onClick={() => setWheelOpen((v) => !v)}
                >
                  <Pipette size={12} />
                </button>
                {wheelOpen && (
                  <div className="tux-popover" role="dialog" aria-label="Pick any accent colour">
                    <ColorWheel
                      value={accent}
                      windowsAccentHex={winTheme.accentHex}
                      accentMode={config.theme.accentMode}
                      onSelectColor={(hex) => setTheme({ accentMode: "custom", customAccent: hex })}
                      onSelectWindowsLive={() => setTheme({ accentMode: "windows" })}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="tux-sliders">
            <ValueSlider label="Glass opacity" value={Math.round(config.theme.glassOpacity * 100)} min={40} max={100} unit="%" onChange={(v) => setTheme({ glassOpacity: v / 100 })} />
            <ValueSlider label="Roundness" value={config.theme.borderRadius} min={0} max={20} unit="px" onChange={(v) => setTheme({ borderRadius: v })} />
            <ValueSlider label="Glass blur" value={config.theme.blurPx} min={0} max={40} step={2} unit="px" onChange={(v) => setTheme({ blurPx: v })} />
            <ValueSlider
              label="Accent tint"
              hint="on surfaces"
              value={Math.round(config.theme.accentTintStrength * 100)}
              min={0}
              max={50}
              unit="%"
              onChange={(v) => setTheme({ accentTintStrength: v / 100 })}
            />
          </div>
        </div>
      </section>

      {/* ===== b. Choose a theme ===== */}
      <section className="tux-block" aria-label="Choose a theme">
        <div className="tux-block-head">
          <div className="tux-h2">Choose a theme</div>
          <button type="button" className="cc-btn-ghost tux-small-btn" data-browse-all aria-expanded={browseAll} onClick={() => setBrowseAll((v) => !v)}>
            {browseAll ? "Show recommended" : `Browse all ${total}`}
          </button>
        </div>
        {browseAll ? (
          <ThemeGallery config={config} onApply={apply} windowsAccent={winTheme.accentHex} onClose={() => setBrowseAll(false)} />
        ) : (
          <div className="tux-rec-row">
            {recommended.map((p) => (
              <PackCard
                key={p.id}
                pack={p}
                size="small"
                active={config.theme.preset === p.id}
                accent={p.accentMode === "windows" ? winTheme.accentHex : p.accent}
                onApply={apply}
              />
            ))}
          </div>
        )}
        <label className="tux-check">
          <input type="checkbox" checked={alsoDock} onChange={(e) => setAlsoDock(e.target.checked)} />
          <span>
            Also change Dock style
            <span className="tux-help"> Each theme has a matching Dock. Off keeps your current Dock ({dockStyleLabel(dockStyleOf(config))}).</span>
          </span>
        </label>
      </section>

      {/* ===== c. Customise ===== */}
      <section className="tux-block" aria-label="Customise">
        <div className="tux-block-head">
          <div className="tux-h2">Customise</div>
        </div>
        <div className="tux-sections">
          <Section id="frames" title="Window frames & buttons" summary={`${frameLabel} frame · ${CONTROL_LABEL[wc.style] ?? "Classic"} buttons · ${orderLabel}`} open={!!open.frames} onToggle={() => toggle("frames")}>
            <div
              style={noFrameColours ? { opacity: 0.45, pointerEvents: "none" } : undefined}
              aria-disabled={noFrameColours || undefined}
            >
              <Chips
                label={noFrameColours ? "Frame (needs Windows 11)" : "Frame"}
                value={wc.frameStyle ?? "obsidian-hairline"}
                options={FRAME_STYLES.map((f) => ({ id: f.id, label: f.label }))}
                onChange={(id) => updateConfig({ ...config, windowControls: { ...wc, frameStyle: id, frameBorderEnabled: id !== "none" } })}
              />
            </div>
            <Chips
              label="Button style"
              value={wc.style}
              options={CONTROL_STYLES.map((id) => ({
                id,
                label: CONTROL_LABEL[id] ?? id,
                swatch: (
                  <span className="tux-dots" aria-hidden>
                    {(TRAFFIC[id] ?? TRAFFIC["traffic-classic"]).map((c, i) => (
                      <span key={i} style={{ background: c, width: id === "accent-pills" ? 9 : 7, height: id === "minimal-dots" ? 5 : 7 }} />
                    ))}
                  </span>
                ),
              }))}
              onChange={(id) => updateConfig({ ...config, windowControls: { ...wc, style: id, enabled: true } })}
            />
            <Chips
              label="Button order"
              value={!wc.enabled ? "native" : wc.order === "red-yellow-green" ? "ryg" : "gyr"}
              options={[
                { id: "gyr", label: "Green · Yellow · Red" },
                { id: "ryg", label: "Red · Yellow · Green" },
                { id: "native", label: "Windows default" },
              ]}
              onChange={(id) =>
                updateConfig({
                  ...config,
                  windowControls:
                    id === "native" ? { ...wc, enabled: false } : { ...wc, enabled: true, order: id === "ryg" ? "red-yellow-green" : "green-yellow-red" },
                })
              }
            />
          </Section>

          <Section
            id="icons"
            title="Icons & folders"
            summary={`${ICON_THEME_LABEL[config.iconStyle?.theme ?? ""] ?? "Obsidian"} · ${ICON_SHAPE_LABEL[config.iconStyle?.shape ?? "squircle"]} · ${folderLabel} folders`}
            open={!!open.icons}
            onToggle={() => toggle("icons")}
          >
            <Chips
              label="Icon backdrop"
              value={config.iconStyle?.theme ?? "obsidian-squircle"}
              options={Object.entries(ICON_THEME_LABEL).map(([id, label]) => ({ id, label }))}
              onChange={(id) => updateConfig({ ...config, iconStyle: { theme: id, shape: config.iconStyle?.shape ?? "squircle" } })}
            />
            <Chips
              label="Icon shape"
              value={config.iconStyle?.shape ?? "squircle"}
              options={Object.entries(ICON_SHAPE_LABEL).map(([id, label]) => ({
                id,
                label,
                swatch: (
                  <span
                    aria-hidden
                    className="tux-shape"
                    style={{ borderRadius: id === "circle" ? 99 : id === "rounded" ? 3 : 5, borderStyle: id === "borderless" ? "dashed" : "solid" }}
                  />
                ),
              }))}
              onChange={(id) => updateConfig({ ...config, iconStyle: { theme: config.iconStyle?.theme ?? "obsidian-squircle", shape: id } })}
            />
            <Chips
              label="Dock folder colour"
              value={config.folderStyle?.theme ?? "accent"}
              options={FOLDER_THEMES.map((f) => ({ id: f.id, label: f.label }))}
              onChange={(id) =>
                updateConfig({
                  ...config,
                  folderStyle: { ...(config.folderStyle ?? { theme: "accent", globalExplorerOverride: false }), theme: id },
                  dock: { ...config.dock, pinnedFolders: config.dock.pinnedFolders.map((f) => ({ ...f, theme: id })) },
                })
              }
            />
            <div className="tux-help">
              Folders in File Explorer are styled separately.{" "}
              <button type="button" className="tux-link" onClick={() => onOpenTab("folders")}>
                Open Folder Icons
              </button>
            </div>
          </Section>

          <Section
            id="shapes"
            title="Shape style"
            summary={`${shapeLabel} · ${SHAPE_STYLES.find((st) => st.id === shapeStyle)?.description ?? ""}`}
            open={!!open.shapes}
            onToggle={() => toggle("shapes")}
          >
            <Chips
              label="Shape style"
              value={shapeStyle}
              options={SHAPE_STYLES.map((st) => ({ id: st.id, label: st.label }))}
              onChange={(id) => setTheme({ shapeStyle: id })}
            />
            <div className="tux-help">Works with every theme: colours always come from the theme you picked above.</div>
          </Section>

          <Section
            id="fonts"
            title="Fonts & scale"
            summary={`${fontLabel} · ${config.theme.uiScale ?? 100}%${sizeLabel ? ` (${sizeLabel})` : ""}`}
            open={!!open.fonts}
            onToggle={() => toggle("fonts")}
          >
            <Chips
              label="Font"
              value={config.theme.fontFamily ?? "rounded-arial"}
              options={FONTS.map((f) => ({ id: f.id, label: f.label, swatch: <span style={{ fontFamily: f.font, fontWeight: 700 }}>Aa</span> }))}
              onChange={(id) => setTheme({ fontFamily: id })}
            />
            <Chips
              label="Overall size"
              value={SIZES.find((s) => s.scale === (config.theme.uiScale ?? 100))?.id ?? ""}
              options={SIZES.map((s) => ({ id: s.id, label: `${s.label} ${s.scale}%` }))}
              onChange={(id) => {
                const s = SIZES.find((x) => x.id === id)!;
                updateConfig({ ...config, theme: { ...config.theme, uiScale: s.scale }, dock: { ...config.dock, iconSize: s.iconSize }, topBar: { ...config.topBar, height: s.barH } });
              }}
            />
            <div className="tux-help">Overall size also sets Dock icon size and Top Bar height. Fine-tune them in Dock &amp; Bar.</div>
            <ValueSlider label="Text and panel scale" value={config.theme.uiScale ?? 100} min={90} max={125} unit="%" onChange={(v) => setTheme({ uiScale: v })} />
          </Section>

          <Section
            id="schedule"
            title="Schedule"
            summary={
              schedule.enabled
                ? `${packById(schedule.dayPack)?.label ?? schedule.dayPack} by day · ${packById(schedule.nightPack)?.label ?? schedule.nightPack} at night · ${schedule.mode === "sun" ? "sunrise/sunset" : `${schedule.dayStart}–${schedule.nightStart}`}`
                : "Off · one theme all day"
            }
            open={!!open.schedule}
            onToggle={() => toggle("schedule")}
          >
            <ThemeScheduleCard config={config} onUpdateConfig={updateConfig} />
          </Section>

          <Section id="wallpaper" title="Wallpaper" summary={wallpaperSummary} open={!!open.wallpaper} onToggle={() => toggle("wallpaper")}>
            <AmbientWallpaperOptions />
            <WallpaperCard config={config} onUpdateConfig={updateConfig} />
          </Section>

          <Section id="a11y" title="Accessibility" summary={`Motion: ${motionLabel} · ${contrastLabel}`} open={!!open.a11y} onToggle={() => toggle("a11y")}>
            <AccessibilityCard config={config} onUpdateConfig={updateConfig} />
          </Section>

          <Section id="pointer" title="Mouse pointer" summary="Pointer look, behaviour and effects" open={!!open.pointer} onToggle={() => toggle("pointer")}>
            <CursorSuiteCard config={config} />
          </Section>

          <Section id="saved" title="Saved & shared themes" summary="Save, export and import .lenstheme files" open={!!open.saved} onToggle={() => toggle("saved")}>
            <SavedThemesCard config={config} onUpdateConfig={updateConfig} />
            <ThemeSharingCard config={config} onUpdateConfig={updateConfig} />
          </Section>
        </div>
      </section>
    </>
  );
};
