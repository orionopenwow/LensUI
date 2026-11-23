import { ACCENT, ACCENT2, DEEP, TAU, put, type AmbientScene, type PaintFrame } from "../core";
import { makeRng } from "../../util";

interface S { r: { y: number; f: number; g: number; p: number; q: number }[]; col: Float32Array }

/** Two soft ribbons of light drifting high in the sky; the sky darkens gently towards the top. */
export const driftAuroraScene: AmbientScene = {
  id: "drift-aurora",
  name: "Drift aurora",
  blurb: "Two soft ribbons of light drifting high above.",
  scale: 8,
  pixelated: false,
  cycle: 60,
  painter: {
    init(w, _h, seed) {
      const rng = makeRng(seed ^ 0xa7);
      const r = [0, 1].map((i) => ({ y: 0.26 + i * 0.12, f: (TAU / w) * (0.8 + rng() * 0.7), g: (TAU / w) * (2.2 + rng()), p: rng() * TAU, q: rng() * TAU }));
      return { r, col: new Float32Array(w * 6) } as S;
    },
    paint(f: PaintFrame, state) {
      const s = state as S;
      const { buf, w, h, t, ink, params } = f;
      const om = (TAU / driftAuroraScene.cycle) * params.speed;
      for (let j = 0; j < 2; j++) {
        const r = s.r[j];
        for (let x = 0; x < w; x++) {
          const o = (j * w + x) * 3;
          s.col[o] = h * r.y + h * 0.07 * Math.sin(x * r.f + t * om + r.p) + h * 0.03 * Math.sin(x * r.g - t * om * 1.3);
          s.col[o + 1] = h * (0.055 + 0.03 * (0.5 + 0.5 * Math.sin(x * r.g * 0.5 + t * om * 0.7 + r.q)));
          s.col[o + 2] = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(x * r.f * 1.7 - t * om * 0.9 + r.q));
        }
      }
      const k = params.amount;
      for (let y = 0; y < h; y++) {
        const sky = Math.max(0, 1 - y / (h * 0.55)) * 0.35;
        for (let x = 0; x < w; x++) {
          let a = 0, b = 0;
          for (let j = 0; j < 2; j++) {
            const o = (j * w + x) * 3;
            let d = (y - s.col[o]) / s.col[o + 1];
            if (d < 0) d *= 0.45; // curtains fade upwards, end sharper below
            const v = 1 - d * d;
            if (v > 0) {
              if (j === 0) a += v * s.col[o + 2] * 0.75;
              else b += v * s.col[o + 2] * 0.6;
            }
          }
          put(buf, y * w + x, ink, ACCENT, a * k, ACCENT2, b * k, DEEP, sky * k);
        }
      }
    },
  },
};
