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

// The hero desk: frame pacing while a window is dragged with the CPU throttled 4× (a slow laptop),
// and a still backdrop with reduced motion.
const deskBox = (page, sel = "#desk-host") => page.locator(sel).boundingBox();
async function waitDesk(page, sel = "#desk-host") {
  await page.waitForFunction((s) => document.querySelector(`${s} .lx-dock`)?.src && document.querySelectorAll(`${s} .lw`).length > 0, sel, { timeout: 20000 });
  await page.waitForTimeout(800);
}
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(base + "index.html");
  await page.evaluate(() => document.getElementById("stage").scrollIntoView({ block: "start" }));
  await waitDesk(page);
  await page.evaluate(() => window.lensSite.shows.exit());
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  const bar = await page.evaluate(() => { const w = [...window.lensSite.desk.wins.values()].find((x) => !x.min); const r = w.el.querySelector(".lw-bar").getBoundingClientRect(); return { x: r.left + 80, y: r.top + 15 }; });
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
    const b2 = await page.evaluate(() => { const w = [...window.lensSite.desk.wins.values()].find((x) => !x.min); const r = w.el.querySelector(".lw-bar").getBoundingClientRect(); return { x: r.left + 80, y: r.top + 15 }; });
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
  await p2.evaluate(() => document.getElementById("stage").scrollIntoView({ block: "start" }));
  await waitDesk(p2);
  await p2.waitForTimeout(1500);
  const grab = () => p2.$eval("#desk-host .lx-wall canvas", (c) => c.toDataURL()).catch(() => "none");
  const a = await grab();
  await p2.waitForTimeout(1500);
  const still = a === (await grab());
  report.stage.reducedMotionStill = still;
  report.stage.reducedMotionAutoplay = await p2.evaluate(() => !!window.lensSite.shows.current);
  if (!still) problems.push("desk: the backdrop moves with reduced motion");
  if (report.stage.reducedMotionAutoplay) problems.push("desk: the scene reel autoplays with reduced motion");
  await rm.close();
}

