// Renders the popup, side panel, in-page dot and in-page panel against mocked extension APIs,
// in light and dark. Dev-only (not packaged).
//   node extensions/browser/tools/shoot.mjs [outDir]
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const PW = process.env.PLAYWRIGHT_MODULE || "/opt/node22/lib/node_modules/playwright/index.mjs";
const { chromium } = await import(PW);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXT = path.resolve(HERE, "..");
const OUT = path.resolve(process.argv[2] || path.join(EXT, "../../docs/screenshots/extension"));
fs.mkdirSync(OUT, { recursive: true });

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json" };
const mock = fs.readFileSync(path.join(HERE, "mock-chrome.js"), "utf8");
const browser = await chromium.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome" });
const errors = [];

async function newPage(scheme, viewport, mockCfg = {}) {
  const ctx = await browser.newContext({ viewport, colorScheme: scheme, deviceScaleFactor: 2 });
  await ctx.route("https://ext.mock/**", (route) => {
    const rel = decodeURIComponent(new URL(route.request().url()).pathname.slice(1));
    const file = path.join(EXT, rel);
    if (!file.startsWith(EXT) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: "" });
    route.fulfill({ status: 200, contentType: TYPES[path.extname(file)] || "application/octet-stream", body: fs.readFileSync(file) });
  });
  await ctx.route("https://lens-demo.example/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: fs.readFileSync(path.join(HERE, "testpage.html")) }));
  await ctx.addInitScript(`window.__LENS_MOCK = ${JSON.stringify({ scheme, ...mockCfg })};\n${mock}`);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${scheme}: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`${scheme}: ${m.text()}`));
  return page;
}

