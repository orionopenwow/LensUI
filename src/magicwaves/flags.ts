// Feature flags for the Magic waves (docs/plans/MAGIC_WAVES.md). Every flag is off by default;
// while a flag is off its feature shows nothing, starts nothing and fetches nothing.
// Stored in config.magicWaves (src-tauri/src/config.rs `MagicWavesConfig`).
import type { MagicWavesConfig } from "../types/generated";

export type MagicFlag = "dashboard" | "widgets" | "desktopWidgets" | "widgetFlyout" | "mouse" | "startButton" | "shelfNotes" | "studioV2" | "learn";

export const MAGIC_FLAGS: readonly MagicFlag[] = ["dashboard", "widgets", "desktopWidgets", "widgetFlyout", "mouse", "startButton", "shelfNotes", "studioV2", "learn"];

export const MAGIC_DEFAULTS: MagicWavesConfig = {
  dashboard: false,
  widgets: false,
  mouse: false,
  mouseHoldMs: 400,
  startButton: false,
  shelfNotes: false,
  studioV2: false,
  learn: false,
  desktopWidgets: false,
  widgetFlyout: false,
};

/** Plain names for each flag, used by the preview section and the hyper-suite inventory. */
export const MAGIC_LABELS: Record<MagicFlag, { label: string; desc: string }> = {
  dashboard: { label: "Magic Dashboard", desc: "Inbox, feeds, today, Shelf and widgets in one place. Opens from the Top Bar and Command." },
  widgets: { label: "Dashboard widgets", desc: "Small widgets on the Dashboard. Lens fetches only the sources you approve." },
  desktopWidgets: { label: "Desktop widgets", desc: "Widgets on your desktop, below your windows: clock, today, notes, music, battery. Uses only what's on this PC." },
  widgetFlyout: { label: "Widget flyout", desc: "Your widgets wait out of sight. Alt+W, the Widgets hot corner or Command \"widgets\" flies them out over your desktop; Esc or a click on the desktop puts them away. The Calendar sits top-left." },
  mouse: { label: "Magic Mouse", desc: "The Lens pointer. Hold the left button, then drag, to grab part of the screen." },
  startButton: { label: "Magic button", desc: "A Windows-key tap opens Lens Magic Start. Ctrl+Esc still opens Windows Start." },
  shelfNotes: { label: "Shelf to Notes", desc: "Turn what's on the Shelf into a note you can export." },
  studioV2: { label: "Lens Studio v2", desc: "Build docks, themes and desktops with live preview and undo." },
  learn: { label: "Learned ordering", desc: "The Dashboard puts what you use first, on this PC only, and says why." },
};

/** Reads the flags from a config, filling anything missing with the defaults (all off). */
export function magicFlags(config: { magicWaves?: Partial<MagicWavesConfig> | null } | null | undefined): MagicWavesConfig {
  const raw = config?.magicWaves ?? {};
  const out: MagicWavesConfig = { ...MAGIC_DEFAULTS };
  for (const f of MAGIC_FLAGS) if (typeof raw[f] === "boolean") out[f] = raw[f] as boolean;
  const hold = raw.mouseHoldMs;
  if (typeof hold === "number" && Number.isFinite(hold)) out.mouseHoldMs = Math.min(1200, Math.max(200, Math.round(hold)));
  return out;
}

export function isOn(config: Parameters<typeof magicFlags>[0], flag: MagicFlag): boolean {
  return magicFlags(config)[flag];
}

export function anyOn(config: Parameters<typeof magicFlags>[0]): boolean {
  const f = magicFlags(config);
  return MAGIC_FLAGS.some((k) => f[k]);
}

/** A config with one flag changed; everything else (including other flags) untouched. */
export function withFlag<T extends { magicWaves?: Partial<MagicWavesConfig> | null }>(config: T, flag: MagicFlag, on: boolean): T {
  return { ...config, magicWaves: { ...magicFlags(config), [flag]: on } };
}
