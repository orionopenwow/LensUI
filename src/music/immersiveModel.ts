// Immersive mode's view model (pure; tested in src/__tests__/musicUpgrade.test.ts). The component
// (Immersive.tsx) only renders what these return.
import { currentLine, hexToRgb, mix, pickVivid, rgbToHex, type LyricLine, type RGB } from "./model";

// ---------------------------------------------------------------- ambient field

export interface AmbientLayer {
  /** A radial gradient in one of the artwork's colours (CSS background). */
  background: string;
  /** Where its centre rests, in % of the screen. */
  x: number;
  y: number;
  /** Drift: how far it wanders (vw/vh) and how much it breathes (scale). */
  dx: number;
  dy: number;
  scale: number;
  /** Loop length as a multiple of --lens-dur-slower (so the token still governs it). */
  beats: number;
  /** Start offset within the loop, as a fraction (layers never move in step). */
  phase: number;
  opacity: number;
}

export interface AmbientField {
  /** The flat base under the layers (CSS colour). */
  base: string;
  layers: AmbientLayer[];
  /** Still: reduced motion, or rendering paused. */
  still: boolean;
}

const SPOTS: [number, number][] = [[22, 28], [78, 24], [30, 78], [74, 72]];

/**
 * Four soft colour fields from the palette over a deep base. Only transform and opacity animate
 * (Immersive.css), each layer on its own slow loop; reduced motion keeps them where they rest.
 */
export function ambientField(palette: { color: RGB; weight: number }[], base: string, reduced: boolean, light = false): AmbientField {
  const b = hexToRgb(base) ?? (light ? { r: 238, g: 238, b: 240 } : { r: 9, g: 9, b: 11 });
  // Dark themes sink the base towards black; light ones lift it towards paper. The layers mix less
  // colour in on light themes so dark text keeps reading over them.
  const deep = light ? mix(b, { r: 255, g: 255, b: 255 }, 0.3) : mix(b, { r: 0, g: 0, b: 0 }, 0.35);
  const strength = light ? 0.5 : 0.85;
  const vivid = pickVivid(palette);
  const colours = palette.length ? palette.map((p) => p.color) : [];
  if (vivid && !colours.includes(vivid)) colours.unshift(vivid);
  const neutral = light ? { r: 9, g: 9, b: 11 } : { r: 250, g: 250, b: 250 };
  const pick = (i: number): RGB => (colours.length ? colours[i % colours.length] : mix(b, neutral, 0.08 + i * 0.02));
  const layers = SPOTS.map(([x, y], i) => {
    const c = pick(i);
    const strong = rgbToHex(mix(deep, c, strength));
    return {
      background: `radial-gradient(closest-side, ${strong} 0%, ${rgbToHex(mix(deep, c, strength * 0.47))} 45%, transparent 100%)`,
      x,
      y,
      dx: [6, -7, 5, -5][i],
      dy: [-5, 6, -6, 4][i],
      scale: [1.12, 1.08, 1.15, 1.1][i],
      beats: [70, 84, 96, 78][i],
      phase: [0, 0.31, 0.57, 0.82][i],
      opacity: palette.length ? [0.75, 0.6, 0.55, 0.45][i] : 0.35,
    };
  });
  return { base: rgbToHex(deep), layers, still: reduced };
}

// ---------------------------------------------------------------- idle (cursor and controls)

export interface IdleInput {
  /** When the pointer last moved or a key was pressed (ms). */
  lastActivityMs: number;
  nowMs: number;
  idleMs: number;
  /** The pointer is over the controls, or a control has keyboard focus. */
  overControls: boolean;
  /** Nothing is playing: the empty state keeps its controls. */
  empty: boolean;
}

/** True when the cursor and controls should hide. */
export function controlsHidden(i: IdleInput): boolean {
  if (i.overControls || i.empty) return false;
  return i.nowMs - i.lastActivityMs >= Math.max(1000, i.idleMs);
}

// ---------------------------------------------------------------- lyrics

export type LyricsView = "original" | "translated" | "both";

export interface ImmersiveLine {
  index: number;
  text: string;
  /** The translation under it ("both") or instead of it ("translated"). */
  sub: string | null;
  role: "past" | "current" | "next" | "upcoming";
  /** Opacity for the role: the current line bright, the rest faded with distance. */
  opacity: number;
}

