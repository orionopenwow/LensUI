import type { InputState, Palette, SceneContext, SceneInstance, SceneModule } from "../types";
import { normaliseOptions } from "../types";
import { clamp, css, hslToRgb, makeRng, mix, rgbToHsl } from "../util";

interface Drop {
  x: number;
  y: number;
  r: number;
  vy: number;
  stuck: number;
}

/**
 * Rain on glass: a soft, out-of-focus "city at night" backdrop from the theme colours, with
 * drops that cling, swell, merge and run down the pane. Calm; the cursor wipes a little clear.
 */
export const rainScene: SceneModule = {
  id: "rain",
  name: "Rain on Glass",
  blurb: "A rainy window over soft city lights in your theme colours. Quiet and slow.",
  interactive: false,
  calm: true,
  maxFps: 30,
  warmup: 400,
  settings: [
    { key: "rain", label: "Rain", type: "range", min: 1, max: 10, step: 1, default: 5 },
    { key: "lights", label: "Lights", type: "range", min: 0, max: 60, step: 2, default: 34 },
    { key: "blur", label: "Depth", type: "range", min: 6, max: 40, step: 2, default: 22, unit: "px" },
  ],
  create(ctx: SceneContext): SceneInstance {
    let opts = normaliseOptions(rainScene, ctx.options);
    let palette = ctx.palette;
    let width = ctx.width, height = ctx.height, dpr = ctx.dpr;
    const g = ctx.canvas.getContext("2d", { alpha: false })!;
    const rng = makeRng(ctx.seed);
    let backdrop: HTMLCanvasElement | null = null;
    let drops: Drop[] = [];
    const trail = document.createElement("canvas");
    let trailG = trail.getContext("2d")!;

    const buildBackdrop = () => {
      const c = document.createElement("canvas");
      const s = 0.25; // draw small, scale up: free blur and cheap
      c.width = Math.max(4, Math.round(width * s));
      c.height = Math.max(4, Math.round(height * s));
      const b = c.getContext("2d")!;
      const top = mix(palette.base, palette.elevated, palette.dark ? 0.8 : 0.3);
      const grad = b.createLinearGradient(0, 0, 0, c.height);
      grad.addColorStop(0, css(top));
      grad.addColorStop(1, css(palette.dark ? mix(palette.base, palette.accent, 0.08) : mix(palette.base, palette.accent, 0.12)));
      b.fillStyle = grad;
      b.fillRect(0, 0, c.width, c.height);
      const [h, sat] = rgbToHsl(palette.accent);
      const hue = sat < 0.12 ? 215 : h;
      const lr = makeRng(ctx.seed ^ 77);
      b.filter = `blur(${Math.round(Number(opts.blur) * s)}px)`;
      b.globalCompositeOperation = palette.dark ? "lighter" : "multiply";
      const count = Number(opts.lights);
      for (let i = 0; i < count; i++) {
        const warm = lr() < 0.35;
        const col = warm ? hslToRgb(32 + lr() * 18, 0.8, palette.dark ? 0.55 : 0.75) : hslToRgb(hue + (lr() - 0.5) * 60, 0.6, palette.dark ? 0.5 : 0.78);
        const x = lr() * c.width;
        const y = c.height * (0.35 + Math.pow(lr(), 0.7) * 0.65);
        const r = (6 + lr() * 26) * (c.width / 480);
        const rg = b.createRadialGradient(x, y, 0, x, y, r);
        rg.addColorStop(0, css(col, palette.dark ? 0.7 : 0.55));
        rg.addColorStop(1, css(col, 0));
        b.fillStyle = rg;
        b.fillRect(x - r, y - r, r * 2, r * 2);
      }
      backdrop = c;
    };

    const build = () => {
      ctx.canvas.width = Math.round(width * dpr);
      ctx.canvas.height = Math.round(height * dpr);
      trail.width = Math.round(width / 2);
      trail.height = Math.round(height / 2);
      trailG = trail.getContext("2d")!;
      drops = [];
      buildBackdrop();
    };
    build();

    const addDrop = (big = false) => {
      const r = big ? 5 + rng() * 5 : 1.2 + Math.pow(rng(), 2.2) * 5;
      drops.push({ x: rng() * width, y: rng() * height, r, vy: 0, stuck: rng() * 3 });
    };

    let mx = -1e4, my = -1e4, inside = false;

    return {
      step(dt, input: InputState) {
        inside = input.inside;
        mx = input.x;
        my = input.y;
        const rate = Number(opts.rain) * (ctx.preview ? 6 : 18) * clamp((width * height) / (1920 * 1080), 0.2, 2);
        let spawn = rate * dt;
        while (spawn > 0) {
          if (rng() < spawn) addDrop(rng() < 0.06);
          spawn -= 1;
        }
        const max = ctx.preview ? 180 : 900;
        if (drops.length > max) drops.splice(0, drops.length - max);
        // Fade the trails left by running drops.
        trailG.globalCompositeOperation = "destination-out";
        trailG.fillStyle = `rgb(0 0 0 / ${clamp(dt * 0.25, 0, 1).toFixed(3)})`;
        trailG.fillRect(0, 0, trail.width, trail.height);
        trailG.globalCompositeOperation = "source-over";
        for (const d of drops) {
          if (d.r > 3.2) {
            d.stuck -= dt;
            if (d.stuck <= 0) {
              d.vy = Math.min(d.vy + dt * 260 * (d.r / 6), 220);
              d.y += d.vy * dt;
              d.x += (rng() - 0.5) * 0.6;
              d.r -= dt * 0.25;
              trailG.fillStyle = css(palette.fg, palette.dark ? 0.05 : 0.08);
              trailG.beginPath();
              trailG.arc(d.x / 2, d.y / 2, d.r * 0.22, 0, Math.PI * 2);
              trailG.fill();
              if (rng() < dt * 1.5) d.stuck = rng() * 1.5;
            }
          } else {
            d.r += dt * 0.08 * Number(opts.rain);
          }
          if (inside && Math.hypot(d.x - mx, d.y - my) < 60) d.r = 0;
        }
        // Merge: a moving drop swallows small ones it touches (simple O(n·k) grid-free pass).
        for (const a of drops) {
          if (a.vy <= 0) continue;
          for (const b of drops) {
            if (a === b || b.r <= 0) continue;
            if (Math.abs(a.x - b.x) < a.r + b.r && Math.abs(a.y - b.y) < a.r + b.r && b.r < a.r) {
              a.r = Math.min(9, Math.sqrt(a.r * a.r + b.r * b.r * 0.6));
              b.r = 0;
            }
          }
        }
        drops = drops.filter((d) => d.r > 0.4 && d.y < height + 20);
      },
      render() {
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        if (backdrop) g.drawImage(backdrop, 0, 0, width, height);
        g.drawImage(trail, 0, 0, width, height);
        const hl = palette.dark ? palette.fg : { r: 255, g: 255, b: 255 };
        const sh = palette.dark ? { r: 0, g: 0, b: 0 } : mix(palette.base, palette.fg, 0.5);
        for (const d of drops) {
          const r = d.r;
          // Drop body: a lens that shows the backdrop flipped (approximated) + rim light.
          const body = g.createRadialGradient(d.x - r * 0.25, d.y - r * 0.35, r * 0.1, d.x, d.y, r);
          body.addColorStop(0, css(hl, palette.dark ? 0.38 : 0.65));
          body.addColorStop(0.55, css(hl, palette.dark ? 0.08 : 0.18));
          body.addColorStop(0.85, css(sh, palette.dark ? 0.3 : 0.18));
          body.addColorStop(1, css(hl, palette.dark ? 0.22 : 0.35));
          g.fillStyle = body;
          g.beginPath();
          g.ellipse(d.x, d.y, r, r * (d.vy > 0 ? 1.15 : 1), 0, 0, Math.PI * 2);
          g.fill();
          if (r > 1.6) {
            g.fillStyle = css(hl, palette.dark ? 0.55 : 0.85);
            g.beginPath();
            g.arc(d.x - r * 0.3, d.y - r * 0.35, r * 0.22, 0, Math.PI * 2);
            g.fill();
          }
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
        buildBackdrop();
      },
      setOptions(o) {
        opts = normaliseOptions(rainScene, o);
        buildBackdrop();
      },
      reset: () => {
        drops = [];
      },
      dispose() {},
    };
  },
};
