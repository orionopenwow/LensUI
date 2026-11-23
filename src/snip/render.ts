// Burns the studio's annotations into pixels: shapes, numbered steps, pixelate/blur redactions,
// spotlight, crop, freeform mask, in-place translation and the "beautify" frame.
// Redactions are drawn into the exported pixels — the original pixels under them are gone.

import type { Doc, Shape } from "./annotations";
import type { Rect } from "./geom";

export interface Beautify {
  preset: string;
  /** Colours from the active theme, used by the "theme" preset. */
  accent: string;
  surface: string;
}

export interface TranslatedLine {
  rect: Rect;
  text: string;
}

export interface RenderOptions {
  beautify?: Beautify;
  /** Freeform lasso in image pixels; everything outside becomes transparent. */
  mask?: { x: number; y: number }[] | null;
  translation?: TranslatedLine[];
  /** Background behind translated text (sampled from the snip). */
  translationBg?: string;
}

const BEAUTIFY: Record<string, { from: string; to: string; pad: number; radius: number; shadow: number }> = {
  soft: { from: "#e0e7ff", to: "#fce7f3", pad: 56, radius: 12, shadow: 32 },
  vivid: { from: "#6366f1", to: "#ec4899", pad: 64, radius: 14, shadow: 40 },
  mono: { from: "#18181b", to: "#3f3f46", pad: 48, radius: 10, shadow: 28 },
};

