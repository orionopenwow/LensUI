/**
 * "Tint Lens with the sky" and the automatic light/dark switch of the living packs.
 *
 * Pure part: `livingLook` turns (pack, time, place, theme) into the four values Lens' glass reads
 * (--lens-pack-base, --lens-pack-elevated, --lens-accent and data-scheme). It always meets WCAG
 * 4.5:1 for the ink on both surfaces and for the accent on both surfaces.
 *
 * Live part: `syncLivingTint` (called by applyThemeToDocument in every Lens window) re-applies the
 * look at most once a minute. It only writes CSS variables in this window; config.json is never
 * touched, so turning the toggle off or choosing another pack restores the pack exactly. While the
 * desktop is covered (a fullscreen app or game, see lens://wallpaper-pause) the tint holds still.
 */
import { contrastRatio } from "../packs";
import { isDaytime, DEFAULT_THEME_SCHEDULE } from "../schedule";
import { hslToRgb, rgbToHsl } from "../../playground/util";
import type { RGB } from "../../playground/types";
import { makeFrame } from "../../playground/living/sky";
import { painterById, skyPainter, themeColours } from "../../playground/living/themes";
import { onLivingChange, readLiving, resolveLocation, type LivingSettings } from "../../playground/living/settings";
import { currentWeather } from "../../playground/living/weather";
import { isLivingPack } from "./packs";
import { setSkyLocation } from "../../playground/scenes/skyclock";

export const INK_DARK = "#FAFAFA"; // ink on dark surfaces (tokens.css)
export const INK_LIGHT = "#18181B"; // ink on light surfaces ([data-scheme="light"])
export const MIN_CONTRAST = 4.5;

export interface LivingLook {
  scheme: "light" | "dark";
  base: string;
  elevated: string;
  accent: string;
}

