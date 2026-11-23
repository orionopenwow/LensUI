import { ACCENT, ACCENT2, SURFACE, TAU, put, type AmbientScene, type PaintFrame } from "../core";
import { makeRng } from "../../util";

interface S { b: { ax: number; ay: number; fx: number; fy: number; p: number; r: number }[] }

/** Three large soft colour fields drifting and breathing (also the "misty" scene with low saturation). */
export const breatheScene: AmbientScene = {
  id: "breathe",
  name: "Soft gradient breathe",
  blurb: "Large soft colour fields drifting and breathing.",
  scale: 8,
  pixelated: false,
  cycle: 70,
  painter: {
    init(_w, _h, seed) {
      const rng = makeRng(seed ^ 0xb3);
      return {
        b: [0, 1, 2].map((i) => ({ ax: 0.2 + rng() * 0.6, ay: 0.25 + rng() * 0.5, fx: 1 + i * 0.37, fy: 0.7 + i * 0.29, p: rng() * TAU, r: 0.45 + rng() * 0.2 })),
      } as S;
    },
    paint(f: PaintFrame, state) {
      const s = state as S;
      const { buf, w, h, t, ink, params } = f;
      const om = (TAU / breatheScene.cycle) * params.speed;
      const m = Math.max(w, h);
      const c = s.b.map((b, i) => {
        const breathe = 1 + 0.12 * Math.sin(t * om * 0.8 + b.p * 2);
        const rr = b.r * m * breathe;
        return {
          x: w * (b.ax + 0.18 * Math.sin(t * om * b.fx + b.p)),
          y: h * (b.ay + 0.16 * Math.cos(t * om * b.fy + b.p + i)),
          inv: 1 / (rr * rr),
        };
      });
      const k = params.amount * 0.95;
      const [c0, c1, c2] = c;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          let dx = x - c0.x, dy = y - c0.y;
          let q = 1 - (dx * dx + dy * dy) * c0.inv;
          const v0 = q > 0 ? q * q : 0;
          dx = x - c1.x; dy = y - c1.y;
          q = 1 - (dx * dx + dy * dy) * c1.inv;
          const v1 = q > 0 ? q * q : 0;
          dx = x - c2.x; dy = y - c2.y;
          q = 1 - (dx * dx + dy * dy) * c2.inv;
          const v2 = q > 0 ? q * q : 0;
          put(buf, y * w + x, ink, ACCENT, v0 * k, ACCENT2, v1 * k, SURFACE, v2 * k);
        }
      }
    },
  },
};
