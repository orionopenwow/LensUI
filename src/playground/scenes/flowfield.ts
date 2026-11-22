import type { InputState, Palette, SceneContext, SceneInstance, SceneModule } from "../types";
import { normaliseOptions } from "../types";
import { clamp, css, hslToRgb, makeNoise2, makeRng, mix, rgbToHsl } from "../util";

export const flowFieldScene: SceneModule = {
  id: "flow",
  name: "Flow Field",
  blurb: "Thousands of threads drift along an invisible current in your accent colour; the cursor parts them.",
  interactive: true,
  warmup: 140,
  settings: [
    { key: "density", label: "Threads", type: "range", min: 400, max: 5000, step: 100, default: 3000 },
    { key: "speed", label: "Speed", type: "range", min: 0.2, max: 2, step: 0.1, default: 0.8 },
    { key: "trail", label: "Trails", type: "range", min: 1, max: 10, step: 1, default: 6 },
    { key: "repel", label: "Cursor push", type: "range", min: 0, max: 300, step: 10, default: 140, unit: "px" },
    { key: "hues", label: "Colour range", type: "range", min: 0, max: 90, step: 5, default: 30 },
  ],
  create(ctx: SceneContext): SceneInstance {
    let opts = normaliseOptions(flowFieldScene, ctx.options);
    let palette = ctx.palette;
    let width = ctx.width, height = ctx.height, dpr = ctx.dpr;
    const g = ctx.canvas.getContext("2d", { alpha: false })!;
    const rng = makeRng(ctx.seed);
    const noise = makeNoise2(ctx.seed ^ 0x5bd1e995);
    let n = 0;
    let px = new Float32Array(0), py = new Float32Array(0), age = new Float32Array(0), hue = new Float32Array(0);
    let t = 0;
    let colours: string[] = [];

    const buildColours = () => {
      const [h, s] = rgbToHsl(palette.accent);
      const hh = s < 0.12 ? 215 : h;
      const range = Number(opts.hues);
      colours = [];
      for (let k = 0; k < 8; k++) {
        const c = hslToRgb(hh + (k / 7 - 0.5) * range * 2, Math.max(0.45, s), palette.dark ? 0.55 + (k % 3) * 0.08 : 0.42 + (k % 3) * 0.05);
        colours.push(css(c, palette.dark ? 0.85 : 0.7));
      }
    };
    const spawn = (i: number) => {
      px[i] = rng() * width;
      py[i] = rng() * height;
      age[i] = rng() * 200;
      hue[i] = (rng() * 8) | 0;
    };
    const build = () => {
      ctx.canvas.width = Math.round(width * dpr);
      ctx.canvas.height = Math.round(height * dpr);
      n = Math.round(Number(opts.density) * (ctx.preview ? 0.15 : 1) * clamp((width * height) / (1920 * 1080), 0.2, 2));
      px = new Float32Array(n);
      py = new Float32Array(n);
      age = new Float32Array(n);
      hue = new Float32Array(n);
      for (let i = 0; i < n; i++) spawn(i);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = css(palette.base);
      g.fillRect(0, 0, width, height);
    };
    buildColours();
    build();

    const scale = 0.0016;
    let mx = -1e5, my = -1e5, inside = false;

    return {
      step(dt, input: InputState) {
        t += dt;
        inside = input.inside;
        mx = input.x;
        my = input.y;
      },
      render() {
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        // Fade toward the background: shorter trails = stronger fade.
        const fade = 0.012 + (10 - Number(opts.trail)) * 0.012;
        const bgTop = mix(palette.base, palette.elevated, palette.dark ? 0.35 : 0.15);
        g.globalCompositeOperation = "source-over";
        g.fillStyle = css(bgTop, fade);
        g.fillRect(0, 0, width, height);
        const sp = Number(opts.speed) * 1.6;
        const rep = Number(opts.repel);
        const rep2 = rep * rep;
        g.lineWidth = 1.3;
        g.lineCap = "round";
        const z = t * 0.05;
        for (let c = 0; c < 8; c++) {
          g.strokeStyle = colours[c];
          g.beginPath();
          for (let i = 0; i < n; i++) {
            if (hue[i] !== c) continue;
            const x = px[i], y = py[i];
            const a = noise(x * scale + z, y * scale - z * 0.6) * Math.PI * 3 + noise(x * scale * 3.1, y * scale * 3.1 + z) * 0.8;
            let vx = Math.cos(a) * sp, vy = Math.sin(a) * sp;
            if (inside && rep > 0) {
              const dx = x - mx, dy = y - my;
              const d2 = dx * dx + dy * dy;
              if (d2 < rep2 && d2 > 0.01) {
                const d = Math.sqrt(d2);
                const f = (1 - d / rep) * 3.2;
                vx += (dx / d) * f * sp * 2 - (dy / d) * f * sp * 0.8;
                vy += (dy / d) * f * sp * 2 + (dx / d) * f * sp * 0.8;
              }
            }
            const nx = x + vx, ny = y + vy;
            g.moveTo(x, y);
            g.lineTo(nx, ny);
            px[i] = nx;
            py[i] = ny;
            age[i] += 1;
            if (nx < -5 || ny < -5 || nx > width + 5 || ny > height + 5 || age[i] > 400) spawn(i);
          }
          g.stroke();
        }
      },
      resize(w, h, d) {
        width = w;
        height = h;
        dpr = d;
        build();
      },
      setPalette(p: Palette) {
        palette = p;
        buildColours();
        g.fillStyle = css(p.base);
        g.fillRect(0, 0, width, height);
      },
      setOptions(o) {
        const prev = opts.density;
        opts = normaliseOptions(flowFieldScene, o);
        buildColours();
        if (prev !== opts.density) build();
      },
      reset: () => build(),
      dispose() {},
    };
  },
};
