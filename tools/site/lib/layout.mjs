// Page shell shared by every generated page: header, footer, Guide button, meta tags.
import { esc } from "./markdown.mjs";

export const REPO = "https://github.com/orionopenwow/LensUI";
const NAV = [
  ["features.html", "Features"],
  ["try.html", "Try it"],
  ["docs/", "Docs"],
  ["vision.html", "Vision"],
  ["changelog.html", "Changelog"],
  ["test.html", "Testers"],
];

const LOGO = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.2" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="4.2" fill="currentColor"/></svg>`;
const SUN = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>`;
const MENU = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>`;

/**
 * @param {object} o
 * @param {string} o.title     page title (without the site name)
 * @param {string} o.desc      meta description
 * @param {string} o.body      main HTML
 * @param {string} o.path      output path relative to the site root, e.g. "docs/x.html"
 * @param {string[]} [o.scripts]  extra module scripts (site-relative)
 * @param {string} [o.mainClass]
 */
export function page({ title, desc, body, path, scripts = [], mainClass = "" }) {
  const depth = path.split("/").length - 1;
  const base = depth ? "../".repeat(depth) : "./";
  const here = path.replace(/index\.html$/, "");
  const nav = NAV.map(([href, label]) => {
    const cur = here === href || (href.endsWith("/") && here.startsWith(href));
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
<meta name="theme-color" content="#09090b">
<link rel="icon" href="${base}assets/lens.svg" type="image/svg+xml">
<link rel="stylesheet" href="${base}css/site.css">
<script>try{var t=localStorage.getItem("lens-site-theme");if(t)document.documentElement.dataset.theme=t}catch(e){}</script>
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="bar">
  <div class="inner">
    <a class="mark" href="${base}" aria-label="Lens UI home">${LOGO} Lens UI</a>
    <nav id="site-nav" aria-label="Site">${nav}</nav>
    <div class="end">
      <a class="btn small" href="${REPO}"><span class="gh-text">GitHub</span><span class="sr"> (opens the repository)</span>↗</a>
      <button id="theme-btn" class="icon-btn" type="button" aria-label="Colour theme">${SUN}</button>
      <button id="menu-btn" class="icon-btn menu-btn" type="button" aria-label="Menu" aria-expanded="false" aria-controls="site-nav">${MENU}</button>
    </div>
  </div>
</header>
<main id="main" class="${mainClass}">
${body}
</main>
<footer class="site">
  <div class="inner">
    <div>
      <p style="margin:0 0 6px;color:var(--fg-2)">Lens UI is free and open source (MIT). Not affiliated with Microsoft or Anthropic.</p>
      <p class="meta" style="margin:0">Clips and demos on this site are rendered from the real Lens frontend in your browser; the Windows side is simulated.</p>
    </div>
    <ul>
      <li><a href="${REPO}">GitHub</a></li>
      <li><a href="${REPO}/releases">Releases</a></li>
      <li><a href="${REPO}/issues">Issues</a></li>
      <li><a href="${base}docs/">Docs</a></li>
      <li><a href="${base}test.html">Testers</a></li>
    </ul>
  </div>
</footer>
<button id="guide-fab" class="guide-fab" type="button" aria-controls="guide-panel" aria-expanded="false"><span aria-hidden="true">?</span> Ask the Guide <kbd>/</kbd></button>
<script type="module" src="${base}js/site.js"></script>
${scripts.map((s) => `<script type="module" src="${base}${s}"></script>`).join("\n")}
</body>
</html>
`;
}
