// Lens setup (docs/SETUP.md): what the setup shows and what Finish writes. Pure, so it is
// unit-tested (src/__tests__/setupFlow.test.ts).
//
// Rules:
//   * It opens on the first launch and once for every new version (and when the launcher asks).
//   * Nothing changes while you look around. Previews are drawn from a draft; Finish writes only
//     the choices you made, through the one settings writer.
//   * Skip (any page, any time) writes only the "seen" markers, so it doesn't come back for this
//     version. Defaults stay: the floating Dock and the default theme.
import type { LensConfig, PinnedApp } from "../types/lens";
import { applyFeaturedLook, FEATURED_LOOKS } from "../themes/featured";
import { packById } from "../themes/packs";
import { DOCK_STYLES, withDock } from "../dock/styles";
import { WHATS_NEW, type WhatsNewRelease } from "./whatsNew";
import { withFlag } from "../magicwaves/flags";

export type SetupReason = "first" | "update" | "forced";

export interface SetupStatus {
  version: string;
  seenVersion: string;
  onboardingCompleted: boolean;
  forced: boolean;
}

/** Why the setup should open now, or null when it shouldn't. */
export function setupReason(status: SetupStatus | null): SetupReason | null {
  if (!status) return null;
  if (!status.onboardingCompleted) return "first";
  if (status.seenVersion !== status.version) return "update";
  if (status.forced) return "forced";
  return null;
}

/** Compares dotted versions numerically ("0.10.0" > "0.9.2"); "" is older than everything. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  const pb = b.split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d < 0 ? -1 : 1;
  }
  return 0;
}

/**
 * Changelog entries for every version newer than `seen`, up to and including `current`, newest
 * first (at most three). With no recorded version (a copy from before setup existed) it shows
 * only the running version.
 */
export function whatsNewSince(seen: string, current: string, releases: WhatsNewRelease[] = WHATS_NEW): WhatsNewRelease[] {
  return releases
    .filter((r) => compareVersions(r.version, current) <= 0 && (seen ? compareVersions(r.version, seen) > 0 : compareVersions(r.version, current) === 0))
    .sort((a, b) => compareVersions(b.version, a.version))
    .slice(0, 3);
}

// --- Optional extras ------------------------------------------------------------------------

export type ExtraId = "runOnStartup" | "hideNativeTaskbar" | "ambientBackdrop" | "livePreviews" | "tester";

export interface Extra {
  id: ExtraId;
  label: string;
  /** What it does. */
  desc: string;
  /** What it changes on Windows, said plainly ("" when it changes nothing outside Lens). */
  windows: string;
  /** First Lens version that offers it here; an update shows only extras newer than the last setup. */
  since: string;
  /** Where to find it later. */
  where: string;
}

export const EXTRAS: Extra[] = [
  {
    id: "runOnStartup",
    label: "Start Lens with Windows",
    desc: "Opens Lens when you sign in.",
    windows: "Adds one entry to your startup apps; turning it off removes it.",
    since: "0.3.0",
    where: "Settings › Windows & Keys › Windows integration",
  },
  {
    id: "hideNativeTaskbar",
    label: "Hide the Windows taskbar",
    desc: "Use the Lens Dock instead of the taskbar.",
    windows: "Hides the taskbar while Lens runs. It comes back when Lens closes, even after a crash.",
    since: "0.3.0",
    where: "Settings › Dock & Bar",
  },
  {
    id: "ambientBackdrop",
    label: "Animated backdrop",
    desc: "A very slow, faint motion behind your desktop icons in your theme's colours.",
    windows: "Your Windows wallpaper is never changed.",
    since: "0.3.0",
    where: "Settings › Appearance › Wallpaper",
  },
  {
    id: "tester",
    label: "Tester mode",
    desc: "Shows the build badge and a hotkey to mark a moment for a bug report.",
    windows: "",
    since: "0.3.0",
    where: "Settings › About & Testing › Tester Hub",
  },
];

/** Features you set up elsewhere; the setup only says where (each needs its own steps). */
export const FIND_LATER: { label: string; desc: string; where: string }[] = [
  {
    label: "Window styling in Windhawk",
    desc: "Lens colours and buttons on other apps' windows. Skips every game on Lens's anti-cheat list; leave it off if you play online games with anti-cheat.",
    where: "Settings › Windows & Keys › Window styling",
  },
  {
    label: "Voice transcription",
    desc: "Off until its downloads are pinned to checked versions.",
    where: "Settings › AI & Command",
  },
];

/** Whether an extra is already on in this config (on extras are not offered again). */
export function extraIsOn(config: LensConfig, id: ExtraId): boolean {
  switch (id) {
    case "runOnStartup":
      return !!config.func.runOnStartup;
    case "hideNativeTaskbar":
      return !!config.func.hideNativeTaskbar;
    case "livePreviews":
      return !!config.dock.livePreviews;
    case "tester":
      return !!config.tester?.enabled;
    case "ambientBackdrop":
      return false;
  }
}

