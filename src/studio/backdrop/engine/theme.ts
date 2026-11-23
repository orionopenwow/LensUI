/**
 * "Make a theme from this": a backdrop's palette → a readable Lens custom pack.
 * Base comes from the darkest (or, for light backdrops, lightest) stop, darkened / lifted until
 * the pack's own text passes WCAG AA; the accent is the most colourful stop that stands out
 * from the base by at least 3:1.
 */
import { contrast, gamutMapOklch, hexToRgb, relLuminance, rgbToHex, srgbToOklch, tidyStops } from "./color";
import { encodeState, type BackdropState } from "./state";

export interface PackFromBackdrop {
  pack: {
    id: string;
    label: string;
    base: string;
    accent: string;
    radius: number;
    scheme: "dark" | "light";
    iconTheme: string;
    iconShape: string;
    folderTheme: string;
    frameStyle: string;
    controlStyle: string;
  };
  /** Contrast of text on the base and of the accent on the base. */
  report: { text: number; accent: number; ok: boolean };
}

const DARK_TEXT = "#FAFAFA";
const LIGHT_TEXT = "#18181B";

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24) || "backdrop"
  );
}

export function backdropToPack(s: BackdropState, name = s.name || "Backdrop", preferLight = false): PackFromBackdrop {
  const stops = tidyStops(s.stops).map((st) => st.color);
  const byL = [...stops].sort((a, b) => relLuminance(a) - relLuminance(b));
  const light = preferLight || relLuminance(byL[Math.floor(byL.length / 2)]) > 0.45;
  const text = light ? LIGHT_TEXT : DARK_TEXT;
  // Base: the extreme stop, nudged in OKLCH lightness until text reads at ≥ 4.5:1 (we aim for 7).
  let [L, C, h] = srgbToOklch(hexToRgb(light ? byL[byL.length - 1] : byL[0]));
  C = Math.min(C, 0.05);
  let base = rgbToHex(gamutMapOklch([L, C, h]));
  for (let i = 0; i < 40 && contrast(base, text) < 7; i++) {
    L = light ? Math.min(0.99, L + 0.02) : Math.max(0.04, L - 0.02);
    base = rgbToHex(gamutMapOklch([L, C, h]));
  }
  // Accent: most chroma among stops with ≥ 3:1 against the base, else push the most colourful one.
  const scored = stops.map((c) => ({ c, chroma: srgbToOklch(hexToRgb(c))[1], k: contrast(c, base) }));
  let pick = scored.filter((x) => x.k >= 3).sort((a, b) => b.chroma - a.chroma)[0]?.c;
  if (!pick) {
    const top = scored.sort((a, b) => b.chroma - a.chroma)[0].c;
    let [al, ac, ah] = srgbToOklch(hexToRgb(top));
    let cand = top;
    for (let i = 0; i < 40 && contrast(cand, base) < 3; i++) {
      al = light ? Math.max(0.2, al - 0.02) : Math.min(0.95, al + 0.02);
      cand = rgbToHex(gamutMapOklch([al, ac, ah]));
    }
    pick = cand;
  }
  const textK = contrast(base, text);
  const accentK = contrast(pick, base);
  const slug = slugify(name);
  return {
    pack: {
      id: `custom-bd-${slug}`,
      label: name.replace(/[^\w .'&-]/g, "").slice(0, 40).trim() || "Backdrop",
      base: base.toUpperCase(),
      accent: pick.toUpperCase(),
      radius: 12,
      scheme: light ? "light" : "dark",
      iconTheme: "frosted-glass",
      iconShape: "squircle",
      folderTheme: "accent",
      frameStyle: "accent-glow",
      controlStyle: "traffic-muted",
    },
    report: { text: textK, accent: accentK, ok: textK >= 4.5 && accentK >= 3 },
  };
}

/** Extra `.lenstheme` field: the backdrop code, so the theme carries its living wallpaper. */
export function backdropField(s: BackdropState): { backdrop: string } {
  return { backdrop: encodeState(s) };
}
