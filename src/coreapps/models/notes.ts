// Lens Notes: markdown-lite, to-dos and search over notes kept in the Shelf. Pure.

export const NOTES_SHELF_NAME = "Notes";
export const NOTE_TAG = "lens-note";

export interface NoteLite {
  id: string;
  title: string;
  text: string;
  pinned: boolean;
  updated_ms: number;
  tags: string[];
}

export type Inline = { t: "text" | "b" | "i" | "code"; v: string } | { t: "link"; v: string; href: string };

export type Block =
  | { t: "h"; level: 1 | 2 | 3; inl: Inline[]; line: number }
  | { t: "todo"; done: boolean; inl: Inline[]; line: number }
  | { t: "li"; inl: Inline[]; line: number }
  | { t: "p"; inl: Inline[]; line: number }
  | { t: "gap"; line: number };

/** **bold**, *italic* / _italic_, `code` and bare http(s) links. Never produces HTML. */
export function inline(s: string): Inline[] {
  const out: Inline[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*|_[^_\s][^_]*_|https?:\/\/[^\s)]+)/g;
  let last = 0;
  for (const m of s.matchAll(re)) {
    const i = m.index ?? 0;
    if (i > last) out.push({ t: "text", v: s.slice(last, i) });
    const tok = m[0];
    if (tok.startsWith("**")) out.push({ t: "b", v: tok.slice(2, -2) });
    else if (tok.startsWith("`")) out.push({ t: "code", v: tok.slice(1, -1) });
    else if (tok.startsWith("http")) out.push({ t: "link", v: tok, href: tok });
    else out.push({ t: "i", v: tok.slice(1, -1) });
    last = i + tok.length;
  }
  if (last < s.length) out.push({ t: "text", v: s.slice(last) });
  return out;
}

export function parse(text: string): Block[] {
  const out: Block[] = [];
  text.split(/\r?\n/).forEach((raw, line) => {
    const s = raw.trimEnd();
    let m: RegExpExecArray | null;
    if (!s.trim()) out.push({ t: "gap", line });
    else if ((m = /^(#{1,3})\s+(.*)$/.exec(s))) out.push({ t: "h", level: m[1].length as 1 | 2 | 3, inl: inline(m[2]), line });
    else if ((m = /^\s*[-*]\s+\[( |x|X)\]\s?(.*)$/.exec(s))) out.push({ t: "todo", done: m[1] !== " ", inl: inline(m[2]), line });
    else if ((m = /^\s*[-*•]\s+(.*)$/.exec(s))) out.push({ t: "li", inl: inline(m[1]), line });
    else out.push({ t: "p", inl: inline(s), line });
  });
  return out;
}

/** Flips the to-do on `line`; other lines are untouched. */
export function toggleTodo(text: string, line: number): string {
  const lines = text.split(/\r?\n/);
  const l = lines[line];
  if (l == null) return text;
  lines[line] = l.replace(/^(\s*[-*]\s+\[)( |x|X)(\])/, (_, a, c, b) => `${a}${c === " " ? "x" : " "}${b}`);
  return lines.join("\n");
}

export function todoProgress(text: string): { done: number; total: number } {
  const ts = parse(text).filter((b): b is Extract<Block, { t: "todo" }> => b.t === "todo");
  return { done: ts.filter((t) => t.done).length, total: ts.length };
}

/** The note's title: its first heading or first line, without markdown. */
export function titleOf(text: string): string {
  const first = text.split(/\r?\n/).find((l) => l.trim()) ?? "";
  return first.replace(/^#{1,3}\s+/, "").replace(/^\s*[-*]\s+(\[[ xX]\]\s*)?/, "").replace(/[*_`]/g, "").trim().slice(0, 80) || "Untitled";
}

export function searchNotes(notes: NoteLite[], q: string): NoteLite[] {
  const t = q.trim().toLowerCase();
  const xs = t ? notes.filter((n) => `${n.title}\n${n.text}`.toLowerCase().includes(t)) : notes.slice();
  return xs.sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updated_ms - a.updated_ms);
}

/** Template for a new note or checklist. */
export const NEW_NOTE = "# New note\n\n";
export const NEW_TODO = "# To do\n\n- [ ] \n";
