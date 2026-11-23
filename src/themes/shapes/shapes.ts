/**
 * Lens "Expressive" shape set: soft, Material-Expressive-style shapes drawn from pure maths,
 * so every shape is deterministic (same input → byte-identical SVG) and themeable through
 * CSS masks. Shapes carry no colour: surfaces fill them with the active pack's tokens.
 *
 *   cookie   – scalloped circle (clock faces, workspace-active indicator)
 *   flower   – deeper-lobed bloom (FAB, badges)
 *   burst    – soft irregular blob (weather / hero numerals)
 *   pill     – capsule
 *   squircle – superellipse (app icons, avatars)
 */

export type ShapeId = "cookie" | "flower" | "burst" | "pill" | "squircle";
export const SHAPE_IDS: readonly ShapeId[] = ["cookie", "flower", "burst", "pill", "squircle"];

const r3 = (n: number) => {
  const v = Math.round(n * 1000) / 1000;
  return Object.is(v, -0) ? "0" : String(v);
};

/** A closed path through `points`, smoothed with Catmull-Rom → cubic Bézier. */
function smoothClosedPath(points: [number, number][]): string {
  const n = points.length;
  const p = (i: number) => points[(i + n) % n];
  let d = `M${r3(p(0)[0])} ${r3(p(0)[1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = p(i - 1);
    const p1 = p(i);
    const p2 = p(i + 1);
    const p3 = p(i + 2);
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += `C${r3(c1x)} ${r3(c1y)} ${r3(c2x)} ${r3(c2y)} ${r3(p2[0])} ${r3(p2[1])}`;
  }
  return d + "Z";
}

/** Radial wave: r(θ) = 1 − depth·(1 − cos(lobes·θ))/2, sampled and smoothed, in a 100×100 box. */
function radialWave(lobes: number, depth: number, samplesPerLobe = 6, rotate = 0): string {
  const n = Math.max(12, Math.round(lobes * samplesPerLobe));
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const r = 50 * (1 - (depth * (1 - Math.cos(lobes * t))) / 2);
    pts.push([50 + r * Math.cos(t + rotate), 50 + r * Math.sin(t + rotate)]);
  }
  return smoothClosedPath(pts);
}

export interface ShapeOptions {
  /** Number of scallops / petals (cookie 6–16, flower 4–12). */
  lobes?: number;
  /** 0–0.5: how deep the scallops are. */
  depth?: number;
  /** Squircle exponent (2 = circle, 4 = classic squircle, 8 ≈ rounded square). */
  exponent?: number;
  /** Width/height ratio for the pill. */
  aspect?: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** SVG path data for a shape, in a 0..100 viewBox (pill: 0..100·aspect × 0..100). */
export function shapePath(id: ShapeId, opts: ShapeOptions = {}): string {
  switch (id) {
    case "cookie": {
      const lobes = Math.round(clamp(opts.lobes ?? 12, 6, 16));
      return radialWave(lobes, clamp(opts.depth ?? 0.1, 0.02, 0.3), 6, -Math.PI / 2);
    }
    case "flower": {
      const lobes = Math.round(clamp(opts.lobes ?? 8, 4, 12));
      return radialWave(lobes, clamp(opts.depth ?? 0.26, 0.1, 0.5), 8, -Math.PI / 2);
    }
    case "burst": {
      // A soft, slightly asymmetric blob: two low-frequency waves summed. Fixed phases keep it deterministic.
      const n = 48;
      const pts: [number, number][] = [];
      for (let i = 0; i < n; i++) {
        const t = (i / n) * Math.PI * 2;
        const r = 50 * (0.9 + 0.06 * Math.cos(3 * t + 0.6) + 0.04 * Math.cos(5 * t + 2.1));
        pts.push([50 + r * Math.cos(t), 50 + r * Math.sin(t)]);
      }
      return smoothClosedPath(pts);
    }
    case "pill": {
      const w = 100 * clamp(opts.aspect ?? 2.4, 1, 6);
      const r = 50;
      return `M${r3(r)} 0H${r3(w - r)}A${r} ${r} 0 0 1 ${r3(w - r)} 100H${r3(r)}A${r} ${r} 0 0 1 ${r3(r)} 0Z`;
    }
    case "squircle": {
      const e = clamp(opts.exponent ?? 4.5, 2, 12);
      const n = 64;
      const pts: [number, number][] = [];
      for (let i = 0; i < n; i++) {
        const t = (i / n) * Math.PI * 2;
        const c = Math.cos(t);
        const s = Math.sin(t);
        const x = Math.sign(c) * Math.pow(Math.abs(c), 2 / e);
        const y = Math.sign(s) * Math.pow(Math.abs(s), 2 / e);
        pts.push([50 + 50 * x, 50 + 50 * y]);
      }
      return smoothClosedPath(pts);
    }
  }
}

/** A complete standalone SVG (black fill) — for CSS masks and previews. */
export function shapeSvg(id: ShapeId, opts: ShapeOptions = {}): string {
  const w = id === "pill" ? r3(100 * clamp(opts.aspect ?? 2.4, 1, 6)) : "100";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} 100"><path d="${shapePath(id, opts)}" fill="#000"/></svg>`;
}

