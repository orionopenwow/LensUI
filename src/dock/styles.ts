/**
 * Dock styles: one setting (`dock.style`) that changes the Dock's shape while keeping the same
 * click physics, search, context menus and auto-hide. The Control Center picker reads
 * `DOCK_STYLES` and draws a `DockStylePreview` for each entry.
 */

export type DockStyleId = "floating" | "slim" | "taskbar" | "studio" | "minimal" | "split";
export type DockAlignment = "center" | "left";
export type DockSystemAreaMode = "auto" | "dock" | "topbar";

export interface DockStyleInfo {
  id: DockStyleId;
  label: string;
  description: string;
  /** Icon size (px at 100% UI scale) the style is designed around. */
  recommendedIconSize: number;
  /** True when the Dock spans the whole monitor edge (full width, or full height on left/right). */
  fullWidth: boolean;
  /** True when `systemArea: "auto"` puts the clock and system icons in the Dock for this style. */
  systemInDockByDefault: boolean;
}

export const DOCK_STYLES: readonly DockStyleInfo[] = [
  {
    id: "floating",
    label: "Floating",
    description: "The centred Lens Dock. Grounded to the edge, full-size icons.",
    recommendedIconSize: 40,
    fullWidth: false,
    systemInDockByDefault: false,
  },
  {
    id: "slim",
    label: "Slim",
    description: "A thinner centred Dock with smaller icons and tighter spacing.",
    recommendedIconSize: 32,
    fullWidth: false,
    systemInDockByDefault: false,
  },
  {
    id: "taskbar",
    label: "Taskbar",
    description: "Full-width bar with centred apps, Launcher first, and the clock and system icons on the right.",
    recommendedIconSize: 36,
    fullWidth: true,
    systemInDockByDefault: true,
  },
  {
    id: "studio",
    label: "Studio",
    description: "Full-width bar with apps on the left and the clock and system icons on the right.",
    recommendedIconSize: 36,
    fullWidth: true,
    systemInDockByDefault: true,
  },
  {
    id: "minimal",
    label: "Minimal",
    description: "Just the icons. The Dock background appears only while you point at it.",
    recommendedIconSize: 40,
    fullWidth: false,
    systemInDockByDefault: false,
  },
  {
    id: "split",
    label: "Split",
    description: "Centred app Dock plus a small separate pill on the right for Quick Settings, clock and notifications.",
    recommendedIconSize: 40,
    fullWidth: false,
    systemInDockByDefault: true,
  },
] as const;

const STYLE_IDS = new Set<string>(DOCK_STYLES.map((s) => s.id));

export function normalizeDockStyle(raw?: string | null): DockStyleId {
  return raw && STYLE_IDS.has(raw) ? (raw as DockStyleId) : "floating";
}

export function dockStyleInfo(raw?: string | null): DockStyleInfo {
  const id = normalizeDockStyle(raw);
  return DOCK_STYLES.find((s) => s.id === id) ?? DOCK_STYLES[0];
}

/** Studio is always left-aligned; Taskbar follows `dock.alignment`; other styles are centred. */
export function resolveDockAlignment(style: DockStyleId, raw?: string | null): DockAlignment {
  if (style === "studio") return "left";
  if (style === "taskbar") return raw === "left" ? "left" : "center";
  return "center";
}

interface DockLike {
  style?: string;
  systemArea?: string;
  showTopBar?: boolean;
}

/**
 * Where the clock and system icons live, so they are never shown twice.
 * "auto" = in the Dock for Taskbar, Studio and Split; in the Top Bar otherwise.
 * If the Top Bar is turned off, the system icons fall back into the Dock for any style
 * that has a place for them (so they never disappear entirely).
 */
export function resolveSystemArea(dock?: DockLike | null): "dock" | "topbar" {
  const style = normalizeDockStyle(dock?.style);
  const info = dockStyleInfo(style);
  const mode = dock?.systemArea;
  if (mode === "dock") return "dock";
  if (mode === "topbar") return dock?.showTopBar === false && info.systemInDockByDefault ? "dock" : "topbar";
  if (info.systemInDockByDefault) return "dock";
  return "topbar";
}

/** Icon size actually used: Slim caps at 32 px, the full-width bars at 36 px. */
export function dockStyleIconSize(style: DockStyleId, configured: number): number {
  if (style === "slim") return Math.min(configured, 32);
  if (style === "taskbar" || style === "studio") return Math.min(configured, 36);
  return configured;
}

interface DockSizeLike {
  iconSize: number;
  iconSizes?: Record<string, number>;
}

/** Icon size for a style: the user's per-style size if set, else the style's own cap. */
export function resolveDockIconSize(dock: DockSizeLike, style: DockStyleId): number {
  const custom = dock.iconSizes?.[style];
  if (typeof custom === "number" && custom >= 16 && custom <= 96) return Math.round(custom);
  return dockStyleIconSize(style, dock.iconSize);
}

export type DockMagnification = "off" | "subtle" | "classic";
export type DockLaunchAnimation = "none" | "lift" | "bounce" | "jelly";

