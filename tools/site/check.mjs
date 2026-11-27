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
// Extra appearance variants checked on the home page: [label, localStorage "lens-site" value]
const VARIANTS = [
  ["accent-mint", { mode: "light", accent: "mint" }],
  ["accent-coral", { mode: "dark", accent: "coral" }],
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
      const firstBytes = bytes; // before any scrolling: what a visitor pays to see the hero and desk
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
        report.pages[key][scheme] = { firstLoadKB: Math.round(firstBytes / 1024), allLoadedKB: Math.round(bytes / 1024), a11yIssues: a11y.length };
        // The exhibits are the app's real surfaces, each a lazy chunk, so two budgets: the first
        // view, and the whole page after every exhibit has been scrolled into view.
        if (firstBytes > 1.2 * 1024 * 1024) problems.push(`${scheme} ${p}: ${Math.round(firstBytes / 1024)} KB on first load > 1.2 MB`);
        if (bytes > 2.2 * 1024 * 1024) problems.push(`${scheme} ${p}: ${Math.round(bytes / 1024)} KB with everything loaded > 2.2 MB`);
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

// A desk's frame pacing while a window is dragged with the CPU throttled 4× (a slow laptop), and a
// still backdrop with reduced motion. The hero desk is off for now (pages.mjs HERO_DESK), so the desk
// checks drive the Theme lab's desk: the same js/desk.js with the same real surfaces.
const deskBox = (page, sel = "#lab-desk") => page.locator(sel).boundingBox();
/** The full (not thumbnail) dock frame inside a desk host. */
async function dockIn(page, sel) {
  for (const f of page.frames()) {
    if (!f.url().includes("live/dock/index.html") || f.url().includes("mini")) continue;
    const el = await f.frameElement().catch(() => null);
    if (el && (await el.evaluate((x, s) => !!x.closest(s), sel))) return f;
  }
  return null;
}
const toLab = (page) => page.evaluate(() => document.getElementById("themes").scrollIntoView({ block: "start" }));
/**
 * A page point on a real window's own title strip that drags it: the first spot along its top that
 * isn't a button or a field (the frame decides the same way, tools/site/live/surfaces/embed.ts).
 */
const dragSpot = (page, id) => page.evaluate((i) => {
  const d = window.lensSite.lab, w = i == null ? [...d.wins.values()].find((x) => !x.min) : d.wins.get(i);
  const doc = w.frame.contentDocument, r = w.frame.getBoundingClientRect(), k = d.k;
  for (let x = 60; x < w.w - 20; x += 12) {
    const el = doc.elementFromPoint(x, 14);
    if (el && !el.closest("button,a,input,textarea,select,[role=button],[role=tab],[role=slider],[contenteditable],[data-no-drag]")) return { x: r.left + x * k, y: r.top + 14 * k, id: w.id };
  }
  return { x: r.left + 90 * k, y: r.top + 14 * k, id: w.id };
}, id);
async function waitDesk(page, sel = "#lab-desk") {
  await page.waitForFunction((s) => document.querySelector(`${s} .lx-dock`)?.src && document.querySelectorAll(`${s} .lw.is-ready`).length > 0, sel, { timeout: 30000 });
  await page.waitForTimeout(800);
}
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(base + "index.html");
  await toLab(page);
  await waitDesk(page);
  await page.waitForFunction(() => [...window.lensSite.lab.wins.values()].every((w) => w.ready), null, { timeout: 15000 }).catch(() => {});
  // The exhibits near the lab load their frames as it comes into view: let them finish first.
  await page.waitForFunction(() => [...document.querySelectorAll(".xf")].filter((h) => h.querySelector("iframe")).every((h) => h.classList.contains("is-ready")), null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(3000);
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  const bar = await dragSpot(page);
  const sampling = page.evaluate(() => new Promise((res) => {
    const gaps = [], longs = [];
    new PerformanceObserver((l) => l.getEntries().forEach((e) => longs.push(e.duration))).observe({ type: "longtask", buffered: false });
    let last = performance.now();
    const end = last + 3000;
    const tick = (t) => { gaps.push(t - last); last = t; if (t < end) requestAnimationFrame(tick); else { gaps.sort((a, b) => a - b); res({ frames: gaps.length, p50: gaps[Math.floor(gaps.length * 0.5)], p95: gaps[Math.floor(gaps.length * 0.95)], longTasks: longs.length, longestTask: Math.max(0, ...longs) }); } };
    requestAnimationFrame(tick);
  }));
  await page.mouse.move(bar.x, bar.y);
  await page.mouse.down();
  for (let i = 0; i < 40; i++) { await page.mouse.move(bar.x + i * 8, bar.y + Math.sin(i / 5) * 40 + 20); await page.waitForTimeout(40); }
  await page.mouse.up();
  const perf = await sampling;
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  await page.waitForTimeout(500);
  report.stage = { dragThrottle4x: Object.fromEntries(Object.entries(perf).map(([k, v]) => [k, Math.round(v * 10) / 10])) };
  {
    const b2 = await dragSpot(page);
    const s2 = page.evaluate(() => new Promise((res) => { const g = []; let last = performance.now(); const end = last + 2000; const tick = (t) => { g.push(t - last); last = t; if (t < end) requestAnimationFrame(tick); else { g.sort((a, b) => a - b); res({ p50: g[g.length >> 1], p95: g[Math.floor(g.length * 0.95)] }); } }; requestAnimationFrame(tick); }));
    await page.mouse.move(b2.x, b2.y); await page.mouse.down();
    for (let i = 0; i < 40; i++) { await page.mouse.move(b2.x - i * 6, b2.y + 10); await page.waitForTimeout(30); }
    await page.mouse.up();
    const un = await s2;
    report.stage.dragUnthrottled = { p50: Math.round(un.p50 * 10) / 10, p95: Math.round(un.p95 * 10) / 10 };
    if (un.p50 > 25) problems.push(`desk: median frame interval ${un.p50.toFixed(1)} ms while dragging (> 25 ms, about 40 fps)`);
  }
  // CI composites on the CPU (SwiftShader), so a full-size animated backdrop under a moving window costs
  // far more there than on any GPU; the 4× budget is looser than the idle one for that reason.
  // So at 4× the budget is on main-thread work (long tasks) and a loose median; without throttling the
  // drag must hold about 60 fps at the median.
  if (perf.p50 > 100) problems.push(`desk: median frame interval ${perf.p50.toFixed(1)} ms while dragging at 4× throttle (> 100 ms)`);
  if (perf.longestTask > 200) problems.push(`desk: a ${perf.longestTask.toFixed(0)} ms long task while dragging at 4× throttle`);
  await ctx.close();
  const rm = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const p2 = await rm.newPage();
  await p2.goto(base + "index.html");
  await toLab(p2);
  await waitDesk(p2);
  await p2.waitForTimeout(1500);
  const grab = () => p2.$eval("#lab-desk .lx-wall canvas", (c) => c.toDataURL()).catch(() => "none");
  const a = await grab();
  await p2.waitForTimeout(1500);
  const still = a === (await grab());
  report.stage.reducedMotionStill = still;
  // With reduced motion each exhibit shows its first step and stays there.
  await p2.evaluate(() => document.getElementById("f-magic").scrollIntoView({ block: "center" }));
  await p2.waitForTimeout(800);
  const rmStep = () => p2.evaluate(() => [...document.querySelectorAll("[data-exhibit]")].map((x) => x._xloop?.index ?? 0).join(","));
  const rm0 = await rmStep();
  await p2.waitForTimeout(7000);
  report.stage.reducedMotionAutoplay = rm0 !== (await rmStep());
  if (!still) problems.push("desk: the backdrop moves with reduced motion");
  if (report.stage.reducedMotionAutoplay) problems.push("exhibits advance with reduced motion");
  await rm.close();
}

// Interaction test: a desk (the Theme lab's), the Dock widget, the magic right-click, Lens Command,
// the Theme lab, the exhibits, the Guide, the header and OS detection, driven like a visitor would. Fails on a
// console or page error (in the page or a dock frame), a page wider than the window, layout shift
// above 0.1 outside the demos (their windows moving is the demo), or any expectation below.
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(() => {
    window.__cls = 0;
    const demo = (n) => n?.closest?.(".desk-host, .dock-rail, .dockw, .lab, .gw, .sc-bar, .sc-tabs, .xstage, .xsteps, .xbar, .agent-x");
    window.__clsSrc = [];
    new PerformanceObserver((l) => l.getEntries().forEach((e) => { if (!e.hadRecentInput && e.sources.some((x) => !demo(x.node))) { window.__cls += e.value; window.__clsSrc.push(`${e.value.toFixed(3)} @${Math.round(e.startTime)}ms y${Math.round(scrollY)} ${e.sources.filter((x) => !demo(x.node)).map((x) => `${x.node?.nodeName}#${x.node?.id || ""}.${String(x.node?.className ?? "").slice(0, 24)}`).join(",")}`); } })).observe({ type: "layout-shift", buffered: true });
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(`page error: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errs.push(`console: ${m.text().slice(0, 160)}`); });
  const done = [];
  const expect = (ok, label, detail = "") => { if (!ok) problems.push(`interaction: ${label}${detail ? ` ${detail}` : ""}`); done.push(label); };
  const D = (f, arg) => page.evaluate(f, arg);
  await page.goto(base + "index.html");
  // Light and dark: with no saved choice the site follows the system; the header switch flips it and
  // light really renders light.
  const lum = () => D(() => { const m = getComputedStyle(document.body).backgroundColor.match(/[\d.]+/g).map(Number); return (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255; });
  await page.emulateMedia({ colorScheme: "light" }); await page.reload(); await page.waitForSelector(".mode-switch");
  expect((await D(() => document.documentElement.dataset.scheme)) === "light" && (await lum()) > 0.8, "a light system gets the light site", String(await lum()));
  await page.emulateMedia({ colorScheme: "dark" }); await page.reload(); await page.waitForSelector(".mode-switch");
  expect((await D(() => document.documentElement.dataset.scheme)) === "dark" && (await lum()) < 0.2, "a dark system gets the dark site");
  await page.click(".mode-switch"); await page.waitForTimeout(250);
  expect((await D(() => document.documentElement.dataset.scheme)) === "light" && (await lum()) > 0.8 && (await page.$eval(".mode-switch", (b) => b.getAttribute("aria-checked"))) === "true", "the header switch turns light mode on");
  await page.screenshot({ path: join(shots, "hero-light-switch.png") });
  await page.click(".mode-switch"); await page.waitForTimeout(250);
  expect((await D(() => document.documentElement.dataset.scheme)) === "dark", "the header switch turns it back to dark");
  await D(() => localStorage.removeItem("lens-site")); await page.reload(); await page.waitForSelector(".mode-switch");
  // Hero: no beta pill; a slim Download with the Windows mark; the other installers listed under it.
  expect(!(await page.$(".hero-pill")), "the beta pill is gone");
  expect(!!(await page.$(".hero .hero-dl svg")) && (await page.$eval(".hero .hero-dl", (b) => b.offsetHeight)) <= 48, "Download is slim and carries the Windows mark");
  expect((await page.locator(".hero .dl-more > *").count()) >= 4, "other ways to install are listed under Download");
  // The big hero demo desk is off for now; the page opens on the Dock widget, then the features in order.
  expect(!(await page.$("#desk-host, #stage, #sc-tabs")), "the hero demo desk is hidden");
  const order = await D(() => [...document.querySelectorAll("main > section[id]")].map((x) => x.id).join(","));
  expect(/f-dock,f-browser,f-magic,themes,byo,apps,overlays/.test(order), "the page runs Dock widget, Lens Browser, Magic Mouse, Themes, Agentic desktop, Lens Apps, then the rest", order);
  // Header: no shift on scroll, Download appears once the hero's scrolls away.
  const h0 = await page.$eval("#bar", (b) => b.offsetHeight);
  await page.evaluate(() => scrollTo(0, 1400)); await page.waitForTimeout(400);
  expect((await page.$eval("#bar", (b) => b.offsetHeight)) === h0, "header keeps its height when scrolled");
  expect(await page.waitForFunction(() => getComputedStyle(document.querySelector(".bar-dl")).opacity === "1", null, { timeout: 4000 }).then(() => true, () => false), "header Download appears on scroll");
  // Appearance popover by keyboard.
  await page.focus(".appear-btn"); await page.keyboard.press("Enter"); await page.waitForTimeout(200);
  expect(!(await page.$eval("#appear-panel", (p) => p.hidden)), "appearance popover opens with Enter");
  await page.keyboard.press("Escape"); await page.waitForTimeout(150);
  expect(await page.$eval("#appear-panel", (p) => p.hidden), "appearance popover closes with Esc");
  // The desk (the Theme lab's): every window on it is the real surface.
  await toLab(page);
  await waitDesk(page);
  await page.waitForTimeout(600);
  const realOnDesk = () => D(() => {
    const L = window.lensSite, d = L.lab, bad = [];
    for (const w of d.wins.values()) { const doc = w.frame.contentDocument; if (!w.ready || !doc?.querySelector(L.APPS[w.app].marker)) bad.push(w.app); }
    return bad;
  });
  expect(!(await realOnDesk()).length, "every window on the desk is the real surface", (await realOnDesk()).join(", "));
  const box = await deskBox(page);
  await page.waitForTimeout(600);
  // Nothing hand-built stands in for the app: the demo has no mock title bars, menus or app bodies.
  expect(!(await page.$("#lab-desk .lw-bar, #lab-desk .lx-top, #lab-desk .lx-menu, #lab-desk .lx-magic, #lab-desk .lx-cmd, #lab-desk .lx-ic, #dock-desk .lw-bar, #agent-desk .lw-bar")), "the desk draws no app UI of its own");
  // Drag, resize, snap.
  const win = () => D(() => { const w = [...window.lensSite.lab.wins.values()].find((x) => !x.min); return w && { id: w.id, x: w.x, y: w.y, w: w.w, h: w.h, tile: w.tile, min: w.min }; });
  const barAt = (id) => dragSpot(page, id);
  let w0 = await win();
  let p = await barAt(w0.id);
  await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.move(p.x + 160, p.y + 70, { steps: 10 }); await page.mouse.up();
  // The frame reports the pointer to the desk in messages: wait for the drop to land.
  const dropped = () => page.waitForFunction(() => !document.querySelector(".lx.is-dragging"), null, { timeout: 3000 }).catch(() => {});
  await dropped();
  let w1 = await D((i) => { const w = window.lensSite.lab.wins.get(i); return { x: w.x, y: w.y }; }, w0.id);
  expect(Math.abs(w1.x - w0.x - 160 / (await D(() => window.lensSite.lab.k))) < 6 && w1.y > w0.y, "drag a real window by its own title strip", JSON.stringify([w0, w1]));
  expect(!(await page.$(".lx.is-dragging")), "no stuck drag after release");
  // Let the drop's settle animation finish (it tilts the window a little), then grab the corner.
  await page.waitForTimeout(700);
  await D((i) => window.lensSite.lab.focus(i), w0.id);
  // Give the corner room: on a shorter desk the drag above can leave it under the dock's frame.
  await D((i) => { const d = window.lensSite.lab, w = d.wins.get(i); d.setRect(w, { x: w.x, y: 60, w: 600, h: 300 }, { animate: false }); }, w0.id);
  await page.waitForTimeout(200);
  w0 = await win();
  const se = await D((i) => { const r = window.lensSite.lab.wins.get(i).el.querySelector(".rz-se").getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, w0.id);
  const dragCorner = async () => {
    await toLab(page); await page.waitForTimeout(300);
    // A point on the corner handle that is inside the window (the handle overhangs its clipped edge).
    const c = await D((i) => { const r = window.lensSite.lab.wins.get(i).el.querySelector(".rz-se").getBoundingClientRect(); return { x: r.left + Math.min(3, r.width / 3), y: r.top + Math.min(3, r.height / 3) }; }, w0.id);
    report.cornerHit = await D(({ x, y }) => { const e = document.elementFromPoint(x, y); return `${e?.tagName}.${e?.className}`; }, c);
    await page.mouse.move(c.x, c.y); await page.mouse.down(); await page.mouse.move(c.x + 90, c.y + 50, { steps: 8 }); await page.mouse.up();
    return D((i) => { const w = window.lensSite.lab.wins.get(i); return { w: w.w, h: w.h }; }, w0.id);
  };
  void se;
  let w2 = await dragCorner();
  if (!(w2.w > w0.w + 40 && w2.h > w0.h + 20)) {
    // The drop's settle spring can still own the window on a slow runner: wait it out, try once more.
    await page.waitForTimeout(900);
    w2 = await dragCorner();
  }
  const cornerHit = await D((i) => { const r = window.lensSite.lab.wins.get(i).el.querySelector(".rz-se").getBoundingClientRect(), e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); const w = window.lensSite.lab.wins.get(i), wr = w.el.getBoundingClientRect(); return `${e?.tagName}.${e?.className} in ${e?.closest(".lw")?.dataset.app ?? e?.closest("[id]")?.id}; stack ${document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2).slice(0, 5).map((x) => x.tagName + "." + String(x.className).slice(0, 30)).join(" > ")}; win ${w.el.className} ${Math.round(wr.left)},${Math.round(wr.top)} ${Math.round(wr.width)}x${Math.round(wr.height)} ${getComputedStyle(w.el).display}/${getComputedStyle(w.el).pointerEvents}; scrollY ${Math.round(scrollY)}; corner ${Math.round(r.left)},${Math.round(r.top)}`; }, w0.id);
  expect(w2.w > w0.w + 40 && w2.h > w0.h + 20, "resize from the corner", JSON.stringify([w0, w2]) + " " + cornerHit);
  p = await barAt(w0.id);
  await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.move(box.x + 2, box.y + box.height * 0.45, { steps: 14 }); await page.waitForTimeout(100);
  expect(!(await page.$eval("#lab-desk .lx-snap", (e) => e.hidden)), "snap preview shows at the edge");
  await page.mouse.up(); await dropped(); await page.waitForTimeout(400);
  expect((await D((i) => window.lensSite.lab.wins.get(i).tile, w0.id)) === "left", "drop at the edge snaps left");
  // Release outside the desk while dragging: nothing stays stuck.
  p = await barAt(w0.id);
  await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.move(p.x + 40, 5, { steps: 6 }); await page.mouse.up(); await dropped(); await page.waitForTimeout(200);
  expect(!(await page.$(".lx.is-dragging")), "no stuck pointer after releasing outside the desk");
  // Minimise to the dock, restore from the dock.
  const app = await D((i) => window.lensSite.lab.wins.get(i).app, w0.id);
  await D((i) => window.lensSite.lab.minimize(i), w0.id);
  await page.waitForTimeout(600);
  expect(await D((i) => window.lensSite.lab.wins.get(i).min, w0.id), "minimise to the dock");
  const dockFrame = await dockIn(page, "#lab-desk");
  if (dockFrame) {
    const name = await D((a) => window.lensSite.APPS[a]?.name ?? a, app);
    const item = dockFrame.locator(`.dock-item[aria-label^="${name}"]`).first();
    const ib = (await item.count()) ? await item.boundingBox() : null;
    // The dock frame takes the pointer only while it's over the dock (so windows under its empty band stay
    // clickable): move there first, like a person does, then click.
    if (!ib) problems.push(`interaction: no dock item for ${name}`);
    // Hovering magnifies the dock, so the icon moves: settle, measure again, then click (up to 3 tries).
    for (let tries = 0; ib && tries < 3 && (await D((i) => window.lensSite.lab.wins.get(i).min, w0.id)); tries++) {
      await page.mouse.move(ib.x + ib.width / 2, ib.y + ib.height / 2 - 30); await page.mouse.move(ib.x + ib.width / 2, ib.y + ib.height / 2, { steps: 3 }); await page.waitForTimeout(400);
      const b2 = await item.boundingBox();
      await page.mouse.click(b2.x + b2.width / 2, b2.y + b2.height / 2); await page.waitForTimeout(800);
    }
    // Last resort on slow runners: click the dock's own button (still the dock → page bridge).
    if (ib && (await D((i) => window.lensSite.lab.wins.get(i).min, w0.id))) { report.dockRestoreFallback = true; await item.evaluate((el) => el.click()); await page.waitForTimeout(800); }
  } else problems.push("interaction: the desk's dock frame didn't load");
  expect(!(await D((i) => window.lensSite.lab.wins.get(i).min, w0.id)), "restore from the dock");
  // The magic right-click: a right-click inside a real window, and on the desktop, opens the real
  // magic window (src/magic/MagicSurface.tsx) at the pointer, on the right kind of target.
  await D(() => { const d = window.lensSite.lab; d.reset(); for (const w of [...d.wins.values()]) if (w.app !== "browser") d.close(w.id); });
  await page.waitForFunction(() => window.lensSite.lab.byApp("browser")?.ready, null, { timeout: 15000 }).catch(() => {});
  const magicText = async () => {
    await page.waitForFunction(() => { const o = window.lensSite.lab.overs.magic; return !o.el.hidden && o.el.classList.contains("is-ready") && o.frame.contentDocument?.querySelector(window.lensSite.OVERS.magic.marker); }, null, { timeout: 8000 }).catch(() => {});
    return D(() => { const o = window.lensSite.lab.overs.magic; return o.el.hidden ? "" : (o.frame.contentDocument?.body?.textContent ?? ""); });
  };
  {
    const fr = await D(() => { const r = window.lensSite.lab.byApp("browser").frame.getBoundingClientRect(); return { x: r.left + r.width * 0.6, y: r.top + r.height * 0.5 }; });
    await page.mouse.click(fr.x, fr.y, { button: "right" });
    const txt = await magicText();
    expect(/window/i.test(txt), "right-click in a real window opens the real magic window", txt.slice(0, 80));
    const at = await D(() => { const r = window.lensSite.lab.overs.magic.el.getBoundingClientRect(); return { x: r.left, y: r.top }; });
    expect(Math.abs(at.x - fr.x) < 40 && at.y <= fr.y + 40 && at.y > fr.y - 460, "the magic window opens at the pointer", JSON.stringify([fr, at]));
    await D(() => window.lensSite.lab.hideMenu());
  }
  await D(() => { for (const w of window.lensSite.lab.wins.values()) window.lensSite.lab.minimize(w.id); });
  await page.waitForTimeout(600);
  // Pick a point that really is bare wallpaper (no window or frame on top), then right-click it.
  const bare = await D(() => {
    const h = document.getElementById("lab-desk").getBoundingClientRect();
    for (const fy of [0.45, 0.35, 0.55, 0.25]) for (const fx of [0.6, 0.5, 0.7, 0.4, 0.8]) {
      const x = h.left + h.width * fx, y = h.top + h.height * fy, e = document.elementFromPoint(x, y);
      if (e && h.top + 50 < y && !e.closest(".lw, iframe, .lx-over, button, a")) return { x, y };
    }
    return { x: h.left + h.width * 0.6, y: h.top + h.height * 0.45 };
  });
  await page.mouse.move(bare.x, bare.y - 20, { steps: 4 }); await page.waitForTimeout(700);
  await page.mouse.click(bare.x, bare.y, { button: "right" });
  expect(/desktop/i.test(await magicText()), "desktop right-click opens the real magic window on the desktop");
  expect(await D(() => { const d = document.querySelector("#lab-desk .lx-dim"); return !!d && !d.hidden; }), "right-click on the desk dims and softens everything but the clicked spot and its menu");
  await D(() => window.lensSite.lab.hideMenu());
  // Lens Command: Ctrl+Space opens the real CommandSurface; Esc closes it.
  await page.focus("#lab-desk .lx");
  await page.keyboard.press("Control+Space");
  expect(await page.waitForFunction(() => { const o = window.lensSite.lab.overs.cmd; return !o.el.hidden && o.frame?.contentDocument?.querySelector(".cmd-root"); }, null, { timeout: 8000 }).then(() => true, () => false), "Ctrl+Space opens the real Lens Command");
  await D(() => window.lensSite.lab.closeCmd());
  // The top bar is the real TopBarSurface, and its Quick Settings button opens the real Quick Settings.
  expect(await page.waitForFunction(() => window.lensSite.lab.doc("top")?.querySelector(".topbar-wrapper"), null, { timeout: 8000 }).then(() => true, () => false), "the top bar is the real one");
  await D(() => window.lensSite.lab.openFly());
  expect(await page.waitForFunction(() => window.lensSite.lab.doc("qs")?.querySelector(".qs-shell"), null, { timeout: 8000 }).then(() => true, () => false), "Quick Settings is the real surface");
  await D(() => window.lensSite.lab.closeFly());
  // The dock: every icon opens the real surface for that app, and only the launched icon animates.
  {
    await D(() => { const d = window.lensSite.lab; for (const w of [...d.wins.values()]) d.close(w.id); });
    await page.waitForTimeout(400);
    const dock = await dockIn(page, "#lab-desk");
    const pinned = await dock.evaluate(() => [...document.querySelectorAll(".dock-item[aria-label]")].map((e) => e.getAttribute("aria-label")));
    const byName = await D(() => Object.fromEntries(Object.entries(window.lensSite.APPS).map(([id, a]) => [a.name, id])));
    const apps = pinned.map((l) => [l, Object.keys(byName).find((n) => l.startsWith(n))]).filter(([, n]) => n);
    expect(apps.length >= 7, "the dock's icons are the desk's real apps", pinned.join(" | "));
    await dock.evaluate(() => {
      window.__launch = [];
      const tick = () => { const now = new Set(); for (const a of document.getAnimations()) { const it = a.effect?.target?.closest?.(".dock-item"); if (it && a.playState === "running" && /launch|bounce|pulse/i.test(a.animationName || "")) now.add(it); } if (now.size) window.__launch.push(now.size); requestAnimationFrame(tick); };
      tick();
    });
    for (const [label, name] of apps) {
      const id = byName[name];
      await dock.evaluate((l) => { window.__launch.length = 0; [...document.querySelectorAll(".dock-item[aria-label]")].find((e) => e.getAttribute("aria-label") === l || e.getAttribute("aria-label").startsWith(l.split(" (")[0])).click(); }, label);
      const ok = await page.waitForFunction((i) => { const L = window.lensSite, w = L.lab.byApp(i); return w?.ready && w.frame.contentDocument?.querySelector(L.APPS[i].marker); }, id, { timeout: 15000 }).then(() => true, () => false);
      expect(ok, `the dock's ${name} icon opens the real ${name}`);
      await page.waitForTimeout(350);
      const most = await dock.evaluate(() => Math.max(0, ...window.__launch));
      expect(most <= 1, `launching ${name} animates one dock icon`, `${most} at once`);
      await D((i) => { const d = window.lensSite.lab, w = d.byApp(i); if (w) d.close(w.id); }, id);
    }
    await D(() => window.lensSite.lab.reset());
  }
  // The Dock widget: the real top bar and dock, live. Each style, edge and accent changes the real
  // dock in place: its stage class, its frame's place on the edge, and its marks in the accent.
  {
    await page.evaluate(() => document.getElementById("f-dock").scrollIntoView({ block: "start" }));
    await page.waitForFunction(() => window.lensSite.dock?.doc("top")?.querySelector(".topbar-wrapper"), null, { timeout: 20000 }).catch(() => {});
    const wd = await (async () => { for (let t = 0; t < 40; t++) { const f = await dockIn(page, "#dock-desk"); if (f && (await f.$(".dock-pill").catch(() => null))) return f; await page.waitForTimeout(250); } return null; })();
    expect(!!wd && (await D(() => !!window.lensSite.dock.doc("top")?.querySelector(".topbar-wrapper"))), "the Dock widget holds the real top bar and the real dock");
    // Every style in the app's DOCK_STYLES (src/dock/styles.ts) has a card with a drawing, plus the site's
    // pack variants; the headline counts them; every card's drawing stays inside its box.
    const want = (await import("./lib/dockstyles.mjs").then((m) => m.loadDockStyles()).catch(() => [])).map((d) => d.id);
    const got = await page.$$eval("#dw-styles [role=radio]", (bs) => bs.map((b) => ({ id: b.dataset.id, name: b.querySelector(".dw-name")?.textContent, drawn: [...b.querySelectorAll(".dw-pic svg rect, .dw-pic svg circle")].filter((r) => r.getBoundingClientRect().width > 0).length })));
    expect(want.length >= 10 && want.every((id) => got.some((g) => g.id === id && g.drawn >= 4 && g.name)), "every Dock style in DOCK_STYLES (and each pack variant) has a named card with a drawing", JSON.stringify({ want, got }));
    expect(want.includes("unified") && got.some((g) => g.id === "unified"), "the Unified style has a card");
    const WORD = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
    expect(new RegExp(`One dock, ${WORD[got.length] ?? got.length} ways`).test(await D(() => document.getElementById("f-dock-h").textContent)) && !/\bnine\b/i.test(await D(() => document.getElementById("f-dock").textContent)), "the Dock headline counts the styles it shows, and nothing there still says nine");
    expect((await page.locator("#dw-edges [role=radio] .dw-pic svg").count()) === 4, "the widget offers four edges, each drawn");
    const spill = await D(() => [...document.querySelectorAll("#dockw .dw-card, #dockw .dw-acc [role=radio]")].flatMap((b) => { const box = b.getBoundingClientRect(); return [...b.querySelectorAll("svg")].filter((g) => { const r = g.getBoundingClientRect(), pic = g.parentElement.getBoundingClientRect(); return r.width > box.width + 0.5 || r.height > box.height + 0.5 || r.width > pic.width + 0.5 || r.height > pic.height + 0.5; }).map(() => b.dataset.id || b.dataset.edge || b.getAttribute("aria-label")); }));
    expect(!spill.length, "no picker icon renders larger than its box", spill.join(", "));
    expect(await D(() => { const g = document.getElementById("dw-styles"); return g.getAttribute("role") === "radiogroup" && [...g.querySelectorAll("[role=radio]")].filter((b) => b.tabIndex === 0).length === 1 && [...g.querySelectorAll("[role=radio]")].every((b) => (b.getAttribute("aria-label") || b.textContent).trim().length > 1); }), "the style cards are one radio group with a roving tab stop and a name on each");
    expect((await page.locator(".dw-chips li").count()) <= 8 && !(await page.$("#f-dock .why, #dock-rail")), "the Dock section is the widget and one line of chips, no rail or tiles");
    const stage = () => wd.evaluate(() => document.querySelector(".dock-stage")?.className ?? "");
    if (wd) {
      // Each card turns the real dock into its style (the live dock's stage class), and the caption names it.
      const ids = await page.$$eval("#dw-styles [role=radio]", (bs) => bs.map((b) => [b.dataset.id, b.dataset.style, b.dataset.label]));
      const missed = [];
      for (const [id, st, label] of ids) {
        await page.click(`#dw-styles [data-id="${id}"]`);
        const ok = await page.waitForFunction((s) => window.lensSite.dock.frame.contentDocument?.querySelector(`.dock-stage.dock-style-${s}`), st, { timeout: 5000 }).then(() => true, () => false);
        if (!ok || !(await D((l) => document.getElementById("dock-info").textContent.includes(l), label))) missed.push(id);
      }
      expect(!missed.length, "every style card changes the live dock's style and the caption says so", missed.join(", "));
      // Keyboard: arrows move and pick (roving tabindex), and focus lands on the picked card.
      await page.focus('#dw-styles [role=radio][tabindex="0"]');
      const before = await D(() => document.querySelector('#dw-styles [aria-checked="true"]').dataset.id);
      await page.keyboard.press("ArrowLeft");
      const after = await D(() => ({ id: document.querySelector('#dw-styles [aria-checked="true"]').dataset.id, focused: document.activeElement?.getAttribute("aria-checked") === "true" }));
      expect(after.id !== before && after.focused, "arrow keys move the style pick and its focus", JSON.stringify([before, after]));
      await page.click('#dw-styles [role=radio]:has-text("Taskbar")');
      expect(await page.waitForFunction(() => window.lensSite.dock.frame.contentDocument?.querySelector(".dock-stage.dock-style-taskbar"), null, { timeout: 5000 }).then(() => true, () => false), "picking Taskbar turns the real dock into the taskbar", await stage());
      await page.click('#dw-styles [role=radio]:has-text("Floating")');
      await page.click('#dw-edges [data-edge="left"]'); await page.waitForTimeout(700);
      const geo = await D(() => { const d = window.lensSite.dock, f = d.frame; return { left: f.offsetLeft, w: f.offsetWidth, h: f.offsetHeight, edge: !!f.contentDocument?.querySelector(".dock-stage.dock-edge-left") }; });
      expect(geo.edge && geo.left === 0 && geo.w < geo.h, "picking Left puts the real dock on the left edge", JSON.stringify(geo));
      await page.click('#dw-edges [data-edge="top"]'); await page.waitForTimeout(500);
      expect(await D(() => !!window.lensSite.dock.frame.contentDocument?.querySelector(".dock-stage.dock-edge-top")), "picking Top moves it under the top bar");
      await page.click('#dw-edges [data-edge="bottom"]'); await page.waitForTimeout(400);
      await page.click('#dw-acc [data-acc="#FB7185"]');
      const coral = await page.waitForFunction(() => [...(window.lensSite.dock.frame.contentDocument?.querySelectorAll(".dock-indicator") ?? [])].some((e) => getComputedStyle(e).backgroundColor === "rgb(251, 113, 133)"), null, { timeout: 4000 }).then(() => true, () => false);
      expect(coral && (await D(() => /Coral/.test(document.getElementById("dock-info").textContent))), "an accent picked on the widget paints the real dock's marks and is named");
      await page.click('#dw-acc [data-acc=""]');
      await page.screenshot({ path: join(shots, "dock-widget.png"), clip: await page.locator("#f-dock").boundingBox() });
    }
  }
  // The exhibits: each plays three steps with a readable caption strip (≥16 px, a solid bar, a step
  // label and one sentence), and each step shows real surfaces.
  {
    const caps = await D(() => [...document.querySelectorAll("[data-exhibit] .xbar")].map((b) => { const c = b.querySelector(".xcap"), cs = getComputedStyle(c), bs = getComputedStyle(b); return { px: parseFloat(cs.fontSize), solid: !/rgba?\(.*,\s*0\)|transparent/.test(bs.backgroundColor), label: !!b.querySelector(".xcap-l")?.textContent.trim(), text: (b.querySelector(".xcap-t")?.textContent ?? "").trim().length }; }));
    expect(caps.length >= 3 && caps.every((c) => c.px >= 16 && c.solid && c.label && c.text > 20), "exhibit captions: ≥16 px on a solid strip, with a step label and a sentence", JSON.stringify(caps));
    const magicH = await D(() => document.querySelector("#f-magic h2")?.textContent + " | " + document.querySelector("#f-magic .kicker")?.textContent);
    expect(/Magic Mouse/.test(magicH) && !/Right-click anything/.test(magicH), "“Right-click anything” is now Magic Mouse", magicH);
    expect(await D(() => /off by default/i.test(document.querySelector("#f-magic .head").textContent) && /asks before it turns on/i.test(document.querySelector("#f-magic .head").textContent)), "Magic Mouse says it's off by default and asks before it turns on");
    // Magic Mouse: hold opens the real Magic window at the pointer; drag grabs; let go opens the real Snip.
    await page.evaluate(() => document.getElementById("f-magic").scrollIntoView({ block: "center" }));
    await page.waitForFunction(() => document.querySelector("#mx")._xloop, null, { timeout: 10000 }).catch(() => {});
    const mm = async (k, ok) => { await D((i) => document.querySelector("#mx")._xloop.show(i), k); return page.waitForFunction(ok, null, { timeout: 12000 }).then(() => true, () => false); };
    expect(await mm(0, () => { const m = document.querySelector("#f-magic .mx-menu"); return !m.hidden && m.querySelector("iframe")?.contentDocument?.querySelector("[class^='magic-']"); }), "Magic Mouse step 1: holding opens the real Magic window at the pointer");
    expect(await mm(1, () => !document.querySelector("#f-magic .mm-grab").hidden && document.querySelector("#f-magic .mm-grab").offsetWidth > 100), "Magic Mouse step 2: hold, then drag, grabs an area");
    expect(await mm(2, () => { const h = document.querySelector("#f-magic .mx-snip"); return h && !h.hidden && h.querySelector("iframe")?.contentDocument?.querySelector(".snip-root"); }), "Magic Mouse step 3: the grabbed area opens in the real Snip");
    // Agentic desktop: the voice card hears the command, the Lens cursor opens Lens Browser from the
    // dock and types into it; the risky step shows the real approval card.
    await page.evaluate(() => document.getElementById("byo").scrollIntoView({ block: "center" }));
    await page.waitForFunction(() => document.querySelector("#byo [data-exhibit]")._xloop && window.lensSite.agentDesk, null, { timeout: 10000 }).catch(() => {});
    const ag = async (k, ok, t = 15000) => { await D((i) => document.querySelector("#byo [data-exhibit]")._xloop.show(i), k); return page.waitForFunction(ok, null, { timeout: t }).then(() => true, () => false); };
    expect(await ag(0, () => /book Friday dinner/i.test([...document.querySelectorAll("#agent-desk .ag-layer")].map((f) => f.contentDocument?.body?.textContent ?? "").join(" "))), "Agentic step 1: the real voice card shows the spoken command");
    expect(await page.waitForFunction(() => window.lensSite.agentDesk.byApp("browser")?.ready, null, { timeout: 15000 }).then(() => true, () => false), "Agentic step 1: the Lens cursor opens Lens Browser from the dock");
    expect(await ag(1, () => /dinner for 4/i.test([...document.querySelectorAll("#agent-desk .ag-layer")].map((f) => f.contentDocument?.body?.textContent ?? "").join(" "))), "Agentic step 2: the Lens cursor types into the page, captioned");
    expect(await ag(2, () => { const c = document.querySelector("#byo .ag-card"); return !c.hidden && c.querySelector("iframe")?.contentDocument?.querySelector("[class^='ap-']"); }), "Agentic step 3: the risky step shows the real approval card");
    expect(await D(() => document.querySelectorAll("#byo .ag-plan li.is-done").length >= 3), "the action trail marks the steps done");
  }
  // The Theme lab: hover previews, leaving restores, click keeps; no stray focus rings or half-faded windows.
  await page.evaluate(() => document.getElementById("themes").scrollIntoView({ block: "start" }));
  await page.waitForSelector("#lab-desk .lw", { timeout: 20000 });
  await page.waitForTimeout(800);
  const kept = await D(() => window.lensSite.lab.committed?.p.id);
  await page.hover('.lab-picks [data-pack="everforest-dark"]'); await page.waitForTimeout(300);
  expect((await D(() => window.lensSite.lab.pack?.id)) === "everforest-dark", "hovering a theme previews it");
  await page.mouse.move(5, 5); await page.waitForTimeout(300);
  expect((await D(() => window.lensSite.lab.pack?.id)) === kept, "leaving the picker restores the kept theme");
  await page.click('.lab-picks [data-pack="rose-pine"]'); await page.waitForTimeout(1600);
  expect((await D(() => window.lensSite.lab.committed?.p.id)) === "rose-pine", "clicking a theme keeps it");
  const stray = await D(() => [...document.querySelectorAll(".lw")].filter((w) => w.matches(":focus-visible") && !w.classList.contains("was-clicked")).length);
  expect(!stray, "no window shows a focus ring it wasn't given");
  const faded = await D(() => [...document.querySelectorAll(".lw, .lx-over")].filter((e) => { if (e.closest("[hidden]") || !e.offsetParent) return false; const o = +getComputedStyle(e).opacity; return o > 0.02 && o < 0.98 && !e.getAnimations({ subtree: true }).some((a) => a.playState === "running"); }).map((e) => e.className));
  expect(!faded.length, "nothing left half-faded after animations", faded.join(", "));
  await page.click("[data-all]"); await page.waitForTimeout(250);
  await page.fill("#lab-q", "dracula"); await page.waitForTimeout(200);
  expect((await page.locator(".lab-pop .tp").count()) >= 1, "all-themes search finds Dracula");
  await page.keyboard.press("Escape");
  await page.click("[data-shuffle]"); await page.waitForTimeout(600);
  expect((await D(() => window.lensSite.lab.committed?.p.id)) !== "rose-pine", "Shuffle changes the theme");
  // Accents: each named colour is a radio with its name shown, and picking it repaints the desk: the
  // dock's running marks, the music window's primary button, the browser's space dot and the active
  // window's focus border all compute to that colour once the short transition has run.
  {
    const accents = await D(() => [...document.querySelectorAll(".lab-acc [data-acc]")].map((b) => [b.dataset.acc, b.getAttribute("aria-label")]).filter(([h]) => h));
    expect(accents.length >= 8 && (await D(() => document.querySelector(".lab-acc").getAttribute("role"))) === "radiogroup", "the accents are a radio group of named colours", String(accents.length));
    const painted = (hex) => D((hex) => {
      const n = parseInt(hex.slice(1), 16), rgb = `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
      const lab = document.getElementById("lab-desk"), hits = new Set();
      const docs = [...lab.querySelectorAll("iframe")].map((f) => { try { return f.contentDocument; } catch { return null; } }).filter(Boolean);
      for (const d of docs) for (const [sel, prop] of [[".dock-indicator", "backgroundColor"], [".lm-pill-primary", "backgroundColor"], [".lb-space-dot", "backgroundColor"]]) for (const el of d.querySelectorAll(sel)) if (getComputedStyle(el)[prop] === rgb) hits.add(sel);
      const lw = lab.querySelector(".lw.is-focused");
      if (lw && getComputedStyle(lw).boxShadow.includes(rgb)) hits.add("focus border");
      return [...hits];
    }, hex);
    const missed = [];
    // The music window is the active one, as when the lab opens (earlier checks moved windows around).
    await D(() => window.lensSite.lab.reset());
    await page.waitForFunction(() => { const d = window.lensSite.lab; return d.wins.size >= 2 && [...d.wins.values()].every((w) => w.ready); }, null, { timeout: 15000 }).catch(() => {});
    await D(() => { const d = window.lensSite.lab, w = d.byApp("music"); if (w) d.focus(w.id); });
    await page.waitForTimeout(600);
    for (const [hex, name] of accents) {
      await page.click(`.lab-acc [data-acc="${hex}"]`);
      let hits = [];
      for (let t = 0; t < 30 && hits.length < 4; t++) { await page.waitForTimeout(150); hits = await painted(hex); }
      const shown = await D(() => document.querySelector(".lab-acc-now")?.textContent ?? "");
      const checked = await D((h) => document.querySelector(`.lab-acc [data-acc="${h}"]`).getAttribute("aria-checked"), hex);
      if (hits.length < 4 || !shown.includes(name) || checked !== "true") missed.push(`${name} ${hex}: ${hits.join("+") || "nothing"} in the accent, label “${shown}”, checked=${checked}`);
    }
    expect(!missed.length, "each accent visibly repaints the desk (dock marks, primary button, space dot, focus border) and shows its name", missed.join("; "));
    await page.click('.lab-acc [data-acc=""]'); await page.waitForTimeout(300);
    expect((await D(() => window.lensSite.lab.committed?.acc)) == null, "the theme's own accent can be picked back");
  }
  // Icons: every icon on the page comes from the shared set (or the brand folder, or the apps' own repos).
  const odd = await D(() => [...document.querySelectorAll("main img, #desk-host img, #lab-desk img")].map((i) => i.getAttribute("src") ?? "").filter((s) => s && !/media\/icons\/|media\/apps\/|media\/shot-|media\/core-|media\/surface-|brand\//.test(s)));
  expect(!odd.length, "icons come from the shared icon set", odd.slice(0, 5).join(", "));
  // The sections: one exhibit each, and every exhibit is a real surface.
  {
    const sections = await D(() => [...document.querySelectorAll("main section[id]")].map((x) => x.id));
    expect(!sections.includes("market") && !(await D(() => /Share your whole setup/i.test(document.querySelector("main").textContent))), "the marketplace section is gone");
    const cards = await D(() => [...document.querySelectorAll("[data-app-card]")].map((c) => c.dataset.appCard));
    const names = await D(() => [...document.querySelectorAll("#apps h3")].map((h) => h.textContent.trim()));
    expect(cards.length >= 10 && new Set(cards).size === cards.length && new Set(names).size === names.length, "every app is listed once", cards.join(","));
    // Smaller apps are small pictures in one compact grid; the main features get the big exhibits.
    const minis = await D(() => [...document.querySelectorAll("#core-grid .mini")].map((m) => m.textContent));
    expect(minis.length >= 14 && ["Lens Music", "Lens Cleaner", "Notes", "Lens Feeds", "Lens Messages", "ThumbDesk", "Monitor"].every((n) => minis.some((t) => t.includes(n))), "the small apps (Music, Cleaner, Notes, Feeds, Messages, ThumbDesk and the core apps) share one compact grid", String(minis.length));
    const sizes = await D(() => ({ mini: Math.max(...[...document.querySelectorAll("#core-grid .mini-pic")].map((e) => e.getBoundingClientRect().width)), main: Math.max(...[...document.querySelectorAll(".xmain")].map((e) => e.getBoundingClientRect().width)) }));
    expect(sizes.mini <= 360 && sizes.main <= 1110, "exhibits stay a sensible size: small apps as small pictures, main features no wider than about 1100 px", JSON.stringify(sizes));
    // Lens Apps: a real screenshot on top of each card (Lens's drawn tile where the repo has none),
    // lazy, sized so nothing shifts, with who makes it (linked), the licence and a screenshot credit.
    const apps = await D(() => [...document.querySelectorAll("#apps .apt")].map((c) => { const i = c.querySelector(".apt-shot img"); return { id: c.dataset.appCard, img: !!i, lazy: i?.loading === "lazy", sized: !!(i?.getAttribute("width") && i?.getAttribute("height")), glyph: !!c.querySelector(".apt-shot .app-ic svg"), by: !!c.querySelector(".apt-by a[href^='https://']"), credit: c.querySelector(".apt-credit")?.textContent ?? "", get: !!c.querySelector("[data-get]") }; }));
    const badApps = apps.filter((a) => !(a.img || a.glyph) || (a.img && (!a.lazy || !a.sized || !/^Screenshot: /.test(a.credit))) || !a.by || !a.get).map((a) => a.id);
    expect(apps.length === 12 && apps.filter((a) => a.img).length >= 8 && !badApps.length, "Lens Apps cards: a lazy, sized screenshot (or Lens's tile), “by” the maker linked to the source, the licence, a screenshot credit and Get", badApps.join(", "));
    expect(await D(() => /screenshots and trademarks belong to each project/i.test(document.querySelector("#apps .apps-fine")?.textContent ?? "")), "the Lens Apps note credits each project's names, screenshots and trademarks");
    expect(!(await page.$("#f-magic video, #byo video, #f-browser video")), "the exhibits are live surfaces, not clips");
    expect(!!(await page.$("#how-themes")) && (await D(() => /\.lenstheme/.test(document.getElementById("how-themes").textContent))), "“How themes work” sits under the theme lab");
    for (const id of ["f-magic", "byo", "f-browser"]) {
      await page.evaluate((i) => document.getElementById(i).scrollIntoView({ block: "center" }), id);
      const ok = await page.waitForFunction((i) => { const hs = [...document.querySelectorAll(`#${i} .xf`)]; return hs.length && hs.every((h) => { if (h.closest("[hidden]")) return true; const d = h.querySelector("iframe")?.contentDocument; return h.classList.contains("is-ready") && d && (!h.dataset.marker || d.querySelector(h.dataset.marker)); }); }, id, { timeout: 20000 }).then(() => true, () => false);
      expect(ok, `#${id}: every exhibit frame holds its real surface`);
    }
    expect((await page.locator("#mx .xdots i").count()) === 3 && !!(await page.$("#mx [data-xpause]")), "the Magic Mouse exhibit loops three steps, with Pause");
    // Agentic desktop: the action trail, one step waiting for an OK, the real desk and the real card.
    expect((await page.locator("#byo .ag-plan > li").count()) === 5 && (await page.locator("#byo .ag-plan > li.is-ask").count()) >= 1, "the agent exhibit shows an action trail with the risky step waiting for an OK");
    expect(!!(await page.$("#byo #agent-desk .lx-dock")) && (await page.locator("#byo .ag-card .xf").count()) === 1, "the agent exhibit is a real desk and the real approval card");
    expect(!(await D(() => /asks first|AI that asks/i.test([...document.querySelectorAll("main h1, main h2")].map((h) => h.textContent).join(" ")))), "“asks first” is not a headline");
    // Lens Browser: the steps are states of the real BrowserSurface.
    await page.evaluate(() => document.getElementById("f-browser").scrollIntoView({ block: "center" }));
    await page.mouse.move(2, 2);
    expect(await page.waitForFunction(() => { const h = document.querySelector("#f-browser .xf"); return h.classList.contains("is-ready") && h.querySelector("iframe").contentDocument?.querySelector(".lb-root") && /scene=agent/.test(h.querySelector("iframe").src); }, null, { timeout: 15000 }).then(() => true, () => false), "the browser exhibit moves through the real browser by itself");
    expect((await page.locator("#f-browser .why li").count()) === 5, "Lens Browser lists five things it does differently");
  }
  // The Guide: the orb opens it, / too; a chip acts on the desk; Esc collapses it.
  await page.click("#guide-orb");
  // It opens out of the orb where it sits: a growing circle, never a flip or a fly-in.
  await page.waitForSelector("#guide-window:not([hidden])", { timeout: 8000 }).catch(() => {});
  const grow = await D(() => { const w = document.getElementById("guide-window"); return w ? `${w.dataset.opened}|${w.getAnimations().map((a) => a.effect.getKeyframes().map((k) => Object.keys(k).join("+")).join(">")).join("|")}` : "missing"; });
  expect(/^grow/.test(grow) && !/transform/.test(grow), "Lens opens out of its orb without flipping", grow);
  await page.waitForTimeout(600);
  expect(await page.$eval("#guide-window", (w) => !w.hidden), "the Lens orb opens the Guide");
  await page.click('.gw-chips [data-chip="Tile two windows"]');
  await page.waitForTimeout(500);
  await page.waitForFunction(() => [...document.querySelectorAll(".gm.steps")].some((s) => s.classList.contains("finished")), null, { timeout: 15000 }).catch(() => {});
  const tiles = await D(() => [...window.lensSite.lab.wins.values()].filter((w) => !w.min && w.tile).length);
  expect(tiles >= 1, "the Guide's “Tile two windows” tiles the desk");
  await page.screenshot({ path: join(shots, "guide-acting.png") });
  // Waits for the state itself: fixed sleeps here flaked on slow CI runners.
  await page.locator("#guide-window textarea, #guide-window input").first().focus().catch(() => {});
  await page.keyboard.press("Escape");
  expect(await page.waitForFunction(() => document.getElementById("guide-window").hidden, null, { timeout: 5000 }).then(() => true, () => false), "Esc collapses the Guide");
  await page.locator("body").press("/");
  expect(await page.waitForFunction(() => !document.getElementById("guide-window").hidden, null, { timeout: 5000 }).then(() => true, () => false), "/ opens the Guide");
  await page.waitForTimeout(500);
  await page.keyboard.press("Escape");
  if ((await D(() => document.documentElement.scrollWidth)) > 1441) problems.push("interaction: the page is wider than the window");
  const cls = await D(() => window.__cls);
  report.interaction = { checks: done.length, cls: Math.round(cls * 1000) / 1000, errors: errs.length };
  if (cls > 0.1) problems.push(`interaction: layout shift ${cls.toFixed(3)} (> 0.1): ${(await D(() => window.__clsSrc.filter((x) => parseFloat(x) > 0.01).slice(0, 6).join(" | ")))}`);
  problems.push(...[...new Set(errs)].map((e) => `interaction: ${e}`));
  await ctx.close();

// ---- live-site polish checks (from the first real-PC recording) ---------------------------------
{
  const lp = (m) => problems.push(`polish: ${m}`);
  const rect = (r) => r && r.width > 0 && r.height > 0;
  const hit = (a, b) => rect(a) && rect(b) && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  for (const [w, h] of [[1440, 900], [1920, 1080]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    await page.goto(base + "index.html");
    await page.waitForTimeout(2500);
    // No "★ 0" / "0" star counts.
    const zero = await page.evaluate(() => [...document.querySelectorAll(".stars")].map((e) => e.textContent.replace(/[★\s]/g, "")).filter((t) => t === "0" || t === ""));
    if (zero.length) lp(`${w}px: a GitHub star count of 0 (or empty) is shown`);
    // The Dock widget is wide on wide screens.
    const dw = await page.$eval("#dock-desk", (d) => d.getBoundingClientRect().width);
    if (w >= 1440 && dw < 1100) lp(`${w}px: the Dock widget is only ${Math.round(dw)} px wide`);
    // The rainbow word uses the full spectrum (not the accent colour).
    const rb = await page.$eval(".hero .lens-rainbow", (e) => getComputedStyle(e).backgroundImage);
    const dark = /255, 95, 143|ff5f8f/i.test(rb) && /95, 227, 166|5fe3a6/i.test(rb), light = /217, 36, 92|d9245c/i.test(rb) && /15, 138, 95|0f8a5f/i.test(rb);
    if (!dark && !light) lp(`${w}px: "everything" doesn't use the nebula spectrum`);
    // The Guide orb and its label never sit on footer text when scrolled to the end.
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(400);
    await page.hover("#guide-orb").catch(() => {});
    await page.waitForTimeout(400);
    const over = await page.evaluate(() => {
      const o = document.getElementById("guide-orb").getBoundingClientRect();
      const texts = [...document.querySelectorAll("footer.site p, footer.site a, footer.site span, footer.site small")].filter((e) => e.textContent.trim() && !e.querySelector("p, a")).map((e) => e.getBoundingClientRect());
      return texts.some((b) => b.width && o.left < b.right && b.left < o.right && o.top < b.bottom && b.top < o.bottom);
    });
    if (over) lp(`${w}px: the Guide orb covers footer text at the end of the page`);
    await ctx.close();
  }
}
// ---- icons stay in their box --------------------------------------------------------------------------
// An icon (an svg or img inside an icon holder, or any inline svg outside a live surface or picture) must
// never render larger than its intended box: 64 px for icon classes, 96 px for any other inline svg.
// A stylesheet that stops applying (an unclosed @media once blew five icons up to 1152 px) fails here.
{
  for (const w of [375, 768, 1440]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 } });
    const page = await ctx.newPage();
    for (const pg of ["index.html", "download.html", "features.html"]) {
      const ok = await page.goto(base + pg).then((r) => r?.ok(), () => false);
      if (!ok) continue;
      await page.waitForTimeout(600);
      const big = await page.evaluate(() => {
        const out = [];
        const ICON = "[class*='-ic'], [class^='ic'], .k-ic, .why-ic, .app-ic, .sc-ic, .byo-ic, .learn-ic, .sb-btn, .btn, .kicker, .get-pill";
        for (const el of document.querySelectorAll("main svg, main img, header svg, header img, footer svg, footer img")) {
          // .dw-pic: the Dock picker's drawings are pictures bounded by their card (checked in the widget's own test).
          if (el.closest(".xstage, .desk-host, .lab, .dr-frame, .hero-logo, figure, .mini-pic, .clip, .ov-media, .gw, iframe, .dw-pic")) continue;
          if (el.ownerSVGElement) continue;
          const r = el.getBoundingClientRect();
          if (r.width < 1) continue;
          const inIcon = !!el.closest(ICON);
          const limit = inIcon ? 64 : el.tagName.toLowerCase() === "svg" ? 96 : Infinity;
          if (r.width > limit || r.height > limit) out.push(`${el.tagName.toLowerCase()} in .${el.parentElement?.className || el.parentElement?.tagName} ${Math.round(r.width)}×${Math.round(r.height)}`);
        }
        return out;
      });
      if (big.length) problems.push(`icons: ${pg} at ${w}px: ${big.length} icon(s) larger than their box: ${big.slice(0, 4).join("; ")}`);
    }
    await ctx.close();
  }
}

// ---- the dock's Settings pop-out on a desk (the Theme lab's while the hero desk is off) -----------------
// Settings opens from the dock's gear joined to the dock (overlapping its top edge by 1 px, at its own
// 760 px width), apart and 12 px above the bar on the Taskbar style; a second click closes it, and opening
// Search closes it, as in the app (src-tauri/src/app/flyout_geom.rs).
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(base + "index.html");
  await toLab(page);
  await waitDesk(page);
  const labDock = await dockIn(page, "#lab-desk");
  const dockF = () => labDock;
  const geo = () => page.evaluate(() => {
    const d = window.lensSite.lab, w = d.fly;
    const p = d.frame.contentDocument.querySelector(".dock-pill"), r = p.getBoundingClientRect();
    return w && { y: w.y, h: w.h, w: w.w, x: w.x, fused: w.el.classList.contains("is-fused"), pillTop: d.frame.offsetTop + r.top, pillFused: p.classList.contains("is-fused-top"), W: d.W };
  });
  for (const style of ["floating", "taskbar", "slim", "islands"]) {
    await page.evaluate((s2) => window.lensSite.lab.dockStyle(s2), style);
    await page.waitForTimeout(1200);
    await dockF().click("button[aria-label='Settings']");
    await page.waitForTimeout(900);
    const g = await geo();
    if (!g) { problems.push(`pop-out: ${style}: the dock's gear doesn't open Settings`); continue; }
    if (style === "taskbar") {
      if (g.fused || Math.abs(g.pillTop - (g.y + g.h) - 12) > 2 || g.w > 680) problems.push(`pop-out: taskbar: Settings should open apart, 12 px above the bar, at most 680 px wide (${JSON.stringify(g)})`);
    } else if (!g.fused || !g.pillFused || Math.abs(g.y + g.h - g.pillTop - 1) > 1.5 || g.w < 760 || g.w > g.W * 0.75 || Math.abs(g.x + g.w / 2 - g.W / 2) > 2) problems.push(`pop-out: ${style}: Settings should open joined to the dock, 760 px wide and centred (${JSON.stringify(g)})`);
    await dockF().click("button[aria-label='Settings']");
    await page.waitForTimeout(700);
    if (await geo()) problems.push(`pop-out: ${style}: a second click on the gear doesn't close Settings`);
  }
  await page.evaluate(() => window.lensSite.lab.dockStyle("floating"));
  await page.waitForTimeout(900);
  await dockF().click("button[aria-label='Settings']"); await page.waitForTimeout(700);
  await dockF().click(".dock-search-mag-btn"); await page.waitForTimeout(900);
  if (await geo()) problems.push("pop-out: opening Search doesn't close Settings");
  await page.keyboard.press("Escape"); await page.waitForTimeout(500);
  await dockF().click("button[aria-label='Settings']"); await page.waitForTimeout(900);
  await page.evaluate(() => window.lensSite.lab.fly?.frame.contentWindow.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  await page.waitForTimeout(600);
  if (await geo()) problems.push("pop-out: Esc doesn't close Settings");
  await ctx.close();
}

  // OS detection: the hero's Download adapts, honestly.
  for (const [ua, want, href] of [["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36", "Download for Windows", "download.html"], ["Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36", "Get Lens for Windows", "#platforms"]]) {
    const c = await browser.newContext({ viewport: { width: 1280, height: 800 }, userAgent: ua });
    const pg = await c.newPage();
    await pg.goto(base + "index.html");
    const got = await pg.$eval(".hero [data-dl]", (a) => ({ lbl: a.querySelector(".lbl").textContent, href: a.getAttribute("href") }));
    if (got.lbl !== want || !got.href.includes(href)) problems.push(`os detection (${want}): ${JSON.stringify(got)}`);
    await c.close();
  }
  // The header marks the current page.
  {
    const c = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const pg = await c.newPage();
    await pg.goto(base + "download.html");
    const cur = await pg.$eval('#site-nav a[aria-current="page"]', (a) => a.textContent).catch(() => "");
    if (cur !== "Download") problems.push(`header: the Download page marks "${cur}" as current`);
    await c.close();
  }
}

// Appearance variants: set the preference, reload, audit contrast and screenshot.
for (const [label, pref, packId] of VARIANTS) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  await page.goto(base + "index.html");
  if (packId) {
    // Choose the pack through the header's appearance popover, like a visitor would.
    await page.click(".appear-btn");
    await page.waitForFunction(() => document.querySelectorAll("#n-pack option").length > 1);
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
  if (label === "accent-mint") { await page.evaluate(() => scrollTo(0, 0)); await page.click(".appear-btn"); await page.waitForTimeout(300); await page.screenshot({ path: join(shots, "variant-appearance-open.png") }); }
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
console.log("interaction", JSON.stringify(report.interaction));
console.log("desk", JSON.stringify(report.stage));
console.log(`${seen.size} internal links checked · axe ${axe ? "on" : "not installed (built-in checks only)"}`);
if (problems.length) { console.log(problems.slice(0, 80).join("\n")); console.log(`${problems.length} problem(s)`); process.exit(1); }
console.log("no problems");
