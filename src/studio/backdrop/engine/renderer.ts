/**
 * Backdrop renderer: WebGL2, framework-free, shared by the Lab, the live wallpaper, thumbnails and
 * exports (docs/BACKDROP_LAB.md §Engine).
 *
 * Pipeline per frame:  look → texture A  (+ layer look → texture B)  → finish → canvas.
 * Switching states crossfades from a snapshot of the last finished frame (texture S), and a new
 * look's shader is compiled before the swap (in parallel where the driver allows), so the canvas
 * never shows a blank or half-built frame.
 */
import { buildLut } from "./color";
import { FINISH_FS, FULLSCREEN_VS, LOOK_HEADER, LOOK_MAIN } from "./glsl";
import { modeById, type ModeId } from "./modes";
import { phaseAt } from "./clock";
import type { BackdropState, LookState } from "./state";

type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

export interface RendererOptions {
  /** Keep the drawing buffer (needed for toDataURL / readPixels after the frame). */
  preserve?: boolean;
  /** Called when the GPU context is lost / restored (driver reset, sleep, RDP). */
  onLost?: () => void;
  onRestored?: () => void;
}

export interface Span {
  /** This canvas's top-left inside the whole field, in pixels. */
  origin: [number, number];
  /** Size of the whole field (all monitors when spanning), in pixels. */
  world: [number, number];
}

interface Target {
  fb: WebGLFramebuffer;
  tex: WebGLTexture;
}

const LAYER_IDS = { normal: 1, screen: 2, overlay: 3, "soft-light": 4 } as const;
const MASK_IDS = { none: 0, radial: 1, linear: 2, noise: 3 } as const;
const GRAIN_IDS = { fine: 0, film: 1, paper: 2 } as const;
const DITHER_IDS = { off: 0, blue: 1, ordered: 2 } as const;

export function lookFragmentSource(mode: ModeId): string {
  const m = modeById(mode) ?? modeById("mesh")!;
  return LOOK_HEADER + m.glsl + LOOK_MAIN;
}

export function hasWebGL2(): boolean {
  try {
    if (typeof document === "undefined") return false;
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2");
    const ok = !!gl;
    (gl?.getExtension("WEBGL_lose_context") as { loseContext?: () => void } | null)?.loseContext?.();
    return ok;
  } catch {
    return false;
  }
}

export class BackdropRenderer {
  readonly canvas: AnyCanvas;
  private gl: WebGL2RenderingContext;
  private parallel: { COMPLETION_STATUS_KHR: number } | null = null;
  private floatTargets = false;
  private looks = new Map<ModeId, WebGLProgram>();
  private uniforms = new Map<WebGLProgram, Map<string, WebGLUniformLocation | null>>();
  private finish!: WebGLProgram;
  private vao!: WebGLVertexArrayObject;
  private lutA!: WebGLTexture;
  private lutB!: WebGLTexture;
  private image!: WebGLTexture;
  private hasImage = false;
  private imageSource: TexImageSource | null = null;
  private tA: Target | null = null;
  private tB: Target | null = null;
  private tS: Target | null = null;
  private w = 0;
  private h = 0;
  private state: BackdropState | null = null;
  private pending: BackdropState | null = null;
  private pendingFadeMs = 0;
  private lutKeyA = "";
  private lutKeyB = "";
  private fadeStart = 0;
  private fadeMs = 0;
  private lastTime = 0;
  private frame = 0;
  private span: Span | null = null;
  private cursor: [number, number, number] = [0.5, 0.5, 0];
  private pulse = 0;
  private lost = false;
  private disposed = false;
  /** Test builds: paint NaN / Inf pixels magenta. */
  debugNaN = false;
  private readonly opts: RendererOptions;
  private readonly onLostEvt = (e: Event) => {
    e.preventDefault();
    this.lost = true;
    this.opts.onLost?.();
  };
  private readonly onRestoredEvt = () => {
    this.lost = false;
    this.initGL();
    this.opts.onRestored?.();
  };

