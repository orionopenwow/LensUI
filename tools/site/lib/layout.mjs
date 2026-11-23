// Page shell shared by every generated page: header with the spectrum line, the notch (built by
// js/site.js), footer, the Guide button and meta tags.
import { esc } from "./markdown.mjs";

export const REPO = "https://github.com/orionopenwow/LensUI";
const NAV = [["", "Home"], ["docs/", "Docs"], ["download.html", "Download"], ["test.html", "Testers"]];
const MENU = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>`;

// Runs before first paint so the visitor's notch choices (mode, accent, pack colours, density,
// text size, motion) don't flash. Mirrors apply() in docs/site/js/site.js.
const PREPAINT = `(function(){var r=document.documentElement,p={};try{p=JSON.parse(localStorage.getItem("lens-site")||"{}")||{}}catch(e){}var m=p.mode||"auto",s=m==="auto"?(matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"):m;if(p.accent==="pack"&&p.pack){s=p.pack.scheme;for(var k in p.pack.vars)r.style.setProperty(k,p.pack.vars[k])}r.dataset.scheme=s;r.dataset.accent=p.accent||"rainbow";r.dataset.density=p.density||"comfortable";if(p.size)r.style.setProperty("--text-scale",p.size);if(p.motion&&p.motion!=="auto")r.dataset.motion=p.motion})()`;

/**
 * @param {object} o
 * @param {string} o.title   page title (without the site name); "" for home
 * @param {string} o.desc    meta description
 * @param {string} o.body    main HTML
 * @param {string} o.path    output path relative to the site root, e.g. "docs/x.html"
 * @param {string[]} [o.scripts]  extra module scripts (site-relative)
 */
export function page({ title, desc, body, path, scripts = [] }) {
  const depth = path.split("/").length - 1;
  const base = depth ? "../".repeat(depth) : "./";
  const here = path.replace(/index\.html$/, "");
  const nav = NAV.map(([href, label]) => {
    const cur = href === "" ? here === "" : here.startsWith(href);
    return `<a href="${base}${href}"${cur ? ' aria-current="page"' : ""}>${label}</a>`;
  }).join("");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title ? `${title} — Lens UI` : "Lens UI — a calmer desktop for Windows")}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:title" content="${esc(title || "Lens UI")}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${base}media/dock-magnify.webp">
<meta name="theme-color" content="#0b0b0d">
<link rel="icon" href="${base}assets/lens.svg" type="image/svg+xml">
<script>${PREPAINT}</script>
<link rel="stylesheet" href="${base}css/site.css">
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="bar">
  <div class="inner">
    <a class="mark" href="${base}" aria-label="Lens UI home"><i aria-hidden="true"></i>Lens UI</a>
    <nav id="site-nav" aria-label="Site">${nav}</nav>
    <div class="end">
      <a class="btn small gh" href="${REPO}">GitHub</a>
      <button id="menu-btn" class="menu-btn" type="button" aria-label="Menu" aria-expanded="false" aria-controls="site-nav">${MENU}</button>
    </div>
  </div>
  <hr class="spectrum-line" aria-hidden="true">
</header>
<main id="main">
${body}
</main>
<footer class="site">
  <div class="inner">
    <p>Lens UI · MIT · not affiliated with Microsoft or Anthropic</p>
    <nav aria-label="Footer"><a href="${REPO}">GitHub</a><a href="${REPO}/issues">Issues</a><a href="${base}docs/">Docs</a><a href="${base}download.html">Download</a><a href="${base}test.html">Testers</a></nav>
  </div>
</footer>
<button id="guide-fab" class="guide-fab" type="button" aria-controls="guide-panel" aria-expanded="false"><span class="q" aria-hidden="true">?</span>Guide <kbd>/</kbd></button>
<script type="module" src="${base}js/site.js"></script>
${scripts.map((s) => `<script type="module" src="${base}${s}"></script>`).join("\n")}
</body>
</html>
`;
}
