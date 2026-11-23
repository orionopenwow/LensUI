// Playground scene "Now Playing": slow, artwork-tinted light that drifts behind the desktop.
// With "Move to the music" on (and Settings → Music → audio-reactive allowed), it breathes with
// the speaker's peak LEVEL — one number from Windows, no audio is captured or stored.
// Register in src/playground/registry.ts (docs/MUSIC.md §Snippets).
import type { Palette, SceneContext, SceneInstance, SceneModule } from "../playground/types";
import { normaliseOptions } from "../playground/types";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { samplePalette } from "./art";
import type { NowPlaying } from "../types/generated";

type C = { r: number; g: number; b: number };

export const nowPlayingScene: SceneModule = {
  id: "now-playing",
  name: "Now Playing",
  blurb: "Soft light in the colours of whatever is playing. Optionally moves with the music.",
  interactive: false,
  calm: true,
  maxFps: 30,
  warmup: 4,
  settings: [
    { key: "speed", label: "Drift", type: "range", min: 0.1, max: 2, step: 0.1, default: 0.6 },
    { key: "react", label: "Move to the music", type: "toggle", default: false, hint: "Reads the speaker level only. Needs Settings → Music → audio-reactive." },
    { key: "glow", label: "Glow", type: "range", min: 0.2, max: 1.4, step: 0.05, default: 0.9 },
  ],
  create(ctx: SceneContext): SceneInstance {
    let opts = normaliseOptions(nowPlayingScene, ctx.options);
    let palette: Palette = ctx.palette;
    let width = ctx.width, height = ctx.height, dpr = ctx.dpr;
    const g = ctx.canvas.getContext("2d", { alpha: false })!;
    let colors: C[] = [palette.accent, palette.elevated, palette.accent];
    let target: C[] = colors.slice();
    let t = (ctx.seed % 1000) / 10;
    let level = 0;
    let disposed = false;
    let polling = 0;

    const takeArt = async (art: string | null | undefined) => {
      if (!art) {
        target = [palette.accent, palette.elevated, palette.accent];
        return;
      }
      const p = await samplePalette(art);
      if (p.length) target = [p[0].color, (p[1] ?? p[0]).color, (p[2] ?? p[0]).color];
    };
    invoke<NowPlaying>("music_now").then((n) => takeArt(n.artwork)).catch(() => {});
    const un = listen<NowPlaying>("lens://music/now", (e) => takeArt(e.payload.artwork)).catch(() => () => {});

    const setPolling = () => {
      window.clearInterval(polling);
      polling = 0;
      if (opts.react && !ctx.preview) {
        polling = window.setInterval(() => {
          invoke<number>("music_level").then((v) => (level += ((Number(v) || 0) - level) * 0.5)).catch(() => {});
        }, 66);
      }
    };
    setPolling();

    const build = () => {
      ctx.canvas.width = Math.round(width * dpr);
      ctx.canvas.height = Math.round(height * dpr);
    };
    build();

    const lerp = (a: C, b: C, k: number): C => ({ r: a.r + (b.r - a.r) * k, g: a.g + (b.g - a.g) * k, b: a.b + (b.b - a.b) * k });
    const css = (c: C, a: number) => `rgba(${c.r | 0},${c.g | 0},${c.b | 0},${a})`;

    return {
      step(dt) {
        t += dt * Number(opts.speed);
        colors = colors.map((c, i) => lerp(c, target[i], Math.min(1, dt * 0.8)));
        if (!opts.react) level *= 0.9;
      },
      render() {
        const W = ctx.canvas.width, H = ctx.canvas.height;
        const base = palette.base;
        g.fillStyle = `rgb(${base.r},${base.g},${base.b})`;
        g.fillRect(0, 0, W, H);
        g.globalCompositeOperation = palette.dark ? "lighter" : "multiply";
        const glow = Number(opts.glow) * (0.55 + level * 0.6);
        for (let i = 0; i < 3; i++) {
          const cx = W * (0.5 + 0.32 * Math.sin(t * 0.13 + i * 2.1));
          const cy = H * (0.5 + 0.28 * Math.cos(t * 0.11 + i * 1.7));
          const r = Math.max(W, H) * (0.42 + 0.08 * Math.sin(t * 0.2 + i) + level * 0.12);
          const grad = g.createRadialGradient(cx, cy, 0, cx, cy, r);
          grad.addColorStop(0, css(colors[i], 0.55 * glow));
          grad.addColorStop(1, css(colors[i], 0));
          g.fillStyle = grad;
          g.fillRect(0, 0, W, H);
        }
        g.globalCompositeOperation = "source-over";
      },
      resize(w, h, d) {
        [width, height, dpr] = [w, h, d];
        build();
      },
      setPalette(p) {
        palette = p;
      },
      setOptions(o) {
        opts = normaliseOptions(nowPlayingScene, o);
        setPolling();
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        window.clearInterval(polling);
        un.then((f) => f()).catch(() => {});
      },
    };
  },
};
