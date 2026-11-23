// Lens Color: conversions, palette history and WCAG contrast (mirrors coreapps/color.rs so the
// checker updates as you type). Pure.

export type RGB = [number, number, number];

export function parseHex(s: string): RGB | null {
  const h = s.trim().replace(/^#/, "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  const v = parseInt(full, 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

export const toHex = ([r, g, b]: RGB) => `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("").toUpperCase()}`;

export const normHex = (s: string) => {
  const p = parseHex(s);
  return p ? toHex(p) : null;
};

const ch = (c: number) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

export const luminance = ([r, g, b]: RGB) => 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);

export function contrast(a: RGB, b: RGB): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export interface Verdict {
  ratio: number;
  aaNormal: boolean;
  aaLarge: boolean;
  aaaNormal: boolean;
  aaaLarge: boolean;
  ui: boolean;
}

export function verdict(fg: RGB, bg: RGB): Verdict {
  const r = contrast(fg, bg);
  return { ratio: Math.round(r * 100) / 100, aaNormal: r >= 4.5, aaLarge: r >= 3, aaaNormal: r >= 7, aaaLarge: r >= 4.5, ui: r >= 3 };
}

/** One plain sentence for the verdict. */
export function verdictText(v: Verdict): string {
  if (v.aaaNormal) return "Easy to read at any size.";
  if (v.aaNormal) return "Fine for body text (AA). Not quite AAA.";
  if (v.aaLarge) return "Only for large or bold text and icons.";
  return "Too faint to read comfortably. Darken or lighten one colour.";
}

export function rgbToHsl([r, g, b]: RGB): [number, number, number] {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, Math.round(l * 100)];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === R ? (G - B) / d + (G < B ? 6 : 0) : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  h *= 60;
  return [Math.round(h), Math.round(s * 100), Math.round(l * 100)];
}

export function hslToRgb(h: number, s: number, l: number): RGB {
  const S = s / 100, L = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = S * Math.min(L, 1 - L);
  const f = (n: number) => L - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

/** Black or white, whichever reads better on `bg`. */
export const textOn = (bg: RGB): RGB => (contrast([0, 0, 0], bg) >= contrast([255, 255, 255], bg) ? [0, 0, 0] : [255, 255, 255]);

/**
 * The nearest lightness of `fg` (same hue and saturation) that reaches `target` against `bg`,
 * or null when none does. Used for "Fix it" suggestions.
 */
export function nudgeToContrast(fg: RGB, bg: RGB, target = 4.5): RGB | null {
  if (contrast(fg, bg) >= target) return fg;
  const [h, s, l] = rgbToHsl(fg);
  for (let d = 1; d <= 100; d++) {
    for (const nl of [l - d, l + d]) {
      if (nl < 0 || nl > 100) continue;
      const c = hslToRgb(h, s, nl);
      if (contrast(c, bg) >= target) return c;
    }
  }
  return null;
}

export const MAX_PALETTE = 24;

/** Newest first, no duplicates, capped. */
export function addToPalette(p: string[], hex: string): string[] {
  const h = normHex(hex);
  if (!h) return p;
  return [h, ...p.filter((x) => x !== h)].slice(0, MAX_PALETTE);
}

/** Formats a picked colour for copying. */
export function formats(hex: string): { label: string; value: string }[] {
  const rgb = parseHex(hex);
  if (!rgb) return [];
  const [h, s, l] = rgbToHsl(rgb);
  return [
    { label: "HEX", value: toHex(rgb) },
    { label: "RGB", value: `rgb(${rgb.join(", ")})` },
    { label: "HSL", value: `hsl(${h} ${s}% ${l}%)` },
    { label: "CSS var", value: `--accent: ${toHex(rgb)};` },
  ];
}
