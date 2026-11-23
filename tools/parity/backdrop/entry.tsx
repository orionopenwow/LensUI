// Backdrop Lab harness (docs/BACKDROP_LAB.md §Tests). Scenes, by ?scene=…:
//   lab        the Studio window (Backdrop Lab) in the theme given by &preset=
//   creator    the Settings › Appearance › Creator embed
//   modes      every look as a labelled thumbnail
//   frame      one backdrop full-viewport: &id=<preset> or &mode=<look>, &t=<seconds>
//   checks     shader compile, NaN, seam and determinism checks → window.result (JSON)
//   perf       ms per frame at 1080p per look → window.result
//   wallpaper  the real wallpaper surface running the "backdrop" scene (&wp=<preset>)
//   flash      switches wallpaper looks and samples every frame for a blank / flash → window.result
//   theme      "Make a theme from this": the generated pack applied to Settings and the Dock
import React from "react";
import ReactDOM from "react-dom/client";
import "../../../src/styles/tokens.css";
import "../../../src/styles/global.css";
import "../../../src/surfaces/ControlCenterSurface.css";
import {
  BackdropRenderer,
  MODES,
  allPresets,
  defaultState,
  presetById,
  backdropToPack,
  type BackdropState,
} from "../../../src/studio/backdrop/engine";

const q = new URLSearchParams(location.search);
const scene = q.get("scene") || "lab";
const root = document.getElementById("root")!;
const W = window as any;

function stateFromQuery(): BackdropState {
  const id = q.get("id");
  const mode = q.get("mode");
  if (id) return presetById(id)!.state;
  return defaultState((mode as any) || "mesh");
}

function canvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function diff(a: Uint8Array, b: Uint8Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i += 4) s += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
  return s / (a.length / 4) / 3;
}

function badMask(px: Uint8Array): number {
  let n = 0;
  for (let i = 0; i < px.length; i += 4) if (px[i] > 128) n++;
  return n;
}

