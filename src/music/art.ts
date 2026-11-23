// Placeholder artwork and artwork palette sampling. Lens never ships real album art: the
// parity gallery and empty states use these generated covers.
import { quantize, type RGB } from "./model";

/** A generated abstract cover (SVG data URL) from a seed string. */
export function placeholderArt(seed: string, size = 512): string {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  const rnd = () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0) / 4294967296;
  const hue = Math.floor(rnd() * 360);
  const hue2 = (hue + 40 + Math.floor(rnd() * 80)) % 360;
  const blobs = Array.from({ length: 5 }, () => {
    const cx = Math.round(rnd() * size), cy = Math.round(rnd() * size), r = Math.round(size * (0.18 + rnd() * 0.3));
    const hh = rnd() > 0.5 ? hue : hue2;
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="hsl(${hh} 85% ${45 + Math.round(rnd() * 20)}%)" opacity="0.75"/>`;
  }).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><defs><filter id="b"><feGaussianBlur stdDeviation="${size / 14}"/></filter><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue} 70% 18%)"/><stop offset="1" stop-color="hsl(${hue2} 75% 10%)"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><g filter="url(#b)">${blobs}</g><rect x="${size * 0.08}" y="${size * 0.08}" width="${size * 0.84}" height="${size * 0.84}" fill="none" stroke="rgba(255,255,255,.18)" stroke-width="${size / 128}"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/** Samples an image URL (data: or same-origin) into a palette via a 32×32 canvas. */
export function samplePalette(src: string): Promise<{ color: RGB; weight: number }[]> {
  return new Promise((resolve) => {
    if (!src) return resolve([]);
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = c.height = 32;
        const g = c.getContext("2d", { willReadFrequently: true });
        if (!g) return resolve([]);
        g.drawImage(img, 0, 0, 32, 32);
        resolve(quantize(g.getImageData(0, 0, 32, 32).data, 6));
      } catch {
        resolve([]);
      }
    };
    img.onerror = () => resolve([]);
    img.src = src;
  });
}