/** Extras to offer: all of them on a first launch; after an update, only the ones added since. */
export function extrasFor(reason: SetupReason, seenVersion: string, config: LensConfig, extras: Extra[] = EXTRAS): Extra[] {
  return extras.filter(
    (e) => !extraIsOn(config, e.id) && (reason !== "update" || !seenVersion || compareVersions(e.since, seenVersion) > 0),
  );
}

// --- Choices and Finish ---------------------------------------------------------------------

export type ColourScheme = "dark" | "light" | "auto";

export interface SetupChoices {
  /** Dock style id; undefined = keep. */
  dockStyle?: string;
  /** Screen edge; undefined = keep. */
  dockEdge?: "bottom" | "top" | "left" | "right";
  /** Featured look id; undefined = keep. */
  look?: string;
  /** "auto" switches between a light and a dark look by time of day. */
  scheme?: ColourScheme;
  /** Custom accent "#rrggbb", or "windows" to follow Windows; undefined = keep. */
  accent?: string;
  extras: Partial<Record<ExtraId, boolean>>;
  /** Lens's own apps to pin to the Dock (src/coreapps/registry.ts pinEntry); ones already pinned are skipped. */
  pins?: PinnedApp[];
  /** Put a Lens Apps button on the Dock (STORE_PIN). */
  pinStore?: boolean;
  /** Turn on desktop widgets (magicWaves.desktopWidgets); undefined = keep. */
  widgets?: boolean;
}

/** The Dock pin that opens Lens Apps (launch_app_cmd knows "lens-surface:apps"). */
export const STORE_PIN: PinnedApp = { id: "lens-apps", name: "Lens Apps", path: "lens-surface:apps", iconHint: null };

export const NO_CHOICES: SetupChoices = { extras: {} };

export const DEFAULT_LIGHT_LOOK = "alabaster-daylight";
export const DEFAULT_DARK_LOOK = "obsidian";

export const isLightLook = (id: string): boolean => packById(id)?.scheme === "light";

/** Featured looks for a scheme ("auto" shows all of them). */
export function looksFor(scheme: ColourScheme): typeof FEATURED_LOOKS {
  if (scheme === "auto") return FEATURED_LOOKS;
  return FEATURED_LOOKS.filter((l) => isLightLook(l.id) === (scheme === "light"));
}

/** Marks this version's setup as seen. Nothing else changes. */
export function markSeen(config: LensConfig, version: string): LensConfig {
  return { ...config, onboardingCompleted: true, setupSeenVersion: version };
}

/**
 * The config Finish writes: `base` with only the chosen parts changed, then marked seen.
 * The Dock choice wins over a look's own Dock style, and a look never changes the Dock unless
 * the person picked one, so the floating Dock stays the default experience.
 */
export function applyChoices(base: LensConfig, choices: SetupChoices, version: string): LensConfig {
  let next = base;
  if (choices.look) {
    const looked = applyFeaturedLook(next, choices.look);
    next = { ...looked, dock: { ...looked.dock, style: base.dock.style, magnification: base.dock.magnification, launchAnimation: base.dock.launchAnimation } };
    if (choices.scheme === "auto") {
      const light = isLightLook(choices.look) ? choices.look : DEFAULT_LIGHT_LOOK;
      const dark = isLightLook(choices.look) ? DEFAULT_DARK_LOOK : choices.look;
      next = {
        ...next,
        themeSchedule: {
          enabled: true,
          mode: "fixed",
          dayPack: light,
          nightPack: dark,
          dayStart: "07:00",
          nightStart: "19:00",
          latitude: base.themeSchedule?.latitude ?? 0,
          longitude: base.themeSchedule?.longitude ?? 0,
        },
      };
    }
  }
  if (choices.accent) {
    next =
      choices.accent === "windows"
        ? { ...next, theme: { ...next.theme, accentMode: "windows" } }
        : { ...next, theme: { ...next.theme, accentMode: "custom", customAccent: choices.accent } };
  }
  if (choices.dockStyle) {
    const info = DOCK_STYLES.find((d) => d.id === choices.dockStyle);
    next = withDock({ ...next, dock: { ...next.dock, iconSize: info?.recommendedIconSize ?? next.dock.iconSize } }, { style: choices.dockStyle });
  }
  if (choices.dockEdge) next = { ...next, dock: { ...next.dock, position: choices.dockEdge } };
  const x = choices.extras;
  if (x.runOnStartup !== undefined) next = { ...next, func: { ...next.func, runOnStartup: x.runOnStartup } };
  if (x.hideNativeTaskbar !== undefined) next = { ...next, func: { ...next.func, hideNativeTaskbar: x.hideNativeTaskbar } };
  if (x.livePreviews !== undefined) next = { ...next, dock: { ...next.dock, livePreviews: x.livePreviews } };
  if (x.tester !== undefined) next = { ...next, tester: { ...next.tester, enabled: x.tester } };
  const have = new Set((next.dock.pinnedApps ?? []).map((p) => p.path));
  const wanted = [...(choices.pinStore ? [STORE_PIN] : []), ...(choices.pins ?? [])];
  const add = wanted.filter((p) => !have.has(p.path) && (have.add(p.path), true));
  if (add.length) next = { ...next, dock: { ...next.dock, pinnedApps: [...(next.dock.pinnedApps ?? []), ...add] } };
  if (choices.widgets !== undefined) next = withFlag(next, "desktopWidgets", choices.widgets);
  return markSeen(next, version);
}

