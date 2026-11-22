// Lean "Readability-style" extraction: find the main content and turn it into Markdown.
//
// `readablePage` is injected with chrome.scripting.executeScript({ func: readablePage }), which
// serialises the function on its own, so everything it needs is defined inside it. It touches
// only a tiny DOM surface (nodeType, tagName, childNodes, nodeValue, getAttribute, body, title,
// location) so tests can run it against a hand-built tree.
//
// mode: "page" (main content), "selection" (the user's selection), or "node" (tests).

export function readablePage(maxBytes, mode, docArg, nodeArg) {
  const doc = docArg || globalThis.document;
  const SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "NAV", "FOOTER", "ASIDE", "FORM", "BUTTON", "SVG", "IFRAME", "TEMPLATE", "INPUT", "SELECT", "TEXTAREA", "CANVAS", "VIDEO", "AUDIO", "DIALOG"]);
  const BLOCK = new Set(["P", "DIV", "SECTION", "ARTICLE", "MAIN", "HEADER", "FIGURE", "FIGCAPTION", "DL", "DT", "DD", "ADDRESS", "DETAILS", "SUMMARY"]);
  const base = (doc.location && doc.location.href) || "";

  const tag = (n) => (n.tagName || "").toUpperCase();
  const attr = (n, a) => (n.getAttribute ? n.getAttribute(a) : null);
  const kids = (n) => Array.from(n.childNodes || []);
  const hidden = (n) => attr(n, "hidden") !== null || attr(n, "aria-hidden") === "true" || /display:\s*none/i.test(attr(n, "style") || "");

  const abs = (u) => {
    if (!u) return null;
    try {
      const p = new URL(u, base || undefined);
      return p.protocol === "http:" || p.protocol === "https:" ? p.href : null;
    } catch {
      return null;
    }
  };

  const textOf = (n) => {
    if (n.nodeType === 3) return n.nodeValue || "";
    if (n.nodeType !== 1 || SKIP.has(tag(n))) return "";
    return kids(n).map(textOf).join("");
  };

  // --- pick the main content --------------------------------------------------------------
  function findMain(root) {
    let best = null;
    const walk = (n) => {
      if (best || n.nodeType !== 1) return;
      const t = tag(n);
      if (t === "ARTICLE" || t === "MAIN" || attr(n, "role") === "main") {
        best = n;
        return;
      }
      kids(n).forEach(walk);
    };
    walk(root);
    if (best && textOf(best).trim().length > 200) return best;

    // Score: paragraphs credit their parent fully and grandparent by half.
    const scores = new Map();
    const parents = new Map();
    const visit = (n, parent) => {
      if (n.nodeType !== 1) return;
      parents.set(n, parent);
      if (SKIP.has(tag(n)) || hidden(n)) return;
      if (tag(n) === "P" || tag(n) === "PRE" || tag(n) === "LI") {
        const len = textOf(n).trim().length;
        if (len > 25) {
          const p = parent;
          const g = p ? parents.get(p) : null;
          if (p) scores.set(p, (scores.get(p) || 0) + len);
          if (g) scores.set(g, (scores.get(g) || 0) + len / 2);
        }
      }
      kids(n).forEach((k) => visit(k, n));
    };
    visit(root, null);
    let top = null;
    let topScore = 0;
    for (const [n, s] of scores) {
      if (s > topScore) {
        top = n;
        topScore = s;
      }
    }
    return top || best || root;
  }

  // --- markdown ---------------------------------------------------------------------------
  const esc = (s) => s.replace(/([*_`\\])/g, "\\$1");

  function inline(n, inPre) {
    if (n.nodeType === 3) {
      const v = n.nodeValue || "";
      return inPre ? v : esc(v.replace(/\s+/g, " "));
    }
    if (n.nodeType !== 1 || SKIP.has(tag(n)) || hidden(n)) return "";
    const t = tag(n);
    const inner = () => kids(n).map((k) => inline(k, inPre)).join("");
    switch (t) {
      case "BR":
        return "  \n";
      case "STRONG":
      case "B": {
        const s = inner().trim();
        return s ? `**${s}**` : "";
      }
      case "EM":
      case "I": {
        const s = inner().trim();
        return s ? `*${s}*` : "";
      }
      case "CODE":
        return inPre ? textOf(n) : "`" + textOf(n).replace(/`/g, "'") + "`";
      case "A": {
        const s = inner().trim();
        const href = abs(attr(n, "href"));
        return href && s ? `[${s}](${href})` : s;
      }
      case "IMG": {
        const src = abs(attr(n, "src"));
        const alt = (attr(n, "alt") || "").replace(/[[\]]/g, "");
        return src ? `![${alt}](${src})` : "";
      }
      default:
        return inner();
    }
  }

  function block(n, out, depth) {
    if (n.nodeType === 3) {
      const v = (n.nodeValue || "").replace(/\s+/g, " ");
      if (v.trim()) out.push({ inline: esc(v) });
      return;
    }
    if (n.nodeType !== 1 || SKIP.has(tag(n)) || hidden(n)) return;
    const t = tag(n);
    if (/^H[1-6]$/.test(t)) {
      const s = inline(n).trim();
      if (s) out.push({ block: "#".repeat(Number(t[1])) + " " + s });
      return;
    }
    if (t === "P") {
      const s = inline(n).trim();
      if (s) out.push({ block: s });
      return;
    }
    if (t === "PRE") {
      out.push({ block: "```\n" + textOf(n).replace(/\n+$/, "") + "\n```" });
      return;
    }
    if (t === "BLOCKQUOTE") {
      const inner = [];
      kids(n).forEach((k) => block(k, inner, depth));
      const s = flush(inner).split("\n").map((l) => "> " + l).join("\n");
      if (s.trim() !== ">") out.push({ block: s });
      return;
    }
    if (t === "UL" || t === "OL") {
      const lines = [];
      let i = 1;
      for (const li of kids(n)) {
        if (li.nodeType !== 1 || tag(li) !== "LI") continue;
        const nested = [];
        const own = [];
        for (const k of kids(li)) {
          if (k.nodeType === 1 && (tag(k) === "UL" || tag(k) === "OL")) block(k, nested, depth + 1);
          else own.push(inline(k));
        }
        const bullet = t === "OL" ? `${i++}.` : "-";
        lines.push("  ".repeat(depth) + bullet + " " + own.join("").trim());
        for (const x of nested) lines.push(x.block);
      }
      if (lines.length) out.push({ block: lines.join("\n"), list: depth > 0 });
      return;
    }
    if (t === "TABLE") {
      const rows = [];
      const collect = (x) => {
        for (const k of kids(x)) {
          if (k.nodeType !== 1) continue;
          if (tag(k) === "TR") rows.push(kids(k).filter((c) => c.nodeType === 1 && (tag(c) === "TD" || tag(c) === "TH")).map((c) => inline(c).trim().replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ")));
          else if (["THEAD", "TBODY", "TFOOT"].includes(tag(k))) collect(k);
        }
      };
      collect(n);
      if (rows.length) {
        const w = Math.max(...rows.map((r) => r.length));
        const pad = (r) => r.concat(Array(w - r.length).fill(""));
        const md = [
          "| " + pad(rows[0]).join(" | ") + " |",
          "| " + Array(w).fill("---").join(" | ") + " |",
          ...rows.slice(1).map((r) => "| " + pad(r).join(" | ") + " |"),
        ];
        out.push({ block: md.join("\n") });
      }
      return;
    }
    if (t === "HR") {
      out.push({ block: "---" });
      return;
    }
    if (t === "IMG" || t === "A" || t === "STRONG" || t === "B" || t === "EM" || t === "I" || t === "CODE" || t === "SPAN" || t === "BR") {
      const s = inline(n);
      if (s.trim()) out.push({ inline: s });
      return;
    }
    // Generic container: recurse, then close the paragraph.
    kids(n).forEach((k) => block(k, out, depth));
    if (BLOCK.has(t)) out.push({ break: true });
  }

  function flush(parts) {
    const blocks = [];
    let para = "";
    const end = () => {
      if (para.trim()) blocks.push(para.trim());
      para = "";
    };
    for (const p of parts) {
      if (p.block !== undefined) {
        end();
        blocks.push(p.block);
      } else if (p.inline !== undefined) para += p.inline;
      else if (p.break) end();
    }
    end();
    return blocks.join("\n\n");
  }

  let root;
  let selText = "";
  if (mode === "selection") {
    const sel = globalThis.getSelection ? globalThis.getSelection() : null;
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return { title: (doc.title || "").trim(), url: base, markdown: "", text: "", truncated: false };
    selText = sel.toString();
    root = doc.createElement("div");
    root.appendChild(sel.getRangeAt(0).cloneContents());
  } else if (mode === "node" && nodeArg) {
    root = nodeArg;
  } else {
    root = findMain(doc.body || doc);
  }
  const parts = [];
  block(root, parts, 0);
  let markdown = flush(parts).replace(/\n{3,}/g, "\n\n").trim();

  const enc = new TextEncoder();
  let truncated = false;
  if (maxBytes && enc.encode(markdown).length > maxBytes) {
    truncated = true;
    let lo = 0;
    let hi = markdown.length;
    const budget = maxBytes - 64;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (enc.encode(markdown.slice(0, mid)).length <= budget) lo = mid;
      else hi = mid - 1;
    }
    markdown = markdown.slice(0, lo) + "\n\n… (page trimmed to fit)";
  }
  return { title: (doc.title || "").trim(), url: base, markdown: markdown || selText, text: selText, truncated };
}
