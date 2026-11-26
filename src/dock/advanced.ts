// Dock & Bar › Advanced: the Dock settings that worked but had no row in Settings
// (docs/features/dock.md quick win 1). Pure helpers, so every row is unit-tested without React:
// what a row shows for a given config, and the exact config change a click makes.
import type { LensConfig } from "../types/lens";
import {
  DOCK_LAUNCH_ANIMATIONS,
  DOCK_MAGNIFICATION,
  DOCK_STYLES,
  clampMagnificationRange,
  dockStyleIconSize,
  normalizeDockStyle,
  normalizeLaunchAnimation,
  normalizeMagnification,
  resolveDockIconSize,
  type DockLaunchAnimation,
  type DockMagnification,
  type DockStyleId,
} from "./styles";

type Dock = LensConfig["dock"];

/** Smallest and largest icon size a person can set for one style (px). */
export const STYLE_ICON_MIN = 24;
export const STYLE_ICON_MAX = 64;

/** What the Advanced section shows, read from a config with every missing value defaulted. */
export interface DockAdvancedView {
  magnification: DockMagnification;
  magnificationRange: number;
  launchAnimation: DockLaunchAnimation;
  minimizeFeedback: boolean;
  showLabels: boolean;
  scrollCyclesWindows: boolean;
  fileDropOpen: boolean;
  middleClickNewInstance: boolean;
  autoClosePopouts: boolean;
  /** How long pop-outs wait before closing (`func.popoutCloseDelay`). */
  popoutCloseDelay: PopoutCloseDelay;
  /** The style in use, its icon size right now, and whether that is the person's own size. */
  style: DockStyleId;
  styleIconSize: number;
  styleIconSizeIsCustom: boolean;
  /** Styles that have their own size, with it, in the picker's order. */
  customSizes: { style: DockStyleId; label: string; size: number }[];
  /** Pinned apps in Dock order, each with whether a divider follows it. */
  separators: { id: string; name: string; on: boolean }[];
}

const validSize = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n >= 16 && n <= 96;

export function dockAdvancedView(config: LensConfig): DockAdvancedView {
  const dock = config.dock;
  const style = normalizeDockStyle(dock.style);
  const sizes = dock.iconSizes ?? {};
  const after = new Set(dock.separatorsAfter ?? []);
  return {
    magnification: normalizeMagnification(dock.magnification),
    magnificationRange: clampMagnificationRange(dock.magnificationRange),
    launchAnimation: normalizeLaunchAnimation(dock.launchAnimation),
    minimizeFeedback: dock.minimizeFeedback === true,
    showLabels: dock.showLabels === true,
    scrollCyclesWindows: dock.scrollCyclesWindows === true,
    fileDropOpen: dock.fileDropOpen === true,
    middleClickNewInstance: config.func.middleClickNewInstance !== false,
    // On unless turned off: the same default Lens uses (FuncConfig.auto_close_popouts).
    autoClosePopouts: config.func.autoClosePopouts !== false,
    popoutCloseDelay: normalizePopoutCloseDelay(config.func.popoutCloseDelay),
    style,
    styleIconSize: resolveDockIconSize(dock, style),
    styleIconSizeIsCustom: validSize(sizes[style]),
    customSizes: DOCK_STYLES.filter((s) => validSize(sizes[s.id])).map((s) => ({ style: s.id, label: s.label, size: Math.round(sizes[s.id]) })),
    separators: (dock.pinnedApps ?? []).map((app) => ({ id: app.id, name: app.name, on: after.has(app.id) })),
  };
}

const withDockPatch = (config: LensConfig, patch: Partial<Dock>): LensConfig => ({ ...config, dock: { ...config.dock, ...patch } });
const withFuncPatch = (config: LensConfig, patch: Partial<LensConfig["func"]>): LensConfig => ({ ...config, func: { ...config.func, ...patch } });

export const setMagnification = (config: LensConfig, id: string): LensConfig => withDockPatch(config, { magnification: normalizeMagnification(id) });
export const setMagnificationRange = (config: LensConfig, n: number): LensConfig => withDockPatch(config, { magnificationRange: clampMagnificationRange(n) });
export const setLaunchAnimation = (config: LensConfig, id: string): LensConfig => withDockPatch(config, { launchAnimation: normalizeLaunchAnimation(id) });
export const setMinimizeFeedback = (config: LensConfig, on: boolean): LensConfig => withDockPatch(config, { minimizeFeedback: on });
export const setShowLabels = (config: LensConfig, on: boolean): LensConfig => withDockPatch(config, { showLabels: on });
export const setScrollCyclesWindows = (config: LensConfig, on: boolean): LensConfig => withDockPatch(config, { scrollCyclesWindows: on });
export const setFileDropOpen = (config: LensConfig, on: boolean): LensConfig => withDockPatch(config, { fileDropOpen: on });
export const setMiddleClickNewInstance = (config: LensConfig, on: boolean): LensConfig => withFuncPatch(config, { middleClickNewInstance: on });
export const setAutoClosePopouts = (config: LensConfig, on: boolean): LensConfig => withFuncPatch(config, { autoClosePopouts: on });
export const setPopoutCloseDelay = (config: LensConfig, id: string): LensConfig => withFuncPatch(config, { popoutCloseDelay: normalizePopoutCloseDelay(id) });

