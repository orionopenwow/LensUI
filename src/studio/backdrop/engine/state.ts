/**
 * The one serialisable Backdrop state. Everything the Lab shows, the wallpaper plays, exports
 * render and share links carry is this object, so "what you see is what plays".
 */
import { BLEND_SPACES, clamp, evenStops, isHex, normHex, tidyStops, type BlendSpace, type Stop } from "./color";
import { MODES, modeById, type ModeId } from "./modes";

export type Tone = "none" | "aces";
export type GrainStyle = "fine" | "film" | "paper";
export type Dither = "blue" | "ordered" | "off";
export type LayerBlend = "normal" | "screen" | "overlay" | "soft-light";
export type LayerMask = "none" | "radial" | "linear" | "noise";

export interface Handle {
  /** 0..1 of the canvas, y down. */
  x: number;
  y: number;
}

export interface LookState {
  mode: ModeId;
  seed: number;
  stops: Stop[];
  space: BlendSpace;
  bias: number;
  sharpness: number;
  /** Shape */
  scale: number;
  softness: number;
  /** Motion */
  warp: number;
  speed: number;
  /** Mode-specific controls a..d (see modes.ts). */
  params: Record<string, number>;
  /** On-canvas handles (centre, direction / light). */
  handles: Handle[];
}

export interface BackdropState extends LookState {
  v: 1;
  name?: string;
  /** Seconds per seamless loop. */
  loop: number;
  /** Grade */
  brightness: number;
  contrast: number;
  saturation: number;
  exposure: number;
  tone: Tone;
  /** Effects */
  grain: number;
  grainStyle: GrainStyle;
  vignette: number;
  dither: Dither;
  aberration: number;
  bloom: number;
  /** Optional second look blended on top (Layers v1). */
  layer?: { look: LookState; blend: LayerBlend; mask: LayerMask; amount: number } | null;
}

export const TONES: { id: Tone; label: string }[] = [
  { id: "none", label: "None" },
  { id: "aces", label: "Filmic" },
];
export const GRAIN_STYLES: { id: GrainStyle; label: string }[] = [
  { id: "fine", label: "Fine" },
  { id: "film", label: "Film" },
  { id: "paper", label: "Paper" },
];
export const DITHERS: { id: Dither; label: string }[] = [
  { id: "blue", label: "Blue noise" },
  { id: "ordered", label: "Ordered" },
  { id: "off", label: "Off" },
];
export const LAYER_BLENDS: { id: LayerBlend; label: string }[] = [
  { id: "normal", label: "Normal" },
  { id: "screen", label: "Screen" },
  { id: "overlay", label: "Overlay" },
  { id: "soft-light", label: "Soft light" },
];
export const LAYER_MASKS: { id: LayerMask; label: string }[] = [
  { id: "none", label: "Even" },
  { id: "radial", label: "Radial" },
  { id: "linear", label: "Linear" },
  { id: "noise", label: "Noise" },
];

/** Numeric ranges for every global control: [min, max, default, step]. */
export const RANGES = {
  bias: [-1, 1, 0, 0.01],
  sharpness: [0, 1, 0, 0.01],
  scale: [0.2, 4, 1.4, 0.01],
  softness: [0, 1, 0.7, 0.01],
  warp: [0, 1, 0.18, 0.005],
  speed: [0, 1, 0.18, 0.005],
  loop: [4, 60, 20, 1],
  brightness: [0.5, 1.5, 1, 0.01],
  contrast: [0.5, 1.5, 1.05, 0.01],
  saturation: [0, 2, 1.1, 0.01],
  exposure: [-2, 2, 0, 0.05],
  grain: [0, 0.2, 0.02, 0.002],
  vignette: [0, 1, 0, 0.01],
  aberration: [0, 1, 0, 0.01],
  bloom: [0, 1, 0, 0.01],
} as const satisfies Record<string, readonly [number, number, number, number]>;

export type RangeKey = keyof typeof RANGES;

export const DEFAULT_STOPS = evenStops(["#0B0A1A", "#2B1D6B", "#7C3AED", "#F472B6", "#FDE68A"]);

