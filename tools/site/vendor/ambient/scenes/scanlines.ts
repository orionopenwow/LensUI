import { ACCENT, INK, TAU, chan, type AmbientScene, type PaintFrame } from "../core";

interface S { vx: Float32Array }

/** Fine scanlines with a soft glow band drifting down the screen, like an old monitor warming up. */
export const scanlineScene: AmbientScene = {
  id: "scanlines",
  name: "Scanline drift",
  blurb: "Fine scanlines with a slow glow band drifting down.",
  scale: 3,
  pixelated: true,
  cycle: 40,
  painter: {
    init(w) {
      return { vx: new Float32Array(w) } as S;
    },
    paint(f: PaintFrame, state) {
      const s = state as S;
      const { buf, w, h, t, ink, params } = f;
      const k = Math.min(1, params.amount);
      const pos = ((t / scanlineScene.cycle) * params.speed) % 1;
      const bandY = (pos * 1.4 - 0.2) * h;
      const bandH = h * 0.14;
      const glowX = 0.5 + 0.5 * Math.sin((t / scanlineScene.cycle) * TAU * 0.5 * params.speed);
      for (let x = 0; x < w; x++) s.vx[x] = 1 - Math.abs(x / w - glowX) * 0.6;
      const [i0, i1, i2] = chan(ink, INK);
      const [a0, a1, a2] = chan(ink, ACCENT);
      const b0 = ink.base[0], b1 = ink.base[1], b2 = ink.base[2];
      for (let y = 0; y < h; y++) {
        // line ≤ 0.35, band ≤ 0.65 → weights sum ≤ 1
        const line = y % 3 === 0 ? 0.35 * k : 0;
        const bd = Math.abs(y - bandY) / bandH;
        const band = bd < 1 ? (1 - bd) * (1 - bd) * 0.65 * k : 0;
        const r = b0 + line * i0, g = b1 + line * i1, b = b2 + line * i2;
        let o = y * w * 4;
        if (band === 0) {
          for (let x = 0; x < w; x++, o += 4) {
            buf[o] = r;
            buf[o + 1] = g;
            buf[o + 2] = b;
            buf[o + 3] = 255;
          }
        } else {
          for (let x = 0; x < w; x++, o += 4) {
            const wv = band * s.vx[x];
            buf[o] = r + wv * a0;
            buf[o + 1] = g + wv * a1;
            buf[o + 2] = b + wv * a2;
            buf[o + 3] = 255;
          }
        }
      }
    },
  },
};
