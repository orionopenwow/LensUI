/**
 * Playground scene modules for the Living Themes (one per painter). See docs/LIVING_THEMES.md.
 *
 * Rendering: the painter fills an RGBA buffer at half the CSS resolution (a third on very large
 * screens) which is put on a canvas and scaled up by CSS; gradients survive the upscale. At most
 * 10 fps ("Subtle"), and the host already stops the loop when the wallpaper is covered, in a
 * fullscreen app or game, on battery, or with Calm / reduced motion. "Still" draws one frame and
 * then only repaints once a minute so the Sun keeps its real position.
 */
import type { SceneContext, SceneInstance, SceneModule } from "../types";
import { makeFrame, type LivingInputs } from "./sky";
import { LIVING_PAINTERS, type LivingPainter } from "./themes";
import { onLivingChange, onPreviewTime, previewTime, readLiving, resolveLocation, type LivingSettings } from "./settings";
import { currentWeather, onWeather } from "./weather";

export interface MonitorRect {
  id: string;
  x: number;
  width: number;
}

/** The slice of one continuous sky that a monitor shows (fractions of the whole desktop width). */
export function viewForMonitor(monitors: MonitorRect[], id: string | null): { x0: number; x1: number } {
  if (!monitors.length || !id) return { x0: 0, x1: 1 };
  const minX = Math.min(...monitors.map((m) => m.x));
  const maxX = Math.max(...monitors.map((m) => m.x + m.width));
  const total = Math.max(1, maxX - minX);
  const m = monitors.find((q) => q.id === id);
  if (!m) return { x0: 0, x1: 1 };
  return { x0: (m.x - minX) / total, x1: (m.x + m.width - minX) / total };
}

/** Render scale relative to CSS pixels: half resolution, a third above 2560 px wide. */
export function renderScale(cssWidth: number): number {
  return cssWidth > 2560 ? 1 / 3 : 1 / 2;
}

/** Which monitor this window sits on, from its top-left corner in physical pixels. */
export function monitorAt(monitors: (MonitorRect & { y?: number; height?: number })[], px: number, py: number): string | null {
  const hit = monitors.find((m) => px >= m.x && px < m.x + m.width && (m.y === undefined || m.height === undefined || (py >= m.y && py < m.y + m.height)));
  return hit?.id ?? null;
}

/** Asks Lens for the monitor layout (wallpaper windows only). */
async function lookUpView(): Promise<{ x0: number; x1: number }> {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const monitors = await invoke<(MonitorRect & { y: number; height: number })[]>("list_monitors_cmd");
    const dpr = window.devicePixelRatio || 1;
    return viewForMonitor(monitors, monitorAt(monitors, window.screenX * dpr + 1, window.screenY * dpr + 1));
  } catch {
    return { x0: 0, x1: 1 };
  }
}

function inputsFor(now: Date, t: number, s: LivingSettings, motion: number, view: { x0: number; x1: number }): LivingInputs {
  const loc = resolveLocation(s, now);
  return {
    date: now,
    latitude: loc.latitude,
    longitude: loc.longitude,
    t,
    motion,
    clouds: s.clouds,
    weather: currentWeather(s),
    view: s.spanMonitors ? view : { x0: 0, x1: 1 },
  };
}

function createLiving(p: LivingPainter, ctx: SceneContext): SceneInstance {
  const c2d = ctx.canvas.getContext("2d", { alpha: false }) as CanvasRenderingContext2D | null;
  if (!c2d) throw new Error("2D canvas unavailable");
  let settings = readLiving();
  let cssW = ctx.width, cssH = ctx.height;
  let bw = 1, bh = 1;
  let image: ImageData | null = null;
  let px = new Uint32Array(1);
  let state: unknown = null;
  let t = 0;
  let lastKey = "";
  let view = { x0: 0, x1: 1 };
  const refreshView = () => {
    if (ctx.preview || !settings.spanMonitors || typeof window === "undefined") return;
    void lookUpView().then((v) => {
      view = v;
      draw(true);
    });
  };

  const alloc = () => {
    const k = ctx.preview ? 1 / 2 : renderScale(cssW);
    bw = Math.max(16, Math.round(cssW * k));
    bh = Math.max(9, Math.round(cssH * k));
    ctx.canvas.width = bw;
    ctx.canvas.height = bh;
    ctx.canvas.style.imageRendering = "auto";
    image = c2d.createImageData(bw, bh);
    px = new Uint32Array(image.data.buffer);
    state = p.init(bw, bh, ctx.seed | 0 || 7);
    lastKey = "";
  };
  alloc();

  const draw = (force: boolean) => {
    const now = (ctx.preview && previewTime()) || new Date();
    const motion = settings.motion === "still" ? 0 : 1;
    // Still: repaint only when the minute (or a setting) changes.
    const key = `${Math.floor(now.getTime() / 60_000)}|${bw}x${bh}`;
    if (!force && motion === 0 && key === lastKey) return;
    lastKey = key;
    const f = makeFrame(inputsFor(now, t, settings, motion, view));
    p.paint(px, bw, bh, f, state);
    c2d.putImageData(image!, 0, 0);
  };

  const unsubs = [
    onLivingChange((s) => {
      const spanChanged = s.spanMonitors !== settings.spanMonitors;
      settings = s;
      draw(true);
      if (spanChanged) refreshView();
    }),
    onPreviewTime(() => draw(true)),
    onWeather(() => draw(true)),
  ];
  refreshView();
  // Paused / still windows still follow the real Sun: one cheap repaint a minute.
  const minute = typeof window !== "undefined" ? window.setInterval(() => draw(false), 60_000) : 0;

  return {
    step(dt) {
      if (settings.motion !== "still") t += Math.min(0.25, dt);
    },
    render() {
      draw(false || settings.motion !== "still");
    },
    resize(w, h) {
      cssW = w;
      cssH = h;
      alloc();
      draw(true);
      refreshView();
    },
    setOptions() {
      draw(true);
    },
    reset() {
      t = 0;
      draw(true);
    },
    dispose() {
      unsubs.forEach((u) => u());
      if (minute) clearInterval(minute);
    },
  };
}

function moduleFor(p: LivingPainter): SceneModule {
  return {
    id: p.id,
    name: p.name,
    blurb: p.blurb,
    interactive: false,
    calm: true,
    maxFps: 10,
    warmup: 1,
    settings: [],
    create: (ctx) => createLiving(p, ctx),
  };
}

export const LIVING_SCENES: SceneModule[] = LIVING_PAINTERS.map(moduleFor);
export const LIVING_SCENE_IDS = new Set(LIVING_SCENES.map((m) => m.id));