export function defaultLook(mode: ModeId = "mesh"): LookState {
  const m = modeById(mode)!;
  const params: Record<string, number> = {};
  for (const p of m.params) params[p.key] = p.default;
  return {
    mode,
    seed: 7,
    stops: DEFAULT_STOPS.map((s) => ({ ...s })),
    space: "oklab",
    bias: 0,
    sharpness: 0,
    scale: RANGES.scale[2],
    softness: RANGES.softness[2],
    warp: RANGES.warp[2],
    speed: RANGES.speed[2],
    params,
    handles: m.handles.map((h) => ({ ...h.default })),
  };
}

export function defaultState(mode: ModeId = "mesh"): BackdropState {
  return {
    v: 1,
    ...defaultLook(mode),
    loop: RANGES.loop[2],
    brightness: 1,
    contrast: 1.05,
    saturation: 1.1,
    exposure: 0,
    tone: "none",
    grain: 0.02,
    grainStyle: "fine",
    vignette: 0,
    dither: "blue",
    aberration: 0,
    bloom: 0,
    layer: null,
  };
}

const num = (v: unknown, k: RangeKey): number => {
  const [lo, hi, def] = RANGES[k];
  return typeof v === "number" && Number.isFinite(v) ? clamp(v, lo, hi) : def;
};
const pick = <T extends string>(v: unknown, list: { id: T }[], def: T): T =>
  typeof v === "string" && list.some((o) => o.id === v) ? (v as T) : def;

function normaliseLook(r: Record<string, unknown>): LookState {
  const modeId = typeof r.mode === "string" && modeById(r.mode as ModeId) ? (r.mode as ModeId) : "mesh";
  const m = modeById(modeId)!;
  const base = defaultLook(modeId);
  const rawStops = Array.isArray(r.stops) ? (r.stops as unknown[]) : [];
  let stops: Stop[] = rawStops
    .map((s) => (s && typeof s === "object" ? (s as Record<string, unknown>) : typeof s === "string" ? { color: s } : null))
    .filter((s): s is Record<string, unknown> => !!s && isHex(s.color))
    .map((s, i, all) => ({
      color: normHex(String(s.color)),
      pos: typeof s.pos === "number" && Number.isFinite(s.pos) ? s.pos : i / Math.max(1, all.length - 1),
    }));
  if (stops.length < 2) stops = base.stops;
  stops = tidyStops(stops);
  const rp = r.params && typeof r.params === "object" ? (r.params as Record<string, unknown>) : {};
  const params: Record<string, number> = {};
  for (const p of m.params) {
    const v = rp[p.key];
    params[p.key] = typeof v === "number" && Number.isFinite(v) ? clamp(v, p.min, p.max) : p.default;
  }
  const rh = Array.isArray(r.handles) ? (r.handles as unknown[]) : [];
  const handles = m.handles.map((h, i) => {
    const v = rh[i] as Record<string, unknown> | undefined;
    const ok = v && typeof v.x === "number" && typeof v.y === "number" && Number.isFinite(v.x) && Number.isFinite(v.y);
    return ok ? { x: clamp(v!.x as number, -0.5, 1.5), y: clamp(v!.y as number, -0.5, 1.5) } : { ...h.default };
  });
  return {
    mode: modeId,
    seed: typeof r.seed === "number" && Number.isFinite(r.seed) ? Math.abs(Math.floor(r.seed)) % 100000 : base.seed,
    stops,
    space: pick(r.space, BLEND_SPACES, "oklab"),
    bias: num(r.bias, "bias"),
    sharpness: num(r.sharpness, "sharpness"),
    scale: num(r.scale, "scale"),
    softness: num(r.softness, "softness"),
    warp: num(r.warp, "warp"),
    speed: num(r.speed, "speed"),
    params,
    handles,
  };
}

