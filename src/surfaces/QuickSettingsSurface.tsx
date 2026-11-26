import React, { useEffect, useRef, useState } from "react";
import { FlyoutClose } from "../ui/FlyoutClose";
import { useStartupBlock } from "../hooks/useStartupBlock";
import { invoke } from "@tauri-apps/api/core";
import { THEME_PACKS, applyThemePack, packSwatch } from "../themes/packs";
import { chooseTheme } from "../themes/choiceUndo";
import { listen } from "@tauri-apps/api/event";
import {
  Wifi,
  Bluetooth,
  Moon,
  Volume2,
  VolumeX,
  Sun,
  Zap,
  Monitor,
  Shield,
  RefreshCw,
  SlidersHorizontal,
  Palette,
  AppWindow,
  Activity,
  Sparkles,
  Droplets,
  Square,
  HardDrive,
  Gamepad2,
  Cpu,
  Folder,
  ExternalLink,
  Globe,
  Radio,
  Lock,
  Cable,
  Headphones,
  Mic,
} from "lucide-react";
import { useLensState, useSurfaceGlide } from "../hooks/useLensState";
import { PillFillBar } from "../components/PillFillBar";
import { ColorWheel } from "../components/ColorWheel";
import { CalendarClockPane } from "../components/CalendarClockPane";
import { NotificationCenterPane } from "../components/NotificationCenterPane";
import { WifiModule } from "../components/WifiModule";
import { BluetoothModule } from "../components/BluetoothModule";
import { BatteryModule } from "../components/BatteryModule";
import { KeyboardLayoutModule } from "../components/KeyboardLayoutModule";
import { AccountModule } from "../components/AccountModule";
import { AudioDeviceModule } from "../components/AudioDeviceModule";
import { BrightnessRows, ConnectionTiles, NightLightPanel, WindowThumbs, useVolumeSender } from "../quicksettings/LiveRows";
import "./QuickSettingsSurface.css";

interface QuickState {
  volume: number;
  muted: boolean;
  brightness: number;
  nightLightEnabled: boolean;
  nightLightWarmth: number;
}

interface AudioAppSession {
  pid: number;
  name: string;
  volume: number;
  muted: boolean;
  iconDataUrl?: string | null;
}

// Matches sys_telemetry.rs SystemTelemetry (it never sent memoryUsedGb / uptimeSeconds).
interface TelemetryInfo {
  cpuUsage: number;
  memUsedGb: number;
  memTotalGb: number;
  memPercent: number;
  uptimeMinutes: number;
}

type QsTab = "quick" | "theme" | "all" | "network" | "audio" | "calendar" | "notifications";
const FLICK_TABS: ("quick" | "theme" | "all")[] = ["quick", "theme", "all"];

const THEME_PRESETS = THEME_PACKS.map((p) => ({ id: p.id, label: p.label, swatch: packSwatch(p) }));

const FOLDER_THEMES = [
  { id: "obsidian", label: "Matte" },
  { id: "accent", label: "Accent" },
  { id: "cobalt", label: "Cobalt" },
  { id: "emerald", label: "Emerald" },
];

