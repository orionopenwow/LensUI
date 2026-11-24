// How different two theme packs look, as one number. Used by the audit (tools/themes/audit.ts →
// docs/THEMES_AUDIT.md), by the tests that keep the featured set distinct, and to file every other
// pack under the featured look it most resembles ("More themes").
//
// The palette terms are OKLab distances (perceptually even); the rest are small fixed costs for
// each part of the look that differs. A distance under NEAR_DUPLICATE reads as "the same theme
// with a tweak" on a preview card.
import { hexToRgb, srgbToOklab } from "../studio/backdrop/engine/color";
import { ambientFor } from "../playground/ambient/packMap";
import type { ThemePack } from "./packs";

export const NEAR_DUPLICATE = 0.3;

const lab = (hex: string) => srgbToOklab(hexToRgb(hex));
const deltaE = (a: string, b: string) => {
  const p = lab(a);
  const q = lab(b);
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
};

export const packBase = (p: ThemePack) => p.base ?? "#09090B";

/** The ambient or living scene a pack shows behind the desktop. */
export function packScene(p: ThemePack): string {
  if (p.tier === "Living") return p.id;
  return ambientFor(p.id, p.scheme !== "light").scene;
}

export interface DistanceParts {
  base: number;
  accent: number;
  scheme: number;
  shape: number;
  dock: number;
  chrome: number;
  backdrop: number;
}

export function distanceParts(a: ThemePack, b: ThemePack): DistanceParts {
  const differs = (x: unknown, y: unknown, cost: number) => (x === y ? 0 : cost);
  return {
    base: 2.2 * deltaE(packBase(a), packBase(b)),
    accent: 1.3 * deltaE(a.accent, b.accent),
    scheme: differs(a.scheme ?? "dark", b.scheme ?? "dark", 0.12),
    shape: differs(a.shapeStyle ?? "classic", b.shapeStyle ?? "classic", 0.22) + (0.3 * Math.abs(a.radius - b.radius)) / 20,
    dock: differs(a.dockStyle ?? "floating", b.dockStyle ?? "floating", 0.14),
    chrome:
      differs(a.frameStyle, b.frameStyle, 0.05) +
      differs(a.controlStyle, b.controlStyle, 0.03) +
      differs(a.iconTheme, b.iconTheme, 0.04) +
      differs(a.iconShape, b.iconShape, 0.02),
    backdrop: differs(packScene(a), packScene(b), 0.1),
  };
}

export function packDistance(a: ThemePack, b: ThemePack): number {
  const p = distanceParts(a, b);
  return p.base + p.accent + p.scheme + p.shape + p.dock + p.chrome + p.backdrop;
}

/** The pack in `among` closest to `pack`, with the distance. */
export function nearest(pack: ThemePack, among: ThemePack[]): { pack: ThemePack; distance: number } | null {
  let best: { pack: ThemePack; distance: number } | null = null;
  for (const other of among) {
    if (other.id === pack.id) continue;
    const d = packDistance(pack, other);
    if (!best || d < best.distance) best = { pack: other, distance: d };
  }
  return best;
}