async function run() {
  if (scene === "lab") {
    const { StudioSurface } = await import("../../../src/studio/StudioSurface");
    try {
      localStorage.setItem("lens.backdrop.coach", q.get("coach") === "1" ? "false" : "true");
      localStorage.setItem("lens.backdrop.handleHint", "1");
      if (q.get("id")) localStorage.setItem("lens.backdrop.current", JSON.stringify((await import("../../../src/studio/backdrop/engine")).encodeState(presetById(q.get("id")!)!.state)));
    } catch {}
    document.body.style.background = "#000";
    root.style.cssText = "width:100vw;height:100vh";
    ReactDOM.createRoot(root).render(<StudioSurface />);
    return;
  }
  if (scene === "creator") {
    const { CreatorCard } = await import("../../../src/studio/backdrop/ui/CreatorCard");
    const { useLensState } = await import("../../../src/hooks/useLensState");
    const App = () => {
      const { config, updateConfig } = useLensState();
      return (
        <div className="lens-glass" style={{ padding: 18, width: 760 }}>
          <div className="cc-section-title">Creator</div>
          <div className="cc-section-sub" style={{ marginBottom: 10 }}>Make your own animated backgrounds and themes with Backdrop Lab.</div>
          <CreatorCard config={config} updateConfig={updateConfig} />
        </div>
      );
    };
    ReactDOM.createRoot(root).render(<App />);
    return;
  }
  if (scene === "modes") {
    document.body.style.cssText = "margin:0;background:#0a0a0c;color:#e4e4e7;font:12px Arial";
    root.style.cssText = "display:grid;grid-template-columns:repeat(6,300px);gap:10px;padding:12px";
    const c = canvas(300, 169);
    const r = new BackdropRenderer(c, { preserve: true });
    for (const m of MODES) {
      const s = defaultState(m.id);
      // Each look with a preset palette that suits it, so the sheet reads like the Lab.
      const p = allPresets().find((x) => x.state.mode === m.id && x.group !== "Lens" && x.group !== "Packs") ?? allPresets().find((x) => x.state.mode === m.id);
      r.replace(p ? { ...s, stops: p.state.stops, space: p.state.space, bloom: p.state.bloom } : s);
      r.render(4);
      const d = document.createElement("div");
      const img = new Image();
      img.src = c.toDataURL();
      img.style.cssText = "display:block;border-radius:8px";
      const t = document.createElement("div");
      t.textContent = `${m.name} · ${m.family}`;
      t.style.cssText = "padding:5px 2px;color:#e4e4e7;font:600 12px Arial";
      d.append(img, t);
      root.append(d);
    }
    W.result = { ok: true };
    return;
  }
  if (scene === "frame") {
    const w = Number(q.get("w") || innerWidth);
    const h = Number(q.get("h") || innerHeight);
    document.body.style.margin = "0";
    const c = canvas(w, h);
    c.style.cssText = "display:block;width:100vw;height:100vh";
    root.append(c);
    const r = new BackdropRenderer(c, { preserve: true });
    r.replace(stateFromQuery());
    r.render(Number(q.get("t") || 4));
    W.result = { ok: true };
    return;
  }
  if (scene === "checks") {
    const out: Record<string, unknown> = {};
    const c = canvas(192, 108);
    const r = new BackdropRenderer(c, { preserve: true });
    const errors: string[] = [];
    const seams: Record<string, number> = {};
    const jumps: Record<string, number> = {};
    const nan: Record<string, number> = {};
    const blank: string[] = [];
    const states: [string, BackdropState][] = [
      ...MODES.map((m) => [`mode:${m.id}`, { ...defaultState(m.id), speed: 0.5 }] as [string, BackdropState]),
      ...allPresets().map((p) => [`preset:${p.id}`, p.state] as [string, BackdropState]),
    ];
    for (const [id, s] of states) {
      try {
        r.compileNow(s.mode);
        r.replace(s);
        // Frame 0 vs frame at exactly one loop: identical (seamless).
        r.render(0);
        const a = r.readPixels();
        r.render(s.loop);
        const b = r.readPixels();
        // Frame just before the loop point vs frame 0: a normal frame-to-frame step, no jump.
        r.render(s.loop - 1 / 30);
        const before = r.readPixels();
        r.render(1 / 30);
        const after = r.readPixels();
        seams[id] = diff(a, b);
        jumps[id] = Math.max(diff(before, a), diff(a, after));
        // NaN / Inf mask at three times.
        r.debugNaN = true;
        let bad = 0;
        for (const t of [0, s.loop * 0.37, s.loop - 1 / 30]) {
          r.render(t);
          bad += badMask(r.readPixels());
        }
        r.debugNaN = false;
        nan[id] = bad;
        let lum = 0;
        for (let i = 0; i < a.length; i += 4) lum += a[i] + a[i + 1] + a[i + 2];
        if (lum / (a.length / 4) / 3 < 1) blank.push(id);
      } catch (e) {
        errors.push(`${id}: ${String(e).slice(0, 400)}`);
      }
    }
    // Grain + dither change per frame by design; seam numbers include that noise floor.
    out.errors = errors;
    out.seams = seams;
    out.jumps = jumps;
    out.nan = Object.fromEntries(Object.entries(nan).filter(([, v]) => v > 0));
    out.blank = blank;
    out.count = states.length;
    W.result = out;
    return;
  }
  if (scene === "perf") {
    // Software WebGL in CI is ~100× slower than a GPU: time a 640×360 frame and scale to 1080p.
    const c = canvas(640, 360);
    const r = new BackdropRenderer(c, { preserve: false });
    const gl = c.getContext("webgl2")!;
    const res: Record<string, number> = {};
    for (const m of MODES) {
      await new Promise((res) => setTimeout(res, 0));
      r.replace(defaultState(m.id));
      r.render(0);
      gl.finish();
      const n = 2;
      const t0 = performance.now();
      const px = new Uint8Array(4);
      for (let i = 0; i < n; i++) {
        r.render(i / 30);
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      }
      res[m.id] = Math.round(((performance.now() - t0) / n) * 9 * 10) / 10;
    }
    W.result = res;
    return;
  }
  if (scene === "wallpaper" || scene === "flash") {
    if (scene === "flash") {
      // Measurement only: keep WebGL frames readable after they are presented, so the sampler
      // sees exactly what was on screen (the real wallpaper doesn't need this).
      const orig = HTMLCanvasElement.prototype.getContext;
      (HTMLCanvasElement.prototype as any).getContext = function (this: HTMLCanvasElement, type: string, attrs?: any) {
        return orig.call(this, type as any, type.startsWith("webgl") ? { ...(attrs ?? {}), preserveDrawingBuffer: true } : attrs);
      };
    }
    const { WallpaperSurface } = await import("../../../src/surfaces/WallpaperSurface");
    document.body.style.margin = "0";
    root.style.cssText = "width:100vw;height:100vh";
    ReactDOM.createRoot(root).render(<WallpaperSurface />);
    if (scene === "flash") {
      // Switch looks three times (including to/from another scene) and sample every frame.
      const probe = canvas(16, 9);
      const g = probe.getContext("2d", { willReadFrequently: true })!;
      const lums: number[] = [];
      let sampling = true;
      const sample = () => {
        const cs = [...document.querySelectorAll<HTMLCanvasElement>(".pg-canvas")];
        // Composite what is visible: the topmost scene layer with its opacity over the one below.
        g.fillStyle = "#08080b";
        g.fillRect(0, 0, 16, 9);
        for (const c of cs) {
          const host = c.parentElement as HTMLElement;
          g.globalAlpha = Number(getComputedStyle(host).opacity || 1);
          try {
            g.drawImage(c, 0, 0, 16, 9);
          } catch {}
        }
        g.globalAlpha = 1;
        const px = g.getImageData(0, 0, 16, 9).data;
        let l = 0;
        for (let i = 0; i < px.length; i += 4) l += px[i] * 0.2126 + px[i + 1] * 0.7152 + px[i + 2] * 0.0722;
        lums.push(l / (px.length / 4));
        if (sampling) requestAnimationFrame(sample);
      };
      await new Promise((r) => setTimeout(r, 1000));
      requestAnimationFrame(sample);
      await new Promise((r) => setTimeout(r, 600));
      const steps: [string, any][] = [
        ["preset → preset", { sceneOptions: { backdrop: { preset: "nature-moon-sea" } } }],
        ["preset → other scene", { scene: "aurora" }],
        ["other scene → preset", { scene: "backdrop", sceneOptions: { backdrop: { preset: "light-gallery-beam" } } }],
      ];
      const marks: { step: string; from: number; to: number }[] = [];
      for (const [name, patch] of steps) {
        const from = lums.length;
        W.__setWallpaper(patch);
        await new Promise((r) => setTimeout(r, 1600));
        marks.push({ step: name, from, to: lums.length });
      }
      sampling = false;
      // A flash = a frame much darker or brighter than both looks around the switch.
      const report = marks.map((m) => {
        const seg = lums.slice(Math.max(0, m.from - 5), m.to);
        const pre = lums.slice(Math.max(0, m.from - 5), m.from);
        const post = lums.slice(m.to - 5, m.to);
        const lo = Math.min(...pre, ...post);
        const hi = Math.max(...pre, ...post);
        return { step: m.step, min: Math.min(...seg), max: Math.max(...seg), lo, hi, frames: seg.length, flash: Math.min(...seg) < lo * 0.6 - 4 || Math.max(...seg) > hi * 1.4 + 8 };
      });
      W.result = { report, frames: lums.length, lums: lums.map((x) => Math.round(x)), marks };
    } else {
      setTimeout(() => (W.result = { ok: true }), 1500);
    }
    return;
  }
  if (scene === "theme") {
    const { registerCustomPack } = await import("../../../src/themes/packs");
    const s = presetById(q.get("id") || "lens-nebula")!.state;
    const { pack, report } = backdropToPack(s, s.name || "Backdrop");
    const reg = registerCustomPack({ ...pack, id: pack.label });
    W.__themeReport = { pack, report, id: reg?.id };
    document.body.style.margin = "0";
    root.style.cssText = "position:relative;width:100vw;height:100vh;overflow:hidden";
    const c = canvas(innerWidth, innerHeight);
    c.style.cssText = "position:absolute;inset:0;width:100%;height:100%";
    root.append(c);
    const r = new BackdropRenderer(c, { preserve: true });
    r.replace(s);
    r.render(4);
    // Apply the generated pack, then show Settings (Appearance) and the Dock in it, over the backdrop.
    const core = await import("@tauri-apps/api/core");
    const { applyThemePack } = await import("../../../src/themes/packs");
    const cfg = await core.invoke<any>("get_config");
    await core.invoke("save_config_cmd", { newConfig: applyThemePack(cfg, reg!.id) });
    const { ControlCenterSurface } = await import("../../../src/surfaces/ControlCenterSurface");
    const { DockSurface } = await import("../../../src/surfaces/DockSurface");
    const cc = document.createElement("div");
    cc.style.cssText = "position:absolute;left:60px;top:48px;width:760px;height:540px;overflow:hidden;border-radius:12px";
    const dock = document.createElement("div");
    dock.style.cssText = "position:absolute;left:0;right:0;bottom:0;height:120px";
    root.append(cc, dock);
    ReactDOM.createRoot(cc).render(<ControlCenterSurface />);
    ReactDOM.createRoot(dock).render(<DockSurface />);
    setTimeout(() => (W.result = { report, pack, id: reg?.id }), 1500);
    return;
  }
}

setTimeout(() => run().catch((e) => {
  W.result = { error: String(e) };
  throw e;
}), 0);
