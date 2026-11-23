import type { Palette, RGB, SceneContext, SceneInstance, SceneModule } from "../types";
import { normaliseOptions } from "../types";
import { sunTimes } from "../../themes/schedule";
import { clamp, css, makeNoise2, makeRng, mix, smoothstep, vivid } from "../util";

/** Location for sunrise/sunset (from the Theme Schedule card). 0,0 = unknown -> 6:30 / 18:30. */
let location = { latitude: 0, longitude: 0 };
export function setSkyLocation(latitude: number, longitude: number) {
  location = { latitude, longitude };
}

const PREVIEW_HOURS: Record<string, number> = { dawn: 6.6, morning: 9.5, noon: 13, dusk: 18.4, night: 23 };

/** Hours (local, fractional) of sunrise and sunset for `date`. */
export function dayWindow(date: Date): { rise: number; set: number } {
  const { latitude, longitude } = location;
  if (latitude === 0 && longitude === 0) return { rise: 6.5, set: 18.5 };
  const st = sunTimes(date, latitude, longitude);
  if (st.polar === "day") return { rise: 0, set: 24 };
  if (st.polar === "night" || !st.sunrise || !st.sunset) return { rise: 12, set: 12 };
  const rise = st.sunrise.getHours() + st.sunrise.getMinutes() / 60;
  // Day length from the instants, so a sunset after local midnight still works.
  const length = Math.min(24, Math.max(0, (st.sunset.getTime() - st.sunrise.getTime()) / 3_600_000));
  return { rise, set: rise + length };
}

/** Where we are in the day: `day` (sun up) or night, and how far through it (0..1). */
export function sunPhase(hour: number, rise: number, set: number): { day: boolean; frac: number } {
  const length = set - rise;
  if (length <= 0) return { day: false, frac: (((hour - 12 + 24) % 24) / 24) };
  if (length >= 24) return { day: true, frac: (((hour - rise) % 24) + 24) % 24 / 24 };
  const since = (((hour - rise) % 24) + 24) % 24;
  return since <= length ? { day: true, frac: since / length } : { day: false, frac: (since - length) / (24 - length) };
}

/** Sun height: 1 at solar noon, 0 at the horizon, negative at night (down to -1). */
export function sunHeight(hour: number, rise: number, set: number): number {
  const p = sunPhase(hour, rise, set);
  return (p.day ? 1 : -1) * Math.sin(p.frac * Math.PI);
}

function skyColours(h: number, p: Palette, accent: RGB): { top: RGB; mid: RGB; low: RGB } {
  const night = { top: { r: 6, g: 9, b: 24 }, mid: { r: 14, g: 20, b: 48 }, low: { r: 26, g: 32, b: 64 } };
  const dawn = { top: { r: 40, g: 52, b: 104 }, mid: { r: 176, g: 104, b: 120 }, low: { r: 252, g: 168, b: 96 } };
  const day = { top: { r: 58, g: 124, b: 210 }, mid: { r: 120, g: 176, b: 232 }, low: { r: 196, g: 224, b: 246 } };
  const pick = (k: "top" | "mid" | "low") => {
    let c: RGB;
    if (h <= -0.25) c = night[k];
    else if (h < 0.05) c = mix(night[k], dawn[k], smoothstep(-0.25, 0.05, h));
    else if (h < 0.35) c = mix(dawn[k], day[k], smoothstep(0.05, 0.35, h));
    else c = day[k];
    // Tie it to the theme: a little accent everywhere, and the pack's base in dark themes.
    c = mix(c, accent, 0.12);
    return p.dark ? mix(c, p.base, 0.18) : mix(c, p.base, 0.08);
  };
  return { top: pick("top"), mid: pick("mid"), low: pick("low") };
}

