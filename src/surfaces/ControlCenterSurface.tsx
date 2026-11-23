import React, { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { FOLDER_THEMES, FRAME_STYLES, applyThemePack } from "../themes/packs";
import { WindowRulesCard } from "../components/WindowRulesCard";
import { SessionRestoreCard } from "../components/SessionRestoreCard";
import { ShellModeCard } from "../components/ShellModeCard";
import { TilingCard } from "../components/TilingCard";
import { WorkspacesCard } from "../components/WorkspacesCard";
import { DesktopGroupsCard } from "../components/DesktopGroupsCard";
import { BackupRestoreCard } from "../components/BackupRestoreCard";
import { McpCard } from "../components/McpCard";
import { PluginManagerCard } from "../components/PluginManagerCard";
import { ShellKeysCard } from "../components/ShellKeysCard";
import { MonitorPickerCard } from "../components/MonitorPickerCard";
import { HotCornersCard } from "../components/HotCornersCard";
import { AltDragCard } from "../components/AltDragCard";
import { AppSummonCard } from "../components/AppSummonCard";
import { UpdatesCard } from "../components/UpdatesCard";
import { CrashReportsCard } from "../components/CrashReportsCard";
import { PlaygroundCard } from "../components/PlaygroundCard";
import { AiCard } from "../components/AiCard";
import { CommandCard } from "../components/CommandCard";
import { ClipboardCard } from "../components/ClipboardCard";
import { ConnectionsCard } from "../bridge/ConnectionsCard";
import { BridgeInbox } from "../bridge/BridgeInbox";
import { TranscriptionCard } from "../media/TranscriptionCard";
import {
  Palette,
  PanelBottom,
  PanelTop,
  Sliders,
  CircleDot,
  Layers,
  FolderHeart,
  LayoutGrid,
  RotateCcw,
  Power,
  Sparkles,
  Monitor,
  Wifi,
  Bluetooth,
  Volume2,
  Zap,
  HardDrive,
  Shield,
  RefreshCw,
  AppWindow,
  Gamepad2,
  Cpu,
  Clock,
  Keyboard,
  Bot,
  Sun,
  Moon,
  VolumeX,
  ExternalLink,
  Activity,
  X,
  Search,
  Columns2,
  Minus,
  MessageSquare,
} from "lucide-react";
import { useLensState, useRunningWindows, useSurfaceGlide } from "../hooks/useLensState";
import { TrafficLights } from "../components/TrafficLights";
import { RotaryDial } from "../components/RotaryDial";
import { PillFillBar } from "../components/PillFillBar";
import { SetupWizard } from "../components/SetupWizard";
import { ThemeTab } from "../themeux/ThemeTab";
import { DockTab } from "../themeux/DockTab";
import { AgentsPane } from "../components/AgentsPane";
import { MessagingHubPane } from "../components/MessagingHubPane";
import "./ControlCenterSurface.css";

type TabId =
  | "theme"
  | "dock"
  | "topbar"
  | "func"
  | "controls"
  | "sessions"
  | "folders"
  | "widgets"
  | "system"
  | "monitor"
  | "messages"
  | "ai"
  | "agents";

interface ProcessEntry {
  pid: number;
  name: string;
  cpuUsage: number;
  memoryMb: number;
}

export const ControlCenterSurface: React.FC = () => {
  const { config, winTheme, updateConfig } = useLensState();
  const runningWindows = useRunningWindows(1400);
  const glidePhase = useSurfaceGlide("settings");
  // `?tab=` lets the visual parity harness open a given tab; the app always starts on Windows & Quick.
  const [tab, setTab] = useState<TabId>(
    () => (new URLSearchParams(window.location.search).get("tab") as TabId | null) ?? "system"
  );
  const stageRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLElement>(null);
  // Each tab opens at the top instead of inheriting the previous tab's scroll position.
  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 });
  }, [tab]);
  const lastReportedHRef = useRef<number>(0);
  const [showWizardManual, setShowWizardManual] = useState(false);
  const [topProcesses, setTopProcesses] = useState<ProcessEntry[]>([]);
  const [cpuHistory, setCpuHistory] = useState<number[]>([18, 22, 20, 26, 24, 29, 25, 21, 24, 28, 26, 23]);
  const [monitorMode, setMonitorMode] = useState<"windows" | "processes">("windows");
  const [monitorFilter, setMonitorFilter] = useState("");
  const [qs, setQs] = useState<{
    volume: number;
    muted: boolean;
    brightness: number;
    nightLightEnabled: boolean;
    nightLightWarmth: number;
  }>({
    volume: 50,
    muted: false,
    brightness: 80,
    nightLightEnabled: false,
    nightLightWarmth: 40,
  });
  const [audioSessions, setAudioSessions] = useState<
    { pid: number; name: string; volume: number; muted: boolean; iconDataUrl?: string | null }[]
  >([]);
  const [telemetry, setTelemetry] = useState<{
    cpuUsage: number;
    memUsedGb: number;
    memTotalGb: number;
    uptimeMinutes: number;
  } | null>(null);
  const [folderPathInput, setFolderPathInput] = useState("");
  const [folderThemeChoice, setFolderThemeChoice] = useState("accent");
  const [folderStatus, setFolderStatus] = useState<string | null>(null);
  const [selfTest, setSelfTest] = useState<string | null>(null);
  const [newSessionName, setNewSessionName] = useState("");
  const [windhawkStatus, setWindhawkStatus] = useState<{
    installed: boolean;
    exePath: string | null;
    modSourcePath: string;
    modInstalledInWindhawk: boolean;
  } | null>(null);
  const [windhawkMsg, setWindhawkMsg] = useState<string | null>(null);

  const refreshWindhawk = () => {
    invoke<{
      installed: boolean;
      exePath: string | null;
      modSourcePath: string;
      modInstalledInWindhawk: boolean;
    }>("get_windhawk_status_cmd")
      .then(setWindhawkStatus)
      .catch(() => {});
  };

  const refreshProcesses = () => {
    invoke<ProcessEntry[]>("list_top_processes_cmd")
      .then((p) => setTopProcesses(Array.isArray(p) ? p : []))
      .catch(() => {});
  };

  useEffect(() => {
    refreshWindhawk();
    const pollStats = () => {
      invoke<NonNullable<typeof telemetry>>("get_telemetry_cmd")
        .then((t) => {
          setTelemetry(t);
          setCpuHistory((prev) => [...prev.slice(-17), Math.max(4, Math.min(100, Math.round(t.cpuUsage)))]);
        })
        .catch(() => {});
    };
    pollStats();
    if (tab === "system") {
      invoke<typeof qs>("get_quick_state_cmd").then(setQs).catch(() => {});
      invoke<typeof audioSessions>("list_audio_sessions_cmd").then(setAudioSessions).catch(() => {});
    }
    if (tab === "monitor") {
      refreshProcesses();
    }
    const timer = window.setInterval(() => {
      pollStats();
      if (tab === "monitor") refreshProcesses();
    }, 2500);
    return () => window.clearInterval(timer);
  }, [tab]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        invoke("hide_surface", { label: "settings" }).catch(() => {});
      }
    };
    const unlistenTab = listen<string>("lens://settings-tab", (e) => {
      if (e.payload) {
        setTab(e.payload as TabId);
      }
    });
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      unlistenTab.then((fn) => fn());
    };
  }, []);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const syncHeight = () => {
      // Account for the Top Info & Quick Tools bar (44px) + vertical padding so nothing ever clips
      const contentH = Math.ceil(el.scrollHeight + 86);
      if (Math.abs(contentH - lastReportedHRef.current) > 4) {
        lastReportedHRef.current = contentH;
        invoke("set_settings_content_height_cmd", { height: contentH }).catch(() => {});
      }
    };
    const raf = requestAnimationFrame(syncHeight);
    const t = window.setTimeout(syncHeight, 120);
    const ro = new ResizeObserver(syncHeight);
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t);
      ro.disconnect();
    };
  }, [tab, audioSessions.length, config?.onboardingCompleted, showWizardManual]);

  if (!config) return null;

  const _appWindow = getCurrentWindow();
  void _appWindow;

  const navItems: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: "system", label: "Windows & Quick", icon: <Monitor size={15} strokeWidth={2.2} color="#38BDF8" /> },
    { id: "monitor", label: "Stats & Tasks", icon: <Activity size={15} strokeWidth={2.2} color="#34D399" /> },
    { id: "messages", label: "Messages", icon: <MessageSquare size={15} strokeWidth={2.2} color="#60A5FA" /> },
    { id: "theme", label: "Theme & Look", icon: <Palette size={15} strokeWidth={2.2} color="#A78BFA" /> },
    { id: "dock", label: "Dock & Top Bar", icon: <PanelBottom size={15} strokeWidth={2.2} color="#60A5FA" /> },
    { id: "folders", label: "Folder Icons", icon: <FolderHeart size={15} strokeWidth={2.2} color="#FBBF24" /> },
    { id: "sessions", label: "Desktops & Widgets", icon: <Layers size={15} strokeWidth={2.2} color="#818CF8" /> },
    { id: "ai", label: "AI & Command", icon: <Sparkles size={15} strokeWidth={2.2} color="#F472B6" /> },
    { id: "agents", label: "Agents", icon: <Bot size={15} strokeWidth={2.2} color="#22D3EE" /> },
  ];

  const activeAccentHex =
    config.theme.accentMode === "custom"
      ? config.theme.customAccent
      : winTheme.accentHex;

  // All theme application goes through the shared pack registry (src/themes/packs.ts)
  const applyPack = (packId: string) => {
    const next = applyThemePack(config, packId);
    updateConfig(next);
    setFolderThemeChoice(next.folderStyle?.theme ?? "accent");
  };

  const applyMasterTheme = (id: "obsidian" | "windows-mesh" | "stealth" | "midnight-neon") => {
    applyPack(id === "stealth" ? "graphite" : id === "midnight-neon" ? "midnight" : id);
  };

  const handleApplyFolderTheme = async () => {
    if (!folderPathInput.trim()) return;
    setFolderStatus(null);
    try {
      await invoke("apply_folder_theme_cmd", {
        folderPath: folderPathInput.trim(),
        theme: folderThemeChoice,
        accentHex: activeAccentHex,
      });
      setFolderStatus("Applied native folder theme cleanly.");
    } catch (err) {
      setFolderStatus(`Error: ${String(err)}`);
    }
  };

  const handleApplyGlobalExplorerFolders = async () => {
    setFolderStatus(null);
    try {
      await invoke("apply_global_folder_theme_cmd", {
        theme: folderThemeChoice,
        accentHex: activeAccentHex,
      });
      setFolderStatus(`Replaced ALL Windows Explorer folder icons with "${folderThemeChoice}" theme! (Restart Explorer or refresh folder to see everywhere.)`);
    } catch (err) {
      setFolderStatus(`Error: ${String(err)}`);
    }
  };

  const handleRevertGlobalExplorerFolders = async () => {
    setFolderStatus(null);
    try {
      await invoke("revert_global_folder_theme_cmd");
      setFolderStatus("Restored default Windows Explorer folder icons.");
    } catch (err) {
      setFolderStatus(`Error: ${String(err)}`);
    }
  };

  const handleApplyAllUserFolders = async () => {
    setFolderStatus(null);
    try {
      const count = await invoke<number>("apply_all_user_folders_cmd", {
        theme: folderThemeChoice,
        accentHex: activeAccentHex,
      });
      setFolderStatus(`Styled ${count} core Windows user folders with "${folderThemeChoice}".`);
    } catch (err) {
      setFolderStatus(`Error: ${String(err)}`);
    }
  };

  const handleRevertAllUserFolders = async () => {
    setFolderStatus(null);
    try {
      await invoke("revert_all_user_folders_cmd");
      setFolderStatus("Reverted all styled user folders.");
    } catch (err) {
      setFolderStatus(`Error: ${String(err)}`);
    }
  };

  const handleRevertFolder = async (path: string) => {
    await invoke("revert_folder_theme_cmd", { folderPath: path });
    setFolderStatus(`Reverted ${path}`);
  };

  return (
    <div className={`cc-shell lens-glass lens-glide-dock ${glidePhase}`}>
      {(showWizardManual || config.onboardingCompleted === false) && (
        <SetupWizard
          config={config}
          winTheme={winTheme}
          onUpdateConfig={updateConfig}
          onApplyMasterTheme={applyMasterTheme}
          onFinish={() => setShowWizardManual(false)}
        />
      )}
      {/* Top Info & Quick Tools Bar (live system status + 1-click obsidian utilities) */}
      <div
        style={{
          height: 44,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          padding: "0 14px",
          borderBottom: "1px solid rgb(var(--lens-ink) / 0.08)",
          background: "rgb(var(--lens-ink) / 0.02)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--lens-fg)", letterSpacing: "-0.01em", whiteSpace: "nowrap" }}>
            {navItems.find((n) => n.id === tab)?.label ?? "Lens Control Center"}
          </span>
          <span style={{ width: 1, height: 14, background: "rgb(var(--lens-ink) / 0.12)" }} />
          <button
            type="button"
            className="cc-chip"
            style={{ padding: "4px 8px", fontSize: 11, display: "inline-flex", alignItems: "center", gap: 4, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}
            onClick={() => setTab("monitor")}
          >
            <Cpu size={12} color="#34D399" />
            <span>CPU {telemetry ? `${Math.round(telemetry.cpuUsage)}%` : "--"}</span>
          </button>
          <button
            type="button"
            className="cc-chip"
            style={{ padding: "4px 8px", fontSize: 11, display: "inline-flex", alignItems: "center", gap: 4, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}
            onClick={() => setTab("monitor")}
          >
            <HardDrive size={12} color="#38BDF8" />
            <span>
              RAM {telemetry ? `${telemetry.memUsedGb}/${telemetry.memTotalGb}G` : "--"}
            </span>
          </button>
          <span className="cc-hide-narrow" style={{ fontSize: 11, color: "var(--lens-fg-secondary)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
            {runningWindows.length} windows
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          <button
            type="button"
            className="cc-chip cc-hide-narrow"
            style={{ padding: "4px 9px", fontSize: 11, display: "inline-flex", alignItems: "center", gap: 5 }}
            onClick={() => invoke("tile_windows_cmd", { layout: "split" }).catch(() => {})}
          >
            <Columns2 size={12} color="#38BDF8" />
            <span>50/50 Tile</span>
          </button>
          <button
            type="button"
            className="cc-chip cc-hide-narrow"
            style={{ padding: "4px 9px", fontSize: 11, display: "inline-flex", alignItems: "center", gap: 5 }}
            onClick={() => invoke("tile_windows_cmd", { layout: "smart-group" }).catch(() => {})}
          >
            <Sparkles size={12} color="#FBBF24" />
            <span>Smart Group</span>
          </button>
          <button
            type="button"
            className={`cc-chip ${qs.nightLightEnabled ? "active" : ""}`}
            style={{ padding: "4px 9px", fontSize: 11, display: "inline-flex", alignItems: "center", gap: 5 }}
            onClick={() => {
              const next = !qs.nightLightEnabled;
              setQs((prev) => ({ ...prev, nightLightEnabled: next }));
              invoke("set_night_light_cmd", { enabled: next, warmth: qs.nightLightWarmth || 45 }).catch(() => {});
            }}
          >
            <Moon size={12} color={qs.nightLightEnabled ? "var(--lens-on-fg, #09090b)" : "#FB923C"} />
            <span>Night</span>
          </button>
          <button
            type="button"
            className={`cc-chip ${tab === "messages" ? "active" : ""}`}
            style={{ padding: "4px 9px", fontSize: 11, display: "inline-flex", alignItems: "center", gap: 5 }}
            onClick={() => setTab("messages")}
          >
            <MessageSquare size={12} color={tab === "messages" ? "var(--lens-on-fg, #09090b)" : "#60A5FA"} />
            <span>Messages</span>
          </button>
          <button
            type="button"
            className={`cc-chip ${tab === "monitor" ? "active" : ""}`}
            style={{ padding: "4px 9px", fontSize: 11, display: "inline-flex", alignItems: "center", gap: 5 }}
            onClick={() => setTab("monitor")}
          >
            <Activity size={12} color={tab === "monitor" ? "var(--lens-on-fg, #09090b)" : "#34D399"} />
            <span>Tasks</span>
          </button>
        </div>
      </div>

      <div className="cc-body">
        <aside className="cc-sidebar">
          {navItems.map((n) => (
            <button
              key={n.id}
              type="button"
              className={`cc-nav-btn ${tab === n.id ? "active" : ""}`}
              onClick={() => setTab(n.id)}
            >
              {n.icon}
              <span>{n.label}</span>
            </button>
          ))}

          <div style={{ flex: 1 }} />

          <button
            type="button"
            className="cc-nav-btn"
            style={{ color: "var(--lens-fg)" }}
            onClick={() => setShowWizardManual(true)}
          >
            <Sparkles size={15} strokeWidth={2.2} color="#F472B6" />
            <span>Setup Wizard</span>
          </button>

          <button
            type="button"
            className="cc-nav-btn"
            style={{ color: "#fb7185" }}
            onClick={() => invoke("quit_lens")}
          >
            <Power size={15} />
            <span>Quit Lens UI</span>
          </button>
        </aside>

        <main className="cc-content" ref={contentRef}>
          <div ref={stageRef} key={tab} className="lens-tab-stage">
          {tab === "monitor" && (
            <>
              {/* Live Computer Stats Hero Grid */}
              <div style={{ display: "grid", gridTemplateColumns: "1.35fr 1fr 0.85fr", gap: 10 }}>
                {/* CPU Load + Live Sparkline Graph */}
                <div className="cc-card" style={{ gap: 8, padding: "12px 14px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span className="cc-label" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5 }}>
                      <Cpu size={14} color="#34D399" />
                      <span>CPU Load</span>
                    </span>
                    <span style={{ fontSize: 16, fontWeight: 700, color: "#34D399", fontVariantNumeric: "tabular-nums" }}>
                      {telemetry ? `${Math.round(telemetry.cpuUsage)}%` : "--"}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 38, paddingTop: 4 }}>
                    {cpuHistory.map((val, i) => (
                      <div
                        key={i}
                        style={{
                          flex: 1,
                          height: `${Math.max(10, val)}%`,
                          borderRadius: 3,
                          background:
                            i === cpuHistory.length - 1
                              ? "#34D399"
                              : val > 75
                                ? "rgb(251 113 133 / 0.72)"
                                : "rgb(52 211 153 / 0.34)",
                          transition: "height 220ms ease",
                        }}
                      />
                    ))}
                  </div>
                </div>

                {/* Memory Usage */}
                <div className="cc-card" style={{ gap: 8, padding: "12px 14px", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span className="cc-label" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5 }}>
                      <HardDrive size={14} color="#38BDF8" />
                      <span>Memory</span>
                    </span>
                    <span style={{ fontSize: 13.5, fontWeight: 700, color: "#38BDF8", fontVariantNumeric: "tabular-nums" }}>
                      {telemetry ? `${Math.round((telemetry.memUsedGb / Math.max(1, telemetry.memTotalGb)) * 100)}%` : "--"}
                    </span>
                  </div>
                  <div style={{ height: 8, borderRadius: 999, background: "rgb(var(--lens-ink) / 0.08)", overflow: "hidden" }}>
                    <div
                      style={{
                        height: "100%",
                        width: `${telemetry ? Math.min(100, (telemetry.memUsedGb / Math.max(1, telemetry.memTotalGb)) * 100) : 0}%`,
                        background: "linear-gradient(90deg, #38BDF8, #818CF8)",
                        borderRadius: 999,
                        transition: "width 260ms ease",
                      }}
                    />
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--lens-fg-secondary)", fontVariantNumeric: "tabular-nums" }}>
                    {telemetry ? `${telemetry.memUsedGb} GB / ${telemetry.memTotalGb} GB used` : "Reading memory..."}
                  </div>
                </div>

                {/* Uptime & Windows Task Manager shortcut */}
                <div className="cc-card" style={{ gap: 7, padding: "12px 14px", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <Clock size={14} color="#A78BFA" />
                    <span className="cc-label" style={{ fontSize: 12.5 }}>Uptime</span>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "var(--lens-fg)", fontVariantNumeric: "tabular-nums" }}>
                    {telemetry
                      ? `${Math.floor(telemetry.uptimeMinutes / 60)}h ${telemetry.uptimeMinutes % 60}m`
                      : "--"}
                  </div>
                  <button
                    type="button"
                    className="cc-chip"
                    style={{ padding: "4px 8px", fontSize: 11, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5 }}
                    onClick={() => invoke("launch_app_cmd", { path: "taskmgr.exe" }).catch(() => {})}
                  >
                    <ExternalLink size={11} />
                    <span>Win TaskMgr</span>
                  </button>
                </div>
              </div>

              {/* LensUI Obsidian Task Manager */}
              <div className="cc-card" style={{ gap: 10, padding: "12px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      type="button"
                      className={`cc-chip ${monitorMode === "windows" ? "active" : ""}`}
                      style={{ padding: "5px 11px", fontSize: 12, fontWeight: 600 }}
                      onClick={() => setMonitorMode("windows")}
                    >
                      Open Windows ({runningWindows.length})
                    </button>
                    <button
                      type="button"
                      className={`cc-chip ${monitorMode === "processes" ? "active" : ""}`}
                      style={{ padding: "5px 11px", fontSize: 12, fontWeight: 600 }}
                      onClick={() => {
                        setMonitorMode("processes");
                        refreshProcesses();
                      }}
                    >
                      Top Processes ({topProcesses.length})
                    </button>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, maxWidth: 260 }}>
                    <div
                      style={{
                        flex: 1,
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "0 9px",
                        height: 30,
                        borderRadius: 8,
                        background: "rgb(0 0 0 / calc(0.45 * var(--lens-well-k, 1)))",
                        border: "1px solid var(--lens-border)",
                      }}
                    >
                      <Search size={13} color="var(--lens-fg-muted)" />
                      <input
                        style={{
                          flex: 1,
                          minWidth: 0,
                          background: "transparent",
                          border: "none",
                          outline: "none",
                          fontSize: 12,
                          color: "var(--lens-fg)",
                          userSelect: "text",
                        }}
                        placeholder="Filter apps or processes..."
                        value={monitorFilter}
                        onChange={(e) => setMonitorFilter(e.target.value)}
                      />
                    </div>
                    <button
                      type="button"
                      className="cc-chip"
                      style={{ height: 30, padding: "0 9px", display: "inline-flex", alignItems: "center" }}
                      onClick={refreshProcesses}
                    >
                      <RefreshCw size={13} />
                    </button>
                  </div>
                </div>

                {monitorMode === "windows" ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 330, overflowY: "auto", paddingRight: 2 }}>
                    {runningWindows
                      .filter((w) => {
                        const q = monitorFilter.trim().toLowerCase();
                        if (!q) return true;
                        return (
                          w.title.toLowerCase().includes(q) ||
                          w.processName.toLowerCase().includes(q)
                        );
                      })
                      .map((w) => (
                        <div
                          key={w.hwnd}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            padding: "7px 10px",
                            borderRadius: 9,
                            background: w.isFocused ? "rgb(52 211 153 / 0.08)" : "rgb(var(--lens-ink) / 0.03)",
                            border: w.isFocused ? "1px solid rgb(52 211 153 / 0.25)" : "1px solid var(--lens-border)",
                          }}
                        >
                          {w.iconDataUrl ? (
                            <img src={w.iconDataUrl} alt="" style={{ width: 20, height: 20, objectFit: "contain", flexShrink: 0 }} />
                          ) : (
                            <AppWindow size={18} color="#38BDF8" style={{ flexShrink: 0 }} />
                          )}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--lens-fg)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {w.title || w.processName}
                            </div>
                            <div style={{ fontSize: 10.5, color: "var(--lens-fg-muted)" }}>
                              {w.processName} · {w.isFocused ? "Focused" : w.isMinimized ? "Minimized" : "Running"}
                            </div>
                          </div>
                          <button
                            type="button"
                            className="cc-chip"
                            style={{ padding: "4px 9px", fontSize: 11 }}
                            onClick={() => invoke("focus_window_cmd", { hwnd: w.hwnd })}
                          >
                            Focus
                          </button>
                          <button
                            type="button"
                            className="cc-chip"
                            style={{ padding: "4px 7px" }}
                            onClick={() => invoke("window_action_cmd", { hwnd: w.hwnd, action: "minimize" })}
                          >
                            <Minus size={12} />
                          </button>
                          <button
                            type="button"
                            className="cc-chip"
                            style={{ padding: "4px 8px", color: "#fb7185", borderColor: "rgb(251 113 133 / 0.22)" }}
                            onClick={() => invoke("window_action_cmd", { hwnd: w.hwnd, action: "close" })}
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 330, overflowY: "auto", paddingRight: 2 }}>
                    {topProcesses
                      .filter((p) => {
                        const q = monitorFilter.trim().toLowerCase();
                        if (!q) return true;
                        return p.name.toLowerCase().includes(q) || String(p.pid).includes(q);
                      })
                      .map((p) => (
                        <div
                          key={p.pid}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 72px 86px 76px",
                            alignItems: "center",
                            gap: 8,
                            padding: "7px 10px",
                            borderRadius: 9,
                            background: "rgb(var(--lens-ink) / 0.03)",
                            border: "1px solid var(--lens-border)",
                          }}
                        >
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--lens-fg)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {p.name}
                            </div>
                            <div style={{ fontSize: 10.5, color: "var(--lens-fg-muted)", fontVariantNumeric: "tabular-nums" }}>
                              PID {p.pid}
                            </div>
                          </div>
                          <div style={{ fontSize: 11.5, fontWeight: 600, color: p.cpuUsage > 15 ? "#fb7185" : "#34D399", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                            {p.cpuUsage.toFixed(1)}% CPU
                          </div>
                          <div style={{ fontSize: 11.5, fontWeight: 600, color: "#38BDF8", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                            {p.memoryMb >= 1024 ? `${(p.memoryMb / 1024).toFixed(2)} GB` : `${Math.round(p.memoryMb)} MB`}
                          </div>
                          <button
                            type="button"
                            className="cc-chip"
                            style={{ padding: "4px 8px", fontSize: 11, color: "#fb7185", borderColor: "rgb(251 113 133 / 0.25)", justifyContent: "center" }}
                            onClick={() => {
                              invoke("kill_process_pid_cmd", { pid: p.pid })
                                .then(() => window.setTimeout(refreshProcesses, 250))
                                .catch(() => {});
                            }}
                          >
                            End Task
                          </button>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </>
          )}

          {tab === "messages" && (
            <MessagingHubPane runningWindows={runningWindows} />
          )}

          {tab === "theme" && (
            <ThemeTab
              config={config}
              winTheme={winTheme}
              updateConfig={updateConfig}
              onApplyPack={(next) => {
                updateConfig(next);
                setFolderThemeChoice(next.folderStyle?.theme ?? "accent");
              }}
              onOpenTab={(t) => setTab(t)}
            />
          )}

          {tab === "dock" && <DockTab config={config} accent={activeAccentHex} updateConfig={updateConfig} />}

          {(tab === "dock" || tab === "topbar") && (
            <>
              <div>
                <div className="cc-section-title">Top Bar</div>
                <div className="cc-section-sub">
                  Auto-hide on overlap keeps browser tabs and maximized titlebars clear, revealing smoothly when your cursor touches the top edge.
                </div>
              </div>

              <div className="cc-card">
                <div className="cc-row">
                  <div>
                    <div className="cc-label">Enable Top Bar</div>
                    <div className="cc-desc">Desktop sessions switcher, active app title, and clock</div>
                  </div>
                  <button
                    type="button"
                    className={`cc-toggle ${config.topBar?.enabled && config.dock.showTopBar ? "on" : ""}`}
                    onClick={() => {
                      const next = !(config.topBar?.enabled && config.dock.showTopBar);
                      updateConfig({
                        ...config,
                        dock: { ...config.dock, showTopBar: next },
                        topBar: { ...(config.topBar ?? { enabled: true, autoHide: "overlap", revealDelayMs: 100, hideDelayMs: 350, height: 34, floating: false }), enabled: next },
                      });
                    }}
                  />
                </div>

                <div className="cc-row">
                  <div>
                    <div className="cc-label">Auto-Hide Mode</div>
                    <div className="cc-desc">On Overlap dodges maximized or top-edge windows automatically</div>
                  </div>
                  <div className="cc-chip-grid">
                    {[
                      { id: "overlap", label: "On Overlap" },
                      { id: "never", label: "Always Visible" },
                      { id: "always", label: "Always Auto-Hide" },
                    ].map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        className={`cc-chip ${(config.topBar?.autoHide ?? "overlap") === m.id ? "active" : ""}`}
                        onClick={() =>
                          updateConfig({
                            ...config,
                            topBar: { ...(config.topBar ?? { enabled: true, autoHide: "overlap", revealDelayMs: 100, hideDelayMs: 350, height: 34, floating: false }), autoHide: m.id },
                          })
                        }
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="cc-row">
                  <div>
                    <div className="cc-label">Bar Style</div>
                    <div className="cc-desc">Full-width edge strip or floating rounded glass pill</div>
                  </div>
                  <div className="cc-chip-grid">
                    <button
                      type="button"
                      className={`cc-chip ${!(config.topBar?.floating) ? "active" : ""}`}
                      onClick={() =>
                        updateConfig({
                          ...config,
                          topBar: { ...(config.topBar ?? { enabled: true, autoHide: "overlap", revealDelayMs: 100, hideDelayMs: 350, height: 34, floating: false }), floating: false },
                        })
                      }
                    >
                      Full-Width
                    </button>
                    <button
                      type="button"
                      className={`cc-chip ${config.topBar?.floating ? "active" : ""}`}
                      onClick={() =>
                        updateConfig({
                          ...config,
                          topBar: { ...(config.topBar ?? { enabled: true, autoHide: "overlap", revealDelayMs: 100, hideDelayMs: 350, height: 34, floating: false }), floating: true },
                        })
                      }
                    >
                      Floating Pill
                    </button>
                  </div>
                </div>

                <div style={{ height: 1, background: "var(--lens-border)", margin: "4px 0" }} />
                <RotaryDial
                  label="Bar Height"
                  description="Vertical thickness of the top bar."
                  value={config.topBar?.height ?? 34}
                  min={28}
                  max={44}
                  step={2}
                  unit="px"
                  defaultValue={34}
                  onChange={(v) =>
                    updateConfig({
                      ...config,
                      topBar: {
                        ...(config.topBar ?? { enabled: true, autoHide: "overlap", revealDelayMs: 100, hideDelayMs: 350, height: 34, floating: false }),
                        height: v,
                      },
                    })
                  }
                />
                <div style={{ height: 1, background: "var(--lens-border)" }} />
                <RotaryDial
                  label="Reveal Delay"
                  description="Wait time before sliding in when cursor hits the top edge."
                  value={config.topBar?.revealDelayMs ?? 100}
                  min={0}
                  max={500}
                  step={25}
                  unit="ms"
                  defaultValue={100}
                  onChange={(v) =>
                    updateConfig({
                      ...config,
                      topBar: {
                        ...(config.topBar ?? { enabled: true, autoHide: "overlap", revealDelayMs: 100, hideDelayMs: 350, height: 34, floating: false }),
                        revealDelayMs: v,
                      },
                    })
                  }
                />
                <div style={{ height: 1, background: "var(--lens-border)" }} />
                <RotaryDial
                  label="Hide Delay"
                  description="Wait time before auto-hiding again after cursor leaves."
                  value={config.topBar?.hideDelayMs ?? 350}
                  min={100}
                  max={1200}
                  step={50}
                  unit="ms"
                  defaultValue={350}
                  onChange={(v) =>
                    updateConfig({
                      ...config,
                      topBar: {
                        ...(config.topBar ?? { enabled: true, autoHide: "overlap", revealDelayMs: 100, hideDelayMs: 350, height: 34, floating: false }),
                        hideDelayMs: v,
                      },
                    })
                  }
                />
              </div>
            </>
          )}

          {tab === "controls" && (
            <>
              <div>
                <div className="cc-section-title">Window Style &amp; Controls</div>
                <div className="cc-section-sub">
                  Zero-injection, anti-cheat &amp; Defender safe window styling for you and friends.
                </div>
              </div>

              <div className="cc-card">
                <div className="cc-row">
                  <div>
                    <div className="cc-label">Lens Traffic Lights Preview</div>
                    <div className="cc-desc">Hover to reveal glyphs (+ − ×)</div>
                  </div>
                  <div
                    style={{
                      padding: "8px 14px",
                      borderRadius: 999,
                      background: "rgb(0 0 0 / calc(0.35 * var(--lens-well-k, 1)))",
                      border: "1px solid var(--lens-border)",
                    }}
                  >
                    <TrafficLights
                      styleVariant={config.windowControls.style}
                      order={config.windowControls.order}
                      onMaximize={() => {}}
                      onMinimize={() => {}}
                      onClose={() => {}}
                    />
                  </div>
                </div>

                <div className="cc-row">
                  <div>
                    <div className="cc-label">Replace Native — ❐ × Buttons (Experimental)</div>
                    <div className="cc-desc">Off by default · Lens windows always keep native Green · Yellow · Red buttons</div>
                  </div>
                  <button
                    type="button"
                    className={`cc-toggle ${config.windowControls.enabled ? "on" : ""}`}
                    onClick={() =>
                      updateConfig({
                        ...config,
                        windowControls: {
                          ...config.windowControls,
                          enabled: !config.windowControls.enabled,
                        },
                      })
                    }
                  />
                </div>

                <div className="cc-row">
                  <div className="cc-label">Button Order</div>
                  <div className="cc-chip-grid">
                    <button
                      type="button"
                      className={`cc-chip ${config.windowControls.order === "green-yellow-red" ? "active" : ""}`}
                      onClick={() =>
                        updateConfig({
                          ...config,
                          windowControls: { ...config.windowControls, order: "green-yellow-red" },
                        })
                      }
                    >
                      Green · Yellow · Red
                    </button>
                    <button
                      type="button"
                      className={`cc-chip ${config.windowControls.order === "red-yellow-green" ? "active" : ""}`}
                      onClick={() =>
                        updateConfig({
                          ...config,
                          windowControls: { ...config.windowControls, order: "red-yellow-green" },
                        })
                      }
                    >
                      Red · Yellow · Green
                    </button>
                  </div>
                </div>

                <div className="cc-row">
                  <div className="cc-label">Control Theme</div>
                  <div className="cc-chip-grid">
                    {[
                      { id: "traffic-classic", label: "Classic Lights" },
                      { id: "traffic-muted", label: "Muted Obsidian" },
                      { id: "minimal-dots", label: "Minimal Dots" },
                      { id: "accent-pills", label: "Sleek Pills" },
                    ].map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        className={`cc-chip ${config.windowControls.style === s.id ? "active" : ""}`}
                        onClick={() =>
                          updateConfig({
                            ...config,
                            windowControls: { ...config.windowControls, style: s.id },
                          })
                        }
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="cc-row">
                  <div>
                    <div className="cc-label">Window Frame</div>
                    <div className="cc-desc">
                      {winTheme.osFeatures && !winTheme.osFeatures.frameColors
                        ? "Needs Windows 11"
                        : "Border drawn around every app window"}
                    </div>
                  </div>
                  <div
                    className="cc-chip-grid"
                    style={
                      winTheme.osFeatures && !winTheme.osFeatures.frameColors
                        ? { opacity: 0.45, pointerEvents: "none" }
                        : undefined
                    }
                    aria-disabled={winTheme.osFeatures ? !winTheme.osFeatures.frameColors : undefined}
                  >
                    {FRAME_STYLES.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        className={`cc-chip ${(config.windowControls.frameStyle ?? "obsidian-hairline") === f.id ? "active" : ""}`}
                        onClick={() =>
                          updateConfig({
                            ...config,
                            windowControls: { ...config.windowControls, frameStyle: f.id },
                          })
                        }
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <WindowRulesCard />

              <div className="cc-card">
                <div className="cc-label">Safe Native Windows Integration (Zero DLL Injection)</div>
                <div className="cc-row">
                  <div>
                    <div className="cc-label">Native Windows Titlebar &amp; Border Accent</div>
                    <div className="cc-desc">Toggles Windows DWM ColorPrevalence cleanly via HKCU (safe with games &amp; Defender)</div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      className="cc-btn"
                      onClick={() => invoke("set_windows_titlebar_accent_cmd", { enabled: true })}
                    >
                      Enable
                    </button>
                    <button
                      type="button"
                      className="cc-btn-ghost"
                      onClick={() => invoke("set_windows_titlebar_accent_cmd", { enabled: false })}
                    >
                      Default
                    </button>
                  </div>
                </div>

                <div className="cc-row">
                  <div>
                    <div className="cc-label">
                      Windhawk Native Window Engine{" "}
                      <span
                        style={{
                          fontSize: 11,
                          marginLeft: 6,
                          padding: "2px 7px",
                          borderRadius: 6,
                          background: windhawkStatus?.installed
                            ? "rgb(34 197 94 / 0.16)"
                            : "rgb(var(--lens-ink) / 0.08)",
                          color: windhawkStatus?.installed ? "#4ade80" : "var(--lens-fg-secondary)",
                        }}
                      >
                        {windhawkStatus?.installed ? "Installed" : "Not Installed"}
                      </span>
                    </div>
                    <div className="cc-desc">
                      Bundled audited lens-window-style.wh.cpp — retroactively styles real Win32 titlebars, borders &amp; corners in-process
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    {!windhawkStatus?.installed && (
                      <button
                        type="button"
                        className="cc-btn"
                        onClick={async () => {
                          setWindhawkMsg("Launching Windhawk installer via winget...");
                          await invoke("install_windhawk_cmd");
                        }}
                      >
                        Install Windhawk
                      </button>
                    )}
                    <button
                      type="button"
                      className={windhawkStatus?.installed ? "cc-btn" : "cc-btn-ghost"}
                      onClick={async () => {
                        try {
                          const borderHex =
                            config.theme.accentTintStrength > 0.04 ? activeAccentHex : "#27272C";
                          const out = await invoke<string>("sync_windhawk_mod_cmd", {
                            captionHex: "#0C0C0F",
                            borderHex,
                            borderRadius: config.theme.borderRadius,
                          });
                          setWindhawkMsg(`Synced Lens Windhawk mod (${config.theme.borderRadius}px) → ${out}`);
                          refreshWindhawk();
                        } catch (err) {
                          setWindhawkMsg(`Error: ${String(err)}`);
                        }
                      }}
                    >
                      Sync &amp; Open Mod
                    </button>
                  </div>
                </div>
                {windhawkMsg && (
                  <div style={{ fontSize: 11.5, color: "var(--lens-fg-secondary)" }}>
                    {windhawkMsg}
                  </div>
                )}
              </div>
            </>
          )}

          {tab === "sessions" && (
            <>
              <div>
                <div className="cc-section-title">Living desktop</div>
                <div className="cc-section-sub">
                  Interactive and ambient scenes behind your desktop icons. Your wallpaper image is in
                  Theme &amp; Look › Wallpaper.
                </div>
              </div>
              <PlaygroundCard config={config} onUpdateConfig={updateConfig} />

              <div>
                <div className="cc-section-title">Desktop Sessions Switching</div>
                <div className="cc-section-sub">
                  Manage named workspace sessions synced with Windows Virtual Desktops.
                </div>
              </div>

              <div className="cc-card">
                <div className="cc-chip-grid">
                  <button
                    type="button"
                    className="cc-btn-ghost"
                    onClick={() => invoke("switch_virtual_desktop_cmd", { direction: "left" })}
                  >
                    ← Prev Desktop
                  </button>
                  <button
                    type="button"
                    className="cc-btn-ghost"
                    onClick={() => invoke("switch_virtual_desktop_cmd", { direction: "right" })}
                  >
                    Next Desktop →
                  </button>
                  <button
                    type="button"
                    className="cc-btn"
                    onClick={() => invoke("switch_virtual_desktop_cmd", { direction: "new" })}
                  >
                    + New Windows Desktop
                  </button>
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    className="cc-input"
                    style={{ flex: 1 }}
                    placeholder="New named session (e.g. Coding, Gaming, Studio)..."
                    value={newSessionName}
                    onChange={(e) => setNewSessionName(e.target.value)}
                  />
                  <button
                    type="button"
                    className="cc-btn"
                    onClick={() => {
                      const name = newSessionName.trim();
                      if (!name) return;
                      updateConfig({
                        ...config,
                        sessions: [
                          ...config.sessions,
                          {
                            id: `session-${Date.now()}`,
                            name,
                            color: winTheme.accentHex,
                            apps: [],
                          },
                        ],
                      });
                      setNewSessionName("");
                    }}
                  >
                    Add Session
                  </button>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {config.sessions.map((s) => (
                    <div key={s.id} className="cc-row" style={{ padding: "6px 0" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ width: 9, height: 9, borderRadius: 999, background: s.color }} />
                        <span className="cc-label">{s.name}</span>
                      </div>
                      {config.sessions.length > 1 && (
                        <button
                          type="button"
                          className="cc-btn-ghost"
                          onClick={() =>
                            updateConfig({
                              ...config,
                              sessions: config.sessions.filter((x) => x.id !== s.id),
                            })
                          }
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <TilingCard config={config} onUpdateConfig={updateConfig} />
              <WorkspacesCard config={config} onUpdateConfig={updateConfig} />
              <SessionRestoreCard config={config} onUpdateConfig={updateConfig} accentHex={activeAccentHex} />
              <DesktopGroupsCard config={config} onUpdateConfig={updateConfig} />
              <PluginManagerCard />
            </>
          )}

          {tab === "folders" && (
            <>
              <div>
                <div className="cc-section-title">Folder Themes</div>
                <div className="cc-section-sub">
                  Apply sleek custom `.ico` folder themes natively via Windows `desktop.ini` — 100% reversible, zero system patching.
                </div>
              </div>

              <div className="cc-card">
                <div className="cc-label">Choose Folder Theme</div>
                <div className="cc-chip-grid">
                  {FOLDER_THEMES.map((ft) => (
                    <button
                      key={ft.id}
                      type="button"
                      className={`cc-chip ${folderThemeChoice === ft.id ? "active" : ""}`}
                      onClick={() => setFolderThemeChoice(ft.id)}
                    >
                      {ft.label}
                    </button>
                  ))}
                </div>

                <div className="cc-row">
                  <div>
                    <div className="cc-label">Replace ALL Windows Explorer Default Folders</div>
                    <div className="cc-desc">Safe HKCU Shell Icons override (zero system file edits, 1-click revert)</div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button type="button" className="cc-btn" onClick={handleApplyGlobalExplorerFolders}>
                      Apply System-Wide
                    </button>
                    <button type="button" className="cc-btn-ghost" onClick={handleRevertGlobalExplorerFolders}>
                      Revert
                    </button>
                  </div>
                </div>

                <div className="cc-row">
                  <div>
                    <div className="cc-label">Style All Core User Folders</div>
                    <div className="cc-desc">Desktop, Documents, Downloads, Pictures, Music & Videos</div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button type="button" className="cc-btn" onClick={handleApplyAllUserFolders}>
                      Style All 6
                    </button>
                    <button type="button" className="cc-btn-ghost" onClick={handleRevertAllUserFolders}>
                      Revert All
                    </button>
                  </div>
                </div>

                <div className="cc-label" style={{ marginTop: 4 }}>Style Any Specific Folder</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    className="cc-input"
                    style={{ flex: 1 }}
                    placeholder="C:\Users\You\Desktop\Projects"
                    value={folderPathInput}
                    onChange={(e) => setFolderPathInput(e.target.value)}
                  />
                  <button type="button" className="cc-btn" onClick={handleApplyFolderTheme}>
                    Apply Theme
                  </button>
                </div>

                {folderStatus && (
                  <div style={{ fontSize: 12, color: "var(--lens-accent)" }}>{folderStatus}</div>
                )}

                {config.styledFolders.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
                    <div className="cc-desc">Styled Folders (One-Click Revert)</div>
                    {config.styledFolders.map((rec) => (
                      <div key={rec.path} className="cc-row">
                        <span style={{ fontSize: 12, fontFamily: "var(--font-mono)" }}>
                          {rec.path} ({rec.theme})
                        </span>
                        <button
                          type="button"
                          className="cc-btn-ghost"
                          onClick={() => handleRevertFolder(rec.path)}
                        >
                          <RotateCcw size={12} style={{ marginRight: 5 }} /> Revert
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {(tab === "sessions" || tab === "widgets") && (
            <>
              <div>
                <div className="cc-section-title">Widget Access</div>
                <div className="cc-section-sub">
                  Toggle modular widgets in your Lens Widget Drawer (Alt+W).
                </div>
              </div>

              <div className="cc-card">
                {[
                  { id: "clock", label: "Clock & Date" },
                  { id: "telemetry", label: "Live System Telemetry (CPU / RAM / Uptime)" },
                  { id: "quick-actions", label: "Quick Actions" },
                  { id: "notes", label: "Persistent Quick Notes" },
                ].map((w) => {
                  const isOn = config.widgets.enabledWidgets.includes(w.id);
                  return (
                    <div className="cc-row" key={w.id}>
                      <div className="cc-label">{w.label}</div>
                      <button
                        type="button"
                        className={`cc-toggle ${isOn ? "on" : ""}`}
                        onClick={() => {
                          const next = isOn
                            ? config.widgets.enabledWidgets.filter((x) => x !== w.id)
                            : [...config.widgets.enabledWidgets, w.id];
                          updateConfig({
                            ...config,
                            widgets: { ...config.widgets, enabledWidgets: next },
                          });
                        }}
                      />
                    </div>
                  );
                })}

                <div>
                  <button
                    type="button"
                    className="cc-btn"
                    onClick={() => invoke("toggle_surface", { label: "widgets" })}
                  >
                    Toggle Widget Drawer Now
                  </button>
                </div>
              </div>
            </>
          )}

          {tab === "ai" && (
            <>
              <div>
                <div className="cc-section-title">AI &amp; Command</div>
                <div className="cc-section-sub">
                  Everything here is off until you turn it on. Local models are used first; nothing leaves
                  this PC unless you allow it.
                </div>
              </div>
              <BridgeInbox />
              <AiCard onTryIt={() => invoke("toggle_surface", { label: "palette" }).catch(() => {})} />
              <CommandCard config={config} onUpdateConfig={updateConfig} />
              <ClipboardCard />
              <ConnectionsCard />
              <TranscriptionCard />
              <McpCard config={config} onUpdateConfig={updateConfig} />
            </>
          )}

          {tab === "agents" && (
            <>
              <AgentsPane config={config} onUpdateConfig={updateConfig} />
            </>
          )}

          {tab === "system" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {/* Top Bar: Colored Functional Telemetry Pills (Click CPU/RAM for Task Manager, Uptime for Power) + Windows Settings */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1.25fr 1fr auto",
                  gap: 8,
                  alignItems: "stretch",
                }}
              >
                {/* CPU Load Pill -> Opens Task Manager */}
                <button
                  type="button"
                  className="cc-chip"
                  onClick={() => invoke("launch_app_cmd", { path: "taskmgr.exe" })}
                  style={{
                    position: "relative",
                    overflow: "hidden",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    padding: "9px 12px",
                    borderRadius: 10,
                    background: "rgb(var(--lens-ink) / 0.035)",
                    border: "1px solid rgb(56 189 248 / 0.24)",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      width: `${telemetry ? Math.min(100, Math.round(telemetry.cpuUsage)) : 0}%`,
                      background: "linear-gradient(90deg, rgb(56 189 248 / 0.22), rgb(56 189 248 / 0.08))",
                      transition: "width 300ms ease",
                      pointerEvents: "none",
                    }}
                  />
                  <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 7 }}>
                    <Cpu size={14.5} strokeWidth={2.3} color="#38BDF8" />
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--lens-fg)" }}>CPU Load</span>
                  </div>
                  <span
                    style={{
                      position: "relative",
                      fontSize: 12.5,
                      fontWeight: 700,
                      color: "#38BDF8",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {telemetry ? `${Math.round(telemetry.cpuUsage)}%` : "—"}
                  </span>
                </button>

                {/* Memory RAM Pill -> Opens Task Manager */}
                <button
                  type="button"
                  className="cc-chip"
                  onClick={() => invoke("launch_app_cmd", { path: "taskmgr.exe" })}
                  style={{
                    position: "relative",
                    overflow: "hidden",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    padding: "9px 12px",
                    borderRadius: 10,
                    background: "rgb(var(--lens-ink) / 0.035)",
                    border: "1px solid rgb(167 139 250 / 0.24)",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      width: `${
                        telemetry && telemetry.memTotalGb > 0
                          ? Math.min(100, Math.round((telemetry.memUsedGb / telemetry.memTotalGb) * 100))
                          : 0
                      }%`,
                      background: "linear-gradient(90deg, rgb(167 139 250 / 0.22), rgb(167 139 250 / 0.08))",
                      transition: "width 300ms ease",
                      pointerEvents: "none",
                    }}
                  />
                  <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 7 }}>
                    <HardDrive size={14.5} strokeWidth={2.3} color="#A78BFA" />
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--lens-fg)" }}>Memory</span>
                  </div>
                  <span
                    style={{
                      position: "relative",
                      fontSize: 12,
                      fontWeight: 700,
                      color: "#C4B5FD",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {telemetry ? `${telemetry.memUsedGb} / ${telemetry.memTotalGb} GB` : "—"}
                  </span>
                </button>

                {/* Uptime & Power Pill -> Opens Power & Sleep Settings */}
                <button
                  type="button"
                  className="cc-chip"
                  onClick={() => invoke("open_windows_setting_cmd", { uri: "ms-settings:powersleep" })}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    padding: "9px 12px",
                    borderRadius: 10,
                    background: "rgb(52 211 153 / 0.08)",
                    border: "1px solid rgb(52 211 153 / 0.24)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <Clock size={14.5} strokeWidth={2.3} color="#34D399" />
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--lens-fg)" }}>Uptime</span>
                  </div>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: "#34D399",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {telemetry ? `${Math.floor(telemetry.uptimeMinutes / 60)}h ${telemetry.uptimeMinutes % 60}m` : "—"}
                  </span>
                </button>

                {/* Windows Settings Action Pill */}
                <button
                  type="button"
                  className="cc-chip"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 7,
                    padding: "9px 13px",
                    borderRadius: 10,
                    background: "rgb(96 165 250 / 0.12)",
                    border: "1px solid rgb(96 165 250 / 0.28)",
                    fontSize: 11.5,
                    fontWeight: 700,
                    color: "var(--lens-fg)",
                  }}
                  onClick={() => invoke("open_windows_setting_cmd", { uri: "ms-settings:" })}
                >
                  <Monitor size={14} strokeWidth={2.3} color="#60A5FA" />
                  <span>All Settings</span>
                  <ExternalLink size={11.5} color="#60A5FA" />
                </button>
              </div>

              {/* Clean 2-Column Organization: Display & Eye Care (Left) + Sound & App Mixer (Right) */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {/* DISPLAY & EYE CARE */}
                <div className="cc-card" style={{ gap: 10, justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <Sun size={14} strokeWidth={2.3} color="#FBBF24" />
                      <span className="cc-label" style={{ fontSize: 12 }}>Display &amp; Eye Care</span>
                    </div>
                    <button
                      type="button"
                      className={`cc-chip ${qs.nightLightEnabled ? "active" : ""}`}
                      style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px", fontSize: 11.5 }}
                      onClick={() => {
                        const next = !qs.nightLightEnabled;
                        setQs((p) => ({ ...p, nightLightEnabled: next }));
                        invoke("set_night_light_cmd", { enabled: next, warmth: qs.nightLightWarmth }).catch(() => {});
                      }}
                    >
                      <Moon size={13} strokeWidth={2.3} color={qs.nightLightEnabled ? "var(--lens-on-fg, #09090b)" : "#FBBF24"} />
                      <span>{qs.nightLightEnabled ? "Night Light On" : "Night Light"}</span>
                    </button>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <PillFillBar
                      label="Brightness"
                      value={qs.brightness}
                      fillColor="#FBBF24"
                      icon={<Sun size={15} />}
                      onChange={(level) => {
                        setQs((p) => ({ ...p, brightness: level }));
                        invoke("set_brightness_cmd", { level }).catch(() => {});
                      }}
                    />

                    <PillFillBar
                      label="Night Warmth"
                      value={qs.nightLightEnabled ? qs.nightLightWarmth : 0}
                      min={0}
                      max={100}
                      fillColor="#FB923C"
                      icon={<Moon size={15} />}
                      onIconClick={() => {
                        const next = !qs.nightLightEnabled;
                        setQs((p) => ({ ...p, nightLightEnabled: next }));
                        invoke("set_night_light_cmd", { enabled: next, warmth: qs.nightLightWarmth }).catch(() => {});
                      }}
                      onChange={(warmth) => {
                        setQs((p) => ({ ...p, nightLightEnabled: warmth > 0, nightLightWarmth: warmth }));
                        invoke("set_night_light_cmd", { enabled: warmth > 0, warmth }).catch(() => {});
                      }}
                    />
                  </div>
                </div>

                {/* SOUND & APP VOLUME MIXER */}
                <div className="cc-card" style={{ gap: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <Volume2 size={14} strokeWidth={2.3} color="#38BDF8" />
                      <span className="cc-label" style={{ fontSize: 12 }}>Sound &amp; App Mixer</span>
                    </div>
                    <button
                      type="button"
                      className={`cc-chip ${qs.muted ? "active" : ""}`}
                      style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px", fontSize: 11.5 }}
                      onClick={() => {
                        const next = !qs.muted;
                        setQs((p) => ({ ...p, muted: next }));
                        invoke("set_mute_cmd", { muted: next }).catch(() => {});
                      }}
                    >
                      {qs.muted ? (
                        <VolumeX size={13} strokeWidth={2.3} color="var(--lens-on-fg)" />
                      ) : (
                        <Volume2 size={13} strokeWidth={2.3} color="#38BDF8" />
                      )}
                      <span>{qs.muted ? "Muted" : "Mute"}</span>
                    </button>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <PillFillBar
                      label="Master Volume"
                      value={qs.muted ? 0 : qs.volume}
                      fillColor="#60A5FA"
                      icon={qs.muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
                      onIconClick={() => {
                        const next = !qs.muted;
                        setQs((p) => ({ ...p, muted: next }));
                        invoke("set_mute_cmd", { muted: next }).catch(() => {});
                      }}
                      onChange={(level) => {
                        setQs((p) => ({ ...p, volume: level, muted: false }));
                        invoke("set_volume_cmd", { level }).catch(() => {});
                      }}
                    />

                    {audioSessions.slice(0, 3).map((s) => (
                      <PillFillBar
                        key={s.pid}
                        label={s.name}
                        value={s.muted ? 0 : s.volume}
                        fillColor={s.muted ? "#71717A" : "#38BDF8"}
                        icon={
                          s.iconDataUrl ? (
                            <img src={s.iconDataUrl} alt="" style={{ width: 15, height: 15, objectFit: "contain" }} />
                          ) : (
                            <Volume2 size={14} />
                          )
                        }
                        onIconClick={() => {
                          const next = !s.muted;
                          setAudioSessions((prev) => prev.map((x) => (x.pid === s.pid ? { ...x, muted: next } : x)));
                          invoke("set_app_mute_cmd", { pid: s.pid, muted: next }).catch(() => {});
                        }}
                        onChange={(level) => {
                          setAudioSessions((prev) =>
                            prev.map((x) => (x.pid === s.pid ? { ...x, volume: level, muted: false } : x))
                          );
                          invoke("set_app_volume_cmd", { pid: s.pid, level }).catch(() => {});
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Hierarchical Windows 11 Quick Settings: 4 Prominent Everyday Cards on Top + Compact 8-Pill Strip Below */}
              <div className="cc-card" style={{ gap: 8, padding: "12px 14px" }}>
                {/* TIER 1: 4 Prominent Everyday Windows Controls (Wi-Fi · Bluetooth · Display · Sound) */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8 }}>
                  {[
                    {
                      label: "Wi-Fi",
                      sub: "Networks & DNS",
                      uri: "ms-settings:network-wifi",
                      color: "#34D399",
                      bg: "rgb(52 211 153 / 0.09)",
                      border: "rgb(52 211 153 / 0.24)",
                      icon: <Wifi size={18} strokeWidth={2.4} color="#34D399" />,
                    },
                    {
                      label: "Bluetooth",
                      sub: "Devices & Audio",
                      uri: "ms-settings:bluetooth",
                      color: "#818CF8",
                      bg: "rgb(129 140 248 / 0.09)",
                      border: "rgb(129 140 248 / 0.24)",
                      icon: <Bluetooth size={18} strokeWidth={2.4} color="#818CF8" />,
                    },
                    {
                      label: "Display",
                      sub: "Monitors & Scale",
                      uri: "ms-settings:display",
                      color: "#60A5FA",
                      bg: "rgb(96 165 250 / 0.09)",
                      border: "rgb(96 165 250 / 0.24)",
                      icon: <Monitor size={18} strokeWidth={2.4} color="#60A5FA" />,
                    },
                    {
                      label: "Sound",
                      sub: "Output & Input",
                      uri: "ms-settings:sound",
                      color: "#38BDF8",
                      bg: "rgb(56 189 248 / 0.09)",
                      border: "rgb(56 189 248 / 0.24)",
                      icon: <Volume2 size={18} strokeWidth={2.4} color="#38BDF8" />,
                    },
                  ].map((item) => (
                    <button
                      key={item.label}
                      type="button"
                      className="cc-chip"
                      onClick={() => invoke("open_windows_setting_cmd", { uri: item.uri })}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "11px 12px",
                        borderRadius: 11,
                        background: item.bg,
                        border: `1px solid ${item.border}`,
                        textAlign: "left",
                        cursor: "pointer",
                      }}
                    >
                      <span
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 9,
                          background: "rgb(0 0 0 / calc(0.35 * var(--lens-well-k, 1)))",
                          border: "1px solid rgb(var(--lens-ink) / 0.08)",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        {item.icon}
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--lens-fg)", lineHeight: 1.2 }}>
                          {item.label}
                        </div>
                        <div
                          style={{
                            fontSize: 10.5,
                            fontWeight: 500,
                            color: "var(--lens-fg-secondary)",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {item.sub}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>

                {/* TIER 2: 8 Smaller Secondary Utility Pills Underneath (Power · Apps · Storage · Updates · Gaming · Input · Security · System) */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(8, minmax(0, 1fr))", gap: 6 }}>
                  {[
                    { label: "Power", uri: "ms-settings:powersleep", icon: <Zap size={12.5} strokeWidth={2.3} color="#FBBF24" /> },
                    { label: "Apps", uri: "ms-settings:appsfeatures", icon: <AppWindow size={12.5} strokeWidth={2.3} color="#FB7185" /> },
                    { label: "Storage", uri: "ms-settings:storagesense", icon: <HardDrive size={12.5} strokeWidth={2.3} color="#94A3B8" /> },
                    { label: "Updates", uri: "ms-settings:windowsupdate", icon: <RefreshCw size={12.5} strokeWidth={2.3} color="#34D399" /> },
                    { label: "Gaming", uri: "ms-settings:gaming-gamemode", icon: <Gamepad2 size={12.5} strokeWidth={2.3} color="#C084FC" /> },
                    { label: "Input", uri: "ms-settings:mousetouchpad", icon: <Keyboard size={12.5} strokeWidth={2.3} color="#A78BFA" /> },
                    { label: "Security", uri: "ms-settings:windowsdefender", icon: <Shield size={12.5} strokeWidth={2.3} color="#60A5FA" /> },
                    { label: "System", uri: "ms-settings:about", icon: <Cpu size={12.5} strokeWidth={2.3} color="var(--lens-fg)" /> },
                  ].map((item) => (
                    <button
                      key={item.label}
                      type="button"
                      className="cc-chip"
                      onClick={() => invoke("open_windows_setting_cmd", { uri: item.uri })}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 5,
                        padding: "6px 6px",
                        borderRadius: 8,
                        background: "rgb(var(--lens-ink) / 0.03)",
                        border: "1px solid rgb(var(--lens-ink) / 0.06)",
                        fontSize: 11,
                        fontWeight: 600,
                        color: "var(--lens-fg-secondary)",
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {item.icon}
                      <span>{item.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              {/* Active Running Apps & Quick Shell Actions (Fills the dashboard with live desktop context!) */}
              <div className="cc-card" style={{ gap: 9 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <Layers size={14} strokeWidth={2.3} color="#A78BFA" />
                    <span className="cc-label" style={{ fontSize: 12 }}>Quick Desktop &amp; Shell Actions</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <button
                      type="button"
                      className="cc-chip"
                      style={{ padding: "4px 9px", fontSize: 11, fontWeight: 600 }}
                      onClick={() => invoke("switch_virtual_desktop_cmd", { direction: "left" })}
                    >
                      ← Prev Desktop
                    </button>
                    <button
                      type="button"
                      className="cc-chip"
                      style={{ padding: "4px 9px", fontSize: 11, fontWeight: 600 }}
                      onClick={() => invoke("switch_virtual_desktop_cmd", { direction: "right" })}
                    >
                      Next Desktop →
                    </button>
                    <button
                      type="button"
                      className="cc-chip"
                      style={{ padding: "4px 9px", fontSize: 11, fontWeight: 600 }}
                      onClick={() => invoke("switch_virtual_desktop_cmd", { direction: "new" })}
                    >
                      + New Desktop
                    </button>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 7 }}>
                  <button
                    type="button"
                    className={`cc-chip ${config.func.hideNativeTaskbar ? "active" : ""}`}
                    style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "8px 10px", fontSize: 11.5, fontWeight: 600 }}
                    onClick={() =>
                      updateConfig({
                        ...config,
                        func: { ...config.func, hideNativeTaskbar: !config.func.hideNativeTaskbar },
                      })
                    }
                  >
                    <PanelBottom size={13.5} strokeWidth={2.3} color={config.func.hideNativeTaskbar ? "var(--lens-on-fg, #09090b)" : "#A78BFA"} />
                    <span>{config.func.hideNativeTaskbar ? "Taskbar Hidden" : "Show Taskbar"}</span>
                  </button>

                  <button
                    type="button"
                    className={`cc-chip ${config.windowControls.enabled ? "active" : ""}`}
                    style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "8px 10px", fontSize: 11.5, fontWeight: 600 }}
                    onClick={() =>
                      updateConfig({
                        ...config,
                        windowControls: { ...config.windowControls, enabled: !config.windowControls.enabled },
                      })
                    }
                  >
                    <CircleDot size={13.5} strokeWidth={2.3} color={config.windowControls.enabled ? "var(--lens-on-fg, #09090b)" : "#34D399"} />
                    <span>{config.windowControls.enabled ? "Traffic Lights On" : "Win Buttons"}</span>
                  </button>

                  <button
                    type="button"
                    className="cc-chip"
                    style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "8px 10px", fontSize: 11.5, fontWeight: 600 }}
                    onClick={() => invoke("launch_app_cmd", { path: "taskmgr.exe" })}
                  >
                    <Cpu size={13.5} strokeWidth={2.3} color="#38BDF8" />
                    <span>Task Manager</span>
                  </button>

                  <button
                    type="button"
                    className="cc-chip"
                    style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "8px 10px", fontSize: 11.5, fontWeight: 600 }}
                    onClick={() => invoke("launch_app_cmd", { path: "explorer.exe" })}
                  >
                    <FolderHeart size={13.5} strokeWidth={2.3} color="#FBBF24" />
                    <span>File Explorer</span>
                  </button>
                </div>
              </div>
              <div className="cc-card">
                <div className="cc-row">
                  <div>
                    <div className="cc-label">Self-Test</div>
                    <div className="cc-desc">Checks Lens without changing anything. Copy the report into a bug report.</div>
                  </div>
                  <button
                    type="button"
                    className="cc-btn"
                    onClick={() =>
                      invoke<{ ok: boolean; text: string }>("run_self_test_cmd")
                        .then((r) => setSelfTest(r.text))
                        .catch((e) => setSelfTest(String(e)))
                    }
                  >
                    Run self-test
                  </button>
                </div>
                {selfTest && (
                  <pre
                    className="cc-input"
                    style={{ whiteSpace: "pre-wrap", fontSize: 11, userSelect: "text", maxHeight: 260, overflow: "auto" }}
                  >
                    {selfTest}
                  </pre>
                )}
              </div>

              <BackupRestoreCard />
              <ShellModeCard />
            </div>
          )}

          {(tab === "system" || tab === "func") && (
            <>
              <div>
                <div className="cc-section-title">Windows integration &amp; shortcuts</div>
                <div className="cc-section-sub">
                  Startup, hotkeys and how Lens works alongside Windows. Dock and taskbar options are in Dock &amp; Top Bar.
                </div>
              </div>

              <div className="cc-card">
                <div className="cc-row">
                  <div>
                    <div className="cc-label">Run Lens UI on Windows Startup</div>
                    <div className="cc-desc">Enabled by default via HKCU\...\Run</div>
                  </div>
                  <button
                    type="button"
                    className={`cc-toggle ${config.func.runOnStartup ? "on" : ""}`}
                    onClick={() =>
                      updateConfig({
                        ...config,
                        func: { ...config.func, runOnStartup: !config.func.runOnStartup },
                      })
                    }
                  />
                </div>

                <div className="cc-row">
                  <div>
                    <div className="cc-label">Auto-Pause Overlays in Fullscreen Games / Video</div>
                    <div className="cc-desc">Keeps fullscreen apps completely uninterrupted</div>
                  </div>
                  <button
                    type="button"
                    className={`cc-toggle ${config.func.gamingPause ? "on" : ""}`}
                    onClick={() =>
                      updateConfig({
                        ...config,
                        func: { ...config.func, gamingPause: !config.func.gamingPause },
                      })
                    }
                  />
                </div>

                <div className="cc-row">
                  <div>
                    <div className="cc-label">Legacy In-App Window Styling</div>
                    <div className="cc-desc">
                      Loads a helper into every app to restyle windows. Leave off unless a window keeps its
                      old titlebar; turning it off takes effect after restarting Lens UI.
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`cc-toggle ${config.func.injectedHook ? "on" : ""}`}
                    onClick={() =>
                      updateConfig({
                        ...config,
                        func: { ...config.func, injectedHook: !config.func.injectedHook },
                      })
                    }
                  />
                </div>

                <div className="cc-row">
                  <div>
                    <div className="cc-label">Create Rarely Used Windows on Demand</div>
                    <div className="cc-desc">Saves memory: Control Center, Launcher, Overview and other panels load the first time you open them. Applies after restarting Lens UI.</div>
                  </div>
                  <button
                    type="button"
                    className={`cc-toggle ${config.func.lazyWindows ? "on" : ""}`}
                    onClick={() =>
                      updateConfig({
                        ...config,
                        func: { ...config.func, lazyWindows: !config.func.lazyWindows },
                      })
                    }
                  />
                </div>

                <div className="cc-row">
                  <div>
                    <div className="cc-label">System Tray in Top Bar (experimental)</div>
                    <div className="cc-desc">Lens collects tray icons itself and shows them in the Top Bar. Turn off if icons look wrong.</div>
                  </div>
                  <button
                    type="button"
                    className={`cc-toggle ${config.func.trayHost ? "on" : ""}`}
                    onClick={() =>
                      updateConfig({
                        ...config,
                        func: { ...config.func, trayHost: !config.func.trayHost },
                      })
                    }
                  />
                </div>

                <div className="cc-row">
                  <div>
                    <div className="cc-label">Clipboard History</div>
                    <div className="cc-desc">Remembers the last 50 pieces of copied text in memory only (never saved to disk). Shown in the Widget Drawer.</div>
                  </div>
                  <button
                    type="button"
                    className={`cc-toggle ${config.func.clipboardHistory ? "on" : ""}`}
                    onClick={() =>
                      updateConfig({
                        ...config,
                        func: { ...config.func, clipboardHistory: !config.func.clipboardHistory },
                      })
                    }
                  />
                </div>

                <div className="cc-row">
                  <div>
                    <div className="cc-label">Keyboard Tiling Shortcuts</div>
                    <div className="cc-desc">Ctrl+Alt+Arrows snap, Alt+Shift+Arrows move focus. These keys stop reaching other apps. Applies after restarting Lens UI.</div>
                  </div>
                  <button
                    type="button"
                    className={`cc-toggle ${config.func.tilingHotkeys ? "on" : ""}`}
                    onClick={() =>
                      updateConfig({
                        ...config,
                        func: { ...config.func, tilingHotkeys: !config.func.tilingHotkeys },
                      })
                    }
                  />
                </div>

                <div className="cc-row">
                  <div>
                    <div className="cc-label">Alt+1–9 Opens Dock Apps</div>
                    <div className="cc-desc">Alt+1 is the first Dock app, and so on. These keys stop reaching other apps. Applies after restarting Lens UI.</div>
                  </div>
                  <button
                    type="button"
                    className={`cc-toggle ${config.func.dockNumberHotkeys ? "on" : ""}`}
                    onClick={() =>
                      updateConfig({
                        ...config,
                        func: { ...config.func, dockNumberHotkeys: !config.func.dockNumberHotkeys },
                      })
                    }
                  />
                </div>

                <div className="cc-row">
                  <div>
                    <div className="cc-label">Global Shortcuts</div>
                    <div className="cc-desc">Command Palette: Alt+Space · Widget Drawer: Alt+W</div>
                  </div>
                  <span className="cc-chip active">Active</span>
                </div>
              </div>

              <div>
                <div className="cc-section-title">Keys, corners &amp; monitors</div>
                <div className="cc-section-sub">
                  Win key, Alt+Tab, hot corners, Alt+drag and app hotkeys. All off until you turn them on.
                </div>
              </div>
              <ShellKeysCard config={config} onUpdateConfig={updateConfig} />
              <MonitorPickerCard config={config} onUpdateConfig={updateConfig} showPerMonitorBars />
              <HotCornersCard config={config} onUpdateConfig={updateConfig} />
              <AltDragCard config={config} onUpdateConfig={updateConfig} />
              <AppSummonCard config={config} onUpdateConfig={updateConfig} />

              <div>
                <div className="cc-section-title">Window styling</div>
                <div className="cc-section-sub">
                  Focus dimming, the active-window border, pin on top and per-app rules.
                </div>
              </div>
              <WindowRulesCard />

              <div>
                <div className="cc-section-title">Updates &amp; crash reports</div>
              </div>
              <UpdatesCard />
              <CrashReportsCard />
            </>
          )}
          </div>
        </main>
      </div>
    </div>
  );
};
