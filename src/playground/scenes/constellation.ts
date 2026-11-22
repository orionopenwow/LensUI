import type { InputState, Palette, SceneContext, SceneInstance, SceneModule } from "../types";
import { normaliseOptions } from "../types";
import { clamp, css, makeRng, mix, vivid } from "../util";

export const constellationScene: SceneModule = {
  id: "constellation",
  name: "Constellation",
  blurb: "Slow-drifting stars that join into constellations around your cursor. Click to scatter them.",
  interactive: true,
  warmup: 30,
  settings: [
    { key: "stars", label: "Stars", type: "range", min: 60, max: 500, step: 10, default: 300 },
    { key: "reach", label: "Reach", type: "range", min: 80, max: 360, step: 10, default: 210, unit: "px" },
    { key: "links", label: "Links everywhere", type: "toggle", default: true, hint: "Faint lines between near stars even away from the cursor." },
    { key: "drift", label: "Drift", type: "range", min: 0, max: 2, step: 0.1, default: 0.6 },
  ],
  create(ctx: SceneContext): SceneInstance {
    let opts = normaliseOptions(constellationScene, ctx.options);
    let palette = ctx.palette;
    let width = ctx.width, height = ctx.height, dpr = ctx.dpr;
    const g = ctx.canvas.getContext("2d", { alpha: false })!;
    const rng = makeRng(ctx.seed);
    let n = 0;
    let x = new Float32Array(0), y = new Float32Array(0), vx = new Float32Array(0), vy = new Float32Array(0), sz = new Float32Array(0), ph = new Float32Array(0);
    let t = 0;
    let mx = 0, my = 0, inside = false, glow = 0;

    const build = () => {
      ctx.canvas.width = Math.round(width * dpr);
      ctx.canvas.height = Math.round(height * dpr);
      n = Math.round(Number(opts.stars) * (ctx.preview ? 0.3 : 1) * clamp((width * height) / (1920 * 1080), 0.3, 2));
      x = new Float32Array(n);
      y = new Float32Array(n);
      vx = new Float32Array(n);
      vy = new Float32Array(n);
      sz = new Float32Array(n);
      ph = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        x[i] = rng() * width;
        y[i] = rng() * height;
        const a = rng() * Math.PI * 2;
        const s = 4 + rng() * 10;
        vx[i] = Math.cos(a) * s;
        vy[i] = Math.sin(a) * s;
        sz[i] = 0.8 + Math.pow(rng(), 3) * 2.4;
        ph[i] = rng() * Math.PI * 2;
      }
    };
    build();

    return {
      step(dt, input: InputState) {
        t += dt;
        inside = input.inside;
        if (inside) {
          mx = input.x;
          my = input.y;
        }
        glow += ((inside ? 1 : 0) - glow) * Math.min(1, dt * 3);
        const drift = Number(opts.drift);
        for (const e of input.events) {
          if (e.kind !== "down") continue;
          for (let i = 0; i < n; i++) {
            const dx = x[i] - e.x, dy = y[i] - e.y;
            const d = Math.hypot(dx, dy);
            if (d < 260 && d > 0.1) {
              const f = (1 - d / 260) * 260;
              vx[i] += (dx / d) * f;
              vy[i] += (dy / d) * f;
            }
          }
        }
        for (let i = 0; i < n; i++) {
          // Ease velocity back to a slow drift.
          const sp = Math.hypot(vx[i], vy[i]);
          const target = (6 + (i % 7)) * drift;
          if (sp > 0.0001) {
            const k = sp + (target - sp) * Math.min(1, dt * 1.5);
            vx[i] = (vx[i] / sp) * k;
            vy[i] = (vy[i] / sp) * k;
          }
          // Gentle pull toward the cursor so constellations form there.
          if (inside) {
            const dx = mx - x[i], dy = my - y[i];
            const d = Math.hypot(dx, dy);
            if (d < 300 && d > 40) {
              vx[i] += (dx / d) * 4 * dt;
              vy[i] += (dy / d) * 4 * dt;
            }
          }
          x[i] += vx[i] * dt;
          y[i] += vy[i] * dt;
          if (x[i] < -20) x[i] += width + 40;
          if (x[i] > width + 20) x[i] -= width + 40;
          if (y[i] < -20) y[i] += height + 40;
          if (y[i] > height + 20) y[i] -= height + 40;
        }
      },
      render() {
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        const top = mix(palette.base, palette.elevated, palette.dark ? 0.7 : 0.25);
        const grad = g.createLinearGradient(0, 0, 0, height);
        grad.addColorStop(0, css(top));
        grad.addColorStop(1, css(palette.base));
        g.fillStyle = grad;
        g.fillRect(0, 0, width, height);
        const acc = vivid(palette.accent, 0.4, palette.dark ? 0.68 : 0.45);
        const star = palette.dark ? mix(palette.fg, acc, 0.15) : mix(palette.fg, acc, 0.35);
        if (glow > 0.01) {
          const rg = g.createRadialGradient(mx, my, 0, mx, my, Number(opts.reach) * 1.3);
          rg.addColorStop(0, css(acc, 0.16 * glow));
          rg.addColorStop(1, css(acc, 0));
          g.fillStyle = rg;
          g.fillRect(0, 0, width, height);
        }
        const reach = Number(opts.reach);
        const link = reach * 0.6;
        g.lineWidth = 1.15;
        for (let i = 0; i < n; i++) {
          const ci = inside ? Math.hypot(x[i] - mx, y[i] - my) : 1e9;
          const near = ci < reach;
          if (!near && !opts.links) continue;
          for (let j = i + 1; j < n; j++) {
            const dx = x[i] - x[j], dy = y[i] - y[j];
            if (Math.abs(dx) > link || Math.abs(dy) > link) continue;
            const d = Math.hypot(dx, dy);
            if (d > link) continue;
            const cj = inside ? Math.hypot(x[j] - mx, y[j] - my) : 1e9;
            const focus = near && cj < reach ? glow * (1 - Math.max(ci, cj) / reach) : 0;
            const a = (1 - d / link) * (0.2 * (opts.links ? 1 : 0) + focus * 1.2);
            if (a < 0.01) continue;
            g.strokeStyle = css(focus > 0.02 ? acc : star, a);
            g.beginPath();
            g.moveTo(x[i], y[i]);
            g.lineTo(x[j], y[j]);
            g.stroke();
          }
        }
        for (let i = 0; i < n; i++) {
          const tw = 0.55 + 0.45 * Math.sin(t * 1.3 + ph[i]);
          const ci = inside ? Math.hypot(x[i] - mx, y[i] - my) : 1e9;
          const boost = ci < reach ? glow * (1 - ci / reach) : 0;
          g.fillStyle = css(boost > 0.05 ? mix(star, acc, boost) : star, clamp(0.5 + tw * 0.5 + boost * 0.4, 0, 1));
          g.beginPath();
          g.arc(x[i], y[i], sz[i] * (1 + boost * 0.8), 0, Math.PI * 2);
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
        palette = p;
      },
      setOptions(o) {
        const prev = opts.stars;
        opts = normaliseOptions(constellationScene, o);
        if (prev !== opts.stars) build();
      },
      reset: () => build(),
      dispose() {},
    };
  },
};
