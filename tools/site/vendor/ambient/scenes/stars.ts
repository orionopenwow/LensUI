import { ACCENT, DEEP, INK, TAU, put, type AmbientScene, type PaintFrame } from "../core";
import { makeRng } from "../../util";

interface S { stars: { x: number; y: number; z: number; p: number }[]; row: Uint8ClampedArray }

/** Sparse stars drifting sideways at three depths, twinkling very slowly over a faint sky gradient. */
export const starDriftScene: AmbientScene = {
  id: "star-drift",
  name: "Starfield drift",
  blurb: "Sparse stars drifting slowly at three depths.",
  scale: 3,
  pixelated: false,
  cycle: 90,
  painter: {
    init(w, h, seed) {
      const rng = makeRng(seed ^ 0x57);
      const n = Math.round((w * h) / 700);
      return {
        stars: Array.from({ length: n }, () => ({ x: rng() * w, y: rng() * h, z: 1 + Math.floor(rng() * 3), p: rng() * TAU })),
        row: new Uint8ClampedArray(w * 4),
      } as S;
    },
    paint(f: PaintFrame, state) {
      const s = state as S;
      const { buf, w, h, t, ink, params } = f;
      const k = params.amount;
      // Sky: one gradient row per y, copied across (cheap).
      for (let y = 0; y < h; y++) {
        const g = Math.max(0, 1 - y / h) * 0.45;
        put(s.row, 0, ink, DEEP, g * k, ACCENT, g * 0.25 * k);
        const r = s.row[0], gg = s.row[1], b = s.row[2];
        let o = y * w * 4;
        for (let x = 0; x < w; x++, o += 4) {
          buf[o] = r;
          buf[o + 1] = gg;
          buf[o + 2] = b;
          buf[o + 3] = 255;
        }
      }
      const drift = (t / starDriftScene.cycle) * params.speed;
      for (const st of s.stars) {
        const x = Math.floor((((st.x + drift * w * 0.25 * st.z) % w) + w) % w);
        const y = Math.floor(st.y);
        const tw = 0.55 + 0.45 * Math.sin(t * (TAU / 23) * params.speed + st.p);
        put(buf, y * w + x, ink, INK, (0.35 + st.z * 0.2) * tw * k, ACCENT, 0.1 * k);
      }
    },
  },
};
