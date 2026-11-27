// Live text: the words Windows OCR found in a snip, treated as text you can select on the image.
// Drag across words (or use the arrow keys) to select them in reading order, then copy just those
// words, highlight them, or hide them. Links, email addresses, phone numbers and sign-in codes in
// the snip are offered as one-press copies. Pure: no React, no canvas, nothing leaves this PC.
//
// Learned from (ideas only, no code): Live Text in macOS, Text actions in the Windows Snipping
// Tool, and PowerToys Text Extractor (docs/SNIP.md "Live text").

import type { Rect } from "./geom";

export interface Word {
  text: string;
  rect: Rect;
}
export interface Line {
  words: Word[];
}

/** A word by line and index within the line. */
export interface Pos {
  line: number;
  word: number;
}

/** A selection in reading order terms: every word from `anchor` to `focus`, both included. */
export interface Sel {
  anchor: Pos;
  focus: Pos;
}

export interface Point {
  x: number;
  y: number;
}

const cx = (r: Rect) => r.x + r.w / 2;
const cy = (r: Rect) => r.y + r.h / 2;

function insidePolygon(p: Point, poly: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/**
 * The lines as the exported image shows them: a word counts only when its centre is inside the
 * crop and inside the freeform outline. Text that was cropped away must not follow the snip into
 * the clipboard, the Shelf or a model. Lines left with no words are dropped.
 */
export function visibleLines<L extends Line>(lines: readonly L[], crop: Rect | null, mask?: readonly Point[] | null): Line[] {
  const poly = mask && mask.length > 2 ? mask : null;
  if (!crop && !poly) return lines.filter((l) => l.words.length > 0);
  const keep = (w: Word) => {
    const p = { x: cx(w.rect), y: cy(w.rect) };
    if (crop && !(p.x >= crop.x && p.y >= crop.y && p.x <= crop.x + crop.w && p.y <= crop.y + crop.h)) return false;
    return poly ? insidePolygon(p, poly) : true;
  };
  const out: Line[] = [];
  for (const l of lines) {
    const words = l.words.filter(keep);
    if (words.length) out.push({ words });
  }
  return out;
}

export const wordCount = (lines: readonly Line[]) => lines.reduce((n, l) => n + l.words.length, 0);

const before = (a: Pos, b: Pos) => a.line < b.line || (a.line === b.line && a.word <= b.word);

/** The selection's two ends in reading order. */
export function ordered(sel: Sel): [Pos, Pos] {
  return before(sel.anchor, sel.focus) ? [sel.anchor, sel.focus] : [sel.focus, sel.anchor];
}

export function isSelected(sel: Sel | null, p: Pos): boolean {
  if (!sel) return false;
  const [a, b] = ordered(sel);
  return before(a, p) && before(p, b);
}

function valid(lines: readonly Line[], p: Pos): boolean {
  return p.line >= 0 && p.line < lines.length && p.word >= 0 && p.word < lines[p.line].words.length;
}

/** A selection that points at words which exist, or null (the lines changed under it: a crop). */
export function clampSel(lines: readonly Line[], sel: Sel | null): Sel | null {
  return sel && valid(lines, sel.anchor) && valid(lines, sel.focus) ? sel : null;
}

/** The word under a point (image px), with a little slack around small words. */
export function wordAt(lines: readonly Line[], p: Point, pad = 3): Pos | null {
  for (let li = 0; li < lines.length; li++) {
    const ws = lines[li].words;
    for (let wi = 0; wi < ws.length; wi++) {
      const r = ws[wi].rect;
      if (p.x >= r.x - pad && p.x <= r.x + r.w + pad && p.y >= r.y - pad && p.y <= r.y + r.h + pad) return { line: li, word: wi };
    }
  }
  return null;
}

function lineBand(l: Line): { top: number; bottom: number } {
  let top = Infinity;
  let bottom = -Infinity;
  for (const w of l.words) {
    top = Math.min(top, w.rect.y);
    bottom = Math.max(bottom, w.rect.y + w.rect.h);
  }
  return { top, bottom };
}

function nearestInLine(l: Line, x: number): number {
  let best = 0;
  let bestD = Infinity;
  l.words.forEach((w, i) => {
    const d = x < w.rect.x ? w.rect.x - x : x > w.rect.x + w.rect.w ? x - (w.rect.x + w.rect.w) : 0;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

/**
 * The word a drag is "at" when the pointer is between words or in a margin: the nearest line by
 * height, then the nearest word on it. This is what makes a drag feel like selecting text and not
 * like drawing a box. Null only when there are no words.
 */
export function nearestWord(lines: readonly Line[], p: Point): Pos | null {
  let best = -1;
  let bestD = Infinity;
  lines.forEach((l, i) => {
    if (!l.words.length) return;
    const { top, bottom } = lineBand(l);
    const dy = p.y < top ? top - p.y : p.y > bottom ? p.y - bottom : 0;
    // Among lines at the same height (columns), prefer the one that is closer sideways.
    const w = l.words[nearestInLine(l, p.x)].rect;
    const dx = p.x < w.x ? w.x - p.x : p.x > w.x + w.w ? p.x - (w.x + w.w) : 0;
    const d = dy * 4 + dx;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best < 0 ? null : { line: best, word: nearestInLine(lines[best], p.x) };
}

export const wordSel = (p: Pos): Sel => ({ anchor: p, focus: p });

export function lineSel(lines: readonly Line[], line: number): Sel | null {
  const l = lines[line];
  return l && l.words.length ? { anchor: { line, word: 0 }, focus: { line, word: l.words.length - 1 } } : null;
}

export function allSel(lines: readonly Line[]): Sel | null {
  const first = lines.findIndex((l) => l.words.length > 0);
  if (first < 0) return null;
  let last = lines.length - 1;
  while (last > first && !lines[last].words.length) last--;
  return { anchor: { line: first, word: 0 }, focus: { line: last, word: lines[last].words.length - 1 } };
}

/** Every selected word, in reading order. */
export function selectedWords(lines: readonly Line[], sel: Sel | null): Pos[] {
  if (!sel) return [];
  const [a, b] = ordered(sel);
  const out: Pos[] = [];
  for (let li = a.line; li <= b.line && li < lines.length; li++) {
    const n = lines[li].words.length;
    const from = li === a.line ? a.word : 0;
    const to = li === b.line ? b.word : n - 1;
    for (let wi = from; wi <= to && wi < n; wi++) out.push({ line: li, word: wi });
  }
  return out;
}

export const selectedCount = (lines: readonly Line[], sel: Sel | null) => selectedWords(lines, sel).length;

const HIDDEN = "•••";

/**
 * The selection as text: words joined by spaces, lines by line breaks. `hidden` says which words
 * sit under a redaction; they come out as "•••" (runs collapse), so a copy never says more than
 * the image shows.
 */
export function selectionText(lines: readonly Line[], sel: Sel | null, hidden: (r: Rect) => boolean = () => false): string {
  if (!sel) return "";
  const [a, b] = ordered(sel);
  const rows: string[] = [];
  for (let li = a.line; li <= b.line && li < lines.length; li++) {
    const ws = lines[li].words;
    const from = li === a.line ? a.word : 0;
    const to = li === b.line ? b.word : ws.length - 1;
    const out: string[] = [];
    for (let wi = from; wi <= to && wi < ws.length; wi++) {
      const t = hidden(ws[wi].rect) ? HIDDEN : ws[wi].text;
      if (t === HIDDEN && out[out.length - 1] === HIDDEN) continue;
      out.push(t);
    }
    if (out.length) rows.push(out.join(" "));
  }
  return rows.join("\n");
}

/** One box per line of the selection (image px), padded: where a highlight or a redaction goes. */
export function selectionRects(lines: readonly Line[], sel: Sel | null, pad = 2): Rect[] {
  if (!sel) return [];
  const [a, b] = ordered(sel);
  const out: Rect[] = [];
  for (let li = a.line; li <= b.line && li < lines.length; li++) {
    const ws = lines[li].words;
    const from = li === a.line ? a.word : 0;
    const to = Math.min(li === b.line ? b.word : ws.length - 1, ws.length - 1);
    if (to < from) continue;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let wi = from; wi <= to; wi++) {
      const r = ws[wi].rect;
      x0 = Math.min(x0, r.x);
      y0 = Math.min(y0, r.y);
      x1 = Math.max(x1, r.x + r.w);
      y1 = Math.max(y1, r.y + r.h);
    }
    out.push({ x: x0 - pad, y: y0 - pad, w: x1 - x0 + pad * 2, h: y1 - y0 + pad * 2 });
  }
  return out;
}

export type MoveKey = "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown" | "Home" | "End";
export const isMoveKey = (k: string): k is MoveKey =>
  k === "ArrowLeft" || k === "ArrowRight" || k === "ArrowUp" || k === "ArrowDown" || k === "Home" || k === "End";

function stepWord(lines: readonly Line[], p: Pos, dir: 1 | -1): Pos {
  let { line, word } = p;
  word += dir;
  while (line >= 0 && line < lines.length && (word < 0 || word >= lines[line].words.length)) {
    line += dir;
    if (line < 0 || line >= lines.length) return p;
    word = dir > 0 ? 0 : lines[line].words.length - 1;
  }
  return { line, word };
}

function stepLine(lines: readonly Line[], p: Pos, dir: 1 | -1): Pos {
  let line = p.line + dir;
  while (line >= 0 && line < lines.length && !lines[line].words.length) line += dir;
  if (line < 0 || line >= lines.length) return p;
  return { line, word: nearestInLine(lines[line], cx(lines[p.line].words[p.word].rect)) };
}

/**
 * Keyboard selection. With nothing selected the first key selects the first word; after that the
 * arrows move the focus word (Left/Right by word across lines, Up/Down to the word above or
 * below, Home/End to the ends of the line). `extend` (Shift) keeps the anchor; without it the
 * selection collapses onto the moved word.
 */
export function moveSel(lines: readonly Line[], sel: Sel | null, key: MoveKey, extend: boolean): Sel | null {
  const cur = clampSel(lines, sel);
  if (!cur) {
    const all = allSel(lines);
    return all ? wordSel(key === "End" ? all.focus : all.anchor) : null;
  }
  const f = cur.focus;
  let next: Pos;
  switch (key) {
    case "ArrowLeft":
      next = stepWord(lines, f, -1);
      break;
    case "ArrowRight":
      next = stepWord(lines, f, 1);
      break;
    case "ArrowUp":
      next = stepLine(lines, f, -1);
      break;
    case "ArrowDown":
      next = stepLine(lines, f, 1);
      break;
    case "Home":
      next = { line: f.line, word: 0 };
      break;
    case "End":
      next = { line: f.line, word: lines[f.line].words.length - 1 };
      break;
  }
  return extend ? { anchor: cur.anchor, focus: next } : wordSel(next);
}

// ---- things worth copying on their own ----------------------------------------------------------

export type EntityKind = "link" | "email" | "phone" | "code";

export interface Entity {
  kind: EntityKind;
  /** What goes on the clipboard. */
  value: string;
  /** The words it was read from (for showing it on the image). */
  sel: Sel;
}

export const ENTITY_LABEL: Record<EntityKind, string> = { link: "Link", email: "Email", phone: "Phone", code: "Code" };
export const MAX_ENTITIES = 8;

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;
const TLD = "com|org|net|io|dev|app|ai|co|uk|de|fr|es|it|nl|se|no|fi|pl|ca|au|jp|kr|cn|in|br|us|edu|gov|me|tv|info|xyz";
const LINK = new RegExp(`(?:https?:\\/\\/[^\\s<>"']+|(?:www\\.)?(?:[A-Za-z0-9-]+\\.)+(?:${TLD})(?![A-Za-z0-9-])(?:[/?#][^\\s<>"']*)?)`, "gi");
const PHONE = /\+?\(?\d[\d\s().-]{6,}\d/g;
const CODE = /\b\d{4,8}\b/g;
const CODE_CUE = /\b(code|otp|passcode|verification|verify|one[- ]time|pin|2fa)\b/i;

const trimTail = (s: string) => s.replace(/[.,;:!?)\]}'"]+$/, "");

function isPhone(raw: string): boolean {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 12 + (raw.trim().startsWith("+") ? 3 : 0)) return false;
  const t = raw.trim();
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(t)) return false; // an IP address
  if (/^\d{4}[-./]\d{1,2}[-./]\d{1,2}$/.test(t) || /^\d{1,2}[-./]\d{1,2}[-./]\d{4}$/.test(t)) return false; // a date
  if (/^\d+\.\d+$/.test(t)) return false; // a decimal number
  // A plain run of digits with no separators is more often an id than a phone number.
  return /[\s().+-]/.test(t);
}

/**
 * Links, email addresses, phone numbers and sign-in codes in the lines, in reading order, without
 * repeats. Words under a redaction (`hidden`) never produce one. A 4–8 digit number counts as a
 * code only on a line that says so ("Your verification code is 482913").
 */
export function findEntities(lines: readonly Line[], hidden: (r: Rect) => boolean = () => false): Entity[] {
  const out: Entity[] = [];
  const seen = new Set<string>();
  const add = (kind: EntityKind, value: string, sel: Sel) => {
    const k = `${kind}:${value.toLowerCase()}`;
    if (!value || seen.has(k) || out.length >= MAX_ENTITIES) return;
    seen.add(k);
    out.push({ kind, value, sel });
  };
  lines.forEach((l, li) => {
    if (!l.words.length) return;
    // The line as text, remembering where each word starts, so a match maps back to words.
    const starts: number[] = [];
    let text = "";
    l.words.forEach((w, i) => {
      if (i) text += " ";
      starts.push(text.length);
      text += hidden(w.rect) ? " ".repeat(w.text.length) : w.text;
    });
    const span = (from: number, to: number): Sel => {
      let a = 0;
      let b = l.words.length - 1;
      for (let i = 0; i < starts.length; i++) {
        if (starts[i] <= from) a = i;
        if (starts[i] < to) b = i;
      }
      return { anchor: { line: li, word: a }, focus: { line: li, word: Math.max(a, b) } };
    };
    const taken: [number, number][] = [];
    const free = (a: number, b: number) => taken.every(([x, y]) => b <= x || a >= y);
    const scan = (re: RegExp, kind: EntityKind, ok: (m: string) => boolean = () => true, fix: (m: string) => string = (m) => m) => {
      re.lastIndex = 0;
      for (let m = re.exec(text); m; m = re.exec(text)) {
        const raw = trimTail(m[0]);
        const a = m.index;
        const b = a + raw.length;
        if (!raw || !free(a, b) || !ok(raw)) continue;
        taken.push([a, b]);
        add(kind, fix(raw), span(a, b));
      }
    };
    scan(EMAIL, "email");
    scan(LINK, "link", (m) => !m.includes("@"));
    scan(PHONE, "phone", isPhone, (m) => m.trim().replace(/\s+/g, " "));
    if (CODE_CUE.test(text)) scan(CODE, "code");
  });
  return out;
}

/** "12 words" / "1 word" for the selection pill and the copy notice. */
export const wordsLabel = (n: number) => `${n.toLocaleString()} word${n === 1 ? "" : "s"}`;

/** A long value shortened in the middle for a chip ("admin.example.com/…/api"). */
export function shortValue(v: string, max = 30): string {
  if (v.length <= max) return v;
  const head = Math.ceil((max - 1) * 0.6);
  return `${v.slice(0, head)}…${v.slice(v.length - (max - 1 - head))}`;
}