export const DOCK_MAGNIFICATION: readonly { id: DockMagnification; label: string; description: string; scale: number }[] = [
  { id: "off", label: "Off", description: "Today's gentle hover lift.", scale: 1 },
  { id: "subtle", label: "Subtle", description: "Icons near the pointer grow a little.", scale: 1.22 },
  { id: "classic", label: "Classic", description: "Strong wave of growing icons, like macOS.", scale: 1.6 },
];

export const DOCK_LAUNCH_ANIMATIONS: readonly { id: DockLaunchAnimation; label: string; description: string; durationMs: number }[] = [
  { id: "none", label: "None", description: "No animation on click.", durationMs: 0 },
  { id: "lift", label: "Lift", description: "A quick press and lift (default).", durationMs: 190 },
  { id: "bounce", label: "Bounce", description: "The icon hops while the app opens.", durationMs: 720 },
  { id: "jelly", label: "Jelly", description: "A soft squash-and-stretch.", durationMs: 560 },
];

export function normalizeMagnification(raw?: string | null): DockMagnification {
  return raw === "subtle" || raw === "classic" ? raw : "off";
}

export function normalizeLaunchAnimation(raw?: string | null): DockLaunchAnimation {
  return raw === "none" || raw === "bounce" || raw === "jelly" ? raw : "lift";
}

export function clampMagnificationRange(raw?: number | null): number {
  const n = typeof raw === "number" && Number.isFinite(raw) ? Math.round(raw) : 2;
  return Math.max(1, Math.min(4, n));
}

/** Every Dock behaviour option, for the Control Center picker. Paths are config paths. */
export const DOCK_OPTIONS: readonly {
  path: string;
  label: string;
  kind: "choice" | "toggle" | "range" | "per-style-size";
  defaultValue: unknown;
  description: string;
}[] = [
  { path: "dock.style", label: "Dock style", kind: "choice", defaultValue: "floating", description: "Shape of the Dock (see DOCK_STYLES)." },
  { path: "dock.alignment", label: "Taskbar icons", kind: "choice", defaultValue: "center", description: "Centre or left-align apps on the Taskbar style." },
  { path: "dock.systemArea", label: "Clock & system icons", kind: "choice", defaultValue: "auto", description: "In the Dock, in the Top Bar, or automatic per style." },
  { path: "dock.magnification", label: "Magnification", kind: "choice", defaultValue: "off", description: "Off, subtle or classic icon growth under the pointer." },
  { path: "dock.magnificationRange", label: "Magnification reach", kind: "range", defaultValue: 2, description: "Neighbouring icons each side that grow (1-4)." },
  { path: "dock.launchAnimation", label: "Launch animation", kind: "choice", defaultValue: "lift", description: "None, lift, bounce or jelly." },
  { path: "dock.minimizeFeedback", label: "Minimise pulse", kind: "toggle", defaultValue: false, description: "Pulse an icon when its window is minimised or restored." },
  { path: "dock.iconSizes", label: "Icon size per style", kind: "per-style-size", defaultValue: {}, description: "Remember a separate icon size for each style." },
  { path: "dock.showLabels", label: "Show app names", kind: "toggle", defaultValue: false, description: "Names beside icons on Taskbar/Studio (never combine), under icons elsewhere." },
  { path: "dock.fileDropOpen", label: "Drop files on apps", kind: "toggle", defaultValue: false, description: "Drop files on a Dock app to open them with it." },
  { path: "func.middleClickNewInstance", label: "Middle-click opens a new window", kind: "toggle", defaultValue: true, description: "Middle-click an app to start another instance." },
  { path: "dock.scrollCyclesWindows", label: "Scroll to switch windows", kind: "toggle", defaultValue: false, description: "Mouse wheel over an app cycles through its windows." },
];

export { DockStylePreview } from "./DockStylePreview";

// ---- Config helpers shared by the Theme & Look tab, the Dock tab and the setup wizard ----

type DockConfigLike = { dock: { style?: string; alignment?: string; systemArea?: string } };

export function dockStyleOf(config: DockConfigLike): DockStyleId {
  return normalizeDockStyle(config.dock?.style);
}
export function dockAlignmentOf(config: DockConfigLike): DockAlignment {
  return config.dock?.alignment === "left" ? "left" : "center";
}
export function dockSystemAreaOf(config: DockConfigLike): DockSystemAreaMode {
  const v = config.dock?.systemArea;
  return v === "dock" || v === "topbar" ? v : "auto";
}
/** Returns a new config with the given Dock style fields set. */
export function withDock<T extends DockConfigLike>(
  config: T,
  patch: { style?: DockStyleId | string; alignment?: DockAlignment | string; systemArea?: DockSystemAreaMode | string },
): T {
  return { ...config, dock: { ...config.dock, ...patch } };
}
export function dockStyleLabel(id: string | undefined | null): string {
  return dockStyleInfo(id).label;
}
export { DockScenePreview } from "./DockScenePreview";
