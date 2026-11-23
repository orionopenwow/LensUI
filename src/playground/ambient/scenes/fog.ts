import { ACCENT, INK, TAU, chan, pack, words, type AmbientScene, type PaintFrame } from "../core";
import { makeRng } from "../../util";

interface S { grain: Float32Array; gs: number; tx: Float32Array; ty: Float32Array; gx: Int32Array; p: number[] }

/** Slow-moving fog banks with a fine film grain that shifts only every half second (never flickers). */
export const grainFogScene: AmbientScene = {
  id: "grain-fog",
  name: "Grain fog",
  blurb: "Slow fog banks with a fine, calm film grain.",
  scale: 5,
  pixelated: false,
  cycle: 65,
  painter: {
    init(w, h, seed) {
      const rng = makeRng(seed ^ 0xf0);
      const gs = 64;
      const grain = new Float32Array(gs * gs);
      for (let i = 0; i < grain.length; i++) grain[i] = rng();
      return { grain, gs, tx: new Float32Array(w * 2), ty: new Float32Array(h * 2), gx: new Int32Array(w), p: [rng() * TAU, rng() * TAU, rng() * TAU, rng() * TAU] } as S;
    },
    paint(f: PaintFrame, state) {
      const s = state as S;
      const { buf, w, h, t, ink, params } = f;
      const ph = (t / grainFogScene.cycle) * TAU * params.speed;
      for (let x = 0; x < w; x++) {
        s.tx[x] = 0.6 * (0.5 + 0.5 * Math.sin((x / w) * TAU * 0.8 + ph + s.p[0]));
        s.tx[w + x] = 0.4 * (0.5 + 0.5 * Math.sin((x / w) * TAU * 1.7 - ph * 0.6 + s.p[1]));
      }
      for (let y = 0; y < h; y++) {
        s.ty[y] = 0.5 + 0.5 * Math.cos((y / h) * TAU * 0.6 + ph * 0.4 + s.p[2]);
        s.ty[h + y] = 0.5 + 0.5 * Math.cos((y / h) * TAU * 1.3 - ph * 0.3 + s.p[3]);
      }
      // Grain offset steps every ~0.6 s of scene time: texture without flicker.
      const step = Math.floor(t / 0.6);
      const ox = (step * 17) % s.gs, oy = (step * 29) % s.gs;
      for (let x = 0; x < w; x++) s.gx[x] = (x + ox) % s.gs;
      const k = Math.min(1, params.amount);
      const [a0, a1, a2] = chan(ink, ACCENT);
      const [i0, i1, i2] = chan(ink, INK);
      const b0 = ink.base[0], b1 = ink.base[1], b2 = ink.base[2];
      const tx = s.tx, gx = s.gx, grain = s.grain;
      const fk = 0.78 * k, gk = 0.22 * k; // fog ≤ 0.78, grain ≤ 0.22 → sum ≤ 1
      const out = words(buf);
      for (let y = 0; y < h; y++) {
        const a = s.ty[y], b = s.ty[h + y];
        const gy = ((y + oy) % s.gs) * s.gs;
        let o = y * w;
        for (let x = 0; x < w; x++, o++) {
          const fog = tx[x] * a + tx[w + x] * b;
          const fw = fog * fog * fk;
          const gw = grain[gy + gx[x]] * gk;
          out[o] = pack(b0 + fw * a0 + gw * i0 + 0.5, b1 + fw * a1 + gw * i1 + 0.5, b2 + fw * a2 + gw * i2 + 0.5);
        }
      }
    },
  },
};
