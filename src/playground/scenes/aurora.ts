import type { Palette, SceneContext, SceneInstance, SceneModule } from "../types";
import { normaliseOptions } from "../types";
import { css, hslToRgb, makeNoise2, makeRng, mix, rgbToHsl } from "../util";

/** Northern lights: slow curtains of light above a dark horizon, tinted by the accent. */
export const auroraScene: SceneModule = {
  id: "aurora",
  name: "Aurora",
  blurb: "Slow curtains of light drifting over a quiet horizon, tinted by your accent.",
  interactive: false,
  calm: true,
  maxFps: 30,
  warmup: 10,
  settings: [
    { key: "speed", label: "Speed", type: "range", min: 0.1, max: 2, step: 0.1, default: 0.5 },
    { key: "glow", label: "Glow", type: "range", min: 0.2, max: 1.5, step: 0.05, default: 0.9 },
    { key: "stars", label: "Stars", type: "toggle", default: true },
  ],
  create(ctx: SceneContext): SceneInstance {
    let opts = normaliseOptions(auroraScene, ctx.options);
    // Auroras only happen at night: light themes get a deep blue night sky instead of white.
    const toNight = (p: Palette): Palette =>
      p.dark ? p : { ...p, base: { r: 16, g: 22, b: 44 }, elevated: { r: 30, g: 40, b: 72 }, fg: { r: 235, g: 238, b: 250 }, dark: true };
    let palette = toNight(ctx.palette);
    let width = ctx.width, height = ctx.height, dpr = ctx.dpr;
    const g = ctx.canvas.getContext("2d", { alpha: false })!;
    const noise = makeNoise2(ctx.seed);
    const rng = makeRng(ctx.seed ^ 99);
    // Curtains are drawn at low resolution and scaled up (soft for free, cheap).
    const low = document.createElement("canvas");
    let lg = low.getContext("2d")!;
    let stars: { x: number; y: number; r: number; p: number }[] = [];
    let t = 30;

    const build = () => {
      ctx.canvas.width = Math.round(width * dpr);
      ctx.canvas.height = Math.round(height * dpr);
      low.width = Math.max(32, Math.round(width / 8));
      low.height = Math.max(32, Math.round(height / 6));
      lg = low.getContext("2d")!;
      stars = Array.from({ length: Math.round((width * height) / 9000) }, () => ({
        x: rng() * width,
        y: Math.pow(rng(), 1.4) * height * 0.75,
        r: 0.4 + Math.pow(rng(), 4) * 1.4,
        p: rng() * 6.28,
      }));
    };
    build();

    const hues = () => {
      const [h, s] = rgbToHsl(palette.accent);
      const base = s < 0.12 ? 150 : h;
      return [base, base + 45, base - 60];
    };
    // 1×64 gradient sprites per band: transparent top, glowing lower edge, soft cut-off.
    let sprites: HTMLCanvasElement[] = [];
    const buildSprites = () => {
      sprites = hues().map((hue, i) => {
        const c = Object.assign(document.createElement("canvas"), { width: 1, height: 64 });
        const x = c.getContext("2d")!;
        const col = hslToRgb(hue, palette.dark ? 0.8 : 0.7, palette.dark ? 0.58 : 0.42);
        const hot = mix(col, { r: 255, g: 255, b: 255 }, palette.dark ? 0.35 : 0.15);
        const gr = x.createLinearGradient(0, 0, 0, 64);
        gr.addColorStop(0, css(col, 0));
        gr.addColorStop(0.55, css(col, i === 0 ? 0.28 : 0.2));
        gr.addColorStop(0.86, css(hot, 0.75));
        gr.addColorStop(0.93, css(col, 0.35));
        gr.addColorStop(1, css(col, 0));
        x.fillStyle = gr;
        x.fillRect(0, 0, 1, 64);
        return c;
      });
    };
    buildSprites();

    return {
      step(dt) {
        t += dt * Number(opts.speed);
      },
      render() {
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        const sky0 = palette.dark ? mix(palette.base, { r: 0, g: 0, b: 0 }, 0.35) : mix(palette.base, palette.elevated, 0.2);
        const sky1 = palette.dark ? mix(sky0, hslToRgb(hues()[0], 0.5, 0.25), 0.35) : mix(palette.base, palette.accent, 0.1);
        const grad = g.createLinearGradient(0, 0, 0, height);
        grad.addColorStop(0, css(sky0));
        grad.addColorStop(0.86, css(sky1));
        grad.addColorStop(1, css(palette.base));
        g.fillStyle = grad;
        g.fillRect(0, 0, width, height);
        if (opts.stars && palette.dark) {
          for (const s of stars) {
            g.fillStyle = css(palette.fg, 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(t * 2 + s.p)));
            g.fillRect(s.x, s.y, s.r, s.r);
          }
        }
        // Curtains: each column is one pre-rendered vertical gradient sprite, stretched and
        // faded per column (no per-frame gradient objects), with fine ray striations.
        const W = low.width, H = low.height;
        lg.globalCompositeOperation = "source-over";
        lg.clearRect(0, 0, W, H);
        lg.globalCompositeOperation = palette.dark ? "lighter" : "source-over";
        const glow = Number(opts.glow) * (palette.dark ? 1 : 0.95);
        for (let band = 0; band < 3; band++) {
          const sprite = sprites[band];
          const baseY = H * (0.42 + band * 0.08);
          for (let x = 0; x < W; x++) {
            const nx = x / W;
            const yOff = noise(nx * 2.2 + band * 7, t * 0.12 + band) * H * 0.2 + Math.sin(nx * 4 + t * 0.25 + band * 2) * H * 0.05;
            const body = Math.max(0, noise(nx * 4 + band * 3, t * 0.22) * 0.9 + 0.3);
            const rays = 0.65 + 0.35 * noise(nx * 60 + band * 11, t * 0.6);
            const a = Math.min(1, body * rays * glow * (band === 0 ? 1 : 0.75));
            if (a < 0.02) continue;
            const length = H * (0.26 + 0.24 * Math.max(0, noise(nx * 3.5, t * 0.2 + band * 5) + 0.3));
            const bottom = baseY + yOff;
            lg.globalAlpha = a;
            lg.drawImage(sprite, 0, 0, 1, 64, x, bottom - length, 1.25, length + H * 0.04);
          }
        }
        lg.globalAlpha = 1;
        g.imageSmoothingEnabled = true;
        g.imageSmoothingQuality = "high";
        g.globalCompositeOperation = palette.dark ? "lighter" : "source-over";
        g.drawImage(low, 0, 0, width, height);
        g.globalCompositeOperation = "source-over";
        // Horizon: two layers of soft hills.
        for (let layer = 0; layer < 2; layer++) {
          const c = palette.dark ? mix(palette.base, { r: 0, g: 0, b: 0 }, 0.45 + layer * 0.3) : mix(palette.base, palette.fg, 0.1 + layer * 0.12);
          g.fillStyle = css(c);
          g.beginPath();
          g.moveTo(0, height);
          for (let x = 0; x <= width; x += 16) {
            const y = height * (0.86 + layer * 0.05) + noise(x * 0.0022 + layer * 10, layer * 3) * height * 0.05;
            g.lineTo(x, y);
          }
          g.lineTo(width, height);
          g.fill();
        }
      },
      resize(w, h, d) {
        width = w;
        height = h;
        dpr = d;
        build();
      },
      setPalette(p: Palette) {
        palette = toNight(p);
        buildSprites();
      },
      setOptions(o) {
        opts = normaliseOptions(auroraScene, o);
      },
      dispose() {},
    };
  },
};
