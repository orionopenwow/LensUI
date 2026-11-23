import { ACCENT, TAU, chan, clear, pack, words, type AmbientScene, type PaintFrame } from "../core";

interface S { cell: number; cols: number; rows: number; rad: Float32Array }

/** A halftone dot field whose dot sizes swell in a slow tide from the bottom of the screen. */
export const halftoneTideScene: AmbientScene = {
  id: "halftone-tide",
  name: "Halftone tide",
  blurb: "A dot field whose dots swell in a slow tide.",
  scale: 4,
  pixelated: false,
  cycle: 50,
  painter: {
    init(w, h) {
      const cell = 6;
      const cols = Math.ceil(w / cell), rows = Math.ceil(h / cell);
      return { cell, cols, rows, rad: new Float32Array(cols * rows) } as S;
    },
    paint(f: PaintFrame, state) {
      const s = state as S;
      const { buf, w, h, t, ink, params } = f;
      const ph = (t / halftoneTideScene.cycle) * TAU * params.speed;
      const half = s.cell / 2;
      for (let cy = 0; cy < s.rows; cy++) {
        const depth = Math.min(1, Math.max(0, (cy / s.rows - 0.25) / 0.75));
        for (let cx = 0; cx < s.cols; cx++) {
          const wave = 0.5 + 0.5 * Math.sin(cx * 0.21 * params.density + cy * 0.12 - ph);
          const r = half * 0.95 * (0.12 + 0.88 * depth * wave * wave);
          s.rad[cy * s.cols + cx] = r * r;
        }
      }
      clear(buf, ink);
      const k = Math.min(1, params.amount) * 0.9;
      const [a0, a1, a2] = chan(ink, ACCENT);
      const b0 = ink.base[0] + 0.5, b1 = ink.base[1] + 0.5, b2 = ink.base[2] + 0.5;
      const FULL = pack(b0 + k * a0, b1 + k * a1, b2 + k * a2);
      const out = words(buf);
      const cell = s.cell;
      // Draw each dot inside its own cell box instead of testing every pixel.
      for (let cy = 0; cy < s.rows; cy++) {
        for (let cx = 0; cx < s.cols; cx++) {
          const r2 = s.rad[cy * s.cols + cx];
          if (r2 < 0.05) continue;
          const ox = cx * cell, oy = cy * cell;
          for (let py = 0; py < cell; py++) {
            const y = oy + py;
            if (y >= h) break;
            const dy = py - half + 0.5;
            for (let px = 0; px < cell; px++) {
              const x = ox + px;
              if (x >= w) break;
              const dx = px - half + 0.5;
              const d2 = dx * dx + dy * dy;
              if (d2 >= r2) continue;
              const e = (r2 - d2) / 2;
              if (e >= 1) out[y * w + x] = FULL;
              else {
                const wv = e * k;
                out[y * w + x] = pack(b0 + wv * a0, b1 + wv * a1, b2 + wv * a2);
              }
            }
          }
        }
      }
    },
  },
};
