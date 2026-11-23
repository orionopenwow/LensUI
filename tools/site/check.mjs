// Quality checks for the built site (run after tools/site/build.mjs):
//   - every page loads without page or console errors, in light and dark
//   - internal links and assets resolve (no 404s)
//   - accessibility: images have alt, controls have names, inputs have labels, one h1,
//     no skipped heading levels, unique ids, and WCAG AA text contrast (computed per element)
//   - first-load weight per page (lazy media excluded) stays under 1.5 MB
//   - screenshots at 375, 768 and 1440 px in both themes
// Usage: node tools/site/check.mjs [--shots <dir>]   (axe-core is used too if it's installed)
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const site = resolve(here, "../../docs/site");
const shotsArg = process.argv.indexOf("--shots");
const shots = shotsArg > 0 ? process.argv[shotsArg + 1] : join(here, ".cache/shots");
await mkdir(shots, { recursive: true });
const { chromium } = await import(process.env.PARITY_PLAYWRIGHT ? pathToFileURL(process.env.PARITY_PLAYWRIGHT).href : "playwright");
let axe = null;
try { axe = await readFile(resolve(here, "../../node_modules/axe-core/axe.min.js"), "utf8"); } catch {}

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".webp": "image/webp", ".svg": "image/svg+xml", ".mp4": "video/mp4", ".gif": "image/gif", ".png": "image/png" };
const server = createServer(async (req, res) => {
  let p = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^\/+/, "");
  if (!p || p.endsWith("/")) p += "index.html";
  const f = join(site, p);
  if (!f.startsWith(site)) return res.writeHead(403).end();
  try { const b = await readFile(f); res.writeHead(200, { "content-type": TYPES[extname(f)] || "application/octet-stream", "content-length": b.length }).end(b); }
  catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}/`;

const PAGES = ["index.html", "docs/", "docs/first-five-minutes.html", "docs/settings-reference.html", "download.html", "test.html"];
// Extra notch variants checked on the home page: [label, localStorage "lens-site" value]
const VARIANTS = [
  ["accent-mint", { mode: "light", accent: "mint" }],
  ["accent-coral-compact", { mode: "dark", accent: "coral", density: "compact", size: 1.125 }],
  ["pack-nord", null, "nord-frost"],
  ["pack-paper", null, "paper-minimal"],
  ["pack-cyberpunk", null, "cyberpunk-amber"],
];
// Software WebGL so the animated logo runs in headless CI too.
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"], ...(process.env.PARITY_CHROME ? { executablePath: process.env.PARITY_CHROME } : {}) });
const problems = [];
const report = { pages: {}, links: 0, axe: !!axe };
const seen = new Set();
const links = new Set();

// Scroll the whole page so lazy demos start, then return to the top.
async function scrollThrough(page) {
  const h = await page.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < h; y += 600) { await page.evaluate((v) => scrollTo(0, v), y); await page.waitForTimeout(150); }
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(1200);
}

// In-page audit (no dependencies). Returns a list of problem strings.
const audit = () => {
  const out = [];
  const name = (el) => (el.getAttribute("aria-label") || el.getAttribute("aria-labelledby") && document.getElementById(el.getAttribute("aria-labelledby"))?.textContent || el.textContent || el.getAttribute("title") || el.querySelector("img")?.alt || "").trim();
  document.querySelectorAll("img").forEach((i) => { if (!i.hasAttribute("alt")) out.push(`img without alt: ${i.src.slice(-60)}`); });
  document.querySelectorAll("button, a[href], [role=button]").forEach((b) => { if (!b.closest("[hidden]") && b.offsetParent !== null && !name(b)) out.push(`control without a name: ${b.outerHTML.slice(0, 80)}`); });
  document.querySelectorAll("input, select, textarea").forEach((i) => {
    if (i.type === "hidden" || i.closest("[hidden]")) return;
    const ok = i.labels?.length || i.getAttribute("aria-label") || i.getAttribute("aria-labelledby");
    if (!ok) out.push(`field without a label: ${i.outerHTML.slice(0, 80)}`);
  });
  const h1 = document.querySelectorAll("main h1").length;
  if (h1 !== 1) out.push(`main has ${h1} h1 elements`);
  let last = 1;
  document.querySelectorAll("main h1, main h2, main h3, main h4").forEach((h) => { const n = +h.tagName[1]; if (n > last + 1 && !h.closest(".guide-panel")) out.push(`heading level skips to h${n}: ${h.textContent.slice(0, 40)}`); last = n; });
  const ids = {};
  document.querySelectorAll("[id]").forEach((e) => (ids[e.id] = (ids[e.id] || 0) + 1));
  Object.entries(ids).filter(([, n]) => n > 1).forEach(([id]) => out.push(`duplicate id: ${id}`));
  // Contrast: every visible text node's colour against its first opaque background.
  const parse = (c) => { const m = c.match(/[\d.]+/g); return m ? m.map(Number) : null; };
  const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const bgOf = (el) => { for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c && (c[3] ?? 1) > 0.9) return c; if (getComputedStyle(e).backgroundImage !== "none" && e !== el) return null; } return parse(getComputedStyle(document.body).backgroundColor); };
  const done = new Set();
  const walker = document.createTreeWalker(document.querySelector("main") || document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const el = walker.currentNode.parentElement;
    if (!walker.currentNode.textContent.trim() || done.has(el) || !el.offsetParent || el.closest("[aria-hidden=true], .mini, .approval .form, iframe")) continue;
    done.add(el);
    const cs = getComputedStyle(el);
    const fg = parse(cs.color), bg = bgOf(el);
    if (!fg || !bg || (fg[3] ?? 1) < 0.95) continue;
    const L1 = lum(fg), L2 = lum(bg), ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const large = parseFloat(cs.fontSize) >= 24 || (parseFloat(cs.fontSize) >= 18.66 && +cs.fontWeight >= 700);
    if (ratio < (large ? 3 : 4.5)) out.push(`contrast ${ratio.toFixed(2)}:1 "${walker.currentNode.textContent.trim().slice(0, 40)}"`);
  }
  return [...new Set(out)];
};

for (const scheme of ["dark", "light"]) {
  for (const p of PAGES) {
    for (const w of [375, 768, 1440]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, colorScheme: scheme, reducedMotion: "no-preference" });
      const page = await ctx.newPage();
      const errs = [];
      let bytes = 0;
      page.on("pageerror", (e) => errs.push(`pageerror: ${e.message}`));
      page.on("console", (m) => { if (m.type() === "error") errs.push(`console: ${m.text().slice(0, 160)}`); });
      page.on("response", async (r) => {
        if (r.status() >= 400) errs.push(`${r.status()} ${r.url().replace(base, "/")}`);
        const len = Number((await r.allHeaders())["content-length"] || 0);
        bytes += len;
      });
      await page.goto(base + p, { waitUntil: "load" });
      await page.waitForTimeout(600);
      await scrollThrough(page);
      const key = `${p}`;
      if (w === 1440) {
        const found = await page.evaluate(audit);
        const a11y = found.map((x) => `${scheme} ${p}: ${x}`);
        problems.push(...a11y);
        if (axe && scheme === "dark") {
          await page.addScriptTag({ content: axe });
          const r = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ["violations"] })).violations.filter((v) => ["serious", "critical"].includes(v.impact)).map((v) => `${v.id} (${v.nodes.length})`));
          problems.push(...r.map((x) => `axe ${p}: ${x}`));
        }
        report.pages[key] ??= {};
        report.pages[key][scheme] = { firstLoadKB: Math.round(bytes / 1024), a11yIssues: a11y.length };
        if (bytes > 1.5 * 1024 * 1024) problems.push(`${scheme} ${p}: first load ${Math.round(bytes / 1024)} KB > 1.5 MB`);
        for (const h of await page.$$eval("a[href], img[src], link[href], script[src], iframe[src]", (els) => els.map((e) => e.href || e.src))) {
          if (h.startsWith(base)) links.add(h.split("#")[0]);
        }
      }
      problems.push(...errs.map((e) => `${scheme} ${p} @${w}: ${e}`));
      const name = `${p.replace(/\/$/, "/index").replace(/\.html$/, "").replace(/\//g, "_")}-${w}-${scheme}.png`;
      await page.screenshot({ path: join(shots, name), fullPage: w !== 1440 || p !== "docs/settings-reference.html" });
      await ctx.close();
    }
  }
}
// Animated logo: main-thread cost per frame (budget 4 ms), poster first, and it stays still with
// reduced motion.
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto(base + "index.html", { waitUntil: "domcontentloaded" });
  const posterFirst = await page.$eval("[data-logo] .poster", (i) => !!i && !document.querySelector("[data-logo] canvas"));
  await page.waitForTimeout(5000);
  const st = await page.$eval("[data-logo]", (e) => e.logoStats?.() ?? null);
  report.logo = { posterFirst, ...(st ?? { skipped: "no WebGL" }) };
  if (!posterFirst) problems.push("logo: the animation started before the static poster was shown");
  if (st && st.avgMs > 4) problems.push(`logo: ${st.avgMs.toFixed(2)} ms per frame > 4 ms`);
  if (st && !st.running) problems.push("logo: not animating on screen");
  await ctx.close();
  const rm = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" });
  const p2 = await rm.newPage();
  await p2.goto(base + "index.html");
  await p2.waitForTimeout(3500);
  const moving = await p2.$eval("[data-logo]", (e) => e.logoStats?.().running ?? false);
  report.logo.reducedMotionStill = !moving;
  if (moving) problems.push("logo: animates with reduced motion");
  await rm.close();
}