/** What one line shows for the chosen view (falls back to the original where a translation is missing). */
export function lineText(original: string, translated: string | undefined, view: LyricsView): { text: string; sub: string | null } {
  const t = (translated ?? "").trim();
  if (view === "translated" && t) return { text: t, sub: null };
  if (view === "both" && t && t !== original.trim()) return { text: original, sub: t };
  return { text: original, sub: null };
}

/**
 * The lines Immersive draws around the current one: `before` past lines and `after` coming ones.
 * Long lyrics are never all in the DOM, so a 200-line song costs the same as a short one.
 */
export function lyricWindow(
  lines: LyricLine[],
  positionMs: number,
  offsetMs: number,
  translated: string[] | null,
  view: LyricsView,
  before = 2,
  after = 4
): { current: number; lines: ImmersiveLine[] } {
  const current = currentLine(lines, positionMs, offsetMs);
  const centre = Math.max(0, current);
  const from = Math.max(0, centre - before);
  const to = Math.min(lines.length, centre + after + 1);
  const out: ImmersiveLine[] = [];
  for (let i = from; i < to; i++) {
    const role = i < current ? "past" : i === current ? "current" : i === current + 1 ? "next" : "upcoming";
    const d = Math.abs(i - current);
    const opacity = role === "current" ? 1 : role === "past" ? Math.max(0.14, 0.32 - (d - 1) * 0.1) : Math.max(0.16, 0.5 - (d - 1) * 0.1);
    const { text, sub } = lineText(lines[i].text || "♪", translated?.[i], view);
    out.push({ index: i, text, sub, role, opacity });
  }
  return { current, lines: out };
}

// ---------------------------------------------------------------- the whole view

export interface ImmersiveModelInput {
  hasSession: boolean;
  title: string;
  artist: string;
  album: string;
  status: string;
  positionMs: number;
  durationMs: number;
  lyrics: { found: boolean; synced: boolean; lines: LyricLine[] } | null;
  lyricsEnabled: boolean;
  offsetMs: number;
  translated: string[] | null;
  view: LyricsView;
  /** Rendering paused (window hidden or minimised). */
  hidden: boolean;
}

export interface ImmersiveModel {
  layout: "empty" | "art-only" | "art-lyrics";
  title: string;
  subtitle: string;
  progress: number;
  playing: boolean;
  lyric: { current: number; lines: ImmersiveLine[] } | null;
  /** Animation and level polling run only when this is true. */
  animate: boolean;
}

export function immersiveModel(i: ImmersiveModelInput, reduced: boolean): ImmersiveModel {
  const playing = i.status === "playing";
  if (!i.hasSession) {
    return { layout: "empty", title: "Nothing is playing", subtitle: "Play something in any app that shows up in Windows' media controls.", progress: 0, playing: false, lyric: null, animate: false };
  }
  const synced = !!(i.lyricsEnabled && i.lyrics?.found && i.lyrics.synced && i.lyrics.lines.length);
  return {
    layout: synced ? "art-lyrics" : "art-only",
    title: i.title || "Untitled",
    subtitle: [i.artist, i.album].filter((s) => s && s.trim()).join(" — "),
    progress: i.durationMs > 0 ? Math.min(1, Math.max(0, i.positionMs / i.durationMs)) : 0,
    playing,
    lyric: synced ? lyricWindow(i.lyrics!.lines, i.positionMs, i.offsetMs, i.translated, i.view) : null,
    animate: playing && !i.hidden && !reduced,
  };
}

/** Where the artwork grows from when Immersive opens (and returns to when it closes). */
export function originPose(
  from: "nowplaying" | "dock" | "command",
  trigger: { x: number; y: number; w: number; h: number } | null,
  target: { x: number; y: number; w: number; h: number }
): { x: number; y: number; scale: number } {
  if (from === "nowplaying" && trigger && trigger.w > 0 && target.w > 0) {
    return {
      x: trigger.x + trigger.w / 2 - (target.x + target.w / 2),
      y: trigger.y + trigger.h / 2 - (target.y + target.h / 2),
      scale: Math.max(0.1, Math.min(1, trigger.w / target.w)),
    };
  }
  // The Dock card lives in another window: grow from the bottom centre, where the Dock is.
  if (from === "dock") return { x: 0, y: Math.round(target.h * 0.9), scale: 0.3 };
  return { x: 0, y: 12, scale: 0.92 };
}
