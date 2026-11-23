// "Lens at work" types — mirror src-tauri/src/presence/mod.rs (camelCase over the wire).
// Docs: docs/PRESENCE.md.

export type PresenceMode = "full" | "subtle" | "off";
export type Visual = "none" | "subtle" | "full";
export type StepKind = "travel" | "click" | "type" | "window" | "setting" | "wait" | "done" | "error";

/** Who is acting. Outside apps (claude-desktop, claude-code, other) are always shown. */
export interface Actor {
  kind: string;
  label: string;
}

/** Logical px, relative to the overlay's monitor (overlay CSS px). */
export interface LRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Monitor {
  rect: PRect;
  work: PRect;
  scale: number;
}

/** "lens://presence/step" */
export interface PresenceEvent {
  run: number;
  seq: number;
  actor: Actor;
  external: boolean;
  visual: Visual;
  travel: boolean;
  catchUp: boolean;
  kind: StepKind;
  target: LRect | null;
  dest: LRect | null;
  monitor: Monitor | null;
  caption: string;
  /** Already masked by the backend. */
  text: string | null;
  index: number;
  total: number | null;
  settings: string[];
  durationMs: number;
  captions: boolean;
}

/** "lens://presence/banner" */
export interface BannerEvent {
  actor?: Actor;
  active: boolean;
  caption?: string;
}

/** "lens://presence/ui" — a setting changed by Lens/Claude; the in-app twin points at it. */
export interface UiEvent {
  actor: Actor;
  settings: string[];
  label: string;
  tool?: string;
}

export interface PresenceConfig {
  mode: PresenceMode;
  externalAlways: boolean;
  pauseHotkey: string;
  captions: boolean;
}

export interface PresenceStatus {
  config: PresenceConfig;
  hotkeyOk: boolean;
  active: string[];
}

/** What a step may carry from a Lens window (presence_announce). */
export interface StepInput {
  kind: StepKind;
  label: string;
  text?: string;
  secret?: boolean;
  index?: number;
  total?: number;
  settings?: string[];
}

export const EVT_STEP = "lens://presence/step";
export const EVT_STOP = "lens://presence/stop";
export const EVT_UI = "lens://presence/ui";
export const EVT_BANNER = "lens://presence/banner";

export const DEFAULT_CONFIG: PresenceConfig = {
  mode: "subtle",
  externalAlways: true,
  pauseHotkey: "Ctrl+Alt+Pause",
  captions: true,
};
