/**
 * Small, safe Markdown renderer for AI answers. Builds React elements (never innerHTML), so model output
 * can't inject markup. Supports: paragraphs, # headings, bullet and numbered lists, "- [ ]" tasks,
 * fenced code blocks (with a copy button), `inline code`, **bold**, *italic* and [links](url).
 * Unfinished constructs while streaming (an open ``` fence) render as code so text doesn't jump.
 */
import React from "react";

export type MdBlock =
  | { t: "p"; text: string }
  | { t: "h"; level: number; text: string }
  | { t: "ul"; items: { text: string; task?: boolean; done?: boolean }[] }
  | { t: "ol"; items: string[] }
  | { t: "code"; lang: string; text: string; open: boolean };

/** Pure parser, exported for tests. */
export function parseBlocks(src: string): MdBlock[] {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const out: MdBlock[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) out.push({ t: "p", text: para.join(" ") });
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = line.match(/^\s*```\s*([\w+-]*)\s*$/);
    if (fence) {
      flush();
      const body: string[] = [];
      let j = i + 1;
      while (j < lines.length && !/^\s*```\s*$/.test(lines[j])) body.push(lines[j++]);
      out.push({ t: "code", lang: fence[1] || "", text: body.join("\n"), open: j >= lines.length });
      i = j;
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      flush();
      out.push({ t: "h", level: h[1].length, text: h[2] });
      continue;
    }
    const ul = line.match(/^\s*[-*•]\s+(.*)$/);
    if (ul) {
      flush();
      const task = ul[1].match(/^\[( |x|X)\]\s+(.*)$/);
      const item = task ? { text: task[2], task: true, done: task[1].toLowerCase() === "x" } : { text: ul[1] };
      const last = out[out.length - 1];
      if (last?.t === "ul") last.items.push(item);
      else out.push({ t: "ul", items: [item] });
      continue;
    }
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (ol) {
      flush();
      const last = out[out.length - 1];
      if (last?.t === "ol") last.items.push(ol[1]);
      else out.push({ t: "ol", items: [ol[1]] });
      continue;
    }
    para.push(line.trim());
  }
  flush();
  return out;
}

type Inline = { t: "text" | "code" | "b" | "i"; v: string } | { t: "a"; v: string; href: string };

/** Pure inline tokenizer, exported for tests. */
export function parseInline(s: string): Inline[] {
  const out: Inline[] = [];
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\[[^\]]+\]\((https?:\/\/[^)\s]+)\))|(\*[^*\s][^*]*\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push({ t: "text", v: s.slice(last, m.index) });
    if (m[1]) out.push({ t: "code", v: m[1].slice(1, -1) });
    else if (m[2]) out.push({ t: "b", v: m[2].slice(2, -2) });
    else if (m[3]) out.push({ t: "a", v: m[3].slice(1, m[3].indexOf("]")), href: m[4] });
    else if (m[5]) out.push({ t: "i", v: m[5].slice(1, -1) });
    last = re.lastIndex;
  }
  if (last < s.length) out.push({ t: "text", v: s.slice(last) });
  return out;
}

function InlineText({ s, onOpenLink }: { s: string; onOpenLink?: (url: string) => void }) {
  return (
    <>
      {parseInline(s).map((n, i) => {
        if (n.t === "code") return <code key={i} className="md-code">{n.v}</code>;
        if (n.t === "b") return <strong key={i}>{n.v}</strong>;
        if (n.t === "i") return <em key={i}>{n.v}</em>;
        if (n.t === "a")
          return (
            <button key={i} type="button" className="md-link" onClick={() => onOpenLink?.(n.href)} aria-label={`${n.v} (${n.href})`}>
              {n.v}
            </button>
          );
        return <React.Fragment key={i}>{n.v}</React.Fragment>;
      })}
    </>
  );
}

export const MarkdownLite: React.FC<{
  text: string;
  onCopy?: (text: string) => void;
  onOpenLink?: (url: string) => void;
}> = ({ text, onCopy, onOpenLink }) => {
  const blocks = parseBlocks(text);
  return (
    <div className="md">
      {blocks.map((b, i) => {
        if (b.t === "p") return <p key={i}><InlineText s={b.text} onOpenLink={onOpenLink} /></p>;
        if (b.t === "h") {
          const Tag = (b.level <= 2 ? "h4" : "h5") as "h4" | "h5";
          return <Tag key={i}><InlineText s={b.text} onOpenLink={onOpenLink} /></Tag>;
        }
        if (b.t === "ul")
          return (
            <ul key={i}>
              {b.items.map((it, j) => (
                <li key={j} className={it.task ? "md-task" : undefined}>
                  {it.task && <span className={`md-check ${it.done ? "done" : ""}`} aria-hidden="true" />}
                  <InlineText s={it.text} onOpenLink={onOpenLink} />
                </li>
              ))}
            </ul>
          );
        if (b.t === "ol")
          return (
            <ol key={i}>
              {b.items.map((it, j) => (
                <li key={j}><InlineText s={it} onOpenLink={onOpenLink} /></li>
              ))}
            </ol>
          );
        return (
          <div key={i} className="md-pre">
            <div className="md-pre-head">
              <span>{b.lang || "text"}</span>
              {onCopy && !b.open && (
                <button type="button" className="md-pre-copy" onClick={() => onCopy(b.text)}>
                  Copy
                </button>
              )}
            </div>
            <pre><code>{b.text}</code></pre>
          </div>
        );
      })}
    </div>
  );
};
