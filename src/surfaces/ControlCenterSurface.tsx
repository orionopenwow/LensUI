import React, { Suspense, startTransition, useEffect, useRef, useState } from "react";
import { topBarEnabled, withTopBarEnabled } from "../topbar/enabled";
import { FlyoutClose } from "../ui/FlyoutClose";
import { HookStatus } from "../components/HookStatus";
import { useStartupBlock } from "../hooks/useStartupBlock";
import { Skeleton, ToastHost } from "../ui";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { FOLDER_THEMES, FRAME_STYLES, applyThemePack } from "../themes/packs";
import { chooseTheme } from "../themes/choiceUndo";
import { WindowRulesCard } from "../components/WindowRulesCard";
import { SessionRestoreCard } from "../components/SessionRestoreCard";
import { ShellModeCard } from "../components/ShellModeCard";
import { TilingCard } from "../components/TilingCard";
import { ShortcutsCard } from "../components/ShortcutsCard";
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
import { TesterHubCard } from "../tester/TesterHubCard";
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
  Minus,
  MessageSquare,
  FlaskConical,
} from "lucide-react";
import { useLensState, useRunningWindows, useSurfaceGlide } from "../hooks/useLensState";
import { TrafficLights } from "../components/TrafficLights";
import { RotaryDial } from "../components/RotaryDial";
import { PillFillBar } from "../components/PillFillBar";
import { SetupWizard } from "../components/SetupWizard";
import { setupReason, type SetupStatus } from "../setup/flow";
import { ThemeTab } from "../themeux/ThemeTab";
// Backdrop Lab embed (src/studio/backdrop): loads only once scrolled into view (CreatorSlot).
import { CreatorSlot } from "../studio/backdrop/ui/CreatorSlot";
import { DockTab } from "../themeux/DockTab";
import { AgentsPane } from "../components/AgentsPane";
import { MessagingHubPane } from "../components/MessagingHubPane";
import "./ControlCenterSurface.css";
import { getPage, resolveTarget, type PageId } from "../settings/registry";
import { PAGE_COMPONENTS } from "../settings/pages";
import { GuideDrawer } from "../guide/GuideDrawer";
import { openGuide } from "../guide/coach";
import { SettingsNav, PageIcon } from "../settings/SettingsNav";
// Simple-mode cards load only when Simple mode shows them, so Advanced pays nothing for them.
const SimpleView = React.lazy(() => import("../settings/simple/SimpleView").then((m) => ({ default: m.SimpleView })));
import { MoreOptions } from "../settings/simple/MoreOptions";
import { ModeHint } from "../settings/simple/ModePill";
import { effectiveMode, hasSimpleCards, modeUnchosen, moreStartsOpen, moreSummary, SIMPLE_RESETS, type SettingsMode } from "../settings/simple/mode";
import { Section, WinLink } from "../settings/ui/primitives";
const FeedsCard = React.lazy(() => import("../components/FeedsCard").then((m) => ({ default: m.FeedsCard })));
const MessagesCard = React.lazy(() => import("../components/MessagesCard").then((m) => ({ default: m.MessagesCard })));
import { PageErrorBoundary } from "../settings/ui/ErrorBoundary";
import { systemTimeZone } from "../playground/living/settings";


interface ProcessEntry {
  pid: number;
  name: string;
  cpuUsage: number;
  memoryMb: number;
}

