import type { Palette, SceneContext, SceneInstance, SceneModule } from "../types";
import { normaliseOptions } from "../types";
import {
  blendColours,
  bufferSize,
  coloursFrom,
  makeInk,
  motionTuning,
  withDefaults,
  type AmbientScene,
  type Colours,
  type Motion,
} from "./core";
import { AMBIENT_SCENES, ambientSceneById } from "./scenes";
import { ambientFor } from "./packMap";

/** Playground scene id for "the backdrop that matches my theme" (stored in wallpaper.scene). */
export const AMBIENT_SCENE_ID = "ambient";

/** Seconds a theme change takes to cross-fade into the backdrop's new colours. */
const RETINT_SECONDS = 1.6;

/** Main-thread budget per frame before the scene halves its own frame rate (ms). */
const ADAPT_MS = 3;

function activePack(): string | null {
  if (typeof document === "undefined") return null;
  return document.documentElement.dataset.preset ?? null;
}

/** Which ambient scene + params the options and the active pack ask for. */
export function resolveAmbient(variant: string, packId: string | null, dark: boolean) {
  const fromPack = ambientFor(packId, dark);
  const sceneId = variant && variant !== "auto" ? variant : fromPack.scene;
  const scene = ambientSceneById(sceneId) ?? ambientSceneById(fromPack.scene)!;
  // Pack tuning only applies to the pack's own scene; an override uses neutral params.
  const params = scene.id === fromPack.scene ? fromPack.params : undefined;
  return { scene, params };
}

/**
 * "Theme backdrop": one Playground scene that draws the ambient backdrop matching the active
 * theme pack (or a chosen one). Slow, faint, low resolution; the wallpaper's pause rules and
 * Calm / reduced motion apply as for any scene.
 */
export const ambientModule: SceneModule = {
  id: AMBIENT_SCENE_ID,
  name: "Theme backdrop",
  blurb: "A very slow, faint animation in your theme's colours. Each theme has its own.",
  interactive: false,
  calm: true,
  maxFps: 24,
  warmup: 1,
  settings: [
    {
      key: "variant",
      label: "Scene",
      type: "choice",
      options: [{ id: "auto", label: "Match my theme" }, ...AMBIENT_SCENES.map((s) => ({ id: s.id, label: s.name }))],
      default: "auto",
    },
    {
      key: "motion",
      label: "Motion",
      type: "choice",
      options: [
        { id: "still", label: "Still" },
        { id: "subtle", label: "Subtle" },
        { id: "lively", label: "Lively" },
      ],
      default: "subtle",
    },
  ],
  create(ctx: SceneContext): SceneInstance {
    let opts = normaliseOptions(ambientModule, ctx.options);
    let palette: Palette = ctx.palette;
    let { scene, params } = resolveAmbient(String(opts.variant), activePack(), palette.dark);
    let width = ctx.width, height = ctx.height;
    const canvas = ctx.canvas;
    const g = canvas.getContext("2d", { alpha: false });
    let size = { w: 16, h: 16 };
    let image: ImageData | null = null;
    let state: unknown = null;
    // Scene time starts part-way through a cycle so the first frame is not a "blank" phase.
    let t = scene.cycle * 0.37;
    let from: Colours = coloursFrom(palette, withDefaults(params));
    let to: Colours = from;
    let fade = 1;
    let ema = 0;
    let skip = false;

    const motion = (): Motion => {
      const m = String(opts.motion);
      return m === "still" || m === "lively" ? m : "subtle";
    };

    const rebuild = () => {
      // Previews use a coarser buffer; the wallpaper uses the scene's own scale.
      const s = ctx.preview ? scene.scale * 1.5 : scene.scale;
      size = bufferSize(width, height, s);
      canvas.width = size.w;
      canvas.height = size.h;
      canvas.style.imageRendering = scene.pixelated ? "pixelated" : "auto";
      image = g ? g.createImageData(size.w, size.h) : null;
      state = scene.painter.init(size.w, size.h, ctx.seed, palette.dark);
    };
    rebuild();

    const retarget = (p: Palette, force = false) => {
      const next = resolveAmbient(String(opts.variant), activePack(), p.dark);
      const changedScene = next.scene.id !== scene.id;
      palette = p;
      params = next.params;
      const target = coloursFrom(p, withDefaults(params));
      if (changedScene) {
        scene = next.scene;
        t = scene.cycle * 0.37;
        rebuild();
        from = target;
        to = target;
        fade = 1;
        return;
      }
      // Cross-fade colours from wherever the current blend is.
      from = fade >= 1 ? to : blendColours(from, to, fade);
      to = target;
      fade = force ? 1 : 0;
    };

    const paint = () => {
      if (!g || !image) return;
      const cols = fade >= 1 ? to : blendColours(from, to, fade);
      const tune = motionTuning(motion(), cols.dark);
      const ink = makeInk(cols, tune.strength);
      scene.painter.paint(
        { buf: image.data, w: size.w, h: size.h, t, ink, params: withDefaults(params), dark: cols.dark },
        state
      );
      g.putImageData(image, 0, 0);
    };

    return {
      step(dt) {
        const tune = motionTuning(motion(), palette.dark);
        t += dt * tune.speed;
        if (fade < 1) fade = Math.min(1, fade + dt / RETINT_SECONDS);
      },
      render() {
        // Adaptive frame rate: if painting gets expensive, draw every other frame.
        if (skip) {
          skip = false;
          return;
        }
        const t0 = typeof performance !== "undefined" ? performance.now() : 0;
        paint();
        const cost = typeof performance !== "undefined" ? performance.now() - t0 : 0;
        ema = ema ? ema * 0.9 + cost * 0.1 : cost;
        if (ema > ADAPT_MS) skip = true;
      },
      resize(w, h) {
        width = w;
        height = h;
        rebuild();
      },
      setPalette(p) {
        retarget(p);
      },
      setOptions(o) {
        const prev = String(opts.variant);
        opts = normaliseOptions(ambientModule, o);
        if (String(opts.variant) !== prev) retarget(palette, true);
      },
      dispose() {
        image = null;
        state = null;
      },
    };
  },
};

/** For tests and previews: the ambient scene object a pack resolves to. */
export function sceneForPack(packId: string, dark: boolean): AmbientScene {
  return resolveAmbient("auto", packId, dark).scene;
}
