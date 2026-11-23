import { DEEP, INK, SURFACE, TAU, chan, pack, words, type AmbientScene, type PaintFrame } from "../core";
import { makeRng } from "../../util";

interface S { tex: Float32Array; tx: Float32Array; ty: Float32Array }

/** Near-static paper fibres with a very slow wash of light passing over them (light packs). */
export const paperScene: AmbientScene = {
  id: "paper",
  name: "Paper fibres",
  blurb: "Quiet paper texture with a slow wash of light.",
  scale: 5,
  pixelated: false,
  cycle: 85,
  painter: {
    init(w, h, seed) {
      const rng = makeRng(seed ^ 0x9a);
      const tex = new Float32Array(w * h);
      const n = Math.round((w * h) / 30);
      for (let i = 0; i < n; i++) {
        let x = rng() * w, y = rng() * h;
        const a = rng() * Math.PI, len = 3 + rng() * 8, v = 0.25 + rng() * 0.5;
        const dx = Math.cos(a), dy = Math.sin(a);
        for (let j = 0; j < len; j++, x += dx, y += dy) {
          const xi = x | 0, yi = y | 0;
          if (xi >= 0 && yi >= 0 && xi < w && yi < h) tex[yi * w + xi] = Math.min(1, tex[yi * w + xi] + v);
        }
      }
      return { tex, tx: new Float32Array(w), ty: new Float32Array(h) } as S;
    },
    paint(f: PaintFrame, state) {
      const s = state as S;
      const { buf, w, h, t, ink, params } = f;
      const ph = (t / paperScene.cycle) * TAU * params.speed;
      const k = Math.min(1, params.amount);
      // fibres ≤ 0.4, light ≤ 0.6 → weights sum ≤ 1
      for (let x = 0; x < w; x++) s.tx[x] = (0.5 + 0.5 * Math.sin((x / w) * TAU * 0.7 + ph)) * 0.6 * k;
      for (let y = 0; y < h; y++) s.ty[y] = 0.5 + 0.5 * Math.cos((y / h) * TAU * 0.5 - ph * 0.6);
      const [f0, f1, f2] = chan(ink, f.dark ? INK : DEEP);
      const [l0, l1, l2] = chan(ink, SURFACE);
      const b0 = ink.base[0], b1 = ink.base[1], b2 = ink.base[2];
      const tex = s.tex, tx = s.tx;
      const fk = 0.4 * k;
      const out = words(buf);
      let i = 0;
      for (let y = 0; y < h; y++) {
        const ly = s.ty[y];
        for (let x = 0; x < w; x++, i++) {
          const fw = tex[i] * fk;
          const lw = tx[x] * ly;
          out[i] = pack(b0 + fw * f0 + lw * l0 + 0.5, b1 + fw * f1 + lw * l1 + 0.5, b2 + fw * f2 + lw * l2 + 0.5);
        }
      }
    },
  },
};
