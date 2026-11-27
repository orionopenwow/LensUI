// Brain viewer: search over the brain docs, design, safety contract and dossiers; a light
// Markdown outline for the reader.

export interface DocText {
  path: string;
  text: string;
}

export interface Hit {
  path: string;
  line: number;
  heading: string;
  snippet: string;
  score: number;
}

/** Every line containing all words of `q` (case-insensitive), headings weighted, best first. */
export function searchDocs(docs: DocText[], q: string, limit = 60): Hit[] {
  const words = q.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
  if (!words.length) return [];
  const hits: Hit[] = [];
  for (const d of docs) {
    let heading = "";
    const lines = d.text.split("\n");
    lines.forEach((l, i) => {
      const isHeading = /^#{1,6}\s/.test(l);
      if (isHeading) heading = l.replace(/^#+\s*/, "");
      const low = l.toLowerCase();
      if (!words.every((w) => low.includes(w))) return;
      const score = (isHeading ? 5 : 1) + words.reduce((n, w) => n + (low.split(w).length - 1), 0) + (d.path.toLowerCase().includes(words[0]) ? 2 : 0);
      const at = Math.max(0, low.indexOf(words[0]) - 60);
      hits.push({ path: d.path, line: i + 1, heading, snippet: l.slice(at, at + 200).replace(/[*`]/g, "").trim(), score });
    });
  }
  return hits.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path) || a.line - b.line).slice(0, limit);
}

export interface Block {
  kind: "h" | "p" | "li" | "code" | "table";
  level?: number;
  text: string;
  rows?: string[][];
}

/** A small, safe Markdown reader (no HTML is ever injected): headings, paragraphs, list items,
 * code fences and tables. */
export function toBlocks(md: string): Block[] {
  const out: Block[] = [];
  const lines = md.split("\n");
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (l.trim().startsWith("```")) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) body.push(lines[i++]);
      out.push({ kind: "code", text: body.join("\n") });
      i++;
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(l);
    if (h) {
      out.push({ kind: "h", level: h[1].length, text: h[2] });
    } else if (l.trim().startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        const cells = lines[i].trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
        if (!cells.every((c) => /^:?-+:?$/.test(c))) rows.push(cells);
        i++;
      }
      out.push({ kind: "table", text: "", rows });
      continue;
    } else if (/^\s*([-*]|\d+[.)])\s+/.test(l)) {
      out.push({ kind: "li", level: l.search(/\S/) >= 2 ? 2 : 1, text: l.replace(/^\s*([-*]|\d+[.)])\s+/, "") });
    } else if (l.trim()) {
      const last = out[out.length - 1];
      if (last?.kind === "p") last.text += " " + l.trim();
      else out.push({ kind: "p", text: l.trim() });
    }
    i++;
  }
  return out;
}

/** Inline Markdown to plain segments: bold and code are marked, links keep their text. */
export function inline(text: string): { t: string; b?: boolean; c?: boolean }[] {
  const out: { t: string; b?: boolean; c?: boolean }[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ t: text.slice(last, m.index) });
    const s = m[0];
    if (s.startsWith("**")) out.push({ t: s.slice(2, -2), b: true });
    else if (s.startsWith("`")) out.push({ t: s.slice(1, -1), c: true });
    else out.push({ t: s.slice(1, s.indexOf("]")) });
    last = m.index + s.length;
  }
  if (last < text.length) out.push({ t: text.slice(last) });
  return out;
}