const shots = [];
for (const scheme of ["dark", "light"]) {
  // Popup
  {
    const page = await newPage(scheme, { width: 380, height: 640 });
    await page.goto("https://ext.mock/src/popup.html");
    await page.waitForTimeout(500);
    const f = path.join(OUT, `popup-${scheme}.png`);
    await page.screenshot({ path: f, fullPage: true });
    shots.push(f);
    await page.context().close();
  }
  // Side panel
  {
    const page = await newPage(scheme, { width: 400, height: 900 });
    await page.goto("https://ext.mock/src/panel.html");
    await page.waitForTimeout(500);
    const f = path.join(OUT, `sidepanel-${scheme}.png`);
    await page.screenshot({ path: f, fullPage: false });
    shots.push(f);
    await page.context().close();
  }
  // Side panel with a YouTube transcript
  {
    const page = await newPage(scheme, { width: 400, height: 1000 }, { transcript: true });
    await page.goto("https://ext.mock/src/panel.html");
    await page.waitForTimeout(500);
    const f = path.join(OUT, `transcript-${scheme}.png`);
    await page.screenshot({ path: f, fullPage: false });
    shots.push(f);
    await page.context().close();
  }
  // Micro-save toast in the page
  {
    const page = await newPage(scheme, { width: 1280, height: 520 });
    await page.goto("https://lens-demo.example/blog/calm");
    const src = fs.readFileSync(path.join(EXT, "src/content/toast.js"), "utf8").replace("export function", "function");
    await page.addScriptTag({ content: `${src}\nshowLensToast("Added to the same note", "~1,240 tokens", "ok");` });
    await page.waitForTimeout(300);
    const f = path.join(OUT, `micro-toast-${scheme}.png`);
    await page.screenshot({ path: f, clip: { x: 340, y: 300, width: 600, height: 220 } });
    shots.push(f);
    await page.context().close();
  }
  // Settings page: clean copy and double-click sections
  {
    const page = await newPage(scheme, { width: 760, height: 1400 }, { settings: { selectionButton: "sites", sites: ["lens-demo.example"], never: [], defaultAction: "explain", copyGuard: "all", define: "all", defineMode: "define", translateTo: "Spanish" } });
    await page.goto("https://ext.mock/src/options.html");
    await page.waitForTimeout(400);
    const f = path.join(OUT, `options-${scheme}.png`);
    await page.screenshot({ path: f, fullPage: true });
    shots.push(f);
    await page.context().close();
  }
  // Double-click define bubble
  {
    const page = await newPage(scheme, { width: 1280, height: 640 }, { settings: { selectionButton: "off", sites: [], never: [], defaultAction: "explain", copyGuard: "off", define: "all", defineMode: "define", translateTo: "Spanish" } });
    await page.goto("https://lens-demo.example/blog/calm");
    await page.evaluate(() => {
      const p = document.getElementById("target");
      p.insertAdjacentHTML("afterbegin", "By pure <b id='w'>serendipity</b>, ");
    });
    for (const f of ["src/content/selectionLogic.js", "src/content/define.js"]) await page.addScriptTag({ path: path.join(EXT, f) });
    await page.dblclick("#w");
    await page.waitForTimeout(500);
    const f = path.join(OUT, `define-${scheme}.png`);
    await page.screenshot({ path: f, clip: { x: 160, y: 100, width: 960, height: 420 } });
    shots.push(f);
    await page.context().close();
  }
  // Save page offline: the snapshot, opened on its own (scripts blocked by its CSP)
  {
    const page = await newPage(scheme, { width: 1100, height: 760 });
    await page.route("https://lens-demo.example/img/**", (r) => r.fulfill({ status: 200, contentType: "image/png", body: fs.readFileSync(path.join(EXT, "icons/icon128.png")) }));
    await page.route("https://lens-demo.example/css/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "article{border-left:4px solid #8b5cf6;padding-left:16px} .figure{display:flex;gap:12px;align-items:center}" }));
    await page.goto("https://lens-demo.example/blog/calm");
    await page.evaluate(() => new Promise((done) => {
      const l = document.createElement("link");
      l.rel = "stylesheet";
      l.href = "/css/site.css";
      document.head.append(l);
      const art = document.querySelector("article") || document.body;
      art.insertAdjacentHTML("afterbegin", '<div class="figure"><img src="/img/logo.png" width="64" height="64" alt="Logo"><a href="/about" onclick="steal()">About this blog</a><script>window.evil=1<\/script></div>');
      let n = 0;
      const tick = () => (++n > 40 || (l.sheet && document.images[0]?.complete) ? done() : setTimeout(tick, 50));
      tick();
    }));
    const src = fs.readFileSync(path.join(EXT, "src/content/snapshot.js"), "utf8").replace("export function", "function");
    const snap = await page.evaluate(`(() => { ${src}; return snapshotPage(420 * 1024); })()`);
    if (!snap.ok) errors.push(`${scheme}: snapshot failed ${snap.reason}`);
    if (/<script/i.test(snap.html)) errors.push(`${scheme}: snapshot still has a script`);
    if (/onclick/i.test(snap.html)) errors.push(`${scheme}: snapshot still has a handler`);
    if (!snap.inlinedImages || !snap.inlinedCss) errors.push(`${scheme}: expected the same-origin image and stylesheet inlined`);
    fs.writeFileSync(path.join(OUT, `archive-sample-${scheme}.html`), snap.html);
    const view = await newPage(scheme, { width: 1100, height: 760 });
    await view.setContent(snap.html, { waitUntil: "load" });
    await view.waitForTimeout(200);
    const f = path.join(OUT, `archive-${scheme}.png`);
    await view.screenshot({ path: f });
    shots.push(f);
    console.log(`archive ${scheme}: ${snap.bytes} bytes, ${snap.inlinedImages} images inlined, ${snap.inlinedCss} stylesheets inlined`);
    await view.context().close();
    await page.context().close();
  }
  // In-page dot + panel
  {
    const page = await newPage(scheme, { width: 1280, height: 800 });
    await page.goto("https://lens-demo.example/blog/calm");
    for (const f of ["src/content/selectionLogic.js", "src/ui/dashboard.js", "src/content/selection.js"]) {
      await page.addScriptTag({ path: path.join(EXT, f) });
    }
    await page.waitForTimeout(100);
    const dot = await page.evaluate(() => {
      const p = document.getElementById("target");
      const r = document.createRange();
      r.setStart(p.firstChild, 0);
      r.setEnd(p.firstChild, 58);
      const s = getSelection();
      s.removeAllRanges();
      s.addRange(r);
      document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      const rects = r.getClientRects();
      const last = rects[rects.length - 1];
      return globalThis.LensSel.dotPosition(last, { width: document.documentElement.clientWidth, height: innerHeight, scrollX, scrollY }, 22);
    });
    await page.waitForTimeout(450);
    let f = path.join(OUT, `inpage-dot-${scheme}.png`);
    await page.screenshot({ path: f, clip: { x: 200, y: 120, width: 880, height: 360 } });
    shots.push(f);
    await page.mouse.click(dot.left + 11, dot.top + 11);
    await page.waitForTimeout(500);
    await page.keyboard.press("Enter"); // runs the default action (Explain), which streams
    await page.waitForTimeout(1600);
    f = path.join(OUT, `inpage-panel-${scheme}.png`);
    await page.screenshot({ path: f });
    shots.push(f);
    // Esc closes it.
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    await page.context().close();
  }
}
await browser.close();
for (const s of shots) console.log(path.relative(process.cwd(), s));
if (errors.length) {
  console.error("Page errors:\n" + errors.join("\n"));
  process.exit(1);
}