/** `url("data:image/svg+xml,…")` for `mask-image` / `-webkit-mask-image`. */
export function shapeMaskUrl(id: ShapeId, opts: ShapeOptions = {}): string {
  const enc = encodeURIComponent(shapeSvg(id, opts)).replace(/'/g, "%27").replace(/"/g, "%22");
  return `url("data:image/svg+xml,${enc}")`;
}

/** CSS custom properties the Expressive stylesheet reads (`--lens-shape-cookie`, …). */
export function shapeCssVariables(): Record<string, string> {
  return {
    "--lens-shape-cookie": shapeMaskUrl("cookie"),
    "--lens-shape-flower": shapeMaskUrl("flower"),
    "--lens-shape-burst": shapeMaskUrl("burst"),
    "--lens-shape-squircle": shapeMaskUrl("squircle"),
  };
}

export type ShapeStyle = "classic" | "expressive" | "dotmatrix";
export const SHAPE_STYLES: readonly { id: ShapeStyle; label: string; description: string }[] = [
  { id: "classic", label: "Classic", description: "Lens's standard shapes." },
  { id: "expressive", label: "Expressive", description: "Big rounded cards, pill tiles, scalloped clock and soft shapes." },
  { id: "dotmatrix", label: "Dot Matrix", description: "Flat tiles, LED-dot numerals and segmented stat pills." },
];
export function normalizeShapeStyle(raw?: string | null): ShapeStyle {
  return raw === "expressive" || raw === "dotmatrix" ? raw : "classic";
}

/**
 * Sets `data-shape` and the mask variables on the document root. Called from applyThemeToDocument;
 * "classic" removes everything, so packs without a shape style render exactly as before.
 */
export function applyShapeStyle(root: HTMLElement, raw?: string | null, accentHex?: string, surfaceHex?: string): ShapeStyle {
  const style = normalizeShapeStyle(raw);
  const vars = shapeCssVariables();
  if (style !== "classic") {
    root.dataset.shape = style;
    for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
    if (accentHex) {
      const fill = activeFillFor(accentHex, surfaceHex);
      root.style.setProperty("--lens-x-accent", fill);
      root.style.setProperty("--lens-on-accent", onAccentFor(fill));
    }
  } else {
    delete root.dataset.shape;
    for (const k of Object.keys(vars)) root.style.removeProperty(k);
    root.style.removeProperty("--lens-on-accent");
    root.style.removeProperty("--lens-x-accent");
  }
  return style;
}

function luminance(hex: string): number {
  const c = hex.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(c)) return 0;
  const ch = [0, 2, 4].map((i) => {
    const v = parseInt(c.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

/** WCAG contrast ratio of two #RRGGBB colours. */
export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Text colour for content drawn on an accent-filled pill/tile: whichever of near-black / near-white reads better. */
export function onAccentFor(accentHex: string): string {
  const dark = "#09090B";
  const light = "#FAFAFA";
  const best = contrast(accentHex, dark) >= contrast(accentHex, light) ? dark : light;
  if (contrast(accentHex, best) >= 4.5) return best;
  // Mid-tone accents: pure black or white always reaches at least ~4.58:1.
  return contrast(accentHex, "#000000") >= contrast(accentHex, "#FFFFFF") ? "#000000" : "#FFFFFF";
}

/**
 * Fill for active pills/tiles. The accent is used unless it would vanish into the surface
 * (e.g. a white accent on a light pack); then the pack's text colour is used instead.
 */
export function activeFillFor(accentHex: string, surfaceHex?: string): string {
  if (!surfaceHex || !/^#[0-9a-fA-F]{6}$/.test(accentHex) || !/^#[0-9a-fA-F]{6}$/.test(surfaceHex)) return accentHex;
  if (contrast(accentHex, surfaceHex) >= 1.6) return accentHex;
  return luminance(surfaceHex) > 0.4 ? "#18181B" : "#FAFAFA";
}
