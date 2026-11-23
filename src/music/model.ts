// Lens Music: pure helpers shared by the mini player, the Now Playing window, the scene and
// the settings card. No DOM, no Tauri — unit-tested in src/__tests__/music.test.ts.
import type { LyricLine, NowPlaying } from "../types/generated";

export type { LyricLine, NowPlaying };

// ------------------------------------------------------------------------- timeline

/** Position now, extrapolated from the last report (mirrors music/timeline.rs). */
export function livePosition(n: Pick<NowPlaying, "positionMs" | "updatedMs" | "status" | "rate" | "durationMs">, nowMs: number): number {
  let pos = n.positionMs;
  if (n.status === "playing" && n.updatedMs > 0 && nowMs > n.updatedMs) {
    const rate = Number.isFinite(n.rate) && n.rate > 0 ? Math.min(n.rate, 4) : 1;
    pos += (nowMs - n.updatedMs) * rate;
  }
  if (n.durationMs > 0) pos = Math.min(pos, n.durationMs);
  return Math.max(0, Math.floor(pos));
}

export function formatTime(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor(s / 60) % 60;
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

/** "25 min → 3:34 PM": how long until the queue (or the track) ends and the clock time then. */
export function endTimeLabel(remainingMs: number, now: Date, hour12 = true): string {
  const mins = Math.max(0, Math.round(remainingMs / 60000));
  const end = new Date(now.getTime() + remainingMs);
  let h = end.getHours();
  const m = String(end.getMinutes()).padStart(2, "0");
  let clock: string;
  if (hour12) {
    const ap = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    clock = `${h}:${m} ${ap}`;
  } else {
    clock = `${String(h).padStart(2, "0")}:${m}`;
  }
  const dur = mins >= 60 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${mins} min`;
  return `${dur} → ${clock}`;
}

// ------------------------------------------------------------------------- lyrics

export type LineState = "past" | "current" | "next" | "upcoming";

/** Index of the current line (positive offset = lyrics earlier), -1 before the first line. */
export function currentLine(lines: LyricLine[], positionMs: number, offsetMs = 0): number {
  const pos = positionMs + offsetMs;
  let lo = 0;
  let hi = lines.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].startMs <= pos) lo = mid + 1;
    else hi = mid;
  }
  return lo - 1;
}

export function lineState(i: number, current: number): LineState {
  if (i < current) return "past";
  if (i === current) return "current";
  if (i === current + 1) return "next";
  return "upcoming";
}

/** Opacity per state, matching the reference: current bright, next readable, rest faded. */
export function lineOpacity(i: number, current: number): number {
  const s = lineState(i, current);
  if (s === "current") return 1;
  if (s === "next") return 0.42;
  if (s === "past") return 0.22;
  return Math.max(0.12, 0.34 - (i - current - 2) * 0.07);
}

/** Scroll offset (px) that keeps the current line at `anchor` (0..1) of the viewport. */
export function lyricScroll(lineTops: number[], current: number, viewport: number, anchor = 0.33): number {
  if (current < 0 || !lineTops.length) return 0;
  const top = lineTops[Math.min(current, lineTops.length - 1)];
  return Math.max(0, top - viewport * anchor);
}

// ------------------------------------------------------------------------- mini player

export interface MiniState {
  visible: boolean;
  label: string;
  /** Title is long enough to scroll in the chip. */
  marquee: boolean;
  progress: number;
  canToggle: boolean;
  icon: "play" | "pause";
  source: string;
}

export function miniState(n: NowPlaying | null, nowMs: number, maxChars = 26): MiniState {
  if (!n || !n.hasSession || (!n.title && !n.artist)) {
    return { visible: false, label: "", marquee: false, progress: 0, canToggle: false, icon: "play", source: "" };
  }
  const label = n.artist ? `${n.title} · ${n.artist}` : n.title;
  const pos = livePosition(n, nowMs);
  return {
    visible: true,
    label,
    marquee: label.length > maxChars,
    progress: n.durationMs > 0 ? Math.min(1, pos / n.durationMs) : 0,
    canToggle: n.status === "playing" ? n.controls.pause : n.controls.play,
    icon: n.status === "playing" ? "pause" : "play",
    source: n.sourceLabel,
  };
}

// ------------------------------------------------------------------------- colour

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export function hexToRgb(hex: string): RGB | null {
  const h = hex.trim().replace(/^#/, "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  const v = parseInt(full, 16);
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
}

export function rgbToHex(c: RGB): string {
  return "#" + [c.r, c.g, c.b].map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, "0")).join("");
}

export function mix(a: RGB, b: RGB, t: number): RGB {
  const k = Math.max(0, Math.min(1, t));
  return { r: a.r + (b.r - a.r) * k, g: a.g + (b.g - a.g) * k, b: a.b + (b.b - a.b) * k };
}

export function luminance(c: RGB): number {
  const ch = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b);
}

export function contrast(a: RGB, b: RGB): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** Moves `fg` towards white (dark bg) or black (light bg) until it reaches `min` contrast. */
export function ensureContrast(fg: RGB, bg: RGB, min: number): RGB {
  // Checked on whole-number channels, since the result ends up as a hex colour.
  const round = (c: RGB): RGB => ({ r: Math.round(c.r), g: Math.round(c.g), b: Math.round(c.b) });
  if (contrast(round(fg), bg) >= min) return round(fg);
  const target = luminance(bg) < 0.5 ? { r: 255, g: 255, b: 255 } : { r: 0, g: 0, b: 0 };
  for (let i = 1; i <= 40; i++) {
    const c = round(mix(fg, target, i / 40));
    if (contrast(c, bg) >= min) return c;
  }
  return target;
}

function rgbToHsl(c: RGB): { h: number; s: number; l: number } {
  const r = c.r / 255, g = c.g / 255, b = c.b / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h /= 6;
  return { h, s, l };
}

/**
 * Palette from RGBA pixels (e.g. a 32×32 downscale of the artwork): a small median-cut
 * quantiser. Returns up to `count` colours, most populous first.
 */
export function quantize(pixels: Uint8ClampedArray | number[], count = 6): { color: RGB; weight: number }[] {
  const pts: [number, number, number][] = [];
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    if (pixels[i + 3] < 128) continue;
    pts.push([pixels[i], pixels[i + 1], pixels[i + 2]]);
  }
  if (!pts.length) return [];
  let boxes: [number, number, number][][] = [pts];
  while (boxes.length < count) {
    // Split the box with the widest channel range.
    let best = -1, bestRange = -1, bestCh = 0;
    boxes.forEach((b, i) => {
      if (b.length < 2) return;
      for (let ch = 0; ch < 3; ch++) {
        let lo = 255, hi = 0;
        for (const p of b) {
          if (p[ch] < lo) lo = p[ch];
          if (p[ch] > hi) hi = p[ch];
        }
        if (hi - lo > bestRange) [best, bestRange, bestCh] = [i, hi - lo, ch];
      }
    });
    if (best < 0 || bestRange <= 0) break;
    const box = boxes[best].slice().sort((a, b) => a[bestCh] - b[bestCh]);
    const mid = box.length >> 1;
    boxes = [...boxes.slice(0, best), box.slice(0, mid), box.slice(mid), ...boxes.slice(best + 1)];
  }
  const raw = boxes
    .filter((b) => b.length)
    .map((b) => {
      const sum = b.reduce((a, p) => [a[0] + p[0], a[1] + p[1], a[2] + p[2]], [0, 0, 0]);
      return { color: { r: sum[0] / b.length, g: sum[1] / b.length, b: sum[2] / b.length }, weight: b.length / pts.length };
    });
  // Median cut can split one flat colour across boxes: merge near-identical results.
  const merged: { color: RGB; weight: number }[] = [];
  for (const e of raw) {
    const twin = merged.find((m) => Math.hypot(m.color.r - e.color.r, m.color.g - e.color.g, m.color.b - e.color.b) < 24);
    if (twin) {
      const w = twin.weight + e.weight;
      twin.color = mix(twin.color, e.color, e.weight / w);
      twin.weight = w;
    } else merged.push({ ...e });
  }
  return merged.sort((a, b) => b.weight - a.weight);
}

/** The colour that best represents the artwork as an accent: vivid and reasonably common. */
export function pickVivid(palette: { color: RGB; weight: number }[]): RGB | null {
  let best: RGB | null = null;
  let bestScore = -1;
  for (const p of palette) {
    const { s, l } = rgbToHsl(p.color);
    const score = s * (1 - Math.abs(l - 0.55) * 1.4) + p.weight * 0.6;
    if (score > bestScore) [best, bestScore] = [p.color, score];
  }
  return best;
}

/**
 * The music accent for the current pack: the artwork's vivid colour mixed into the pack's own
 * accent by `intensity`, then lifted until it reads (3:1) against the pack base.
 */
export function musicAccent(artwork: RGB | null, packAccent: string, packBase: string, intensity: number): string {
  const base = hexToRgb(packBase) ?? { r: 9, g: 9, b: 11 };
  const own = hexToRgb(packAccent) ?? { r: 250, g: 250, b: 250 };
  if (!artwork) return rgbToHex(ensureContrast(own, base, 3));
  return rgbToHex(ensureContrast(mix(own, artwork, Math.max(0, Math.min(1, intensity))), base, 3));
}

/** Deep, artwork-tinted gradient for the hero header and the frosted background. */
export function heroGradient(palette: { color: RGB; weight: number }[], base: string): string {
  const b = hexToRgb(base) ?? { r: 9, g: 9, b: 11 };
  const a = palette[0]?.color ?? b;
  const v = pickVivid(palette) ?? a;
  const top = rgbToHex(mix(b, v, 0.62));
  const mid = rgbToHex(mix(b, a, 0.38));
  return `linear-gradient(180deg, ${top} 0%, ${mid} 55%, ${rgbToHex(b)} 100%)`;
}

// ------------------------------------------------------------------------- sources

/** Which features a source can offer. GSMTC never exposes queue/library/like. */
export function sourceCaps(sessionId: string, spotifyConnected: boolean) {
  const id = sessionId.toLowerCase();
  const spotify = id.includes("spotify");
  const appleMusic = id.includes("applemusic");
  return {
    queue: spotify && spotifyConnected,
    library: spotify && spotifyConnected,
    like: spotify && spotifyConnected,
    note: appleMusic
      ? "Apple Music on Windows only shares what's playing. For a full themed client, Cider supports themes."
      : spotify && !spotifyConnected
        ? "Connect Spotify in Settings → Music to see your real queue and playlists."
        : "",
  };
}

// ------------------------------------------------------------------------- titles

/**
 * Splits "Song [From X: Original Score]" / "Song (From X)" / "Song - From X" into a title and a
 * lighter subtitle, like the reference header. Without such a suffix the subtitle is the album.
 */
export function splitTitle(title: string, album = ""): { main: string; sub: string } {
  const t = title.trim();
  const m = t.match(/^(.*?)\s*[[(]\s*(from\s[^\])]+)[\])]\s*$/i) || t.match(/^(.*?)\s+-\s+(from\s.+)$/i);
  if (m && m[1].trim()) return { main: m[1].trim(), sub: m[2].trim().replace(/^from/i, "From") };
  return { main: t, sub: album.trim() };
}

/** "A, B & C feat. D" → ["A", "B", "C", "D"] (max 6). */
export function splitArtists(artist: string): string[] {
  return artist
    .split(/\s*(?:,|&|\bfeat\.?|\bft\.?|\bx\b|;)\s*/i)
    .map((a) => a.trim())
    .filter(Boolean)
    .slice(0, 6);
}

export function initials(name: string): string {
  const parts = name.replace(/[^\p{L}\p{N}\s]/gu, "").trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "♪";
}

/** Total ms left: rest of the current track plus every queued item. */
export function queueRemaining(currentRemainingMs: number, items: { durationMs: number }[]): number {
  return Math.max(0, currentRemainingMs) + items.reduce((a, i) => a + Math.max(0, i.durationMs), 0);
}
