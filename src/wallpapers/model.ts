/**
 * Wallpaper Switcher, the parts with no DOM: what a card is, how the library is filtered, the
 * perceptual hash and palette the indexer stores, the duplicate finder, and the fan's geometry.
 * Rust owns the files and "what comes next" (src-tauri/src/wallpapers); this owns what you see.
 */
import type { AutoChange, ItemMeta, LibraryItem, SwitcherSettings } from "../types/generated";
import { hexToRgb, srgbToOklab } from "../studio/backdrop/engine/color";

export type CardKind = "image" | "video" | "preset" | "living";

export interface Card {
  /** Library id, or "preset:<id>" / "living:<id>" for the ones Lens draws itself. */
  id: string;
  kind: CardKind;
  name: string;
  /** Folder for files, the group for built-in ones. */
  detail: string;
  /** Path of the 256 px thumbnail ("" = none yet). */
  thumb: string;
  /** CSS background used when there is no thumbnail. */
  art: string;
  palette: string[];
  meta: ItemMeta;
  item?: LibraryItem;
}

export const EMPTY_META: ItemMeta = {
  favorite: false,
  hidden: false,
  tags: [],
  collections: [],
  width: 0,
  height: 0,
  palette: [],
  phash: "",
  thumbed: false,
};

export const isLive = (c: Card) => c.kind === "preset" || c.kind === "living";

const FALLBACK_PALETTE = ["#1B1B22", "#2C2C38", "#4A4A5C", "#8A8AA0", "#D8D8E4"];

export function fileCard(item: LibraryItem): Card {
  const palette = item.meta.palette.length ? item.meta.palette : FALLBACK_PALETTE;
  return {
    id: item.id,
    kind: item.kind === "video" ? "video" : "image",
    name: item.name.replace(/\.[^.]+$/, ""),
    detail: item.folder,
    thumb: item.thumb,
    art: `linear-gradient(135deg, ${palette[0]}, ${palette[Math.min(2, palette.length - 1)]})`,
    palette,
    meta: item.meta,
    item,
  };
}

// ----- perceptual hash -----------------------------------------------------------------------

/** Luma of each pixel of an RGBA buffer. */
export function grayFromRgba(rgba: ArrayLike<number>): number[] {
  const out: number[] = [];
  for (let i = 0; i + 3 < rgba.length; i += 4) out.push(rgba[i] * 0.299 + rgba[i + 1] * 0.587 + rgba[i + 2] * 0.114);
  return out;
}

/**
 * Difference hash of a 9 × 8 grey image (72 values, row by row): one bit per pixel that is
 * brighter than its right-hand neighbour. 16 hex digits; survives resizing and recompression.
 */
