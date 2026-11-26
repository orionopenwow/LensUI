// Test double for @tauri-apps/api/core, used only by the parity harness (tools/parity).
// Every command the surfaces call at startup returns realistic sample data; unknown commands
// resolve to null, so a surface that crashes on null data shows up as a page error.
import { applyThemePack } from "../../../src/themes/packs";
import { applyFeaturedLook, isFeatured } from "../../../src/themes/featured";
import { wallpaperHandlers } from "./wallpapers";
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
  // `?settingsMode=simple|advanced` shows Settings in that mode (docs/SETTINGS_SIMPLE.md).
  settingsMode: params.get("settingsMode") ?? "advanced",
};
let config: any = JSON.parse(JSON.stringify(base));
const now = Date.now();
const note = (id: string, title: string, body: string, appName: string, mins: number) => ({ id, title, body, appName, category: "system", tsMs: now - mins * 60000, source: "lens" });
const notes = [
  note("n1", "Build finished", "Lens built in 2 min 14 s.", "Terminal", 2),
  note("n2", "Tests passed", "86 tests, 0 failures.", "Terminal", 5),
  note("n3", "Pushed", "feature/productivity-input", "Terminal", 9),
  note("n4", "Deploy queued", "Pages will update shortly.", "Terminal", 14),
  note("n5", "Theme switched", "Alabaster Daylight is on until sunset.", "Lens", 30),
];
config.theme.preset = preset;
// Community packs (cc-*): apply the whole pack, so the accent and surface match the gallery card.
if (preset.startsWith("cc-") || preset.startsWith("living-")) config = applyThemePack(config, preset);
// ?look=1: the whole featured look (font, glass, Dock style and feel), as "Apply" does it.
if (params.get("look") && isFeatured(preset)) config = applyFeaturedLook(config, preset);
// ?shape=expressive|dotmatrix and ?dockStyle=islands: style-layer scenes (tools/parity/styles).
if (params.get("shape")) config.theme.shapeStyle = params.get("shape");
if (params.get("dockStyle")) config.dock.style = params.get("dockStyle");
// ?magic=dashboard,studioV2,… turns on Magic preview flags (and Tester mode, which shows the
// Settings › About › Magic (preview) section) for the Magic scaffold scenes.
if (params.get("magic")) {
  const on = Object.fromEntries((params.get("magic") || "").split(",").filter(Boolean).map((f) => [f, true]));
  config.tester = { enabled: true };
  config.magicWaves = { dashboard: false, widgets: false, mouse: false, mouseHoldMs: 400, startButton: false, shelfNotes: false, studioV2: false, learn: false, ...on };
}
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
  // ThumbDesk (Settings › Gaming › Use a controller). ?thumbdesk=off shows the "Get ThumbDesk" state.
  thumbdesk_info: () =>
    params.get("thumbdesk") === "off"
      ? { installed: false, path: null, running: false, status: null, pinned: false }
      : {
          installed: true,
          path: "C:\\Users\\you\\AppData\\Roaming\\LensUI\\apps\\portable\\thumbdesk\\ThumbDesk.exe",
          running: true,
          pinned: true,
          status: { version: "2.3.0", connected: true, controller: "DualSense Wireless Controller", runtimeEnabled: true, guardSuspended: false, voiceListening: false },
        },
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
  // The offline intent engine (ai/intent.rs) for a couple of common phrasings.
  ai_intent: (a: any) =>
    /dark mode/i.test(a.text ?? "")
      ? { action: "set_color_mode", args: { mode: "dark", _tool: "set_color_mode" }, confidence: 0.97, summary: "Switch to dark mode" }
      : null,
  ai_run_intent: () => "ai-mock-1",
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
  ...wallpaperHandlers,
  get_config: () => config,
  get_wallpaper_state_cmd: () => {
    // `?ambient=subtle|lively|still` shows the theme backdrop (docs/AMBIENT.md); `&ambientScene=<id>` overrides it.
    const q = typeof location !== "undefined" ? new URLSearchParams(location.search) : new URLSearchParams();
    const amb = q.get("ambient");
    // `&scene=<id>` shows a Playground scene instead (a living theme's own wallpaper).
    const scene = q.get("scene") || (amb ? "ambient" : "");
    const sceneOptions = amb ? { ambient: { motion: amb, variant: q.get("ambientScene") ?? "auto" } } : {};
    return { settings: { enabled: !!amb || !!scene, file: "", fit: "cover", blur: 0, dim: 0, saturation: 100, pauseWhenCovered: true, pauseOnBattery: true, accentHex: "", followAccent: false, scene, sceneOptions, fps: 30, calm: false, interactive: false, ripples: false, workspaceScenes: {}, idleEnabled: false, idleMinutes: 10, idleScene: "" }, path: null, kind: null, attached: false, folder: "C:\\Users\\u\\AppData\\Roaming\\LensUI\\wallpapers" };
  },
  list_wallpapers_cmd: () => [],
  get_battery_cmd: () => ({ hasBattery: true, percent: 76, charging: false, pluggedIn: false, secondsLeft: 12840, batterySaver: false, powerMode: "balanced", powerModeSupported: true, present: true, minutesRemaining: 214 }),
  get_keyboard_layouts_cmd: () => ({ activeId: "04090409", current: "04090409", layouts: [{ id: "04090409", short: "ENG", name: "English (United States)" }, { id: "08090809", short: "ENG", name: "English (United Kingdom)" }] }),
  // Settings hub (Windows pages)
  get_wifi_cmd: () => ({ available: true, reason: "", radioOn: true, adapter: "Intel Wi-Fi 6E AX211", connectedSsid: "Home 5G", networks: [
    { ssid: "Home 5G", signal: 92, bars: 4, secured: true, connected: true, hasProfile: true },
    { ssid: "Home", signal: 80, bars: 3, secured: true, connected: false, hasProfile: true },
    { ssid: "Cafe Guest", signal: 55, bars: 2, secured: false, connected: false, hasProfile: false },
    { ssid: "NETGEAR-7F", signal: 30, bars: 1, secured: true, connected: false, hasProfile: false },
  ] }),
  get_bluetooth_cmd: () => ({ available: true, reason: "", radioOn: true, devices: [
    { name: "WH-1000XM5", address: "AA:BB:CC:00:11:22", connected: true, kind: "audio" },
    { name: "MX Master 3S", address: "AA:BB:CC:00:11:33", connected: true, kind: "input" },
    { name: "Pixel 9", address: "AA:BB:CC:00:11:44", connected: false, kind: "phone" },
  ] }),
  list_audio_devices_cmd: (a: any) => a.flow === "capture"
    ? { flow: "capture", canSwitch: true, devices: [{ id: "in1", name: "Microphone (Yeti)", isDefault: true }, { id: "in2", name: "Headset mic (WH-1000XM5)", isDefault: false }] }
    : { flow: "render", canSwitch: true, devices: [{ id: "out1", name: "Speakers (Realtek)", isDefault: true }, { id: "out2", name: "Headphones (WH-1000XM5)", isDefault: false }] },
  sys_display_modes_cmd: () => [
    { device: "\\\\.\\DISPLAY1", width: 2560, height: 1440, refreshHz: 144, bitsPerPixel: 32 },
    { device: "\\\\.\\DISPLAY2", width: 2560, height: 1440, refreshHz: 60, bitsPerPixel: 32 },
  ],
  sys_startup_list_cmd: () => [
    { name: "Discord", command: "\"C:\\Users\\u\\AppData\\Local\\Discord\\Update.exe\" --processStart Discord.exe", enabled: true },
    { name: "Spotify", command: "C:\\Users\\u\\AppData\\Roaming\\Spotify\\Spotify.exe /minimized", enabled: false },
    { name: "OneDrive", command: "\"C:\\Program Files\\Microsoft OneDrive\\OneDrive.exe\" /background", enabled: true },
  ],
  sys_startup_set_cmd: () => null,
  sys_drives_cmd: () => [
    { root: "C:\\", label: "Windows", kind: "fixed", totalBytes: 1_000_204_886_016, freeBytes: 212_000_000_000 },
    { root: "D:\\", label: "Games", kind: "fixed", totalBytes: 2_000_398_934_016, freeBytes: 120_000_000_000 },
    { root: "E:\\", label: "USB", kind: "removable", totalBytes: 64_000_000_000, freeBytes: 41_000_000_000 },
  ],
  sys_privacy_cmd: () => [
    { capability: "microphone", app: "Discord", inUse: true },
    { capability: "webcam", app: "Zoom", inUse: false },
    { capability: "location", app: "Weather", inUse: false },
  ],
  sys_access_cmd: () => ({ animations: true, highContrast: false, textScale: 100 }),
  sys_time_cmd: () => ({ timeZone: "US Mountain Standard Time", shortTime: "h:mm tt", clock24: false }),
  sys_gaming_cmd: () => ({ gameMode: true }),
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
  list_audio_sessions_cmd: () => [
    { pid: 1, name: "Spotify", volume: 70, muted: false },
    { pid: 2, name: "Chrome", volume: 40, muted: false },
    { pid: 3, name: "Discord", volume: 85, muted: false },
    { pid: 4, name: "Steam", volume: 30, muted: true },
    { pid: 0, name: "System Sounds", volume: 50, muted: false },
  ],
  sys_audio_levels_cmd: () => ({
    masterPeak: 58,
    sessions: [{ pid: 1, active: true, peak: 64 }, { pid: 3, active: true, peak: 22 }, { pid: 2, active: false, peak: 0 }, { pid: 4, active: false, peak: 0 }, { pid: 0, active: false, peak: 0 }],
    mic: { available: true, volume: 72, muted: false, peak: 35 },
  }),
  sys_set_mic_cmd: () => null,
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
  // Lens setup scenes: ?setup=first shows the first-launch setup, ?setup=update the "What's new" path.
  setup_status_cmd: () =>
    params.get("setup") === "first"
      ? { version: "0.3.0", seenVersion: "", onboardingCompleted: false, forced: false }
      : params.get("setup") === "update"
        ? { version: "0.3.0", seenVersion: "", onboardingCompleted: true, forced: false }
        : { version: "0.3.0", seenVersion: "0.3.0", onboardingCompleted: true, forced: false },
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
