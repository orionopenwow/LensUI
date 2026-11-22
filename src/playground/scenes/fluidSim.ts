/**
 * Stable-fluids solver on the CPU (Stam 1999: advect, project with Jacobi pressure, advect dye).
 * Used when WebGL2 float render targets are missing, and as the node-tested reference of the
 * GPU version in fluid.ts. Velocity in cells per second; grid is row-major, y down.
 */
export class FluidSim {
  readonly n: number;
  u: Float32Array;
  v: Float32Array;
  private u0: Float32Array;
  private v0: Float32Array;
  p: Float32Array;
  private div: Float32Array;
  /** Dye, three channels. */
  r: Float32Array;
  g: Float32Array;
  b: Float32Array;
  private t0: Float32Array;
  dissipation = 0.985;
  velocityDamping = 0.995;
  iterations = 20;

  constructor(
    readonly w: number,
    readonly h: number
  ) {
    this.n = w * h;
    const f = () => new Float32Array(this.n);
    this.u = f();
    this.v = f();
    this.u0 = f();
    this.v0 = f();
    this.p = f();
    this.div = f();
    this.r = f();
    this.g = f();
    this.b = f();
    this.t0 = f();
  }

  /** Bilinear sample with clamped edges. */
  sample(a: Float32Array, x: number, y: number): number {
    const { w, h } = this;
    x = x < 0 ? 0 : x > w - 1.001 ? w - 1.001 : x;
    y = y < 0 ? 0 : y > h - 1.001 ? h - 1.001 : y;
    const x0 = x | 0, y0 = y | 0;
    const fx = x - x0, fy = y - y0;
    const i = y0 * w + x0;
    const a0 = a[i] + (a[i + 1] - a[i]) * fx;
    const a1 = a[i + w] + (a[i + w + 1] - a[i + w]) * fx;
    return a0 + (a1 - a0) * fy;
  }

  /** Adds a gaussian blob of velocity (du, dv) and dye colour at (x, y) in cells. */
  splat(x: number, y: number, du: number, dv: number, radius: number, cr: number, cg: number, cb: number) {
    const { w, h } = this;
    const r2 = radius * radius;
    const ext = Math.ceil(radius * 2.5);
    for (let yy = Math.max(0, (y - ext) | 0); yy < Math.min(h, y + ext + 1); yy++) {
      for (let xx = Math.max(0, (x - ext) | 0); xx < Math.min(w, x + ext + 1); xx++) {
        const d2 = (xx - x) ** 2 + (yy - y) ** 2;
        const k = Math.exp(-d2 / r2);
        if (k < 0.002) continue;
        const i = yy * w + xx;
        this.u[i] += du * k;
        this.v[i] += dv * k;
        this.r[i] += cr * k;
        this.g[i] += cg * k;
        this.b[i] += cb * k;
      }
    }
  }

  private advect(dst: Float32Array, src: Float32Array, dt: number) {
    const { w, h, u, v } = this;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        dst[i] = this.sample(src, x - u[i] * dt, y - v[i] * dt);
      }
    }
  }

  project() {
    const { w, h, u, v, p, div } = this;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const ur = x < w - 1 ? u[i + 1] : -u[i];
        const ul = x > 0 ? u[i - 1] : -u[i];
        const vb = y < h - 1 ? v[i + w] : -v[i];
        const vt = y > 0 ? v[i - w] : -v[i];
        div[i] = 0.5 * (ur - ul + vb - vt);
      }
    }
    p.fill(0);
    const tmp = this.t0;
    for (let k = 0; k < this.iterations; k++) {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = y * w + x;
          const pl = x > 0 ? p[i - 1] : p[i];
          const pr = x < w - 1 ? p[i + 1] : p[i];
          const pt = y > 0 ? p[i - w] : p[i];
          const pb = y < h - 1 ? p[i + w] : p[i];
          tmp[i] = (pl + pr + pt + pb - div[i]) * 0.25;
        }
      }
      p.set(tmp);
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const pl = x > 0 ? p[i - 1] : p[i];
        const pr = x < w - 1 ? p[i + 1] : p[i];
        const pt = y > 0 ? p[i - w] : p[i];
        const pb = y < h - 1 ? p[i + w] : p[i];
        u[i] -= 0.5 * (pr - pl);
        v[i] -= 0.5 * (pb - pt);
      }
    }
  }

  /** Sum of |divergence| (tests: projection should make this small). */
  divergence(): number {
    const { w, h, u, v } = this;
    let s = 0;
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      s += Math.abs(0.5 * (u[i + 1] - u[i - 1] + v[i + w] - v[i - w]));
    }
    return s;
  }

  totalDye(): number {
    let s = 0;
    for (let i = 0; i < this.n; i++) s += this.r[i] + this.g[i] + this.b[i];
    return s;
  }

  step(dt: number) {
    this.project();
    this.u0.set(this.u);
    this.v0.set(this.v);
    this.advect(this.u, this.u0, dt);
    this.advect(this.v, this.v0, dt);
    this.project();
    for (const ch of [this.r, this.g, this.b]) {
      this.t0.set(ch);
      this.advect(ch, this.t0, dt);
      for (let i = 0; i < this.n; i++) ch[i] *= this.dissipation;
    }
    const k = this.velocityDamping;
    for (let i = 0; i < this.n; i++) {
      this.u[i] *= k;
      this.v[i] *= k;
    }
  }
}