  constructor(canvas: AnyCanvas, opts: RendererOptions = {}) {
    this.canvas = canvas;
    this.opts = opts;
    const gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: !!opts.preserve,
      powerPreference: "low-power",
    }) as WebGL2RenderingContext | null;
    if (!gl) throw new Error("WebGL2 is not available");
    this.gl = gl;
    canvas.addEventListener("webglcontextlost", this.onLostEvt as EventListener);
    canvas.addEventListener("webglcontextrestored", this.onRestoredEvt as EventListener);
    this.initGL();
  }

  private initGL(): void {
    const gl = this.gl;
    this.looks.clear();
    this.uniforms.clear();
    this.tA = this.tB = this.tS = null;
    this.lutKeyA = this.lutKeyB = "";
    this.parallel = gl.getExtension("KHR_parallel_shader_compile") as { COMPLETION_STATUS_KHR: number } | null;
    this.floatTargets = !!gl.getExtension("EXT_color_buffer_float");
    this.vao = gl.createVertexArray()!;
    this.finish = this.link(FULLSCREEN_VS, FINISH_FS, true);
    this.lutA = this.makeTex(256, 1, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, null, gl.LINEAR);
    this.lutB = this.makeTex(256, 1, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, null, gl.LINEAR);
    this.image = this.makeTex(1, 1, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([128, 128, 128, 255]), gl.LINEAR);
    if (this.imageSource) this.setImage(this.imageSource);
    this.w = this.h = 0;
  }

  private makeTex(w: number, h: number, internal: number, format: number, type: number, data: ArrayBufferView | null, filter: number): WebGLTexture {
    const gl = this.gl;
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  private makeTarget(w: number, h: number): Target {
    const gl = this.gl;
    const tex = this.floatTargets
      ? this.makeTex(w, h, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, null, gl.LINEAR)
      : this.makeTex(w, h, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, null, gl.LINEAR);
    const fb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { fb, tex };
  }

  private freeTarget(t: Target | null): void {
    if (!t) return;
    this.gl.deleteFramebuffer(t.fb);
    this.gl.deleteTexture(t.tex);
  }

  private link(vs: string, fs: string, wait: boolean): WebGLProgram {
    const gl = this.gl;
    const mk = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };
    const v = mk(gl.VERTEX_SHADER, vs);
    const f = mk(gl.FRAGMENT_SHADER, fs);
    const p = gl.createProgram()!;
    gl.attachShader(p, v);
    gl.attachShader(p, f);
    gl.linkProgram(p);
    (p as WebGLProgram & { _shaders?: WebGLShader[] })._shaders = [v, f];
    if (wait) this.checkProgram(p);
    return p;
  }

  /** Throws with the compiler log when a program failed (blocks until linking is done). */
  private checkProgram(p: WebGLProgram): void {
    const gl = this.gl;
    if (gl.getProgramParameter(p, gl.LINK_STATUS)) return;
    const shaders = (p as WebGLProgram & { _shaders?: WebGLShader[] })._shaders ?? [];
    const logs = shaders.map((s) => gl.getShaderInfoLog(s)).filter(Boolean).join("\n");
    throw new Error(`Backdrop shader failed: ${logs || gl.getProgramInfoLog(p)}`);
  }

  private programReady(p: WebGLProgram): boolean {
    if (!this.parallel) return true;
    return !!this.gl.getProgramParameter(p, this.parallel.COMPLETION_STATUS_KHR);
  }

  /** Starts compiling a look (non-blocking where KHR_parallel_shader_compile exists). */
  preload(mode: ModeId): WebGLProgram {
    let p = this.looks.get(mode);
    if (!p) {
      p = this.link(FULLSCREEN_VS, lookFragmentSource(mode), false);
      this.looks.set(mode, p);
    }
    return p;
  }

  /** Compiles a look now and reports errors (tests, the shader check). */
  compileNow(mode: ModeId): void {
    this.checkProgram(this.preload(mode));
  }

  private loc(p: WebGLProgram, name: string): WebGLUniformLocation | null {
    let m = this.uniforms.get(p);
    if (!m) {
      m = new Map();
      this.uniforms.set(p, m);
    }
    if (!m.has(name)) m.set(name, this.gl.getUniformLocation(p, name));
    return m.get(name)!;
  }

  get isLost(): boolean {
    return this.lost;
  }

  get current(): BackdropState | null {
    return this.state;
  }

  /** True while a crossfade or a pending swap is still running. */
  get busy(): boolean {
    return !!this.pending || (this.fadeMs > 0 && this.lastTime * 1000 - this.fadeStart < this.fadeMs);
  }

  setState(s: BackdropState, opts: { fadeMs?: number } = {}): void {
    if (this.disposed) return;
    this.preload(s.mode);
    if (s.layer) this.preload(s.layer.look.mode);
    if (!this.state) {
      this.state = s;
      return;
    }
    this.pending = s;
    this.pendingFadeMs = opts.fadeMs ?? 0;
  }

  /** Swap to `s` right now, compiling if needed (thumbnails, exports, tests). */
  replace(s: BackdropState): void {
    if (this.disposed) return;
    this.checkProgram(this.preload(s.mode));
    if (s.layer) this.checkProgram(this.preload(s.layer.look.mode));
    this.state = s;
    this.pending = null;
    this.fadeMs = 0;
  }

  setSpan(span: Span | null): void {
    this.span = span;
  }

  /** Cursor in 0..1 of the field (y down); strength 0 turns the warp off. */
  setCursor(x: number, y: number, strength: number): void {
    this.cursor = [x, y, Math.max(0, Math.min(1, strength))];
  }

  /** 0..1 brightness pulse (notification arrivals). */
  setPulse(v: number): void {
    this.pulse = Math.max(0, Math.min(1, v));
  }

  setImage(src: TexImageSource | null): void {
    this.imageSource = src;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.image);
    if (!src) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([128, 128, 128, 255]));
      this.hasImage = false;
      return;
    }
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, src);
    this.hasImage = true;
  }

  private ensureTargets(): void {
    const w = Math.max(1, this.canvas.width);
    const h = Math.max(1, this.canvas.height);
    if (w === this.w && h === this.h && this.tA) return;
    this.freeTarget(this.tA);
    this.freeTarget(this.tB);
    this.freeTarget(this.tS);
    this.tA = this.makeTarget(w, h);
    this.tB = this.makeTarget(w, h);
    this.tS = this.makeTarget(w, h);
    this.w = w;
    this.h = h;
    this.fadeMs = 0; // a snapshot at the old size is meaningless
  }

  private uploadLut(tex: WebGLTexture, look: LookState, which: "A" | "B"): void {
    const key = JSON.stringify([look.stops, look.space, look.bias, look.sharpness]);
    if ((which === "A" ? this.lutKeyA : this.lutKeyB) === key) return;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, buildLut(look.stops, look));
    if (which === "A") this.lutKeyA = key;
    else this.lutKeyB = key;
  }

  private drawLook(look: LookState, loop: number, time: number, lut: WebGLTexture, target: Target): void {
    const gl = this.gl;
    const p = this.preload(look.mode);
    gl.useProgram(p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fb);
    gl.viewport(0, 0, this.w, this.h);
    const origin = this.span?.origin ?? [0, 0];
    const world = this.span?.world ?? [this.w, this.h];
    const u = (n: string) => this.loc(p, n);
    gl.uniform2f(u("uRes"), this.w, this.h);
    gl.uniform2f(u("uOrigin"), origin[0], origin[1]);
    gl.uniform2f(u("uWorld"), world[0], world[1]);
    gl.uniform1f(u("uPhase"), phaseAt(time, loop));
    gl.uniform1f(u("uOrbit"), look.speed * 1.1);
    gl.uniform1f(u("uSpd"), look.speed);
    gl.uniform1f(u("uKs"), Math.round(look.speed * 4));
    gl.uniform1f(u("uScale"), look.scale);
    gl.uniform1f(u("uSoft"), look.softness);
    gl.uniform1f(u("uWarp"), look.warp);
    gl.uniform1ui(u("uSeed"), look.seed >>> 0);
    const pr = look.params;
    gl.uniform4f(u("uP"), pr.a ?? 0, pr.b ?? 0, pr.c ?? 0, pr.d ?? 0);
    const h0 = look.handles[0] ?? { x: 0.5, y: 0.5 };
    const h1 = look.handles[1] ?? { x: 0.7, y: 0.7 };
    gl.uniform2f(u("uH0"), h0.x, h0.y);
    gl.uniform2f(u("uH1"), h1.x, h1.y);
    gl.uniform3f(u("uCursor"), this.cursor[0], this.cursor[1], this.cursor[2]);
    gl.uniform1f(u("uPulse"), this.pulse);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, lut);
    gl.uniform1i(u("uLut"), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.image);
    gl.uniform1i(u("uImage"), 1);
    gl.uniform1f(u("uHasImage"), this.hasImage ? 1 : 0);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private drawFinish(s: BackdropState, fade: number, to: Target | null): void {
    const gl = this.gl;
    const p = this.finish;
    gl.useProgram(p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, to ? to.fb : null);
    gl.viewport(0, 0, this.w, this.h);
    const u = (n: string) => this.loc(p, n);
    const bind = (unit: number, tex: WebGLTexture, name: string) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(u(name), unit);
    };
    bind(0, this.tA!.tex, "uA");
    bind(1, this.tB!.tex, "uB");
    // Never sample the texture being drawn into (snapshot pass): bind A in S's place then.
    bind(2, to === this.tS ? this.tA!.tex : this.tS!.tex, "uS");
    gl.uniform2f(u("uRes"), this.w, this.h);
    gl.uniform1f(u("uFade"), fade);
    gl.uniform1i(u("uLayer"), s.layer ? LAYER_IDS[s.layer.blend] : 0);
    gl.uniform1i(u("uMask"), s.layer ? MASK_IDS[s.layer.mask] : 0);
    gl.uniform1f(u("uAmt"), s.layer ? s.layer.amount : 0);
    gl.uniform1f(u("uBright"), s.brightness);
    gl.uniform1f(u("uContrast"), s.contrast);
    gl.uniform1f(u("uSat"), s.saturation);
    gl.uniform1f(u("uExpo"), s.exposure);
    gl.uniform1i(u("uTone"), s.tone === "aces" ? 1 : 0);
    gl.uniform1f(u("uGrain"), s.grain);
    gl.uniform1i(u("uGrainStyle"), GRAIN_IDS[s.grainStyle]);
    gl.uniform1f(u("uVig"), s.vignette);
    gl.uniform1i(u("uDither"), DITHER_IDS[s.dither]);
    gl.uniform1f(u("uAberr"), s.aberration);
    gl.uniform1f(u("uBloom"), s.bloom);
    // Grain / dither pattern index from loop time, so it repeats with the loop (seamless files).
    gl.uniform1f(u("uFrame"), Math.floor(((this.lastTime % s.loop) + s.loop) % s.loop * 30) % 64);
    gl.uniform1i(u("uDebug"), this.debugNaN ? 1 : 0);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private pipeline(s: BackdropState, time: number, fade: number, to: Target | null): void {
    this.uploadLut(this.lutA, s, "A");
    this.drawLook(s, s.loop, time, this.lutA, this.tA!);
    if (s.layer) {
      this.uploadLut(this.lutB, s.layer.look, "B");
      this.drawLook(s.layer.look, s.loop, time, this.lutB, this.tB!);
    }
    this.drawFinish(s, fade, to);
  }

  /**
   * Draws the frame for scene time `time` (seconds). Returns false when nothing could be drawn
   * (context lost or no state yet); the canvas keeps its last frame in that case.
   */
  render(time: number): boolean {
    if (this.disposed || this.lost || !this.state || this.gl.isContextLost()) return false;
    this.ensureTargets();
    this.lastTime = time;
    // Swap to a pending state only once its shaders are built: no blank frame while compiling.
    if (this.pending) {
      const next = this.pending;
      const ready = this.programReady(this.preload(next.mode)) && (!next.layer || this.programReady(this.preload(next.layer.look.mode)));
      if (ready) {
        this.checkProgram(this.preload(next.mode));
        if (next.layer) this.checkProgram(this.preload(next.layer.look.mode));
        if (this.pendingFadeMs > 0) {
          this.pipeline(this.state, time, 1, this.tS);
          this.fadeStart = time * 1000;
          this.fadeMs = this.pendingFadeMs;
        } else {
          this.fadeMs = 0;
        }
        this.state = next;
        this.pending = null;
      }
    }
    const fade = this.fadeMs > 0 ? Math.min(1, Math.max(0, (time * 1000 - this.fadeStart) / this.fadeMs)) : 1;
    if (fade >= 1) this.fadeMs = 0;
    this.pipeline(this.state, time, fade, null);
    this.frame++;
    return true;
  }

  /** RGBA bytes of the canvas, bottom row first (needs `preserve` or a call right after render). */
  readPixels(): Uint8Array {
    const gl = this.gl;
    const out = new Uint8Array(this.w * this.h * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.readPixels(0, 0, this.w, this.h, gl.RGBA, gl.UNSIGNED_BYTE, out);
    return out;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.canvas.removeEventListener("webglcontextlost", this.onLostEvt as EventListener);
    this.canvas.removeEventListener("webglcontextrestored", this.onRestoredEvt as EventListener);
    const gl = this.gl;
    if (gl.isContextLost()) return;
    for (const p of this.looks.values()) gl.deleteProgram(p);
    gl.deleteProgram(this.finish);
    this.freeTarget(this.tA);
    this.freeTarget(this.tB);
    this.freeTarget(this.tS);
    gl.deleteTexture(this.lutA);
    gl.deleteTexture(this.lutB);
    gl.deleteTexture(this.image);
  }
}
