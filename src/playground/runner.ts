import type { InputState, Palette, PointerSample, SceneInstance, SceneModule, SceneOptions } from "./types";
import { css, vivid } from "./util";

export interface RunnerStats {
  /** Frames actually drawn in the last second. */
  fps: number;
  /** Average main-thread time per frame (simulation + draw calls), ms. */
  ms: number;
  /** Share of the frame budget (1000 / fps cap) that `ms` uses, 0..1+. */
  budget: number;
  /** Worst frame in the last second, ms. */
  worst: number;
}

export interface Persistence {
  load(): Promise<Uint8Array | null>;
  save(bytes: Uint8Array): Promise<void>;
}

export interface RunnerOptions {
  canvas: HTMLCanvasElement;
  /** Optional overlay for click ripples. */
  overlay?: HTMLCanvasElement | null;
  module: SceneModule;
  options: SceneOptions;
  palette: Palette;
  fps: 30 | 60 | number;
  seed?: number;
  preview?: boolean;
  /** Draw one warmed-up still frame and stop (reduced motion / Calm). */
  still?: boolean;
  ripples?: boolean;
  /** Highest device pixel ratio to render at (sharpness vs cost). */
  dprCap?: number;
  onStats?: (s: RunnerStats) => void;
  persist?: Persistence | null;
  /** Save at most this often (ms). */
  saveEveryMs?: number;
}

export interface Runner {
  readonly instance: SceneInstance;
  push(sample: PointerSample): void;
  setPaused(paused: boolean): void;
  setStill(still: boolean): void;
  setFps(fps: number): void;
  setOptions(o: SceneOptions): void;
  setPalette(p: Palette): void;
  setRipples(on: boolean): void;
  reset(): void;
  /** Runs `n` steps synchronously and renders (tests, warm-up, screenshots). */
  advance(n: number, dt?: number): void;
  /** Re-measure the canvas (also done automatically with a ResizeObserver). */
  resize(): void;
  dispose(): void;
}

interface Ripple {
  x: number;
  y: number;
  t: number;
}

/** 60 or 30 for the wallpaper; 15 for gallery previews. */
export function capFps(f: number): number {
  return f >= 60 ? 60 : f >= 30 ? 30 : 15;
}

