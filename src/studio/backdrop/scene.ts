/**
 * "Backdrop" Playground scene: any Backdrop Lab look as the live Lens wallpaper.
 *
 * Same engine and state object as the Lab (the wallpaper receives the share code by reference in
 * its scene settings, never a re-encoded video), so what you see in the Lab is what plays.
 *
 * Courtesy: 30 fps cap, adaptive resolution, the runner's pause rules (covered desktop,
 * fullscreen/games, battery), reduced motion → still frame, wall-clock motion that resumes from the
 * same moment, crossfades on every change, and a kept frame while the GPU context is restored.
 */
import { invoke } from "@tauri-apps/api/core";
import { sunPosition } from "../../playground/living/astro";
import { previewTime, readLiving, resolveLocation } from "../../playground/living/settings";
import { currentWeather } from "../../playground/living/weather";
import { listen } from "@tauri-apps/api/event";
import type { Palette, SceneInstance, SceneModule, SceneOptions } from "../../playground/types";
import { normaliseOptions } from "../../playground/types";
import {
  BackdropRenderer,
  LoopClock,
  allPresets,
  applyReactions,
  cssGradient,
  decodeState,
  evenStops,
  evolve,
  keyframeState,
  packPalette,
  playlistIndex,
  presetById,
  rgbToHex,
  HERO_PRESET_ID,
  type BackdropState,
  type Keyframes,
  type Reactions,
} from "./engine";

export const BACKDROP_SCENE_ID = "backdrop";

/** Presets offered in the wallpaper card (the Lab has the full list). */
const CARD_PRESETS = [
  "lens-nebula",
  "lens-obsidian-glow",
  "soft-lagoon",
  "soft-peach-mist",
  "light-gallery-beam",
  "light-edge-of-night",
  "nature-polar-curtain",
  "nature-moon-sea",
  "nature-afternoon-wall",
  "pattern-midnight-tiles",
  "glass-amethyst",
  "glass-night-drive",
];

const rgbHex = (c: { r: number; g: number; b: number }) => rgbToHex([c.r / 255, c.g / 255, c.b / 255]);

/** Resolves the state a set of scene options asks for (pure; exported for tests). */
export function resolveBackdrop(o: SceneOptions, palette: Palette | null): BackdropState {
  let s: BackdropState | null = null;
  if (o.preset === "custom" && typeof o.code === "string" && o.code) s = decodeState(o.code);
  if (!s) s = (presetById(String(o.preset)) ?? presetById(HERO_PRESET_ID)!).state;
  if (o.followTheme && palette) {
    s = { ...s, stops: evenStops(packPalette(rgbHex(palette.base), rgbHex(palette.accent), !palette.dark)) };
  }
  return s;
}

/** Keyframes travel in the `keys` text option as JSON { morning: code, … }. */
function parseKeyframes(text: unknown): Keyframes | null {
  if (typeof text !== "string" || !text) return null;
  try {
    const raw = JSON.parse(text) as Record<string, string>;
    const out: Keyframes = {};
    for (const k of ["morning", "noon", "evening", "night"] as const) {
      const st = raw[k] ? decodeState(raw[k]) : null;
      if (st) out[k] = st;
    }
    return Object.keys(out).length ? out : null;
  } catch {
    return null;
  }
}

/** Lowest wallpaper resolution scale the adaptive step goes to (a weak GPU or software GL). */
const MIN_QUALITY = 0.25;

