// Test double for @tauri-apps/api/core, used only by the parity harness (tools/parity).
// Every command the surfaces call at startup returns realistic sample data; unknown commands
// resolve to null, so a surface that crashes on null data shows up as a page error.
import { emitLocal } from "./event";
const params = new URLSearchParams(location.search);
const preset = params.get("preset") || "obsidian";
const W = (globalThis as any);
const base = {
  theme: { preset: "obsidian", accentMode: "custom", customAccent: "#FAFAFA", glassOpacity: 0.96, blurPx: 20, borderRadius: 8, accentTintStrength: 0, customCss: "", fontFamily: "rounded-arial", uiScale: 100, surfaceHex: "" },
  dock: { groundedMarginBottom: 0, iconSize: 40, hoverScale: 1.24, hoverLift: 8, autoHide: "never", showTopBar: true,
    pinnedApps: [
      { id: "explorer", name: "File Explorer", path: "C:\\Windows\\explorer.exe", iconHint: "folder" },
      { id: "terminal", name: "Terminal", path: "wt.exe", iconHint: "terminal" },
      { id: "notepad", name: "Notepad", path: "notepad.exe", iconHint: "file-text" },
      { id: "tb-chrome", name: "Google Chrome", path: "C:\\x\\Google Chrome.lnk", iconHint: null },
      { id: "tb-code", name: "Visual Studio Code", path: "C:\\x\\Visual Studio Code.lnk", iconHint: null },
      { id: "tb-spotify", name: "Spotify", path: "C:\\x\\Spotify.lnk", iconHint: null },
    ],
    pinnedFolders: [
      { id: "downloads", name: "Downloads", path: "C:\\Users\\u\\Downloads", theme: "accent", viewMode: "grid" },
      { id: "desktop", name: "Desktop", path: "C:\\Users\\u\\Desktop", theme: "obsidian", viewMode: "grid" },
    ] },
  topBar: { enabled: true, autoHide: "overlap", revealDelayMs: 100, hideDelayMs: 350, height: 34, floating: false, showMediaControls: true },
  func: { hideNativeTaskbar: true, runOnStartup: true, paletteHotkey: "Alt+Space", widgetsHotkey: "Alt+W", gamingPause: true, middleClickNewInstance: true, injectedHook: false, trayHost: false, tilingHotkeys: false, clipboardHistory: false, targetMonitor: "primary" },
  windowControls: { enabled: true, style: "traffic-classic", order: "green-yellow-red", position: "top-right", frameBorderEnabled: true, frameStyle: "obsidian-hairline", excludedProcesses: [] },
  iconStyle: { theme: "obsidian-squircle", shape: "squircle" },
  folderStyle: { theme: "accent", globalExplorerOverride: false },
  sessions: [ { id: "main", name: "Main", color: "#2D7D9A", apps: [] }, { id: "focus", name: "Focus", color: "#22C55E", apps: [] }, { id: "creative", name: "Creative", color: "#EAB308", apps: [] } ],
  activeSessionId: "main",
  widgets: { enabledWidgets: ["clock", "telemetry", "notes", "quick-actions"], notes: "Welcome" },
  styledFolders: [], onboardingCompleted: true, themeSchedule: null,
};
let config: any = JSON.parse(JSON.stringify(base));
const now = Date.now();
const note = (id: string, title: string, body: string, appName: string, mins: number) => ({ id, title, body, appName, category: "system", tsMs: now - mins * 60000, source: "lens" });
const notes = [
  note("n1", "Build finished", "Lens UI built in 2 min 14 s.", "Terminal", 2),
  note("n2", "Tests passed", "86 tests, 0 failures.", "Terminal", 5),
  note("n3", "Pushed", "feature/productivity-input", "Terminal", 9),
  note("n4", "Deploy queued", "Pages will update shortly.", "Terminal", 14),
  note("n5", "Theme switched", "Alabaster Daylight is on until sunset.", "Lens UI", 30),
];
config.theme.preset = preset;
W.__lensConfig = () => config;
W.__lensSetConfig = (c: any) => { config = c; };
const win = (hwnd: number, title: string, proc: string, exe: string, focused = false) => ({ hwnd, title, processName: proc, exePath: exe, isFocused: focused, isMinimized: false, isMaximized: focused, iconDataUrl: null });
const running = [
  win(101, "Lens UI — Visual Studio Code", "Code.exe", "C:\\x\\Code.exe", true),
  win(102, "Google Chrome", "chrome.exe", "C:\\x\\chrome.exe"),
  win(103, "Spotify Premium", "Spotify.exe", "C:\\x\\Spotify.exe"),
  win(104, "Downloads - File Explorer", "explorer.exe", "C:\\Windows\\explorer.exe"),
];
const apps = ["Blender 5.1", "Audacity", "Android Studio", "7-Zip File Manager", "Adobe Photoshop 2023", "Google Chrome", "Notepad", "Spotify", "Steam", "Visual Studio Code", "Discord", "OBS Studio"].map((n) => ({ name: n, path: `C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs\\${n}.lnk`, category: "App" }));
// ?ws=groups: Lens workspaces in groups mode, so the Overview shows its workspace strip.
const wsGroups = params.get("ws") === "groups";
const wsDefs = [
  { index: 0, id: "ws-1", name: "Main", color: "#60A5FA", layout: "", windowCount: 2 },
  { index: 1, id: "ws-2", name: "Work", color: "#34D399", layout: "", windowCount: 1 },
  { index: 2, id: "ws-3", name: "Play", color: "#FBBF24", layout: "", windowCount: 1 },
];
const wsStatus = () =>
  wsGroups
    ? { enabled: true, mode: "groups", active: 0, workspaces: wsDefs, desktopCount: 1, appRulesActive: false, note: "" }
    : { enabled: false, active: "1", workspaces: [] };
