import type * as Gen from "./generated";
export interface ThemeConfig {
  preset: "obsidian" | "windows-mesh" | "graphite" | "midnight" | string;
  accentMode: "windows" | "custom" | string;
  customAccent: string;
  glassOpacity: number;
  blurPx: number;
  borderRadius: number;
  accentTintStrength: number;
  customCss: string;
  fontFamily?: "rounded-arial" | "inter-sans" | "tech-mono" | "editorial-serif" | string;
  uiScale?: number;
  /** Solid surface base of the active theme pack ("" = stock obsidian). Drives native titlebar color. */
  surfaceHex?: string;
  /** "system" | "reduce" | "full" */
  motion?: string;
  /** "system" | "high" */
  contrast?: string;
  /** "auto" | "en" | "es" | "de" */
  locale?: string;
}

export interface PinnedApp {
  id: string;
  name: string;
  path: string;
  iconHint?: string | null;
}

export interface PinnedFolder {
  id: string;
  name: string;
  path: string;
  theme: "obsidian" | "accent" | "cobalt" | "emerald" | "amber" | "rose" | string;
  viewMode: "grid" | "list" | "fan" | string;
}

export interface DockConfig {
  groundedMarginBottom: number;
  iconSize: number;
  hoverScale: number;
  hoverLift: number;
  autoHide: "never" | "smart" | "always" | string;
  showTopBar: boolean;
  pinnedApps: PinnedApp[];
  pinnedFolders: PinnedFolder[];
  /** Screen edge the Dock sits on. */
  position?: "bottom" | "top" | "left" | "right" | string;
  /** No drag-reorder, unpin or remove while locked. */
  locked?: boolean;
  /** Pinned app ids followed by a user separator. */
  separatorsAfter?: string[];
  /** Live window thumbnails in the Dock hover card. */
  livePreviews?: boolean;
  /** Dock shape (see src/dock/styles.ts). Missing = "floating". */
  style?: "floating" | "slim" | "taskbar" | "studio" | "minimal" | "split" | string;
  /** Taskbar icon alignment. Missing = "center". */
  alignment?: "center" | "left" | string;
  /** Where the clock and system icons live. Missing = "auto". */
  systemArea?: "auto" | "dock" | "topbar" | string;
  /** Hover magnification. Missing = "off" (today's gentle hover). */
  magnification?: "off" | "subtle" | "classic" | string;
  /** Neighbouring icons each side that magnification reaches (1-4). Missing = 2. */
  magnificationRange?: number;
  /** Launch animation. Missing = "lift". */
  launchAnimation?: "none" | "lift" | "bounce" | "jelly" | string;
  /** Pulse an app icon when its window is minimised or restored. */
  minimizeFeedback?: boolean;
  /** Icon size per Dock style id. */
  iconSizes?: Record<string, number>;
  /** App names beside (bars) or under (centred Docks) app icons. */
  showLabels?: boolean;
  /** Drop files on a Dock app to open them with it. */
  fileDropOpen?: boolean;
  /** Mouse wheel over an app icon cycles its windows. */
  scrollCyclesWindows?: boolean;
  /** Suggest apps you usually open now (local predictor, no AI model). Off by default. */
  suggestedApps?: boolean;
}

export interface FuncConfig {
  hideNativeTaskbar: boolean;
  runOnStartup: boolean;
  paletteHotkey: string;
  widgetsHotkey: string;
  gamingPause: boolean;
  middleClickNewInstance: boolean;
  /** Legacy in-process window styling (loads a DLL into every app). Off by default. */
  injectedHook?: boolean;
  /** Lens hosts tray icons itself in the Top Bar (experimental). */
  trayHost?: boolean;
  /** Alt+1..9 activates the Nth Dock app (applies after restart). */
  dockNumberHotkeys?: boolean;
  /** Global keyboard-tiling hotkeys (takes effect after restart). */
  tilingHotkeys?: boolean;
  /** Clipboard history: text only, kept in memory only. */
  clipboardHistory?: boolean;
  /** "primary" or a monitor id. */
  targetMonitor?: string;
  /** Build rarely used windows on first open (takes effect after restart). */
  lazyWindows?: boolean;
  /** Tap the Win key to open the Lens Launcher. Off by default. */
  winKeyLauncher?: boolean;
  /** Alt+Tab opens Lens Overview. Off by default. */
  altTabOverview?: boolean;
  /** One Top Bar per monitor (applies after restart). Off by default. */
  perMonitorBars?: boolean;
}

