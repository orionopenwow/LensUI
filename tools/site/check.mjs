import { gzipSync } from "node:zlib";
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
      // The site defaults to dark; light screenshots pick Light in the notch's saved preference.
      if (scheme === "light") await ctx.addInitScript(() => localStorage.setItem("lens-site", JSON.stringify({ mode: "light" })));
      const page = await ctx.newPage();
      const errs = [];
      let bytes = 0;
      page.on("pageerror", (e) => errs.push(`pageerror: ${e.message}`));
      page.on("console", (m) => { if (m.type() === "error") errs.push(`console: ${m.text().slice(0, 160)}`); });
      // Weight = what Pages would send: each URL once (iframes share the browser cache there) and
      // text gzipped (Pages serves gzip); images and fonts count at their real size.
      const seen = new Set();
      page.on("response", async (r) => {
        if (r.status() >= 400) errs.push(`${r.status()} ${r.url().replace(base, "/")}`);
        const url = r.url().split("#")[0];
        if (seen.has(url) || r.status() >= 300) return;
        seen.add(url);
        try {
          const body = await r.body();
          bytes += /\.(js|mjs|css|html?|json|svg|txt)(\?|$)|\/$/.test(url) ? gzipSync(body).length : body.length;
        } catch { try { bytes += Number((await r.allHeaders())["content-length"] || 0); } catch { /* page closed */ } }
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
          const r = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ["violations"] })).violations.filter((v) => ["serious", "critical"].includes(v.impact)).map((v) => `${v.id} (${v.nodes.length}): ${v.nodes.slice(0, 4).map((n) => `${n.target.join(" ")}${n.any?.[0]?.data?.contrastRatio ? ` ${n.any[0].data.contrastRatio}:1 ${n.any[0].data.fgColor}/${n.any[0].data.bgColor}` : ""}`).join(" | ")}`));
          problems.push(...r.map((x) => `axe ${p}: ${x}`));
        }
        report.pages[key] ??= {};
        report.pages[key][scheme] = { firstLoadKB: Math.round(bytes / 1024), a11yIssues: a11y.length };
        if (bytes > 1.2 * 1024 * 1024) problems.push(`${scheme} ${p}: ${Math.round(bytes / 1024)} KB transferred with everything loaded > 1.2 MB`);
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
  await page.goto(base + "index.html");
  await page.waitForTimeout(5000);
  // The poster is in the HTML; the animation may only begin after the load event.
  const posterFirst = await page.evaluate(() => {
    const start = performance.getEntriesByName("lens-logo-start")[0]?.startTime;
    const load = performance.getEntriesByType("navigation")[0]?.loadEventEnd;
    return !!document.querySelector("[data-logo] .poster") && start !== undefined && start >= load;
  });
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

