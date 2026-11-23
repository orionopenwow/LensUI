import { ACCENT, INK, TAU, put, type AmbientScene, type PaintFrame } from "../core";
import { makeRng } from "../../util";

interface S { p: number[] }

/** Chunky teletext-style clouds drifting past a blocky moon. */
export const pixelCloudsScene: AmbientScene = {
  id: "pixel-clouds",
  name: "Pixel clouds",
  blurb: "Blocky clouds drifting slowly past a pixel moon.",
  scale: 16,
  pixelated: true,
  cycle: 90,
  painter: {
    init(_w, _h, seed) {
      const rng = makeRng(seed ^ 0xc1);
      return { p: [rng() * TAU, rng() * TAU, rng() * TAU] } as S;
    },
    paint(f: PaintFrame, state) {
      const s = state as S;
      const { buf, w, h, t, ink, params } = f;
      const drift = (t / pixelCloudsScene.cycle) * params.speed * w;
      const k = params.amount;
      const mx = w * 0.78, my = h * 0.25, mr = Math.max(2, h * 0.08);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const xx = x + drift;
          const v =
            0.5 + 0.5 * Math.sin(xx * (TAU / w) * 1.3 + s.p[0]) * Math.cos(y * (TAU / h) * 1.1 + s.p[1]) * 0.8 +
            0.25 * Math.sin(xx * (TAU / w) * 3.1 + y * 0.4 + s.p[2]);
          const band = y < h * 0.65 ? 1 : Math.max(0, 1 - (y - h * 0.65) / (h * 0.2));
          const q = v * band;
          const step = q > 0.95 ? 0.7 : q > 0.8 ? 0.35 : 0;
          const dx = x - mx, dy = y - my;
          const moon = dx * dx + dy * dy < mr * mr ? 0.9 : 0;
          put(buf, y * w + x, ink, INK, step * k, ACCENT, moon * k);
        }
      }
    },
  },
};
