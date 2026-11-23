/**
 * Live thumbnails without a GPU context per tile: one shared renderer draws each visible tile in
 * turn and copies the frame into the tile's 2D canvas. Hover a tile to animate it at ~12 fps;
 * the rest refresh slowly (or never, with reduced motion).
 */
import { BackdropRenderer } from "./renderer";
import type { BackdropState } from "./state";

interface Tile {
  canvas: HTMLCanvasElement;
  state: BackdropState;
  visible: boolean;
  hot: boolean;
  drawnAt: number;
  phase: number;
}

export class ThumbnailService {
  private renderer: BackdropRenderer | null = null;
  private gl: HTMLCanvasElement | null = null;
  private tiles = new Map<HTMLCanvasElement, Tile>();
  private io: IntersectionObserver | null = null;
  private timer = 0;
  private start = performance.now();
  reduced = false;

  constructor(private w = 160, private h = 96) {
    try {
      this.gl = document.createElement("canvas");
      this.gl.width = w;
      this.gl.height = h;
      this.renderer = new BackdropRenderer(this.gl, { preserve: true });
    } catch {
      this.renderer = null;
    }
    if (typeof IntersectionObserver !== "undefined") {
      this.io = new IntersectionObserver((entries) => {
        for (const e of entries) {
          const t = this.tiles.get(e.target as HTMLCanvasElement);
          if (t) t.visible = e.isIntersecting;
        }
      });
    }
    this.timer = window.setInterval(() => this.pump(), 83);
  }

  get available(): boolean {
    return !!this.renderer;
  }

  add(canvas: HTMLCanvasElement, state: BackdropState): void {
    canvas.width = this.w;
    canvas.height = this.h;
    const tile: Tile = { canvas, state, visible: !this.io, hot: false, drawnAt: 0, phase: Math.random() * 10 };
    this.tiles.set(canvas, tile);
    this.io?.observe(canvas);
  }

  update(canvas: HTMLCanvasElement, state: BackdropState): void {
    const t = this.tiles.get(canvas);
    if (t) {
      t.state = state;
      t.drawnAt = 0;
    }
  }

  remove(canvas: HTMLCanvasElement): void {
    this.tiles.delete(canvas);
    this.io?.unobserve(canvas);
  }

  setHot(canvas: HTMLCanvasElement, hot: boolean): void {
    const t = this.tiles.get(canvas);
    if (t) t.hot = hot;
  }

  /** Draw a tile now (also used for the history strip). */
  drawInto(target: HTMLCanvasElement, state: BackdropState, time = 4): boolean {
    if (!this.renderer || !this.gl) return false;
    try {
      this.renderer.replace(state);
    } catch {
      return false;
    }
    this.renderer.render(time);
    const ctx = target.getContext("2d");
    if (!ctx) return false;
    ctx.drawImage(this.gl, 0, 0, target.width, target.height);
    return true;
  }

  private pump(): void {
    if (!this.renderer || document.hidden) return;
    const now = performance.now();
    const secs = (now - this.start) / 1000;
    // Budget: at most 3 tiles per tick (≈ 36 tiles/s at 160×96).
    let budget = 3;
    const list = [...this.tiles.values()].filter((t) => t.visible).sort((a, b) => Number(b.hot) - Number(a.hot) || a.drawnAt - b.drawnAt);
    for (const t of list) {
      if (budget <= 0) break;
      const age = now - t.drawnAt;
      const due = t.drawnAt === 0 || (t.hot && !this.reduced) || (!this.reduced && age > 2500);
      if (!due) continue;
      this.drawInto(t.canvas, t.state, t.hot ? secs : 3 + t.phase + (this.reduced ? 0 : secs * 0.15));
      t.drawnAt = now;
      budget--;
    }
  }

  dispose(): void {
    clearInterval(this.timer);
    this.io?.disconnect();
    this.renderer?.dispose();
    this.tiles.clear();
  }
}