export function dHash(gray9x8: ArrayLike<number>): string {
  if (gray9x8.length < 72) return "";
  let hex = "";
  for (let row = 0; row < 8; row++) {
    let byte = 0;
    for (let col = 0; col < 8; col++) {
      const i = row * 9 + col;
      byte = (byte << 1) | (gray9x8[i] > gray9x8[i + 1] ? 1 : 0);
    }
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

const POP = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4];

/** Bits that differ between two hashes (64 when either is missing). */
export function hamming(a: string, b: string): number {
  if (a.length !== 16 || b.length !== 16) return 64;
  let d = 0;
  for (let i = 0; i < 16; i++) {
    const x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    if (Number.isNaN(x)) return 64;
    d += POP[x];
  }
  return d;
}

/** At most this many differing bits counts as "looks the same". */
export const DUPLICATE_BITS = 5;

/**
 * Groups of pictures that look alike (review only: nothing is ever removed for you).
 * Each group lists ids in the order given; groups of one are left out.
 */
export function duplicateGroups(items: { id: string; phash: string }[], maxBits = DUPLICATE_BITS): string[][] {
  // Hashes as two 32-bit halves, so a library of thousands compares in well under a frame or two.
  const hashed = items
    .filter((i) => /^[0-9a-f]{16}$/i.test(i.phash))
    .map((i) => ({ id: i.id, hi: parseInt(i.phash.slice(0, 8), 16) | 0, lo: parseInt(i.phash.slice(8), 16) | 0 }));
  const bits = (v: number) => {
    v = v - ((v >>> 1) & 0x55555555);
    v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
    return (((v + (v >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
  };
  const parent = hashed.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  for (let i = 0; i < hashed.length; i++) {
    const a = hashed[i];
    for (let j = i + 1; j < hashed.length; j++) {
      const b = hashed[j];
      if (bits(a.hi ^ b.hi) + bits(a.lo ^ b.lo) <= maxBits) parent[find(j)] = find(i);
    }
  }
  const groups = new Map<number, string[]>();
  hashed.forEach((it, i) => {
    const root = find(i);
    const g = groups.get(root);
    if (g) g.push(it.id);
    else groups.set(root, [it.id]);
  });
  return [...groups.values()].filter((g) => g.length > 1);
}

// ----- palette -------------------------------------------------------------------------------

const hex2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
const toHex = (r: number, g: number, b: number) => `#${hex2(r)}${hex2(g)}${hex2(b)}`.toUpperCase();

function labDistance(a: string, b: string): number {
  const x = srgbToOklab(hexToRgb(a));
  const y = srgbToOklab(hexToRgb(b));
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}

/**
 * The colours that make up a picture, most common first, kept visibly different from each other.
 * Works on any small RGBA buffer (the indexer hands it a 32 × 32 copy).
 */
export function paletteFromRgba(rgba: ArrayLike<number>, count = 5): string[] {
  const buckets = new Map<number, [number, number, number, number]>();
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    if (rgba[i + 3] < 128) continue;
    const key = ((rgba[i] >> 4) << 8) | ((rgba[i + 1] >> 4) << 4) | (rgba[i + 2] >> 4);
    const b = buckets.get(key) ?? [0, 0, 0, 0];
    b[0] += rgba[i];
    b[1] += rgba[i + 1];
    b[2] += rgba[i + 2];
    b[3] += 1;
    buckets.set(key, b);
  }
  const ranked = [...buckets.values()].sort((a, b) => b[3] - a[3]).map((b) => toHex(b[0] / b[3], b[1] / b[3], b[2] / b[3]));
  const out: string[] = [];
  for (const min of [0.12, 0.07, 0.03, 0]) {
    for (const hex of ranked) {
      if (out.length >= count) break;
      if (!out.includes(hex) && out.every((o) => labDistance(o, hex) >= min)) out.push(hex);
    }
    if (out.length >= count) break;
  }
  return out;
}

/** Palette ordered dark to light: the order a backdrop or a theme wants. */
export function byLightness(palette: string[]): string[] {
  return [...palette].sort((a, b) => srgbToOklab(hexToRgb(a))[0] - srgbToOklab(hexToRgb(b))[0]);
}

// ----- filtering -----------------------------------------------------------------------------

export interface SourceOption {
  id: string;
  label: string;
  count: number;
}

const has = (list: string[], label: string) => list.some((l) => l.toLowerCase() === label.toLowerCase());

/** Whether a card belongs to a source ("" all, "favorites", "live", "hidden", "dupes", "c:…", "t:…"). */
export function inSource(card: Card, source: string, dupes?: Set<string>): boolean {
  if (source === "hidden") return card.meta.hidden;
  if (card.meta.hidden) return false;
  if (source === "favorites") return card.meta.favorite;
  if (source === "live") return isLive(card) || card.kind === "video";
  if (source === "dupes") return !!dupes?.has(card.id);
  if (source.startsWith("c:")) return has(card.meta.collections, source.slice(2));
  if (source.startsWith("t:")) return has(card.meta.tags, source.slice(2));
  return true;
}

export function searchCards(cards: Card[], query: string): Card[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return cards;
  return cards.filter((c) => {
    const hay = [c.name, c.detail, c.kind, ...c.meta.tags, ...c.meta.collections].join(" ").toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

/** Cards to show, in order. Duplicates are listed group by group so look-alikes sit together. */
export function visibleCards(cards: Card[], source: string, query: string, groups: string[][] = []): Card[] {
  const dupes = new Set(groups.flat());
  const shown = searchCards(cards.filter((c) => inSource(c, source, dupes)), query);
  if (source !== "dupes") return shown;
  const order = new Map<string, number>();
  groups.flat().forEach((id, i) => order.set(id, i));
  return [...shown].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

export function sourceOptions(settings: SwitcherSettings | null, cards: Card[], groups: string[][] = []): SourceOption[] {
  const dupes = new Set(groups.flat());
  const count = (id: string) => cards.filter((c) => inSource(c, id, dupes)).length;
  const tags = new Map<string, string>();
  const collections = new Map<string, string>();
  for (const name of settings?.collections ?? []) collections.set(name.toLowerCase(), name);
  for (const c of cards) {
    for (const t of c.meta.tags) if (!tags.has(t.toLowerCase())) tags.set(t.toLowerCase(), t);
    for (const col of c.meta.collections) if (!collections.has(col.toLowerCase())) collections.set(col.toLowerCase(), col);
  }
  const out: SourceOption[] = [
    { id: "", label: "Everything", count: count("") },
    { id: "favorites", label: "Favourites", count: count("favorites") },
    { id: "live", label: "Live", count: count("live") },
    ...[...collections.values()].sort().map((c) => ({ id: `c:${c}`, label: c, count: count(`c:${c}`) })),
    ...[...tags.values()].sort().map((t) => ({ id: `t:${t}`, label: `#${t}`, count: count(`t:${t}`) })),
  ];
  if (dupes.size) out.push({ id: "dupes", label: "Look-alikes", count: count("dupes") });
  const hidden = count("hidden");
  if (hidden) out.push({ id: "hidden", label: "Hidden", count: hidden });
  return out;
}

/** Adds or removes a label, ignoring case; keeps what was typed first. */
export function toggleLabel(list: string[], label: string): string[] {
  const clean = label.trim().replace(/[:\u0000-\u001f]/g, "").slice(0, 40).trim();
  if (!clean) return list;
  return has(list, clean) ? list.filter((l) => l.toLowerCase() !== clean.toLowerCase()) : [...list, clean];
}

// ----- the fan -------------------------------------------------------------------------------

export interface FanPose {
  /** Sideways shift, as a fraction of the card's width. */
  x: number;
  /** Push back, as a fraction of the card's width. */
  z: number;
  /** Turn toward the middle, degrees. */
  turn: number;
  scale: number;
  /** How much the card is darkened (0 = not at all). Cards stay solid; distance dims them. */
  dim: number;
  /** 1 while the card is part of the fan, 0 once it has left it. */
  opacity: number;
  layer: number;
}

/** Cards drawn either side of the one in focus. */
export const FAN_REACH = 4;

/**
 * Where the card `offset` places from the middle sits: a curved fan. The middle card faces
 * you at full size; neighbours overlap like a hand of cards, turn inward, fall back and dim.
 */
export function fanPose(offset: number): FanPose {
  const d = Math.min(Math.abs(offset), FAN_REACH + 1);
  const side = Math.sign(offset);
  const k = d - 1;
  // Each step sideways is a little shorter than the last, so the fan curves instead of marching off.
  const x = d === 0 ? 0 : side * (0.64 + k * 0.5 - k * k * 0.01);
  // `|| 0` folds -0 into 0, so a pose compares and prints cleanly.
  return {
    x: x || 0,
    z: -(d * 0.12 + d * d * 0.05) || 0,
    turn: -side * (d === 0 ? 0 : Math.min(40, 12 + k * 7)) || 0,
    scale: d === 0 ? 1 : Math.max(0.6, 0.94 - k * 0.06),
    dim: Math.min(0.62, d * 0.16),
    opacity: d > FAN_REACH ? 0 : 1,
    layer: 100 - Math.round(d * 10),
  };
}

/** Index after moving `delta` from `index` in a list of `count`, stopping at both ends. */
export function moveIndex(index: number, delta: number, count: number): number {
  if (count <= 0) return 0;
  return Math.max(0, Math.min(count - 1, index + delta));
}

/** [first, last] indexes of cards worth mounting around `index`. */
export function fanWindow(index: number, count: number, reach = FAN_REACH + 1): [number, number] {
  return [Math.max(0, index - reach), Math.min(count - 1, index + reach)];
}

// ----- words ---------------------------------------------------------------------------------

export const FITS = ["cover", "contain", "fill", "center"] as const;
export const FIT_LABEL: Record<string, string> = { cover: "Fill the screen", contain: "Show it all", fill: "Stretch", center: "Actual size" };
export const nextFit = (fit: string) => FITS[(FITS.indexOf(fit as (typeof FITS)[number]) + 1) % FITS.length];

export const INTERVALS = [5, 10, 15, 30, 60, 120, 240, 720, 1440];

export function intervalLabel(minutes: number): string {
  if (minutes <= 0) return "Not on a timer";
  if (minutes < 60) return `Every ${minutes} minutes`;
  if (minutes === 60) return "Every hour";
  if (minutes === 1440) return "Once a day";
  return `Every ${minutes / 60} hours`;
}

export function sourceLabel(source: string): string {
  if (!source) return "everything";
  if (source === "favorites") return "favourites";
  if (source.startsWith("c:")) return source.slice(2);
  if (source.startsWith("t:")) return `#${source.slice(2)}`;
  return source;
}

/** One line for Settings: what auto-change is doing. */
export function autoSummary(auto: AutoChange): string {
  if (!auto.enabled) return "Off";
  const parts: string[] = [];
  if (auto.everyMinutes > 0) parts.push(intervalLabel(auto.everyMinutes).toLowerCase());
  if (auto.atSignIn) parts.push("when Lens starts");
  const when = parts.length ? parts.join(" and ") : "only when the day or night set changes";
  const from = auto.dayNight ? `${sourceLabel(auto.daySource)} by day, ${sourceLabel(auto.nightSource)} at night` : sourceLabel(auto.source);
  return `${when[0].toUpperCase()}${when.slice(1)} · ${auto.order === "inOrder" ? "in order" : "shuffled"} · from ${from}`;
}

export function sizeLabel(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