/**
 * How long a pop-out (Quick Settings, Settings on the Dock) waits with the pointer away before it
 * closes. Mirrors `app::watcher::popout_delays` in Lens Core; "normal" is the original timing.
 */
export const POPOUT_CLOSE_DELAYS = [
  { id: "short", label: "Short", quickSettingsMs: 800, settingsMs: 1000 },
  { id: "normal", label: "Normal", quickSettingsMs: 1500, settingsMs: 1800 },
  { id: "long", label: "Long", quickSettingsMs: 3000, settingsMs: 3600 },
] as const;
export type PopoutCloseDelay = (typeof POPOUT_CLOSE_DELAYS)[number]["id"];
export const POPOUT_DELAY_CHOICES = POPOUT_CLOSE_DELAYS.map((d) => ({ id: d.id, label: d.label }));
export function normalizePopoutCloseDelay(id: unknown): PopoutCloseDelay {
  return POPOUT_CLOSE_DELAYS.some((d) => d.id === id) ? (id as PopoutCloseDelay) : "normal";
}

/**
 * Gives one Dock style its own icon size, or (with `null`) hands it back to the shared size.
 * Only that style's entry changes; the shared `dock.iconSize` and other styles are untouched.
 */
export function setStyleIconSize(config: LensConfig, style: string, size: number | null): LensConfig {
  const id = normalizeDockStyle(style);
  const sizes = { ...(config.dock.iconSizes ?? {}) };
  if (size === null || !Number.isFinite(size)) delete sizes[id];
  else sizes[id] = Math.round(Math.min(STYLE_ICON_MAX, Math.max(STYLE_ICON_MIN, size)));
  return withDockPatch(config, { iconSizes: sizes });
}

/** The size a style falls back to when it has none of its own. */
export function sharedStyleIconSize(config: LensConfig, style: string): number {
  return dockStyleIconSize(normalizeDockStyle(style), config.dock.iconSize);
}

/**
 * Adds or removes the divider after one pinned app. Ids of apps that are no longer pinned are
 * dropped on the way, and the list keeps Dock order, so it never grows stale entries.
 */
export function toggleSeparatorAfter(config: LensConfig, appId: string): LensConfig {
  const pinned = (config.dock.pinnedApps ?? []).map((a) => a.id);
  if (!pinned.includes(appId)) return config;
  const current = new Set(config.dock.separatorsAfter ?? []);
  if (current.has(appId)) current.delete(appId);
  else current.add(appId);
  return withDockPatch(config, { separatorsAfter: pinned.filter((id) => current.has(id)) });
}

export const clearSeparators = (config: LensConfig): LensConfig => ((config.dock.separatorsAfter ?? []).length ? withDockPatch(config, { separatorsAfter: [] }) : config);

/** Every setting the Advanced section writes, for the tests and the settings search keywords. */
export const DOCK_ADVANCED_PATHS = [
  "dock.magnification",
  "dock.magnificationRange",
  "dock.launchAnimation",
  "dock.minimizeFeedback",
  "dock.showLabels",
  "dock.scrollCyclesWindows",
  "dock.fileDropOpen",
  "dock.iconSizes",
  "dock.separatorsAfter",
  "func.middleClickNewInstance",
  "func.autoClosePopouts",
  "func.popoutCloseDelay",
] as const;

export const MAGNIFICATION_CHOICES = DOCK_MAGNIFICATION.map((m) => ({ id: m.id, label: m.label }));
export const LAUNCH_CHOICES = DOCK_LAUNCH_ANIMATIONS.map((a) => ({ id: a.id, label: a.label }));

/** One line under the section title: what is switched on, so the collapsed section still tells you. */
export function dockAdvancedSummary(view: DockAdvancedView): string {
  const on: string[] = [];
  if (view.magnification !== "off") on.push(`${view.magnification === "classic" ? "Classic" : "Subtle"} magnification`);
  if (view.launchAnimation !== "lift") on.push(`${LAUNCH_CHOICES.find((c) => c.id === view.launchAnimation)?.label ?? ""} launch`.trim());
  if (view.showLabels) on.push("App names");
  if (view.scrollCyclesWindows) on.push("Scroll to switch");
  if (view.fileDropOpen) on.push("Drop files");
  if (view.customSizes.length) on.push(view.customSizes.length === 1 ? "1 style size" : `${view.customSizes.length} style sizes`);
  const dividers = view.separators.filter((s) => s.on).length;
  if (dividers) on.push(dividers === 1 ? "1 divider" : `${dividers} dividers`);
  return on.length ? on.slice(0, 3).join(" · ") + (on.length > 3 ? ` · +${on.length - 3}` : "") : "Magnification, launch animation, app names, dividers";
}