export const skyClockScene: SceneModule = {
  id: "sky-clock",
  name: "Sky Clock",
  blurb: "A sky that follows the real time of day: sunrise, sun, sunset, moon and stars.",
  interactive: false,
  calm: true,
  maxFps: 30,
  warmup: 2,
  settings: [
    {
      key: "time",
      label: "Time",
      type: "choice",
      options: [
        { id: "live", label: "Live" },
        { id: "dawn", label: "Dawn" },
        { id: "noon", label: "Noon" },
        { id: "dusk", label: "Dusk" },
        { id: "night", label: "Night" },
      ],
      default: "live",
    },
    { key: "clouds", label: "Clouds", type: "range", min: 0, max: 1, step: 0.05, default: 0.45 },
    { key: "hills", label: "Hills", type: "toggle", default: true },
  ],
  create(ctx: SceneContext): SceneInstance {
    let opts = normaliseOptions(skyClockScene, ctx.options);
    let palette = ctx.palette;
    let width = ctx.width, height = ctx.height, dpr = ctx.dpr;
    const g = ctx.canvas.getContext("2d", { alpha: false })!;
    const noise = makeNoise2(ctx.seed);
    const rng = makeRng(ctx.seed);
    let stars: { x: number; y: number; r: number; p: number }[] = [];
    let drift = 0;
    let t = 0;

    const build = () => {
      ctx.canvas.width = Math.round(width * dpr);
      ctx.canvas.height = Math.round(height * dpr);
      stars = Array.from({ length: Math.round((width * height) / 5000) }, () => ({ x: rng() * width, y: rng() * height * 0.7, r: 0.5 + Math.pow(rng(), 4) * 1.6, p: rng() * 6.28 }));
    };
    build();

    const hourNow = () => {
      const fixed = PREVIEW_HOURS[String(opts.time)];
      if (fixed !== undefined) return fixed;
      const d = new Date();
      return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
    };

    return {
      step(dt) {
        t += dt;
        drift += dt * 6;
      },
      render() {
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        const hour = hourNow();
        const { rise, set } = dayWindow(new Date());
        const sh = sunHeight(hour, rise, set);
        const acc = vivid(palette.accent, 0.3, 0.55);
        const sky = skyColours(sh, palette, acc);
        const horizon = height * 0.78;
        const grad = g.createLinearGradient(0, 0, 0, horizon);
        grad.addColorStop(0, css(sky.top));
        grad.addColorStop(0.6, css(sky.mid));
        grad.addColorStop(1, css(sky.low));
        g.fillStyle = grad;
        g.fillRect(0, 0, width, height);

        // Stars fade in as the sun goes down.
        const starA = clamp(-sh * 2.2, 0, 1);
        if (starA > 0.01) {
          for (const s of stars) {
            g.fillStyle = css({ r: 240, g: 240, b: 255 }, starA * (0.35 + 0.4 * (0.5 + 0.5 * Math.sin(t * 1.7 + s.p))));
            g.fillRect(s.x, s.y, s.r, s.r);
          }
        }

        // Sun (day) or moon (night) on an arc across the sky.
        const phase = sunPhase(hour, rise, set);
        const frac = phase.frac;
        const isSun = phase.day;
        const bx = width * (0.08 + frac * 0.84);
        const by = horizon - Math.sin(frac * Math.PI) * height * 0.58;
        if (isSun) {
          const warm = 1 - clamp(sh * 2.5, 0, 1);
          const core = mix({ r: 255, g: 250, b: 235 }, { r: 255, g: 170, b: 90 }, warm);
          const halo = g.createRadialGradient(bx, by, 0, bx, by, height * 0.35);
          halo.addColorStop(0, css(core, 0.55));
          halo.addColorStop(0.15, css(core, 0.18));
          halo.addColorStop(1, css(core, 0));
          g.fillStyle = halo;
          g.fillRect(0, 0, width, height);
          g.fillStyle = css(core);
          g.beginPath();
          g.arc(bx, by, Math.max(14, height * 0.032), 0, Math.PI * 2);
          g.fill();
        } else {
          const r = Math.max(12, height * 0.026);
          const halo = g.createRadialGradient(bx, by, 0, bx, by, r * 6);
          halo.addColorStop(0, css({ r: 220, g: 228, b: 255 }, 0.18));
          halo.addColorStop(1, css({ r: 220, g: 228, b: 255 }, 0));
          g.fillStyle = halo;
          g.fillRect(bx - r * 6, by - r * 6, r * 12, r * 12);
          g.fillStyle = css({ r: 232, g: 236, b: 248 });
          g.beginPath();
          g.arc(bx, by, r, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = css(sky.top);
          g.beginPath();
          g.arc(bx + r * 0.45, by - r * 0.2, r * 0.9, 0, Math.PI * 2);
          g.fill();
        }

        // Clouds: soft noise bands, lit by the sky.
        const cl = Number(opts.clouds);
        if (cl > 0) {
          const lit = sh > 0 ? mix({ r: 255, g: 255, b: 255 }, sky.low, 0.3) : mix(sky.mid, { r: 180, g: 190, b: 220 }, 0.25);
          for (let i = 0; i < 14; i++) {
            const y = height * (0.1 + (i % 7) * 0.075);
            const x = ((i * 397 + drift * (0.6 + (i % 3) * 0.3)) % (width + 600)) - 300;
            const k = noise(i * 1.7, 3.3) * 0.5 + 0.5;
            const w = 220 + k * 380, h = 30 + k * 40;
            const a = cl * (0.08 + k * 0.16) * (sh > 0 ? 1 : 0.6);
            const rg = g.createRadialGradient(x, y, 0, x, y, w * 0.5);
            rg.addColorStop(0, css(lit, a));
            rg.addColorStop(1, css(lit, 0));
            g.save();
            g.translate(x, y);
            g.scale(1, h / w);
            g.translate(-x, -y);
            g.fillStyle = rg;
            g.fillRect(x - w, y - w, w * 2, w * 2);
            g.restore();
          }
        }

        // Hills.
        if (opts.hills) {
          const dusk = clamp(1 - sh * 3, 0, 1);
          for (let layer = 0; layer < 3; layer++) {
            const far = mix(sky.low, sky.mid, 0.5);
            const near = palette.dark ? mix(palette.base, { r: 0, g: 0, b: 0 }, 0.2) : mix(palette.base, palette.fg, 0.35);
            let c = mix(far, near, 0.35 + layer * 0.3);
            c = mix(c, { r: 10, g: 12, b: 24 }, dusk * 0.35 * (layer + 1) / 3);
            g.fillStyle = css(c);
            g.beginPath();
            g.moveTo(0, height);
            for (let x = 0; x <= width + 12; x += 12) {
              const y = horizon + layer * height * 0.06 + noise(x * (0.0016 + layer * 0.0008) + layer * 20, layer * 5) * height * (0.08 - layer * 0.015);
              g.lineTo(x, y);
            }
            g.lineTo(width, height);
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
      },
      setOptions(o) {
        opts = normaliseOptions(skyClockScene, o);
      },
      dispose() {},
    };
  },
};