/** One line per change Finish makes, for the Done page. */
export function describeChoices(choices: SetupChoices, lookLabel: (id: string) => string, dockLabel: (id: string) => string): string[] {
  const out: string[] = [];
  if (choices.look) out.push(`Theme: ${lookLabel(choices.look)}${choices.scheme === "auto" ? " (light by day, dark at night)" : ""}`);
  if (choices.accent) out.push(`Accent: ${choices.accent === "windows" ? "follows Windows" : choices.accent}`);
  if (choices.dockStyle) out.push(`Dock: ${dockLabel(choices.dockStyle)}`);
  if (choices.dockEdge) out.push(`Dock edge: ${choices.dockEdge}`);
  for (const e of EXTRAS) {
    const v = choices.extras[e.id];
    if (v !== undefined) out.push(`${e.label}: ${v ? "on" : "off"}`);
  }
  if (choices.pinStore) out.push("Lens Apps on the Dock: on");
  if (choices.widgets !== undefined) out.push(`Desktop widgets: ${choices.widgets ? "on" : "off"}`);
  if (choices.pins?.length) out.push(`Pin to the Dock: ${choices.pins.map((p) => p.name).join(", ")}`);
  return out;
}


// ── Starting from the person's own desktop ─────────────────────────────────────────────────────
// First-run setup opens already looking like the person's Windows: light or dark as Windows is,
// the accent from the wallpaper (or Windows' own accent when the wallpaper has no clear colour),
// and the featured look closest to it pre-selected. It is only a starting point in the draft:
// every option is still shown, and nothing is written until Finish. The wallpaper is read and
// measured on this PC only (snapshot_windows_wallpaper_cmd + accentFromImage); nothing leaves it.

export interface DesktopColours {
  /** Windows' accent, "#rrggbb". */
  windowsAccent: string;
  /** The wallpaper's most prominent colour as a UI accent, or null (no clear colour / unreadable). */
  wallpaperAccent: string | null;
  /** Windows' app mode is light. */
  lightApps: boolean;
}

export interface DesktopSuggestion {
  scheme: ColourScheme;
  look: string;
  /** The accent to start from: the wallpaper's, else "windows" (follow Windows). */
  accent: string;
}

function hexRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Hue (0–360) and saturation (0–1) of a colour. */
export function hueSat(hex: string): { h: number; s: number } | null {
  const c = hexRgb(hex);
  if (!c) return null;
  const [r, g, b] = c.map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d !== 0) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  return { h: (h + 360) % 360, s };
}

/**
 * The featured look and accent to start setup from. The look is the one of the person's scheme
 * whose own accent is nearest in hue to the desktop's colour; a grey desktop colour picks the
 * scheme's default look (Obsidian / Alabaster Daylight).
 */
export function suggestFromDesktop(d: DesktopColours, looks: { id: string; accent: string }[]): DesktopSuggestion {
  const scheme: ColourScheme = d.lightApps ? "light" : "dark";
  const accent = d.wallpaperAccent ?? "windows";
  const target = hueSat(d.wallpaperAccent ?? d.windowsAccent);
  const fallback = scheme === "light" ? DEFAULT_LIGHT_LOOK : DEFAULT_DARK_LOOK;
  const pool = looks.filter((l) => (scheme === "light") === isLightLook(l.id));
  if (!target || target.s < 0.18 || !pool.length) return { scheme, look: fallback, accent };
  let best = fallback;
  let bestD = Infinity;
  for (const l of pool) {
    const hs = hueSat(l.accent);
    if (!hs || hs.s < 0.18) continue;
    const dh = Math.min(Math.abs(hs.h - target.h), 360 - Math.abs(hs.h - target.h));
    if (dh < bestD) {
      bestD = dh;
      best = l.id;
    }
  }
  // Only take a coloured look when it is really close; otherwise the scheme's neutral default
  // with the desktop's accent on it is the better match.
  return { scheme, look: bestD <= 40 ? best : fallback, accent };
}
