import { ACCENT, DEEP, INK, TAU, chan, clear, pack, words, type AmbientScene, type PaintFrame } from "../core";
import { makeRng } from "../../util";

interface S { layers: { y: number; f1: number; f2: number; p1: number; p2: number; sp: number }[]; bound: Float32Array }

/** Layered sine bands rolling slowly across the lower screen, with a faint crest line on each. */
export const wavesScene: AmbientScene = {
  id: "waves",
  name: "Rolling waves",
  blurb: "Layered swells rolling slowly across the screen.",
  scale: 6,
  pixelated: false,
  cycle: 48,
  painter: {
    init(w, _h, seed) {
      const rng = makeRng(seed ^ 0x51);
      const layers = Array.from({ length: 4 }, (_, i) => ({
        y: 0.42 + i * 0.13,
        f1: (TAU / w) * (1.1 + rng() * 0.6 + i * 0.25),
        f2: (TAU / w) * (2.6 + rng() * 1.2),
        p1: rng() * TAU,
        p2: rng() * TAU,
        sp: (i % 2 ? -1 : 1) * (0.8 + rng() * 0.5),
      }));
      return { layers, bound: new Float32Array(w * 4) } as S;
    },
    paint(f: PaintFrame, state) {
      const s = state as S;
      const { buf, w, h, t, ink, params } = f;
      const om = (TAU / wavesScene.cycle) * params.speed;
      const amp = h * 0.045;
      const L = s.layers.length;
      for (let l = 0; l < L; l++) {
        const ly = s.layers[l];
        const a = t * om * ly.sp;
        for (let x = 0; x < w; x++) {
          s.bound[l * w + x] = h * ly.y + amp * (0.65 * Math.sin(x * ly.f1 + a + ly.p1) + 0.35 * Math.sin(x * ly.f2 - a * 0.7 + ly.p2));
        }
      }
      clear(buf, ink);
      const k = Math.min(1, params.amount);
      // Dark packs: swells are a faint lift towards the ink (a near-black base can't get darker).
      // Light packs: swells sink a little towards the deep tint.
      const [d0, d1, d2] = chan(ink, f.dark ? INK : DEEP);
      const [c0, c1, c2] = chan(ink, INK);
      const [t0, t1, t2] = chan(ink, ACCENT);
      const b0 = ink.base[0], b1 = ink.base[1], b2 = ink.base[2];
      const bound = s.bound;
      // Rows above every crest are plain background.
      let top = h;
      for (let i = 0; i < bound.length; i++) if (bound[i] < top) top = bound[i];
      const y0 = Math.max(0, Math.floor(top - 2));
      const out = words(buf);
      for (let y = y0; y < h; y++) {
        let o = y * w;
        for (let x = 0; x < w; x++, o++) {
          let body = 0, crest = 0;
          for (let l = 0; l < L; l++) {
            const d = y - bound[l * w + x];
            if (d > -1.5) {
              body += d > 1.5 ? 0.15 : ((d + 1.5) / 3) * 0.15;
              const c = 1 - (d < 0 ? -d : d) / 1.6;
              if (c > crest) crest = c;
            }
          }
          if (body === 0 && crest <= 0) continue;
          // body ≤ 0.6·0.5 (dark) or 0.6 (light), crest ≤ 0.25, tint ≤ 0.15 → weights sum ≤ 1
          const wb = body * (f.dark ? 0.5 : 1) * k, wc = (crest > 0 ? crest * 0.25 : 0) * k, wt = body * 0.25 * k;
          out[o] = pack(b0 + wb * d0 + wc * c0 + wt * t0 + 0.5, b1 + wb * d1 + wc * c1 + wt * t1 + 0.5, b2 + wb * d2 + wc * c2 + wt * t2 + 0.5);
        }
      }
    },
  },
};
