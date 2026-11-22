import type { FxButton, FxSettings } from "./types";

/**
 * Canvas renderer for every pointer effect. The overlay feeds it hook frames; the Cursor Suite
 * card feeds it DOM mouse events (test area) or a scripted path (tiny previews). Coordinates are
 * canvas pixels. The loop only runs while something is animating, so an idle overlay costs
 * nothing.
 */

interface Ripple {
  x: number;
  y: number;
  t0: number;
  button: FxButton;
}
interface TrailPoint {
  x: number;
  y: number;
  t: number;
}
interface Chip {
  text: string;
  t0: number;
  kind: "key" | "click";
}

const RIPPLE_MS = 520;
const TRAIL_MS = 360;
const COMET_MS = 220;
const LOCATOR_MS = 900;
const CHIP_MS = 1700;
const SPOT_FADE_MS = 220;

const BUTTON_LABEL: Record<FxButton, string> = {
  left: "Left click",
  right: "Right click",
  middle: "Middle click",
  x: "Side button",
};

function easeOut(t: number): number {
  // cubic-bezier(0.22, 1, 0.36, 1) is close to an ease-out quint.
  return 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 4);
}

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [250, 250, 250];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export interface FxEngineOptions {
  /** Resolved effect colour (#rrggbb). */
  color: string;
  /** Multiplier for sizes (device pixel ratio on the overlay, smaller in tiny previews). */
  scale: number;
  /** Static drawing only (reduced motion): ripples and trails become short fades. */
  reducedMotion?: boolean;
  /** Tiny previews: one chip, hugging the bottom edge. */
  compact?: boolean;
}

export class FxEngine {
  private ctx: CanvasRenderingContext2D;
  private settings: FxSettings;
  private opts: FxEngineOptions;
  private ripples: Ripple[] = [];
  private trail: TrailPoint[] = [];
  private chips: Chip[] = [];
  private locatorT0 = -1;
  private spotOn = false;
  private spotT0 = -1;
  private pos: { x: number; y: number } | null = null;
  private raf = 0;
  private running = false;
  private now: () => number;

  constructor(
    private canvas: HTMLCanvasElement,
    settings: FxSettings,
    opts: FxEngineOptions,
    now: () => number = () => performance.now()
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas unavailable");
    this.ctx = ctx;
    this.settings = settings;
    this.opts = opts;
    this.now = now;
  }

  setSettings(s: FxSettings) {
    this.settings = s;
    if (!s.spotlight) this.spotOn = false;
    this.kick();
  }

  setOptions(o: Partial<FxEngineOptions>) {
    this.opts = { ...this.opts, ...o };
    this.kick();
  }

  /** Pointer moved to (x, y). */
  pointer(x: number, y: number) {
    this.pos = { x, y };
    if (this.settings.glowTrail || this.settings.cometTrail) {
      const t = this.now();
      const last = this.trail[this.trail.length - 1];
      if (!last || Math.hypot(last.x - x, last.y - y) > 0.5) this.trail.push({ x, y, t });
      if (this.trail.length > 96) this.trail.splice(0, this.trail.length - 96);
    }
    this.kick();
  }

  click(button: FxButton, x: number, y: number) {
    const t = this.now();
    if (this.settings.ripples) this.ripples.push({ x, y, t0: t, button });
    if (this.settings.keystrokes) this.pushChip(BUTTON_LABEL[button], "click");
    if (this.ripples.length > 24) this.ripples.splice(0, this.ripples.length - 24);
    this.kick();
  }

  key(label: string) {
    if (!this.settings.keystrokes) return;
    this.pushChip(label, "key");
    this.kick();
  }

  locate() {
    if (!this.settings.shakeToFind) return;
    this.locatorT0 = this.now();
    this.kick();
  }

  toggleSpotlight(force?: boolean) {
    if (!this.settings.spotlight) return;
    const next = force ?? !this.spotOn;
    if (next !== this.spotOn) {
      this.spotOn = next;
      this.spotT0 = this.now();
    }
    this.kick();
  }

  get spotlightOn() {
    return this.spotOn;
  }

