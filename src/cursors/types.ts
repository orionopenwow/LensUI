// Shapes shared by the Cursor Suite card and the "cursorfx" overlay. They mirror the serde
// structs in src-tauri/src/win_cursors.rs and win_cursor_fx.rs (camelCase).

export type CursorFamily = "obsidian" | "accent" | "glass" | "dot" | "outline" | "retro";

export const CURSOR_FAMILIES: { id: CursorFamily; label: string; blurb: string }[] = [
  { id: "obsidian", label: "Obsidian", blurb: "Monochrome with a hairline rim" },
  { id: "accent", label: "Accent", blurb: "Filled with your theme accent" },
  { id: "glass", label: "Glass", blurb: "Frosted, with a soft shadow" },
  { id: "dot", label: "Minimal dot", blurb: "A dot for pointing, shapes for the rest" },
  { id: "outline", label: "Outline", blurb: "Bold strokes, light fill" },
  { id: "retro", label: "Retro pixel", blurb: "Hard-edged pixel art" },
];

export type CursorRoleName =
  | "Arrow" | "Help" | "AppStarting" | "Wait" | "Crosshair" | "IBeam" | "NWPen" | "No"
  | "SizeNS" | "SizeWE" | "SizeNWSE" | "SizeNESW" | "SizeAll" | "UpArrow" | "Hand" | "Pin" | "Person";

export const ALL_ROLES: CursorRoleName[] = [
  "Arrow", "Help", "AppStarting", "Wait", "Crosshair", "IBeam", "NWPen", "No",
  "SizeNS", "SizeWE", "SizeNWSE", "SizeNESW", "SizeAll", "UpArrow", "Hand", "Pin", "Person",
];

/** The roles shown on a family tile. */
export const TILE_ROLES: CursorRoleName[] = ["Arrow", "Hand", "IBeam", "Wait"];

export interface CursorStyle {
  family: CursorFamily;
  /** Dark body with a light rim (true) or light body with a dark rim (false). */
  dark: boolean;
  accent: string;
  highVisibility: boolean;
}

export interface CursorState {
  applied: boolean;
  style: CursorStyle;
  size: number;
  followTheme: boolean;
}

export interface PointerSettings {
  speed: number;
  enhancePrecision: boolean;
  swapButtons: boolean;
  doubleClickMs: number;
  clickLock: boolean;
  wheelLines: number;
  wheelChars: number;
  sonar: boolean;
  hideWhileTyping: boolean;
  snapToDefault: boolean;
  trails: number;
  focusFollowsMouse: boolean;
  focusDelayMs: number;
  focusRaise: boolean;
}

export interface CursorSuiteStatus {
  state: CursorState;
  hasCursorBackup: boolean;
  pointer: PointerSettings;
  hasPointerBackup: boolean;
  supportsBaseSize: boolean;
}

export interface CursorPreview {
  role: CursorRoleName;
  label: string;
  size: number;
  hotX: number;
  hotY: number;
  /** PNG data URLs: one for static roles, every frame for Wait / AppStarting. */
  frames: string[];
}

export interface FxSettings {
  ripples: boolean;
  glowTrail: boolean;
  cometTrail: boolean;
  spotlight: boolean;
  spotlightRadius: number;
  shakeToFind: boolean;
  keystrokes: boolean;
  keystrokesAll: boolean;
  /** "accent" or #rrggbb */
  color: string;
  pauseOnBattery: boolean;
  respectReducedMotion: boolean;
}

export const DEFAULT_FX: FxSettings = {
  ripples: false,
  glowTrail: false,
  cometTrail: false,
  spotlight: false,
  spotlightRadius: 160,
  shakeToFind: false,
  keystrokes: false,
  keystrokesAll: false,
  color: "accent",
  pauseOnBattery: true,
  respectReducedMotion: true,
};

export interface FxStatus {
  settings: FxSettings;
  /** "off" | "game" | "fullscreen" | "battery" | "reduced-motion" | "unsupported" | null (running) */
  paused: string | null;
  spotlightHotkey: string;
}

export type FxButton = "left" | "right" | "middle" | "x";

export interface FxFrame {
  monitor: { left: number; top: number; right: number; bottom: number };
  x: number;
  y: number;
  clicks: { button: FxButton; x: number; y: number }[];
  keys: string[];
  shake: boolean;
  spotlightToggle: boolean;
  wheel: number;
  paused: string | null;
  t: number;
}

export const PAUSE_LABELS: Record<string, string> = {
  off: "Off",
  game: "Paused for a game",
  fullscreen: "Paused for a fullscreen app",
  battery: "Paused on battery",
  "reduced-motion": "Paused: Windows animations are off",
  unsupported: "Windows only",
  starting: "Starting",
};