export function drawShape(ctx: CanvasRenderingContext2D, s: Shape, src: CanvasImageSource) {
  ctx.save();
  switch (s.kind) {
    case "arrow": {
      const ang = Math.atan2(s.y2 - s.y1, s.x2 - s.x1);
      const head = Math.max(10, s.width * 4);
      ctx.strokeStyle = s.color;
      ctx.fillStyle = s.color;
      ctx.lineWidth = s.width;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(s.x1, s.y1);
      ctx.lineTo(s.x2 - Math.cos(ang) * head * 0.6, s.y2 - Math.sin(ang) * head * 0.6);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(s.x2, s.y2);
      ctx.lineTo(s.x2 - head * Math.cos(ang - 0.45), s.y2 - head * Math.sin(ang - 0.45));
      ctx.lineTo(s.x2 - head * Math.cos(ang + 0.45), s.y2 - head * Math.sin(ang + 0.45));
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "box":
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width;
      ctx.lineJoin = "round";
      roundRect(ctx, s.rect.x, s.rect.y, s.rect.w, s.rect.h, 4);
      ctx.stroke();
      break;
    case "highlight":
      ctx.globalCompositeOperation = "multiply";
      ctx.fillStyle = s.color;
      ctx.globalAlpha = 0.45;
      ctx.fillRect(s.rect.x, s.rect.y, s.rect.w, s.rect.h);
      break;
    case "text": {
      ctx.font = `600 ${s.size}px "Segoe UI", system-ui, sans-serif`;
      ctx.textBaseline = "top";
      ctx.lineWidth = Math.max(2, s.size / 7);
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.lineJoin = "round";
      ctx.strokeText(s.text, s.x, s.y);
      ctx.fillStyle = s.color;
      ctx.fillText(s.text, s.x, s.y);
      break;
    }
    case "step": {
      const r = 14;
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#fff";
      ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.font = `700 15px "Segoe UI", system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(s.n), s.x, s.y + 1);
      break;
    }
    case "pixelate": {
      const { x, y, w, h } = clampRect(s.rect, ctx.canvas.width, ctx.canvas.height);
      if (w < 1 || h < 1) break;
      const block = Math.max(6, Math.round(Math.min(w, h) / 6));
      const sw = Math.max(1, Math.round(w / block));
      const sh = Math.max(1, Math.round(h / block));
      const tmp = document.createElement("canvas");
      tmp.width = sw;
      tmp.height = sh;
      const t = tmp.getContext("2d")!;
      t.imageSmoothingEnabled = true;
      t.drawImage(ctx.canvas, x, y, w, h, 0, 0, sw, sh);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(tmp, 0, 0, sw, sh, x, y, w, h);
      break;
    }
    case "blur": {
      const { x, y, w, h } = clampRect(s.rect, ctx.canvas.width, ctx.canvas.height);
      if (w < 1 || h < 1) break;
      // Blur, then pixelate lightly: plain blur alone can leave short text readable.
      const tmp = document.createElement("canvas");
      tmp.width = w;
      tmp.height = h;
      const t = tmp.getContext("2d")!;
      t.filter = `blur(${Math.max(6, Math.round(Math.min(w, h) / 4))}px)`;
      t.drawImage(ctx.canvas, x - 12, y - 12, w + 24, h + 24, -12, -12, w + 24, h + 24);
      ctx.drawImage(tmp, x, y);
      break;
    }
    case "spotlight": {
      const { width: W, height: H } = ctx.canvas;
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.beginPath();
      ctx.rect(0, 0, W, H);
      roundRect(ctx, s.rect.x, s.rect.y, s.rect.w, s.rect.h, 8);
      ctx.fill("evenodd");
      break;
    }
    case "pen": {
      if (s.points.length < 4) break;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(s.points[0], s.points[1]);
      for (let i = 2; i < s.points.length; i += 2) ctx.lineTo(s.points[i], s.points[i + 1]);
      ctx.stroke();
      break;
    }
  }
  ctx.restore();
  void src;
}

function clampRect(r: Rect, W: number, H: number): Rect {
  const x = Math.max(0, Math.floor(r.x));
  const y = Math.max(0, Math.floor(r.y));
  return { x, y, w: Math.min(W, Math.ceil(r.x + r.w)) - x, h: Math.min(H, Math.ceil(r.y + r.h)) - y };
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Draws the snip with every annotation into a new canvas (pixel space of the image). */
export function renderDoc(img: CanvasImageSource & { width: number; height: number }, doc: Doc, opts: RenderOptions = {}): HTMLCanvasElement {
  const base = document.createElement("canvas");
  base.width = img.width;
  base.height = img.height;
  const ctx = base.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  if (opts.mask && opts.mask.length > 2) {
    ctx.globalCompositeOperation = "destination-in";
    ctx.beginPath();
    opts.mask.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
  }
  // Redactions first (they read the pixels underneath), then everything else on top.
  for (const s of doc.shapes) if (s.kind === "pixelate" || s.kind === "blur") drawShape(ctx, s, img);
  for (const line of opts.translation ?? []) drawTranslation(ctx, line, opts.translationBg ?? sampleBackground(ctx, line.rect));
  for (const s of doc.shapes) if (s.kind !== "pixelate" && s.kind !== "blur") drawShape(ctx, s, img);

  let out = base;
  if (doc.crop) {
    const c = clampRect(doc.crop, base.width, base.height);
    if (c.w > 0 && c.h > 0) {
      out = document.createElement("canvas");
      out.width = c.w;
      out.height = c.h;
      out.getContext("2d")!.drawImage(base, c.x, c.y, c.w, c.h, 0, 0, c.w, c.h);
    }
  }
  return opts.beautify && opts.beautify.preset !== "none" ? beautify(out, opts.beautify) : out;
}

function drawTranslation(ctx: CanvasRenderingContext2D, line: TranslatedLine, bg: string) {
  const { x, y, w, h } = line.rect;
  ctx.save();
  ctx.fillStyle = bg;
  ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
  let size = Math.max(9, Math.round(h * 0.85));
  ctx.font = `500 ${size}px "Segoe UI", system-ui, sans-serif`;
  while (size > 8 && ctx.measureText(line.text).width > w + 8) {
    size -= 1;
    ctx.font = `500 ${size}px "Segoe UI", system-ui, sans-serif`;
  }
  ctx.fillStyle = luminance(bg) > 0.5 ? "#111" : "#f5f5f5";
  ctx.textBaseline = "middle";
  ctx.fillText(line.text, x, y + h / 2);
  ctx.restore();
}

export function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 1;
  const n = parseInt(m[1], 16);
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
}

/** Padding, a gradient backdrop, rounded corners and a soft shadow. */
export function beautify(src: HTMLCanvasElement, b: Beautify): HTMLCanvasElement {
  const p = b.preset === "theme" ? { from: b.surface, to: b.accent, pad: 56, radius: 12, shadow: 32 } : BEAUTIFY[b.preset] ?? BEAUTIFY.soft;
  const out = document.createElement("canvas");
  out.width = src.width + p.pad * 2;
  out.height = src.height + p.pad * 2;
  const ctx = out.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, out.width, out.height);
  g.addColorStop(0, p.from);
  g.addColorStop(1, p.to);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = p.shadow;
  ctx.shadowOffsetY = p.shadow / 3;
  ctx.beginPath();
  roundRect(ctx, p.pad, p.pad, src.width, src.height, p.radius);
  ctx.fillStyle = "#000";
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  roundRect(ctx, p.pad, p.pad, src.width, src.height, p.radius);
  ctx.clip();
  ctx.drawImage(src, p.pad, p.pad);
  ctx.restore();
  return out;
}

/** The average colour around a rect's border — a background for translated text. */
export function sampleBackground(ctx: CanvasRenderingContext2D, r: Rect): string {
  const x = Math.max(0, Math.floor(r.x) - 2);
  const y = Math.max(0, Math.floor(r.y) - 2);
  const w = Math.min(ctx.canvas.width - x, Math.ceil(r.w) + 4);
  const h = Math.min(ctx.canvas.height - y, Math.ceil(r.h) + 4);
  if (w <= 0 || h <= 0) return "#ffffff";
  const d = ctx.getImageData(x, y, w, h).data;
  let rr = 0, gg = 0, bb = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) {
    const px = (i / 4) % w;
    const py = Math.floor(i / 4 / w);
    if (px > 1 && px < w - 2 && py > 1 && py < h - 2) continue;
    rr += d[i];
    gg += d[i + 1];
    bb += d[i + 2];
    n++;
  }
  if (!n) return "#ffffff";
  const hex = (v: number) => Math.round(v / n).toString(16).padStart(2, "0");
  return `#${hex(rr)}${hex(gg)}${hex(bb)}`;
}