export function createRunner(o: RunnerOptions): Runner {
  const { canvas, module } = o;
  const dprCap = o.dprCap ?? 1;
  const sceneMax = module.maxFps ?? 60;
  let fps = Math.min(capFps(o.fps), sceneMax);
  let paused = false;
  let still = !!o.still;
  let ripplesOn = !!o.ripples;
  let disposed = false;
  let raf = 0;
  let lastFrame = 0;
  let palette = o.palette;
  const ripples: Ripple[] = [];

  const measure = () => {
    const parent = canvas.parentElement;
    const w = Math.max(1, Math.round((parent?.clientWidth || canvas.clientWidth || 300) as number));
    const h = Math.max(1, Math.round((parent?.clientHeight || canvas.clientHeight || 150) as number));
    const dpr = Math.min(dprCap, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
    return { w, h, dpr };
  };
  let size = measure();

  const sizeOverlay = () => {
    if (!o.overlay) return;
    o.overlay.width = Math.round(size.w * size.dpr);
    o.overlay.height = Math.round(size.h * size.dpr);
  };
  sizeOverlay();

  const instance = module.create({
    canvas,
    width: size.w,
    height: size.h,
    dpr: size.dpr,
    palette,
    options: o.options,
    seed: o.seed ?? ((Math.random() * 2 ** 31) | 0),
    preview: !!o.preview,
  });

  const input: InputState = { x: -1, y: -1, inside: false, buttons: 0, alt: false, events: [] };
  const pending: PointerSample[] = [];

  // Stats over a rolling second.
  let statFrames = 0;
  let statMs = 0;
  let statWorst = 0;
  let statStart = 0;

  const drawRipples = (now: number) => {
    const ov = o.overlay;
    if (!ov) return;
    const ctx = ov.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);
    const col = vivid(palette.accent, 0.4, palette.dark ? 0.7 : 0.45);
    for (let i = ripples.length - 1; i >= 0; i--) {
      const r = ripples[i];
      const age = (now - r.t) / 1000;
      if (age > 1.4) {
        ripples.splice(i, 1);
        continue;
      }
      for (let k = 0; k < 3; k++) {
        const a = age - k * 0.14;
        if (a <= 0) continue;
        const rad = 8 + a * 170;
        ctx.strokeStyle = css(col, Math.max(0, 0.55 * (1 - a / 1.25)) * (1 - k * 0.25));
        ctx.lineWidth = 2.2 - k * 0.5;
        ctx.beginPath();
        ctx.arc(r.x, r.y, rad, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  };

  const consumeInput = () => {
    input.events = pending.splice(0, pending.length);
    for (const e of input.events) {
      if (e.kind === "leave") {
        input.inside = false;
        input.buttons = 0;
        continue;
      }
      input.x = e.x;
      input.y = e.y;
      input.inside = true;
      input.buttons = e.buttons;
      input.alt = e.alt;
      if (e.kind === "down" && ripplesOn && o.overlay) ripples.push({ x: e.x, y: e.y, t: performance.now() });
    }
  };

  const frame = (now: number, dt: number) => {
    const t0 = performance.now();
    consumeInput();
    instance.step(Math.min(dt, 1 / 15), input);
    instance.render();
    if (o.overlay && (ripples.length || ripplesOn)) drawRipples(now);
    const cost = performance.now() - t0;
    statFrames++;
    statMs += cost;
    statWorst = Math.max(statWorst, cost);
    if (!statStart) statStart = now;
    if (now - statStart >= 1000) {
      const avg = statMs / Math.max(1, statFrames);
      o.onStats?.({
        fps: Math.round((statFrames * 1000) / (now - statStart)),
        ms: avg,
        budget: avg / (1000 / fps),
        worst: statWorst,
      });
      statFrames = 0;
      statMs = 0;
      statWorst = 0;
      statStart = now;
    }
  };

  const loop = (now: number) => {
    raf = 0;
    if (disposed || paused || still) return;
    raf = requestAnimationFrame(loop);
    const interval = 1000 / fps;
    if (lastFrame && now - lastFrame < interval - 1.5) return;
    const dt = lastFrame ? (now - lastFrame) / 1000 : 1 / fps;
    // Keep cadence even when rAF runs at 144 Hz.
    lastFrame = lastFrame && now - lastFrame < interval * 2 ? lastFrame + interval : now;
    frame(now, dt);
  };

  const kick = () => {
    if (disposed) return;
    if (still) {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      drawStill();
      return;
    }
    if (!paused && !raf) {
      lastFrame = 0;
      raf = requestAnimationFrame(loop);
    }
  };

  let stillDrawn = false;
  const drawStill = () => {
    if (!stillDrawn) {
      const n = module.warmup ?? 60;
      for (let i = 0; i < n; i++) instance.step(1 / 30, input);
      stillDrawn = true;
    }
    instance.render();
    if (o.overlay) o.overlay.getContext("2d")?.clearRect(0, 0, o.overlay.width, o.overlay.height);
  };

  // Persistence: load once, then save when dirty (throttled) and on dispose.
  let saveTimer = 0;
  let lastSave = 0;
  const saveNow = () => {
    if (!o.persist || !instance.save || !instance.dirty) return;
    const bytes = instance.save();
    instance.dirty = false;
    lastSave = Date.now();
    if (bytes) o.persist.save(bytes).catch(() => {});
  };
  if (o.persist && instance.load) {
    o.persist
      .load()
      .then((bytes) => {
        if (bytes && !disposed) {
          instance.load!(bytes);
          instance.dirty = false;
          if (still || paused) instance.render();
        }
      })
      .catch(() => {});
    saveTimer = window.setInterval(() => {
      if (Date.now() - lastSave >= (o.saveEveryMs ?? 15000)) saveNow();
    }, 5000);
  }

  let ro: ResizeObserver | null = null;
  const resize = () => {
    const next = measure();
    if (next.w === size.w && next.h === size.h && next.dpr === size.dpr) return;
    size = next;
    sizeOverlay();
    instance.resize(size.w, size.h, size.dpr);
    if (still || paused) instance.render();
  };
  if (typeof ResizeObserver !== "undefined" && canvas.parentElement) {
    ro = new ResizeObserver(() => resize());
    ro.observe(canvas.parentElement);
  }

  instance.render();
  kick();

  return {
    instance,
    push(sample) {
      if (pending.length > 256) pending.splice(0, pending.length - 128);
      pending.push(sample);
    },
    setPaused(p) {
      paused = p;
      if (p && raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
      kick();
    },
    setStill(s) {
      still = s;
      kick();
    },
    setFps(f) {
      fps = Math.min(capFps(f), sceneMax);
    },
    setOptions(opts) {
      instance.setOptions?.(opts);
      if (still || paused) instance.render();
    },
    setPalette(p) {
      palette = p;
      instance.setPalette?.(p);
      if (still || paused) instance.render();
    },
    setRipples(on) {
      ripplesOn = on;
    },
    reset() {
      instance.reset?.();
      instance.dirty = true;
      instance.render();
    },
    advance(n, dt = 1 / fps) {
      for (let i = 0; i < n; i++) frame(performance.now(), dt);
    },
    resize,
    dispose() {
      if (disposed) return;
      saveNow();
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      if (saveTimer) clearInterval(saveTimer);
      ro?.disconnect();
      instance.dispose();
    },
  };
}
