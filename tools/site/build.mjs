// Builds the GitHub Pages site into docs/site/.
//
//   node tools/site/build.mjs              full build
//   node tools/site/build.mjs --data-only  just docs/site/data/packs.json (for tools/media/record.mjs)
//   node tools/site/build.mjs --no-live    skip re-bundling the live widgets (faster while editing)
//
// Inputs: tools/site/content/features.mjs, docs/media/ (clips), docs/guide-for-users/*.md, the
// repository docs, src/themes/packs.ts, the Lens Guide index, docs/tester/LATEST.json (or the
// research/daily branch's copy), docs/VISION.md (or the docs/vision-unified branch's copy) and
// GitHub Releases. Outputs are git-ignored (see docs/site/.gitignore); Pages builds them in CI.
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, copyFileSync, rmSync } from "node:fs";
import { dirname, join, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { render, setLinkResolver, slugify, esc } from "./lib/markdown.mjs";
import { page, REPO } from "./lib/layout.mjs";
import { writePacks } from "./lib/packs.mjs";
import { home, features, tryPage } from "./pages.mjs";
import { FEATURES } from "./content/features.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const site = join(root, "docs/site");
const args = new Set(process.argv.slice(2));
const write = (rel, html) => { const f = join(site, rel); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, html); };
const git = (...a) => { try { return execFileSync("git", ["-C", root, ...a], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); } catch { return null; } };
const read = (p) => (existsSync(join(root, p)) ? readFileSync(join(root, p), "utf8") : null);
const stripComments = (md) => md.replace(/<!--[\s\S]*?-->/g, "");

// ---- data ----------------------------------------------------------------------------------
const packs = await writePacks(join(site, "data/packs.json"));
if (args.has("--data-only")) { console.log(`[site] data/packs.json (${packs.length} packs)`); process.exit(0); }

if (!args.has("--no-live")) {
  const live = await import("./live/build-live.mjs");
  await live.buildDock(); await live.buildPlayground(); await live.buildThemes();
  const g = await live.buildGuide();
  console.log(`[site] live widgets built (guide search from ${g.source})`);
}

// ---- media: copy docs/media into the site (Pages only serves docs/site) --------------------
rmSync(join(site, "media"), { recursive: true, force: true });
mkdirSync(join(site, "media"), { recursive: true });
let clips = [];
if (existsSync(join(root, "docs/media/clips.json"))) {
  clips = JSON.parse(read("docs/media/clips.json")).filter((c) => c.mp4);
  for (const f of readdirSync(join(root, "docs/media"))) if (/\.(mp4|webp|gif|json)$/.test(f)) copyFileSync(join(root, "docs/media", f), join(site, "media", f));
}

