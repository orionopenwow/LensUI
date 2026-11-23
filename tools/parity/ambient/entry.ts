// Ambient backdrop gallery for screenshots, loops and in-browser timing (docs/AMBIENT.md).
//   ?mode=sheet                         every built-in pack: still frame + 3-frame strip of slow motion
//   ?mode=frame&pack=<id>&t=<seconds>   one full-viewport backdrop exactly as the wallpaper draws it
//   ?mode=perf                          paint + putImageData timing per scene at 1080p, as JSON
import { THEME_PACKS } from "../../../src/themes/packs";
import { bufferSize, coloursFrom, makeInk, motionTuning, withDefaults, type AmbientScene } from "../../../src/playground/ambient/core";
import { AMBIENT_SCENES, ambientSceneById } from "../../../src/playground/ambient/scenes";
import { ambientFor } from "../../../src/playground/ambient/packMap";
import { packPalette } from "../../../src/playground/ambient/packPalette";

const q = new URLSearchParams(location.search);
const mode = q.get("mode") ?? "sheet";
const root = document.getElementById("root")!;
document.body.style.margin = "0";

function draw(canvas: HTMLCanvasElement, packId: string, t: number, cssW: number, cssH: number, scaleMul = 1) {
  const pack = THEME_PACKS.find((p) => p.id === packId);
  const palette = packPalette(pack ?? { accent: "#FAFAFA" });
  const choice = ambientFor(packId, palette.dark);
  const scene = ambientSceneById(choice.scene) as AmbientScene;
  const { w, h } = bufferSize(cssW, cssH, scene.scale * scaleMul);
  canvas.width = w;
  canvas.height = h;
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  canvas.style.imageRendering = scene.pixelated ? "pixelated" : "auto";
  const g = canvas.getContext("2d", { alpha: false })!;
  const params = withDefaults(choice.params);
  const ink = makeInk(coloursFrom(palette, params), motionTuning("subtle", palette.dark).strength);
  const st = scene.painter.init(w, h, 11, palette.dark);
  const img = g.createImageData(w, h);
  scene.painter.paint({ buf: img.data, w, h, t, ink, params, dark: palette.dark }, st);
  g.putImageData(img, 0, 0);
  return scene;
}

if (mode === "frame") {
  const packId = q.get("pack") ?? "obsidian";
  const c = document.createElement("canvas");
  c.style.display = "block";
  root.append(c);
  const render = (t: number) => draw(c, packId, t, innerWidth, innerHeight);
  const scene = render(Number(q.get("t") ?? "0"));
  (window as any).render = render;
  (window as any).cycle = scene.cycle;
} else if (mode === "perf") {
  const results: Record<string, { w: number; h: number; ms: number }> = {};
  const palette = packPalette({ accent: "#FAFAFA" });
  for (const scene of AMBIENT_SCENES) {
    const { w, h } = bufferSize(1920, 1080, scene.scale);
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const g = c.getContext("2d", { alpha: false })!;
    const params = withDefaults(undefined);
    const ink = makeInk(coloursFrom(palette, params), motionTuning("subtle", true).strength);
    const st = scene.painter.init(w, h, 1, true);
    const img = g.createImageData(w, h);
    let t = 0;
    const frame = () => {
      scene.painter.paint({ buf: img.data, w, h, t: (t += 1 / 24), ink, params, dark: true }, st);
      g.putImageData(img, 0, 0);
    };
    for (let i = 0; i < 20; i++) frame();
    const batches: number[] = [];
    for (let b = 0; b < 7; b++) {
      const t0 = performance.now();
      for (let i = 0; i < 12; i++) frame();
      batches.push((performance.now() - t0) / 12);
    }
    batches.sort((a, b) => a - b);
    results[scene.id] = { w, h, ms: Math.round(batches[3] * 100) / 100 };
  }
  (window as any).perf = results;
  root.textContent = JSON.stringify(results);
} else {
  // Sheet
  const dark = q.get("bg") !== "light";
  document.body.style.background = dark ? "#0c0c0f" : "#f4f4f5";
  document.body.style.fontFamily = "Arial, sans-serif";
  const grid = document.createElement("div");
  grid.style.cssText = "display:grid;grid-template-columns:repeat(3, 1fr);gap:18px;padding:20px;";
  root.append(grid);
  for (const p of THEME_PACKS) {
    const pal = packPalette(p);
    const choice = ambientFor(p.id, pal.dark);
    const scene = ambientSceneById(choice.scene)!;
    const card = document.createElement("div");
    card.style.cssText = `display:flex;flex-direction:column;gap:6px;color:${dark ? "#e4e4e7" : "#18181b"};font-size:13px;`;
    const label = document.createElement("div");
    label.innerHTML = `<b>${p.label}</b> <span style="opacity:.65">→ ${scene.name}</span>`;
    const main = document.createElement("canvas");
    main.style.borderRadius = "8px";
    const t0 = scene.cycle * 0.37;
    draw(main, p.id, t0, 400, 225, 0.5);
    const strip = document.createElement("div");
    strip.style.cssText = "display:flex;gap:6px;";
    for (let i = 0; i < 3; i++) {
      const c = document.createElement("canvas");
      c.style.borderRadius = "5px";
      draw(c, p.id, t0 + (scene.cycle * i) / 6, 129, 72, 0.5);
      strip.append(c);
    }
    const cap = document.createElement("div");
    cap.style.cssText = "opacity:.55;font-size:11px;font-family:monospace";
    cap.textContent = `strip: +0 s · +${Math.round(scene.cycle / 6)} s · +${Math.round(scene.cycle / 3)} s`;
    card.append(label, main, strip, cap);
    grid.append(card);
  }
}
