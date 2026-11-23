import { ACCENT, TAU, chan, clear, pack, words, type AmbientScene, type PaintFrame } from "../core";
import { makeRng } from "../../util";

interface S { gap: number; rows: number; disp: Float32Array; phase: Float32Array; f: number[]; p: number[] }

/** Pen-plotter lines: each wavy line is slowly redrawn left to right, then fades, on its own schedule. */
export const plotterScene: AmbientScene = {
  id: "plotter",
  name: "Plotter lines",
  blurb: "Pen-plot lines slowly redrawing, one at a time.",
  scale: 4,
  pixelated: false,
  cycle: 45,
  painter: {
    init(w, h, seed) {
      const rng = makeRng(seed ^ 0x9e);
      const gap = 7;
      const rows = Math.ceil(h / gap) + 1;
      return {
        gap,
        rows,
        disp: new Float32Array(rows * w),
        phase: Float32Array.from({ length: rows }, () => rng()),
        f: [(TAU / w) * (1.2 + rng()), (TAU / w) * (3 + rng())],
        p: [rng() * TAU, rng() * TAU],
      } as S;
    },
    paint(f: PaintFrame, state) {
      const s = state as S;
      const { buf, w, h, t, ink, params } = f;
      const gap = s.gap / params.density;
      const rows = Math.min(s.rows, Math.ceil(h / gap) + 1);
      const ph = (t / plotterScene.cycle) * TAU * params.speed * 0.25;
      const amp = gap * 0.42;
      // sin(a + b) = sin a·cos b + cos a·sin b: per-column and per-row sines instead of rows × columns.
      const sa = new Float32Array(w), ca = new Float32Array(w), sb = new Float32Array(w), cb = new Float32Array(w);
      for (let x = 0; x < w; x++) {
        const a = x * s.f[0] + ph + s.p[0], b = x * s.f[1] - ph * 1.4 + s.p[1];
        sa[x] = Math.sin(a); ca[x] = Math.cos(a); sb[x] = Math.sin(b); cb[x] = Math.cos(b);
      }
      for (let r = 0; r < rows; r++) {
        const r1 = r * 0.35, r2 = -r * 0.2;
        const cr1 = Math.cos(r1) * 0.7 * amp, sr1 = Math.sin(r1) * 0.7 * amp;
        const cr2 = Math.cos(r2) * 0.3 * amp, sr2 = Math.sin(r2) * 0.3 * amp;
        for (let x = 0; x < w; x++) s.disp[r * w + x] = sa[x] * cr1 + ca[x] * sr1 + sb[x] * cr2 + cb[x] * sr2;
      }
      clear(buf, ink);
      const k = Math.min(1, params.amount) * 0.9;
      const [a0, a1, a2] = chan(ink, ACCENT);
      const b0 = ink.base[0] + 0.5, b1 = ink.base[1] + 0.5, b2 = ink.base[2] + 0.5;
      const out = words(buf);
      const prog = (t / plotterScene.cycle) * params.speed;
      // Walk each line along x and only touch the 2–3 pixels it covers.
      for (let r = 0; r < rows; r++) {
        // Each line: drawn over the first 70 % of its own cycle, then fades out.
        const c = (prog + s.phase[r]) % 1;
        const head = c < 0.7 ? c / 0.7 : 1;
        const fade = c < 0.85 ? 1 : 1 - (c - 0.85) / 0.15;
        const cy = r * gap;
        const end = Math.min(w, Math.floor(head * w));
        for (let x = 0; x < end; x++) {
          const yc = cy + s.disp[r * w + x];
          const y0 = Math.ceil(yc - 0.9), y1 = Math.floor(yc + 0.9);
          for (let y = y0; y <= y1; y++) {
            if (y < 0 || y >= h) continue;
            const d = Math.abs(y - yc);
            if (d >= 0.9) continue;
            const wv = (1 - d / 0.9) * fade * k;
            out[y * w + x] = pack(b0 + wv * a0, b1 + wv * a1, b2 + wv * a2);
          }
        }
      }
    },
  },
};