export interface WindowControlsConfig {
  enabled: boolean;
  style: "traffic-classic" | "traffic-muted" | "minimal-dots" | "accent-pills" | string;
  order: "green-yellow-red" | "red-yellow-green" | string;
  position: "top-right" | "top-left" | string;
  frameBorderEnabled?: boolean;
  frameStyle?: "accent-glow" | "obsidian-hairline" | "neon" | "none" | string;
  excludedProcesses: string[];
}

export interface IconStyleConfig {
  theme: "obsidian-squircle" | "frosted-glass" | "monochrome" | "accent-duotone" | "native" | string;
  shape: "squircle" | "rounded" | "circle" | "borderless" | string;
}

export interface FolderStyleConfig {
  theme: "accent" | "obsidian" | "cobalt" | "emerald" | "amber" | "rose" | "minimal" | "neon" | string;
  globalExplorerOverride: boolean;
}

export interface SavedSession {
  id: string;
  name: string;
  color: string;
  apps: string[];
  layout?: string | null;
}

export type WidgetsConfig = Gen.WidgetsConfig;

export type StyledFolderRecord = Gen.StyledFolderRecord;

export interface TopBarConfig {
  enabled: boolean;
  autoHide: "overlap" | "never" | "always" | string;
  revealDelayMs: number;
  hideDelayMs: number;
  height: number;
  floating: boolean;
  showMediaControls?: boolean;
}

export interface MediaNowPlaying {
  hasSession: boolean;
  isPlaying: boolean;
  title: string;
  artist: string;
  album: string;
  sourceApp: string;
  thumbnailDataUrl?: string | null;
}

export interface LensConfig {
  theme: ThemeConfig;
  dock: DockConfig;
  topBar: TopBarConfig;
  func: FuncConfig;
  windowControls: WindowControlsConfig;
  iconStyle?: IconStyleConfig;
  folderStyle?: FolderStyleConfig;
  sessions: SavedSession[];
  activeSessionId: string;
  widgets: WidgetsConfig;
  styledFolders: StyledFolderRecord[];
  onboardingCompleted?: boolean;
  themeSchedule?: Partial<import("../themes/schedule").ThemeSchedule> | null;
  tiling?: import("../components/TilingCard").TilingConfig;
  workspaces?: import("../components/WorkspacesCard").WorkspacesConfig;
  desktopGroups?: unknown;
  configVersion?: number;
  mcp?: import("../components/McpCard").McpConfig;
  /** Lens Intelligence settings (off by default). Keys are never part of the config. */
  ai?: import("../ai/contract").AiConfig;
  hotCorners?: import("../types/generated").HotCornersConfig;
  altDrag?: import("../types/generated").AltDragConfig;
  appSummon?: import("../types/generated").AppSummonConfig;
  dndSchedule?: import("../types/generated").DndSchedule;
  /** Lens Command, Mini and the Edge Shelf (off by default; see src/command/settings.ts). */
  command?: Partial<import("../command/settings").CommandSettings>;
}

/** OS fields are optional on the frontend: older backends and the initial state omit them. */
export type WindowsThemeInfo = Omit<Gen.WindowsThemeInfo, "osFamily" | "windowsBuild" | "osFeatures"> &
  Partial<Pick<Gen.WindowsThemeInfo, "osFamily" | "windowsBuild" | "osFeatures">>;
export type OsFeatures = Gen.OsFeatures;

export interface RunningWindow {
  hwnd: number;
  title: string;
  processName: string;
  exePath: string;
  isFocused: boolean;
  isMinimized: boolean;
  isMaximized: boolean;
  iconDataUrl?: string | null;
}

export type FolderEntry = Gen.FolderEntry;

export type SystemTelemetry = Gen.SystemTelemetry;

export type InstalledApp = Gen.InstalledApp;
