import type { InputState, Palette, SceneContext, SceneInstance, SceneModule } from "../types";
import { normaliseOptions } from "../types";
import { css, makeRng, mix, vivid } from "../util";

/** Deep starfield drifting slowly toward you, with the odd shooting star. */
export const starfieldScene: SceneModule = {
  id: "starfield",
  name: "Starfield",
  blurb: "A slow drift through deep space with the odd shooting star. The cursor gently steers.",
  interactive: true,
  calm: true,
  warmup: 20,
  settings: [
    { key: "stars", label: "Stars", type: "range", min: 300, max: 3000, step: 100, default: 1500 },
    { key: "speed", label: "Speed", type: "range", min: 0.05, max: 1.5, step: 0.05, default: 0.25 },
    { key: "shooting", label: "Shooting stars", type: "toggle", default: true },
    { key: "nebula", label: "Nebula", type: "toggle", default: true },
  ],
  create(ctx: SceneContext): SceneInstance {
    let opts = normaliseOptions(starfieldScene, ctx.options);
    let palette = ctx.palette;
    let width = ctx.width, height = ctx.height, dpr = ctx.dpr;
    const g = ctx.canvas.getContext("2d", { alpha: false })!;
    const rng = makeRng(ctx.seed);
    let n = 0;
    let sx = new Float32Array(0), sy = new Float32Array(0), sz = new Float32Array(0), tint = new Float32Array(0);
    let cx = 0, cy = 0, tx = 0, ty = 0;
    const shooting: { x: number; y: number; vx: number; vy: number; life: number }[] = [];
    let nebula: HTMLCanvasElement | null = null;

    const buildNebula = () => {
      const c = document.createElement("canvas");
      c.width = 160;
      c.height = 90;
      const b = c.getContext("2d")!;
      const lr = makeRng(ctx.seed ^ 3);
      const acc = vivid(palette.accent, 0.5, 0.5);
      for (let i = 0; i < 7; i++) {
        const x = lr() * 160, y = lr() * 90, r = 20 + lr() * 45;
        const rg = b.createRadialGradient(x, y, 0, x, y, r);
        const col = i % 3 === 0 ? mix(acc, { r: 180, g: 90, b: 200 }, 0.4) : acc;
        rg.addColorStop(0, css(col, 0.22));
        rg.addColorStop(1, css(col, 0));
        b.fillStyle = rg;
        b.fillRect(0, 0, 160, 90);
      }
      nebula = c;
    };
    const reseed = (i: number, far = false) => {
      sx[i] = (rng() - 0.5) * 2;
      sy[i] = (rng() - 0.5) * 2;
      sz[i] = far ? 0.7 + rng() * 0.3 : 0.05 + rng() * 0.95;
      tint[i] = rng();
    };
    const build = () => {
      ctx.canvas.width = Math.round(width * dpr);
      ctx.canvas.height = Math.round(height * dpr);
      n = Math.round(Number(opts.stars) * (ctx.preview ? 0.25 : 1));
      sx = new Float32Array(n);
      sy = new Float32Array(n);
      sz = new Float32Array(n);
      tint = new Float32Array(n);
      for (let i = 0; i < n; i++) reseed(i);
      buildNebula();
    };
    build();

    return {
      step(dt, input: InputState) {
        if (input.inside) {
          tx = (input.x / width - 0.5) * 0.35;
          ty = (input.y / height - 0.5) * 0.35;
        } else {
          tx *= 0.98;
          ty *= 0.98;
        }
        cx += (tx - cx) * Math.min(1, dt * 0.8);
        cy += (ty - cy) * Math.min(1, dt * 0.8);
        const sp = Number(opts.speed) * dt * 0.25;
        for (let i = 0; i < n; i++) {
          sz[i] -= sp;
          if (sz[i] <= 0.03) reseed(i, true);
        }
        if (opts.shooting && rng() < dt * 0.08) {
          const a = Math.PI * (0.15 + rng() * 0.2);
          const s = 900 + rng() * 500;
          shooting.push({ x: rng() * width * 0.8, y: rng() * height * 0.4, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1 });
        }
        for (const s of shooting) {
          s.x += s.vx * dt;
          s.y += s.vy * dt;
          s.life -= dt * 1.3;
        }
        while (shooting.length && shooting[0].life <= 0) shooting.shift();
      },
      render() {
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        // Space is dark in every theme; light themes get a deep blue rather than black.
        const bg = palette.dark ? mix(palette.base, { r: 0, g: 0, b: 0 }, 0.25) : mix({ r: 18, g: 24, b: 48 }, palette.accent, 0.12);
        g.fillStyle = css(bg);
        g.fillRect(0, 0, width, height);
        if (opts.nebula && nebula) {
          g.imageSmoothingEnabled = true;
          g.drawImage(nebula, -width * 0.05 - cx * 80, -height * 0.05 - cy * 80, width * 1.1, height * 1.1);
        }
        const acc = vivid(palette.accent, 0.35, 0.8);
        const white = { r: 245, g: 245, b: 255 };
        const ox = width / 2, oy = height / 2;
        const f = Math.max(width, height) * 0.5;
        for (let i = 0; i < n; i++) {
          const z = sz[i];
          const x = ox + ((sx[i] - cx * (1 - z)) / z) * f * 0.5;
          const y = oy + ((sy[i] - cy * (1 - z)) / z) * f * 0.5;
          if (x < -4 || y < -4 || x > width + 4 || y > height + 4) continue;
          const near = 1 - z;
          const r = 1.2 + near * near * 2.8;
          g.fillStyle = css(tint[i] < 0.25 ? acc : white, Math.min(1, 0.5 + near * 0.9));
          g.fillRect(x - r / 2, y - r / 2, r, r);
        }
        for (const s of shooting) {
          const len = 140;
          const sp = Math.hypot(s.vx, s.vy);
          const gx = s.x - (s.vx / sp) * len, gy = s.y - (s.vy / sp) * len;
          const lg = g.createLinearGradient(gx, gy, s.x, s.y);
          lg.addColorStop(0, css(white, 0));
          lg.addColorStop(1, css(white, Math.max(0, s.life) * 0.9));
          g.strokeStyle = lg;
          g.lineWidth = 1.6;
          g.beginPath();
          g.moveTo(gx, gy);
          g.lineTo(s.x, s.y);
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
        buildNebula();
      },
      setOptions(o) {
        const prev = opts.stars;
        opts = normaliseOptions(starfieldScene, o);
        if (prev !== opts.stars) build();
      },
      dispose() {},
    };
  },
};
