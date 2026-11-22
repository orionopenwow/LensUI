/**
 * Playground: artistic, interactive scenes drawn as the Lens wallpaper (behind desktop icons).
 * Each scene is a small module with a settings schema; the runner (runner.ts) owns the frame
 * loop, frame cap, pausing, reduced motion and the budget meter. See docs/PLAYGROUND.md.
 */

export interface RGB {
  r: number;
  g: number;
  b: number;
}

/** Colours read from the active Lens theme (CSS variables), as 0..255 RGB. */
export interface Palette {
  accent: RGB;
  base: RGB;
  elevated: RGB;
  fg: RGB;
  dark: boolean;
}

export type SettingValue = number | string | boolean;
export type SceneOptions = Record<string, SettingValue>;

export type SettingField =
  | { key: string; label: string; type: "range"; min: number; max: number; step: number; default: number; unit?: string }
  | { key: string; label: string; type: "choice"; options: { id: string; label: string }[]; default: string }
  | { key: string; label: string; type: "toggle"; default: boolean; hint?: string };

/** A pointer event in canvas CSS pixels. */
export interface PointerSample {
  kind: "move" | "down" | "up" | "wheel" | "leave";
  x: number;
  y: number;
  /** 0 left, 1 middle, 2 right; -1 when not a button event. */
  button: number;
  /** Held buttons bitmask: 1 left, 2 right, 4 middle. */
  buttons: number;
  delta: number;
  alt: boolean;
}

/** What a scene sees of the cursor each step. */
export interface InputState {
  x: number;
  y: number;
  /** Cursor is over the bare desktop (or the preview canvas). */
  inside: boolean;
  buttons: number;
  alt: boolean;
  /** Events since the previous step, oldest first. */
  events: PointerSample[];
}

export interface SceneContext {
  canvas: HTMLCanvasElement;
  /** CSS pixels. */
  width: number;
  height: number;
  /** Device pixel ratio the runner chose for this canvas (already capped). */
  dpr: number;
  palette: Palette;
  options: SceneOptions;
  /** Deterministic seed (tests and screenshots); random otherwise. */
  seed: number;
  /** Small previews (gallery thumbnails): scenes should use fewer particles. */
  preview: boolean;
}

export interface SceneInstance {
  /** Advance the simulation by `dt` seconds (clamped by the runner to ≤ 1/15 s). */
  step(dt: number, input: InputState): void;
  render(): void;
  resize(width: number, height: number, dpr: number): void;
  setPalette?(p: Palette): void;
  setOptions?(o: SceneOptions): void;
  /** Optional persistence (falling sand). `dirty` tells the runner a save is worthwhile. */
  save?(): Uint8Array | null;
  load?(data: Uint8Array): void;
  dirty?: boolean;
  /** Clear button in the card. */
  reset?(): void;
  dispose(): void;
}

export interface SceneModule {
  id: string;
  name: string;
  /** One line shown in the gallery. */
  blurb: string;
  /** Reacts to the desktop cursor: the input hook only runs for these. */
  interactive: boolean;
  /** Calm scenes are slow and quiet. */
  calm?: boolean;
  /** Highest frame rate worth drawing (slow ambient scenes look the same at 30). */
  maxFps?: number;
  /** How the scene would like to be warmed up before a still frame (reduced motion), in steps. */
  warmup?: number;
  settings: SettingField[];
  create(ctx: SceneContext): SceneInstance;
}

/** Payload of lens://desktop-input (win_desktop_input.rs). x/y are 0..1 of the primary monitor. */
export interface DesktopInputEvent {
  kind: "move" | "down" | "up" | "wheel" | "leave";
  x: number;
  y: number;
  button: number;
  buttons: number;
  delta: number;
  alt: boolean;
  ctrl: boolean;
  shift: boolean;
}

export function defaultOptions(module: SceneModule): SceneOptions {
  const out: SceneOptions = {};
  for (const f of module.settings) out[f.key] = f.default;
  return out;
}

/** Fills missing / wrong-typed values from the schema defaults and clamps ranges. */
export function normaliseOptions(module: SceneModule, raw: unknown): SceneOptions {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out: SceneOptions = {};
  for (const f of module.settings) {
    const v = src[f.key];
    if (f.type === "range") {
      const n = typeof v === "number" && Number.isFinite(v) ? v : f.default;
      out[f.key] = Math.max(f.min, Math.min(f.max, n));
    } else if (f.type === "choice") {
      out[f.key] = typeof v === "string" && f.options.some((o) => o.id === v) ? v : f.default;
    } else {
      out[f.key] = typeof v === "boolean" ? v : f.default;
    }
  }
  return out;
}
