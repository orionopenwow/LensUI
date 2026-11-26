// Reader view: a page's own text, set by Lens. Pure (no React, no Tauri) so it is unit-tested.
//
// The text comes from the page agent's `readable` extraction (headings as "# ", list items as
// "- ", links as "[text](https://…)"). Nothing here fetches anything: the reader shows text only,
// so opening it never touches the network and no remote image loads in the frame.
import type { ReaderPrefs } from "./api";

export type Inline = { text: string; href?: string };
export type Block =
  | { kind: "heading"; level: 1 | 2 | 3 | 4 | 5 | 6; inline: Inline[] }
  | { kind: "para"; inline: Inline[] }
  | { kind: "list"; items: Inline[][] };

export interface ReaderDoc {
  title: string;
  host: string;
  blocks: Block[];
  words: number;
  /** Whole minutes at ~230 words a minute, at least 1 when there is anything to read. */
  minutes: number;
}

export const READER_SIZE = { min: 14, max: 26, step: 2, def: 18 } as const;
export const READER_WIDTHS: Record<ReaderPrefs["width"], number> = { narrow: 560, medium: 680, wide: 820 };
const MAX_BLOCKS = 4000;

/** Only web links are kept as links; anything else (javascript:, data:, file:) stays plain text. */
export function safeHref(href: string): string | undefined {
  const h = href.trim();
  if (!/^https?:\/\//i.test(h) || /[\s<>"]/.test(h)) return undefined;
  try {
    const u = new URL(h);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : undefined;
  } catch {
    return undefined;
  }
}

/** Splits a line into text and `[text](url)` links. */
export function parseInline(line: string): Inline[] {
  const out: Inline[] = [];
  const re = /\[([^\]\n]{1,300})\]\(([^)\s]{1,2000})\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  const push = (text: string, href?: string) => {
    if (!text) return;
    const prev = out[out.length - 1];
    if (!href && prev && !prev.href) prev.text += text;
    else out.push(href ? { text, href } : { text });
  };
  while ((m = re.exec(line))) {
    push(line.slice(last, m.index));
    const href = safeHref(m[2]);
    push(m[1].trim() || m[2], href);
    last = m.index + m[0].length;
  }
  push(line.slice(last));
  return out;
}

const wordsIn = (inline: Inline[]) => inline.reduce((n, i) => n + (i.text.trim() ? i.text.trim().split(/\s+/).length : 0), 0);

/** Turns the page agent's readable text into blocks. */
export function parseReadable(text: string, meta: { title?: string; url?: string } = {}): ReaderDoc {
  const blocks: Block[] = [];
  let words = 0;
  let para: string[] = [];
  let list: Inline[][] | null = null;
  const flushPara = () => {
    const joined = para.join(" ").replace(/\s+/g, " ").trim();
    para = [];
    if (!joined) return;
    const inline = parseInline(joined);
    words += wordsIn(inline);
    blocks.push({ kind: "para", inline });
  };
  const flushList = () => {
    if (list && list.length) blocks.push({ kind: "list", items: list });
    list = null;
  };
  for (const raw of String(text ?? "").replace(/\r\n?/g, "\n").split("\n")) {
    if (blocks.length >= MAX_BLOCKS) break;
    const line = raw.trim();
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      flushPara();
      flushList();
      const inline = parseInline(h[2].trim());
      if (inline.length) {
        words += wordsIn(inline);
        blocks.push({ kind: "heading", level: h[1].length as 1, inline });
      }
      continue;
    }
    const li = /^[-*•]\s+(.*)$/.exec(line);
    if (li) {
      flushPara();
      const inline = parseInline(li[1].trim());
      if (inline.length) {
        words += wordsIn(inline);
        (list ??= []).push(inline);
      }
      continue;
    }
    if (!line) {
      flushPara();
      flushList();
      continue;
    }
    flushList();
    para.push(line);
  }
  flushPara();
  flushList();
  let host = "";
  try {
    host = meta.url ? new URL(meta.url).host.replace(/^www\./, "") : "";
  } catch {
    host = "";
  }
  const firstHeading = blocks.find((b) => b.kind === "heading");
  const title = (meta.title || "").trim() || (firstHeading && firstHeading.kind === "heading" ? firstHeading.inline.map((i) => i.text).join("") : "") || host || "Reader";
  // The page's own H1 usually repeats the title: don't show it twice.
  const first = blocks[0];
  if (first && first.kind === "heading" && first.level === 1 && sameTitle(first.inline.map((i) => i.text).join(""), title)) blocks.shift();
  return { title, host, blocks, words, minutes: words ? Math.max(1, Math.round(words / 230)) : 0 };
}

function sameTitle(a: string, b: string): boolean {
  const n = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const [x, y] = [n(a), n(b)];
  return !!x && (x === y || y.startsWith(x) || x.startsWith(y));
}

/** A page with too little text isn't worth a reader view (apps, search results, video pages). */
export function readerWorthIt(doc: ReaderDoc): boolean {
  return doc.words >= 60 && doc.blocks.some((b) => b.kind === "para");
}

export function clampReader(p: Partial<ReaderPrefs> | null | undefined): ReaderPrefs {
  const size = Math.round(Number(p?.size));
  return {
    size: Number.isFinite(size) ? Math.min(READER_SIZE.max, Math.max(READER_SIZE.min, size)) : READER_SIZE.def,
    width: p?.width === "narrow" || p?.width === "wide" ? p.width : "medium",
    face: p?.face === "sans" ? "sans" : "serif",
  };
}

export function stepSize(p: ReaderPrefs, dir: 1 | -1): ReaderPrefs {
  return clampReader({ ...p, size: p.size + dir * READER_SIZE.step });
}

export function readingLabel(doc: ReaderDoc): string {
  if (!doc.words) return "";
  return `${doc.minutes} min read · ${doc.words.toLocaleString("en-US")} words`;
}
