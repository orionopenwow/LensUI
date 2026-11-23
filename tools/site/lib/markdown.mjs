// A small, dependency-free markdown renderer for the website (headings with ids, paragraphs,
// lists with task boxes, code blocks, tables, quotes, links, images). Moved from build-docs.mjs.
export const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

let linkTarget = (href) => href;
/** Lets the caller map repository-relative links (./foo.md) to site pages or GitHub URLs. */
export function setLinkResolver(fn) { linkTarget = fn; }

function inline(s) {
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
  s = esc(s);
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g, (_, alt, src) => `<img src="${esc(linkTarget(src).replace("/blob/", "/raw/"))}" alt="${alt}" loading="lazy">`);
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)[^)]*\)/g, (_, t, h) => `<a href="${esc(linkTarget(h.replace(/&amp;/g, "&")))}">${t}</a>`);
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");
  s = s.replace(/(^|[\s(])_([^_\s][^_]*)_(?=[\s).,;:]|$)/g, "$1<em>$2</em>");
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${esc(codes[+i])}</code>`);
}

export const slugify = (t) => t.toLowerCase().replace(/<[^>]+>/g, "").replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-");

export function render(md) {
  const lines = md.replace(/\r/g, "").split("\n");
  const html = [];
  let i = 0;
  const isBlockStart = (l) => /^(#{1,6}\s|```|>|\s*([-*+]|\d+[.)])\s|\|)/.test(l) || /^(-{3,}|\*{3,}|_{3,})\s*$/.test(l);
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    let m;
    if ((m = l.match(/^```\s*(\S*)/))) {
      const buf = []; i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      html.push(`<pre><code${m[1] ? ` class="lang-${esc(m[1])}"` : ""}>${esc(buf.join("\n"))}</code></pre>`);
    } else if ((m = l.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/))) {
      const n = Math.min(6, m[1].length + 0); const text = inline(m[2]);
      html.push(`<h${n} id="${slugify(m[2])}">${text}</h${n}>`); i++;
    } else if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(l)) { html.push("<hr>"); i++; }
    else if (/^>/.test(l)) {
      const buf = [];
      while (i < lines.length && /^>/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ""));
      html.push(`<blockquote>${render(buf.join("\n"))}</blockquote>`);
    } else if (/^\|/.test(l) && i + 1 < lines.length && /^\|?\s*:?-{2,}/.test(lines[i + 1])) {
      const row = (r) => r.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const head = row(l); i += 2; const body = [];
      while (i < lines.length && /^\|/.test(lines[i])) body.push(row(lines[i++]));
      html.push(`<div class="table"><table><thead><tr>${head.map((h) => `<th>${inline(h)}</th>`).join("")}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`);
    } else if (/^\s*([-*+]|\d+[.)])\s/.test(l)) {
      i = list(lines, i, html);
    } else {
      const buf = [];
      while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) buf.push(lines[i++].trim());
      if (!buf.length) buf.push(lines[i++].trim());
      html.push(`<p>${inline(buf.join(" "))}</p>`);
    }
  }
  return html.join("\n");
}

function list(lines, i, html) {
  const indent = lines[i].match(/^\s*/)[0].length;
  const ordered = /^\s*\d+[.)]\s/.test(lines[i]);
  html.push(ordered ? "<ol>" : "<ul>");
  while (i < lines.length) {
    const l = lines[i];
    const ind = l.match(/^\s*/)[0].length;
    if (!l.trim()) {
      const next = lines.slice(i + 1).find((x) => x.trim());
      if (next && next.match(/^\s*/)[0].length >= indent && /^\s*([-*+]|\d+[.)])\s/.test(next)) { i++; continue; }
      break;
    }
    if (ind < indent) break;
    if (ind > indent && /^\s*([-*+]|\d+[.)])\s/.test(l)) {
      html[html.length - 1] = html[html.length - 1].replace(/<\/li>$/, "");
      i = list(lines, i, html); html.push("</li>"); continue;
    }
    const m = l.match(/^\s*(?:[-*+]|\d+[.)])\s+(.*)$/);
    if (!m) {
      if (ind > indent) { html[html.length - 1] = html[html.length - 1].replace(/<\/li>$/, " " + inline(l.trim()) + "</li>"); i++; continue; }
      break;
    }
    let text = m[1].replace(/^\[( |x)\]\s+/i, (_, x) => (x.trim() ? "☑ " : "☐ "));
    html.push(`<li>${inline(text)}</li>`); i++;
  }
  html.push(ordered ? "</ol>" : "</ul>");
  return i;
}

