/** Small WebGL2 helpers shared by scenes, with a 2D-canvas path for when WebGL2 is missing. */

export function compile(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const sh = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(s);
      gl.deleteShader(s);
      throw new Error(`shader: ${log}`);
    }
    return s;
  };
  const p = gl.createProgram()!;
  const v = sh(gl.VERTEX_SHADER, vs);
  const f = sh(gl.FRAGMENT_SHADER, fs);
  gl.attachShader(p, v);
  gl.attachShader(p, f);
  gl.linkProgram(p);
  gl.deleteShader(v);
  gl.deleteShader(f);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`link: ${gl.getProgramInfoLog(p)}`);
  return p;
}

/** Full-screen triangle; the vertex shader below derives positions from gl_VertexID. */
export const FULLSCREEN_VS = `#version 300 es
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

export function getGL2(canvas: HTMLCanvasElement, opts: WebGLContextAttributes = {}): WebGL2RenderingContext | null {
  try {
    return canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
      powerPreference: "low-power",
      ...opts,
    }) as WebGL2RenderingContext | null;
  } catch {
    return null;
  }
}

/**
 * Draws an RGBA byte grid scaled up to the canvas with crisp (nearest) pixels.
 * WebGL2 when available (one texture upload per frame), otherwise putImageData + drawImage.
 */
export class GridBlitter {
  private gl: WebGL2RenderingContext | null = null;
  private prog: WebGLProgram | null = null;
  private tex: WebGLTexture | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private off: HTMLCanvasElement | OffscreenCanvas | null = null;
  private offCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;
  private img: ImageData | null = null;
  private gw = 0;
  private gh = 0;
  readonly mode: "webgl2" | "2d";

  constructor(private canvas: HTMLCanvasElement, preferGL = true) {
    const gl = preferGL ? getGL2(canvas) : null;
    if (gl) {
      try {
        this.prog = compile(
          gl,
          FULLSCREEN_VS,
          `#version 300 es
          precision mediump float;
          in vec2 vUv; uniform sampler2D uTex; out vec4 o;
          void main(){ o = vec4(texture(uTex, vec2(vUv.x, 1.0 - vUv.y)).rgb, 1.0); }`
        );
        this.gl = gl;
        this.tex = gl.createTexture();
        this.vao = gl.createVertexArray();
      } catch {
        this.gl = null;
      }
    }
    if (!this.gl) this.ctx = canvas.getContext("2d", { alpha: false });
    this.mode = this.gl ? "webgl2" : "2d";
  }

  resizeGrid(gw: number, gh: number) {
    this.gw = gw;
    this.gh = gh;
    const gl = this.gl;
    if (gl && this.tex) {
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gw, gh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    } else {
      const off =
        typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(gw, gh) : Object.assign(document.createElement("canvas"), { width: gw, height: gh });
      this.off = off;
      this.offCtx = off.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
      this.img = new ImageData(gw, gh);
    }
  }

  draw(rgba: Uint8ClampedArray | Uint8Array) {
    const { canvas } = this;
    const gl = this.gl;
    if (gl && this.tex && this.prog) {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.gw, this.gh, gl.RGBA, gl.UNSIGNED_BYTE, rgba as Uint8Array);
      gl.useProgram(this.prog);
      gl.bindVertexArray(this.vao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      return;
    }
    if (!this.ctx || !this.img || !this.offCtx || !this.off) return;
    this.img.data.set(rgba);
    this.offCtx.putImageData(this.img, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.drawImage(this.off as CanvasImageSource, 0, 0, canvas.width, canvas.height);
  }

  dispose() {
    const gl = this.gl;
    if (gl) {
      if (this.tex) gl.deleteTexture(this.tex);
      if (this.prog) gl.deleteProgram(this.prog);
      if (this.vao) gl.deleteVertexArray(this.vao);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    }
  }
}