// The hero stage: frame pacing and long tasks with the CPU throttled 4× (a slow laptop), a still
// backdrop with reduced motion, and the Ask Lens orb with reduced motion.
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(base + "index.html");
  await page.waitForTimeout(3000);
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  const perf = await page.evaluate(() => new Promise((res) => {
    const gaps = [], longs = [];
    new PerformanceObserver((l) => l.getEntries().forEach((e) => longs.push(e.duration))).observe({ type: "longtask", buffered: false });
    let last = performance.now();
    const end = last + 5000;
    const tick = (t) => { gaps.push(t - last); last = t; if (t < end) requestAnimationFrame(tick); else { gaps.sort((a, b) => a - b); res({ frames: gaps.length, p50: gaps[Math.floor(gaps.length * 0.5)], p95: gaps[Math.floor(gaps.length * 0.95)], longTasks: longs.length, longestTask: Math.max(0, ...longs) }); } };
    requestAnimationFrame(tick);
  }));
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  report.stage = { throttle4x: Object.fromEntries(Object.entries(perf).map(([k, v]) => [k, Math.round(v * 10) / 10])) };
  if (perf.p95 > 50) problems.push(`stage: p95 frame interval ${perf.p95.toFixed(1)} ms at 4× throttle (> 50 ms)`);
  if (perf.longestTask > 200) problems.push(`stage: a ${perf.longestTask.toFixed(0)} ms long task at 4× throttle`);
  await ctx.close();
  const rm = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const p2 = await rm.newPage();
  await p2.goto(base + "index.html");
  await p2.waitForTimeout(3000);
  const grab = () => p2.$eval("#stage .backdrop canvas", (c) => c.toDataURL());
  const a = await grab();
  await p2.waitForTimeout(1500);
  const still = a === (await grab());
  report.stage.reducedMotionStill = still;
  if (!still) problems.push("stage: the backdrop moves with reduced motion");
  // "Lens at work" in the Ask Lens exhibit, with reduced motion: a caption and a highlight ring, no orb.
  await p2.locator("#ai").scrollIntoViewIfNeeded();
  await p2.waitForSelector("#ex-ai .desk");
  await p2.fill("#ai-q", "tile left and go dark");
  await p2.press("#ai-q", "Enter");
  await p2.waitForTimeout(400);
  const lens = await p2.evaluate(() => ({ caption: document.querySelector("#ex-ai .lens-caption")?.textContent ?? "", ring: !!document.querySelector("#ex-ai .lens-ring"), orb: getComputedStyle(document.querySelector("#ex-ai .lens-orb")).opacity }));
  await p2.waitForTimeout(3500);
  lens.tiledLeft = await p2.$eval("#ex-ai .dw.active", (w) => parseFloat(w.style.left) < 3 && parseFloat(w.style.width) > 45);
  report.stage.lensAtWork = lens;
  if (!/Lens/.test(lens.caption) || !lens.ring || lens.orb !== "0" || !lens.tiledLeft) problems.push(`ask lens (reduced motion) ${JSON.stringify(lens)}`);
  await rm.close();
}