export const QuickSettingsSurface: React.FC = () => {
  const startupBlock = useStartupBlock();
  const { config, winTheme, updateConfig } = useLensState();
  const glidePhase = useSurfaceGlide("quicksettings");
  const [activeTab, setActiveTab] = useState<QsTab>("quick");
  const [anchorMode, setAnchorMode] = useState<"top-right" | "bottom-right">("top-right");
  const [slideDir, setSlideDir] = useState<number>(1);
  const [qs, setQs] = useState<QuickState>({
    volume: 50,
    muted: false,
    brightness: 80,
    nightLightEnabled: false,
    nightLightWarmth: 40,
  });
  const [sessions, setSessions] = useState<AudioAppSession[]>([]);
  const [telemetry, setTelemetry] = useState<TelemetryInfo | null>(null);
  const [folderStatus, setFolderStatus] = useState<string | null>(null);

  const flickRef = useRef<HTMLDivElement | null>(null);
  const dragStartX = useRef<number | null>(null);
  const activeTabRef = useRef<QsTab>("quick");
  activeTabRef.current = activeTab;

  const switchTab = (next: QsTab) => {
    const prevIdx = FLICK_TABS.indexOf(activeTabRef.current as "quick" | "theme" | "all");
    const nextIdx = FLICK_TABS.indexOf(next as "quick" | "theme" | "all");
    if (next === activeTabRef.current) return;
    setSlideDir(prevIdx !== -1 && nextIdx !== -1 ? (nextIdx > prevIdx ? 1 : -1) : 1);
    setActiveTab(next);
  };

  const flickStep = (delta: number) => {
    const cur = FLICK_TABS.indexOf(activeTabRef.current as "quick" | "theme" | "all");
    const base = cur === -1 ? 0 : cur;
    const next = (base + delta + FLICK_TABS.length) % FLICK_TABS.length;
    setSlideDir(delta > 0 ? 1 : -1);
    setActiveTab(FLICK_TABS[next]);
  };

  const refresh = () => {
    invoke<QuickState>("get_quick_state_cmd")
      .then(setQs)
      .catch(() => {});
    invoke<AudioAppSession[]>("list_audio_sessions_cmd")
      .then(setSessions)
      .catch(() => {});
    invoke<TelemetryInfo>("get_telemetry_cmd")
      .then(setTelemetry)
      .catch(() => {});
  };

  useEffect(() => {
    refresh();

    const unlistenTab = listen<{ tab?: string; section?: string; anchor?: string }>("lens://qs-tab", (e) => {
      if (e.payload?.anchor === "bottom-right" || e.payload?.anchor === "top-right") {
        setAnchorMode(e.payload.anchor);
      }
      const t = e.payload?.tab as QsTab | undefined;
      if (t && ["quick", "theme", "all", "network", "audio", "calendar", "notifications"].includes(t)) {
        switchTab(t);
      }
      refresh();
    });

    const onFocus = () => {
      refresh();
    };
    const onBlur = () => {
      window.setTimeout(() => {
        if (!document.hasFocus()) {
          invoke("hide_surface", { label: "quicksettings" }).catch(() => {});
        }
      }, 120);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        invoke("hide_surface", { label: "quicksettings" });
        return;
      }
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        flickStep(1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        flickStep(-1);
      }
    };

    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);
    window.addEventListener("keydown", onKey);
    return () => {
      unlistenTab.then((fn) => fn());
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  // Non-passive mouse-wheel flick on the segmented flick bar
  useEffect(() => {
    const el = flickRef.current;
    if (!el) return;
    let lastWheel = 0;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const now = Date.now();
      if (now - lastWheel < 160) return;
      lastWheel = now;
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (d > 0) flickStep(1);
      else if (d < 0) flickStep(-1);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const [audioErr, setAudioErr] = useState<string | null>(null);
  const sendVolume = useVolumeSender(setAudioErr);
  const setVolume = (level: number) => {
    setAudioErr(null);
    setQs((prev) => ({ ...prev, volume: level, muted: level > 0 ? false : prev.muted }));
    sendVolume(level);
  };
  // Reflect volume changes made elsewhere (keyboard keys, other apps) while this flyout is showing.
  useEffect(() => {
    const t = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      invoke<[number, boolean]>("get_volume_cmd")
        .then(([volume, muted]) => setQs((prev) => (prev.volume === volume && prev.muted === muted ? prev : { ...prev, volume, muted })))
        .catch(() => {});
    }, 1500);
    return () => window.clearInterval(t);
  }, []);

  const toggleMute = () => {
    const next = !qs.muted;
    setQs((prev) => ({ ...prev, muted: next }));
    invoke("set_mute_cmd", { muted: next }).catch((e) => setAudioErr(String(e)));
  };

  const toggleNightLight = () => {
    const next = !qs.nightLightEnabled;
    setQs((prev) => ({ ...prev, nightLightEnabled: next }));
    invoke("set_night_light_cmd", { enabled: next, warmth: qs.nightLightWarmth }).catch(() => {});
  };

  const setNightWarmth = (warmth: number) => {
    setQs((prev) => ({ ...prev, nightLightEnabled: warmth > 0, nightLightWarmth: warmth }));
    invoke("set_night_light_cmd", { enabled: warmth > 0, warmth }).catch(() => {});
  };

  const openSetting = (uri: string) => {
    invoke("open_windows_setting_cmd", { uri }).catch(() => {});
  };

  const activeIdx = FLICK_TABS.indexOf(activeTab as "quick" | "theme" | "all");
  const isDedicatedArea =
    activeTab === "network" ||
    activeTab === "audio" ||
    activeTab === "calendar" ||
    activeTab === "notifications";
  const effectiveAccent =
    config?.theme.accentMode === "windows"
      ? winTheme?.accentHex || "#2D7D9A"
      : config?.theme.customAccent || "#2D7D9A";

  const formatUptime = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    return `${h}h ${m}m`;
  };

  return (
    <div className={`qs-shell ${anchorMode === "bottom-right" ? "is-bottom-right" : ""}`}>
      <div className={`qs-panel lens-flyout-host ${anchorMode === "bottom-right" ? "lens-glide-dock" : "lens-glide-top"} ${glidePhase}`}>
        <FlyoutClose onClose={() => invoke("hide_surface", { label: "quicksettings" }).catch(() => {})} />
        {/* Usable Flick Switcher only in Quick / Theme / All — zero title bar or header strip in dedicated popouts! */}
        {!isDedicatedArea && (
          <div className="qs-header" style={{ padding: "8px 40px 8px 10px" }}>
            <div
              ref={flickRef}
              className="qs-flick-track"
              onPointerDown={(e) => {
                dragStartX.current = e.clientX;
              }}
              onPointerUp={(e) => {
                if (dragStartX.current !== null) {
                  const dx = e.clientX - dragStartX.current;
                  dragStartX.current = null;
                  if (Math.abs(dx) > 28) {
                    flickStep(dx > 0 ? 1 : -1);
                  }
                }
              }}
            >
              <div
                className="qs-flick-thumb"
                style={{ transform: `translateX(${Math.max(0, activeIdx) * 100}%)` }}
              />
              <button
                type="button"
                className={`qs-flick-btn ${activeTab === "quick" ? "active" : ""}`}
                onClick={() => switchTab("quick")}
              >
                <Zap size={12.5} strokeWidth={2.5} />
                <span>Quick</span>
              </button>
              <button
                type="button"
                className={`qs-flick-btn ${activeTab === "theme" ? "active" : ""}`}
                onClick={() => switchTab("theme")}
              >
                <Sparkles size={12.5} strokeWidth={2.5} />
                <span>Theme</span>
              </button>
              <button
                type="button"
                className={`qs-flick-btn ${activeTab === "all" ? "active" : ""}`}
                onClick={() => switchTab("all")}
              >
                <SlidersHorizontal size={12.5} strokeWidth={2.5} />
                <span>All</span>
              </button>
            </div>
          </div>
        )}

        <div className="qs-body">
          {/* ==================== DEDICATED CALENDAR & ANALOG CIRCLE CLOCK ==================== */}
          {activeTab === "calendar" && <CalendarClockPane />}
          {activeTab === "notifications" && <NotificationCenterPane />}

          {/* ==================== DEDICATED WI-FI & NETWORK AREA (NO TITLE, COMPACT) ==================== */}
          {activeTab === "network" && (
            <div
              key="pane-network"
              className="qs-pane"
              style={{ ["--qs-slide-from" as string]: "10px" }}
            >
              <WifiModule />
              <BluetoothModule />

              <div className="qs-win-grid">
                {[
                  { label: "Hotspot", uri: "ms-settings:network-mobilehotspot", icon: <Radio size={14} strokeWidth={2.3} color="#34D399" /> },
                  { label: "VPN", uri: "ms-settings:network-vpn", icon: <Lock size={14} strokeWidth={2.3} color="#FBBF24" /> },
                  { label: "Ethernet", uri: "ms-settings:network-ethernet", icon: <Cable size={14} strokeWidth={2.3} color="#38BDF8" /> },
                  { label: "Proxy", uri: "ms-settings:network-proxy", icon: <Globe size={14} strokeWidth={2.3} color="#FB7185" /> },
                ].map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    className="qs-win-item"
                    onClick={() => openSetting(item.uri)}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ==================== DEDICATED SOUND & VOLUME MIXER AREA (NO TITLES, COMPACT SLIDERS + DEVICES SWITCH) ==================== */}
          {activeTab === "audio" && (
            <div
              key="pane-audio"
              className="qs-pane"
              style={{ ["--qs-slide-from" as string]: "10px" }}
            >
              <div className="qs-bars" style={{ gap: 7 }}>
                <PillFillBar
                  label={qs.muted ? "Master (Muted)" : "Master Volume"}
                  value={qs.muted ? 0 : qs.volume}
                  fillColor={qs.muted ? "#FB7185" : "#60A5FA"}
                  icon={qs.muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                  onIconClick={toggleMute}
                  onChange={setVolume}
                />
                {audioErr && <div className="qsl-error">{audioErr}</div>}

                {sessions.map((s) => (
                  <PillFillBar
                    key={s.pid}
                    label={s.name}
                    value={s.muted ? 0 : s.volume}
                    fillColor={s.muted ? "#71717A" : "#38BDF8"}
                    icon={
                      s.iconDataUrl ? (
                        <img
                          src={s.iconDataUrl}
                          alt={s.name}
                          style={{
                            width: 16,
                            height: 16,
                            objectFit: "contain",
                            opacity: s.muted ? 0.45 : 1,
                          }}
                        />
                      ) : s.muted ? (
                        <VolumeX size={15} />
                      ) : (
                        <Volume2 size={15} />
                      )
                    }
                    onIconClick={() => {
                      const nextMute = !s.muted;
                      setSessions((prev) =>
                        prev.map((x) => (x.pid === s.pid ? { ...x, muted: nextMute } : x))
                      );
                      invoke("set_app_mute_cmd", { pid: s.pid, muted: nextMute }).catch(() => {});
                    }}
                    onChange={(level) => {
                      setSessions((prev) =>
                        prev.map((x) =>
                          x.pid === s.pid ? { ...x, volume: level, muted: false } : x
                        )
                      );
                      invoke("set_app_volume_cmd", { pid: s.pid, level }).catch(() => {});
                    }}
                  />
                ))}
              </div>

              <AudioDeviceModule flow="render" />
              <AudioDeviceModule flow="capture" />

              <div className="qs-win-grid" style={{ marginTop: 2 }}>
                <button
                  type="button"
                  className="qs-win-item"
                  onClick={() => openSetting("ms-settings:sound")}
                >
                  <Headphones size={14} strokeWidth={2.3} color="#38BDF8" />
                  <span>Sound Settings</span>
                </button>
                <button
                  type="button"
                  className="qs-win-item"
                  onClick={() => openSetting("ms-settings:sound-devices")}
                >
                  <Mic size={14} strokeWidth={2.3} color="#FB7185" />
                  <span>All Devices</span>
                </button>
              </div>
            </div>
          )}
          {/* ==================== PANE 1: QUICK CONTROLS ==================== */}
          {activeTab === "quick" && (
            <div
              key="pane-quick"
              className="qs-pane"
              style={{ ["--qs-slide-from" as string]: `${slideDir * 16}px` }}
            >
              <BatteryModule />
              <KeyboardLayoutModule />

              {/* 1. DISPLAY & EYE CARE: one slider per screen, Night light expands into warmth + schedule */}
              <div className="qs-card" style={{ gap: 9 }}>
                <BrightnessRows />
                <NightLightPanel
                  enabled={qs.nightLightEnabled}
                  warmth={qs.nightLightWarmth || 50}
                  onToggle={toggleNightLight}
                  onWarmth={setNightWarmth}
                />
              </div>

              {/* 2. SOUND & APP VOLUME MIXER */}
              <div className="qs-card" style={{ gap: 9 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    {qs.muted ? (
                      <VolumeX size={15} strokeWidth={2.4} color="#FB7185" />
                    ) : (
                      <Volume2 size={15} strokeWidth={2.4} color="#38BDF8" />
                    )}
                    <span className="qs-row-title" style={{ fontSize: 12 }}>
                      Sound &amp; Mixer {sessions.length > 0 ? `(${sessions.length})` : ""}
                    </span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={!qs.muted}
                    aria-label="Sound on"
                    className={`qs-switch ${!qs.muted ? "on" : ""}`}
                    onClick={toggleMute}
                  >
                    <span className="qs-switch-knob" />
                  </button>
                </div>

                <PillFillBar
                  label={qs.muted ? "Master (Muted)" : "Master Volume"}
                  value={qs.muted ? 0 : qs.volume}
                  fillColor="#60A5FA"
                  icon={qs.muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
                  onIconClick={toggleMute}
                  onChange={setVolume}
                />

                {sessions.slice(0, 3).map((s) => (
                  <PillFillBar
                    key={s.pid}
                    label={s.name}
                    value={s.muted ? 0 : s.volume}
                    fillColor={s.muted ? "#71717A" : "#38BDF8"}
                    icon={
                      s.iconDataUrl ? (
                        <img
                          src={s.iconDataUrl}
                          alt={s.name}
                          style={{
                            width: 15,
                            height: 15,
                            objectFit: "contain",
                            opacity: s.muted ? 0.45 : 1,
                          }}
                        />
                      ) : s.muted ? (
                        <VolumeX size={14} />
                      ) : (
                        <Volume2 size={14} />
                      )
                    }
                    onIconClick={() => {
                      const nextMute = !s.muted;
                      setSessions((prev) =>
                        prev.map((x) => (x.pid === s.pid ? { ...x, muted: nextMute } : x))
                      );
                      invoke("set_app_mute_cmd", { pid: s.pid, muted: nextMute }).catch(() => {});
                    }}
                    onChange={(level) => {
                      setSessions((prev) =>
                        prev.map((x) =>
                          x.pid === s.pid ? { ...x, volume: level, muted: false } : x
                        )
                      );
                      invoke("set_app_volume_cmd", { pid: s.pid, level }).catch(() => {});
                    }}
                  />
                ))}
              </div>

              {/* 3. CONNECTIONS (real state; tap toggles, › opens Windows Settings) + OPEN WINDOWS */}
              <ConnectionTiles volume={qs.volume} muted={qs.muted} onMute={toggleMute} />
              <div className="qs-section-label">Windows</div>
              <WindowThumbs />

              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 5 }}>
                {[
                  { label: "Power", uri: "ms-settings:powersleep", icon: <Zap size={12} color="#FBBF24" /> },
                  { label: "Apps", uri: "ms-settings:appsfeatures", icon: <AppWindow size={12} color="#FB7185" /> },
                  { label: "Storage", uri: "ms-settings:storagesense", icon: <HardDrive size={12} color="#94A3B8" /> },
                  { label: "Updates", uri: "ms-settings:windowsupdate", icon: <RefreshCw size={12} color="#34D399" /> },
                ].map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    className="qs-win-item"
                    style={{ justifyContent: "center", padding: "5px 4px", fontSize: 10.5, gap: 4 }}
                    onClick={() => openSetting(item.uri)}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>

              <button
                type="button"
                className="qs-popout-btn"
                onClick={() => openSetting("ms-settings:")}
              >
                <ExternalLink size={14} strokeWidth={2.5} />
                <span>Open Full Windows Settings</span>
              </button>
            </div>
          )}

          {/* ==================== PANE 2: THEME & DESKTOP ==================== */}
          {activeTab === "theme" && config && (
            <div
              key="pane-theme"
              className="qs-pane"
              style={{ ["--qs-slide-from" as string]: `${slideDir * 16}px` }}
            >
              <div className="qs-section-label">Visual Master Theme</div>
              <div className="qs-preset-grid">
                {THEME_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`qs-preset-card ${config.theme.preset === p.id ? "active" : ""}`}
                    onClick={() =>
                      updateConfig(chooseTheme(config, (c) => applyThemePack(c, p.id)))
                    }
                  >
                    <span className="qs-preset-swatch" style={{ background: p.swatch }} />
                    <span>{p.label}</span>
                  </button>
                ))}
              </div>

              <div className="qs-section-label">Windows Accent Color</div>
              <div className="qs-card" style={{ padding: "10px 10px" }}>
                <ColorWheel
                  value={effectiveAccent}
                  windowsAccentHex={winTheme?.accentHex || "#2D7D9A"}
                  accentMode={config.theme.accentMode}
                  onSelectColor={(hex) =>
                    updateConfig({
                      ...config,
                      theme: { ...config.theme, accentMode: "custom", customAccent: hex },
                    })
                  }
                  onSelectWindowsLive={() =>
                    updateConfig({
                      ...config,
                      theme: { ...config.theme, accentMode: "windows" },
                    })
                  }
                />
              </div>

              <div className="qs-section-label">Surface & Glass Tuning</div>
              <div className="qs-bars">
                <PillFillBar
                  label="Window Opacity"
                  value={Math.round(config.theme.glassOpacity * 100)}
                  min={35}
                  max={100}
                  fillColor="#FAFAFA"
                  icon={<Droplets size={15} />}
                  onChange={(v) =>
                    updateConfig({
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
                    updateConfig({
                      ...config,
                      theme: { ...config.theme, borderRadius: v },
                    })
                  }
                />
                <PillFillBar
                  label="Accent Strength"
                  value={Math.round(config.theme.accentTintStrength * 100)}
                  min={0}
                  max={50}
                  fillColor={effectiveAccent}
                  icon={<Palette size={15} />}
                  onChange={(v) =>
                    updateConfig({
                      ...config,
                      theme: { ...config.theme, accentTintStrength: v / 100 },
                    })
                  }
                />
              </div>

              <div className="qs-section-label">Desktop & Shell Controls</div>
              <div className="qs-card">
                <div className="qs-row">
                  <div>
                    <div className="qs-row-title">Traffic Light Controls</div>
                    <div className="qs-row-sub">Yellow · Green · Red across all windows</div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={!!(config.windowControls.enabled)}
                    aria-label="Traffic Light Controls"
                    className={`qs-switch ${config.windowControls.enabled ? "on" : ""}`}
                    onClick={() =>
                      updateConfig({
                        ...config,
                        windowControls: {
                          ...config.windowControls,
                          enabled: !config.windowControls.enabled,
                        },
                      })
                    }
                  >
                    <span className="qs-switch-knob" />
                  </button>
                </div>

                {config.windowControls.enabled && (
                  <div className="qs-seg-row">
                    {([
                      ["yellow-green-red", "Y · G · R"],
                      ["green-yellow-red", "G · Y · R"],
                      ["red-yellow-green", "R · Y · G"],
                    ] as const).map(([id, label]) => {
                      const cur = config.windowControls.order;
                      const active = id === "yellow-green-red" ? cur !== "green-yellow-red" && cur !== "red-yellow-green" : cur === id;
                      return (
                        <button
                          key={id}
                          type="button"
                          className={`qs-seg-btn ${active ? "active" : ""}`}
                          onClick={() => updateConfig({ ...config, windowControls: { ...config.windowControls, order: id } })}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="qs-row">
                  <div>
                    <div className="qs-row-title">Top Bar Auto-Hide</div>
                    <div className="qs-row-sub">Hide smoothly when windows overlap</div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={!!(config.topBar.autoHide === "overlap")}
                    aria-label="Top Bar Auto-Hide"
                    className={`qs-switch ${config.topBar.autoHide === "overlap" ? "on" : ""}`}
                    onClick={() =>
                      updateConfig({
                        ...config,
                        topBar: {
                          ...config.topBar,
                          autoHide: config.topBar.autoHide === "overlap" ? "never" : "overlap",
                        },
                      })
                    }
                  >
                    <span className="qs-switch-knob" />
                  </button>
                </div>

                <div className="qs-row">
                  <div>
                    <div className="qs-row-title">Floating Top Bar</div>
                    <div className="qs-row-sub">Detached pill style with margin</div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={!!(config.topBar.floating)}
                    aria-label="Floating Top Bar"
                    className={`qs-switch ${config.topBar.floating ? "on" : ""}`}
                    onClick={() =>
                      updateConfig({
                        ...config,
                        topBar: { ...config.topBar, floating: !config.topBar.floating },
                      })
                    }
                  >
                    <span className="qs-switch-knob" />
                  </button>
                </div>

                <div className="qs-row">
                  <div>
                    <div className="qs-row-title">Hide Native Taskbar</div>
                    <div className="qs-row-sub">Auto-restores safely on exit</div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={!!(config.func.hideNativeTaskbar)}
                    aria-label="Hide Native Taskbar"
                    className={`qs-switch ${config.func.hideNativeTaskbar ? "on" : ""}`}
                    onClick={() =>
                      updateConfig({
                        ...config,
                        func: {
                          ...config.func,
                          hideNativeTaskbar: !config.func.hideNativeTaskbar,
                        },
                      })
                    }
                  >
                    <span className="qs-switch-knob" />
                  </button>
                </div>

                <div className="qs-row">
                  <div>
                    <div className="qs-row-title">Run on Startup</div>
                    <div className="qs-row-sub">{startupBlock ?? "Launch Lens automatically with Windows"}</div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={!!(config.func.runOnStartup)}
                    aria-label="Run on Startup"
                    className={`qs-switch ${config.func.runOnStartup ? "on" : ""}`}
                    aria-disabled={!!startupBlock && !config.func.runOnStartup}
                    onClick={() =>
                      (!startupBlock || config.func.runOnStartup) &&
                      updateConfig({
                        ...config,
                        func: { ...config.func, runOnStartup: !config.func.runOnStartup },
                      })
                    }
                  >
                    <span className="qs-switch-knob" />
                  </button>
                </div>
              </div>

              <div className="qs-section-label">Folder Icon Theme</div>
              <div className="qs-card">
                <div className="qs-seg-row">
                  {FOLDER_THEMES.map((ft) => (
                    <button
                      key={ft.id}
                      type="button"
                      className={`qs-seg-btn ${
                        (config.folderStyle?.theme ?? "obsidian") === ft.id ? "active" : ""
                      }`}
                      onClick={() => {
                        setFolderStatus("Applying...");
                        invoke("apply_global_folder_theme_cmd", {
                          theme: ft.id,
                          accentHex: effectiveAccent,
                        })
                          .then(() => setFolderStatus(`Applied ${ft.label}`))
                          .catch(() => setFolderStatus("Failed"));
                      }}
                    >
                      {ft.label}
                    </button>
                  ))}
                </div>
                {folderStatus && (
                  <div style={{ fontSize: 10.5, color: "var(--lens-fg-muted)", display: "flex", alignItems: "center", gap: 6 }}>
                    <Folder size={12} />
                    <span>{folderStatus}</span>
                  </div>
                )}
              </div>

              <button
                type="button"
                className="qs-popout-btn"
                onClick={() => {
                  invoke("hide_surface", { label: "quicksettings" });
                  invoke("open_surface", { label: "settings" });
                }}
              >
                <ExternalLink size={14} strokeWidth={2.5} />
                <span>Open Full Lens Control Center</span>
              </button>
            </div>
          )}

          {/* ==================== PANE 3: ALL SETTINGS & TELEMETRY ==================== */}
          {activeTab === "all" && (
            <div
              key="pane-all"
              className="qs-pane"
              style={{ ["--qs-slide-from" as string]: `${slideDir * 16}px` }}
            >
              <AccountModule />

              <div className="qs-section-label">Live System Telemetry</div>
              <div className="qs-telemetry-strip">
                <div className="qs-stat-box">
                  <span className="qs-stat-label">CPU</span>
                  <span className="qs-stat-val">
                    {telemetry ? `${Math.round(telemetry.cpuUsage)}%` : "—"}
                  </span>
                </div>
                <div className="qs-stat-box">
                  <span className="qs-stat-label">RAM</span>
                  <span className="qs-stat-val">
                    {telemetry ? `${Number(telemetry.memUsedGb ?? 0).toFixed(1)}G` : "—"}
                  </span>
                </div>
                <div className="qs-stat-box">
                  <span className="qs-stat-label">Uptime</span>
                  <span className="qs-stat-val">
                    {telemetry ? formatUptime((telemetry.uptimeMinutes ?? 0) * 60) : "—"}
                  </span>
                </div>
              </div>

              <div className="qs-section-label">Windows Settings</div>
              <div className="qs-win-grid">
                {[
                  { label: "Display", uri: "ms-settings:display", icon: <Monitor size={14} color="#60A5FA" /> },
                  { label: "Sound", uri: "ms-settings:sound", icon: <Volume2 size={14} color="#38BDF8" /> },
                  { label: "Network", uri: "ms-settings:network", icon: <Wifi size={14} color="#34D399" /> },
                  { label: "Bluetooth", uri: "ms-settings:bluetooth", icon: <Bluetooth size={14} color="#818CF8" /> },
                  { label: "Power", uri: "ms-settings:powersleep", icon: <Zap size={14} color="#FBBF24" /> },
                  { label: "Personalize", uri: "ms-settings:personalization", icon: <Palette size={14} color="#FB7185" /> },
                  { label: "Apps", uri: "ms-settings:appsfeatures", icon: <AppWindow size={14} color="#A78BFA" /> },
                  { label: "Storage", uri: "ms-settings:storagesense", icon: <HardDrive size={14} color="#94A3B8" /> },
                  { label: "Gaming", uri: "ms-settings:gaming-gamemode", icon: <Gamepad2 size={14} color="#C084FC" /> },
                  { label: "System", uri: "ms-settings:about", icon: <Cpu size={14} color="var(--lens-fg)" /> },
                  { label: "Updates", uri: "ms-settings:windowsupdate", icon: <RefreshCw size={14} color="#34D399" /> },
                  { label: "Security", uri: "ms-settings:windowsdefender", icon: <Shield size={14} color="#60A5FA" /> },
                ].map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    className="qs-win-item"
                    onClick={() => openSetting(item.uri)}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>

              <button
                type="button"
                className="qs-expand-btn"
                onClick={() => {
                  invoke("hide_surface", { label: "quicksettings" });
                  invoke("toggle_surface", { label: "widgets" });
                }}
              >
                <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                  <Activity size={14} color="var(--lens-fg)" />
                  Open Full Widget Drawer
                </span>
                <span style={{ fontSize: 10.5, color: "var(--lens-fg-muted)" }}>{config?.func.widgetsHotkey || "Ctrl+Alt+W"}</span>
              </button>

              <button
                type="button"
                className="qs-popout-btn"
                onClick={() => {
                  invoke("hide_surface", { label: "quicksettings" });
                  invoke("open_surface", { label: "settings" });
                }}
              >
                <SlidersHorizontal size={14} strokeWidth={2.5} />
                <span>Open Full Lens Control Center</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
