// The studio's annotation model: shapes over the snip, numbered steps, redaction boxes, crop,
// with undo/redo. Pure — the canvas renderer and the SVG editor both read this.

import type { Rect } from "./geom";

export type Tool = "select" | "arrow" | "box" | "highlight" | "text" | "step" | "pixelate" | "blur" | "spotlight" | "pen" | "crop";

interface Base {
  id: string;
  color: string;
}
export type Shape =
  | (Base & { kind: "arrow"; x1: number; y1: number; x2: number; y2: number; width: number })
  | (Base & { kind: "box"; rect: Rect; width: number })
  | (Base & { kind: "highlight"; rect: Rect })
  | (Base & { kind: "text"; x: number; y: number; text: string; size: number })
  | (Base & { kind: "step"; x: number; y: number; n: number })
  | (Base & { kind: "pixelate" | "blur"; rect: Rect; source: "user" | "auto"; label?: string })
  | (Base & { kind: "spotlight"; rect: Rect })
  | (Base & { kind: "pen"; points: number[]; width: number });

export interface Doc {
  shapes: Shape[];
  crop: Rect | null;
}

export interface History {
  doc: Doc;
  past: Doc[];
  future: Doc[];
}

export type Action =
  | { type: "add"; shape: Shape }
  | { type: "update"; id: string; patch: Partial<Shape> }
  | { type: "remove"; id: string }
  | { type: "crop"; rect: Rect | null }
  | { type: "redact"; rects: { rect: Rect; label?: string }[]; style?: "pixelate" | "blur" }
  | { type: "clear" }
  | { type: "undo" }
  | { type: "redo" };

const MAX_UNDO = 100;
let seq = 0;
export const newId = (p = "s") => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`;

export const empty = (): History => ({ doc: { shapes: [], crop: null }, past: [], future: [] });

/** Steps are always numbered 1…n in the order they were placed. */
function renumber(shapes: Shape[]): Shape[] {
  let n = 0;
  return shapes.map((s) => (s.kind === "step" ? { ...s, n: ++n } : s));
}

export function nextStep(doc: Doc): number {
  return doc.shapes.filter((s) => s.kind === "step").length + 1;
}

function commit(h: History, doc: Doc): History {
  return { doc, past: [...h.past, h.doc].slice(-MAX_UNDO), future: [] };
}

export function reduce(h: History, a: Action): History {
  switch (a.type) {
    case "add":
      return commit(h, { ...h.doc, shapes: renumber([...h.doc.shapes, a.shape]) });
    case "update": {
      if (!h.doc.shapes.some((s) => s.id === a.id)) return h;
      const shapes = h.doc.shapes.map((s) => (s.id === a.id ? ({ ...s, ...a.patch, id: s.id, kind: s.kind } as Shape) : s));
      return commit(h, { ...h.doc, shapes });
    }
    case "remove": {
      if (!h.doc.shapes.some((s) => s.id === a.id)) return h;
      return commit(h, { ...h.doc, shapes: renumber(h.doc.shapes.filter((s) => s.id !== a.id)) });
    }
    case "crop":
      return commit(h, { ...h.doc, crop: a.rect && a.rect.w > 2 && a.rect.h > 2 ? a.rect : null });
    case "redact": {
      // Skip boxes already covered by an identical redaction (accepting twice is a no-op).
      const have = new Set(h.doc.shapes.filter((s) => s.kind === "pixelate" || s.kind === "blur").map((s) => key((s as { rect: Rect }).rect)));
      const add: Shape[] = a.rects
        .filter((r) => !have.has(key(r.rect)))
        .map((r) => ({ id: newId("r"), kind: a.style ?? "pixelate", rect: r.rect, color: "#000", source: "auto", label: r.label }));
      if (!add.length) return h;
      return commit(h, { ...h.doc, shapes: [...h.doc.shapes, ...add] });
    }
    case "clear":
      return h.doc.shapes.length || h.doc.crop ? commit(h, { shapes: [], crop: null }) : h;
    case "undo": {
      const prev = h.past[h.past.length - 1];
      return prev ? { doc: prev, past: h.past.slice(0, -1), future: [h.doc, ...h.future] } : h;
    }
    case "redo": {
      const next = h.future[0];
      return next ? { doc: next, past: [...h.past, h.doc], future: h.future.slice(1) } : h;
    }
  }
}

const key = (r: Rect) => `${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.w)},${Math.round(r.h)}`;

/** True when an auto-redaction box for this rect is already applied. */
export function isRedacted(doc: Doc, r: Rect): boolean {
  return doc.shapes.some((s) => (s.kind === "pixelate" || s.kind === "blur") && key(s.rect) === key(r));
}

/** Shapes that change pixels (for the "redactions are burned in" note). */
export const redactionCount = (doc: Doc) => doc.shapes.filter((s) => s.kind === "pixelate" || s.kind === "blur").length;

/** Keyboard shortcuts for tools. */
export const TOOL_KEYS: Record<string, Tool> = {
  v: "select",
  a: "arrow",
  r: "box",
  h: "highlight",
  t: "text",
  n: "step",
  p: "pixelate",
  b: "blur",
  s: "spotlight",
  d: "pen",
  c: "crop",
};

/** OCR text with every word under an applied redaction replaced by "•••", so copying the text,
 *  sending it to the Shelf, Claude or a translator never leaks what the image hides. */
export function redactedLines(lines: { words: { text: string; rect: Rect }[] }[], doc: Doc): string[] {
  const boxes = doc.shapes.filter((s) => s.kind === "pixelate" || s.kind === "blur").map((s) => (s as { rect: Rect }).rect);
  const hidden = (r: Rect) =>
    boxes.some((b) => {
      const x = Math.max(r.x, b.x);
      const y = Math.max(r.y, b.y);
      const w = Math.min(r.x + r.w, b.x + b.w) - x;
      const h = Math.min(r.y + r.h, b.y + b.h) - y;
      return w > 0 && h > 0 && w * h >= 0.4 * r.w * r.h;
    });
  return lines.map((l) => {
    const out: string[] = [];
    for (const w of l.words) {
      const t = hidden(w.rect) ? "•••" : w.text;
      if (t === "•••" && out[out.length - 1] === "•••") continue;
      out.push(t);
    }
    return out.join(" ");
  });
}
