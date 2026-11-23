import { ACCENT, DEEP, TAU, chan, pack, words, type AmbientScene, type PaintFrame } from "../core";
import { makeRng } from "../../util";

interface S { a: Float32Array; b: Float32Array; c: Float32Array; p: number[] }

/** Underwater light: a slow network of caustics over water that deepens towards the bottom. */
export const causticsScene: AmbientScene = {
  id: "caustics",
  name: "Slow caustics",
  blurb: "Underwater light rippling slowly over deep water.",
  scale: 5,
  pixelated: false,
  cycle: 55,
  painter: {
    init(w, h, seed) {
      const rng = makeRng(seed ^ 0xca);
      return { a: new Float32Array(w), b: new Float32Array(h), c: new Float32Array(w + h), p: [rng() * TAU, rng() * TAU, rng() * TAU] } as S;
    },
    paint(f: PaintFrame, state) {
      const s = state as S;
      const { buf, w, h, t, ink, params } = f;
      const ph = (t / causticsScene.cycle) * TAU * params.speed;
      const m = Math.max(w, h);
      const fr = (TAU / m) * 5 * params.density;
      for (let x = 0; x < w; x++) s.a[x] = Math.sin(x * fr + ph + s.p[0]);
      for (let y = 0; y < h; y++) s.b[y] = Math.sin(y * fr * 1.2 - ph * 0.8 + s.p[1]);
      for (let i = 0; i < w + h; i++) s.c[i] = Math.sin(i * fr * 0.7 + ph * 0.6 + s.p[2]);
      const k = Math.min(1, params.amount);
      const [a0, a1, a2] = chan(ink, ACCENT);
      const [d0, d1, d2] = chan(ink, DEEP);
      const b0 = ink.base[0], b1 = ink.base[1], b2 = ink.base[2];
      const A = s.a, C = s.c;
      const out = words(buf);
      for (let y = 0; y < h; y++) {
        const deep = (y / h) * 0.2 * k; // ≤ 0.2
        const by = s.b[y];
        const r = b0 + deep * d0 + 0.5, g = b1 + deep * d1 + 0.5, bb = b2 + deep * d2 + 0.5;
        let o = y * w;
        for (let x = 0; x < w; x++, o++) {
          let v = A[x] + by + C[x + y];
          v = 1 - (v < 0 ? -v : v) / 1.1;
          const c = v > 0 ? v * v * v * 0.8 * k : 0; // ≤ 0.8
          out[o] = pack(r + c * a0, g + c * a1, bb + c * a2);
        }
      }
    },
  },
};
