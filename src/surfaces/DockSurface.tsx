import React, { useEffect, useRef, useState, useLayoutEffect } from "react";
import "../dock/islands/islands.css";
import { useUnifiedSearch } from "../search/useUnifiedSearch";
import { PluginSlot } from "../components/PluginSlot";
import { McpBridge } from "../components/McpBridge";
import { AiApplyBridge } from "../components/AiApplyBridge";
import { AskDockPopover, AskModeToggle, useAskMode } from "../dock/ai/AskDock";
import { DropSparkle, DropToAiMenu } from "../dock/ai/DropToAi";
import { SuggestedApps, recordDockLaunch } from "../dock/ai/SuggestedApps";
import { VoiceDockView, DockMicButton, useVoiceDock } from "../dock/voice/VoiceDock";
import { MiniPlayer } from "../music/MiniPlayer";
import { useMiniPlacement } from "../music/useMiniPlacement";
import type { DockStyleId as VoiceDockStyle, Edge as VoiceEdge } from "../dock/voice/dockMorph";
import "../dock/ai/aiDock.css";
import type { AiContext } from "../ai/surfaceApi";
import { toDockResults } from "../search/dockAdapter";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { captureFlip, glideOut, useLingering, type FlipCapture } from "../ui/motion";
import { attentionFor, useAttention } from "../dock/attention";
import { FlyoutClose } from "../ui/FlyoutClose";
import {
  Search,
  Folder,
  Terminal,
  Globe,
  FileText,
  Activity,
  AppWindow,
  Pin,
  PinOff,
  ExternalLink,
  Minus,
  Square,
  X,
  PlusSquare,
  Trash2,
  Settings,
  Shield,
  FolderOpen,
  ArrowUpToLine,
  Palette,
  PanelBottom,
  Monitor,
  Sparkles,
  SkipBack,
  Play,
  Pause,
  SkipForward,
  Music,
  PanelTop,
  PanelLeft,
  PanelRight,
  Lock,
  Unlock,
  SeparatorVertical,
  LayoutGrid,
} from "lucide-react";
import { magicOpenFor } from "../magic/contract";
import { LensMenuRow, LensPan } from "../magic/LensPan";
import { useLensState, useRunningWindows } from "../hooks/useLensState";
import {
  executeNaturalLanguagePlan,
  parseNaturalLanguageActions,
} from "../utils/nlActionRouter";
import type { InstalledApp, MediaNowPlaying, PinnedApp, PinnedFolder, RunningWindow } from "../types/lens";
import "./CommandPaletteSurface.css";
import { useThemeSchedule } from "../themes/schedule";
import { DockPreviewStrip } from "../components/DockPreviewStrip";
import "./DockSurface.css";
import {
  DOCK_LAUNCH_ANIMATIONS,
  DOCK_MAGNIFICATION,
  clampMagnificationRange,
  dockStyleInfo,
  normalizeLaunchAnimation,
  normalizeMagnification,
  resolveDockIconSize,
  normalizeDockStyle,
  resolveDockAlignment,
  resolveSystemArea,
} from "../dock/styles";
import { DockSystemArea } from "../dock/DockSystemArea";

interface RecentFileItem {
  name: string;
  path: string;
  ext: string;
  ageLabel: string;
  sizeLabel?: string;
  folderName?: string;
  isDir?: boolean;
}

interface QuickFolderItem {
  name: string;
  path: string;
  color: string;
  itemCount?: number;
}

interface LauncherHomeData {
  recentFiles: RecentFileItem[];
  folders: QuickFolderItem[];
}

type DockFilterTab = "all" | "apps" | "files" | "folders" | "recent";

