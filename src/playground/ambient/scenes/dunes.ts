import { ACCENT, BAYER4, DEEP, INK, TAU, chan, clear, pack, words, type AmbientScene, type PaintFrame } from "../core";
import { makeRng } from "../../util";

interface S { ridges: { y: number; f: number; g: number; p: number }[]; top: Float32Array }

/** One-bit dune ridges sliding sideways under a dithered sun (ordered dither, nearest-neighbour). */
export const ditherDunesScene: AmbientScene = {
  id: "dither-dunes",
  name: "Dither dunes",
  blurb: "One-bit dunes sliding slowly under a dotted sun.",
  scale: 4,
  pixelated: true,
  cycle: 80,
  painter: {
    init(w, _h, seed) {
      const rng = makeRng(seed ^ 0xd1);
      return {
        ridges: [0, 1, 2].map((i) => ({ y: 0.55 + i * 0.12, f: (TAU / w) * (0.9 + i * 0.4 + rng() * 0.3), g: (TAU / w) * (2.4 + rng()), p: rng() * TAU })),
        top: new Float32Array(w * 3),
      } as S;
    },
    paint(f: PaintFrame, state) {
      const s = state as S;
      const { buf, w, h, t, ink, params } = f;
      const slide = (t / ditherDunesScene.cycle) * TAU * params.speed;
      for (let j = 0; j < 3; j++) {
        const r = s.ridges[j];
        for (let x = 0; x < w; x++) s.top[j * w + x] = h * r.y + h * 0.06 * Math.sin(x * r.f + slide * (1 + j * 0.3) + r.p) + h * 0.02 * Math.sin(x * r.g - slide);
      }
      clear(buf, ink);
      const k = Math.min(1, params.amount);
      const sx = w * 0.72, sy = h * 0.3, sr = h * 0.09 * (1 + 0.04 * Math.sin(slide * 0.5));
      const sr2 = sr * sr;
      // One-bit output: four possible colours, packed once per frame. Body ≤ 0.85·k… but a pixel
      // that is both dune and sun uses the sun only, so weights never sum above 1.
      const [d0, d1, d2] = chan(ink, f.dark ? INK : DEEP);
      const [a0, a1, a2] = chan(ink, ACCENT);
      const b0 = ink.base[0] + 0.5, b1 = ink.base[1] + 0.5, b2 = ink.base[2] + 0.5;
      const BODY = pack(b0 + 0.85 * k * d0, b1 + 0.85 * k * d1, b2 + 0.85 * k * d2);
      const SUN = pack(b0 + 0.9 * k * a0, b1 + 0.9 * k * a1, b2 + 0.9 * k * a2);
      const out = words(buf);
      const top = s.top;
      const fall = 1 / (h * 0.3);
      let minTop = h;
      for (let i = 0; i < top.length; i++) if (top[i] < minTop) minTop = top[i];
      for (let y = 0; y < h; y++) {
        const nearSun = Math.abs(y - sy) < sr;
        if (y < minTop && !nearSun) continue;
        const brow = (y & 3) * 4;
        let o = y * w;
        for (let x = 0; x < w; x++, o++) {
          const th = BAYER4[(x & 3) + brow];
          if (nearSun) {
            const dx = x - sx, dy = y - sy;
            const sun = 1 - (dx * dx + dy * dy) / sr2;
            if (sun > 0 && sun * 0.9 > th) {
              out[o] = SUN;
              continue;
            }
          }
          let v = 0;
          for (let j = 0; j < 3; j++) {
            const d = y - top[j * w + x];
            if (d > 0) {
              const q = (0.22 + j * 0.16) * (1 - Math.min(1, d * fall)) + 0.08;
              if (q > v) v = q;
            }
          }
          if (v > th) out[o] = BODY;
        }
      }
    },
  },
};