// Notch variants: set the preference, reload, audit contrast and screenshot.
for (const [label, pref, packId] of VARIANTS) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  await page.goto(base + "index.html");
  if (packId) {
    // Choose the pack through the notch itself, like a visitor would.
    await page.click(".notch-pill");
    await page.selectOption("#n-pack", packId);
    await page.keyboard.press("Escape");
  } else {
    await page.evaluate((p) => localStorage.setItem("lens-site", JSON.stringify(p)), pref);
    await page.reload();
  }
  await scrollThrough(page);
  const found = await page.evaluate(audit);
  problems.push(...found.filter((x) => x.startsWith("contrast")).map((x) => `${label}: ${x}`), ...errs.map((e) => `${label}: ${e}`));
  await page.screenshot({ path: join(shots, `variant-${label}.png`), fullPage: true });
  if (label === "accent-mint") { await page.click(".notch-pill"); await page.waitForTimeout(300); await page.screenshot({ path: join(shots, "variant-notch-open.png") }); }
  await ctx.close();
}

// Link check: every internal URL found must load.
for (const u of links) {
  if (seen.has(u)) continue;
  seen.add(u);
  const r = await fetch(u);
  if (!r.ok) problems.push(`broken link ${u.replace(base, "/")} (${r.status})`);
}
report.links = seen.size;
await browser.close();
server.close();
report.problems = problems;
await writeFile(join(shots, "report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.pages, null, 0));
console.log("logo", JSON.stringify(report.logo));
console.log(`${seen.size} internal links checked · axe ${axe ? "on" : "not installed (built-in checks only)"}`);
if (problems.length) { console.log(problems.slice(0, 80).join("\n")); console.log(`${problems.length} problem(s)`); process.exit(1); }
console.log("no problems");