  clear() {
    this.ripples = [];
    this.trail = [];
    this.chips = [];
    this.locatorT0 = -1;
    this.spotOn = false;
    this.spotT0 = -1;
    this.draw();
  }

  destroy() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private pushChip(text: string, kind: Chip["kind"]) {
    const t = this.now();
    const last = this.chips[this.chips.length - 1];
    // Repeated identical presses merge ("Ctrl + Z ×3").
    if (last && t - last.t0 < 900 && last.text.replace(/ ×\d+$/, "") === text) {
      const n = Number(/ ×(\d+)$/.exec(last.text)?.[1] ?? 1) + 1;
      last.text = `${text} ×${n}`;
      last.t0 = t;
      return;
    }
    this.chips.push({ text, t0: t, kind });
    const max = this.opts.compact ? 1 : 5;
    if (this.chips.length > max) this.chips.splice(0, this.chips.length - max);
  }

  /** Starts the animation loop if it isn't running. */
  kick() {
    if (this.running) return;
    this.running = true;
    const step = () => {
      const busy = this.draw();
      if (busy) {
        this.raf = requestAnimationFrame(step);
      } else {
        this.running = false;
      }
    };
    this.raf = requestAnimationFrame(step);
  }

  /** Draws one frame; returns whether anything is still animating. */
  draw(): boolean {
    const { ctx, canvas } = this;
    const t = this.now();
    const s = this.opts.scale;
    const [r, g, b] = hexToRgb(this.opts.color);
    const rgba = (a: number) => `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, a))})`;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let busy = false;

    // Spotlight: dim everything but a soft circle round the pointer.
    if (this.settings.spotlight && (this.spotOn || (this.spotT0 >= 0 && t - this.spotT0 < SPOT_FADE_MS))) {
      const k = Math.min(1, (t - this.spotT0) / SPOT_FADE_MS);
      const vis = this.spotOn ? easeOut(k) : 1 - easeOut(k);
      const p = this.pos ?? { x: canvas.width / 2, y: canvas.height / 2 };
      const rad = this.settings.spotlightRadius * s;
      ctx.save();
      ctx.fillStyle = `rgba(0, 0, 0, ${0.62 * vis})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = "destination-out";
      const grad = ctx.createRadialGradient(p.x, p.y, rad * 0.82, p.x, p.y, rad);
      grad.addColorStop(0, "rgba(0,0,0,1)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(p.x, p.y, rad, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = rgba(0.35 * vis);
      ctx.lineWidth = 1.5 * s;
      ctx.beginPath();
      ctx.arc(p.x, p.y, rad * 0.98, 0, Math.PI * 2);
      ctx.stroke();
      if (!this.spotOn || k < 1) busy = true;
    }

    // Trails.
    const trailMs = this.settings.glowTrail ? TRAIL_MS : COMET_MS;
    this.trail = this.trail.filter((p) => t - p.t < trailMs);
    if (this.trail.length > 0 && !this.opts.reducedMotion) {
      if (this.settings.glowTrail) {
        for (const p of this.trail) {
          const age = (t - p.t) / TRAIL_MS;
          const rad = (14 - 8 * age) * s;
          const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rad);
          grad.addColorStop(0, rgba(0.22 * (1 - age)));
          grad.addColorStop(1, rgba(0));
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(p.x, p.y, rad, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      if (this.settings.cometTrail) {
        ctx.save();
        ctx.shadowColor = "rgba(0, 0, 0, 0.4)";
        ctx.shadowBlur = 3 * s;
        const pts = this.trail.filter((p) => t - p.t < COMET_MS);
        ctx.lineCap = "round";
        for (let i = 1; i < pts.length; i++) {
          const a = pts[i - 1];
          const c = pts[i];
          const k = i / pts.length;
          ctx.strokeStyle = rgba(0.85 * k);
          ctx.lineWidth = (1 + 6 * k) * s;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(c.x, c.y);
          ctx.stroke();
        }
        ctx.restore();
      }
      busy = true;
    }

    // A soft dark halo under rings and trails keeps a white effect visible on white windows.
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
    ctx.shadowBlur = 3 * s;

    // Click ripples: left = one ring, right = two rings, middle = a filled pulse, X = square.
    this.ripples = this.ripples.filter((rp) => t - rp.t0 < RIPPLE_MS);
    for (const rp of this.ripples) {
      const k = (t - rp.t0) / RIPPLE_MS;
      const e = easeOut(k);
      const fade = 1 - k;
      const reduced = this.opts.reducedMotion;
      const R = (reduced ? 16 : 6 + 22 * e) * s;
      ctx.lineWidth = 2 * s;
      if (rp.button === "left") {
        ctx.strokeStyle = rgba(0.9 * fade);
        ctx.beginPath();
        ctx.arc(rp.x, rp.y, R, 0, Math.PI * 2);
        ctx.stroke();
      } else if (rp.button === "right") {
        ctx.strokeStyle = rgba(0.9 * fade);
        ctx.setLineDash([4 * s, 3 * s]);
        ctx.beginPath();
        ctx.arc(rp.x, rp.y, R, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(rp.x, rp.y, R * 0.55, 0, Math.PI * 2);
        ctx.stroke();
      } else if (rp.button === "middle") {
        ctx.fillStyle = rgba(0.35 * fade);
        ctx.beginPath();
        ctx.arc(rp.x, rp.y, R * 0.8, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.strokeStyle = rgba(0.9 * fade);
        const h = R * 0.8;
        ctx.strokeRect(rp.x - h, rp.y - h, h * 2, h * 2);
      }
      busy = true;
    }

    // Shake-to-find: rings that close in on the pointer.
    if (this.locatorT0 >= 0) {
      const k = (t - this.locatorT0) / LOCATOR_MS;
      if (k >= 1) {
        this.locatorT0 = -1;
      } else if (this.pos) {
        for (let i = 0; i < 3; i++) {
          const kk = Math.min(1, Math.max(0, k * 1.3 - i * 0.15));
          const R = (150 - 130 * easeOut(kk)) * s;
          ctx.strokeStyle = rgba(0.75 * (1 - kk));
          ctx.lineWidth = (3 - i * 0.6) * s;
          ctx.beginPath();
          ctx.arc(this.pos.x, this.pos.y, Math.max(4 * s, R), 0, Math.PI * 2);
          ctx.stroke();
        }
        busy = true;
      }
    }

    ctx.restore();

    // Keys & clicks: chips along the bottom centre.
    this.chips = this.chips.filter((c) => t - c.t0 < CHIP_MS);
    if (this.chips.length) {
      const fs = 15 * s;
      ctx.font = `600 ${fs}px "Segoe UI", system-ui, sans-serif`;
      ctx.textBaseline = "middle";
      const padX = 12 * s;
      const h = 34 * s;
      const gap = 8 * s;
      const widths = this.chips.map((c) => ctx.measureText(c.text).width + padX * 2);
      const total = widths.reduce((a, w) => a + w, 0) + gap * (widths.length - 1);
      let x = (canvas.width - total) / 2;
      const y = canvas.height - h - (this.opts.compact ? 4 : 56) * s;
      this.chips.forEach((c, i) => {
        const age = (t - c.t0) / CHIP_MS;
        const a = age < 0.75 ? 1 : 1 - (age - 0.75) / 0.25;
        const rise = this.opts.reducedMotion ? 0 : (1 - easeOut(Math.min(1, (t - c.t0) / 180))) * 8 * s;
        const w = widths[i];
        ctx.fillStyle = `rgba(9, 9, 11, ${0.82 * a})`;
        roundRect(ctx, x, y + rise, w, h, 9 * s);
        ctx.fill();
        ctx.strokeStyle = c.kind === "click" ? rgba(0.55 * a) : `rgba(250, 250, 250, ${0.16 * a})`;
        ctx.lineWidth = 1 * s;
        ctx.stroke();
        ctx.fillStyle = `rgba(250, 250, 250, ${a})`;
        ctx.fillText(c.text, x + padX, y + rise + h / 2 + 0.5 * s);
        x += w + gap;
      });
      busy = true;
    }
    return busy;
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** "accent" → the live accent; otherwise the stored #rrggbb. */
export function resolveFxColor(color: string, accentHex: string): string {
  return color === "accent" ? accentHex : color;
}
