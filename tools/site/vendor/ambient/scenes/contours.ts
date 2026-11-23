import { ACCENT, ACCENT2, TAU, chan, clear, pack, words, type AmbientScene, type AmbientPainter, type PaintFrame } from "../core";
import { makeRng } from "../../util";

interface S { fx: number[]; fy: number[]; p: number[]; tx: Float32Array; ty: Float32Array; prev: Float32Array }

function contourPainter(cycle: number, glow: boolean): AmbientPainter {
  return {
    init(w, h, seed) {
      const rng = makeRng(seed ^ (glow ? 0xc9 : 0xc3));
      return {
        fx: [1.3, 2.1, 3.4].map((v) => (TAU / w) * (v + rng() * 0.5)),
        fy: [1.1, 1.9, 2.9].map((v) => (TAU / h) * (v + rng() * 0.5)),
        p: [0, 1, 2, 3, 4, 5].map(() => rng() * TAU),
        tx: new Float32Array(w * 3),
        ty: new Float32Array(h * 3),
        prev: new Float32Array(w),
      } as S;
    },
    paint(f: PaintFrame, state) {
      const s = state as S;
      const { buf, w, h, t, ink, params } = f;
      const ph = (t / cycle) * TAU * params.speed;
      // Separable field: Σ sin(fx·x + a)·cos(fy·y + b); tables rebuilt per frame (3·(w + h) sines).
      for (let i = 0; i < 3; i++) {
        const a = ph * (i % 2 ? -0.7 : 1) + s.p[i];
        const b = ph * 0.5 * (i === 1 ? 1 : -1) + s.p[i + 3];
        const amp = [1, 0.6, 0.35][i];
        for (let x = 0; x < w; x++) s.tx[i * w + x] = amp * Math.sin(x * s.fx[i] + a);
        for (let y = 0; y < h; y++) s.ty[i * h + y] = Math.cos(y * s.fy[i] + b);
      }
      clear(buf, ink);
      const levels = 3.5 * params.density;
      const k = Math.min(1, params.amount);
      const [a0, a1, a2] = chan(ink, ACCENT);
      const [g0, g1, g2] = chan(ink, ACCENT2);
      const b0 = ink.base[0], b1 = ink.base[1], b2 = ink.base[2];
      const tx = s.tx, ty = s.ty, prev = s.prev;
      const out = words(buf);
      // Lines are drawn at a constant on-screen width: the distance to the nearest contour (in
      // field units) is divided by the local gradient (field units per pixel) from neighbours.
      const halfW = 0.55, glowW = 2.5;
      const reach = glow ? glowW : halfW + 0.5;
      const reach2 = reach * reach;
      for (let y = 0; y < h; y++) {
        const y0 = ty[y], y1 = ty[h + y], y2 = ty[2 * h + y];
        let o = y * w;
        let left = 0;
        for (let x = 0; x < w; x++, o++) {
          const g = (tx[x] * y0 + tx[w + x] * y1 + tx[2 * w + x] * y2 + 2) * levels;
          const gx = x > 0 ? g - left : 0;
          const gy = y > 0 ? g - prev[x] : 0;
          left = g;
          prev[x] = g;
          if (x === 0 || y === 0) continue;
          const fr = g - Math.floor(g);
          const dist = fr < 0.5 ? fr : 1 - fr;
          // Cheap reject without a square root: dist / |∇| ≥ reach  ⇔  dist² ≥ reach²·|∇|².
          const g2 = Math.max(0.0016, gx * gx + gy * gy);
          if (dist * dist >= reach2 * g2) continue;
          const d = dist / Math.sqrt(g2); // pixels to the nearest contour
          // line ≤ 0.85, halo ≤ 0.15 → weights sum ≤ 1
          const line = d < halfW + 0.5 ? Math.min(1, halfW + 0.5 - d) * 0.85 * k : 0;
          const halo = glow ? (1 - d / glowW) * 0.15 * k : 0;
          out[o] = pack(b0 + line * a0 + halo * g0 + 0.5, b1 + line * a1 + halo * g1 + 0.5, b2 + line * a2 + halo * g2 + 0.5);
        }
      }
    },
  };
}

/** Topographic contour lines slowly shifting, like a map of drifting hills. */
export const contoursScene: AmbientScene = {
  id: "contours",
  name: "Contour lines",
  blurb: "Topographic lines slowly reshaping.",
  scale: 5,
  pixelated: false,
  cycle: 75,
  painter: contourPainter(75, false),
};

/** Contours with a soft glow around each line (neon packs). */
export const glowContoursScene: AmbientScene = {
  id: "glow-contours",
  name: "Glow contours",
  blurb: "Softly glowing contour lines drifting slowly.",
  scale: 6,
  pixelated: false,
  cycle: 75,
  painter: contourPainter(75, true),
};
