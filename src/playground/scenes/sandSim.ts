/**
 * Falling-sand cellular automaton. Pure (no DOM), deterministic for a given seed, so it is unit
 * tested in node (src/playground/tests). Grid is row-major, y = 0 at the top.
 */
import { makeRng } from "../util";

export const EMPTY = 0;
export const SAND = 1;
export const WATER = 2;
export const STONE = 3;
export const FIRE = 4;
export const SMOKE = 5;
export const PLANT = 6;
export const MATERIAL_COUNT = 7;

export type Material = number;

/** How heavy each material is: a heavier one sinks through a lighter liquid/gas. */
const DENSITY = [0, 3, 2, 9, 0, 0, 9];

export class SandSim {
  readonly cell: Uint8Array;
  /** Remaining life for fire / smoke; growth energy for plant. */
  readonly life: Uint8Array;
  /** Per-cell colour variation 0..255, fixed when a cell is created. */
  readonly shade: Uint8Array;
  /** Marks cells already moved this tick (value = tick stamp). */
  private stamp: Uint8Array;
  private tickStamp = 1;
  tick = 0;
  rng: () => number;

  constructor(
    readonly w: number,
    readonly h: number,
    seed = 1
  ) {
    const n = w * h;
    this.cell = new Uint8Array(n);
    this.life = new Uint8Array(n);
    this.shade = new Uint8Array(n);
    this.stamp = new Uint8Array(n);
    this.rng = makeRng(seed);
  }

  idx(x: number, y: number) {
    return y * this.w + x;
  }

  inBounds(x: number, y: number) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  get(x: number, y: number): Material {
    return this.inBounds(x, y) ? this.cell[y * this.w + x] : STONE;
  }

  set(x: number, y: number, m: Material) {
    if (!this.inBounds(x, y)) return;
    const i = y * this.w + x;
    this.cell[i] = m;
    this.shade[i] = (this.rng() * 255) | 0;
    this.life[i] = m === FIRE ? 24 + ((this.rng() * 40) | 0) : m === SMOKE ? 50 + ((this.rng() * 70) | 0) : m === PLANT ? 3 : 0;
  }

