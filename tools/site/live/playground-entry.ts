// The real Lens Playground scenes (src/playground) running on a plain canvas, with no React and
// no Tauri. Used by the website's "Living desktop" demo and by tools/media/record.mjs.
// The page sets --lens-accent / --lens-pack-base / --lens-fg (and data-scheme) on <html>; the
// scene reads them exactly as it does in Lens.
import { createRunner, type Runner } from "../../../src/playground/runner";
import { readPalette } from "../../../src/playground/palette";
import { SCENES, sceneById } from "../../../src/playground/registry";
import { defaultOptions, type PointerSample } from "../../../src/playground/types";
// "Theme backdrop": the ambient scene matching the active pack (<html data-preset>).
// Resolved by tools/site/live/build-live.mjs: src/playground/ambient when merged, else the vendored copy.
import { ambientModule } from "lens-ambient";
import { packPalette } from "lens-ambient-palette";
import type { Palette } from "../../../src/playground/types";
export { packPalette };

const ALL = [ambientModule, ...SCENES];
const byId = (id: string) => ALL.find((s) => s.id === id) ?? sceneById(id);

export interface MountOptions {
  scene: string;
  fps?: number;
  still?: boolean;
  seed?: number;
  ripples?: boolean;
  /** Scene options on top of the defaults (e.g. ambient { motion: "lively" }). */
  options?: Record<string, string | number | boolean>;
  /** Colours to paint with; default = the page's --lens-* tokens. */
  palette?: Palette;
}

export interface Mounted {
  runner: Runner;
  push(s: PointerSample): void;
  setScene(id: string): void;
  /** Changes one scene setting (e.g. sand "material"), keeping the others. */
  setOption(key: string, value: string | number | boolean): void;
  setStill(still: boolean): void;
  refreshPalette(): void;
  /** Paint with these colours from now on (cross-fades in the theme backdrop). */
  setPalette(p: Palette): void;
  dispose(): void;
}

export const scenes = ALL.map((s) => ({ id: s.id, name: s.name, blurb: s.blurb, interactive: s.interactive }));

export function mount(host: HTMLElement, o: MountOptions): Mounted {
  let runner: Runner | null = null;
  let canvas: HTMLCanvasElement | null = null;
  let overlay: HTMLCanvasElement | null = null;
  let still = !!o.still;
  let pal: Palette | undefined = o.palette;
  let options: Record<string, string | number | boolean> = {};
  const build = (id: string) => {
    runner?.dispose();
    canvas?.remove();
    overlay?.remove();
    const module = byId(id) ?? SCENES[0];
    options = { ...defaultOptions(module), ...(o.options ?? {}) };
    canvas = document.createElement("canvas");
    overlay = document.createElement("canvas");
    for (const c of [canvas, overlay]) Object.assign(c.style, { position: "absolute", inset: "0", width: "100%", height: "100%", display: "block" });
    overlay.style.pointerEvents = "none";
    host.append(canvas, overlay);
    runner = createRunner({
      canvas,
      overlay,
      module,
      options,
      palette: pal ?? readPalette(),
      fps: o.fps ?? 60,
      seed: o.seed ?? 7,
      still,
      ripples: o.ripples ?? true,
      dprCap: 1.5,
    });
  };
  build(o.scene);

  const sample = (kind: PointerSample["kind"], e: PointerEvent | WheelEvent): PointerSample => {
    const r = host.getBoundingClientRect();
    return {
      kind,
      x: e.clientX - r.left,
      y: e.clientY - r.top,
      button: kind === "down" || kind === "up" ? (e as PointerEvent).button : -1,
      buttons: (e as PointerEvent).buttons ?? 0,
      delta: kind === "wheel" ? -Math.sign((e as WheelEvent).deltaY) : 0,
      alt: e.altKey,
    };
  };
  const handlers: [string, (e: Event) => void][] = [
    ["pointermove", (e) => runner?.push(sample("move", e as PointerEvent))],
    ["pointerdown", (e) => {
      (e.target as Element).setPointerCapture?.((e as PointerEvent).pointerId);
      runner?.push(sample("down", e as PointerEvent));
    }],
    ["pointerup", (e) => runner?.push(sample("up", e as PointerEvent))],
    ["pointerleave", (e) => runner?.push(sample("leave", e as PointerEvent))],
    ["contextmenu", (e) => e.preventDefault()],
  ];
  for (const [n, h] of handlers) host.addEventListener(n, h, { passive: n !== "contextmenu" });

  return {
    get runner() { return runner!; },
    push: (s) => runner?.push(s),
    setScene: (id) => build(id),
    setOption: (key, value) => { options = { ...options, [key]: value }; runner?.setOptions(options); },
    setStill: (s) => { still = s; runner?.setStill(s); },
    refreshPalette: () => runner?.setPalette(pal ?? readPalette()),
    setPalette: (p) => { pal = p; runner?.setPalette(p); },
    dispose: () => {
      for (const [n, h] of handlers) host.removeEventListener(n, h);
      runner?.dispose();
      canvas?.remove();
      overlay?.remove();
    },
  };
}
