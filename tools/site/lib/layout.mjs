// Page shell shared by every generated page: the slim glass header (logo, centred nav with a sliding
// indicator, the appearance popover built by js/site.js, GitHub with its stars, a Download button that
// appears once the hero's scrolls away), the footer, the Lens Guide orb and meta tags.
import { esc } from "./markdown.mjs";

export const REPO = "https://github.com/orionopenwow/LensUI";
export const SITE_URL = "https://orionopenwow.github.io/LensUI/";
const NAV = [["", "Home"], ["#features", "Features"], ["docs/", "Docs"], ["download.html", "Download"], ["test.html", "Testers"]];
let STARS = null;
/** GitHub stars, read at build time (null when offline: the header shows the icon alone). */
export const setStars = (n) => { STARS = Number.isFinite(n) ? n : null; };
const fmt = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n));
const GH = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.9 1.52 2.34 1.08 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.6 9.6 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.69-4.57 4.93.36.31.68.92.68 1.86v2.75c0 .27.18.58.69.48A10 10 0 0 0 12 2z"/></svg>`;
const MENU = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>`;

// Runs before first paint (dark unless the visitor picked otherwise) so the notch choices (mode, accent, pack colours, density,
// text size, motion) don't flash. Mirrors apply() in docs/site/js/site.js.
const PREPAINT = `(function(){var r=document.documentElement,p={};try{p=JSON.parse(localStorage.getItem("lens-site")||"{}")||{}}catch(e){}var m=p.mode||"dark",s=m==="auto"?(matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"):m;if(p.accent==="pack"&&p.pack){s=p.pack.scheme;for(var k in p.pack.vars)r.style.setProperty(k,p.pack.vars[k])}r.dataset.scheme=s;r.dataset.accent=p.accent||"rainbow";r.dataset.density=p.density||"comfortable";if(p.size)r.style.setProperty("--text-scale",p.size);if(p.motion&&p.motion!=="auto")r.dataset.motion=p.motion})()`;

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
    const cur = href.startsWith("#") ? false : href === "" ? here === "" : here.startsWith(href);
    return `<a href="${base}${href}"${cur ? ' aria-current="page"' : ""}>${label}</a>`;
  }).join("");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title ? `${title} — Lens` : "Lens — the everything desktop")}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:title" content="${esc(title || "Lens")}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${SITE_URL}${path.replace(/index\.html$/, "")}">
<meta property="og:image" content="${SITE_URL}brand/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="The Lens logo, a silver lens holding a rainbow nebula, beside the words: Lens, the everything desktop">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${SITE_URL}brand/og.png">
<meta name="theme-color" content="#0b0b0d" media="(prefers-color-scheme: dark)">
<meta name="theme-color" content="#fafaf7" media="(prefers-color-scheme: light)">
<link rel="icon" href="${base}brand/favicon.ico" sizes="16x16 32x32 48x48">
<link rel="icon" href="${base}brand/lens-logo-small.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="${base}brand/apple-touch-icon.png">
<script>${PREPAINT}</script>
<link rel="stylesheet" href="${base}css/site.css">
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="bar" id="bar">
  <div class="inner bar-grid">
    <a class="mark" href="${base}" aria-label="Lens home"><img class="mark-logo" src="${base}brand/lens-logo-small.svg" alt="" width="28" height="28">Lens</a>
    <nav id="site-nav" class="site-nav" aria-label="Site"><span class="nav-ind" aria-hidden="true"></span>${nav}</nav>
    <div class="end">
      <span class="theme-slot" id="theme-slot"></span>
      <a class="gh" href="${REPO}" aria-label="Lens on GitHub${STARS != null ? `, ${STARS} stars` : ""}">${GH}${STARS != null ? `<span class="stars" aria-hidden="true">${fmt(STARS)}</span>` : ""}</a>
      <a class="btn small primary bar-dl" href="${base}download.html" data-dl><span class="lbl">Download</span></a>
      <button id="menu-btn" class="menu-btn" type="button" aria-label="Menu" aria-expanded="false" aria-controls="site-nav">${MENU}</button>
    </div>
  </div>
</header>
<main id="main">
${body}
</main>
<footer class="site">
  <div class="inner foot-grid">
    <div class="foot-brand"><img src="${base}brand/lens-logo-small.svg" alt="" width="28" height="28"><div><b>Lens</b><span>The everything desktop · Browser · Music · Cleaner · Backdrop Lab · Apps · open source (MIT)</span></div></div>
    <nav aria-label="Footer"><a href="${base}docs/">Docs</a><a href="${base}download.html">Download</a><a href="${base}download.html#platforms">Platforms</a><a href="${base}test.html">Testers</a><a href="${REPO}">GitHub</a><a href="${REPO}/issues">Issues</a></nav>
    <p class="fine">Windows 10 &amp; 11 today · macOS &amp; Linux on the roadmap. Not affiliated with Microsoft, Apple or Anthropic. Third-party names and logos belong to their owners; shown to illustrate apps you might pin. Brand icons from <a href="https://simpleicons.org">Simple Icons</a> (CC0).</p>
  </div>
</footer>
<button id="guide-orb" class="guide-orb" type="button" aria-controls="guide-window" aria-expanded="false" aria-label="Ask Lens, the guide (press /)"><span class="orb-logo" aria-hidden="true"><span class="orb-glass"><span class="lens-cloud" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></span></span><img class="orb-ov" src="${base}brand/lens-logo-overlay.svg" alt="" width="60" height="60"></span><span class="orb-lbl" aria-hidden="true">Ask Lens <kbd>/</kbd></span></button>
<script type="module" src="${base}js/site.js"></script>
<script type="module" src="${base}js/logo.js"></script>
${scripts.map((s) => `<script type="module" src="${base}${s}"></script>`).join("\n")}
</body>
</html>
`;
}