// Interaction smoke test: every control on the home page, clicked like a visitor would. Fails on a
// console or page error (in the page or the dock frame), anything drawn outside the stage, a page
// wider than the window, the stage moving when it shouldn't, or layout shift above 0.1 outside
// the demo desktops (their windows moving is the demo).
{
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 } });
  await ctx.addInitScript(() => {
    window.__cls = 0;
    // Windows moving inside a demo desktop are the demo; anything else shifting is a bug.
    const demo = (n) => n?.closest?.(".stage-screen, .ex-screen");
    new PerformanceObserver((l) => l.getEntries().forEach((e) => { if (!e.hadRecentInput && e.sources.some((x) => !demo(x.node))) window.__cls += e.value; })).observe({ type: "layout-shift", buffered: true });
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(`page error: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errs.push(`console: ${m.text().slice(0, 160)}`); });
  await page.goto(base + "index.html");
  await page.waitForTimeout(3000);
  const dock = page.frames().find((f) => f.url().includes("live/dock/index.html") && !f.url().includes("?"));
  const done = [];
  const stageBox = () => page.$eval("#stage", (s) => { const r = s.getBoundingClientRect(); return { y: Math.round(r.top + scrollY), h: Math.round(r.height) }; });
  const home = await stageBox();
  async function verify(label) {
    const r = await page.evaluate(() => {
      const scr = document.querySelector("#stage .stage-screen").getBoundingClientRect();
      const fr = document.querySelector("#stage .stage-screen > iframe");
      const fb = fr.getBoundingClientRect(), k = fb.width / (fr.offsetWidth || fb.width);
      const out = [];
      const doc = fr.contentDocument;
      for (const sel of [".dock-pill", ".dock-launcher-drawer"]) {
        const el = doc?.querySelector(sel);
        if (!el) continue;
        const b = el.getBoundingClientRect();
        const box = { l: fb.left + b.left * k, t: fb.top + b.top * k, r: fb.left + b.right * k, b: fb.top + b.bottom * k };
        if (box.t < scr.top - 1 || box.b > scr.bottom + 1 || box.l < scr.left - 1 || box.r > scr.right + 1) out.push(`${sel} outside the stage`);
        if (sel === ".dock-launcher-drawer" && b.height > 40 && !doc.querySelector(".dock-launcher-drawer .pal-recent-row, .dock-launcher-drawer .pal-result-row")) out.push("search drawer is open but empty");
      }
      if (document.documentElement.scrollWidth > innerWidth + 1) out.push(`page is ${document.documentElement.scrollWidth}px wide in a ${innerWidth}px window`);
      return out;
    });
    problems.push(...r.map((x) => `interaction ${label}: ${x}`));
    const b = await stageBox();
    if (!(await page.$eval("#stage", (s) => s.classList.contains("is-full"))) && (Math.abs(b.y - home.y) > 1 || Math.abs(b.h - home.h) > 1)) problems.push(`interaction ${label}: the stage moved or resized (${JSON.stringify(home)} → ${JSON.stringify(b)})`);
    done.push(label);
  }
  if (!dock) problems.push("interaction: the dock frame didn't load");
  else {
    const items = dock.locator(".dock-item");
    const n = await items.count();
    for (let i = 0; i < n; i++) { await items.nth(i).hover(); await page.waitForTimeout(60); }
    await verify(`hover ${n} dock icons`);
    for (let i = 0; i < n; i++) {
      const cls = await items.nth(i).getAttribute("class");
      if (/dock-launcher-btn|dock-search/.test(cls ?? "")) continue;
      await items.nth(i).click(); await page.waitForTimeout(120);
      if (await dock.locator(".dock-ctx-menu, [role=menu]").count()) await page.keyboard.press("Escape");
    }
    await verify("click every dock icon");
  }
  for (const v of await page.$$eval("select[data-style] option", (o) => o.map((x) => x.value))) { await page.selectOption("select[data-style]", v); await page.waitForTimeout(250); await verify(`dock style ${v}`); }
  for (const v of ["expressive", "dotmatrix", "classic"]) { await page.selectOption("select[data-shape]", v); await page.waitForTimeout(250); await verify(`shape ${v}`); }
  for (const v of ["nord-frost", "alabaster-daylight", "cc-koi-mosaic", "lens-dot-matrix", "obsidian"]) { await page.selectOption("select[data-theme]", v); await page.waitForTimeout(300); await verify(`pack ${v}`); }
  // Super search: opens inside the dock, lists results, types, closes with Esc and with the pill.
  await page.click(".pills [data-search]");
  await page.waitForTimeout(700);
  await verify("search open");
  if (dock && !(await dock.locator(".dock-launcher-drawer").count())) problems.push("interaction: search didn't open in the dock");
  await page.screenshot({ path: join(shots, "search-open.png"), clip: await page.locator("#stage").boundingBox() });
  await page.keyboard.type("kri", { delay: 60 });
  await page.waitForTimeout(500);
  await verify("search typed");
  if (dock && !(await dock.locator(".pal-result-row").count())) problems.push("interaction: typing in search showed no results");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(600);
  if (dock && (await dock.locator(".dock-launcher-drawer").count())) problems.push("interaction: Esc didn't close search");
  if ((await page.getAttribute(".pills [data-search]", "aria-expanded")) !== "false") problems.push("interaction: the Search pill still says expanded after Esc");
  await page.click(".pills [data-search]"); await page.waitForTimeout(500); await page.click(".pills [data-search]"); await page.waitForTimeout(600);
  if (dock && (await dock.locator(".dock-launcher-drawer").count())) problems.push("interaction: the Search pill didn't close search");
  await verify("search closed");
  // Fullscreen: fills the window, the dock at the bottom; Esc leaves.
  await page.click(".pills [data-fs]");
  await page.waitForTimeout(600);
  const fs = await page.evaluate(() => { const s = document.querySelector("#stage .stage-screen").getBoundingClientRect(); return { w: Math.round(s.width), h: Math.round(s.height), full: document.querySelector("#stage").classList.contains("is-full") }; });
  if (!fs.full || fs.w < 1360 || fs.h < 850) problems.push(`interaction: fullscreen didn't fill the window ${JSON.stringify(fs)}`);
  await verify("fullscreen");
  await page.screenshot({ path: join(shots, "fullscreen.png") });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  if (await page.$eval("#stage", (s) => s.classList.contains("is-full"))) problems.push("interaction: Esc didn't leave fullscreen");
  // The tour: starts, steps with the arrow keys, Esc ends it.
  await page.click(".pills [data-tour]");
  await page.waitForTimeout(1200);
  for (let i = 0; i < 3; i++) { await page.keyboard.press("ArrowRight"); await page.waitForTimeout(400); }
  const step = await page.evaluate(() => [...document.querySelectorAll(".tour-dots button")].findIndex((b) => b.hasAttribute("aria-current")));
  if (step !== 3) problems.push(`interaction: the tour is on step ${step + 1} after three → (expected 4)`);
  await verify("tour");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  if (!(await page.$eval(".tour", (t) => t.hidden))) problems.push("interaction: Esc didn't end the tour");
  // Exhibits.
  await page.locator("#themes").scrollIntoViewIfNeeded();
  await page.waitForSelector("#ex-themes .desk");
  for (const b of await page.$$("#ex-themes [data-pick]")) { await b.click(); await page.waitForTimeout(150); }
  await page.click("#ex-themes [data-accent]:nth-child(3)");
  await page.selectOption("#ex-themes [data-allpacks]", "cc-halftone-dusk");
  await page.waitForTimeout(300);
  await verify("themes exhibit");
  await page.locator("#ai").scrollIntoViewIfNeeded();
  await page.click('#ex-ai [data-try="tile left and go dark"]');
  await page.waitForTimeout(7000);
  if (!(await page.$eval("#ex-ai .dw.active", (w) => parseFloat(w.style.left) < 3))) problems.push("interaction: Ask Lens didn't tile the window left");
  await page.click('#ex-ai [data-try="close Discord"]');
  await page.waitForTimeout(3500);
  if (!(await page.locator("#ex-ai .ex-approval").count())) problems.push("interaction: “close Discord” didn't ask first");
  else await page.click("#ex-ai .ex-approval [data-no]");
  await page.fill("#ai-q", "what's the weather like on mars");
  await page.press("#ai-q", "Enter");
  await page.waitForTimeout(400);
  await verify("ask lens");
  await page.locator("#apps").scrollIntoViewIfNeeded();
  await page.waitForSelector("#ex-apps .ex-store [data-get]");
  const before = await page.locator("#ex-apps .dk").count();
  await page.click("#ex-apps .ex-store [data-get]");
  await page.waitForTimeout(3500);
  if ((await page.locator("#ex-apps .dk").count()) !== before + 1) problems.push("interaction: Get didn't add the app to the dock");
  await page.click(".featured [data-get]");
  await page.waitForTimeout(3500);
  await verify("apps exhibit");
  for (const b of await page.$$(".also-chips [data-also]")) { await b.click(); await page.waitForTimeout(60); }
  if ((await page.$$eval(".also-chips [aria-pressed=true]", (x) => x.length)) !== 1) problems.push("interaction: Also-in-Lens chips aren't single-select");
  await verify("also chips");
  const cls = await page.evaluate(() => window.__cls);
  report.interaction = { steps: done.length, cls: Math.round(cls * 1000) / 1000, errors: errs.length };
  if (cls > 0.1) problems.push(`interaction: layout shift ${cls.toFixed(3)} (> 0.1)`);
  problems.push(...[...new Set(errs)].map((e) => `interaction: ${e}`));
  await ctx.close();
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
console.log("stage", JSON.stringify(report.stage));
console.log("interaction", JSON.stringify(report.interaction));
console.log(`${seen.size} internal links checked · axe ${axe ? "on" : "not installed (built-in checks only)"}`);
if (problems.length) { console.log(problems.slice(0, 80).join("\n")); console.log(`${problems.length} problem(s)`); process.exit(1); }
console.log("no problems");