export const ControlCenterSurface: React.FC = () => {
  const startupBlock = useStartupBlock();
  const { config, winTheme, updateConfig } = useLensState();
  const runningWindows = useRunningWindows(1400);
  const glidePhase = useSurfaceGlide("settings");
  // `?tab=` lets the visual parity harness open a given tab; the app always starts on Theme & Look.
  const initial = resolveTarget(new URLSearchParams(window.location.search).get("tab"));
  const [tab, setPage] = useState<PageId>(() => initial?.page ?? "quick");
  // The nav highlight moves at once; the page body renders as a transition (time-sliced, so a heavy
  // page never blocks the click or the highlight; AAA_WAVE_PLAN C3 / perf settings-tab-switch).
  const [navTab, setNavTab] = useState<PageId>(tab);
  // Section a deep link asked for (`lens://settings/<page>#<section>`); cleared on manual navigation.
  const [section, setSection] = useState<string | undefined>(() => initial?.section);
  const navigate = (page: PageId, sec?: string) => {
    setNavTab(page);
    startTransition(() => {
      setPage(page);
      setSection(sec);
    });
  };
  /** Accepts page ids, legacy tab ids and `page#section`. */
  const setTab = (target: string) => {
    const t = resolveTarget(target);
    if (t) navigate(t.page, t.section);
  };
  // Simple mode: "More options" opens on a deep link to a section, or when the person asks. Kept
  // per page (keyed by page#section), so switching pages never costs an extra render.
  const [moreToggled, setMoreToggled] = useState<{ key: string; open: boolean } | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLElement>(null);
  // The first time-zone lookup loads the browser's locale data (tens of milliseconds on a slow PC).
  // Do it while Settings is idle, not in the click that opens Appearance.
  useEffect(() => {
    const w = window as unknown as { requestIdleCallback?: (cb: () => void) => number; cancelIdleCallback?: (id: number) => void };
    if (!w.requestIdleCallback) return;
    const id = w.requestIdleCallback(() => void systemTimeZone());
    return () => w.cancelIdleCallback?.(id);
  }, []);
  // Each tab opens at the top instead of inheriting the previous tab's scroll position.
  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 });
  }, [tab]);
  useEffect(() => {
    if (!section) return;
    const t = window.setTimeout(() => {
      const el = contentRef.current?.querySelector<HTMLElement>(`#sec-${CSS.escape(section)}`);
      el?.scrollIntoView({ block: "start", behavior: "smooth" });
    }, 80);
    return () => window.clearTimeout(t);
  }, [tab, section]);
  // Sticky page header gets a hairline once the page scrolls.
  const [stuck, setStuck] = useState(false);
  const [showWizardManual, setShowWizardManual] = useState(false);
  // Lens setup (docs/SETUP.md): first launch, once per new version, or when the launcher asks.
  const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null);
  const [setupDismissed, setSetupDismissed] = useState(false);
  useEffect(() => {
    let alive = true;
    invoke<SetupStatus>("setup_status_cmd")
      .then((st) => alive && setSetupStatus(st))
      .catch(() => {});
    const un = listen("lens://setup-open", () => setShowWizardManual(true));
    return () => {
      alive = false;
      un.then((f) => f()).catch(() => {});
    };
  }, []);
  const autoReason = setupDismissed
    ? null
    : setupStatus
      ? setupReason(setupStatus)
      : config?.onboardingCompleted === false
        ? "first"
        : null;
  const [topProcesses, setTopProcesses] = useState<ProcessEntry[]>([]);
  const [cpuHistory, setCpuHistory] = useState<number[]>([18, 22, 20, 26, 24, 29, 25, 21, 24, 28, 26, 23]);
  const [monitorMode, setMonitorMode] = useState<"windows" | "processes">("windows");
  const [monitorFilter, setMonitorFilter] = useState("");
  const [telemetry, setTelemetry] = useState<{
    cpuUsage: number;
    memUsedGb: number;
    memTotalGb: number;
    uptimeMinutes: number;
  } | null>(null);
  const [folderPathInput, setFolderPathInput] = useState("");
  const [folderThemeChoice, setFolderThemeChoice] = useState("accent");
  const [folderStatus, setFolderStatus] = useState<string | null>(null);
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
    if (tab === "tasks") {
      refreshProcesses();
    }
    const timer = window.setInterval(() => {
      pollStats();
      if (tab === "tasks") refreshProcesses();
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
        setTab(e.payload);
      }
    });
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      unlistenTab.then((fn) => fn());
    };
  }, []);

  // The Settings window keeps one size while it is open (docs/SMOOTHNESS.md, G-01): resizing the
  // native window to fit each page tore the page mid-switch. Pages scroll inside it instead.

  if (!config) return null;

  const _appWindow = getCurrentWindow();
  void _appWindow;

  const pageDef = getPage(tab);
  const PageComponent = PAGE_COMPONENTS[tab];
  const mode = effectiveMode(config);
  const setMode = (m: SettingsMode) => {
    if (m === config.settingsMode) return;
    updateConfig({ ...config, settingsMode: m });
  };
  const simpleCards = mode === "simple" && hasSimpleCards(tab);
  const moreKey = `${tab}#${section ?? ""}`;
  const moreOpen = moreToggled?.key === moreKey ? moreToggled.open : moreStartsOpen(mode, tab, section);
  const setMoreOpen = (open: boolean) => setMoreToggled({ key: moreKey, open });

  const activeAccentHex =
    config.theme.accentMode === "custom"
      ? config.theme.customAccent
      : winTheme.accentHex;

  // All theme application goes through the shared pack registry (src/themes/packs.ts)
  const applyPack = (packId: string) => {
    const next = chooseTheme(config, (c) => applyThemePack(c, packId));
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
      {(showWizardManual || autoReason) && (
        <SetupWizard
          config={config}
          winTheme={winTheme}
          reason={showWizardManual ? "first" : autoReason ?? "first"}
          version={setupStatus?.version ?? ""}
          seenVersion={setupStatus?.seenVersion ?? config?.setupSeenVersion ?? ""}
          onUpdateConfig={updateConfig}
          onApplyMasterTheme={applyMasterTheme}
          onFinish={() => {
            setShowWizardManual(false);
            setSetupDismissed(true);
          }}
        />
      )}
      <div className="cc-body">
        <SettingsNav
          page={navTab}
          mode={mode}
          onMode={setMode}
          onNavigate={navigate}
          onWizard={() => setShowWizardManual(true)}
        />

        <main className="cc-content" ref={contentRef} onScroll={(e) => setStuck(e.currentTarget.scrollTop > 4)}>
          <header className={`sh-pagehead ${stuck ? "stuck" : ""}`}>
            <span className="sh-pagehead-icon">
              <PageIcon id={tab} size={17} />
            </span>
            <div className="sh-pagehead-text">
              <h1 className="sh-pagehead-title">{pageDef.label}</h1>
              <div className="sh-pagehead-desc">{pageDef.description}</div>
            </div>
            {pageDef.winUri && <WinLink uri={pageDef.winUri} label="Windows Settings" compact />}
            <button type="button" className="cc-chip sh-help" data-guide-id="settings.help" aria-label="Guide" onClick={() => void openGuide()}>
              ?
            </button>
            <FlyoutClose pinned inline label="Close Settings" onClose={() => invoke("hide_surface", { label: "settings" }).catch(() => {})} />
          </header>
          <div ref={stageRef} key={tab} className="lens-tab-stage">
          {modeUnchosen(config) && <ModeHint mode={mode} onChoose={setMode} />}
          {simpleCards && (
            <Suspense fallback={<Skeleton label="Loading" shape="page" rows={2} className="sh-page-loading" />}>
            <SimpleView
              page={tab}
              config={config}
              winTheme={winTheme}
              accent={activeAccentHex}
              updateConfig={updateConfig}
              onApplyConfig={(next) => {
                updateConfig(next);
                setFolderThemeChoice(next.folderStyle?.theme ?? "accent");
              }}
              onMore={(sec) => {
                if (sec) {
                  setMoreToggled({ key: `${tab}#${sec}`, open: true });
                  setSection(sec);
                } else setMoreOpen(true);
              }}
            />
            </Suspense>
          )}
          <MoreOptions
            enabled={simpleCards}
            open={moreOpen}
            onToggle={setMoreOpen}
            summary={moreSummary(tab).text}
            onReset={SIMPLE_RESETS[tab] ? () => updateConfig(SIMPLE_RESETS[tab]!(config)) : undefined}
          >
          <PageErrorBoundary pageLabel={pageDef.label} resetKey={tab}>
          {PageComponent && (
            <Suspense fallback={<Skeleton label={`Loading ${pageDef.label}`} shape="page" rows={4} className="sh-page-loading" />}>
              <PageComponent
                section={section}
                config={config}
                updateConfig={updateConfig}
                // Notification history, Feeds and Messages are part of Focus & Notifications (they
                // were a page of their own). Built here: the history pane reads the live window list.
                slot={tab === "focus" && (
                  <>
                    <MessagingHubPane runningWindows={runningWindows} />
                    <Suspense fallback={null}>
                      <Section id="feeds" title="Feeds" summary="News and social sources for Lens Feeds" defaultOpen={section === "feeds"} forceOpen={section === "feeds"}>
                        <FeedsCard />
                      </Section>
                      <Section id="messages" title="Messages" summary="Messengers, focus and Matrix for Lens Messages" defaultOpen={section === "messages"} forceOpen={section === "messages"}>
                        <MessagesCard />
                      </Section>
                    </Suspense>
                  </>
                )}
              />
            </Suspense>
          )}
          {tab === "tasks" && (
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
                      <div key={i} className="lens-meter" style={{ flex: 1, height: "100%", borderRadius: 3 }}>
                        <div
                          className="lens-meter-fill is-upright"
                          style={
                            {
                              "--fill": Math.max(10, Math.min(100, val)) / 100,
                              borderRadius: 3,
                              background:
                                i === cpuHistory.length - 1
                                  ? "#34D399"
                                  : val > 75
                                    ? "rgb(251 113 133 / 0.72)"
                                    : "rgb(52 211 153 / 0.34)",
                            } as React.CSSProperties
                          }
                        />
                      </div>
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
                  <div className="lens-meter" style={{ height: 8, borderRadius: 999, background: "rgb(var(--lens-ink) / 0.08)" }}>
                    <div
                      className="lens-meter-fill"
                      style={
                        {
                          "--fill": telemetry ? Math.min(1, telemetry.memUsedGb / Math.max(1, telemetry.memTotalGb)) : 0,
                          background: "linear-gradient(90deg, #38BDF8, #818CF8)",
                          borderRadius: 999,
                        } as React.CSSProperties
                      }
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
                    <button aria-label="Refresh processes"
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
                          <button aria-label={`Minimise ${w.title || w.processName}`}
                            type="button"
                            className="cc-chip"
                            style={{ padding: "4px 7px" }}
                            onClick={() => invoke("window_action_cmd", { hwnd: w.hwnd, action: "minimize" })}
                          >
                            <Minus size={12} />
                          </button>
                          <button aria-label={`Close ${w.title || w.processName}`}
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

          {tab === "appearance" && (
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
          {tab === "appearance" && (
            <>
              <div id="sec-creator" className="sh-anchor">
                <div className="cc-section-title">Creator</div>
                <div className="cc-section-sub">Make your own animated backgrounds and themes with Backdrop Lab.</div>
              </div>
              <CreatorSlot config={config} updateConfig={updateConfig} />
            </>
          )}

          {tab === "dock" && <DockTab config={config} accent={activeAccentHex} updateConfig={updateConfig} />}

          {tab === "dock" && (
            <>
              <div id="sec-topbar" className="sh-anchor">
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
                    role="switch" aria-checked={topBarEnabled(config)} aria-label="Enable Top Bar" className={`cc-toggle ${topBarEnabled(config) ? "on" : ""}`}
                    onClick={() => {
                      updateConfig(withTopBarEnabled(config, !topBarEnabled(config)));
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

          {tab === "desktop" && (
            <>
              <div id="sec-living" className="sh-anchor">
                <div className="cc-section-title">Living desktop</div>
                <div className="cc-section-sub">
                  Interactive and ambient scenes behind your desktop icons. Your wallpaper image is in
                  Theme &amp; Look › Wallpaper.
                </div>
              </div>
              <PlaygroundCard config={config} onUpdateConfig={updateConfig} />

              <div id="sec-sessions" className="sh-anchor">
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

          {tab === "desktop" && (
            <>
              <div id="sec-folders" className="sh-anchor">
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

          {tab === "desktop" && (
            <>
              <div id="sec-widgets" className="sh-anchor">
                <div className="cc-section-title">Widget Access</div>
                <div className="cc-section-sub">
                  Toggle modular widgets in your Lens Widget Drawer ({config.func.widgetsHotkey || "Ctrl+Alt+W"}).
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
                        role="switch" aria-checked={!!(isOn)} aria-label={w.label} className={`cc-toggle ${isOn ? "on" : ""}`}
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

          {tab === "keys" && (
            <div id="sec-desktops" className="cc-card" style={{ gap: 8 }}>
              <div className="sh-row">
                <div className="sh-row-text">
                  <div className="sh-row-label">
                    <Layers size={13} aria-hidden /> Virtual desktops
                  </div>
                  <div className="sh-row-desc">Switch or add Windows desktops. Lens workspaces are in Desktop.</div>
                </div>
                <div className="sh-row-control">
                  <button type="button" className="cc-chip compact" onClick={() => invoke("switch_virtual_desktop_cmd", { direction: "left" }).catch(() => {})}>
                    ← Previous
                  </button>
                  <button type="button" className="cc-chip compact" onClick={() => invoke("switch_virtual_desktop_cmd", { direction: "right" }).catch(() => {})}>
                    Next →
                  </button>
                  <button type="button" className="cc-chip compact" onClick={() => invoke("switch_virtual_desktop_cmd", { direction: "new" }).catch(() => {})}>
                    + New
                  </button>
                </div>
              </div>
              <div className="sh-row">
                <div className="sh-row-text">
                  <div className="sh-row-label">Windows tools</div>
                  <div className="sh-row-desc">Open Task Manager or File Explorer.</div>
                </div>
                <div className="sh-row-control">
                  <button type="button" className="cc-chip compact" onClick={() => invoke("launch_app_cmd", { path: "taskmgr.exe" }).catch(() => {})}>
                    Task Manager
                  </button>
                  <button type="button" className="cc-chip compact" onClick={() => invoke("launch_app_cmd", { path: "explorer.exe" }).catch(() => {})}>
                    File Explorer
                  </button>
                </div>
              </div>
            </div>
          )}

          {tab === "keys" && (
            <>
              <div id="sec-integration" className="sh-anchor">
                <div className="cc-section-title">Windows integration &amp; shortcuts</div>
                <div className="cc-section-sub">
                  Startup, hotkeys and how Lens works alongside Windows. Dock and taskbar options are in Dock &amp; Bar.
                </div>
              </div>

              <ShortcutsCard config={config} onUpdateConfig={updateConfig} />

              <div className="cc-card">
                <div className="cc-row">
                  <div>
                    <div className="cc-label">Run Lens on Windows Startup</div>
                    <div className="cc-desc">{startupBlock ?? "Starts Lens when you sign in to Windows"}</div>
                  </div>
                  <button
                    type="button"
                    role="switch" aria-checked={!!(config.func.runOnStartup)} aria-label="Run Lens on Windows Startup" className={`cc-toggle ${config.func.runOnStartup ? "on" : ""}`}
                    aria-disabled={!!startupBlock && !config.func.runOnStartup}
                    onClick={() =>
                      (!startupBlock || config.func.runOnStartup) &&
                      updateConfig({
                        ...config,
                        func: { ...config.func, runOnStartup: !config.func.runOnStartup },
                      })
                    }
                  />
                </div>

                <div className="cc-row">
                  <div>
                    <div className="cc-label">Legacy In-App Window Styling (experimental)</div>
                    <div className="cc-desc">
                      Off by default: Lens already styles windows from outside each app. This loads a small helper
                      into other apps to restyle a window that keeps its old titlebar. Lens keeps it out while a
                      fullscreen app or an anti-cheat protected game is running, and removes it the moment you
                      switch this off, quit, or use Remove all.
                    </div>
                    <HookStatus enabled={!!config.func.injectedHook} />
                  </div>
                  <button
                    type="button"
                    role="switch" aria-checked={!!(config.func.injectedHook)} aria-label="Legacy In-App Window Styling" className={`cc-toggle ${config.func.injectedHook ? "on" : ""}`}
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
                    <div className="cc-desc">Saves memory: Control Center, Launcher, Overview and other panels load the first time you open them. Applies after restarting Lens.</div>
                  </div>
                  <button
                    type="button"
                    role="switch" aria-checked={!!(config.func.lazyWindows)} aria-label="Create Rarely Used Windows on Demand" className={`cc-toggle ${config.func.lazyWindows ? "on" : ""}`}
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
                    role="switch" aria-checked={!!(config.func.trayHost)} aria-label="System Tray in Top Bar (experimental)" className={`cc-toggle ${config.func.trayHost ? "on" : ""}`}
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
                    role="switch" aria-checked={!!(config.func.clipboardHistory)} aria-label="Clipboard History" className={`cc-toggle ${config.func.clipboardHistory ? "on" : ""}`}
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
                    <div className="cc-desc">Ctrl+Alt+Arrows snap, Alt+Shift+Arrows move focus. These keys stop reaching other apps. Applies after restarting Lens.</div>
                  </div>
                  <button
                    type="button"
                    role="switch" aria-checked={!!(config.func.tilingHotkeys)} aria-label="Keyboard Tiling Shortcuts" className={`cc-toggle ${config.func.tilingHotkeys ? "on" : ""}`}
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
                    <div className="cc-desc">Alt+1 is the first Dock app, and so on. These keys stop reaching other apps. Applies after restarting Lens.</div>
                  </div>
                  <button
                    type="button"
                    role="switch" aria-checked={!!(config.func.dockNumberHotkeys)} aria-label="Alt+1–9 Opens Dock Apps" className={`cc-toggle ${config.func.dockNumberHotkeys ? "on" : ""}`}
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
                    <div className="cc-desc">Command Palette: {config.func.paletteHotkey || "Alt+Space"} · Widget Drawer: {config.func.widgetsHotkey || "Ctrl+Alt+W"}</div>
                  </div>
                  <span className="cc-chip active">Active</span>
                </div>
              </div>

              <div id="sec-input" className="sh-anchor">
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

              <div id="sec-styling" className="sh-anchor">
                <div className="cc-section-title">Window styling</div>
                <div className="cc-section-sub">
                  Focus dimming, the active-window border, pin on top and per-app rules.
                </div>
              </div>
              <WindowRulesCard />

              {/* Replacing Explorer as the shell is a Tester mode experiment only (docs/FAILSAFE.md §9). */}
              {config.tester?.enabled && (
                <div id="sec-shell">
                  <ShellModeCard />
                </div>
              )}
            </>
          )}
          </PageErrorBoundary>
          </MoreOptions>
          </div>
        </main>
      </div>
      <GuideDrawer config={config} context={{ surface: "settings", tab }} aiEnabled={!!config?.ai?.enabled} />
      <ToastHost />
    </div>
  );
};
