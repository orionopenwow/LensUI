// Renders a few repository markdown docs to plain HTML pages under docs/site/docs/.
// No dependencies: a small markdown subset (headings, paragraphs, lists, code, tables, quotes, links).
// Usage: node tools/site/build-docs.mjs
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const out = join(root, "docs", "site", "docs");
const REPO = "https://github.com/orionopenwow/lensui/blob/main/";

const DOCS = [
  { src: "DESIGN.md", slug: "design", title: "Design system", blurb: "Colours, type, geometry and motion rules every surface follows." },
  { src: "docs/ROADMAP.md", slug: "roadmap", title: "Roadmap", blurb: "What is built, what is next and what is deliberately out of scope." },
  { src: "docs/SHELL_MODE.md", slug: "shell-mode", title: "Shell mode", blurb: "Running Lens instead of Explorer, and how to get back." },
  { src: "docs/PLUGINS.md", slug: "plugins", title: "Plugins", blurb: "The sandboxed plugin format, permissions and API." },
  { src: "docs/MCP.md", slug: "mcp", title: "MCP server", blurb: "Letting AI apps on your machine control windows and themes." },
];

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function linkTarget(href) {
  if (/^(https?:|mailto:|#)/.test(href)) return href;
  const [path, hash] = href.split("#");
  const clean = path.replace(/^\.\//, "").replace(/^\.\.\//, "");
  const doc = DOCS.find((d) => d.src === clean || d.src === "docs/" + clean || d.src.endsWith("/" + clean));
  if (doc) return doc.slug + ".html" + (hash ? "#" + hash : "");
  const base = clean.startsWith("docs/") || clean.startsWith("src") || clean.includes("/") ? clean : clean;
  return REPO + base + (hash ? "#" + hash : "");
}

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

const slugify = (t) => t.toLowerCase().replace(/<[^>]+>/g, "").replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-");

function render(md) {
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

const page = (title, body, desc) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} — Lens UI</title>
<meta name="description" content="${esc(desc)}">
<meta name="theme-color" content="#09090b">
<link rel="icon" href="../assets/lens.svg" type="image/svg+xml">
<link rel="stylesheet" href="../styles.css">
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="bar">
  <a class="mark" href="../" aria-label="Lens UI home"><img src="../assets/lens.svg" alt="" width="16" height="16"> Lens UI</a>
  <nav aria-label="Docs">
${DOCS.map((d) => `    <a href="${d.slug}.html">${d.title}</a>`).join("\n")}
  </nav>
  <a class="bar-link" href="https://github.com/orionopenwow/lensui">GitHub</a>
</header>
<main id="main" class="doc">
${body}
</main>
<footer><div class="inner"><span>Generated from the repository's markdown. Edit the source on <a href="https://github.com/orionopenwow/lensui">GitHub</a>.</span></div></footer>
</body>
</html>
`;

mkdirSync(out, { recursive: true });
for (const d of DOCS) {
  const md = readFileSync(join(root, d.src), "utf8");
  const body = render(md) + `\n<p class="src">Source: <a href="${REPO}${d.src}">${d.src}</a></p>`;
  writeFileSync(join(out, d.slug + ".html"), page(d.title, body, d.blurb));
}
const index = `<h1>Documentation</h1>
<p class="lede">Reference docs from the Lens UI repository. The README covers installing and running.</p>
<ul class="doclist">
${DOCS.map((d) => `<li><a href="${d.slug}.html">${d.title}</a><span>${esc(d.blurb)}</span></li>`).join("\n")}
<li><a href="https://github.com/orionopenwow/lensui#readme">README</a><span>Status, building from source and shortcuts.</span></li>
</ul>`;
writeFileSync(join(out, "index.html"), page("Documentation", index, "Lens UI reference documentation."));
console.log(`wrote ${DOCS.length + 1} pages to docs/site/docs/`);