const hex = (c: RGB) =>
  "#" + [c.r, c.g, c.b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("").toUpperCase();

export function hexToRgb(h: string): RGB {
  const s = h.replace("#", "");
  return { r: parseInt(s.slice(0, 2), 16), g: parseInt(s.slice(2, 4), 16), b: parseInt(s.slice(4, 6), 16) };
}

const mix = (a: RGB, b: RGB, t: number): RGB => ({ r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t });

/** Moves `c`'s lightness (keeping hue) until it reaches `min` contrast against every surface. */
export function fitContrast(c: RGB, surfaces: string[], towardsLight: boolean, min = MIN_CONTRAST): string {
  const [h, s0, l0] = rgbToHsl(c);
  let s = s0;
  for (let i = 0; i <= 100; i++) {
    const l = towardsLight ? l0 + ((1 - l0) * i) / 100 : l0 * (1 - i / 100);
    // Very light/dark accents lose saturation anyway; keep some so the hue still reads.
    if (i > 60) s = s0 * 0.85;
    const out = hex(hslToRgb(h, s, l));
    if (surfaces.every((x) => contrastRatio(out, x) >= min)) return out;
  }
  return towardsLight ? "#FFFFFF" : "#000000";
}

/** Darkens a dark surface until the light ink passes, or lightens a light one for dark ink. */
function fitSurface(c: RGB, ink: string): RGB {
  let out = c;
  for (let i = 0; i < 40 && contrastRatio(hex(out), ink) < MIN_CONTRAST + 0.3; i++) {
    out = ink === INK_DARK ? mix(out, { r: 0, g: 0, b: 0 }, 0.08) : mix(out, { r: 255, g: 255, b: 255 }, 0.12);
  }
  return out;
}

export interface LookInput {
  packId: string;
  packBase: string;
  packAccent: string;
  packLight: boolean;
  date: Date;
  latitude: number;
  longitude: number;
  /** Tint glass and accent with the sky. */
  tint: boolean;
  settings?: LivingSettings;
}

/** The look Lens should wear now. Pure and deterministic. */
export function livingLook(i: LookInput): LivingLook {
  const living = isLivingPack(i.packId);
  // Living packs follow the Sun (the Theme Schedule's sunrise/sunset logic); others keep their scheme.
  const day = living
    ? isDaytime({ ...DEFAULT_THEME_SCHEDULE, mode: "sun", latitude: i.latitude, longitude: i.longitude }, i.date)
    : i.packLight;
  const scheme: "light" | "dark" = day ? "light" : "dark";
  const ink = day ? INK_LIGHT : INK_DARK;
  const packBase = hexToRgb(i.packBase);
  const packAccent = hexToRgb(i.packAccent);

  let baseRgb: RGB;
  let accentSeed: RGB;
  if (i.tint || living) {
    const painter = (living && painterById(i.packId)) || skyPainter;
    const f = makeFrame({
      date: i.date,
      latitude: i.latitude,
      longitude: i.longitude,
      t: 0,
      motion: 0,
      clouds: false,
      weather: i.settings ? currentWeather(i.settings, i.date.getTime()) : "clear",
      view: { x0: 0, x1: 1 },
    });
    const sky = themeColours(painter, f);
    if (i.tint) {
      // Glass picks up the sky: deep zenith at night, a whisper of the horizon by day.
      baseRgb = day ? mix({ r: 255, g: 255, b: 255 }, sky.mid, 0.16) : mix(packBase, sky.zenith, 0.45);
      if (!living && !day) baseRgb = mix(packBase, sky.zenith, 0.25);
      if (!living && day) baseRgb = mix(packBase, sky.mid, 0.12);
      accentSeed = mix(sky.horizon, packAccent, 0.35);
    } else {
      baseRgb = day ? mix({ r: 255, g: 255, b: 255 }, packAccent, 0.06) : packBase;
      accentSeed = packAccent;
    }
  } else {
    baseRgb = packBase;
    accentSeed = packAccent;
  }
  // Dark glass stays dark enough for white ink; light glass light enough for dark ink.
  const baseFit = fitSurface(baseRgb, ink);
  const base = hex(baseFit);
  const elevated = day ? "#FFFFFF" : hex(fitSurface(mix(baseFit, { r: 255, g: 255, b: 255 }, 0.045), ink));
  const accent = fitContrast(accentSeed, [base, elevated], !day);
  return { scheme, base, elevated, accent };
}

/** Largest per-channel difference between two looks (0..255). Used to skip invisible updates. */
export function lookDistance(a: LivingLook | null, b: LivingLook): number {
  if (!a || a.scheme !== b.scheme) return 255;
  let d = 0;
  for (const k of ["base", "elevated", "accent"] as const) {
    const x = hexToRgb(a[k]), y = hexToRgb(b[k]);
    d = Math.max(d, Math.abs(x.r - y.r), Math.abs(x.g - y.g), Math.abs(x.b - y.b));
  }
  return d;
}

// ---- Live controller --------------------------------------------------------------------------

export const TINT_INTERVAL_MS = 60_000;

interface Active {
  packId: string;
  packBase: string;
  packAccent: string;
  packLight: boolean;
}

let active: Active | null = null;
let applied: LivingLook | null = null;
let timer = 0;
let lastApply = 0;
let covered = false;
let unsubs: (() => void)[] = [];

function writeLook(root: HTMLElement, look: LivingLook) {
  root.dataset.scheme = look.scheme;
  root.dataset.living = "on";
  root.style.setProperty("--lens-pack-base", look.base);
  root.style.setProperty("--lens-pack-elevated", look.elevated);
  root.style.setProperty("--lens-accent", look.accent);
}

function tick(force = false) {
  if (!active || typeof document === "undefined") return;
  // Never while a fullscreen app or game covers the desktop; never inside a fullscreen page.
  if (!force && (covered || document.fullscreenElement)) return;
  const now = Date.now();
  if (!force && now - lastApply < TINT_INTERVAL_MS - 500) return;
  const s = readLiving();
  const loc = resolveLocation(s);
  const look = livingLook({ ...active, date: new Date(now), latitude: loc.latitude, longitude: loc.longitude, tint: s.tint, settings: s });
  lastApply = now;
  // Skip changes nobody could see (tiny drifts); always apply scheme flips.
  if (!force && lookDistance(applied, look) < 2) return;
  applied = look;
  writeLook(document.documentElement, look);
}

/** The pack's own values, as applyThemeToDocument wrote them, so turning the tint off restores them. */
let original: { scheme?: string; base: string; elevated: string; accent: string } | null = null;

function captureOriginal() {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  original = {
    scheme: root.dataset.scheme,
    base: root.style.getPropertyValue("--lens-pack-base"),
    elevated: root.style.getPropertyValue("--lens-pack-elevated"),
    accent: root.style.getPropertyValue("--lens-accent"),
  };
}

function restoreOriginal() {
  if (typeof document === "undefined" || !original || !applied) return;
  const root = document.documentElement;
  if (original.scheme) root.dataset.scheme = original.scheme;
  const put = (k: string, v: string) => (v ? root.style.setProperty(k, v) : root.style.removeProperty(k));
  put("--lens-pack-base", original.base);
  put("--lens-pack-elevated", original.elevated);
  put("--lens-accent", original.accent);
}

function stop() {
  restoreOriginal();
  if (timer) clearInterval(timer);
  timer = 0;
  unsubs.forEach((u) => u());
  unsubs = [];
  active = null;
  applied = null;
  if (typeof document !== "undefined") delete document.documentElement.dataset.living;
}

/**
 * Called after the theme pack's own values were written (applyThemeToDocument). Starts, updates
 * or stops the controller. Returns true when the living look took over.
 */
let lastArgs: { pack: PackLike | undefined; accent: string } | null = null;
let watching = false;

type PackLike = { id: string; base?: string; accent: string; scheme?: "light" };

export function syncLivingTint(pack: PackLike | undefined, accent: string, schedule?: { latitude: number; longitude: number }): boolean {
  // Every window uses the Theme Schedule location (when set), like the wallpaper's Sky Clock.
  if (schedule) setSkyLocation(schedule.latitude, schedule.longitude);
  // Called right after applyThemeToDocument wrote the pack's own values: remember them.
  captureOriginal();
  applied = null;
  lastArgs = { pack, accent };
  if (!watching && typeof window !== "undefined") {
    // The toggle can be switched on while no living pack is active: re-evaluate on any change.
    watching = true;
    onLivingChange(() => {
      if (lastArgs) evaluate(lastArgs.pack, lastArgs.accent);
    });
  }
  return evaluate(pack, accent);
}

function evaluate(pack: PackLike | undefined, accent: string): boolean {
  const s = readLiving();
  const living = !!pack && isLivingPack(pack.id);
  if (!pack || (!living && !s.tint)) {
    stop();
    return false;
  }
  active = { packId: pack.id, packBase: pack.base ?? "#09090B", packAccent: accent, packLight: pack.scheme === "light" };
  if (!timer && typeof window !== "undefined") {
    timer = window.setInterval(() => tick(false), TINT_INTERVAL_MS);
    // The wallpaper pause monitor tells every window when the desktop is covered.
    void import("@tauri-apps/api/event")
      .then(({ listen }) => listen<string | null>("lens://wallpaper-pause", (e) => (covered = e.payload === "covered")))
      .then((un) => unsubs.push(un))
      .catch(() => {});
  }
  tick(true);
  return true;
}