config.dndSchedule = { enabled: true, ranges: [{ startMin: 1320, endMin: 420, days: [0, 1, 2, 3, 4, 5, 6] }, { startMin: 540, endMin: 720, days: [1, 2, 3, 4, 5] }], autoFullscreen: true };
const handlers: Record<string, (a: any) => any> = {
  // Wave 4–6 cards (integration): enough realistic data for every Control Center tab.
  list_monitors_cmd: () => [
    { id: "\\\\.\\DISPLAY1", name: "DELL U2723QE", x: 0, y: 0, width: 2560, height: 1440, workX: 0, workY: 0, workWidth: 2560, workHeight: 1392, scale: 1.5, primary: true },
    { id: "\\\\.\\DISPLAY2", name: "LG 27GL850", x: 2560, y: 0, width: 2560, height: 1440, workX: 2560, workY: 0, workWidth: 2560, workHeight: 1440, scale: 1, primary: false },
  ],
  get_keyhook_status_cmd: () => ({ winLauncher: false, altTab: false, active: false, suspended: false, pausedForFullscreen: false, lastProblem: "" }),
  get_ui_scale_support_cmd: () => false,
  get_update_settings_cmd: () => ({ mode: "notify", lastCheckMs: Date.now() - 3600_000 }),
  list_crash_reports_cmd: () => [],
  ai_status: () => ({
    providers: [
      { id: "script", kind: "script", label: "Offline helper", available: true, model: "", is_local: true, needs_key: false, has_key: false },
      { id: "local", kind: "local", label: "Ollama", available: true, model: "llama3.2:3b", is_local: true, needs_key: false, has_key: false },
      { id: "claude", kind: "claude", label: "Claude", available: true, model: "claude-sonnet-5-5", is_local: false, needs_key: true, has_key: false },
    ],
    active: "off",
    privacy: "local_only",
  }),
  ai_usage_log: () => [],
  clip_status: () => ({ enabled: false, pausedUntilMs: 0, ignoreNext: false, count: 0, pinned: 0, settings: { enabled: false, maxItems: 500, maxDays: 30, maxTotalBytes: 67108864, maxItemBytes: 2097152, excludedApps: ["1password.exe", "bitwarden.exe", "keepassxc.exe"], captureImages: true, captureFiles: true, preferPlainPaste: false } }),
  clip_list: () => [],
  selection_policy_get: () => ({ bubble: false, readOnRequest: true, mode: "allow", apps: ["winword.exe", "excel.exe", "notepad.exe", "code.exe"], maxChars: 20000 }),
  command_templates: () => ({ templates: [], error: null, path: "C:\\Users\\u\\AppData\\Roaming\\LensUI\\commands.json" }),
  shelves_list: () => [{ id: "default", name: "Shelf", created_ms: Date.now(), item_count: 0, approx_tokens: 0 }],
  shelf_list: () => [],
  bridge_status: () => ({ enabled: false, running: false, port: 0, hosts: [{ browser: "chrome", installed: false }, { browser: "edge", installed: false }, { browser: "firefox", installed: false }], urlSchemeInstalled: false, explorerVerbsInstalled: false, chromiumExtensionId: "flioplocnjlfpjbgoekcbdmacpedkaej", firefoxExtensionId: "lens@lensui.app", extraExtensionIds: [], pending: 0, windowsOnly: false }),
  bridge_inbox: () => [],
  claude_code_command: () => "claude mcp add lens -- \"C:\\Program Files\\Lens UI\\lens-ui.exe\" --mcp-stdio",
  transcribe_status: () => [],
  get_mcp_status_cmd: () => ({ running: false, port: 0, connections: 0, command: "C:\\Program Files\\Lens UI\\lens-ui.exe", args: ["--mcp-stdio"], claudeDesktopSnippet: "{}", endpointFile: "" }),
  list_mcp_actions_cmd: () => [],
  get_mcp_audit_cmd: () => [],
  list_top_processes_cmd: () => [
    { pid: 4120, name: "chrome.exe", cpuUsage: 6.4, memoryMb: 812 },
    { pid: 8812, name: "Code.exe", cpuUsage: 3.1, memoryMb: 640 },
    { pid: 2244, name: "lens-ui.exe", cpuUsage: 0.8, memoryMb: 210 },
  ],
  transcribe_settings_get: () => ({
    settings: { whisperBin: null, modelPath: null, ffmpegPath: null, ytdlpPath: null, urlTranscription: false, urlTermsAcknowledged: false, nextToSource: false, defaultLanguage: "auto", threads: null, liveCaptionsExperimental: false },
    tools: { whisperBin: null, modelPath: null, ffmpegPath: null, ytdlpPath: null, ready: false, canDoVideo: false, canDoUrls: false, notes: ["whisper.cpp not found. Point Lens at whisper-cli.exe."] },
    transcriptsDir: "C:\\Users\\u\\AppData\\Roaming\\LensUI\\transcripts",
  }),
  get_config: () => config,
  get_wallpaper_state_cmd: () => {
    // `?ambient=subtle|lively|still` shows the theme backdrop (docs/AMBIENT.md); `&ambientScene=<id>` overrides it.
    const q = typeof location !== "undefined" ? new URLSearchParams(location.search) : new URLSearchParams();
    const amb = q.get("ambient");
    const scene = amb ? "ambient" : "";
    const sceneOptions = amb ? { ambient: { motion: amb, variant: q.get("ambientScene") ?? "auto" } } : {};
    return { settings: { enabled: !!amb, file: "", fit: "cover", blur: 0, dim: 0, saturation: 100, pauseWhenCovered: true, pauseOnBattery: true, accentHex: "", followAccent: false, scene, sceneOptions, fps: 30, calm: false, interactive: false, ripples: false, workspaceScenes: {}, idleEnabled: false, idleMinutes: 10, idleScene: "" }, path: null, kind: null, attached: false, folder: "C:\\Users\\u\\AppData\\Roaming\\LensUI\\wallpapers" };
  },
  list_wallpapers_cmd: () => [],
  get_battery_cmd: () => ({ present: true, percent: 76, charging: false, minutesRemaining: 214, powerMode: "balanced", batterySaver: false }),
  get_keyboard_layouts_cmd: () => ({ current: "00000409", layouts: [{ id: "00000409", short: "ENG", name: "English (United States)" }] }),
  list_plugins_cmd: () => [],
  list_plugin_approvals_cmd: () => [],
  get_tiling_status_cmd: () => ({ enabled: false, layout: "master-stack", tiled: 0, floating: 0 }),
  get_workspaces_status_cmd: wsStatus,
  get_window_workspaces_cmd: () => (wsGroups ? [[101, 0], [102, 1], [103, 2], [104, 0]] : []),
  move_window_to_workspace_cmd: () => wsStatus(),
  get_alt_drag_status_cmd: () => ({ enabled: true, hookActive: true, reinstalls: 0, lastProblem: "" }),
  get_app_summon_status_cmd: () => {
    const b = config.appSummon?.bindings ?? [];
    return b.map((x: any, i: number) => ({ id: x.id, ok: i === 0, message: i === 0 ? "Ready" : "Lens already uses this shortcut." }));
  },
  get_dnd_status_cmd: () => ({ active: true, manual: false, scheduled: true, fullscreen: false, reason: "schedule", untilMin: 420 }),
  set_dnd_schedule_cmd: (a) => { config = { ...config, dndSchedule: a.schedule }; return { active: false, manual: false, scheduled: false, fullscreen: false, reason: "", untilMin: null }; },
  get_search_usage_cmd: () => ({ entries: {} }),
  search_files_cmd: () => [],
  list_user_scripts_cmd: () => [],
  get_mcp_status_cmd: () => ({ running: false, port: 0, connections: 0, command: "C:\\Program Files\\Lens UI\\lens-ui.exe", args: ["--mcp-stdio"], claudeDesktopSnippet: "{}", endpointFile: "" }),
  list_mcp_actions_cmd: () => [],
  get_mcp_audit_cmd: () => [],
  save_config_cmd: (a) => { config = a.newConfig; emitLocal("lens://config-updated", config); return null; },
  get_windows_theme: () => ({ accentHex: "#2D7D9A", accentR: 45, accentG: 125, accentB: 154, appsUseLightTheme: false, systemUsesLightTheme: false, transparencyEnabled: true }),
  get_running_windows: () => running,
  get_icon_for_path: () => null,
  get_media_now_playing_cmd: () => ({ hasSession: true, isPlaying: true, title: "Midnight City", artist: "M83", album: "", sourceApp: "Spotify", thumbnailDataUrl: null }),
  get_quick_state_cmd: () => ({ volume: 62, muted: false, brightness: 80, nightLightEnabled: false, nightLightWarmth: 40 }),
  list_audio_sessions_cmd: () => [{ pid: 1, name: "Spotify", volume: 70, muted: false }, { pid: 2, name: "Chrome", volume: 40, muted: false }],
  get_telemetry_cmd: () => ({ cpuUsage: 14, memUsedGb: 9.2, memTotalGb: 32, memPercent: 29, uptimeMinutes: 312, cpuUsagePercent: 14, memoryUsedGb: 9.2, memoryTotalGb: 32, uptimeSeconds: 18720 }),
  scan_installed_apps_cmd: () => apps,
  get_launcher_home_cmd: () => ({ recentFiles: [{ name: "Q4 report.docx", path: "C:\\Users\\u\\Documents\\Q4 report.docx", extension: "docx", modifiedMinutesAgo: 12 }, { name: "logo.png", path: "C:\\Users\\u\\Pictures\\logo.png", extension: "png", modifiedMinutesAgo: 40 }], folders: [{ name: "Downloads", path: "C:\\Users\\u\\Downloads", color: "cobalt", itemCount: 42 }, { name: "Documents", path: "C:\\Users\\u\\Documents", color: "amber", itemCount: 18 }] }),
  list_theme_files_cmd: () => [],
  list_tray_icons_cmd: () => [],
  get_topbar_visible_cmd: () => true,
  is_surface_visible_cmd: () => false,
  get_dnd_cmd: () => false,
  list_desktop_items_cmd: () => [],
  get_desktop_icons_hidden_cmd: () => true,
  get_window_rules_cmd: () =>
    params.get("styling")
      ? [{ match: "windowsterminal", opacity: 90, inactiveOpacity: 70, frame: "default", corners: "default", exclude: false }]
      : [],
  // Window styling 2.0. `?styling=demo` shows the overlay border + dimming; `?styling=w10` a Windows 10 PC.
  get_window_styling_cmd: () => {
    const mode = params.get("styling");
    const caps = mode === "w10"
      ? { windowsBuild: 19045, nativeBorder: false, roundedCorners: false, overlays: true }
      : { windowsBuild: 26100, nativeBorder: true, roundedCorners: true, overlays: true };
    const settings = mode
      ? { dimInactive: 25, activeBorder: { mode: "overlay", style: "gradient", colors: ["#60A5FA", "#C084FC", "#F472B6"], widthPx: 3, glowPx: 12 }, skipFullscreen: true, exclusions: ["obs64", "steam"], peekDelayMs: 600 }
      : { dimInactive: 0, activeBorder: { mode: "off", style: "solid", colors: ["#60A5FA", "#C084FC"], widthPx: 2, glowPx: 0 }, skipFullscreen: true, exclusions: [], peekDelayMs: 600 };
    return { settings, caps };
  },
  set_window_styling_cmd: (a: any) => a.settings,
  list_pinned_windows_cmd: () => (params.get("styling") ? [{ hwnd: 102, process: "chrome", title: "Google Chrome" }] : []),
  get_shell_mode_status_cmd: () => ({ enabled: false, shellValue: "", exePath: "", explorerRunningAsShell: true, lastBootOk: true }),
  get_notification_center_cmd: () => ({ dnd: false, dndStatus: { active: true, manual: false, scheduled: true, fullscreen: false, reason: "schedule", untilMin: 420 }, items: notes, windows: { status: "unavailable", reason: "Test harness", items: [] } }),
  clipboard_list_cmd: () => ({ entries: [], paused: false }),
  get_training_stats_cmd: () => ({ pairCount: 0, filePath: "", fileSizeBytes: 0, recentPairs: [], macros: [] }),
  get_windhawk_status_cmd: () => ({ installed: false, exePath: null, modSourcePath: "", modInstalledInWindhawk: false }),
};
export const calls: string[] = [];
(W as any).__lensCalls = calls;
export async function invoke<T = any>(cmd: string, args?: any): Promise<T> {
  calls.push(cmd);
  const h = handlers[cmd];
  return (h ? h(args ?? {}) : null) as T;
}
export function convertFileSrc(p: string) { return p; }
export function isTauri() { return false; }