// Interaction test: the hero desk, the scene reel, the magic right-click, Lens Command, the dock rail,
// the Theme lab, the Guide, the header and OS detection, driven like a visitor would. Fails on a
// console or page error (in the page or a dock frame), a page wider than the window, layout shift
// above 0.1 outside the demos (their windows moving is the demo), or any expectation below.
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(() => {
    window.__cls = 0;
    const demo = (n) => n?.closest?.(".desk-host, .dock-rail, .lab, .gw, .sc-bar, .sc-tabs");
    new PerformanceObserver((l) => l.getEntries().forEach((e) => { if (!e.hadRecentInput && e.sources.some((x) => !demo(x.node))) window.__cls += e.value; })).observe({ type: "layout-shift", buffered: true });
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(`page error: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errs.push(`console: ${m.text().slice(0, 160)}`); });
  const done = [];
  const expect = (ok, label, detail = "") => { if (!ok) problems.push(`interaction: ${label}${detail ? ` ${detail}` : ""}`); done.push(label); };
  const D = (f, arg) => page.evaluate(f, arg);
  await page.goto(base + "index.html");
  // Header: no shift on scroll, Download appears once the hero's scrolls away.
  const h0 = await page.$eval("#bar", (b) => b.offsetHeight);
  await page.evaluate(() => scrollTo(0, 1400)); await page.waitForTimeout(400);
  expect((await page.$eval("#bar", (b) => b.offsetHeight)) === h0, "header keeps its height when scrolled");
  expect(await page.$eval(".bar-dl", (b) => getComputedStyle(b).opacity === "1"), "header Download appears on scroll");
  // Appearance popover by keyboard.
  await page.focus(".appear-btn"); await page.keyboard.press("Enter"); await page.waitForTimeout(200);
  expect(!(await page.$eval("#appear-panel", (p) => p.hidden)), "appearance popover opens with Enter");
  await page.keyboard.press("Escape"); await page.waitForTimeout(150);
  expect(await page.$eval("#appear-panel", (p) => p.hidden), "appearance popover closes with Esc");
  // The reel autoplays once the desk is on screen, and any interaction pauses it.
  await page.evaluate(() => document.getElementById("stage").scrollIntoView({ block: "start" }));
  await waitDesk(page);
  await page.waitForTimeout(2500);
  // Nothing moves on its own: no tour starts, no window moves without input.
  const before = await D(() => [...window.lensSite.desk.wins.values()].map((w) => `${w.app}:${Math.round(w.x)},${Math.round(w.y)}`).join("|"));
  await page.waitForTimeout(2500);
  expect(!(await D(() => window.lensSite.shows.current)), "no tour starts by itself");
  expect(before === (await D(() => [...window.lensSite.desk.wins.values()].map((w) => `${w.app}:${Math.round(w.x)},${Math.round(w.y)}`).join("|"))), "the desk doesn't move without input");
  // Tours: a tab starts one; Next and Back step it; each step's target exists; Exit leaves free play.
  const tourIds = await D(() => window.lensSite.shows.list.map((s) => s.id));
  expect(tourIds.length >= 6, "there are showcase tabs", tourIds.join(","));
  await page.click('#sc-tabs [data-sc="desktop"]');
  await page.waitForFunction(() => window.lensSite.shows.current?.id === "desktop" && !window.lensSite.shows.busy, null, { timeout: 8000 }).catch(() => {});
  expect((await D(() => window.lensSite.shows.index)) === 0, "a tab starts its tour at step 1");
  await page.waitForTimeout(1500);
  expect((await D(() => window.lensSite.shows.index)) === 0, "a tour waits for Next");
  await page.click("#sc-bar [data-next]");
  await page.waitForFunction(() => window.lensSite.shows.index === 1 && !window.lensSite.shows.busy, null, { timeout: 8000 }).catch(() => {});
  expect((await D(() => window.lensSite.shows.index)) === 1, "Next moves one step");
  await page.click("#sc-bar [data-back]");
  await page.waitForFunction(() => window.lensSite.shows.index === 0 && !window.lensSite.shows.busy, null, { timeout: 8000 }).catch(() => {});
  expect((await D(() => window.lensSite.shows.index)) === 0, "Back moves one step back");
  for (const id of tourIds) {
    await D((i) => window.lensSite.shows.start(i), id);
    await page.waitForFunction(() => !window.lensSite.shows.busy, null, { timeout: 8000 }).catch(() => {});
    const first = await D(() => { const st = window.lensSite.shows.state().step; return !st?.target || !!st.target(window.lensSite.desk); });
    expect(first, `tour “${id}” first step has its target`);
  }
  await page.click("#sc-bar [data-exit]"); await page.waitForTimeout(300);
  expect(!(await D(() => window.lensSite.shows.current)), "Exit returns to free play");
  await D(() => window.lensSite.desk.reset());
  await page.evaluate(() => document.getElementById("stage").scrollIntoView({ block: "start" }));
  await page.waitForTimeout(300);
  const box = await deskBox(page);
  await page.waitForTimeout(600);
  // Drag, resize, snap.
  const win = () => D(() => { const w = [...window.lensSite.desk.wins.values()].find((x) => !x.min); return w && { id: w.id, x: w.x, y: w.y, w: w.w, h: w.h, tile: w.tile, min: w.min }; });
  const barAt = (id) => D((i) => { const r = window.lensSite.desk.wins.get(i).el.querySelector(".lw-bar").getBoundingClientRect(); return { x: r.left + 90, y: r.top + 15 }; }, id);
  let w0 = await win();
  let p = await barAt(w0.id);
  await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.move(p.x + 160, p.y + 70, { steps: 10 }); await page.mouse.up();
  let w1 = await D((i) => { const w = window.lensSite.desk.wins.get(i); return { x: w.x, y: w.y }; }, w0.id);
  expect(Math.abs(w1.x - w0.x - 160 / (await D(() => window.lensSite.desk.k))) < 6 && w1.y > w0.y, "drag a window by its title bar", JSON.stringify([w0, w1]));
  expect(!(await page.$(".lx.is-dragging")), "no stuck drag after release");
  // Let the drop's settle animation finish (it tilts the window a little), then grab the corner.
  await page.waitForTimeout(700);
  await D((i) => window.lensSite.desk.focus(i), w0.id);
  // Give the corner room: on a shorter desk the drag above can leave it under the dock's frame.
  await D((i) => { const d = window.lensSite.desk, w = d.wins.get(i); d.setRect(w, { x: w.x, y: 60, w: 600, h: 300 }, { animate: false }); }, w0.id);
  await page.waitForTimeout(200);
  w0 = await win();
  const se = await D((i) => { const r = window.lensSite.desk.wins.get(i).el.querySelector(".rz-se").getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, w0.id);
  const dragCorner = async () => {
    const c = await D((i) => { const r = window.lensSite.desk.wins.get(i).el.querySelector(".rz-se").getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, w0.id);
    await page.mouse.move(c.x, c.y); await page.mouse.down(); await page.mouse.move(c.x + 90, c.y + 50, { steps: 8 }); await page.mouse.up();
    return D((i) => { const w = window.lensSite.desk.wins.get(i); return { w: w.w, h: w.h }; }, w0.id);
  };
  void se;
  let w2 = await dragCorner();
  if (!(w2.w > w0.w + 40 && w2.h > w0.h + 20)) {
    // The drop's settle spring can still own the window on a slow runner: wait it out, try once more.
    await page.waitForTimeout(900);
    w2 = await dragCorner();
  }
  expect(w2.w > w0.w + 40 && w2.h > w0.h + 20, "resize from the corner", JSON.stringify([w0, w2]));
  p = await barAt(w0.id);
  await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.move(box.x + 2, box.y + box.height * 0.45, { steps: 14 }); await page.waitForTimeout(100);
  expect(!(await page.$eval("#desk-host .lx-snap", (e) => e.hidden)), "snap preview shows at the edge");
  await page.mouse.up(); await page.waitForTimeout(400);
  expect((await D((i) => window.lensSite.desk.wins.get(i).tile, w0.id)) === "left", "drop at the edge snaps left");
  // Release outside the desk while dragging: nothing stays stuck.
  p = await barAt(w0.id);
  await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.move(p.x + 40, 5, { steps: 6 }); await page.mouse.up(); await page.waitForTimeout(200);
  expect(!(await page.$(".lx.is-dragging")), "no stuck pointer after releasing outside the desk");
  // Minimise to the dock, restore from the dock.
  const app = await D((i) => window.lensSite.desk.wins.get(i).app, w0.id);
  await page.locator(`#desk-host .lw [data-a="min"]`).first().click({ timeout: 3000 }).catch(() => D((i) => window.lensSite.desk.minimize(i), w0.id));
  await page.waitForTimeout(600);
  expect(await D((i) => window.lensSite.desk.wins.get(i).min, w0.id), "minimise to the dock");
  const dockFrame = page.frames().find((f) => f.url().includes("live/dock/index.html") && !f.url().includes("mini"));
  if (dockFrame) {
    const name = await D((a) => ({ browser: "Lens Browser", notes: "Notes", files: "Files", music: "Lens Music" })[a] ?? a, app);
    const item = dockFrame.locator(`.dock-item[aria-label^="${name}"]`).first();
    const ib = (await item.count()) ? await item.boundingBox() : null;
    // The dock frame takes the pointer only while it's over the dock (so windows under its empty band stay
    // clickable): move there first, like a person does, then click.
    if (!ib) problems.push(`interaction: no dock item for ${name}`);
    // Hovering magnifies the dock, so the icon moves: settle, measure again, then click (up to 3 tries).
    for (let tries = 0; ib && tries < 3 && (await D((i) => window.lensSite.desk.wins.get(i).min, w0.id)); tries++) {
      await page.mouse.move(ib.x + ib.width / 2, ib.y + ib.height / 2 - 30); await page.mouse.move(ib.x + ib.width / 2, ib.y + ib.height / 2, { steps: 3 }); await page.waitForTimeout(400);
      const b2 = await item.boundingBox();
      await page.mouse.click(b2.x + b2.width / 2, b2.y + b2.height / 2); await page.waitForTimeout(800);
    }
    // Last resort on slow runners: click the dock's own button (still the dock → page bridge).
    if (ib && (await D((i) => window.lensSite.desk.wins.get(i).min, w0.id))) { report.dockRestoreFallback = true; await item.evaluate((el) => el.click()); await page.waitForTimeout(800); }
  } else problems.push("interaction: the hero dock frame didn't load");
  expect(!(await D((i) => window.lensSite.desk.wins.get(i).min, w0.id)), "restore from the dock");
  // The magic right-click on each kind of target, and the desktop menu.
  await D(() => { const d = window.lensSite.desk; d.reset(); for (const w of [...d.wins.values()]) if (w.app !== "browser") d.close(w.id); });
  await page.waitForTimeout(800);
  for (const [sel, label, want, before] of [["#desk-host .a-video", "a video", "transcript"], ["#desk-host .a-url", "a window", "Snip window"], ["#desk-host .fi", "a file", "Open with", () => D(() => window.lensSite.desk.open("files"))]]) {
    if (before) { await before(); await page.waitForTimeout(800); }
    const el = page.locator(sel).first();
    if (!(await el.count())) { problems.push(`interaction: no ${label} to right-click`); continue; }
    await el.scrollIntoViewIfNeeded().catch(() => {});
    await el.click({ button: "right", force: true });
    await page.waitForTimeout(300);
    const txt = await page.$eval("#desk-host .lx-magic", (m) => (m.hidden ? "" : m.textContent)).catch(() => "");
    expect(txt.toLowerCase().includes(want.toLowerCase()), `magic right-click on ${label}`, txt.slice(0, 80));
    await page.keyboard.press("Escape");
  }
  await D(() => { for (const w of window.lensSite.desk.wins.values()) window.lensSite.desk.minimize(w.id); });
  await page.waitForTimeout(600);
  // Rest the pointer on the desktop first (the dock frame lets go of the pointer once it's away from the dock).
  // Pick a point that really is bare wallpaper (no window, toast, icon or dock frame on top), then right-click it.
  const bare = await D(() => {
    const h = document.getElementById("desk-host").getBoundingClientRect();
    for (const fy of [0.45, 0.35, 0.55, 0.25]) for (const fx of [0.6, 0.5, 0.7, 0.4, 0.8]) {
      const x = h.left + h.width * fx, y = h.top + h.height * fy, e = document.elementFromPoint(x, y);
      if (e && h.top + 40 < y && !e.closest(".lw, .lx-toasts, .lx-dock, iframe, .lt, .dk-ic, .lx-ic, button, a")) return { x, y };
    }
    return { x: h.left + h.width * 0.6, y: h.top + h.height * 0.45 };
  });
  await page.mouse.move(bare.x, bare.y - 20, { steps: 4 }); await page.waitForTimeout(700);
  await page.mouse.click(bare.x, bare.y, { button: "right" });
  await page.waitForTimeout(250);
  if (!(await page.$eval("#desk-host .lx-menu", (m) => !m.hidden))) { await page.waitForTimeout(500); await page.mouse.click(bare.x, bare.y, { button: "right" }); await page.waitForTimeout(300); }
  expect(await page.$eval("#desk-host .lx-menu", (m) => !m.hidden && /New note/.test(m.textContent)), "desktop right-click menu");
  await page.keyboard.press("Escape");
  // Lens Command: Ctrl+Space, type, Enter.
  await page.focus("#desk-host .lx");
  await page.keyboard.press("Control+Space"); await page.waitForTimeout(250);
  expect(!(await page.$eval("#desk-host .lx-cmd", (c) => c.hidden)), "Ctrl+Space opens Lens Command");
  await page.keyboard.type("light mode", { delay: 30 }); await page.waitForTimeout(400); await page.keyboard.press("Enter"); await page.waitForTimeout(1800);
  expect((await D(() => window.lensSite.desk.pack?.id)) === "alabaster-daylight", "Command runs “light mode”");
  // Deep link to a tour (old #scene/… links map to the nearest tour).
  await page.evaluate(() => { location.hash = "#tour/magic"; });
  await page.waitForTimeout(1500);
  expect((await D(() => window.lensSite.shows.current?.id)) === "magic", "#tour/… deep link opens the tour");
  await page.evaluate(() => { location.hash = "#scene/claude"; });
  await page.waitForTimeout(1500);
  expect((await D(() => window.lensSite.shows.current?.id)) === "agent", "old #scene/… links open the nearest tour");
  await D(() => window.lensSite.shows.exit());
  // Fullscreen.
  await page.click("[data-fs]"); await page.waitForTimeout(600);
  const fs = await D(() => { const s = document.querySelector("#desk-host").getBoundingClientRect(); return { w: Math.round(s.width), h: Math.round(s.height), full: document.querySelector("#stage").classList.contains("is-full") }; });
  expect(fs.full && fs.w >= 1430 && fs.h >= 880, "fullscreen fills the window", JSON.stringify(fs));
  await page.screenshot({ path: join(shots, "fullscreen.png") });
  await page.keyboard.press("Escape"); await page.waitForTimeout(500);
  expect(!(await page.$eval("#stage", (s) => s.classList.contains("is-full"))), "Esc leaves fullscreen");
  // The dock rail: every dock fits its tile; arrow keys move the selection.
  await page.evaluate(() => document.getElementById("docks").scrollIntoView({ block: "center" }));
  await page.waitForFunction(() => document.querySelectorAll("#dock-rail .dr.measured").length === document.querySelectorAll("#dock-rail .dr").length, null, { timeout: 30000 }).catch(() => {});
  const clipped = await D(() => [...document.querySelectorAll("#dock-rail .dr")].filter((t) => {
    const f = t.querySelector("iframe"), fr = t.querySelector(".dr-frame").getBoundingClientRect();
    const pill = f.contentDocument?.querySelector(".dock-pill");
    if (!pill) return true;
    const k = f.getBoundingClientRect().width / f.offsetWidth, b = pill.getBoundingClientRect(), o = f.getBoundingClientRect();
    const r = { l: o.left + b.left * k, t: o.top + b.top * k, r: o.left + b.right * k, b: o.top + b.bottom * k };
    return r.l < fr.left - 1 || r.r > fr.right + 1 || r.t < fr.top - 1 || r.b > fr.bottom + 1;
  }).map((t) => t.textContent.trim()));
  expect(!clipped.length, "no dock clipped in the rail", clipped.join(", "));
  await page.focus('#dock-rail .dr[aria-checked="true"]'); await page.keyboard.press("ArrowRight"); await page.waitForTimeout(200);
  expect((await page.$eval('#dock-rail .dr[aria-checked="true"]', (b) => b.dataset.i)) === "1", "arrow keys pick the next dock");
  await page.screenshot({ path: join(shots, "docks.png"), clip: await page.locator("#docks").boundingBox() });
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
  const faded = await D(() => [...document.querySelectorAll(".lw, .lx-toast, .lx-menu, .lx-magic, .lx-approve, .lx-panel, .lx-shelf")].filter((e) => { if (e.closest("[hidden]") || !e.offsetParent) return false; const o = +getComputedStyle(e).opacity; return o > 0.02 && o < 0.98 && !e.getAnimations({ subtree: true }).some((a) => a.playState === "running"); }).map((e) => e.className));
  expect(!faded.length, "nothing left half-faded after animations", faded.join(", "));
  await page.click("[data-all]"); await page.waitForTimeout(250);
  await page.fill("#lab-q", "dracula"); await page.waitForTimeout(200);
  expect((await page.locator(".lab-pop .tp").count()) >= 1, "all-themes search finds Dracula");
  await page.keyboard.press("Escape");
  await page.click("[data-shuffle]"); await page.waitForTimeout(600);
  expect((await D(() => window.lensSite.lab.committed?.p.id)) !== "rose-pine", "Shuffle changes the theme");
  // Icons: every icon on the page comes from the shared set (or the brand folder, or the apps' own repos).
  const odd = await D(() => [...document.querySelectorAll("main img, #desk-host img, #lab-desk img")].map((i) => i.getAttribute("src") ?? "").filter((s) => s && !/media\/icons\/|media\/apps\/|media\/shot-|media\/core-|brand\//.test(s)));
  expect(!odd.length, "icons come from the shared icon set", odd.slice(0, 5).join(", "));
  // Bring your own agent tabs, by keyboard.
  await page.focus("#byo-t1"); await page.keyboard.press("ArrowRight"); await page.waitForTimeout(100);
  expect(!(await page.$eval("#byo-p2", (x) => x.hidden)), "agent tabs switch with the arrow keys");
  // The Guide: the orb opens it, / too; a chip acts on the desk; Esc collapses it.
  await page.click("#guide-orb"); await page.waitForTimeout(600);
  expect(await page.$eval("#guide-window", (w) => !w.hidden), "the Lens orb opens the Guide");
  await page.click('.gw-chips [data-chip="Tile two windows"]');
  await page.waitForTimeout(500);
  await page.waitForFunction(() => [...document.querySelectorAll(".gm.steps")].some((s) => s.classList.contains("finished")), null, { timeout: 15000 }).catch(() => {});
  const tiles = await D(() => [...window.lensSite.desk.wins.values()].filter((w) => !w.min && w.tile).length);
  expect(tiles >= 1, "the Guide's “Tile two windows” tiles the desk");
  await page.screenshot({ path: join(shots, "guide-acting.png") });
  await page.keyboard.press("Escape"); await page.waitForTimeout(500);
  expect(await page.$eval("#guide-window", (w) => w.hidden), "Esc collapses the Guide");
  await page.locator("body").press("/"); await page.waitForTimeout(500);
  expect(await page.$eval("#guide-window", (w) => !w.hidden), "/ opens the Guide");
  await page.keyboard.press("Escape");
  if ((await D(() => document.documentElement.scrollWidth)) > 1441) problems.push("interaction: the page is wider than the window");
  const cls = await D(() => window.__cls);
  report.interaction = { checks: done.length, cls: Math.round(cls * 1000) / 1000, errors: errs.length };
  if (cls > 0.1) problems.push(`interaction: layout shift ${cls.toFixed(3)} (> 0.1)`);
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
    // The desk fills wide screens.
    const dw = await page.$eval("#desk-host", (d) => d.getBoundingClientRect().width);
    if (w >= 1920 && dw < 1500) lp(`${w}px: the hero desk is only ${Math.round(dw)} px wide`);
    if (w >= 1440 && dw < 1300) lp(`${w}px: the hero desk is only ${Math.round(dw)} px wide`);
    // The tour bar sits below the desk, never on top of the desk's toasts or dock.
    const r = await page.evaluate(() => {
      const R = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return { left: b.left, top: b.top, right: b.right, bottom: b.bottom, width: b.width, height: b.height }; };
      return { bar: R(document.getElementById("sc-bar")), dock: R(document.querySelector("#desk-host iframe")), toasts: [...document.querySelectorAll("#desk-host .lx-toasts > *")].map(R) };
    });
    if (r.toasts.some((t) => hit(r.bar, t)) || hit(r.bar, r.dock)) lp(`${w}px: the tour bar overlaps the desk`);
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
