// Small pieces of the studio's editor: hit boxes for shapes, the selection outline and the shape
// being drawn. Split out of Studio.tsx; no behaviour of their own.
import React from "react";
import type { Shape } from "./annotations";
import type { Rect } from "./geom";

export function union(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

export function safeName(title: string) {
  const t = title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").trim().slice(0, 60);
  return t ? `Lens Snip — ${t}` : "Lens Snip";
}

export function bbox(s: Shape): Rect {
  switch (s.kind) {
    case "arrow":
      return { x: Math.min(s.x1, s.x2), y: Math.min(s.y1, s.y2), w: Math.abs(s.x2 - s.x1), h: Math.abs(s.y2 - s.y1) };
    case "text":
      return { x: s.x, y: s.y, w: s.text.length * s.size * 0.6, h: s.size * 1.2 };
    case "step":
      return { x: s.x - 14, y: s.y - 14, w: 28, h: 28 };
    case "pen": {
      const xs = s.points.filter((_, i) => i % 2 === 0);
      const ys = s.points.filter((_, i) => i % 2 === 1);
      return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
    }
    default:
      return s.rect;
  }
}

export function hitTest(s: Shape, p: { x: number; y: number }) {
  const b = bbox(s);
  const pad = 8;
  return p.x >= b.x - pad && p.y >= b.y - pad && p.x <= b.x + b.w + pad && p.y <= b.y + b.h + pad;
}

export const SelBox: React.FC<{ shape?: Shape; scale: number }> = ({ shape, scale }) => {
  if (!shape) return null;
  const b = bbox(shape);
  return <rect x={b.x - 6} y={b.y - 6} width={b.w + 12} height={b.h + 12} fill="none" stroke="var(--lens-accent)" strokeDasharray="4 3" strokeWidth={Math.max(1, scale * 1.5)} />;
};

export const DraftShape: React.FC<{ s: Shape; crop: boolean }> = ({ s, crop }) => {
  switch (s.kind) {
    case "arrow":
      return <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={s.color} strokeWidth={s.width} strokeLinecap="round" />;
    case "box":
      return <rect x={s.rect.x} y={s.rect.y} width={s.rect.w} height={s.rect.h} rx={4} fill="none" stroke={s.color} strokeWidth={s.width} />;
    case "highlight":
      return <rect x={s.rect.x} y={s.rect.y} width={s.rect.w} height={s.rect.h} fill={s.color} opacity={0.4} />;
    case "pixelate":
    case "blur":
      return <rect x={s.rect.x} y={s.rect.y} width={s.rect.w} height={s.rect.h} fill="rgba(0,0,0,0.35)" stroke="#fff" strokeDasharray="4 3" />;
    case "spotlight":
      return <rect x={s.rect.x} y={s.rect.y} width={s.rect.w} height={s.rect.h} fill="none" stroke={crop ? "var(--lens-accent)" : "#fff"} strokeWidth={2} strokeDasharray="6 4" />;
    case "pen":
      return <polyline points={s.points.reduce<string[]>((a, v, i) => (i % 2 ? (a[a.length - 1] += `,${v}`, a) : [...a, String(v)]), []).join(" ")} fill="none" stroke={s.color} strokeWidth={s.width} strokeLinecap="round" strokeLinejoin="round" />;
    default:
      return null;
  }
};