function DockMatteFolderSvg({ color }: { color: string }) {
  const map: Record<string, { back: string; top: string; bot: string }> = {
    cobalt: { back: "#0284c7", top: "#38bdf8", bot: "#0369a1" },
    amber: { back: "#b45309", top: "#fbbf24", bot: "#d97706" },
    emerald: { back: "#047857", top: "#34d399", bot: "#059669" },
    minimal: { back: "#a1a1aa", top: "#fafafa", bot: "#d4d4d8" },
  };
  const p = map[color] ?? map.cobalt;
  const gid = `dmf-${color}`;
  return (
    <svg viewBox="0 0 64 56" width="34" height="30" style={{ display: "block", filter: "drop-shadow(0 3px 6px rgba(0,0,0,0.45))" }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={p.top} />
          <stop offset="100%" stopColor={p.bot} />
        </linearGradient>
      </defs>
      <path
        d="M4 12C4 8.7 6.7 6 10 6H23C24.9 6 26.7 6.9 27.8 8.4L30 11.2C30.8 12.1 31.9 12.6 33 12.6H54C57.3 12.6 60 15.3 60 18.6V46C60 49.3 57.3 52 54 52H10C6.7 52 4 49.3 4 46V12Z"
        fill={p.back}
      />
      <rect x="4" y="17" width="56" height="35" rx="7" fill={`url(#${gid})`} />
      <path d="M11 18H53" stroke="rgba(255,255,255,0.45)" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function GlassFolderIcon({ theme }: { theme: string }) {
  const palettes: Record<string, { back: string; frontTop: string; frontBot: string; rim: string }> = {
    obsidian: { back: "#1e2028", frontTop: "#323542", frontBot: "#181920", rim: "rgba(255,255,255,0.28)" },
    cobalt: { back: "#1d4ed8", frontTop: "#3b82f6", frontBot: "#1e40af", rim: "rgba(191,219,254,0.55)" },
    emerald: { back: "#047857", frontTop: "#10b981", frontBot: "#065f46", rim: "rgba(167,243,208,0.55)" },
    amber: { back: "#b45309", frontTop: "#f59e0b", frontBot: "#92400e", rim: "rgba(254,243,199,0.55)" },
    rose: { back: "#be123c", frontTop: "#f43f5e", frontBot: "#9f1239", rim: "rgba(254,205,211,0.55)" },
    minimal: { back: "#32343c", frontTop: "#525562", frontBot: "#272930", rim: "rgba(255,255,255,0.38)" },
    neon: { back: "#0f172a", frontTop: "#1e293b", frontBot: "#090d16", rim: "#38bdf8" },
    accent: {
      back: "color-mix(in oklch, #1c1f28, var(--lens-accent) 42%)",
      frontTop: "color-mix(in oklch, #2b303e, var(--lens-accent) 62%)",
      frontBot: "color-mix(in oklch, #13151d, var(--lens-accent) 42%)",
      rim: "color-mix(in oklch, #ffffff, var(--lens-accent) 40%)",
    },
  };
  const p = palettes[theme] ?? palettes.obsidian;
  const gid = `gf-${theme}`;

  return (
    <svg
      viewBox="0 0 64 64"
      style={{
        width: "78%",
        height: "78%",
        display: "block",
        filter: "drop-shadow(0 3px 6px rgba(0,0,0,0.45))",
        pointerEvents: "none",
      }}
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={p.frontTop} />
          <stop offset="100%" stopColor={p.frontBot} />
        </linearGradient>
      </defs>
      {/* Backplate + rounded tab */}
      <path
        d="M6 16C6 12.686 8.686 10 12 10H24.5C26.4 10 28.1 10.9 29.2 12.4L31.4 15.2C32.1 16.1 33.2 16.6 34.4 16.6H52C55.314 16.6 58 19.286 58 22.6V48C58 51.314 55.314 54 52 54H12C8.686 54 6 51.314 6 48V16Z"
        fill={p.back}
      />
      {/* Subtle frosted paper sheet peeking */}
      <rect x="11" y="19" width="42" height="6" rx="3" fill="rgba(255,255,255,0.16)" />
      {/* Matte glassware front flap */}
      <rect x="5" y="22" width="54" height="33" rx="7" fill={`url(#${gid})`} />
      {/* Top specular glass rim */}
      <path
        d="M12 22.75H52"
        stroke={p.rim}
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity="0.7"
      />
      {/* Minimalist centered notch */}
      <rect x="25" y="37" width="14" height="2.6" rx="1.3" fill="rgba(255,255,255,0.28)" />
    </svg>
  );
}

function FallbackAppIcon({ hint }: { hint?: string | null }) {
  switch (hint) {
    case "folder":
      return <Folder size={20} strokeWidth={1.8} />;
    case "terminal":
      return <Terminal size={20} strokeWidth={1.8} />;
    case "globe":
      return <Globe size={20} strokeWidth={1.8} />;
    case "file-text":
      return <FileText size={20} strokeWidth={1.8} />;
    default:
      return <AppWindow size={20} strokeWidth={1.8} />;
  }
}

const PROCESS_ALIASES: Record<string, string[]> = {
  "wt.exe": ["windowsterminal.exe", "wt.exe"],
  "terminal": ["windowsterminal.exe", "wt.exe"],
  "windows terminal": ["windowsterminal.exe", "wt.exe"],
  "explorer.exe": ["explorer.exe"],
  "file explorer": ["explorer.exe"],
  "notepad.exe": ["notepad.exe"],
  "code.exe": ["code.exe"],
  "visual studio code": ["code.exe"],
  "vs code": ["code.exe"],
  "antigravity": ["antigravity.exe"],
  "chrome.exe": ["chrome.exe"],
  "google chrome": ["chrome.exe"],
  "msedge.exe": ["msedge.exe"],
  "microsoft edge": ["msedge.exe"],
  "spotify": ["spotify.exe"],
  "discord": ["discord.exe"],
  "steam": ["steam.exe", "steamwebhelper.exe"],
  "obs studio": ["obs64.exe"],
  "claude": ["claude.exe"],
};

function matchesPinnedApp(app: PinnedApp, win: RunningWindow): boolean {
  const appPathLower = app.path.toLowerCase();
  const winPathLower = win.exePath.toLowerCase();
  if (appPathLower && winPathLower && appPathLower === winPathLower) return true;

  const appExe = appPathLower.split("\\").pop() ?? "";
  const winProc = win.processName.toLowerCase();
  if (appExe && winProc === appExe) return true;

  const appNameLower = app.name.toLowerCase().trim();
  const aliases = PROCESS_ALIASES[appExe] || PROCESS_ALIASES[appNameLower];
  if (aliases && aliases.includes(winProc)) return true;

  const appStem = appExe.replace(/\.(exe|lnk|url)$/i, "");
  const winStem = winProc.replace(/\.exe$/i, "");
  if (appStem.length >= 3 && (appStem === winStem || appStem.includes(winStem) || winStem.includes(appStem))) {
    return true;
  }
  if (appNameLower.length >= 3 && (appNameLower === winStem || appNameLower.includes(winStem))) {
    return true;
  }

  return false;
}

type DockContextMenu =
  | {
      kind: "app";
      x: number;
      y: number;
      title: string;
      pinnedApp?: PinnedApp;
      windows: RunningWindow[];
      launchPath: string;
    }
  | {
      kind: "folder";
      x: number;
      y: number;
      folder: PinnedFolder;
    }
  | {
      kind: "dock";
      x: number;
      y: number;
    };

/** Which screen edge the Dock sits on. */
type DockEdge = "bottom" | "top" | "left" | "right";

/** Dock settings added for edge placement, locking, separators and live previews. They are
 *  optional so older config files keep working (missing = bottom, unlocked, none, off). */
interface DockExtras {
  position?: string;
  locked?: boolean;
  separatorsAfter?: string[];
  livePreviews?: boolean;
  style?: string;
  alignment?: string;
  systemArea?: string;
  magnification?: string;
  magnificationRange?: number;
  launchAnimation?: string;
  minimizeFeedback?: boolean;
  iconSizes?: Record<string, number>;
  showLabels?: boolean;
  fileDropOpen?: boolean;
  scrollCyclesWindows?: boolean;
}

/** Shape of Tauri's window drag-and-drop events (physical pixels). */
interface DragDropPayload {
  paths?: string[];
  position?: { x: number; y: number };
}

const prefersReducedMotion = () =>
  typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

const normalizeEdge = (raw?: string): DockEdge =>
  raw === "top" || raw === "left" || raw === "right" ? raw : "bottom";

/** Lower-case letters and digits only, without ".exe" — for matching app names loosely. */
const normName = (s: string) =>
  s.toLowerCase().replace(/\.exe$/, "").replace(/[^a-z0-9]/g, "");

interface NotificationLite {
  id?: string;
  appName?: string;
}

/** Spoken form of the Dock badge (the badge itself is aria-hidden): the same number it shows. */
function dockBadgeLabel(unread: number, windows: number): string {
  if (unread > 0) return `, ${unread > 99 ? "99+" : unread} notifications`;
  if (windows > 1) return `, ${windows} windows`;
  return "";
}

/** Resolves when an animation finishes, or after `ms` if it never does (a window hidden mid-glide
 *  stops its animations): a failsafe, not the animation's clock. */
function finishedOrGiveUp(finished: Promise<unknown>, ms: number): Promise<unknown> {
  return Promise.race([finished, new Promise((resolve) => window.setTimeout(resolve, ms))]);
}

export const DockSurface: React.FC = () => {
  const { config, updateConfig } = useLensState();
  // Lens Intelligence in the Dock (all off until AI is turned on; docs/AI_SURFACES.md §3).
  const aiOn = !!config?.ai?.enabled;
  const askMode = useAskMode(aiOn);
  const [askPrompt, setAskPrompt] = useState<string | null>(null);
  const [askCtx, setAskCtx] = useState<AiContext | undefined>(undefined);
  const [aiDropPaths, setAiDropPaths] = useState<string[] | null>(null);
  // Day/night theme schedule runs from the Dock only, so exactly one window applies it.
  useThemeSchedule(config, updateConfig, true);
  const runningWindows = useRunningWindows(900);
  // Apps asking for attention (taskbar flash): urgent colour, one bounce, highlight until activated.
  const attention = useAttention(runningWindows);
  const [pinnedIcons, setPinnedIcons] = useState<Record<string, string | null>>({});
  const [dockVisible, setDockVisible] = useState(true);
  // Voice: the Dock becomes the voice module while you talk (docs/VOICE.md).
  const voiceDock = useVoiceDock(dockVisible);
  const musicMini = useMiniPlacement();
  const [dockSearchOpen, setDockSearchOpen] = useState(false);
  const [dockSearchClosing, setDockSearchClosing] = useState(false);
  const [dockSearchQuery, setDockSearchQuery] = useState("");
  const [dockFilterTab, setDockFilterTab] = useState<DockFilterTab>("all");
  const [dockSelectedIdx, setDockSelectedIdx] = useState(0);
  const [installedApps, setInstalledApps] = useState<InstalledApp[]>([]);
  const [homeData, setHomeData] = useState<LauncherHomeData>({ recentFiles: [], folders: [] });
  const [lockedDockWidth, setLockedDockWidth] = useState<number | null>(null);
  // Icon size while search is open: icons slide right and shrink only as much as needed to leave room for the text box.
  const [searchIconSize, setSearchIconSize] = useState<number | null>(null);
  /** Full-width bar styles: the icon row's left offset while searching, so icons only slide right. */
  const [lockedRowOffset, setLockedRowOffset] = useState<number | null>(null);
  const splitPillRef = useRef<HTMLDivElement>(null);
  /** How long the current launch animation runs (ms), so the class is not removed mid-animation. */
  const launchMsRef = useRef<number>(190);
  /** Windows that were just minimised or restored (pulse feedback), by hwnd. */
  const [pulseHwnds, setPulseHwnds] = useState<Set<number>>(() => new Set());
  const minimizedRef = useRef<Map<number, boolean>>(new Map());
  /** Per-app index for wheel window cycling. */
  const wheelIdxRef = useRef<Record<string, number>>({});
  const wheelAtRef = useRef<number>(0);
  /** Dock app currently under a file drag (key = data-dock-drag-key). */
  const [dropKey, setDropKey] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Settings can be dragged off the Dock: the fused top edge follows where it actually is.
  const [settingsDocked, setSettingsDocked] = useState(true);
  const [activeSettingsTab, setActiveSettingsTab] = useState<string>("system");
  const settingsOpenRef = useRef(false);
  settingsOpenRef.current = settingsOpen;
  const [launchingId, setLaunchingId] = useState<string | null>(null);
  const [ctxMenu, setCtxMenu] = useState<DockContextMenu | null>(null);
  const [hoverCard, setHoverCard] = useState<{
    key: string;
    x: number;
    y: number;
    title: string;
    isSpotify: boolean;
    windows: RunningWindow[];
    iconUrl?: string | null;
  } | null>(null);
  const [mediaInfo, setMediaInfo] = useState<MediaNowPlaying | null>(null);
  // Unread notification counts per app (normalised name -> count), shown as dock badges.
  const [notifCounts, setNotifCounts] = useState<Record<string, number>>({});
  // Text badges for pinned Lens core apps ("12:04" on Lens Timer), keyed by pin path.
  const [coreBadges, setCoreBadges] = useState<Record<string, string>>({});
  useEffect(() => {
    const un = listen<{ path: string; text: string | null }>("lens://coreapp-badge", (e) =>
      setCoreBadges((b) => {
        const next = { ...b };
        if (e.payload.text) next[e.payload.path] = e.payload.text;
        else delete next[e.payload.path];
        return next;
      })
    );
    return () => {
      un.then((f) => f()).catch(() => {});
    };
  }, []);
  // Alt+1..9 activation (the backend emits the index; the latest render's rows handle it).
  const activateRef = useRef<(n: number) => void>(() => {});
  const hoverTimerRef = useRef<number | null>(null);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const [unpinnedOrder, setUnpinnedOrder] = useState<string[]>([]);
  /** Pinned order while a drag is in progress: shown at once, saved to the config once on release. */
  const [dragPinOrder, setDragPinOrder] = useState<string[] | null>(null);
  const dragPinOrderRef = useRef<string[] | null>(null);
  /** Icons that moved during a reorder glide from where they were (FLIP). */
  const reorderFlip = useRef<FlipCapture | null>(null);
  /** Magnification state (see applyMagnification): one rAF per frame, cached icon centres. */
  const magRef = useRef<{
    raf: number;
    pos: number | null;
    kids: HTMLElement[];
    centres: number[];
    eligible: boolean[];
    written: string[];
  }>({ raf: 0, pos: null, kids: [], centres: [], eligible: [], written: [] });
  useEffect(() => () => { if (magRef.current.raf) cancelAnimationFrame(magRef.current.raf); }, []);
  const isVerticalRef = useRef(false);
  /** Latest config for handlers created earlier (pointer drags). */
  const configRef = useRef(config as NonNullable<typeof config>);
  if (config) configRef.current = config;
  // The saved order came back from the backend: drop the in-drag order (it now matches).
  const pinnedSig = config?.dock.pinnedApps.map((a) => a.id).join("|");
  useEffect(() => {
    if (!dragPinOrderRef.current) setDragPinOrder(null);
  }, [pinnedSig]);
  useLayoutEffect(() => {
    reorderFlip.current?.play({ duration: "base", ease: "spring", mode: "move" });
    reorderFlip.current = null;
  }, [dragPinOrder, unpinnedOrder]);
  const dragStartRef = useRef<{
    key: string;
    isPinned: boolean;
    pinnedId?: string;
    startX: number;
    moved: boolean;
  } | null>(null);
  const suppressClickRef = useRef<boolean>(false);
  const pillRef = useRef<HTMLElement>(null);
  // Search opens and closes by FLIP (docs/SMOOTHNESS.md, G-04): layout changes in one frame and the
  // icons glide from where they were, instead of animating width/height on every icon.
  const searchFlip = useRef<FlipCapture | null>(null);
  const captureSearchFlip = () => {
    searchFlip.current = captureFlip(pillRef.current?.querySelectorAll(".dock-icons-row > *"));
  };
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchOpenedAtRef = useRef<number>(0);
  const dockSearchOpenRef = useRef<boolean>(false);
  // The ref is the one owner of "search is open" (set by open/close themselves), so a press in the
  // same frame as a previous one sees the latest intent; React state follows it.

  /** Bumped by every open and close: a close whose glide finishes after a newer open does nothing
   *  (fast double-clicks, open during the hide glide). */
  const searchGenRef = useRef(0);
  const openInDockLauncher = () => {
    searchGenRef.current++;
    searchOpenedAtRef.current = performance.now();
    // One pop-out at a time: docked Settings goes when search opens.
    if (settingsOpenRef.current) {
      invoke("hide_surface", { label: "settings" }).catch(() => {});
      setSettingsOpen(false);
    }
    const searchEdge = normalizeEdge((config?.dock as DockExtras | undefined)?.position);
    const horizontalDock = searchEdge === "bottom" || searchEdge === "top";
    const searchStyle = normalizeDockStyle((config?.dock as DockExtras | undefined)?.style);
    const barDock = dockStyleInfo(searchStyle).fullWidth;
    if (pillRef.current && !dockSearchOpenRef.current && horizontalDock && barDock) {
      // Full-width bars already have room: pin the row's left edge so the field opens to the right.
      const row = pillRef.current.querySelector(".dock-icons-row");
      const pr = pillRef.current.getBoundingClientRect();
      const padL = parseFloat(getComputedStyle(pillRef.current).paddingLeft) || 0;
      if (row) setLockedRowOffset(Math.max(0, Math.round(row.getBoundingClientRect().left - pr.left - padL)));
    } else if (pillRef.current && !dockSearchOpenRef.current && horizontalDock) {
      const startW = Math.round(pillRef.current.getBoundingClientRect().width);
      // The text box spreads out of the search icon; every other icon moves right. Icons may shrink a
      // little to make room, never below ~80 % of their size (tiny icons and a cramped field made the
      // Settings gear and the search field hard to hit). When that isn't enough the Dock widens just
      // enough, up to the screen, instead of crushing the row. Width changes in one frame; the pill's
      // edge and the icons glide by FLIP (see searchFlip).
      const row = pillRef.current.querySelector(".dock-icons-row");
      const others = row
        ? Array.from(row.children).filter((el) => !el.classList.contains("dock-search-slot"))
        : [];
      const iconCount = others.filter((el) => !el.classList.contains("dock-divider")).length;
      const dividerCount = others.length - iconCount;
      const slim = searchStyle === "slim";
      // The whole search slot: glass + field + Ask toggle + ESC. 280 px leaves ~170 px to type in.
      const MIN_FIELD = slim ? 256 : 280;
      const chrome = slim ? 22 : 30; // pill padding + border while open
      const gap = slim ? 4 : 6;
      const dividerW = slim ? 5 : 9;
      const floorIcon = Math.max(slim ? 24 : 28, Math.round(effectiveIconSize * 0.8));
      const fixed = others.length * gap + dividerCount * dividerW;
      const fit = Math.floor((startW - chrome - MIN_FIELD - fixed) / Math.max(1, iconCount));
      const icon = Math.max(floorIcon, Math.min(effectiveIconSize, fit));
      const needW = chrome + MIN_FIELD + fixed + icon * iconCount;
      const maxW = Math.max(startW, window.innerWidth - 32);
      setLockedDockWidth(Math.min(maxW, Math.max(startW, needW)));
      setSearchIconSize(icon);
    }
    const wasOpen = dockSearchOpenRef.current;
    if (!wasOpen) captureSearchFlip();
    // Known open at once, not at the next render: a second press in the same frame closes.
    dockSearchOpenRef.current = true;
    setDockSearchQuery("");
    setDockFilterTab("all");
    setDockSelectedIdx(0);
    setDockSearchOpen(true);
    invoke("set_dock_search_expanded_cmd", { expanded: true }).catch(() => {});
    invoke<InstalledApp[]>("scan_installed_apps_cmd").then(setInstalledApps).catch(() => {});
    invoke<LauncherHomeData>("get_launcher_home_cmd").then(setHomeData).catch(() => {});
    window.setTimeout(() => searchInputRef.current?.focus(), 40);
    window.setTimeout(() => searchInputRef.current?.focus(), 120);
  };

  const closeInDockLauncher = () => {
    if (!dockSearchOpenRef.current) return;
    dockSearchOpenRef.current = false;
    const gen = ++searchGenRef.current;
    setDockSearchClosing(true);
    // The results panel glides out first; then the row collapses in one frame and the icons glide back.
    const drawer = pillRef.current?.querySelector(".dock-launcher-drawer");
    // A glide that never finishes (window hidden mid-animation) must not leave search half-open.
    finishedOrGiveUp(glideOut(drawer, { y: 14, opacity: 0 }, { duration: "base" }).finished, 400).then(() => {
      if (gen !== searchGenRef.current) return; // reopened meanwhile
      captureSearchFlip();
      setDockSearchOpen(false);
      setDockSearchClosing(false);
      setDockSearchQuery("");
      setLockedDockWidth(null);
      setSearchIconSize(null);
      setLockedRowOffset(null);
      invoke("set_dock_search_expanded_cmd", { expanded: false }).catch(() => {});
    });
  };

  // Focus can leave without a blur event reaching the page (Win32 focus handoffs, another app
  // stealing the foreground): while search is open, check focus twice a second as well, and close
  // after two misses in a row unless the pointer is still on the Dock.
  useEffect(() => {
    if (!dockSearchOpen) return;
    let misses = 0;
    const id = window.setInterval(() => {
      if (performance.now() - searchOpenedAtRef.current < 600) return;
      const pointerOnDock = !!pillRef.current?.matches(":hover");
      misses = !document.hasFocus() && !pointerOnDock ? misses + 1 : 0;
      if (misses >= 2) closeInDockLauncher();
    }, 400);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dockSearchOpen]);

  // Which shape is wider along the panel/Dock joint (see DockSurface.css › One shape while
  // searching): the narrower one squares its joined corners so the two read as one outline.
  useLayoutEffect(() => {
    const pill = pillRef.current;
    if (!pill) return;
    if (!dockSearchOpen) {
      delete pill.dataset.join;
      pill.style.removeProperty("min-width");
      pill.style.removeProperty("min-height");
      return;
    }
    const drawer = pill.querySelector(".dock-launcher-drawer");
    if (!drawer) return;
    // The joint must land on a whole pixel: a fractional edge is anti-aliased in both shapes and a
    // faint light line shows through between them. Round the Dock's depth up while joined.
    const r0 = pill.getBoundingClientRect();
    if (isVerticalRef.current && r0.width % 1) pill.style.minWidth = `${Math.ceil(r0.width)}px`;
    if (!isVerticalRef.current && r0.height % 1) pill.style.minHeight = `${Math.ceil(r0.height)}px`;
    const p = pill.getBoundingClientRect();
    const d = drawer.getBoundingClientRect();
    const vertical = isVerticalRef.current;
    const diff = vertical ? d.height - p.height : d.width - p.width;
    pill.dataset.join = Math.abs(diff) <= 3 ? "flush" : diff > 0 ? "drawer-wider" : "pill-wider";
  });

  useLayoutEffect(() => {
    searchFlip.current?.play({
      duration: "slow",
      // The search field is revealed by clipping (no stretched text); icons move and scale.
      mode: (el) => (el.classList.contains("dock-search-slot") ? "clip" : "scale"),
    });
    searchFlip.current = null;
  }, [dockSearchOpen]);

  // The hover card and the right-click menu keep their CSS entry and gain an exit: they glide out
  // before they are removed (docs/SMOOTHNESS.md, G-06).
  const hoverLinger = useLingering(hoverCard && !ctxMenu && !settingsOpen && !dockSearchOpen ? hoverCard : null, { animateEnter: false, exit: { scale: 0.98, opacity: 0 }, exitOptions: { additive: true }, enterOptions: { additive: true }, enter: { scale: 0.98, opacity: 0 } });
  const shownCard = hoverLinger.value;
  const menuLinger = useLingering(ctxMenu, { animateEnter: false, exit: { scale: 0.98, opacity: 0 }, exitOptions: { additive: true }, enterOptions: { additive: true }, enter: { scale: 0.98, opacity: 0 } });
  const shownMenu = menuLinger.value;

  // Keyboard: the element that opened the menu gets focus back when it closes.
  const menuOpenerRef = useRef<HTMLElement | null>(null);
  const closeMenu = () => {
    setCtxMenu(null);
    invoke("set_dock_menu_open", { open: false }).catch(() => {});
    const opener = menuOpenerRef.current;
    menuOpenerRef.current = null;
    if (opener && opener.isConnected && document.activeElement && opener.ownerDocument.activeElement?.closest(".dock-ctx-menu")) opener.focus({ preventScroll: true });
  };

  const openMenu = (menu: DockContextMenu) => {
    setHoverCard(null);
    menuOpenerRef.current = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    setCtxMenu(menu);
    invoke("set_dock_menu_open", { open: true }).catch(() => {});
  };

  // Opened from the keyboard (context-menu key or Shift+F10 on a focused icon): focus goes into the
  // menu so arrows and Enter work at once. With the mouse nothing visible changes (:focus-visible).
  useEffect(() => {
    if (!ctxMenu || !menuOpenerRef.current) return;
    const id = requestAnimationFrame(() => {
      menuLinger.ref.current?.querySelector<HTMLButtonElement>(".dock-ctx-item:not(:disabled)")?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(id);
  }, [ctxMenu]);

  /** Up/Down/Home/End move between menu rows, like a native context menu. */
  const onMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>(".dock-ctx-item:not(:disabled)"));
    if (!items.length) return;
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    let next = -1;
    if (e.key === "ArrowDown") next = i < 0 ? 0 : (i + 1) % items.length;
    else if (e.key === "ArrowUp") next = i < 0 ? items.length - 1 : (i - 1 + items.length) % items.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = items.length - 1;
    if (next >= 0) {
      e.preventDefault();
      items[next].focus({ preventScroll: true });
    }
  };

  const cancelHoverClose = () => {
    if (hoverTimerRef.current !== null) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  };

  // Hover intent (docs/DOCK_SMOOTHNESS.md › Frontend): a card opens when the pointer rests on an
  // icon for HOVER_INTENT_MS, not on every icon it crosses. Sweeping along the Dock used to open
  // and close a card, its native previews and the Dock's click region for each icon passed. Once a
  // card is showing (or closed moments ago) the next one opens at once, like macOS tooltips.
  const HOVER_INTENT_MS = 90;
  const HOVER_WARM_MS = 350;
  const hoverIntentRef = useRef<number | null>(null);
  const hoverShownRef = useRef<{ key: string | null; closedAt: number }>({ key: null, closedAt: 0 });
  hoverShownRef.current.key = hoverCard?.key ?? null;
  const cancelHoverIntent = () => {
    if (hoverIntentRef.current !== null) {
      window.clearTimeout(hoverIntentRef.current);
      hoverIntentRef.current = null;
    }
  };

  const scheduleHoverClose = () => {
    cancelHoverClose();
    cancelHoverIntent();
    hoverTimerRef.current = window.setTimeout(() => {
      if (hoverShownRef.current.key) hoverShownRef.current.closedAt = performance.now();
      setHoverCard(null);
      if (!ctxMenu && !dockSearchOpenRef.current) {
        invoke("set_dock_menu_open", { open: false }).catch(() => {});
      }
    }, 180);
  };

  const openHoverCardForItem = (
    el: HTMLElement,
    key: string,
    title: string,
    isSpotify: boolean,
    windows: RunningWindow[],
    iconUrl?: string | null,
    /** The hover-intent delay has already passed. */
    intended = false
  ) => {
    if (ctxMenu || settingsOpen || dockSearchOpenRef.current) return;
    if (!isSpotify && windows.length === 0) return;
    cancelHoverClose();
    cancelHoverIntent();
    // Already showing this icon's card: nothing to do (no state change, no IPC).
    if (hoverShownRef.current.key === key) return;
    const warm = intended || hoverShownRef.current.key !== null || performance.now() - hoverShownRef.current.closedAt < HOVER_WARM_MS;
    if (!warm) {
      hoverIntentRef.current = window.setTimeout(() => {
        hoverIntentRef.current = null;
        if (el.isConnected && el.matches(":hover")) openHoverCardForItem(el, key, title, isSpotify, windows, iconUrl, true);
      }, HOVER_INTENT_MS);
      return;
    }
    const r = el.getBoundingClientRect();
    const e = normalizeEdge((config?.dock as DockExtras | undefined)?.position);
    // With magnification the hovered icon grows past the Dock edge: keep the card clear of it.
    const magId = normalizeMagnification((config?.dock as DockExtras | undefined)?.magnification);
    const grow = magId === "off" ? 0 : ((DOCK_MAGNIFICATION.find((m) => m.id === magId)?.scale ?? 1) - 1) * r.width;
    const magHeadroom = e === "bottom" ? -grow : e === "top" ? grow : 0;
    setHoverCard({
      key,
      x: e === "left" ? r.right : e === "right" ? r.left : r.left + r.width / 2,
      y: (e === "top" ? r.bottom : e === "left" || e === "right" ? r.top + r.height / 2 : r.top) + magHeadroom,
      title,
      isSpotify,
      windows,
      iconUrl,
    });
    invoke("set_dock_menu_open", { open: true }).catch(() => {});
    if (isSpotify) {
      invoke<MediaNowPlaying>("get_media_now_playing_cmd")
        .then((m) => setMediaInfo(m.hasSession ? m : null))
        .catch(() => {});
    }
  };

  const triggerLaunchAnim = (id: string) => {
    setLaunchingId(null);
    requestAnimationFrame(() => {
      setLaunchingId(id);
      window.setTimeout(() => {
        setLaunchingId((curr) => (curr === id ? null : curr));
      }, launchMsRef.current);
    });
  };

  useEffect(() => {
    const syncSettingsVis = () => {
      invoke<boolean>("is_surface_visible_cmd", { label: "settings" })
        .then((vis) => setSettingsOpen(Boolean(vis)))
        .catch(() => {});
    };
    syncSettingsVis();
    const t1 = window.setTimeout(syncSettingsVis, 350);
    const t2 = window.setTimeout(syncSettingsVis, 1000);
    const unlisten = listen<boolean>("lens://dock-visible", (e) => {
      setDockVisible(e.payload);
      // Nothing stays open on a hidden Dock.
      if (!e.payload) {
        setHoverCard(null);
        closeMenu();
        closeInDockLauncher();
        if (settingsOpenRef.current) {
          invoke("hide_surface", { label: "settings" }).catch(() => {});
          setSettingsOpen(false);
        }
      }
    });
    const unlistenSearch = listen<boolean>("lens://dock-search-open", (e) => {
      if (!e.payload) {
        closeInDockLauncher();
      }
    });
    const unlistenSettings = listen<boolean>("lens://settings-open", (e) => {
      setSettingsOpen(e.payload);
      if (e.payload) {
        closeInDockLauncher();
      }
    });
    const unlistenSettingsDocked = listen<boolean>("lens://settings-docked", (e) => setSettingsDocked(e.payload));
    const unlistenSettingsTab = listen<string>("lens://settings-tab", (e) => {
      if (e.payload) setActiveSettingsTab(e.payload);
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeMenu();
        closeInDockLauncher();
      }
    };
    // The watcher clears a menu/hover/search flag that has gone stale (pointer away, Dock
    // unfocused) so auto-hide can resume; close the matching UI here so both sides agree.
    const unlistenDismiss = listen("lens://dock-dismiss-menus", () => {
      setHoverCard(null);
      closeMenu();
      closeInDockLauncher();
    });
    // Leaving the Dock window entirely (fast flicks out through click-through glass) closes a
    // hover card even when the card's own mouseleave never fired.
    const onDocLeave = (e: MouseEvent) => {
      if (e.relatedTarget === null) {
        setHoverCard(null);
        if (!dockSearchOpenRef.current) {
          invoke("set_dock_menu_open", { open: false }).catch(() => {});
        }
      }
    };
    document.addEventListener("mouseout", onDocLeave);
    const onBlur = () => {
      setHoverCard(null);
      closeMenu();
      // Ignore the transient Win32 focus handoff right after expanding the Dock window, but check
      // again once it is over: focus that really went to another app still closes search.
      const check = () => {
        const young = performance.now() - searchOpenedAtRef.current;
        if (young < 500) {
          window.setTimeout(check, 520 - young);
          return;
        }
        if (!document.hasFocus()) closeInDockLauncher();
      };
      window.setTimeout(check, 160);
    };
    // A click on the Dock window outside the Dock and its panel (the transparent area around it).
    const onOutside = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (!t || t.closest(".dock-pill, .dock-split-pill, .dock-ctx-menu, .dock-hover-card, .dock-launcher-drawer, [role=dialog]")) return;
      closeInDockLauncher();
    };
    document.addEventListener("pointerdown", onOutside, true);
    // Settings' real visibility wins over what the page last heard (a missed event, a crash).
    const reconcile = window.setInterval(() => {
      if (document.hidden) return;
      invoke<boolean>("is_surface_visible_cmd", { label: "settings" })
        .then((vis) => {
          if (typeof vis === "boolean" && vis !== settingsOpenRef.current) setSettingsOpen(vis);
        })
        .catch(() => {});
    }, 1500);
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", onBlur);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      unlisten.then((fn) => fn());
      unlistenSearch.then((fn) => fn());
      unlistenSettings.then((fn) => fn());
      unlistenSettingsTab.then((fn) => fn());
      unlistenSettingsDocked.then((fn) => fn());
      unlistenDismiss.then((fn) => fn());
      document.removeEventListener("mouseout", onDocLeave);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("pointerdown", onOutside, true);
      window.clearInterval(reconcile);
    };
  }, []);

  // Report the open flyout's rect so the watcher can tell a click or pointer outside the Dock
  // (and close everything / resume auto-hide) from one inside it.
  useEffect(() => {
    const report = () => {
      const els = document.querySelectorAll<HTMLElement>(
        ".dock-hover-card, .dock-ctx-menu, .dock-launcher-drawer"
      );
      let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
      els.forEach((el) => {
        const rc = el.getBoundingClientRect();
        if (rc.width === 0 || rc.height === 0) return;
        l = Math.min(l, rc.left); t = Math.min(t, rc.top);
        r = Math.max(r, rc.right); b = Math.max(b, rc.bottom);
      });
      const open = Number.isFinite(l);
      invoke("set_dock_flyout_rect_cmd", open ? { x: l, y: t, w: r - l, h: b - t } : { x: 0, y: 0, w: 0, h: 0 }).catch(() => {});
    };
    const raf = requestAnimationFrame(report);
    const t1 = window.setTimeout(report, 260); // after open/close transitions settle
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t1);
    };
  }, [hoverCard, ctxMenu, dockSearchOpen, dockSearchClosing]);

  // Unread notification badges: Windows toasts and Lens history, counted once per id.
  useEffect(() => {
    let alive = true;
    const load = () => {
      invoke<{ items?: NotificationLite[]; windows?: { items?: NotificationLite[] } } | null>(
        "get_notification_center_cmd"
      )
        .then((state) => {
          if (!alive || !state) return;
          const seen = new Set<string>();
          const counts: Record<string, number> = {};
          [...(state.windows?.items ?? []), ...(state.items ?? [])].forEach((n, i) => {
            const id = n.id ?? `idx-${i}`;
            if (seen.has(id)) return;
            seen.add(id);
            const k = normName(n.appName ?? "");
            if (!k || k === "lensui") return;
            counts[k] = (counts[k] ?? 0) + 1;
          });
          setNotifCounts(counts);
        })
        .catch(() => {});
    };
    load();
    const unlisten = listen("lens://notifications-changed", load);
    const timer = window.setInterval(load, 60000);
    return () => {
      alive = false;
      window.clearInterval(timer);
      unlisten.then((fn) => fn());
    };
  }, []);

  // Alt+1..9 (registered by the backend when enabled) activates the Nth dock app.
  useEffect(() => {
    const unlisten = listen<number>("lens://dock-activate-index", (e) =>
      activateRef.current(Number(e.payload))
    );
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Minimise/restore feedback: pulse an icon when one of its windows changes minimised state.
  const minimizeFeedbackOn = (config?.dock as DockExtras | undefined)?.minimizeFeedback === true;
  useEffect(() => {
    const prev = minimizedRef.current;
    const changed: number[] = [];
    const next = new Map<number, boolean>();
    for (const w of runningWindows) {
      next.set(w.hwnd, w.isMinimized);
      const before = prev.get(w.hwnd);
      if (before !== undefined && before !== w.isMinimized) changed.push(w.hwnd);
    }
    minimizedRef.current = next;
    if (!minimizeFeedbackOn || changed.length === 0 || prefersReducedMotion()) return;
    setPulseHwnds((cur) => new Set([...cur, ...changed]));
    const t = window.setTimeout(() => {
      setPulseHwnds((cur) => {
        const n = new Set(cur);
        changed.forEach((h) => n.delete(h));
        return n;
      });
    }, 460);
    return () => window.clearTimeout(t);
  }, [runningWindows, minimizeFeedbackOn]);

  // Drop files on a Dock app to open them with it. Tauri delivers OS file drags as window
  // events with physical-pixel positions; we hit-test the app under the pointer.
  const fileDropOn = (config?.dock as DockExtras | undefined)?.fileDropOpen === true;
  useEffect(() => {
    // Also active while AI is on, for dropping files on the sparkle (drop-to-AI).
    if (!fileDropOn && !aiOn) return;
    const target = (p?: { x: number; y: number }) => {
      if (!p) return null;
      const dpr = window.devicePixelRatio || 1;
      const el = document.elementFromPoint(p.x / dpr, p.y / dpr) as HTMLElement | null;
      return el?.closest<HTMLElement>(fileDropOn ? "[data-dock-launch-path],[data-dock-ai-drop]" : "[data-dock-ai-drop]") ?? null;
    };
    const offs = [
      listen<DragDropPayload>("tauri://drag-over", (e) => {
        setDropKey(target(e.payload?.position)?.dataset.dockDragKey ?? null);
      }),
      listen<DragDropPayload>("tauri://drag-leave", () => setDropKey(null)),
      listen<DragDropPayload>("tauri://drag-drop", (e) => {
        const t = target(e.payload?.position);
        setDropKey(null);
        const files = e.payload?.paths ?? [];
        if (t?.dataset.dockAiDrop && files.length) {
          setAiDropPaths(files.slice(0, 20));
          return;
        }
        const appPath = t?.dataset.dockLaunchPath;
        if (!appPath || files.length === 0) return;
        invoke("open_files_with_app_cmd", { appPath, files }).catch(() => {});
      }),
    ];
    return () => offs.forEach((u) => u.then((fn) => fn()));
  }, [fileDropOn, aiOn]);

  useEffect(() => {
    const el = pillRef.current;
    if (!el) return;
    const report = () => {
      if (dockSearchOpenRef.current) return;
      // A hidden Dock is slid off its edge: keep the last resting rect. The backend hit-tests
      // every style against this rect, so it must never be the off-screen one.
      if (el.classList.contains("is-hidden")) return;
      const rect = el.getBoundingClientRect();
      if (rect.width > 0) {
        // Split: the backend hit-tests one rect, so report the union of both pills. On the bottom
        // edge it uses a width centred on the screen, so report a width symmetric about the centre.
        const extra = splitPillRef.current?.getBoundingClientRect();
        let left = rect.left;
        let top = rect.top;
        let right = rect.right;
        let bottom = rect.bottom;
        if (extra && extra.width > 0) {
          left = Math.min(left, extra.left);
          top = Math.min(top, extra.top);
          right = Math.max(right, extra.right);
          bottom = Math.max(bottom, extra.bottom);
        }
        // Magnified icons grow past the Dock's edge: include that headroom in the hit-test rect.
        const dockCfg = config?.dock as DockExtras | undefined;
        const magId = normalizeMagnification(dockCfg?.magnification);
        if (magId !== "off") {
          const scale = DOCK_MAGNIFICATION.find((m) => m.id === magId)?.scale ?? 1;
          const iconPx = el.querySelector(".dock-item")?.getBoundingClientRect().width ?? 40;
          const head = Math.ceil((scale - 1) * iconPx);
          const e = normalizeEdge(dockCfg?.position);
          if (e === "bottom") top -= head;
          else if (e === "top") bottom += head;
          else if (e === "left") right += head;
          else left -= head;
        }
        const mid = window.innerWidth / 2;
        const symmetricW = 2 * Math.max(mid - left, right - mid);
        invoke("set_dock_pill_width", { width: extra ? symmetricW : rect.width }).catch(() => {});
        // Full rect (CSS px within this window) lets the backend hit-test Docks on any edge.
        invoke("set_dock_pill_rect_cmd", {
          x: left,
          y: top,
          w: right - left,
          h: bottom - top,
        }).catch(() => {});
      }
    };
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    if (splitPillRef.current) ro.observe(splitPillRef.current);
    // The backend sizes this window from the reported pill (plus flyout room) once the Dock is
    // idle. The pill keeps its place on screen but moves inside the window, so report again.
    window.addEventListener("resize", report);
    // After the Dock has slid back in, report where it came to rest.
    const onSettled = (e: TransitionEvent) => {
      if (e.target === el) report();
    };
    el.addEventListener("transitionend", onSettled);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", report);
      el.removeEventListener("transitionend", onSettled);
    };
  }, [
    dockVisible,
    config?.dock.pinnedApps.length,
    config?.dock.iconSize,
    runningWindows.length,
    (config?.dock as DockExtras | undefined)?.style,
    (config?.dock as DockExtras | undefined)?.systemArea,
    (config?.dock as DockExtras | undefined)?.position,
    (config?.dock as DockExtras | undefined)?.magnification,
    (config?.dock as DockExtras | undefined)?.showLabels,
  ]);

  useEffect(() => {
    if (!config) return;
    config.dock.pinnedApps.forEach((app) => {
      if (pinnedIcons[app.path] !== undefined) return;
      invoke<string | null>("get_icon_for_path", { path: app.path })
        .then((url) => {
          setPinnedIcons((prev) => ({ ...prev, [app.path]: url }));
        })
        .catch(() => {
          setPinnedIcons((prev) => ({ ...prev, [app.path]: null }));
        });
    });
  }, [config?.dock.pinnedApps]);

  // Same ranking as the Launcher and Command Palette (src/search). Must run before the early return.
  const dockSearch = useUnifiedSearch(dockSearchOpen ? dockSearchQuery : "", {
    surface: "dock",
    onDone: () => closeInDockLauncher(),
    windows: runningWindows,
    config,
    updateConfig,
    limit: 40,
  });

  if (!config) return null;

  const pinnedApps = dragPinOrder
    ? [...config.dock.pinnedApps].sort((x, y) => {
        const ix = dragPinOrder.indexOf(x.id);
        const iy = dragPinOrder.indexOf(y.id);
        return (ix === -1 ? 1e9 : ix) - (iy === -1 ? 1e9 : iy);
      })
    : config.dock.pinnedApps;
  const pinnedFolders = config.dock.pinnedFolders;
  const dockExtras = config.dock as typeof config.dock & DockExtras;
  const edge = normalizeEdge(dockExtras.position);
  const isVertical = edge === "left" || edge === "right";
  isVerticalRef.current = isVertical;
  const locked = dockExtras.locked === true;
  const separatorsAfter = dockExtras.separatorsAfter ?? [];
  const livePreviews = dockExtras.livePreviews === true;
  const dockStyle = normalizeDockStyle(dockExtras.style);
  const isBar = dockStyleInfo(dockStyle).fullWidth;
  const alignment = resolveDockAlignment(dockStyle, dockExtras.alignment);
  const systemInDock = resolveSystemArea(config.dock) === "dock";
  const showLauncherButton = dockStyle === "taskbar" || dockStyle === "studio" || dockStyle === "islands";
  const unreadTotal = Object.values(notifCounts).reduce((a, b) => a + b, 0);
  const magnification = normalizeMagnification(dockExtras.magnification);
  const magScale = DOCK_MAGNIFICATION.find((m) => m.id === magnification)?.scale ?? 1;
  const magRange = clampMagnificationRange(dockExtras.magnificationRange);
  const launchAnimation = normalizeLaunchAnimation(dockExtras.launchAnimation);
  launchMsRef.current = DOCK_LAUNCH_ANIMATIONS.find((a) => a.id === launchAnimation)?.durationMs || 190;
  const showLabels = dockExtras.showLabels === true;
  const scrollCycles = dockExtras.scrollCyclesWindows === true;

  /** Magnification: icons near the pointer grow (transform only, so the Dock's size and the
   *  native click region never change); neighbours are pushed apart so nothing overlaps.
   *  Low latency by construction (docs/DOCK_SMOOTHNESS.md › Frontend):
   *   - pointer moves are coalesced to one update per frame (rAF), however fast the mouse reports;
   *   - icon centres are measured once when the pointer enters (transforms don't move layout),
   *     so a move is pure arithmetic with no layout reads;
   *   - a value is written only when it changed, so icons far from the pointer aren't restyled. */
  const measureMagnification = () => {
    const m = magRef.current;
    const row = pillRef.current?.querySelector(".dock-icons-row");
    m.kids = row ? (Array.from(row.children) as HTMLElement[]) : [];
    m.eligible = m.kids.map((el) => el.classList.contains("dock-item-wrap") && !el.classList.contains("dock-search-slot"));
    m.centres = m.kids.map((el) => (isVertical ? el.offsetTop + el.offsetHeight / 2 : el.offsetLeft + el.offsetWidth / 2));
    m.written = m.kids.map(() => "");
  };
  const clearMagnification = () => {
    const m = magRef.current;
    if (m.raf) cancelAnimationFrame(m.raf);
    m.raf = 0;
    m.pos = null;
    const row = pillRef.current?.querySelector(".dock-icons-row");
    if (row) {
      for (const el of Array.from(row.children) as HTMLElement[]) {
        el.style.removeProperty("--mag-s");
        el.style.removeProperty("--mag-x");
      }
    }
    m.kids = [];
  };
  const paintMagnification = () => {
    const m = magRef.current;
    m.raf = 0;
    if (m.pos === null) return;
    // The row changed under the pointer (an app opened or closed): measure again.
    const row = pillRef.current?.querySelector(".dock-icons-row");
    if (!row || row.children.length !== m.kids.length || !m.kids[0]?.isConnected) measureMagnification();
    const unit = effectiveIconSize + 6;
    const reach = (magRange + 0.5) * unit;
    const scales = m.centres.map((c, i) => {
      if (!m.eligible[i]) return 1;
      const d = Math.abs((m.pos as number) - c);
      if (d >= reach) return 1;
      const t = Math.cos((d / reach) * (Math.PI / 2));
      return 1 + (magScale - 1) * t * t;
    });
    const extras = scales.map((sc) => (sc - 1) * effectiveIconSize);
    const total = extras.reduce((a, b) => a + b, 0);
    let before = 0;
    m.kids.forEach((el, i) => {
      const shift = before + extras[i] / 2 - total / 2;
      before += extras[i];
      const sv = scales[i].toFixed(3);
      const xv = `${shift.toFixed(1)}px`;
      const key = `${sv}|${xv}`;
      if (m.written[i] === key) return;
      m.written[i] = key;
      el.style.setProperty("--mag-s", sv);
      el.style.setProperty("--mag-x", xv);
    });
  };
  const applyMagnification = (clientX: number, clientY: number) => {
    const pill = pillRef.current;
    if (!pill || magnification === "off" || dockSearchOpen || ctxMenu) return;
    const m = magRef.current;
    if (!m.kids.length) measureMagnification();
    const pr = pill.getBoundingClientRect();
    // Centres are relative to the row's offset parent; the pill is that parent for every style.
    m.pos = isVertical ? clientY - pr.top : clientX - pr.left;
    if (!m.raf) m.raf = requestAnimationFrame(paintMagnification);
  };

  /** Mouse wheel over an app: cycle through its windows (newest focus last). */
  const cycleWindows = (key: string, wins: RunningWindow[], deltaY: number) => {
    if (!scrollCycles || wins.length === 0) return;
    const now = performance.now();
    if (now - wheelAtRef.current < 140) return;
    wheelAtRef.current = now;
    const cur = wheelIdxRef.current[key] ?? Math.max(0, wins.findIndex((w) => w.isFocused));
    const next = (cur + (deltaY > 0 ? 1 : -1) + wins.length) % wins.length;
    wheelIdxRef.current[key] = next;
    invoke("focus_window_cmd", { hwnd: wins[next].hwnd }).catch(() => {});
  };
  const updateDockExtras = (patch: DockExtras) =>
    updateConfig({ ...config, dock: { ...config.dock, ...patch } as typeof config.dock });

  // Match ALL running windows belonging to each pinned app so apps appear open ON their pinned area (zero duplicates!)
  const matchedHwnds = new Set<number>();
  const pinnedRows = pinnedApps.map((app) => {
    const wins = runningWindows.filter((w) => matchesPinnedApp(app, w));
    wins.forEach((w) => matchedHwnds.add(w.hwnd));
    const focusedWin = wins.find((w) => w.isFocused) ?? wins[0];
    return { app, wins, primaryWin: focusedWin };
  });

  // Group remaining unpinned running windows by processName
  const extraGroupsRaw: { key: string; primaryWin: RunningWindow; wins: RunningWindow[] }[] = [];
  const groupMap = new Map<string, { key: string; primaryWin: RunningWindow; wins: RunningWindow[] }>();
  for (const w of runningWindows) {
    if (matchedHwnds.has(w.hwnd)) continue;
    const key = w.processName.toLowerCase();
    const existing = groupMap.get(key);
    if (existing) {
      existing.wins.push(w);
      if (w.isFocused) existing.primaryWin = w;
    } else {
      const entry = { key, primaryWin: w, wins: [w] };
      groupMap.set(key, entry);
      extraGroupsRaw.push(entry);
    }
  }

  // Respect user drag-to-reorder order for unpinned running window groups
  const extraGroups = [...extraGroupsRaw].sort((a, b) => {
    const ia = unpinnedOrder.indexOf(a.key);
    const ib = unpinnedOrder.indexOf(b.key);
    if (ia === -1 && ib === -1) return 0;
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });

  const captureReorderFlip = () => {
    reorderFlip.current = captureFlip(pillRef.current?.querySelectorAll(".dock-icons-row > [data-dock-drag-key]"));
  };
  /** Moves a pinned app in the in-drag order (no config write until the drag ends). Reads the
   *  latest order from a ref: the pointer handlers were created at pointer-down, and the config
   *  they closed over is stale after the first swap (that made the order jump back and forth). */
  const reorderPinnedIds = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    const list = dragPinOrderRef.current ?? configRef.current.dock.pinnedApps.map((a) => a.id);
    const fromIdx = list.indexOf(fromId);
    const toIdx = list.indexOf(toId);
    if (fromIdx === -1 || toIdx === -1) return;
    const next = [...list];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    captureReorderFlip();
    dragPinOrderRef.current = next;
    setDragPinOrder(next);
  };
  const commitPinnedOrder = () => {
    const order = dragPinOrderRef.current;
    dragPinOrderRef.current = null;
    if (!order) return;
    const cur = configRef.current;
    const list = [...cur.dock.pinnedApps].sort((x, y) => order.indexOf(x.id) - order.indexOf(y.id));
    const changed = list.some((a, i) => a.id !== cur.dock.pinnedApps[i]?.id);
    if (changed) updateConfig({ ...cur, dock: { ...cur.dock, pinnedApps: list } });
    // Keep showing the dragged order until the saved config comes back (no flash of the old order).
    if (!changed) setDragPinOrder(null);
  };

  const reorderUnpinnedKeys = (fromKey: string, toKey: string) => {
    if (fromKey === toKey) return;
    const base = extraGroups.map((g) => g.key);
    const fromIdx = base.indexOf(fromKey);
    const toIdx = base.indexOf(toKey);
    if (fromIdx === -1 || toIdx === -1) return;
    const [moved] = base.splice(fromIdx, 1);
    base.splice(toIdx, 0, moved);
    captureReorderFlip();
    setUnpinnedOrder(base);
  };

  const beginItemDrag = (
    e: React.PointerEvent,
    key: string,
    isPinned: boolean,
    pinnedId?: string
  ) => {
    if (e.button !== 0 || locked) return;
    const target = e.currentTarget as HTMLElement;
    const pointerId = e.pointerId;
    dragStartRef.current = {
      key,
      isPinned,
      pinnedId,
      startX: e.clientX,
      moved: false,
    };
    const startY = e.clientY;
    let lastOver: string | null = null;

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      const st = dragStartRef.current;
      if (!st) return;
      // Either axis: on the left/right edges the Dock is vertical and drags go up and down.
      if (!st.moved && Math.hypot(ev.clientX - st.startX, ev.clientY - startY) > 6) {
        st.moved = true;
        suppressClickRef.current = true;
        // Keep every move and the release coming to us even when the pointer leaves the icon or the
        // Dock window, so a fast drag can't strand the Dock in its dragging state.
        try { target.setPointerCapture(pointerId); } catch { /* element gone */ }
        setDragKey(st.key);
      }
      if (!st.moved) return;

      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const wrap = el?.closest("[data-dock-drag-key]") as HTMLElement | null;
      if (!wrap) return;
      const targetKey = wrap.dataset.dockDragKey;
      const targetPinned = wrap.dataset.dockPinned === "true";
      const targetPinnedId = wrap.dataset.dockPinnedId;
      if (!targetKey || targetKey === st.key || targetKey === lastOver) return;
      lastOver = targetKey;

      setDragOverKey(targetKey);
      if (st.isPinned && targetPinned && st.pinnedId && targetPinnedId) {
        reorderPinnedIds(st.pinnedId, targetPinnedId);
      } else if (!st.isPinned && !targetPinned) {
        reorderUnpinnedKeys(st.key, targetKey);
      }
    };

    const finish = (ev?: PointerEvent) => {
      if (ev && ev.pointerId !== pointerId) return;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      target.removeEventListener("lostpointercapture", onLost);
      try { if (target.hasPointerCapture?.(pointerId)) target.releasePointerCapture(pointerId); } catch { /* gone */ }
      const st = dragStartRef.current;
      dragStartRef.current = null;
      if (st?.moved && st.isPinned) commitPinnedOrder();
      setDragKey(null);
      setDragOverKey(null);
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 60);
    };
    const onLost = () => finish();

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    target.addEventListener("lostpointercapture", onLost);
  };

  // Infinitely adjust icon size smoothly if total icons (plus expanded search bar) exceed screen width
  const totalItems = 2 + pinnedRows.length + extraGroups.length + (showLauncherButton ? 1 : 0);
  const searchBudget = 0; // the Dock keeps its width while searching
  const dockAxisLength = isVertical ? window.innerHeight : window.innerWidth;
  // Bars keep both sides of the row free for the system area so icons stay centred on the screen.
  const systemBudget = systemInDock && dockStyle !== "split" ? (isBar ? (isVertical ? 400 : 560) : 200) : 0;
  const maxAvailable = Math.max(isVertical ? 320 : 480, dockAxisLength - 28 - searchBudget - systemBudget);
  const gapBudget = totalItems * 6 + 34;
  const rawFit = Math.floor((maxAvailable - gapBudget) / Math.max(1, totalItems));
  const effectiveIconSize = Math.max(22, Math.min(resolveDockIconSize(config.dock, dockStyle), rawFit));

  /** Unread notifications for an app, matched loosely by any of its names. */
  const notifBadgeFor = (...names: (string | undefined)[]) => {
    const keys = names.map((n) => normName(n ?? "")).filter((k) => k.length >= 3);
    if (keys.length === 0) return 0;
    let total = 0;
    for (const [k, n] of Object.entries(notifCounts)) {
      if (keys.some((x) => x === k || (k.length >= 4 && x.length >= 4 && (x.includes(k) || k.includes(x))))) {
        total += n;
      }
    }
    return total;
  };

  activateRef.current = (n: number) => {
    const items = [
      ...pinnedRows.map((r) => ({ id: r.app.id, wins: r.wins, primary: r.primaryWin, path: r.app.path })),
      ...extraGroups.map((g) => ({
        id: `win-${g.primaryWin.hwnd}`,
        wins: g.wins,
        primary: g.primaryWin as RunningWindow | undefined,
        path: g.primaryWin.exePath,
      })),
    ];
    const it = items[n - 1];
    if (!it) return;
    triggerLaunchAnim(it.id);
    if (!it.primary) {
      invoke("launch_app_cmd", { path: it.path });
      return;
    }
    const focusedIdx = it.wins.findIndex((w) => w.isFocused);
    if (focusedIdx >= 0 && it.wins.length > 1) {
      // Pressing again cycles through that app's windows.
      invoke("focus_window_cmd", { hwnd: it.wins[(focusedIdx + 1) % it.wins.length].hwnd });
    } else {
      // Same as clicking: focuses, or minimizes when already in front.
      invoke("focus_window_cmd", { hwnd: it.primary.hwnd });
    }
  };

  const pinWindow = (win: RunningWindow) => {
    if (!win.exePath) return;
    if (config.dock.pinnedApps.some((a) => matchesPinnedApp(a, win))) return;
    const cleanName = win.processName.replace(/\.exe$/i, "");
    updateConfig({
      ...config,
      dock: {
        ...config.dock,
        pinnedApps: [
          ...config.dock.pinnedApps,
          {
            id: `pin-${Date.now()}`,
            name: cleanName,
            path: win.exePath,
            iconHint: null,
          },
        ],
      },
    });
  };

  const unpinApp = (id: string) => {
    updateConfig({
      ...config,
      dock: {
        ...config.dock,
        pinnedApps: config.dock.pinnedApps.filter((a) => a.id !== id),
      },
    });
  };

  const removeFolder = (id: string) => {
    updateConfig({
      ...config,
      dock: {
        ...config.dock,
        pinnedFolders: config.dock.pinnedFolders.filter((f) => f.id !== id),
      },
    });
  };

  const iconTheme = config.iconStyle?.theme ?? "obsidian-squircle";
  const iconShape = config.iconStyle?.shape ?? "squircle";

  // In-Dock Launcher items & filtering
  const recentAndRunning = [
    ...runningWindows.slice(0, 3).map((w) => ({
      id: `rr-w-${w.hwnd}`,
      title: w.title || w.processName.replace(/\.exe$/i, ""),
      sub: `${w.processName.replace(/\.exe$/i, "")} · Running Window`,
      badge: w.isFocused ? "Active" : "Open",
      iconUrl: w.iconDataUrl,
      isDir: false,
      run: () => {
        closeInDockLauncher();
        invoke("focus_window_cmd", { hwnd: w.hwnd });
      },
    })),
    ...homeData.recentFiles.slice(0, 12).map((rf) => ({
      id: `rr-f-${rf.path}`,
      title: rf.name,
      sub: `${rf.folderName || "Recent"} · ${rf.sizeLabel || (rf.ext ? rf.ext.toUpperCase() : "File")}`,
      badge: rf.ageLabel,
      iconUrl: null as string | null | undefined,
      isDir: Boolean(rf.isDir),
      run: () => {
        closeInDockLauncher();
        invoke("launch_app_cmd", { path: rf.path });
      },
    })),
  ].slice(0, 12);

  const searchableItems = [
    ...runningWindows.map((w) => ({
      id: `sw-${w.hwnd}`,
      title: w.title,
      subtitle: `${w.processName.replace(/\.exe$/i, "")} · Running Window`,
      badge: w.isFocused ? "Active" : "Open",
      kind: "recent" as const,
      iconUrl: w.iconDataUrl,
      run: () => {
        closeInDockLauncher();
        invoke("focus_window_cmd", { hwnd: w.hwnd });
      },
    })),
    ...homeData.folders.map((f) => ({
      id: `sf-${f.path}`,
      title: f.name,
      subtitle: `${f.itemCount ?? 0} items · ${f.path}`,
      badge: "Folder",
      kind: "folders" as const,
      iconUrl: null as string | null | undefined,
      run: () => {
        closeInDockLauncher();
        invoke("launch_app_cmd", { path: f.path });
      },
    })),
    ...homeData.recentFiles.map((rf) => ({
      id: `srf-${rf.path}`,
      title: rf.name,
      subtitle: `${rf.folderName || "Recent"} · ${rf.sizeLabel || (rf.ext ? rf.ext.toUpperCase() : "File")} · ${rf.path}`,
      badge: rf.ageLabel,
      kind: rf.isDir ? ("folders" as const) : ("files" as const),
      iconUrl: null as string | null | undefined,
      run: () => {
        closeInDockLauncher();
        invoke("launch_app_cmd", { path: rf.path });
      },
    })),
    ...installedApps.map((a) => ({
      id: `sa-${a.path}`,
      title: a.name,
      subtitle: `Application · ${a.path}`,
      badge: "App",
      kind: "apps" as const,
      iconUrl: null as string | null | undefined,
      run: () => {
        closeInDockLauncher();
        invoke("launch_app_cmd", { path: a.path });
      },
    })),
  ];

  const qLower = dockSearchQuery.trim().toLowerCase();
  const nlActions = parseNaturalLanguageActions(dockSearchQuery);
  const nlItems =
    nlActions.length > 0
      ? [
          {
            id: "nl-action-plan",
            title: `⚡ Run: ${nlActions.map((a) => a.label).join("  ·  ")}`,
            subtitle: `Natural-Language Action Router (${nlActions.length} ${nlActions.length === 1 ? "step" : "steps"}) · Logs to DPO dataset`,
            badge: "Run ↵",
            kind: "action" as const,
            iconUrl: null as string | null | undefined,
            run: () => {
              closeInDockLauncher();
              executeNaturalLanguagePlan(
                dockSearchQuery,
                nlActions,
                config,
                updateConfig,
                "dock-search"
              ).catch(() => {});
            },
          },
        ]
      : [];

  const filteredResults = qLower
    ? toDockResults(dockSearch.results, dockFilterTab, dockSearch.activate, dockSearch.armedKey).slice(0, 28)
    : [
    ...nlItems,
    ...searchableItems.filter((item) => {
      if (dockFilterTab === "apps" && item.kind !== "apps") return false;
      if (dockFilterTab === "files" && item.kind !== "files") return false;
      if (dockFilterTab === "folders" && item.kind !== "folders") return false;
      if (dockFilterTab === "recent" && item.kind !== "recent" && item.kind !== "files") return false;
      if (!qLower) return true;
      return item.title.toLowerCase().includes(qLower) || item.subtitle.toLowerCase().includes(qLower);
    }),
  ].slice(0, 28);

  const showHomeGrid = qLower === "" && dockFilterTab === "all";

  return (
    <div
      data-guide-id="dock"
      className={`dock-stage dock-edge-${edge} dock-style-${dockStyle} dock-align-${alignment} ${isBar ? "is-bar" : ""} ${systemInDock ? "has-dock-system" : ""} ${magnification !== "off" ? `mag-on mag-${magnification}` : ""} ${launchAnimation !== "lift" ? `launch-${launchAnimation}` : ""} ${showLabels ? "show-labels" : ""} icon-theme-${iconTheme} icon-shape-${iconShape}`}
      style={{
        ["--dock-effective-icon-size" as string]: `${
          dockSearchOpen && searchIconSize ? searchIconSize : effectiveIconSize
        }px`,
        ["--dock-full-icon-size" as string]: `${effectiveIconSize}px`,
        ...(isBar && isVertical && config.dock.showTopBar && config.topBar?.enabled !== false
          ? { ["--dock-topbar-offset" as string]: `${config.topBar?.height ?? 34}px` }
          : {}),
      }}
    >
      <McpBridge config={config} updateConfig={updateConfig} />
      <AiApplyBridge config={config} updateConfig={updateConfig} />
      {shownMenu && menuLinger.mounted && (
        <>
          {!menuLinger.leaving && <div className="dock-ctx-backdrop" onClick={closeMenu} onContextMenu={(e) => { e.preventDefault(); closeMenu(); }} />}
          <div
            ref={menuLinger.ref}
            inert={menuLinger.leaving}
            className={`dock-ctx-menu dock-ctx-edge-${edge}`}
            onKeyDown={onMenuKeyDown}
            style={
              edge === "left"
                ? { left: (pillRef.current?.getBoundingClientRect().right ?? 60) + 12, top: Math.max(170, Math.min(window.innerHeight - 170, shownMenu.y + effectiveIconSize / 2)) }
                : edge === "right"
                  ? { left: (pillRef.current?.getBoundingClientRect().left ?? window.innerWidth - 60) - 12, top: Math.max(170, Math.min(window.innerHeight - 170, shownMenu.y + effectiveIconSize / 2)) }
                  : edge === "top"
                    ? { left: Math.max(100, Math.min(window.innerWidth - 100, shownMenu.x)), top: shownMenu.y + effectiveIconSize + 18 }
                    : { left: Math.max(100, Math.min(window.innerWidth - 100, shownMenu.x)), top: shownMenu.y - 12 }
            }
          >
            {shownMenu.kind === "app" && (
              <LensPan
                item={{
                  kind: "dockItem",
                  id: shownMenu.pinnedApp?.id ?? (shownMenu.windows[0] ? `win-${shownMenu.windows[0].hwnd}` : shownMenu.launchPath),
                  label: shownMenu.pinnedApp?.name ?? shownMenu.title,
                  path: shownMenu.launchPath || null,
                }}
                itemClassName="dock-ctx-item"
                onClose={closeMenu}
              >
                {shownMenu.windows.length > 0 ? (
                  <>
                    {shownMenu.windows.slice(0, 3).map((w) => (
                      <button
                        key={w.hwnd}
                        type="button"
                        className="dock-ctx-item"
                        onClick={() => {
                          invoke("focus_window_cmd", { hwnd: w.hwnd });
                          closeMenu();
                        }}
                      >
                        <AppWindow size={14} strokeWidth={2.4} color={w.isFocused ? "#38BDF8" : "#A1A1AA"} style={{ flexShrink: 0 }} />
                        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {w.title || w.processName.replace(/\.exe$/i, "")}
                        </span>
                      </button>
                    ))}

                    {/* Compact 3-Button Window Control Pill Bar: Minimize · Maximize · Top */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 3, padding: "2px 0" }}>
                      <button
                        type="button"
                        className="dock-ctx-item"
                        style={{ justifyContent: "center", padding: "5px 4px", gap: 4, fontSize: 11, background: "rgb(var(--lens-ink) / 0.04)" }}
                        onClick={() => {
                          invoke("window_action_cmd", { hwnd: shownMenu.windows[0].hwnd, action: "minimize" });
                          closeMenu();
                        }}
                      >
                        <Minus size={13} strokeWidth={2.6} />
                        <span>Min</span>
                      </button>
                      <button
                        type="button"
                        className="dock-ctx-item"
                        style={{ justifyContent: "center", padding: "5px 4px", gap: 4, fontSize: 11, background: "rgb(var(--lens-ink) / 0.04)" }}
                        onClick={() => {
                          invoke("window_action_cmd", { hwnd: shownMenu.windows[0].hwnd, action: "maximize" });
                          closeMenu();
                        }}
                      >
                        <Square size={11.5} strokeWidth={2.6} />
                        <span>Max</span>
                      </button>
                      <button
                        type="button"
                        className="dock-ctx-item"
                        style={{ justifyContent: "center", padding: "5px 4px", gap: 4, fontSize: 11, background: "rgb(var(--lens-ink) / 0.04)" }}
                        onClick={() => {
                          // Tracked pin: Lens unpins it again on quit (docs/WINDOW_STYLING.md §2).
                          const hwnd = shownMenu.windows[0].hwnd;
                          invoke<{ hwnd: number }[]>("list_pinned_windows_cmd")
                            .then((list) => invoke("set_window_pinned_cmd", { hwnd, pinned: !list.some((p) => p.hwnd === hwnd) }))
                            .catch(() => {});
                          closeMenu();
                        }}
                      >
                        <ArrowUpToLine size={13} strokeWidth={2.5} />
                        <span>Top</span>
                      </button>
                    </div>

                    <div className="dock-ctx-sep" />

                    <button
                      type="button"
                      className="dock-ctx-item"
                      onClick={() => {
                        invoke("launch_app_cmd", { path: shownMenu.launchPath });
                        closeMenu();
                      }}
                    >
                      <PlusSquare size={14} strokeWidth={2.4} style={{ flexShrink: 0 }} />
                      <span>New Window</span>
                    </button>
                    <button
                      type="button"
                      className="dock-ctx-item"
                      onClick={() => {
                        invoke("launch_app_advanced_cmd", { path: shownMenu.launchPath, mode: "admin" });
                        closeMenu();
                      }}
                    >
                      <Shield size={14} strokeWidth={2.4} style={{ flexShrink: 0 }} />
                      <span>Run as Admin</span>
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className="dock-ctx-item"
                      onClick={() => {
                        invoke("launch_app_cmd", { path: shownMenu.launchPath });
                        closeMenu();
                      }}
                    >
                      <ExternalLink size={14} strokeWidth={2.4} style={{ flexShrink: 0 }} />
                      <span>Open</span>
                    </button>
                    <button
                      type="button"
                      className="dock-ctx-item"
                      onClick={() => {
                        invoke("launch_app_advanced_cmd", { path: shownMenu.launchPath, mode: "admin" });
                        closeMenu();
                      }}
                    >
                      <Shield size={14} strokeWidth={2.4} style={{ flexShrink: 0 }} />
                      <span>Run as Admin</span>
                    </button>
                  </>
                )}

                <LensMenuRow className="dock-ctx-item" />

                <button
                  type="button"
                  className="dock-ctx-item"
                  onClick={() => {
                    invoke("launch_app_advanced_cmd", { path: shownMenu.launchPath, mode: "reveal" });
                    closeMenu();
                  }}
                >
                  <FolderOpen size={14} strokeWidth={2.4} style={{ flexShrink: 0 }} />
                  <span>File Location</span>
                </button>

                {shownMenu.pinnedApp && !locked && (
                  <button
                    type="button"
                    className="dock-ctx-item"
                    onClick={() => {
                      const id = shownMenu.pinnedApp!.id;
                      updateDockExtras({
                        separatorsAfter: separatorsAfter.includes(id)
                          ? separatorsAfter.filter((x) => x !== id)
                          : [...separatorsAfter, id],
                      });
                      closeMenu();
                    }}
                  >
                    <SeparatorVertical size={14} strokeWidth={2.4} style={{ flexShrink: 0 }} />
                    <span>{separatorsAfter.includes(shownMenu.pinnedApp.id) ? "Remove Separator" : "Add Separator After"}</span>
                  </button>
                )}

                {shownMenu.pinnedApp ? (
                  !locked && (
                    <button
                      type="button"
                      className="dock-ctx-item"
                      onClick={() => {
                        unpinApp(shownMenu.pinnedApp!.id);
                        closeMenu();
                      }}
                    >
                      <PinOff size={14} strokeWidth={2.4} style={{ flexShrink: 0 }} />
                      <span>Unpin</span>
                    </button>
                  )
                ) : (
                  shownMenu.windows[0] && (
                    <button
                      type="button"
                      className="dock-ctx-item"
                      onClick={() => {
                        pinWindow(shownMenu.windows[0]);
                        closeMenu();
                      }}
                    >
                      <Pin size={14} strokeWidth={2.4} style={{ flexShrink: 0 }} />
                      <span>Pin to Dock</span>
                    </button>
                  )
                )}

                {shownMenu.windows.length > 0 && (
                  <>
                    <div className="dock-ctx-sep" />
                    <button
                      type="button"
                      className="dock-ctx-item danger"
                      onClick={() => {
                        shownMenu.windows.forEach((w) =>
                          invoke("window_action_cmd", { hwnd: w.hwnd, action: "close" })
                        );
                        closeMenu();
                      }}
                    >
                      <X size={14} strokeWidth={2.6} style={{ flexShrink: 0 }} />
                      <span>Close {shownMenu.windows.length > 1 ? `All (${shownMenu.windows.length})` : "Window"}</span>
                    </button>
                  </>
                )}
              </LensPan>
            )}

            {shownMenu.kind === "folder" && (
              <>
                <button
                  type="button"
                  className="dock-ctx-item"
                  onClick={() => {
                    invoke("launch_app_cmd", { path: shownMenu.folder.path });
                    closeMenu();
                  }}
                >
                  <ExternalLink size={14} strokeWidth={2.4} />
                  <span>Open Folder</span>
                </button>
                {!locked && (
                  <button
                    type="button"
                    className="dock-ctx-item danger"
                    onClick={() => {
                      removeFolder(shownMenu.folder.id);
                      closeMenu();
                    }}
                  >
                    <Trash2 size={14} strokeWidth={2.4} />
                    <span>Remove</span>
                  </button>
                )}
              </>
            )}

            {shownMenu.kind === "dock" && (
              <>
                <button
                  type="button"
                  className="dock-ctx-item"
                  onClick={() => {
                    setSettingsOpen(true);
                    setActiveSettingsTab("quick");
                    invoke("open_dock_popout_tab_cmd", { tab: "quick" });
                    closeMenu();
                  }}
                >
                  <Monitor size={14} strokeWidth={2.4} color="#38BDF8" />
                  <span>Quick Controls</span>
                </button>
                <button
                  type="button"
                  className="dock-ctx-item"
                  onClick={() => {
                    setSettingsOpen(true);
                    setActiveSettingsTab("theme");
                    invoke("open_dock_popout_tab_cmd", { tab: "theme" });
                    closeMenu();
                  }}
                >
                  <Palette size={14} strokeWidth={2.4} color="#A78BFA" />
                  <span>Theme &amp; Look</span>
                </button>
                <button
                  type="button"
                  className="dock-ctx-item"
                  onClick={() => {
                    setSettingsOpen(true);
                    setActiveSettingsTab("dock");
                    invoke("open_dock_popout_tab_cmd", { tab: "dock" });
                    closeMenu();
                  }}
                >
                  <PanelBottom size={14} strokeWidth={2.4} color="#60A5FA" />
                  <span>Dock &amp; Top Bar</span>
                </button>
                <button
                  type="button"
                  className="dock-ctx-item"
                  onClick={() => {
                    closeMenu();
                    openInDockLauncher();
                  }}
                >
                  <Search size={14} strokeWidth={2.4} color="#34D399" />
                  <span>Search</span>
                </button>

                <div className="dock-ctx-sep" />

                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 3, padding: "2px 0" }}>
                  {[34, 40, 46, 52].map((val) => (
                    <button
                      key={val}
                      type="button"
                      className="dock-ctx-item"
                      style={{
                        justifyContent: "center",
                        padding: "4px 0",
                        fontSize: 11,
                        fontWeight: config.dock.iconSize === val ? 700 : 600,
                        background: config.dock.iconSize === val ? "rgb(var(--lens-ink) / 0.16)" : "rgb(var(--lens-ink) / 0.04)",
                      }}
                      onClick={() => {
                        updateConfig({ ...config, dock: { ...config.dock, iconSize: val } });
                      }}
                    >
                      {val}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  className="dock-ctx-item"
                  onClick={() => {
                    updateConfig({
                      ...config,
                      func: { ...config.func, hideNativeTaskbar: !config.func.hideNativeTaskbar },
                    });
                    closeMenu();
                  }}
                >
                  <PanelBottom size={14} strokeWidth={2.4} />
                  <span>{config.func.hideNativeTaskbar ? "Show Taskbar" : "Hide Taskbar"}</span>
                </button>

                <div className="dock-ctx-sep" />
                <div className="dock-ctx-label">Dock Position</div>
                <div className="dock-ctx-edge-row">
                  {(
                    [
                      { id: "left", label: "Left", Icon: PanelLeft },
                      { id: "bottom", label: "Bottom", Icon: PanelBottom },
                      { id: "top", label: "Top", Icon: PanelTop },
                      { id: "right", label: "Right", Icon: PanelRight },
                    ] as { id: DockEdge; label: string; Icon: typeof PanelLeft }[]
                  ).map(({ id, label, Icon }) => (
                    <button
                      key={id}
                      type="button"
                      className={`dock-ctx-edge-btn ${edge === id ? "active" : ""}`}
                      aria-label={`Dock on ${label.toLowerCase()} edge`}
                      onClick={() => {
                        updateDockExtras({ position: id });
                        closeMenu();
                      }}
                    >
                      <Icon size={14} strokeWidth={2.3} />
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="dock-ctx-item"
                  onClick={() => {
                    updateDockExtras({ livePreviews: !livePreviews });
                    closeMenu();
                  }}
                >
                  <AppWindow size={14} strokeWidth={2.4} />
                  <span>{livePreviews ? "Hide Window Previews" : "Show Window Previews"}</span>
                </button>
                <button
                  type="button"
                  className="dock-ctx-item"
                  onClick={() => {
                    updateDockExtras({ locked: !locked });
                    closeMenu();
                  }}
                >
                  {locked ? <Unlock size={14} strokeWidth={2.4} /> : <Lock size={14} strokeWidth={2.4} />}
                  <span>{locked ? "Unlock Dock Items" : "Lock Dock Items"}</span>
                </button>
              </>
            )}
          </div>
        </>
      )}

      {/* Lightweight Hover Popover: Spotify Media Controls + Album Thumbnail OR Running Windows Switcher for Any Dock Icon / Folder */}
      {shownCard && hoverLinger.mounted && (
        <div
          ref={hoverLinger.ref}
          inert={hoverLinger.leaving}
          className={`dock-hover-card dock-hover-edge-${edge} ${
            livePreviews && !shownCard.isSpotify && shownCard.windows.length > 0 ? "has-previews" : ""
          }`}
          style={
            edge === "left"
              ? { left: shownCard.x + 12, top: Math.max(150, Math.min(window.innerHeight - 150, shownCard.y)) }
              : edge === "right"
                ? { left: shownCard.x - 12, top: Math.max(150, Math.min(window.innerHeight - 150, shownCard.y)) }
                : edge === "top"
                  ? { left: Math.max(135, Math.min(window.innerWidth - 135, shownCard.x)), top: shownCard.y + 12 }
                  : { left: Math.max(135, Math.min(window.innerWidth - 135, shownCard.x)), top: shownCard.y - 12 }
          }
          onMouseEnter={cancelHoverClose}
          onMouseLeave={scheduleHoverClose}
        >
          {shownCard.isSpotify ? (
            <div className="dock-spotify-card">
              <div className="dock-spotify-top">
                {mediaInfo?.thumbnailDataUrl ? (
                  <img src={mediaInfo.thumbnailDataUrl} alt="" className="dock-spotify-art" />
                ) : (
                  <div className="dock-spotify-art-fallback">
                    <Music size={18} color="#1DB954" />
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="dock-spotify-title">
                    {mediaInfo?.title || shownCard.windows[0]?.title || "Spotify"}
                  </div>
                  <div className="dock-spotify-artist">
                    {mediaInfo?.artist || "Ready to play"}
                  </div>
                </div>
              </div>

              <div className="dock-spotify-controls">
                <button
                  type="button"
                  className="dock-media-btn"
                  aria-label="Previous"
                  onClick={() => {
                    invoke("media_control_cmd", { action: "prev" }).catch(() => {});
                    window.setTimeout(() => {
                      invoke<MediaNowPlaying>("get_media_now_playing_cmd")
                        .then((m) => setMediaInfo(m.hasSession ? m : null))
                        .catch(() => {});
                    }, 260);
                  }}
                >
                  <SkipBack size={14} fill="currentColor" strokeWidth={2} />
                </button>
                <button
                  type="button"
                  className="dock-media-btn play"
                  aria-label={mediaInfo?.isPlaying ? "Pause" : "Play"}
                  onClick={() => {
                    setMediaInfo((prev) =>
                      prev ? { ...prev, isPlaying: !prev.isPlaying } : prev
                    );
                    invoke("media_control_cmd", { action: "play_pause" }).catch(() => {});
                  }}
                >
                  {mediaInfo?.isPlaying ? (
                    <Pause size={15} fill="currentColor" strokeWidth={2} />
                  ) : (
                    <Play size={15} fill="currentColor" strokeWidth={2} />
                  )}
                </button>
                <button
                  type="button"
                  className="dock-media-btn"
                  aria-label="Next"
                  onClick={() => {
                    invoke("media_control_cmd", { action: "next" }).catch(() => {});
                    window.setTimeout(() => {
                      invoke<MediaNowPlaying>("get_media_now_playing_cmd")
                        .then((m) => setMediaInfo(m.hasSession ? m : null))
                        .catch(() => {});
                    }, 260);
                  }}
                >
                  <SkipForward size={14} fill="currentColor" strokeWidth={2} />
                </button>

                <button
                  type="button"
                  className={`dock-topbar-pin-btn ${(config.topBar?.showMediaControls ?? true) ? "active" : ""}`}
                  onClick={() => {
                    const next = !(config.topBar?.showMediaControls ?? true);
                    updateConfig({
                      ...config,
                      topBar: { ...config.topBar, showMediaControls: next },
                    });
                  }}
                >
                  <PanelTop size={11.5} strokeWidth={2.4} />
                  <span>{(config.topBar?.showMediaControls ?? true) ? "In Top Bar" : "Pin Top Bar"}</span>
                </button>
              </div>
            </div>
          ) : livePreviews ? (
            <DockPreviewStrip
              key={shownCard.key}
              active={!hoverLinger.leaving}
              windows={shownCard.windows}
              iconUrl={shownCard.iconUrl}
              onFocus={(hwnd) => {
                setHoverCard(null);
                invoke("set_dock_menu_open", { open: false }).catch(() => {});
                invoke("focus_window_cmd", { hwnd });
              }}
              onClose={(hwnd) => {
                invoke("window_action_cmd", { hwnd, action: "close" });
                setHoverCard((prev) =>
                  prev ? { ...prev, windows: prev.windows.filter((x) => x.hwnd !== hwnd) } : null
                );
              }}
            />
          ) : (
            <div className="dock-win-list">
              <div className="dock-win-list-head">
                <span>{shownCard.title}</span>
                <span className="dock-win-count">{shownCard.windows.length}</span>
              </div>
              {shownCard.windows.slice(0, 7).map((w) => (
                <div key={w.hwnd} className={`dock-win-row ${w.isFocused ? "focused" : ""}`}>
                  <button
                    type="button"
                    className="dock-win-row-main"
                    onClick={() => {
                      setHoverCard(null);
                      invoke("set_dock_menu_open", { open: false }).catch(() => {});
                      invoke("focus_window_cmd", { hwnd: w.hwnd });
                    }}
                  >
                    {w.iconDataUrl || shownCard.iconUrl ? (
                      <img
                        src={w.iconDataUrl || shownCard.iconUrl || ""}
                        alt=""
                        style={{ width: 14, height: 14, objectFit: "contain", flexShrink: 0 }}
                      />
                    ) : (
                      <AppWindow size={13} color="#38BDF8" style={{ flexShrink: 0 }} />
                    )}
                    <span className="dock-win-row-title">
                      {w.title || w.processName.replace(/\.exe$/i, "")}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="dock-win-row-close"
                    aria-label="Close window"
                    onClick={(e) => {
                      e.stopPropagation();
                      invoke("window_action_cmd", { hwnd: w.hwnd, action: "close" });
                      setHoverCard((prev) =>
                        prev
                          ? {
                              ...prev,
                              windows: prev.windows.filter((x) => x.hwnd !== w.hwnd),
                            }
                          : null
                      );
                    }}
                  >
                    <X size={11} strokeWidth={2.8} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <nav
        ref={pillRef}
        className={`dock-pill ${locked ? "is-locked" : ""} ${!dockVisible ? "is-hidden" : ""} ${settingsOpen && settingsDocked ? "is-fused-top" : ""} ${dockSearchOpen ? "is-expanded-launcher" : ""} ${ctxMenu ? "is-menu-open" : ""}`}
        style={
          isBar
            ? dockSearchOpen && lockedRowOffset !== null && !isVertical
              ? { gridTemplateColumns: `${lockedRowOffset}px auto 1fr` }
              : undefined
            : dockSearchOpen && lockedDockWidth && !isVertical
              ? { width: lockedDockWidth, minWidth: lockedDockWidth }
              : undefined
        }
        aria-label="Lens Grounded Dock"
        onMouseMove={magnification !== "off" ? (e) => applyMagnification(e.clientX, e.clientY) : undefined}
        onMouseLeave={magnification !== "off" ? clearMagnification : undefined}
        onContextMenu={(e) => {
          const target = e.target as HTMLElement;
          if (!target.closest("[data-dock-drag-key]")) {
            e.preventDefault();
            const r = pillRef.current?.getBoundingClientRect();
            openMenu({ kind: "dock", x: e.clientX, y: r ? r.top : e.clientY });
          }
        }}
      >
        {/* TIER 1: In-Dock Expanded Launcher Drawer (Directly above the single unified Dock row!) */}
        {dockSearchOpen && askMode.mode !== "ask" && (
          <div className={`dock-launcher-drawer ${dockSearchClosing ? "is-closing" : ""}`}>
            <FlyoutClose pinned label="Close Search" onClose={closeInDockLauncher} />
            <div className="pal-filter-bar" style={{ padding: "4px 36px 6px 6px" }}>
              {(
                [
                  { id: "all", label: "Overview", count: null, color: "#38BDF8", icon: Sparkles },
                  { id: "files", label: "Files", count: homeData.recentFiles.length, color: "#60A5FA", icon: FileText },
                  { id: "folders", label: "Folders", count: homeData.folders.length, color: "#FBBF24", icon: Folder },
                  { id: "apps", label: "Apps", count: installedApps.length, color: "#A78BFA", icon: AppWindow },
                  { id: "recent", label: "Running", count: runningWindows.length, color: "#34D399", icon: Activity },
                ] as const
              ).map((f) => {
                const isActive = dockFilterTab === f.id;
                const IconComp = f.icon;
                return (
                  <button
                    key={f.id}
                    type="button"
                    className={`pal-filter-pill ${isActive ? "active" : ""}`}
                    onClick={() => {
                      setDockFilterTab(f.id);
                      setDockSelectedIdx(0);
                      searchInputRef.current?.focus();
                    }}
                  >
                    <IconComp
                      size={13.5}
                      strokeWidth={2.4}
                      color={isActive ? "var(--lens-on-fg, #09090b)" : f.color}
                      style={{ flexShrink: 0 }}
                    />
                    <span>{f.label}</span>
                    {f.count !== null && (
                      <span className="pal-filter-count">{f.count}</span>
                    )}
                  </button>
                );
              })}
            </div>

            {showHomeGrid ? (
              <div
                className="pal-two-col"
                style={{
                  padding: "4px 6px 8px 6px",
                  gridTemplateColumns: "1.28fr 1fr",
                  gap: 14,
                  minHeight: 520,
                  alignItems: "stretch",
                }}
              >
                {/* Left Card: Recent Files & Active Windows */}
                <div className="dock-launcher-card">
                  <div className="dock-launcher-card-head">
                    <span className="dock-launcher-card-title">
                      <FileText size={15} strokeWidth={2.4} color="#60A5FA" style={{ flexShrink: 0 }} />
                      <span>Recent Files &amp; Active Windows</span>
                    </span>
                    <button
                      type="button"
                      className="dock-launcher-card-link"
                      onClick={() => setDockFilterTab("files")}
                    >
                      All Files →
                    </button>
                  </div>
                  <div className="pal-recent-list" style={{ maxHeight: 495, overflowY: "auto", paddingRight: 4, gap: 5 }}>
                    {recentAndRunning.map((item, idx) => (
                      <button
                        key={item.id}
                        type="button"
                        className={`pal-recent-row ${idx === 0 ? "first" : ""}`}
                        style={{ padding: "9px 11px", gap: 11 }}
                        onClick={item.run}
                      >
                        <span className="pal-recent-icon" style={{ width: 26, height: 26 }}>
                          {item.iconUrl ? (
                            <img src={item.iconUrl} alt="" style={{ width: 24, height: 24 }} />
                          ) : item.isDir ? (
                            <Folder size={19} color="#FBBF24" />
                          ) : (
                            <FileText size={19} color="#60A5FA" />
                          )}
                        </span>
                        <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                          <div className="pal-recent-name" style={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.3 }}>
                            {item.title}
                          </div>
                          <div style={{ fontSize: 11.5, color: "var(--lens-fg-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 1 }}>
                            {item.sub}
                          </div>
                        </div>
                        <span
                          className="pal-recent-age"
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            padding: "3px 8px",
                            borderRadius: 7,
                            background:
                              item.badge === "Active"
                                ? "rgb(52 211 153 / 0.16)"
                                : item.badge === "Open"
                                  ? "rgb(96 165 250 / 0.14)"
                                  : "rgb(var(--lens-ink) / 0.06)",
                            color:
                              item.badge === "Active"
                                ? "var(--lens-badge-active, #34D399)"
                                : item.badge === "Open"
                                  ? "var(--lens-badge-open, #93C5FD)"
                                  : "var(--lens-fg-secondary)",
                          }}
                        >
                          {item.badge}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Right Column: Quick Folders Card + Spacious Single-Column Installed Apps Card */}
                <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
                  <div className="dock-launcher-card">
                    <div className="dock-launcher-card-head">
                      <span className="dock-launcher-card-title">
                        <Folder size={15} strokeWidth={2.4} color="#FBBF24" style={{ flexShrink: 0 }} />
                        <span>Quick Folders</span>
                      </span>
                      <button
                        type="button"
                        className="dock-launcher-card-link"
                        onClick={() => setDockFilterTab("folders")}
                      >
                        Folders →
                      </button>
                    </div>
                    <div className="pal-folder-grid" style={{ gap: 10 }}>
                      {homeData.folders.map((folder) => (
                        <button
                          key={folder.path}
                          type="button"
                          className="pal-folder-card"
                          style={{ padding: "12px 10px 10px 10px", gap: 5 }}
                          onClick={() => {
                            closeInDockLauncher();
                            invoke("launch_app_cmd", { path: folder.path });
                          }}
                        >
                          <DockMatteFolderSvg color={folder.color} />
                          <span className="pal-folder-label" style={{ fontSize: 13, fontWeight: 600, color: "var(--lens-fg)" }}>
                            {folder.name}
                          </span>
                          <span style={{ fontSize: 11.5, color: "var(--lens-fg-muted)", fontWeight: 500 }}>
                            {folder.itemCount ?? 0} items
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Installed Apps Card: Spacious single-column list so no app name or header ever clips */}
                  <div className="dock-launcher-card" style={{ flex: 1 }}>
                    <div className="dock-launcher-card-head">
                      <span className="dock-launcher-card-title">
                        <AppWindow size={15} strokeWidth={2.4} color="#A78BFA" style={{ flexShrink: 0 }} />
                        <span>Installed Apps</span>
                      </span>
                      <button
                        type="button"
                        className="dock-launcher-card-link"
                        onClick={() => setDockFilterTab("apps")}
                      >
                        All ({installedApps.length}) →
                      </button>
                    </div>
                    <div className="pal-recent-list" style={{ gap: 4, overflowY: "auto", maxHeight: 265, paddingRight: 2 }}>
                      {installedApps.slice(0, 7).map((app) => (
                        <button
                          key={app.path}
                          type="button"
                          className="pal-recent-row"
                          style={{ padding: "8px 10px", gap: 10 }}
                          onClick={() => {
                            closeInDockLauncher();
                            if (config?.dock?.suggestedApps) recordDockLaunch({ key: app.path.toLowerCase(), name: app.name, path: app.path });
                    invoke("launch_app_cmd", { path: app.path });
                          }}
                        >
                          <AppWindow size={16} strokeWidth={2.2} color="#A78BFA" style={{ flexShrink: 0 }} />
                          <span className="pal-recent-name" style={{ fontSize: 13, fontWeight: 600 }}>
                            {app.name}
                          </span>
                          <span style={{ fontSize: 11, color: "var(--lens-fg-muted)", flexShrink: 0 }}>
                            Open
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="dock-launcher-card" style={{ margin: "2px 6px 8px 6px", padding: "10px" }}>
                <div className="pal-results" style={{ maxHeight: 530, minHeight: 470, padding: "2px 4px", gap: 4 }}>
                  {filteredResults.map((item, idx) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`pal-result-row ${idx === dockSelectedIdx ? "selected" : ""}`}
                      style={{ padding: "10px 12px" }}
                      onMouseEnter={() => setDockSelectedIdx(idx)}
                      onClick={item.run}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: 1 }}>
                        <span className="pal-recent-icon" style={{ width: 26, height: 26 }}>
                          {item.iconUrl ? (
                            <img src={item.iconUrl} alt="" style={{ width: 24, height: 24 }} />
                          ) : item.kind === "folders" ? (
                            <Folder size={19} color="#FBBF24" />
                          ) : item.kind === "files" ? (
                            <FileText size={19} color="#60A5FA" />
                          ) : (
                            <AppWindow size={19} color="#A78BFA" />
                          )}
                        </span>
                        <div style={{ minWidth: 0, flex: 1, textAlign: "left" }}>
                          <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--lens-fg)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {item.title}
                          </div>
                          <div style={{ fontSize: 11.5, color: "var(--lens-fg-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 1 }}>
                            {item.subtitle}
                          </div>
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--lens-fg-secondary)", padding: "3px 9px", borderRadius: 7, background: "rgb(var(--lens-ink) / 0.06)", flexShrink: 0 }}>
                          {item.badge}
                        </span>
                      </div>
                    </button>
                  ))}
                  {filteredResults.length === 0 && (
                    <div style={{ padding: 48, textAlign: "center", color: "var(--lens-fg-muted)", fontSize: 13.5 }}>
                      No matching apps, files, or folders.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TIER 2: Single Unified Grounded Dock Row — original Magnifying Glass glides open IN-PLACE into the search input! */}
        {isBar && <div className="dock-bar-spacer" aria-hidden="true" />}
        <div className="dock-icons-row">
          {showLauncherButton && (
            <div className="dock-item-wrap dock-launcher-slot">
              <span className="dock-tooltip">Launcher</span>
              <button
                type="button"
                className={`dock-item dock-launcher-btn ${launchingId === "launcher" ? "is-launching" : ""}`}
                aria-label="Open Launcher"
                onClick={() => {
                  triggerLaunchAnim("launcher");
                  invoke("toggle_surface", { label: "launcher" }).catch(() => {});
                }}
              >
                <LayoutGrid size={19} strokeWidth={2.15} />
              </button>
            </div>
          )}
          <div className={`dock-item-wrap dock-search-slot ${dockSearchOpen ? "is-open" : ""} ${dockSearchClosing ? "is-closing" : ""}`}>
            {!dockSearchOpen && <span className="dock-tooltip">Lens Search (Alt+Space)</span>}
            <div
              className={`dock-search-inline ${dockSearchOpen ? "is-open" : ""}`}
              onClick={() => {
                if (!dockSearchOpen) {
                  openInDockLauncher();
                } else {
                  searchInputRef.current?.focus();
                }
              }}
            >
              {/* At rest this is a normal dock icon, identical to the settings gear; the text box grows out of it. */}
              <button
                type="button"
                className={`dock-search-mag-btn ${dockSearchOpen ? "" : "dock-item"}`}
                aria-label="Toggle Lens Search"
                onClick={(e) => {
                  e.stopPropagation();
                  if (dockSearchOpenRef.current) {
                    closeInDockLauncher();
                  } else {
                    openInDockLauncher();
                  }
                }}
              >
                <Search size={19} strokeWidth={2.15} />
              </button>

              {dockSearchOpen && (
                <>
                  <input
                    ref={searchInputRef}
                    className="dock-search-glide-input"
                    data-guide-id="dock.search"
                    value={dockSearchQuery}
                    placeholder={askMode.mode === "ask" ? "Ask anything…" : "Search…"}
                    onChange={(e) => {
                      setDockSearchQuery(e.target.value);
                      setDockSelectedIdx(0);
                    }}
                    onKeyDown={(e) => {
                      if (askMode.onKeyDown(e)) return;
                      if (askMode.mode === "ask" && e.key === "Enter" && dockSearchQuery.trim()) {
                        e.preventDefault();
                        setAskCtx(undefined);
                        setAskPrompt(dockSearchQuery.trim());
                        return;
                      }
                      if (e.key === "Escape") {
                        e.preventDefault();
                        closeInDockLauncher();
                      } else if (e.key === "ArrowDown") {
                        e.preventDefault();
                        setDockSelectedIdx((s) => Math.min(Math.max(0, filteredResults.length - 1), s + 1));
                      } else if (e.key === "ArrowUp") {
                        e.preventDefault();
                        setDockSelectedIdx((s) => Math.max(0, s - 1));
                      } else if (e.key === "Enter" && filteredResults[dockSelectedIdx]) {
                        e.preventDefault();
                        filteredResults[dockSelectedIdx].run();
                      }
                    }}
                  />
                  {aiOn && <AskModeToggle mode={askMode.mode} onToggle={askMode.toggle} />}
                  <button
                    type="button"
                    className="dock-search-esc"
                    onClick={(e) => {
                      e.stopPropagation();
                      closeInDockLauncher();
                    }}
                  >
                    ESC
                  </button>
                </>
              )}
            </div>
          </div>

          {aiOn && !dockSearchOpen && (
            <div
              className="dock-item-wrap"
              data-dock-drag-key="ai-drop"
              data-dock-ai-drop="true"
              onContextMenu={(e) => {
                // Right-click the sparkle: Lens Mini anchored above the Dock (docs/COMMAND.md (b)).
                e.preventDefault();
                const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                const dpr = window.devicePixelRatio || 1;
                const x = Math.round((window.screenX + r.left + r.width / 2) * dpr);
                const top = Math.round((window.screenY + r.top) * dpr);
                invoke("show_command_cmd", { payload: { layout: "mini", anchor: `dock:${x}:${top}` } }).catch(() => {});
              }}
            >
              <DropSparkle
                active={dropKey === "ai-drop"}
                onClick={() => {
                  askMode.setMode("ask");
                  openInDockLauncher();
                }}
              />
            </div>
          )}

          <div className="dock-divider" />

          {aiOn && (
            <SuggestedApps
              enabled={!!config?.dock?.suggestedApps}
              exclude={pinnedRows.map(({ app }) => app.path.toLowerCase())}
              iconFor={(p) => pinnedIcons[p]}
              onLaunch={(sug) => {
                recordDockLaunch({ key: sug.path.toLowerCase(), name: sug.name, path: sug.path });
                invoke("launch_app_cmd", { path: sug.path });
              }}
            />
          )}

          {askPrompt !== null && (
            <AskDockPopover
              open
              prompt={askPrompt}
              context={askCtx}
              edge={edge}
              onClose={() => setAskPrompt(null)}
              onOpenSettings={() => {
                invoke("open_surface", { label: "settings" })
                  .then(() => emit("lens://settings-tab", "ai"))
                  .catch(() => {});
              }}
            />
          )}

          {aiDropPaths && (
            <div className="dock-ai-drop-anchor">
              <DropToAiMenu
                paths={aiDropPaths}
                onClose={() => setAiDropPaths(null)}
                onAsk={(prompt, ctx) => {
                  setAiDropPaths(null);
                  setAskCtx(ctx);
                  setAskPrompt(prompt);
                }}
              />
            </div>
          )}

        {/* Pinned Apps (open windows appear directly ON their pinned slot, drag to reorder, hover for windows/Spotify controls & X to close!) */}
        {pinnedRows.map(({ app, wins, primaryWin }) => {
          const iconSrc = primaryWin?.iconDataUrl || pinnedIcons[app.path];
          const itemKey = `pin-${app.id}`;
          const isSpotify =
            app.name.toLowerCase().includes("spotify") ||
            app.path.toLowerCase().includes("spotify") ||
            wins.some((w) => w.processName.toLowerCase().includes("spotify"));
          const hasHoverCard = isSpotify || wins.length > 0;
          const unread = notifBadgeFor(app.name, primaryWin?.processName, app.path.split(/[\\/]/).pop());
          const urgent = attentionFor(attention, app.path, ...wins.map((w) => w.exePath), ...wins.map((w) => w.processName));
          return (
            <React.Fragment key={app.id}>
            <div
              className={`dock-item-wrap ${dragKey === itemKey ? "is-dragging" : ""} ${dragOverKey === itemKey ? "is-drag-over" : ""} ${dropKey === itemKey ? "is-file-drop" : ""} ${urgent ? "is-attention" : ""}`}
              data-attention={urgent ? urgent.since.toFixed(0) : undefined}
              data-dock-drag-key={itemKey}
              data-dock-pinned="true"
              data-dock-pinned-id={app.id}
              data-dock-launch-path={app.path}
              onWheel={scrollCycles ? (e) => cycleWindows(itemKey, wins, e.deltaY) : undefined}
              onPointerDown={(e) => beginItemDrag(e, itemKey, true, app.id)}
              onMouseEnter={(e) =>
                openHoverCardForItem(e.currentTarget, itemKey, app.name, isSpotify, wins, iconSrc)
              }
              onMouseLeave={scheduleHoverClose}
            >
              {!hasHoverCard && <span className="dock-tooltip">{app.name}</span>}
              {wins.length > 0 && (
                <button
                  type="button"
                  className="dock-close-badge"
                  aria-label={`Close ${app.name}`}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    wins.forEach((w) =>
                      invoke("window_action_cmd", { hwnd: w.hwnd, action: "close" })
                    );
                  }}
                >
                  <X size={9} strokeWidth={3} />
                </button>
              )}
              <button
                type="button"
                aria-label={`${app.name}${primaryWin?.isFocused ? " (focused)" : wins.length ? " (running)" : ""}${dockBadgeLabel(unread, wins.length)}`}
                className={`dock-item ${primaryWin?.isFocused ? "is-focused" : ""} ${launchingId === app.id ? "is-launching" : ""} ${wins.some((w) => pulseHwnds.has(w.hwnd)) ? "is-pulse" : ""} ${showLabels && isBar ? "has-label" : ""}`}
                onClick={() => {
                  if (suppressClickRef.current) return;
                  setHoverCard(null);
                  triggerLaunchAnim(app.id);
                  if (primaryWin) {
                    invoke("focus_window_cmd", { hwnd: primaryWin.hwnd });
                  } else {
                    if (config?.dock?.suggestedApps) recordDockLaunch({ key: app.path.toLowerCase(), name: app.name, path: app.path });
                    invoke("launch_app_cmd", { path: app.path });
                  }
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  if (e.altKey) {
                    magicOpenFor("dockItem", app.id, app.name, primaryWin?.exePath || app.path);
                    return;
                  }
                  const r = e.currentTarget.getBoundingClientRect();
                  openMenu({
                    kind: "app",
                    x: r.left + r.width / 2,
                    y: r.top,
                    title: primaryWin ? primaryWin.title : app.name,
                    pinnedApp: app,
                    windows: wins,
                    launchPath: primaryWin?.exePath || app.path,
                  });
                }}
                onAuxClick={(e) => {
                  if (e.button === 1 && config.func.middleClickNewInstance) {
                    if (config?.dock?.suggestedApps) recordDockLaunch({ key: app.path.toLowerCase(), name: app.name, path: app.path });
                    invoke("launch_app_cmd", { path: app.path });
                  }
                }}
              >
                {iconSrc ? (
                  <img src={iconSrc} alt={app.name} />
                ) : (
                  <FallbackAppIcon hint={app.iconHint} />
                )}
                {coreBadges[app.path] ? (
                  <span className="dock-notif-badge dock-text-badge" aria-hidden="true">
                    {coreBadges[app.path]}
                  </span>
                ) : unread > 0 ? (
                  <span className="dock-notif-badge" aria-hidden="true">
                    {unread > 99 ? "99+" : unread}
                  </span>
                ) : urgent && urgent.count > 1 ? (
                  <span className="dock-notif-badge dock-attention-badge" aria-hidden="true">{urgent.count > 99 ? "99+" : urgent.count}</span>
                ) : (
                  wins.length > 1 && <span className="dock-instance-badge" aria-hidden="true">{wins.length}</span>
                )}
                {showLabels && isBar && <span className="dock-label">{primaryWin?.title && wins.length === 1 ? primaryWin.title : app.name}</span>}
              </button>
              {showLabels && !isBar && <span className="dock-label">{app.name}</span>}
              {(wins.length > 0 || urgent) && (
                <span className={`dock-indicator ${primaryWin?.isFocused ? "focused" : ""} ${urgent ? "attention" : ""}`} />
              )}
              {urgent && <span className="dock-attention-sr">{app.name} needs your attention</span>}
            </div>
            {separatorsAfter.includes(app.id) && <div className="dock-divider dock-user-sep" />}
            </React.Fragment>
          );
        })}

        {/* Running Non-Pinned Windows (drag to reorder, hover for windows/Spotify controls & X to close!) */}
        {extraGroups.length > 0 && <div className="dock-divider" />}
        {extraGroups.map(({ key, primaryWin, wins }) => {
          const itemKey = `unpin-${key}`;
          const isSpotify = primaryWin.processName.toLowerCase().includes("spotify");
          const cleanLabel = primaryWin.processName.replace(/\.exe$/i, "");
          const unread = notifBadgeFor(cleanLabel, primaryWin.title);
          const urgent = attentionFor(attention, ...wins.map((w) => w.exePath), ...wins.map((w) => w.processName));
          return (
            <div
              className={`dock-item-wrap ${dragKey === itemKey ? "is-dragging" : ""} ${dragOverKey === itemKey ? "is-drag-over" : ""} ${dropKey === itemKey ? "is-file-drop" : ""} ${urgent ? "is-attention" : ""}`}
              data-attention={urgent ? urgent.since.toFixed(0) : undefined}
              key={key}
              data-dock-drag-key={itemKey}
              data-dock-pinned="false"
              data-dock-launch-path={primaryWin.exePath}
              onWheel={scrollCycles ? (e) => cycleWindows(itemKey, wins, e.deltaY) : undefined}
              onPointerDown={(e) => beginItemDrag(e, itemKey, false)}
              onMouseEnter={(e) =>
                openHoverCardForItem(
                  e.currentTarget,
                  itemKey,
                  cleanLabel,
                  isSpotify,
                  wins,
                  primaryWin.iconDataUrl
                )
              }
              onMouseLeave={scheduleHoverClose}
            >
              <button
                type="button"
                className="dock-close-badge"
                aria-label={`Close ${primaryWin.processName}`}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  wins.forEach((w) =>
                    invoke("window_action_cmd", { hwnd: w.hwnd, action: "close" })
                  );
                }}
              >
                <X size={9} strokeWidth={3} />
              </button>
              <button
                type="button"
                aria-label={`${primaryWin.title || "Window"}${primaryWin.isFocused ? " (focused)" : " (running)"}${dockBadgeLabel(unread, wins.length)}`}
                className={`dock-item ${primaryWin.isFocused ? "is-focused" : ""} ${launchingId === `win-${primaryWin.hwnd}` ? "is-launching" : ""} ${wins.some((w) => pulseHwnds.has(w.hwnd)) ? "is-pulse" : ""} ${showLabels && isBar ? "has-label" : ""}`}
                onClick={() => {
                  if (suppressClickRef.current) return;
                  setHoverCard(null);
                  triggerLaunchAnim(`win-${primaryWin.hwnd}`);
                  invoke("focus_window_cmd", { hwnd: primaryWin.hwnd });
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  if (e.altKey) {
                    magicOpenFor("dockItem", `win-${primaryWin.hwnd}`, primaryWin.title, primaryWin.exePath || null);
                    return;
                  }
                  const r = e.currentTarget.getBoundingClientRect();
                  openMenu({
                    kind: "app",
                    x: r.left + r.width / 2,
                    y: r.top,
                    title: primaryWin.title,
                    windows: wins,
                    launchPath: primaryWin.exePath,
                  });
                }}
                onAuxClick={(e) => {
                  if (e.button === 1 && config.func.middleClickNewInstance && primaryWin.exePath) {
                    invoke("launch_app_cmd", { path: primaryWin.exePath });
                  }
                }}
              >
                {primaryWin.iconDataUrl ? (
                  <img src={primaryWin.iconDataUrl} alt={primaryWin.processName} />
                ) : (
                  <AppWindow size={19} strokeWidth={1.8} />
                )}
                {unread > 0 ? (
                  <span className="dock-notif-badge" aria-hidden="true">
                    {unread > 99 ? "99+" : unread}
                  </span>
                ) : urgent && urgent.count > 1 ? (
                  <span className="dock-notif-badge dock-attention-badge" aria-hidden="true">{urgent.count > 99 ? "99+" : urgent.count}</span>
                ) : (
                  wins.length > 1 && <span className="dock-instance-badge" aria-hidden="true">{wins.length}</span>
                )}
                {showLabels && isBar && <span className="dock-label">{wins.length === 1 ? primaryWin.title : cleanLabel}</span>}
              </button>
              {showLabels && !isBar && <span className="dock-label">{cleanLabel}</span>}
              <span className={`dock-indicator ${primaryWin.isFocused ? "focused" : ""} ${urgent ? "attention" : ""}`} />
              {urgent && <span className="dock-attention-sr">{cleanLabel} needs your attention</span>}
            </div>
          );
        })}

        <div className="dock-divider" />

        {/* Live Computer Stats & Obsidian Task Manager Graph Icon (left of Settings gear!) */}
        <PluginSlot slot="dock" />

        <div className="dock-item-wrap">
          <span className="dock-tooltip">System Stats &amp; Task Manager</span>
          <button
            type="button"
            aria-label="System and tasks"
            className={`dock-item ${settingsOpen && activeSettingsTab === "monitor" ? "is-running" : ""} ${launchingId === "monitor" ? "is-launching" : ""}`}
            onClick={() => {
              triggerLaunchAnim("monitor");
              if (settingsOpen && activeSettingsTab === "monitor") {
                setSettingsOpen(false);
                invoke("toggle_settings_docked");
              } else {
                setSettingsOpen(true);
                setActiveSettingsTab("monitor");
                invoke("open_dock_popout_tab_cmd", { tab: "monitor" });
              }
            }}
          >
            <Activity size={19} strokeWidth={2.15} color="#34D399" />
          </button>
          {settingsOpen && activeSettingsTab === "monitor" && <span className="dock-indicator focused" />}
        </div>

        {/* Unified Dock-Wide Windows Settings & Lens Control Center Gear (way-right of Dock!) */}
        <div className="dock-item-wrap">
          <span className="dock-tooltip">Settings &amp; Control Center</span>
          <button
            type="button"
            aria-label="Settings"
            className={`dock-item ${settingsOpen && activeSettingsTab !== "monitor" ? "is-running" : ""} ${launchingId === "settings" ? "is-launching" : ""}`}
            onClick={() => {
              triggerLaunchAnim("settings");
              if (settingsOpen && activeSettingsTab !== "monitor") {
                setSettingsOpen(false);
                invoke("toggle_settings_docked");
              } else {
                setSettingsOpen(true);
                // The gear always opens on Quick settings, never on the page used last.
                setActiveSettingsTab("quick");
                invoke("open_dock_popout_tab_cmd", { tab: "quick" });
              }
            }}
          >
            <Settings size={19} strokeWidth={2.15} />
          </button>
          {settingsOpen && activeSettingsTab !== "monitor" && <span className="dock-indicator" />}
        </div>
        {systemInDock && !isBar && dockStyle !== "split" && (
          <>
            <div className="dock-divider" />
            <DockSystemArea
              trayHost={config.func.trayHost ?? false}
              unread={unreadTotal}
              vertical={isVertical}
              variant="inline"
            />
          </>
        )}
        </div>
        {musicMini === "dock" && (
          <MiniPlayer variant="dock" onOpen={() => invoke("open_surface", { label: "nowplaying" }).catch(() => {})} />
        )}
        {voiceDock.enabled && (
          <>
            <VoiceDockView
              style={(dockStyle === "islands" ? "floating" : dockStyle) as VoiceDockStyle}
              edge={edge as VoiceEdge}
              width={lockedDockWidth ?? pillRef.current?.getBoundingClientRect().width ?? 480}
              height={pillRef.current?.getBoundingClientRect().height ?? 56}
              morph={voiceDock.morph}
              levels={voiceDock.levels}
              reducedMotion={prefersReducedMotion()}
              onUndo={voiceDock.undo}
              onAnswer={voiceDock.answer}
            />
            <DockMicButton size={36} live={voiceDock.live} />
          </>
        )}
        {isBar && systemInDock && (
          <DockSystemArea
            trayHost={config.func.trayHost ?? false}
            unread={unreadTotal}
            vertical={isVertical}
            variant="bar"
          />
        )}
      </nav>
      {dockStyle === "split" && systemInDock && (
        <div
          ref={splitPillRef}
          className={`dock-split-pill ${!dockVisible ? "is-hidden" : ""}`}
          aria-label="System"
        >
          <DockSystemArea
            trayHost={config.func.trayHost ?? false}
            unread={unreadTotal}
            vertical={isVertical}
            variant="pill"
          />
        </div>
      )}
    </div>
  );
};
