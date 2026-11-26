// Lens setup (docs/SETUP.md): what the setup shows and what Finish writes. Pure, so it is
// unit-tested (src/__tests__/setupFlow.test.ts).
//
// Rules:
//   * It opens on the first launch and once for every new version (and when the launcher asks).
//   * Nothing changes while you look around. Previews are drawn from a draft; Finish writes only
//     the choices you made, through the one settings writer.
//   * Skip (any page, any time) writes only the "seen" markers, so it doesn't come back for this
//     version. Defaults stay: the floating Dock and the default theme.
import type { LensConfig } from "../types/lens";
import { applyFeaturedLook, FEATURED_LOOKS } from "../themes/featured";
import { packById } from "../themes/packs";
import { DOCK_STYLES, withDock } from "../dock/styles";
import { WHATS_NEW, type WhatsNewRelease } from "./whatsNew";

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
}

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
  return out;
}
