// Dithered placeholder thumbnails: an ordered (Bayer 4×4) dither drawn as a tiny SVG pattern, tinted
// per app so rails don't look identical while official media loads (or when there is none).
// Deterministic for a given id, so screenshots and tests are stable. No network, no canvas.

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** FNV-1a hash of a string. */
export function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** A hue for an app id (0–359), avoiding muddy yellow-greens. */
export function hueFor(id: string): number {
  const h = hash(id) % 300;
  return h < 60 ? h : h + 60;
}

/**
 * SVG data URI: a seamless 16×16 Bayer-dithered dot tile at a fixed density (the Bayer period
 * divides the tile, so it repeats without seams). The card adds a soft glow on top in CSS.
 * `dark` picks dot colours that sit on Lens's dark or light surfaces.
 */
export function placeholderDataUri(id: string, dark = true, cell = 3): string {
  const hue = hueFor(id);
  const dot = dark ? `hsl(${hue} 55% 62%)` : `hsl(${hue} 50% 42%)`;
  const bg = dark ? `hsl(${hue} 22% 9%)` : `hsl(${hue} 30% 95%)`;
  const n = 16;
  const rects: string[] = [];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const level = 0.34;
      const threshold = (BAYER4[(y % 4) * 4 + (x % 4)] + 0.5) / 16;
      if (level > threshold) rects.push(`<rect x="${x * cell}" y="${y * cell}" width="${cell - 1}" height="${cell - 1}"/>`);
    }
  }
  const size = n * cell;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    `<rect width="${size}" height="${size}" fill="${bg}"/><g fill="${dot}" fill-opacity="0.55">${rects.join("")}</g></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** Monogram for a placeholder ("Concat" → "Co", "OBS Studio" → "OS", "7-Zip" → "7Z"). */
export function monogram(name: string): string {
  const words = name.replace(/[^\p{L}\p{N}\s-]/gu, "").split(/[\s-]+/).filter(Boolean);
  if (!words.length) return "?";
  if (words.length === 1) return words[0].slice(0, 2).replace(/^(.)(.)/, (_m, a, b) => a.toUpperCase() + b.toLowerCase());
  return (words[0][0] + words[1][0]).toUpperCase();
}