  /** Paints a filled circle. `density` 0..1 leaves gaps for loose materials. Eraser = EMPTY. */
  paint(cx: number, cy: number, r: number, m: Material, density = 1) {
    const r2 = r * r;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r2) continue;
        const x = cx + dx, y = cy + dy;
        if (!this.inBounds(x, y)) continue;
        if (m === EMPTY) {
          this.cell[this.idx(x, y)] = EMPTY;
          continue;
        }
        if (density < 1 && this.rng() > density) continue;
        // Don't overwrite solid things with loose materials.
        const cur = this.cell[this.idx(x, y)];
        if (cur !== EMPTY && cur !== SMOKE && m !== STONE && m !== PLANT) continue;
        this.set(x, y, m);
      }
    }
  }

  /** Paints along a line (cursor drags faster than one cell per frame). */
  paintLine(x0: number, y0: number, x1: number, y1: number, r: number, m: Material, density = 1) {
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / Math.max(1, r * 0.6)));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      this.paint(Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t), r, m, density);
    }
  }

  clear() {
    this.cell.fill(EMPTY);
    this.life.fill(0);
  }

  count(m: Material): number {
    let c = 0;
    for (let i = 0; i < this.cell.length; i++) if (this.cell[i] === m) c++;
    return c;
  }

  private move(i: number, j: number) {
    // swap i <-> j and mark both as done for this tick
    const { cell, life, shade, stamp } = this;
    const c = cell[i], l = life[i], s = shade[i];
    cell[i] = cell[j];
    life[i] = life[j];
    shade[i] = shade[j];
    cell[j] = c;
    life[j] = l;
    shade[j] = s;
    stamp[j] = this.tickStamp;
    stamp[i] = this.tickStamp;
  }

  /** Can material `m` move into cell `j`? (empty, or a lighter fluid/gas it sinks through) */
  private canEnter(m: Material, j: number): boolean {
    const t = this.cell[j];
    if (t === EMPTY) return true;
    if (t === SMOKE) return m !== SMOKE && m !== FIRE;
    if (t === WATER) return DENSITY[m] > DENSITY[WATER] && m !== STONE && m !== PLANT;
    return false;
  }

  step() {
    const { w, h, cell, life, stamp, rng } = this;
    this.tick++;
    this.tickStamp = (this.tickStamp % 255) + 1;
    const ts = this.tickStamp;
    for (let y = h - 1; y >= 0; y--) {
      const leftFirst = ((y ^ this.tick) & 1) === 0;
      for (let k = 0; k < w; k++) {
        const x = leftFirst ? k : w - 1 - k;
        const i = y * w + x;
        const m = cell[i];
        if (m === EMPTY || m === STONE || stamp[i] === ts) continue;
        const dir = rng() < 0.5 ? -1 : 1;
        switch (m) {
          case SAND: {
            if (y + 1 >= h) break;
            const below = i + w;
            if (this.canEnter(SAND, below) && (cell[below] !== WATER || rng() < 0.55)) {
              this.move(i, below);
            } else {
              const x1 = x + dir, x2 = x - dir;
              if (x1 >= 0 && x1 < w && this.canEnter(SAND, below + dir) && cell[i + dir] !== STONE) this.move(i, below + dir);
              else if (x2 >= 0 && x2 < w && this.canEnter(SAND, below - dir) && cell[i - dir] !== STONE) this.move(i, below - dir);
            }
            break;
          }
          case WATER: {
            if (y + 1 < h && cell[i + w] === EMPTY) {
              this.move(i, i + w);
              break;
            }
            if (y + 1 < h) {
              const pref = life[i] === 1 ? -1 : life[i] === 2 ? 1 : dir;
              if (x + pref >= 0 && x + pref < w && cell[i + w + pref] === EMPTY) {
                this.move(i, i + w + pref);
                break;
              }
              if (x - pref >= 0 && x - pref < w && cell[i + w - pref] === EMPTY) {
                this.move(i, i + w - pref);
                break;
              }
            }
            // Spread sideways up to 4 cells, remembering the direction (life: 1 = left,
            // 2 = right) so puddles level out instead of random-walking.
            let flow = life[i] === 1 ? -1 : life[i] === 2 ? 1 : dir;
            let target = -1;
            for (let pass = 0; pass < 2 && target < 0; pass++) {
              for (let s = 1; s <= 4; s++) {
                const xs = x + flow * s;
                if (xs < 0 || xs >= w || cell[i + flow * s] !== EMPTY) break;
                target = i + flow * s;
                // Prefer dropping over an edge as soon as there is one.
                if (y + 1 < h && cell[target + w] === EMPTY) break;
              }
              if (target < 0) flow = -flow;
            }
            life[i] = flow < 0 ? 1 : 2;
            if (target >= 0) this.move(i, target);
            break;
          }
          case FIRE: {
            // Neighbours: water puts it out, plant catches.
            let out = false;
            let fuel = false;
            for (let n = 0; n < 4; n++) {
              const nx = x + (n === 0 ? 1 : n === 1 ? -1 : 0);
              const ny = y + (n === 2 ? 1 : n === 3 ? -1 : 0);
              if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
              const j = ny * w + nx;
              if (cell[j] === WATER) out = true;
              else if (cell[j] === PLANT) {
                fuel = true;
                if (rng() < 0.2) {
                  cell[j] = FIRE;
                  life[j] = 30 + ((rng() * 40) | 0);
                  stamp[j] = ts;
                }
              }
            }
            if (out) {
              cell[i] = SMOKE;
              life[i] = 40 + ((rng() * 40) | 0);
              stamp[i] = ts;
              break;
            }
            if (life[i] <= 1) {
              if (rng() < 0.45) {
                cell[i] = SMOKE;
                life[i] = 40 + ((rng() * 60) | 0);
              } else cell[i] = EMPTY;
              stamp[i] = ts;
              break;
            }
            life[i]--;
            // Fire on fuel burns in place and throws short flames upward.
            if (fuel) {
              if (y > 0 && cell[i - w] === EMPTY && rng() < 0.25) {
                cell[i - w] = FIRE;
                life[i - w] = 6 + ((rng() * 10) | 0);
                this.shade[i - w] = (rng() * 255) | 0;
                stamp[i - w] = ts;
              }
              break;
            }
            if (y > 0 && rng() < 0.55) {
              const up = i - w + (rng() < 0.3 ? dir : 0);
              const ux = (up % w + w) % w;
              if (Math.abs(ux - x) <= 1 && cell[up] === EMPTY) this.move(i, up);
            }
            break;
          }
          case SMOKE: {
            if (life[i] <= 1) {
              cell[i] = EMPTY;
              stamp[i] = ts;
              break;
            }
            life[i]--;
            if (y === 0) {
              if (rng() < 0.1) cell[i] = EMPTY;
              break;
            }
            const r = rng();
            const j = r < 0.6 ? i - w : r < 0.8 ? i - w + dir : i + dir;
            const jx = j % w;
            if (j >= 0 && Math.abs(jx - x) <= 1 && cell[j] === EMPTY) this.move(i, j);
            break;
          }
          case PLANT: {
            // Grows into touching water: vines climb through puddles.
            if (rng() < 0.05) {
              const n = (rng() * 4) | 0;
              const nx = x + (n === 0 ? 1 : n === 1 ? -1 : 0);
              const ny = y + (n === 2 ? 1 : n === 3 ? -1 : 0);
              if (nx >= 0 && ny >= 0 && nx < w && ny < h) {
                const j = ny * w + nx;
                if (cell[j] === WATER) {
                  cell[j] = PLANT;
                  this.shade[j] = (rng() * 255) | 0;
                  stamp[j] = ts;
                }
              }
            }
            break;
          }
        }
      }
    }
  }

  /**
   * Compact save: "SND1", w (u16 LE), h (u16 LE), then run-length pairs (run 1..255, material).
   * Life and shade are not saved (re-rolled on load).
   */
  serialize(): Uint8Array {
    const out: number[] = [0x53, 0x4e, 0x44, 0x31, this.w & 255, this.w >> 8, this.h & 255, this.h >> 8];
    const c = this.cell;
    let i = 0;
    while (i < c.length) {
      const m = c[i] === FIRE ? EMPTY : c[i] === SMOKE ? EMPTY : c[i];
      let run = 1;
      while (i + run < c.length && run < 255) {
        const n = c[i + run] === FIRE || c[i + run] === SMOKE ? EMPTY : c[i + run];
        if (n !== m) break;
        run++;
      }
      out.push(run, m);
      i += run;
    }
    return Uint8Array.from(out);
  }

  /** Loads a save, rescaling (nearest) when the grid size changed. Returns false if invalid. */
  load(bytes: Uint8Array): boolean {
    if (bytes.length < 8 || bytes[0] !== 0x53 || bytes[1] !== 0x4e || bytes[2] !== 0x44 || bytes[3] !== 0x31) return false;
    const sw = bytes[4] | (bytes[5] << 8);
    const sh = bytes[6] | (bytes[7] << 8);
    if (!sw || !sh || sw * sh > 4_000_000) return false;
    const src = new Uint8Array(sw * sh);
    let p = 0;
    for (let k = 8; k + 1 < bytes.length && p < src.length; k += 2) {
      const run = bytes[k], m = bytes[k + 1] < MATERIAL_COUNT ? bytes[k + 1] : EMPTY;
      src.fill(m, p, Math.min(src.length, p + run));
      p += run;
    }
    if (p !== src.length) return false;
    this.clear();
    for (let y = 0; y < this.h; y++) {
      // Keep things resting on the floor when the height changes.
      const sy = Math.min(sh - 1, Math.max(0, sh - (this.h - y)));
      for (let x = 0; x < this.w; x++) {
        const sx = Math.min(sw - 1, Math.floor((x * sw) / this.w));
        const m = src[sy * sw + sx];
        if (m !== EMPTY) this.set(x, y, m);
      }
    }
    return true;
  }
}
