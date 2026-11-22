import React, { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Sparkles,
  Palette,
  Shapes,
  Monitor,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  Droplets,
  Square,
  Folder,
} from "lucide-react";
import { LensConfig, WindowsThemeInfo } from "../types/lens";
import { ColorWheel } from "./ColorWheel";
import { PillFillBar } from "./PillFillBar";

interface SetupWizardProps {
  config: LensConfig;
  winTheme: WindowsThemeInfo;
  onUpdateConfig: (next: LensConfig) => void;
  onApplyMasterTheme: (id: "obsidian" | "windows-mesh" | "stealth" | "midnight-neon") => void;
  onFinish: () => void;
}

const STEPS = [
  { id: 0, title: "Visual Theme", icon: <Sparkles size={14} /> },
  { id: 1, title: "Color & Glass", icon: <Palette size={14} /> },
  { id: 2, title: "Icons & Folders", icon: <Shapes size={14} /> },
  { id: 3, title: "Windows Experience", icon: <Monitor size={14} /> },
  { id: 4, title: "Ready", icon: <CheckCircle2 size={14} /> },
];

export const SetupWizard: React.FC<SetupWizardProps> = ({
  config,
  winTheme,
  onUpdateConfig,
  onApplyMasterTheme,
  onFinish,
}) => {
  const [step, setStep] = useState(0);
  const [applyGlobalFolders, setApplyGlobalFolders] = useState(false);
  const [finishing, setFinishing] = useState(false);

  const activeAccentHex =
    config.theme.accentMode === "custom" ? config.theme.customAccent : winTheme.accentHex;

  const handleComplete = async () => {
    setFinishing(true);
    try {
      if (applyGlobalFolders) {
        await invoke("apply_global_folder_theme_cmd", {
          theme: config.folderStyle?.theme ?? "obsidian",
          accentHex: activeAccentHex,
        }).catch(() => {});
      }
      onUpdateConfig({ ...config, onboardingCompleted: true });
      onFinish();
    } finally {
      setFinishing(false);
    }
  };

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 50,
        background: "rgb(9 9 11 / 0.96)",
        backdropFilter: "blur(24px)",
        display: "flex",
        flexDirection: "column",
        padding: "22px 28px 20px 28px",
        gap: 16,
      }}
    >
      {/* Top Bar: Brand + Step Pills + Skip */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: "var(--lens-fg)",
              boxShadow: "0 0 12px rgb(var(--lens-ink) / 0.5)",
            }}
          />
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--lens-fg)", letterSpacing: "-0.01em" }}>
              Welcome to Lens UI
            </div>
            <div style={{ fontSize: 11.5, color: "var(--lens-fg-muted)" }}>
              Customize your desktop shell in under 30 seconds — everything previews live.
            </div>
          </div>
        </div>

        <button
          type="button"
          className="cc-btn-ghost"
          onClick={() => {
            onUpdateConfig({ ...config, onboardingCompleted: true });
            onFinish();
          }}
        >
          Skip Setup
        </button>
      </div>

      {/* Interactive Step Progress Bar */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 6 }}>
        {STEPS.map((s) => {
          const isActive = step === s.id;
          const isDone = step > s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setStep(s.id)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                padding: "7px 8px",
                borderRadius: 9,
                fontSize: 11.5,
                fontWeight: 600,
                background: isActive
                  ? "#fafafa"
                  : isDone
                    ? "rgb(var(--lens-ink) / 0.1)"
                    : "rgb(var(--lens-ink) / 0.035)",
                color: isActive ? "#09090b" : isDone ? "#fafafa" : "var(--lens-fg-muted)",
                border: "1px solid rgb(var(--lens-ink) / 0.09)",
                cursor: "pointer",
                transition: "all 150ms ease",
              }}
            >
              {s.icon}
              <span>{s.title}</span>
            </button>
          );
        })}
      </div>

      {/* Main Step Stage */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 14,
          padding: "4px 2px",
        }}
      >
        {step === 0 && (
          <>
            <div>
              <div className="cc-section-title">Choose Your Visual Theme</div>
              <div className="cc-section-sub">
                Sets your obsidian glass palette, window borders, icon backdrop, and folder style.
              </div>
            </div>
            <div className="cc-theme-grid" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
              {[
                {
                  id: "obsidian" as const,
                  presetKey: "obsidian",
                  label: "Obsidian Monochrome",
                  desc: "Pure matte black & crisp white chrome with subtle glass depth.",
                  bg: "linear-gradient(145deg, #161b26, #09090b)",
                  accent: "#fafafa",
                  dots: ["#28c840", "#febc2e", "#ff5f57"],
                },
                {
                  id: "windows-mesh" as const,
                  presetKey: "windows-mesh",
                  label: "Steel Teal (Windows Sync)",
                  desc: `Meshes dark obsidian glass with your live Windows accent (${winTheme.accentHex}).`,
                  bg: `linear-gradient(145deg, color-mix(in oklch, #121722, ${winTheme.accentHex} 40%), #0b0e14)`,
                  accent: winTheme.accentHex,
                  dots: ["#3ec969", "#f0be4a", "#f06761"],
                },
                {
                  id: "stealth" as const,
                  presetKey: "graphite",
                  label: "Antigravity Graphite",
                  desc: "Smoked slate surfaces with soft indigo highlights and clean lines.",
                  bg: "linear-gradient(145deg, #232433, #11121a)",
                  accent: "#818cf8",
                  dots: ["#34d399", "#fbbf24", "#fb7185"],
                },
                {
                  id: "midnight-neon" as const,
                  presetKey: "midnight",
                  label: "Midnight Depth",
                  desc: "Deep space navy obsidian with electric sky accents.",
                  bg: "linear-gradient(145deg, #0d1633, #05060a)",
                  accent: "#38bdf8",
                  dots: ["#22c55e", "#eab308", "#ef4444"],
                },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={`cc-theme-card ${config.theme.preset === m.presetKey ? "active" : ""}`}
                  onClick={() => onApplyMasterTheme(m.id)}
                  style={{ padding: 12 }}
                >
                  <div
                    className="cc-theme-preview"
                    style={{ width: "100%", height: 74, background: m.bg, borderColor: `${m.accent}55` }}
                  >
                    <div className="cc-theme-preview-dots">
                      {m.dots.map((c, idx) => (
                        <span key={idx} style={{ background: c, width: 6, height: 6 }} />
                      ))}
                    </div>
                    <div className="cc-theme-preview-dock">
                      <span style={{ background: m.accent }} />
                      <span style={{ background: "#e2e8f0" }} />
                      <span style={{ background: "#64748b" }} />
                    </div>
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "var(--lens-fg)" }}>{m.label}</div>
                  <div style={{ fontSize: 11.5, color: "var(--lens-fg-muted)", lineHeight: 1.35 }}>
                    {m.desc}
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <div>
              <div className="cc-section-title">Accent Color & Glass Feel</div>
              <div className="cc-section-sub">
                Pick a live Windows accent color or sync with your OS, then dial in opacity and corner roundness.
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "230px 1fr", gap: 14, alignItems: "center" }}>
              <div className="cc-card" style={{ alignItems: "center", justifyContent: "center" }}>
                <ColorWheel
                  value={activeAccentHex}
                  windowsAccentHex={winTheme.accentHex}
                  accentMode={config.theme.accentMode}
                  onSelectColor={(hex) =>
                    onUpdateConfig({
                      ...config,
                      theme: { ...config.theme, accentMode: "custom", customAccent: hex },
                    })
                  }
                  onSelectWindowsLive={() =>
                    onUpdateConfig({
                      ...config,
                      theme: { ...config.theme, accentMode: "windows" },
                    })
                  }
                />
              </div>

              <div className="cc-card" style={{ gap: 12 }}>
                <PillFillBar
                  label="Window Opacity"
                  value={Math.round(config.theme.glassOpacity * 100)}
                  min={35}
                  max={100}
                  fillColor="#FAFAFA"
                  icon={<Droplets size={15} />}
                  onChange={(v) =>
                    onUpdateConfig({
                      ...config,
                      theme: { ...config.theme, glassOpacity: v / 100 },
                    })
                  }
                />
                <PillFillBar
                  label="Window Roundness"
                  value={config.theme.borderRadius}
                  min={0}
                  max={20}
                  unit="px"
                  fillColor="#A1A1AA"
                  icon={<Square size={15} />}
                  onChange={(v) =>
                    onUpdateConfig({
                      ...config,
                      theme: { ...config.theme, borderRadius: v },
                    })
                  }
                />
                <PillFillBar
                  label="Color Accent Tint"
                  value={Math.round(config.theme.accentTintStrength * 100)}
                  min={0}
                  max={50}
                  fillColor={activeAccentHex}
                  icon={<Palette size={15} />}
                  onChange={(v) =>
                    onUpdateConfig({
                      ...config,
                      theme: { ...config.theme, accentTintStrength: v / 100 },
                    })
                  }
                />
              </div>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div>
              <div className="cc-section-title">Icon & Folder Look</div>
              <div className="cc-section-sub">
                Choose how app icons sit in your dock (full color is always preserved) and pick a folder icon theme.
              </div>
            </div>
            <div className="cc-card">
              <div className="cc-label">Dock Icon Backdrop Style</div>
              <div className="cc-visual-swatch-grid">
                {[
                  { id: "obsidian-squircle", label: "Obsidian", bg: "linear-gradient(155deg,#242a38,#10131b)", dot: activeAccentHex },
                  { id: "frosted-glass", label: "Frosted Glass", bg: `color-mix(in oklch, #1f2533, ${activeAccentHex} 35%)`, dot: "#fff" },
                  { id: "monochrome", label: "Matte Dark", bg: "#1c1f26", dot: "#cbd5e1" },
                  { id: "accent-duotone", label: "Duotone", bg: `color-mix(in oklch, #0d111a, ${activeAccentHex} 42%)`, dot: activeAccentHex },
                  { id: "native", label: "Native Clean", bg: "transparent", dot: "#94a3b8" },
                ].map((it) => (
                  <button
                    key={it.id}
                    type="button"
                    className={`cc-visual-swatch ${(config.iconStyle?.theme ?? "obsidian-squircle") === it.id ? "active" : ""}`}
                    onClick={() =>
                      onUpdateConfig({
                        ...config,
                        iconStyle: { theme: it.id, shape: config.iconStyle?.shape ?? "squircle" },
                      })
                    }
                  >
                    <span
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 8,
                        background: it.bg,
                        border: "1px solid rgb(var(--lens-ink) / 0.16)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <span style={{ width: 11, height: 11, borderRadius: 4, background: it.dot }} />
                    </span>
                    <span>{it.label}</span>
                  </button>
                ))}
              </div>

              <div className="cc-row">
                <div className="cc-label">Icon Shape</div>
                <div className="cc-chip-grid">
                  {[
                    { id: "squircle", label: "Squircle" },
                    { id: "rounded", label: "Rounded" },
                    { id: "circle", label: "Circle" },
                    { id: "borderless", label: "Borderless" },
                  ].map((sh) => (
                    <button
                      key={sh.id}
                      type="button"
                      className={`cc-chip ${(config.iconStyle?.shape ?? "squircle") === sh.id ? "active" : ""}`}
                      onClick={() =>
                        onUpdateConfig({
                          ...config,
                          iconStyle: { theme: config.iconStyle?.theme ?? "obsidian-squircle", shape: sh.id },
                        })
                      }
                    >
                      {sh.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="cc-card">
              <div className="cc-row">
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Folder size={15} color="var(--lens-fg)" />
                  <div>
                    <div className="cc-label">Matte-Glassware Folder Theme</div>
                    <div className="cc-desc">Pick a folder style for your Dock and optionally all Windows Explorer folders.</div>
                  </div>
                </div>
                <div className="cc-chip-grid">
                  {[
                    { id: "obsidian", label: "Matte" },
                    { id: "accent", label: "Accent" },
                    { id: "cobalt", label: "Cobalt" },
                    { id: "emerald", label: "Emerald" },
                  ].map((ft) => (
                    <button
                      key={ft.id}
                      type="button"
                      className={`cc-chip ${(config.folderStyle?.theme ?? "obsidian") === ft.id ? "active" : ""}`}
                      onClick={() =>
                        onUpdateConfig({
                          ...config,
                          folderStyle: {
                            theme: ft.id,
                            globalExplorerOverride: config.folderStyle?.globalExplorerOverride ?? false,
                          },
                          dock: {
                            ...config.dock,
                            pinnedFolders: config.dock.pinnedFolders.map((f) => ({ ...f, theme: ft.id })),
                          },
                        })
                      }
                    >
                      {ft.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="cc-row">
                <div>
                  <div className="cc-label">Apply to all Windows Explorer folders on finish</div>
                  <div className="cc-desc">1-click reversible anytime in Folder Icons.</div>
                </div>
                <button
                  type="button"
                  className={`cc-toggle ${applyGlobalFolders ? "on" : ""}`}
                  onClick={() => setApplyGlobalFolders((v) => !v)}
                />
              </div>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div>
              <div className="cc-section-title">Default Windows Experience</div>
              <div className="cc-section-sub">
                Choose how deeply Lens UI replaces or complements your native Windows 11 shell.
              </div>
            </div>

            <div className="cc-card">
              <div className="cc-row">
                <div>
                  <div className="cc-label">Native Windows Taskbar</div>
                  <div className="cc-desc">Keep it visible alongside Lens Dock, or hide it cleanly (always auto-restores on quit).</div>
                </div>
                <div className="cc-chip-grid">
                  <button
                    type="button"
                    className={`cc-chip ${!config.func.hideNativeTaskbar ? "active" : ""}`}
                    onClick={() =>
                      onUpdateConfig({
                        ...config,
                        func: { ...config.func, hideNativeTaskbar: false },
                      })
                    }
                  >
                    Keep Taskbar
                  </button>
                  <button
                    type="button"
                    className={`cc-chip ${config.func.hideNativeTaskbar ? "active" : ""}`}
                    onClick={() =>
                      onUpdateConfig({
                        ...config,
                        func: { ...config.func, hideNativeTaskbar: true },
                      })
                    }
                  >
                    Hide Taskbar
                  </button>
                </div>
              </div>

              <div style={{ height: 1, background: "var(--lens-border)" }} />

              <div className="cc-row">
                <div>
                  <div className="cc-label">Window Caption Buttons</div>
                  <div className="cc-desc">Replace native Windows — ❐ × buttons with sleek traffic lights across all apps.</div>
                </div>
                <div className="cc-chip-grid">
                  <button
                    type="button"
                    className={`cc-chip ${
                      config.windowControls.enabled && config.windowControls.order !== "red-yellow-green"
                        ? "active"
                        : ""
                    }`}
                    onClick={() =>
                      onUpdateConfig({
                        ...config,
                        windowControls: { ...config.windowControls, enabled: true, order: "green-yellow-red" },
                      })
                    }
                  >
                    Green · Yellow · Red
                  </button>
                  <button
                    type="button"
                    className={`cc-chip ${
                      config.windowControls.enabled && config.windowControls.order === "red-yellow-green"
                        ? "active"
                        : ""
                    }`}
                    onClick={() =>
                      onUpdateConfig({
                        ...config,
                        windowControls: { ...config.windowControls, enabled: true, order: "red-yellow-green" },
                      })
                    }
                  >
                    Red · Yellow · Green
                  </button>
                  <button
                    type="button"
                    className={`cc-chip ${!config.windowControls.enabled ? "active" : ""}`}
                    onClick={() =>
                      onUpdateConfig({
                        ...config,
                        windowControls: { ...config.windowControls, enabled: false },
                      })
                    }
                  >
                    Windows Default
                  </button>
                </div>
              </div>

              <div style={{ height: 1, background: "var(--lens-border)" }} />

              <div className="cc-row">
                <div>
                  <div className="cc-label">Top Bar Auto-Hide on Overlap</div>
                  <div className="cc-desc">Slides away cleanly when a maximized window touches the top edge.</div>
                </div>
                <button
                  type="button"
                  className={`cc-toggle ${config.topBar.autoHide === "overlap" ? "on" : ""}`}
                  onClick={() =>
                    onUpdateConfig({
                      ...config,
                      topBar: {
                        ...config.topBar,
                        autoHide: config.topBar.autoHide === "overlap" ? "never" : "overlap",
                      },
                    })
                  }
                />
              </div>

              <div className="cc-row">
                <div>
                  <div className="cc-label">Run Lens UI on Windows Startup</div>
                  <div className="cc-desc">Starts automatically when you sign in to Windows.</div>
                </div>
                <button
                  type="button"
                  className={`cc-toggle ${config.func.runOnStartup ? "on" : ""}`}
                  onClick={() =>
                    onUpdateConfig({
                      ...config,
                      func: { ...config.func, runOnStartup: !config.func.runOnStartup },
                    })
                  }
                />
              </div>
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <div>
              <div className="cc-section-title">You&apos;re All Set</div>
              <div className="cc-section-sub">
                Here&apos;s your personalized Lens UI profile. You can tweak any setting anytime from Control Center or the Top Bar Quick Settings flick drawer.
              </div>
            </div>

            <div className="cc-card" style={{ gap: 10 }}>
              {[
                { label: "Visual Theme", value: config.theme.preset },
                { label: "Accent Color", value: `${activeAccentHex} (${config.theme.accentMode})` },
                { label: "Glass Opacity / Roundness", value: `${Math.round(config.theme.glassOpacity * 100)}% · ${config.theme.borderRadius}px` },
                { label: "Icon Look & Shape", value: `${config.iconStyle?.theme ?? "obsidian-squircle"} · ${config.iconStyle?.shape ?? "squircle"}` },
                { label: "Window Buttons", value: config.windowControls.enabled ? config.windowControls.order : "Windows Default" },
                { label: "Native Windows Taskbar", value: config.func.hideNativeTaskbar ? "Hidden (Pure Lens Dock)" : "Kept Visible" },
                { label: "Run on Startup", value: config.func.runOnStartup ? "Enabled" : "Off" },
              ].map((item) => (
                <div key={item.label} className="cc-row">
                  <span className="cc-desc" style={{ fontSize: 12 }}>{item.label}</span>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--lens-fg)" }}>{item.value}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Footer Navigation */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingTop: 10,
          borderTop: "1px solid var(--lens-border)",
        }}
      >
        <button
          type="button"
          className="cc-btn-ghost"
          disabled={step === 0}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            opacity: step === 0 ? 0.35 : 1,
            cursor: step === 0 ? "default" : "pointer",
          }}
          onClick={() => setStep((s) => Math.max(0, s - 1))}
        >
          <ChevronLeft size={14} />
          <span>Back</span>
        </button>

        {step < STEPS.length - 1 ? (
          <button
            type="button"
            className="cc-btn"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px" }}
            onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
          >
            <span>Continue</span>
            <ChevronRight size={14} />
          </button>
        ) : (
          <button
            type="button"
            className="cc-btn"
            disabled={finishing}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 18px" }}
            onClick={handleComplete}
          >
            <Sparkles size={14} />
            <span>{finishing ? "Applying..." : "Finish & Launch Lens UI"}</span>
          </button>
        )}
      </div>
    </div>
  );
};