// ---- docs ----------------------------------------------------------------------------------
const USER = existsSync(join(root, "docs/guide-for-users")) ? readdirSync(join(root, "docs/guide-for-users")).filter((f) => f.endsWith(".md")) : [];
const userPages = USER.filter((f) => f !== "README.md").map((f) => {
  const md = readFileSync(join(root, "docs/guide-for-users", f), "utf8");
  return { src: `docs/guide-for-users/${f}`, slug: f.replace(/\.md$/, ""), title: (md.match(/^# (.+)$/m) ?? [, f])[1], md };
});
const ORDER = ["first-five-minutes", "make-it-yours", "windows-like-a-pro", "living-desktop", "command-and-shelf", "right-click-everything", "voice-control", "browser-and-approvals", "ai-privacy", "undo-anything", "keyboard-map", "commands-and-shortcuts", "settings-reference"];
const rank = (slug) => (ORDER.includes(slug) ? ORDER.indexOf(slug) : 99);
userPages.sort((a, b) => rank(a.slug) - rank(b.slug));
const REF = [
  ["docs/DOCK_STYLES.md", "Dock styles"], ["docs/WINDOW_STYLING.md", "Window styling"], ["docs/PRODUCTIVITY.md", "Productivity input"],
  ["docs/PLAYGROUND.md", "Playground"], ["docs/CURSORS.md", "Pointer suite"], ["docs/AI.md", "AI core"], ["docs/AI_SURFACES.md", "AI surfaces"],
  ["docs/COMMAND.md", "Lens Command"], ["docs/SHELF.md", "Shelf"], ["docs/BROWSER_BRIDGE.md", "Browser bridge"], ["docs/TRANSCRIPTION.md", "Transcription"],
  ["docs/MCP.md", "MCP server"], ["docs/PLUGINS.md", "Plugins"], ["docs/SHELL_MODE.md", "Shell mode"], ["docs/TESTER_HUB.md", "Tester Hub"],
  ["docs/MASTERPLAN.md", "Master plan"], ["docs/ROADMAP.md", "Roadmap"], ["DESIGN.md", "Design system"], ["docs/media/README.md", "Feature clips"],
].filter(([p]) => existsSync(join(root, p))).map(([src, title]) => ({ src, title, slug: "ref-" + slugify(basename(dirname(src)) === "media" ? "media" : basename(src, ".md")) }));

let linkPrefix = "";
setLinkResolver((href) => {
  if (/^(https?:|mailto:|#)/.test(href)) return href;
  const [p, hash] = href.split("#");
  const clean = p.replace(/^(\.\.?\/)+/, "");
  const all = [...userPages, ...REF];
  const hit = all.find((d) => d.src === clean || d.src.endsWith("/" + clean) || d.src === "docs/" + clean || d.src === "docs/guide-for-users/" + clean);
  if (hit) return `${linkPrefix}${hit.slug}.html${hash ? "#" + hash : ""}`;
  if (clean === "README.md" && p.includes("guide-for-users")) return `${linkPrefix}index.html`;
  return `${REPO}/blob/main/${clean}${hash ? "#" + hash : ""}`;
});

const docNav = (cur) => `<nav class="doc-nav" aria-label="Documentation">
  <a href="index.html"${cur === "index" ? ' aria-current="page"' : ""}>Overview &amp; search</a>
  <p class="nav-h">How-to</p>${userPages.map((d) => `<a href="${d.slug}.html"${cur === d.slug ? ' aria-current="page"' : ""}>${esc(d.title)}</a>`).join("")}
  <p class="nav-h">Reference</p>${REF.map((d) => `<a href="${d.slug}.html"${cur === d.slug ? ' aria-current="page"' : ""}>${esc(d.title)}</a>`).join("")}
</nav>`;
const docPage = (d, body, desc) => page({ title: d.title, desc, path: `docs/${d.slug}.html`, body: `<div class="inner doc-layout">${docNav(d.slug)}<article class="prose">${body}</article></div>` });

const searchDocs = [];
const sections = (d, html) => {
  const parts = html.split(/(?=<h2 id=")/);
  for (const part of parts) {
    const h = part.match(/<h2 id="([^"]+)">([\s\S]*?)<\/h2>/);
    const text = part.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 600);
    searchDocs.push({ id: `${d.slug}#${h?.[1] ?? ""}`, kind: "doc", title: h ? h[2].replace(/<[^>]+>/g, "") : d.title, text, path: ["Docs", d.title], href: `docs/${d.slug}.html${h ? "#" + h[1] : ""}`, source: d.src });
  }
};
for (const d of userPages) {
  const html = render(stripComments(d.md));
  sections(d, html);
  write(`docs/${d.slug}.html`, docPage(d, html + `<p class="src">Generated from <a href="${REPO}/blob/main/${d.src}">${d.src}</a>.</p>`, `Lens UI how-to: ${d.title}.`));
}
for (const d of REF) {
  const html = render(stripComments(read(d.src)));
  sections(d, html);
  write(`docs/${d.slug}.html`, docPage(d, html + `<p class="src">Source: <a href="${REPO}/blob/main/${d.src}">${d.src}</a> (developer reference; some sections describe work in progress).</p>`, `Lens UI reference: ${d.title}.`));
}
write("data/docs-index.json", JSON.stringify({ entries: searchDocs }));
write("docs/index.html", page({
  title: "Docs", desc: "Lens UI how-to guides and reference docs.", path: "docs/index.html", scripts: ["js/docs-search.js"],
  body: `<div class="inner doc-layout">${docNav("index")}<article class="prose">
<h1>Documentation</h1>
<p class="lede">Short how-tos for using Lens, generated from the same data the in-app Guide uses, and the developer reference docs.</p>
<form role="search" id="docs-search" style="display:flex;gap:8px;margin:18px 0 4px"><label class="sr" for="docs-q">Search the docs</label><input id="docs-q" type="search" placeholder="Search the docs: hot corners, undo, voice…" style="flex:1"><button class="btn" type="submit">Search</button></form>
<ul class="search-results" id="docs-results" aria-live="polite"></ul>
<h2 id="how-to">How-to</h2>
<ul class="search-results">${userPages.map((d) => `<li><a href="${d.slug}.html">${esc(d.title)}<span>${esc((d.md.split("\n").find((l) => l && !l.startsWith("#") && !l.startsWith("<!--")) ?? "").slice(0, 160))}</span></a></li>`).join("")}</ul>
<h2 id="reference">Reference</h2>
<ul class="search-results">${REF.map((d) => `<li><a href="${d.slug}.html">${esc(d.title)}<span class="mono">${esc(d.src)}</span></a></li>`).join("")}</ul>
</article></div>`,
}));

// ---- Guide index for "Ask the Guide" -----------------------------------------------------
const guideFile = existsSync(join(root, "src/guide/index.json")) ? "src/guide/index.json" : "tools/site/vendor/guide/index.json";
const gi = JSON.parse(read(guideFile));
const tabLabel = Object.fromEntries(gi.tabs.map((t) => [t.id, t.label]));
const CLIP_BY_TAB = { theme: "themes", dock: "dock-styles", system: "focus-borders", sessions: "playground-sand", ai: "ai-dock" };
const refFor = (doc) => REF.find((r) => r.src === doc);
const siteEntries = gi.entries.map((e) => {
  const t = e.target ?? {};
  let href = null, clip = null, doc = null;
  if (t.tab) { href = `docs/settings-reference.html#${slugify(tabLabel[t.tab] ?? t.tab)}`; clip = CLIP_BY_TAB[t.tab] ?? null; }
  if (e.kind === "lesson") href = `docs/${t.lesson}.html`;
  if (e.kind === "command") { href = "try.html#command"; }
  if (e.kind === "hotkey") href = "docs/commands-and-shortcuts.html#keyboard-shortcuts";
  if (e.kind === "pack") { href = "try.html#themes"; clip = "themes"; }
  if (e.kind === "dock-style") { href = "try.html#dock"; clip = "dock-styles"; }
  if (e.kind === "scene") { href = "try.html#sand"; clip = "playground-sand"; }
  if (e.kind === "doc" && t.doc) { const r = refFor(t.doc); doc = r ? `docs/${r.slug}.html` : null; }
  return { id: e.id, kind: e.kind, title: e.title, text: (e.text ?? "").slice(0, 480), path: e.path, examples: e.examples, href, doc, clip: clips.some((c) => c.id === clip) ? clip : null };
});
const featureEntries = FEATURES.map((f) => ({ id: `site.feature.${f.id}`, kind: "card", title: f.title, text: `${f.lede} ${f.bullets.join(" ")}`, path: ["Website", "Features", f.title], href: `features.html#${f.id}`, clip: f.clips.find((id) => clips.some((c) => c.id === id)) ?? null }));
write("data/guide-index.json", JSON.stringify({ version: 1, source: guideFile, entries: [...featureEntries, ...siteEntries, ...searchDocs.map((d) => ({ ...d, text: d.text.slice(0, 300) }))] }));

// ---- pages -----------------------------------------------------------------------------------
write("index.html", page({ title: "", desc: "Lens UI: a calm, themeable desktop for Windows 10 and 11. Dock, themes, window styling, a living wallpaper and a local-first AI helper. Open source and reversible.", path: "index.html", body: home({ clips }), scripts: ["js/home.js"] }));
write("features.html", page({ title: "Features", desc: "Every Lens UI feature with a short clip rendered from the real interface.", path: "features.html", body: features({ clips }) }));
write("try.html", page({ title: "Try it", desc: "Live demos of the Lens dock, theme packs, Falling Sand, approval cards, the command engine and voice, running Lens's own code in your browser.", path: "try.html", body: tryPage(), scripts: ["js/try.js"] }));

linkPrefix = "docs/"; // pages below live at the site root
// Vision: docs/VISION.md, or the copy on the docs/vision-unified branch until it's merged.
const vision = read("docs/VISION.md") ?? git("show", "origin/docs/vision-unified:docs/VISION.md");
write("vision.html", page({
  title: "Vision", desc: "Where Lens is going: one desktop, one helper, every workflow.", path: "vision.html",
  body: `<div class="inner" style="padding-top:48px"><article class="prose" style="max-width:78ch">${vision ? render(stripComments(vision)) + `<p class="src">Source: <a href="${REPO}/blob/main/docs/VISION.md">docs/VISION.md</a>${read("docs/VISION.md") ? "" : ` (from <a href="${REPO}/pull/25">pull request #25</a>, not merged yet)`}.</p>` : `<h1>Vision</h1><p>The vision document is being written in <a href="${REPO}/pull/25">pull request #25</a>.</p>`}</article></div>`,
}));

// Changelog: GitHub Releases, else the integration history from git.
let releases = [];
try {
  const r = await fetch(`https://api.github.com/repos/orionopenwow/LensUI/releases?per_page=20`, { headers: { accept: "application/vnd.github+json", ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) }, signal: AbortSignal.timeout(8000) });
  if (r.ok) releases = await r.json();
} catch {}
const log = (git("log", "--first-parent", "-n", "60", "--date=short", "--pretty=format:%h%x09%ad%x09%s") ?? "").split("\n").filter(Boolean).map((l) => l.split("\t"));
write("changelog.html", page({
  title: "Changelog", desc: "Lens UI releases and recent changes.", path: "changelog.html",
  body: `<div class="inner" style="padding-top:48px"><article class="prose" style="max-width:80ch"><h1>Changelog</h1>
${releases.length ? releases.map((r) => `<h2 id="${esc(r.tag_name)}">${esc(r.name || r.tag_name)} <span class="meta">${esc((r.published_at || "").slice(0, 10))}${r.prerelease ? " · pre-release" : ""}</span></h2>${render(r.body || "")}<p><a href="${esc(r.html_url)}">Release page ↗</a></p>`).join("") : `<p class="note">No releases yet: Lens is in beta and there is no signed installer. Below is the recent history of the main line instead.</p>`}
<h2 id="history">Recent changes</h2>
<div class="table"><table><thead><tr><th>Date</th><th>Change</th><th>Commit</th></tr></thead><tbody>${log.map(([h, d, s]) => `<tr><td class="meta">${esc(d)}</td><td>${esc(s.replace(/\s*\(#?\d+\)$/, ""))}</td><td><a class="mono" href="${REPO}/commit/${h}">${h}</a></td></tr>`).join("")}</tbody></table></div>
<p class="src">Built ${new Date().toISOString().slice(0, 10)} from ${esc((git("rev-parse", "--short", "HEAD") ?? "").trim())}.</p></article></div>`,
}));

// Testers: today's checklist from the daily notes.
let latestSrc = "research/daily";
let latest = git("show", "origin/research/daily:docs/tester/LATEST.json");
if (!latest) { latest = read("docs/tester/LATEST.json"); latestSrc = "docs/tester/LATEST.json"; }
if (!latest) { latest = read("docs/tester/LATEST.example.json"); latestSrc = "example"; }
let L = null;
try { L = JSON.parse(latest); } catch {}
const RISK = { high: "bad", med: "warn", low: "ok" };
write("test.html", page({
  title: "Testers", desc: "Today's Lens UI test checklist and how to report what you find.", path: "test.html",
  body: `<section class="hero" style="padding-top:56px"><div class="inner"><p class="eyebrow">For testers</p><h1>Today's test plan.</h1>
<p class="lede">Lens is in beta. Testing on real Windows PCs is the most useful thing anyone can do for it right now.</p>
${latestSrc === "example" ? `<p class="note warn">No daily notes have been published yet, so this shows the example plan. The daily notes start once the research task's first run lands.</p>` : ""}
<p class="meta">${L ? `${esc(L.date ?? "")} · build ${esc(L.build_ref ?? "")}` : ""} · source: ${esc(latestSrc)}</p></div></section>
<section style="padding-top:24px"><div class="inner">
${L?.test_steps?.length ? `<h2 id="steps">Please test</h2><div class="table"><table><thead><tr><th>Risk</th><th>Area</th><th>Steps</th><th>Expected</th></tr></thead><tbody>${L.test_steps.map((s) => `<tr id="${esc(s.id)}"><td class="meta"><span class="dot ${RISK[s.risk] ?? ""}"></span>${esc(s.risk)}</td><td>${esc(s.area)}</td><td>${esc(Array.isArray(s.steps) ? s.steps.join(" → ") : s.steps)}</td><td>${esc(s.expected)}</td></tr>`).join("")}</tbody></table></div>` : ""}
${L?.changes?.length ? `<h2 id="changes" style="margin-top:40px">What changed</h2><div class="grid">${L.changes.map((c) => `<div class="card"><p class="meta">${esc(c.area)}${c.pr ? ` · <a href="${REPO}/pull/${esc(String(c.pr).replace("#", ""))}">#${esc(String(c.pr).replace("#", ""))}</a>` : ""}</p><h3>${esc(c.title)}</h3><p>${esc(c.detail)}</p></div>`).join("")}</div>` : ""}
${L?.known_issues?.length ? `<h2 id="known" style="margin-top:40px">Known issues</h2><ul>${L.known_issues.map((k) => `<li>${esc(k)}</li>`).join("")}</ul>` : ""}
<h2 id="report" style="margin-top:40px">How to report</h2>
<ol>
  <li>In Lens, open <strong>Settings › About &amp; Testing</strong>. The same checklist is there, with Pass, Fail and Skip for each step.</li>
  <li>While testing, press <kbd>Ctrl</kbd> <kbd>Alt</kbd> <kbd>M</kbd> to mark a moment in the session log.</li>
  <li>Press <strong>Export test report</strong>. You'll see exactly what goes in the zip first; API keys, personal paths and clipboard contents are stripped.</li>
  <li>Press <strong>Report an issue</strong>, or <a href="${REPO}/issues/new?labels=tester-report&amp;title=Tester%20report%3A%20">open one here</a>, and drag the zip in.</li>
</ol>
<p class="note">Nothing is uploaded automatically. You decide what to attach.</p>
</div></section>`,
}));

write("404.html", page({ title: "Not found", desc: "Page not found.", path: "404.html", body: `<div class="inner" style="padding:96px 24px"><h1>Not here.</h1><p class="lede">That page doesn't exist. Try the <a href="./">home page</a>, the <a href="docs/">docs</a>, or press <kbd>/</kbd> to ask the Guide.</p></div>` }));
writeFileSync(join(site, ".nojekyll"), "");

console.log(`[site] ${userPages.length + REF.length + 7} pages · ${clips.length} clips · ${packs.length} packs · guide index ${siteEntries.length + featureEntries.length + searchDocs.length} entries · vision ${vision ? "yes" : "link"} · releases ${releases.length} · tester notes: ${latestSrc}`);
