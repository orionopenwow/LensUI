import type { Palette, RGB } from "../types";

function hexToRgb(hex: string): RGB {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h.slice(0, 6), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** A palette for a pack that isn't applied yet (gallery cards), from its own values. */
export function packPalette(pack: { base?: string; accent: string; scheme?: string }, accentOverride?: string): Palette {
  const dark = pack.scheme !== "light";
  const base = hexToRgb(pack.base ?? (dark ? "#09090B" : "#F4F4F5"));
  const fg = dark ? { r: 250, g: 250, b: 250 } : { r: 24, g: 24, b: 27 };
  const elevated = dark
    ? { r: base.r + (255 - base.r) * 0.05, g: base.g + (255 - base.g) * 0.05, b: base.b + (255 - base.b) * 0.05 }
    : { r: 255, g: 255, b: 255 };
  return { accent: hexToRgb(accentOverride ?? pack.accent), base, elevated, fg, dark };
}