export const backdropScene: SceneModule = {
  id: BACKDROP_SCENE_ID,
  name: "Backdrop Lab",
  blurb: "Your Backdrop Lab looks as a living wallpaper: gradients, light and glass, on a seamless loop.",
  interactive: false,
  calm: true,
  maxFps: 30,
  warmup: 1,
  settings: [
    {
      key: "preset",
      label: "Look",
      type: "choice",
      options: [{ id: "custom", label: "From Backdrop Lab" }, ...CARD_PRESETS.map((id) => ({ id, label: presetById(id)?.name ?? id }))],
      default: HERO_PRESET_ID,
    },
    { key: "code", label: "Backdrop code", type: "text", default: "", maxLength: 4000 },
    { key: "keys", label: "Time-of-day looks", type: "text", default: "", maxLength: 16000 },
    { key: "followTheme", label: "Follow theme colours", type: "toggle", default: false, hint: "Re-colour with the active theme pack; switching packs crossfades." },
    { key: "evolve", label: "Evolve slowly", type: "toggle", default: false, hint: "Drifts gently within the look's mood so it never quite repeats." },
    {
      key: "playlist",
      label: "Rotate looks",
      type: "choice",
      options: [
        { id: "off", label: "Off" },
        { id: "15", label: "Every 15 min" },
        { id: "60", label: "Every hour" },
      ],
      default: "off",
    },
    { key: "timeOfDay", label: "Follow the time of day", type: "toggle", default: false, hint: "Follows the real Sun where you are (the Living themes location): brighter by day, warmer at golden hour, dimmer at night." },
    { key: "focusCalm", label: "Calm during Do Not Disturb", type: "toggle", default: true },
    { key: "warmWhenBusy", label: "Warm slightly when the PC is busy", type: "toggle", default: false },
    { key: "pulse", label: "Soft pulse on notifications", type: "toggle", default: false },
    { key: "albumColours", label: "Colours from what's playing", type: "toggle", default: false },
  ],
  create(ctx) {
    let opts = normaliseOptions(backdropScene, ctx.options);
    let palette = ctx.palette;
    let width = ctx.width;
    let height = ctx.height;
    let dpr = ctx.dpr;
    // Adaptive resolution: 0.25 … 1 of the device pixels (soft gradients hide it well; see step()).
    let quality = ctx.preview ? 1 : 0.5;
    const clock = new LoopClock(20);
    clock.time = ctx.preview ? 3 : 0;
    const startedAt = Date.now();
    let disposed = false;
    let renderer: BackdropRenderer | null = null;
    let fallback: CanvasRenderingContext2D | null = null;
    let base = resolveBackdrop(opts, palette);
    let keys = parseKeyframes(opts.keys);
    let applied = "";
    let lastLive = 0;
    let pulse = 0;
    // Adaptive resolution from the frame cadence the runner actually achieves.
    let slow = 0;
    let fast = 0;
    let lastStep = 0;
    let halfRate = false;
    let frameNo = 0;
    const react = { cpu: 0, focus: false, album: null as string[] | null };

    // The last good frame, kept small, shown if the GPU context is lost (driver reset, sleep, RDP).
    const parent = ctx.canvas.parentElement;
    let keep: HTMLCanvasElement | null = null;
    const snapshot = () => {
      if (!renderer || ctx.preview || !parent) return;
      if (!keep) {
        keep = document.createElement("canvas");
        keep.className = "bd-keep";
        keep.setAttribute("aria-hidden", "true");
        keep.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:none;pointer-events:none";
      }
      keep.width = Math.max(1, Math.round(ctx.canvas.width / 4));
      keep.height = Math.max(1, Math.round(ctx.canvas.height / 4));
      keep.getContext("2d")?.drawImage(ctx.canvas, 0, 0, keep.width, keep.height);
    };
    const showKeep = (on: boolean) => {
      if (!keep || !parent) return;
      if (on && !keep.isConnected) parent.append(keep);
      keep.style.display = on ? "block" : "none";
    };

    const sizeCanvas = () => {
      ctx.canvas.width = Math.max(1, Math.round(width * dpr * quality));
      ctx.canvas.height = Math.max(1, Math.round(height * dpr * quality));
    };
    sizeCanvas();

    try {
      renderer = new BackdropRenderer(ctx.canvas, {
        preserve: false,
        onLost: () => showKeep(true),
        onRestored: () => {
          if (!renderer) return;
          renderer.replace(target());
          renderer.render(clock.time);
          showKeep(false);
        },
      });
    } catch {
      renderer = null;
      fallback = ctx.canvas.getContext("2d");
    }

    const target = (): BackdropState => {
      let s = base;
      const now = Date.now();
      if (keys) {
        const d = new Date();
        s = keyframeState(keys, d.getHours() + d.getMinutes() / 60) ?? s;
      }
      if (opts.playlist !== "off") {
        const list = [base, ...CARD_PRESETS.map((id) => presetById(id)!.state).filter((p) => p.mode !== base.mode).slice(0, 5)];
        s = list[playlistIndex(startedAt, now, Number(opts.playlist) || 15, list.length)] ?? s;
      }
      if (opts.evolve) s = evolve(s, (now - startedAt) / 60000, 0.5, s.seed);
      let sun: number | null = null;
      let weather: Reactions["weather"] = null;
      if (opts.timeOfDay) {
        // The real Sun where you are, through Living Themes' public helpers (docs/LIVING_THEMES.md):
        // the same location setting and time-lapse preview as Sky. sin(altitude) is −1…1.
        const d = previewTime() ?? new Date();
        const { latitude, longitude } = resolveLocation(readLiving(), d);
        sun = Math.sin((sunPosition(d, latitude, longitude).altitude * Math.PI) / 180);
        // Live weather only when the person turned it on for Living themes (Open-Meteo, cached).
        const living = readLiving();
        if (living.weather.online) {
          const w = currentWeather(living);
          weather = (["clear", "cloudy", "rain", "snow", "storm"] as const).find((k) => k === w) ?? null;
        }
      }
      return applyReactions(s, {
        cpu: opts.warmWhenBusy ? react.cpu : 0,
        focus: !!opts.focusCalm && react.focus,
        sun,
        weather,
        album: opts.albumColours ? react.album : null,
      });
    };

    const drawFallback = () => {
      if (!fallback) return;
      // No WebGL2: a still gradient made from the same stops (never a blank desktop).
      const g = fallback.createLinearGradient(0, 0, ctx.canvas.width * 0.3, ctx.canvas.height);
      for (const st of base.stops) g.addColorStop(st.pos, st.color);
      fallback.fillStyle = g;
      fallback.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.canvas.style.background = cssGradient(base);
    };

    // Paused or still (reduced motion): changes must land in the very next (and maybe only) frame.
    const live = () => performance.now() - lastStep < 500;
    const apply = (fadeMs: number) => {
      if (!live()) fadeMs = 0;
      const s = target();
      const key = JSON.stringify(s);
      if (key === applied) return;
      applied = key;
      clock.loop = s.loop;
      if (renderer) {
        if (fadeMs > 0) renderer.setState(s, { fadeMs });
        else renderer.replace(s);
      } else drawFallback();
    };
    if (renderer) {
      try {
        renderer.replace(target());
        applied = JSON.stringify(target());
        clock.loop = base.loop;
      } catch {
        renderer.dispose();
        renderer = null;
        fallback = ctx.canvas.getContext("2d");
      }
    }
    if (!renderer) drawFallback();

    // System reactions (each opt-in, all local).
    const unsubs: Promise<() => void>[] = [];
    let poll = 0;
    if (!ctx.preview) {
      unsubs.push(listen("lens://notification", () => opts.pulse && (pulse = 1)).catch(() => () => {}));
      unsubs.push(
        listen<{ artwork?: string | null }>("lens://music/now", (e) => {
          if (!opts.albumColours || !e.payload?.artwork) return;
          import("../../music/art")
            .then(({ samplePalette }) => samplePalette(e.payload.artwork!))
            .then((p) => {
              react.album = p.slice(0, 5).map((x) => rgbToHex([x.color.r / 255, x.color.g / 255, x.color.b / 255]));
            })
            .catch(() => {});
        }).catch(() => () => {})
      );
      poll = window.setInterval(() => {
        if (opts.warmWhenBusy) invoke<{ cpuUsage: number }>("get_telemetry_cmd").then((t) => (react.cpu = (Number(t?.cpuUsage) || 0) / 100)).catch(() => {});
        if (opts.focusCalm) invoke<{ active: boolean }>("get_dnd_status_cmd").then((d) => (react.focus = !!d?.active)).catch(() => {});
      }, 5000);
    }


    const instance: SceneInstance = {
      step(_dt, input) {
        const now = performance.now();
        if (lastStep && !ctx.preview) {
          // Adaptive resolution and rate from the cadence the runner actually achieves. A weak GPU
          // (or software rendering) steps down fast: 6 very slow frames drop a quarter of the
          // resolution, down to 0.25; still slow at the floor, it draws every other frame (≈15 fps).
          const gap = now - lastStep;
          if (gap > 50 && gap < 2000) slow += gap > 90 ? 8 : 1;
          else if (gap < 38) fast++;
          if (slow > 45 && quality > MIN_QUALITY) {
            quality = Math.max(MIN_QUALITY, quality - 0.25);
            slow = fast = 0;
            sizeCanvas();
          } else if (slow > 45 && !halfRate) {
            halfRate = true;
            slow = fast = 0;
          } else if (fast > 90) {
            if (halfRate) halfRate = false;
            else if (quality < 1) {
              quality = Math.min(1, quality + 0.125);
              sizeCanvas();
            }
            slow = fast = 0;
          }
        }
        lastStep = now;
        clock.tick();
        // Re-evaluate the living layers every 2 s (cheap), crossfading real changes.
        if (now - lastLive > 2000) {
          lastLive = now;
          apply(opts.evolve ? 2000 : 1200);
        }
        pulse = Math.max(0, pulse - 0.02);
        if (renderer) {
          renderer.setPulse(pulse);
          renderer.setCursor(input.x / Math.max(1, width), input.y / Math.max(1, height), 0);
        }
      },
      render() {
        if (disposed) return;
        if (!renderer) return drawFallback();
        if (halfRate && frameNo++ % 2 === 1) return;
        if (renderer.render(clock.time) && !ctx.preview && Math.floor(clock.time) % 3 === 0) snapshot();
      },
      resize(w, h, d) {
        width = w;
        height = h;
        dpr = d;
        sizeCanvas();
        if (!renderer) drawFallback();
      },
      setPalette(p) {
        palette = p;
        if (opts.followTheme) {
          base = resolveBackdrop(opts, palette);
          apply(600);
        }
      },
      setOptions(o) {
        opts = normaliseOptions(backdropScene, o);
        base = resolveBackdrop(opts, palette);
        keys = parseKeyframes(opts.keys);
        apply(600);
      },
      dispose() {
        disposed = true;
        clearInterval(poll);
        unsubs.forEach((u) => u.then((f) => f()));
        keep?.remove();
        renderer?.dispose();
      },
    };
    return instance;
  },
};

/** The ids shown in the wallpaper card, for tests. */
export const BACKDROP_CARD_PRESETS = CARD_PRESETS;
export { allPresets };
