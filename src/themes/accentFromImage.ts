/**
 * Accent colour from a wallpaper.
 *
 * `dominantAccent` is pure (RGBA pixels in, hex out) so it can be unit-tested without a browser.
 * `accentFromElement` draws an <img> / <video> into a small canvas and runs it. The element must be
 * same-origin or CORS-clean (Tauri's asset protocol sends CORS headers; set crossOrigin="anonymous").
 */

export interface AccentResult {
  /** The most prominent colourful hue, lightness/saturation adjusted to work as a UI accent. */
  accent: string;
  /** The raw average colour of that hue bucket, unadjusted. */
  raw: string;
  /** Share (0..1) of sampled pixels that were colourful enough to count. */
  coverage: number;
}

const HUE_BINS = 36;

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`.toUpperCase();
}

function toHex(r: number, g: number, b: number): string {
  return (
    "#" +
    [r, g, b]
      .map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0"))
      .join("")
  ).toUpperCase();
}

/**
 * Picks the dominant colourful hue. Near-black, near-white and grey pixels are ignored, and
 * each pixel is weighted by saturation so a small vivid sky beats a large muddy field less
 * than raw counts would suggest. Returns null when under 3% of the image is colourful
 * (monochrome / greyscale wallpapers): callers should keep the current accent.
 */
export function dominantAccent(rgba: ArrayLike<number>, step = 1): AccentResult | null {
  const weight = new Float64Array(HUE_BINS);
  const sumR = new Float64Array(HUE_BINS);
  const sumG = new Float64Array(HUE_BINS);
  const sumB = new Float64Array(HUE_BINS);
  let sampled = 0;
  let colourful = 0;

  for (let i = 0; i + 3 < rgba.length; i += 4 * step) {
    const a = rgba[i + 3];
    if (a < 128) continue;
    const r = rgba[i];
    const g = rgba[i + 1];
    const b = rgba[i + 2];
    sampled++;
    const [h, s, l] = rgbToHsl(r, g, b);
    if (l < 0.1 || l > 0.94 || s < 0.18) continue;
    colourful++;
    // Mid-lightness, saturated pixels count most.
    const w = s * (1 - Math.abs(l - 0.5) * 1.4);
    if (w <= 0) continue;
    const bin = Math.min(HUE_BINS - 1, Math.floor(h / (360 / HUE_BINS)));
    weight[bin] += w;
    sumR[bin] += r * w;
    sumG[bin] += g * w;
    sumB[bin] += b * w;
  }

  if (sampled === 0 || colourful / sampled < 0.03) return null;

  // Smooth across neighbouring bins so a hue split over a bin edge still wins.
  let best = 0;
  let bestScore = -1;
  for (let i = 0; i < HUE_BINS; i++) {
    const score =
      weight[i] + 0.5 * (weight[(i + 1) % HUE_BINS] + weight[(i + HUE_BINS - 1) % HUE_BINS]);
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  const w = weight[best];
  if (w <= 0) return null;
  const r = sumR[best] / w;
  const g = sumG[best] / w;
  const b = sumB[best] / w;
  const [h, s, l] = rgbToHsl(r, g, b);
  // Usable as an accent on both dark and light Lens surfaces.
  const accent = hslToHex(h, Math.max(0.45, Math.min(0.85, s)), Math.max(0.5, Math.min(0.66, l)));
  return { accent, raw: toHex(r, g, b), coverage: colourful / sampled };
}

/** Samples an image or the current video frame at ~64px and returns its accent. */
export function accentFromElement(el: HTMLImageElement | HTMLVideoElement): AccentResult | null {
  const srcW = el instanceof HTMLVideoElement ? el.videoWidth : el.naturalWidth;
  const srcH = el instanceof HTMLVideoElement ? el.videoHeight : el.naturalHeight;
  if (!srcW || !srcH) return null;
  const scale = 64 / Math.max(srcW, srcH);
  const w = Math.max(1, Math.round(srcW * scale));
  const h = Math.max(1, Math.round(srcH * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  try {
    ctx.drawImage(el, 0, 0, w, h);
    return dominantAccent(ctx.getImageData(0, 0, w, h).data);
  } catch {
    // Tainted canvas (not CORS-clean) or decode failure.
    return null;
  }
}

/** Loads an image URL off-screen and returns its accent. */
export function accentFromUrl(url: string): Promise<AccentResult | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => resolve(accentFromElement(img));
    img.onerror = () => resolve(null);
    img.src = url;
  });
}