/** Never trusts its input: unknown keys dropped, numbers clamped, enums checked. */
export function normaliseState(raw: unknown): BackdropState {
  const r = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const look = normaliseLook(r);
  const d = defaultState(look.mode);
  let layer: BackdropState["layer"] = null;
  const rl = r.layer as Record<string, unknown> | null | undefined;
  if (rl && typeof rl === "object" && rl.look && typeof rl.look === "object") {
    layer = {
      look: normaliseLook(rl.look as Record<string, unknown>),
      blend: pick(rl.blend, LAYER_BLENDS, "screen"),
      mask: pick(rl.mask, LAYER_MASKS, "radial"),
      amount: typeof rl.amount === "number" && Number.isFinite(rl.amount) ? clamp(rl.amount, 0, 1) : 0.6,
    };
  }
  const name = typeof r.name === "string" ? r.name.replace(/[^\p{L}\p{N} .,'&()-]/gu, "").slice(0, 48).trim() : "";
  return {
    ...d,
    ...look,
    ...(name ? { name } : {}),
    loop: Math.round(num(r.loop, "loop")),
    brightness: num(r.brightness, "brightness"),
    contrast: num(r.contrast, "contrast"),
    saturation: num(r.saturation, "saturation"),
    exposure: num(r.exposure, "exposure"),
    tone: pick(r.tone, TONES, "none"),
    grain: num(r.grain, "grain"),
    grainStyle: pick(r.grainStyle, GRAIN_STYLES, "fine"),
    vignette: num(r.vignette, "vignette"),
    dither: pick(r.dither, DITHERS, "blue"),
    aberration: num(r.aberration, "aberration"),
    bloom: num(r.bloom, "bloom"),
    layer,
  };
}

// ── share codes, links and files ────────────────────────────────────────────────────────────

const round = (v: number) => Math.round(v * 1000) / 1000;

/** Compact JSON: 3-decimal numbers, defaults left out of `params` never (keeps it explicit). */
export function toJSON(s: BackdropState): string {
  return JSON.stringify(s, (_k, v) => (typeof v === "number" ? round(v) : v));
}

function b64urlEncode(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(code: string): string {
  const b64 = code.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "===".slice((b64.length + 3) % 4));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/** Short text code for a backdrop ("LBG1." + base64url JSON). A typical look is under 1 KB; codes over 4 KB are refused. */
export function encodeState(s: BackdropState): string {
  return "LBG1." + b64urlEncode(toJSON(s));
}

export const MAX_CODE_LENGTH = 4000;

export function decodeState(code: string): BackdropState | null {
  try {
    const c = String(code).trim();
    const m = /(?:^|[?&]s=|^)(LBG1\.[A-Za-z0-9_-]+)/.exec(c);
    if (!m || m[1].length > MAX_CODE_LENGTH) return null;
    return normaliseState(JSON.parse(b64urlDecode(m[1].slice(5))));
  } catch {
    return null;
  }
}

export function shareLink(s: BackdropState): string {
  return `lens://studio/backdrop?s=${encodeState(s)}`;
}

/** `.lensbg` file: plain JSON so people can read and diff it. */
export interface LensBgFile {
  lensbg: 1;
  name: string;
  state: BackdropState;
}

export function toLensBg(s: BackdropState, name = s.name || "Backdrop"): string {
  return JSON.stringify({ lensbg: 1, name, state: JSON.parse(toJSON(s)) } satisfies LensBgFile, null, 2);
}

export function fromLensBg(text: string): BackdropState | null {
  try {
    const raw = JSON.parse(text);
    if (!raw || raw.lensbg !== 1 || !raw.state) return null;
    return normaliseState({ ...raw.state, name: raw.name ?? raw.state.name });
  } catch {
    return null;
  }
}

/** Deep equality on the serialised form. */
export function sameState(a: BackdropState, b: BackdropState): boolean {
  return toJSON(a) === toJSON(b);
}

/** Static CSS fallback: a radial + linear gradient from the stops (copy-CSS, no-GPU fallback). */
export function cssGradient(s: BackdropState): string {
  const stops = tidyStops(s.stops);
  const lin = stops.map((st) => `${st.color} ${Math.round(st.pos * 100)}%`).join(", ");
  const mid = stops[Math.floor(stops.length / 2)].color;
  const top = stops[stops.length - 1].color;
  const angle = s.mode === "horizon" || s.mode === "sea" || s.mode === "edgeglow" ? 180 : 160;
  return `radial-gradient(120% 90% at 70% 20%, ${top}55 0%, transparent 60%), radial-gradient(90% 80% at 20% 80%, ${mid}66 0%, transparent 65%), linear-gradient(${angle}deg, ${lin})`;
}

export { MODES };
