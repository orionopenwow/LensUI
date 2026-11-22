import type { InputState, Palette, RGB, SceneContext, SceneInstance, SceneModule, SceneOptions } from "../types";
import { normaliseOptions } from "../types";
import { compile, FULLSCREEN_VS, getGL2 } from "../gl";
import { clamp, makeRng, mix, rgbToHsl, hslToRgb } from "../util";
import { FluidSim } from "./fluidSim";

/** Dye colours for this theme: the accent plus two neighbours on the colour wheel. */
function inks(p: Palette, spread: number): RGB[] {
  const [h, s] = rgbToHsl(p.accent);
  const hue = s < 0.12 ? 220 : h;
  const sat = Math.max(0.55, s);
  const l = p.dark ? 0.55 : 0.48;
  return [hslToRgb(hue, sat, l), hslToRgb(hue + spread, sat, l), hslToRgb(hue - spread * 0.8, sat * 0.9, l)];
}

const SPLAT_FS = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uTarget; uniform float uAspect; uniform vec3 uColor; uniform vec2 uPoint; uniform float uRadius;
void main(){
  vec2 p = vUv - uPoint; p.x *= uAspect;
  vec3 s = exp(-dot(p,p) / uRadius) * uColor;
  o = vec4(texture(uTarget, vUv).xyz + s, 1.0);
}`;
const ADVECT_FS = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uVelocity; uniform sampler2D uSource; uniform vec2 uTexel; uniform float uDt; uniform float uDissipation;
void main(){
  vec2 coord = vUv - uDt * texture(uVelocity, vUv).xy * uTexel;
  o = uDissipation * texture(uSource, coord);
  o.a = 1.0;
}`;
const DIVERGENCE_FS = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uVelocity; uniform vec2 uTexel;
void main(){
  float L = texture(uVelocity, vUv - vec2(uTexel.x,0)).x;
  float R = texture(uVelocity, vUv + vec2(uTexel.x,0)).x;
  float B = texture(uVelocity, vUv - vec2(0,uTexel.y)).y;
  float T = texture(uVelocity, vUv + vec2(0,uTexel.y)).y;
  vec2 C = texture(uVelocity, vUv).xy;
  if (vUv.x - uTexel.x < 0.0) L = -C.x;
  if (vUv.x + uTexel.x > 1.0) R = -C.x;
  if (vUv.y + uTexel.y > 1.0) T = -C.y;
  if (vUv.y - uTexel.y < 0.0) B = -C.y;
  o = vec4(0.5 * (R - L + T - B), 0, 0, 1);
}`;
const CURL_FS = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uVelocity; uniform vec2 uTexel;
void main(){
  float L = texture(uVelocity, vUv - vec2(uTexel.x,0)).y;
  float R = texture(uVelocity, vUv + vec2(uTexel.x,0)).y;
  float B = texture(uVelocity, vUv - vec2(0,uTexel.y)).x;
  float T = texture(uVelocity, vUv + vec2(0,uTexel.y)).x;
  o = vec4(0.5 * (R - L - T + B), 0, 0, 1);
}`;
const VORTICITY_FS = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uVelocity; uniform sampler2D uCurl; uniform vec2 uTexel; uniform float uCurlStrength; uniform float uDt;
void main(){
  float L = texture(uCurl, vUv - vec2(uTexel.x,0)).x;
  float R = texture(uCurl, vUv + vec2(uTexel.x,0)).x;
  float B = texture(uCurl, vUv - vec2(0,uTexel.y)).x;
  float T = texture(uCurl, vUv + vec2(0,uTexel.y)).x;
  float C = texture(uCurl, vUv).x;
  vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
  force /= length(force) + 0.0001;
  force *= uCurlStrength * C; force.y *= -1.0;
  vec2 vel = texture(uVelocity, vUv).xy + force * uDt;
  o = vec4(clamp(vel, -1000.0, 1000.0), 0, 1);
}`;
const PRESSURE_FS = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uPressure; uniform sampler2D uDivergence; uniform vec2 uTexel;
void main(){
  float L = texture(uPressure, vUv - vec2(uTexel.x,0)).x;
  float R = texture(uPressure, vUv + vec2(uTexel.x,0)).x;
  float B = texture(uPressure, vUv - vec2(0,uTexel.y)).x;
  float T = texture(uPressure, vUv + vec2(0,uTexel.y)).x;
  float d = texture(uDivergence, vUv).x;
  o = vec4((L + R + B + T - d) * 0.25, 0, 0, 1);
}`;
const GRADIENT_FS = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uPressure; uniform sampler2D uVelocity; uniform vec2 uTexel;
void main(){
  float L = texture(uPressure, vUv - vec2(uTexel.x,0)).x;
  float R = texture(uPressure, vUv + vec2(uTexel.x,0)).x;
  float B = texture(uPressure, vUv - vec2(0,uTexel.y)).x;
  float T = texture(uPressure, vUv + vec2(0,uTexel.y)).x;
  vec2 v = texture(uVelocity, vUv).xy - 0.5 * vec2(R - L, T - B);
  o = vec4(v, 0, 1);
}`;
const SCALE_FS = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uSource; uniform float uScale;
void main(){ o = vec4(texture(uSource, vUv).xyz * uScale, 1.0); }`;
const DISPLAY_FS = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uDye; uniform vec3 uBase; uniform vec3 uTop; uniform vec2 uTexel; uniform float uGloss;
void main(){
  vec3 d = texture(uDye, vUv).rgb;
  float amt = max(d.r, max(d.g, d.b));
  vec3 hue = d / max(amt, 0.0001);
  vec3 bg = mix(uBase, uTop, vUv.y);
  float a = 1.0 - exp(-amt * 1.6);
  // Soft relief from the dye gradient (looks like ink on glass).
  float dx = max(texture(uDye, vUv + vec2(uTexel.x,0)).r, texture(uDye, vUv + vec2(uTexel.x,0)).b) - amt;
  float dy = max(texture(uDye, vUv + vec2(0,uTexel.y)).r, texture(uDye, vUv + vec2(0,uTexel.y)).b) - amt;
  float shine = clamp((dx + dy) * uGloss, -0.15, 0.25);
  vec3 col = mix(bg, hue, clamp(a, 0.0, 0.88)) + shine;
  o = vec4(col, 1.0);
}`;

interface FBO {
  tex: WebGLTexture;
  fb: WebGLFramebuffer;
  w: number;
  h: number;
}
interface DoubleFBO {
  read: FBO;
  write: FBO;
  swap(): void;
}

export const fluidScene: SceneModule = {
  id: "ink",
  name: "Ink",
  blurb: "Coloured ink in water. Move the cursor across the desktop to stir it; click for a drop.",
  interactive: true,
  warmup: 90,
  settings: [
    { key: "swirl", label: "Swirl", type: "range", min: 0, max: 40, step: 1, default: 12 },
    { key: "fade", label: "Ink lasts", type: "range", min: 1, max: 10, step: 1, default: 5 },
    { key: "spread", label: "Colour spread", type: "range", min: 0, max: 120, step: 5, default: 45 },
    { key: "drift", label: "Idle drift", type: "toggle", default: true, hint: "Slow drops when the cursor is still." },
    { key: "quality", label: "Quality", type: "choice", options: [{ id: "low", label: "Light" }, { id: "high", label: "Sharp" }], default: "low" },
  ],
  create(ctx: SceneContext): SceneInstance {
    let opts = normaliseOptions(fluidScene, ctx.options);
    let palette = ctx.palette;
    let colours = inks(palette, Number(opts.spread));
    let width = ctx.width, height = ctx.height, dpr = ctx.dpr;
    const rng = makeRng(ctx.seed);
    let colourIdx = 0;
    let last: { x: number; y: number } | null = null;
    let idleT = 0;
    let time = 0;

    const pendingSplats: { x: number; y: number; dx: number; dy: number; c: RGB; r: number }[] = [];
    const addSplat = (x: number, y: number, dx: number, dy: number, c: RGB, r: number) => pendingSplats.push({ x, y, dx, dy, c, r });
    const nextColour = () => colours[colourIdx++ % colours.length];

    const autoSplats = (n: number) => {
      for (let k = 0; k < n; k++) {
        const a = rng() * Math.PI * 2;
        const sp = 150 + rng() * 250;
        const c = nextColour();
        const k = ctx.preview ? 2.5 : 1;
        addSplat(0.15 + rng() * 0.7, 0.2 + rng() * 0.6, Math.cos(a) * sp, Math.sin(a) * sp, { r: c.r * k, g: c.g * k, b: c.b * k }, ctx.preview ? 1.6 : 1);
      }
    };

    const handleInput = (dt: number, input: InputState) => {
      let moved = false;
      for (const e of input.events) {
        if (e.kind === "leave") {
          last = null;
          continue;
        }
        const nx = e.x / width, ny = e.y / height;
        if (e.kind === "down") {
          const c = nextColour();
          addSplat(nx, ny, 0, 0, { r: c.r * 2.2, g: c.g * 2.2, b: c.b * 2.2 }, 2.2);
          for (let k = 0; k < 6; k++) {
            const a = (k / 6) * Math.PI * 2;
            addSplat(nx, ny, Math.cos(a) * 700, Math.sin(a) * 700, c, 0.6);
          }
        }
        if (e.kind === "move" || e.kind === "down") {
          if (last) {
            const dx = nx - last.x, dy = ny - last.y;
            const sp = Math.hypot(dx, dy);
            if (sp > 0.0005) {
              const c = colours[Math.floor(time * 0.35) % colours.length];
              const k = Math.min(1.4, 0.45 + sp * 60);
              addSplat(nx, ny, dx * 6000, dy * 6000, { r: c.r * k, g: c.g * k, b: c.b * k }, 0.8);
              moved = true;
            }
          }
          last = { x: nx, y: ny };
        }
      }
      idleT = moved ? 0 : idleT + dt;
      if (opts.drift && idleT > 2 && rng() < dt * 0.7) autoSplats(1);
    };

    // ---- GPU path -------------------------------------------------------------------------
    // Software rasterisers (SwiftShader, llvmpipe, Microsoft Basic Render Driver) are far slower
    // at full-screen float passes than the CPU solver, so they get the CPU path.
    const softwareGL = (g: WebGL2RenderingContext) => {
      const info = g.getExtension("WEBGL_debug_renderer_info");
      const name = String(info ? g.getParameter(info.UNMASKED_RENDERER_WEBGL) : g.getParameter(g.RENDERER));
      return /swiftshader|llvmpipe|software|basic render/i.test(name);
    };
    const probe = document.createElement("canvas");
    const pgl = getGL2(probe);
    const forceGpu = (globalThis as { __pgForceGpu?: boolean }).__pgForceGpu === true;
    const useGpu = !!pgl && !!pgl.getExtension("EXT_color_buffer_float") && (forceGpu || !softwareGL(pgl));
    pgl?.getExtension("WEBGL_lose_context")?.loseContext();
    const gl = useGpu ? getGL2(ctx.canvas) : null;
    if (gl && gl.getExtension("EXT_color_buffer_float")) {
      try {
        return makeGpu(gl);
      } catch {
        /* fall through to CPU */
      }
    }
    return makeCpu();

    function makeGpu(gl: WebGL2RenderingContext): SceneInstance {
      const P = {
        splat: compile(gl, FULLSCREEN_VS, SPLAT_FS),
        advect: compile(gl, FULLSCREEN_VS, ADVECT_FS),
        divergence: compile(gl, FULLSCREEN_VS, DIVERGENCE_FS),
        curl: compile(gl, FULLSCREEN_VS, CURL_FS),
        vorticity: compile(gl, FULLSCREEN_VS, VORTICITY_FS),
        pressure: compile(gl, FULLSCREEN_VS, PRESSURE_FS),
        gradient: compile(gl, FULLSCREEN_VS, GRADIENT_FS),
        scale: compile(gl, FULLSCREEN_VS, SCALE_FS),
        display: compile(gl, FULLSCREEN_VS, DISPLAY_FS),
      };
      const vao = gl.createVertexArray();
      const uni = new Map<WebGLProgram, Map<string, WebGLUniformLocation | null>>();
      const u = (p: WebGLProgram, name: string) => {
        let m = uni.get(p);
        if (!m) uni.set(p, (m = new Map()));
        if (!m.has(name)) m.set(name, gl.getUniformLocation(p, name));
        return m.get(name)!;
      };
      const mkFbo = (w: number, h: number, linear: boolean): FBO => {
        const tex = gl.createTexture()!;
        gl.bindTexture(gl.TEXTURE_2D, tex);
        const f = linear ? gl.LINEAR : gl.NEAREST;
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
        const fb = gl.createFramebuffer()!;
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
        gl.viewport(0, 0, w, h);
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error("fbo");
        return { tex, fb, w, h };
      };
      const mkDouble = (w: number, h: number, linear: boolean): DoubleFBO => {
        const d = { read: mkFbo(w, h, linear), write: mkFbo(w, h, linear), swap() { const t = d.read; d.read = d.write; d.write = t; } };
        return d;
      };
      const free = (f: FBO) => {
        gl.deleteTexture(f.tex);
        gl.deleteFramebuffer(f.fb);
      };

      let vel!: DoubleFBO, dye!: DoubleFBO, pressure!: DoubleFBO, div!: FBO, curl!: FBO;
      const res = (short: number) => {
        const aspect = width / height;
        return aspect >= 1 ? { w: Math.round(short * aspect), h: short } : { w: short, h: Math.round(short / aspect) };
      };
      const build = () => {
        const sim = res(opts.quality === "high" ? 160 : 112);
        const dyeR = res(opts.quality === "high" ? 720 : 420);
        if (vel) [vel.read, vel.write, dye.read, dye.write, pressure.read, pressure.write, div, curl].forEach(free);
        vel = mkDouble(sim.w, sim.h, true);
        pressure = mkDouble(sim.w, sim.h, false);
        div = mkFbo(sim.w, sim.h, false);
        curl = mkFbo(sim.w, sim.h, false);
        dye = mkDouble(dyeR.w, dyeR.h, true);
        ctx.canvas.width = Math.round(width * dpr);
        ctx.canvas.height = Math.round(height * dpr);
      };
      build();

      const bindTex = (unit: number, p: WebGLProgram, name: string, tex: WebGLTexture) => {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.uniform1i(u(p, name), unit);
      };
      const draw = (target: FBO | null) => {
        if (target) {
          gl.bindFramebuffer(gl.FRAMEBUFFER, target.fb);
          gl.viewport(0, 0, target.w, target.h);
        } else {
          gl.bindFramebuffer(gl.FRAMEBUFFER, null);
          gl.viewport(0, 0, ctx.canvas.width, ctx.canvas.height);
        }
        gl.bindVertexArray(vao);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      };

      const splat = (s: (typeof pendingSplats)[number]) => {
        const p = P.splat;
        gl.useProgram(p);
        gl.uniform1f(u(p, "uAspect"), width / height);
        gl.uniform2f(u(p, "uPoint"), s.x, 1 - s.y);
        const rad = 0.0016 * s.r * (opts.quality === "high" ? 1 : 1.2);
        gl.uniform1f(u(p, "uRadius"), rad);
        gl.uniform3f(u(p, "uColor"), s.dx, -s.dy, 0);
        bindTex(0, p, "uTarget", vel.read.tex);
        draw(vel.write);
        vel.swap();
        gl.uniform1f(u(p, "uRadius"), rad * 1.4);
        gl.uniform3f(u(p, "uColor"), (s.c.r / 255) * 0.08, (s.c.g / 255) * 0.08, (s.c.b / 255) * 0.08);
        bindTex(0, p, "uTarget", dye.read.tex);
        draw(dye.write);
        dye.swap();
      };

      const sim = (dt: number) => {
        const tx = 1 / vel.read.w, ty = 1 / vel.read.h;
        gl.disable(gl.BLEND);
        let p = P.curl;
        gl.useProgram(p);
        gl.uniform2f(u(p, "uTexel"), tx, ty);
        bindTex(0, p, "uVelocity", vel.read.tex);
        draw(curl);
        p = P.vorticity;
        gl.useProgram(p);
        gl.uniform2f(u(p, "uTexel"), tx, ty);
        gl.uniform1f(u(p, "uCurlStrength"), Number(opts.swirl));
        gl.uniform1f(u(p, "uDt"), dt);
        bindTex(0, p, "uVelocity", vel.read.tex);
        bindTex(1, p, "uCurl", curl.tex);
        draw(vel.write);
        vel.swap();
        p = P.divergence;
        gl.useProgram(p);
        gl.uniform2f(u(p, "uTexel"), tx, ty);
        bindTex(0, p, "uVelocity", vel.read.tex);
        draw(div);
        p = P.scale;
        gl.useProgram(p);
        gl.uniform1f(u(p, "uScale"), 0.8);
        bindTex(0, p, "uSource", pressure.read.tex);
        draw(pressure.write);
        pressure.swap();
        p = P.pressure;
        gl.useProgram(p);
        gl.uniform2f(u(p, "uTexel"), tx, ty);
        bindTex(1, p, "uDivergence", div.tex);
        for (let i = 0; i < 20; i++) {
          bindTex(0, p, "uPressure", pressure.read.tex);
          draw(pressure.write);
          pressure.swap();
        }
        p = P.gradient;
        gl.useProgram(p);
        gl.uniform2f(u(p, "uTexel"), tx, ty);
        bindTex(0, p, "uPressure", pressure.read.tex);
        bindTex(1, p, "uVelocity", vel.read.tex);
        draw(vel.write);
        vel.swap();
        p = P.advect;
        gl.useProgram(p);
        gl.uniform2f(u(p, "uTexel"), tx, ty);
        gl.uniform1f(u(p, "uDt"), dt);
        gl.uniform1f(u(p, "uDissipation"), 0.995);
        bindTex(0, p, "uVelocity", vel.read.tex);
        bindTex(1, p, "uSource", vel.read.tex);
        draw(vel.write);
        vel.swap();
        const life = Number(opts.fade);
        gl.uniform1f(u(p, "uDissipation"), Math.pow(0.5, dt / (0.6 + life * 0.9)));
        bindTex(0, p, "uVelocity", vel.read.tex);
        bindTex(1, p, "uSource", dye.read.tex);
        draw(dye.write);
        dye.swap();
      };

      autoSplats(ctx.preview ? 4 : 6);
      return {
        step(dt, input) {
          time += dt;
          handleInput(dt, input);
          for (const s of pendingSplats.splice(0)) splat(s);
          // Fixed 60 Hz sub-steps keep the solver stable at any frame rate.
          const n = Math.max(1, Math.min(2, Math.round(dt * 60)));
          for (let k = 0; k < n; k++) sim(1 / 60);
        },
        render() {
          const p = P.display;
          gl.useProgram(p);
          const base = palette.base;
          const top = mix(palette.base, palette.elevated, palette.dark ? 0.6 : 0.3);
          gl.uniform3f(u(p, "uBase"), base.r / 255, base.g / 255, base.b / 255);
          gl.uniform3f(u(p, "uTop"), top.r / 255, top.g / 255, top.b / 255);
          gl.uniform2f(u(p, "uTexel"), 1 / dye.read.w, 1 / dye.read.h);
          gl.uniform1f(u(p, "uGloss"), palette.dark ? 0.45 : 0.3);
          bindTex(0, p, "uDye", dye.read.tex);
          draw(null);
        },
        resize(w, h, d) {
          width = w;
          height = h;
          dpr = d;
          build();
          autoSplats(3);
        },
        setPalette(p) {
          palette = p;
          colours = inks(p, Number(opts.spread));
        },
        setOptions(o: SceneOptions) {
          const q = opts.quality;
          opts = normaliseOptions(fluidScene, o);
          colours = inks(palette, Number(opts.spread));
          if (q !== opts.quality) build();
        },
        reset() {
          build();
        },
        dispose() {
          [vel.read, vel.write, dye.read, dye.write, pressure.read, pressure.write, div, curl].forEach(free);
          Object.values(P).forEach((p) => gl.deleteProgram(p));
          gl.getExtension("WEBGL_lose_context")?.loseContext();
        },
      };
    }

    // ---- CPU fallback ----------------------------------------------------------------------
    function makeCpu(): SceneInstance {
      const c2d = ctx.canvas.getContext("2d", { alpha: false });
      let sim!: FluidSim;
      let img!: ImageData;
      let off!: HTMLCanvasElement;
      const build = () => {
        const short = opts.quality === "high" ? 90 : 64;
        const aspect = width / height;
        const w = aspect >= 1 ? Math.round(short * aspect) : short;
        const h = aspect >= 1 ? short : Math.round(short / aspect);
        sim = new FluidSim(w, h);
        sim.iterations = 14;
        img = new ImageData(w, h);
        off = Object.assign(document.createElement("canvas"), { width: w, height: h });
        ctx.canvas.width = Math.round(width * dpr);
        ctx.canvas.height = Math.round(height * dpr);
      };
      build();
      autoSplats(ctx.preview ? 4 : 6);
      return {
        step(dt, input) {
          time += dt;
          handleInput(dt, input);
          for (const s of pendingSplats.splice(0)) {
            const k = 0.6 / 255;
            sim.splat(s.x * sim.w, s.y * sim.h, s.dx * sim.w * 0.0009, s.dy * sim.h * 0.0016, 2.2 * s.r, s.c.r * k, s.c.g * k, s.c.b * k);
          }
          sim.dissipation = Math.pow(0.5, dt / (0.6 + Number(opts.fade) * 0.9));
          sim.step(Math.min(2, dt * 60));
        },
        render() {
          if (!c2d) return;
          const d = img.data;
          const top = mix(palette.base, palette.elevated, palette.dark ? 0.6 : 0.3);
          for (let y = 0; y < sim.h; y++) {
            const bg = mix(top, palette.base, y / sim.h);
            for (let x = 0; x < sim.w; x++) {
              const i = y * sim.w + x;
              const r = sim.r[i], g = sim.g[i], b = sim.b[i];
              const amt = Math.max(r, g, b);
              const a = clamp(1 - Math.exp(-amt * 1.6), 0, 0.93);
              const inv = amt > 0.0001 ? 255 / amt : 0;
              const o = i * 4;
              d[o] = bg.r + (r * inv - bg.r) * a;
              d[o + 1] = bg.g + (g * inv - bg.g) * a;
              d[o + 2] = bg.b + (b * inv - bg.b) * a;
              d[o + 3] = 255;
            }
          }
          off.getContext("2d")!.putImageData(img, 0, 0);
          c2d.imageSmoothingEnabled = true;
          c2d.imageSmoothingQuality = "high";
          c2d.drawImage(off, 0, 0, ctx.canvas.width, ctx.canvas.height);
        },
        resize(w, h, d) {
          width = w;
          height = h;
          dpr = d;
          build();
        },
        setPalette(p) {
          palette = p;
          colours = inks(p, Number(opts.spread));
        },
        setOptions(o) {
          const q = opts.quality;
          opts = normaliseOptions(fluidScene, o);
          colours = inks(palette, Number(opts.spread));
          if (q !== opts.quality) build();
        },
        reset() {
          build();
        },
        dispose() {},
      };
    }
  },
};
