// Screenshots the agent-safety UI in each preset and checks the page collector against a hostile
// page in real Chromium. Fails on page/console errors or a wrong collector measurement.
// Env: PARITY_CHROME, PARITY_PLAYWRIGHT, PARITY_OUT, PARITY_PRESETS (same as the other galleries).
import { createServer } from "node:http";
import { readFile, mkdir, copyFile } from "node:fs/promises";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "out");
const shots = join(here, "shots");
await mkdir(shots, { recursive: true });
const { chromium } = await import(process.env.PARITY_PLAYWRIGHT ? pathToFileURL(process.env.PARITY_PLAYWRIGHT).href : "playwright");
const SCENES = { card: 1180, "card-open": 1240, "banner-scam": 200, "banner-setaside": 220, approval: 260 };
const PRESETS = (process.env.PARITY_PRESETS || "obsidian,alabaster-daylight").split(",");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^([/\\])+/, "");
  const file = join(here, path);
  if (!file.startsWith(out)) return res.writeHead(403).end();
  try {
    res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" }).end(await readFile(file));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch(process.env.PARITY_CHROME ? { executablePath: process.env.PARITY_CHROME } : {});
let failed = 0;
for (const preset of PRESETS) {
  for (const [scene, h] of Object.entries(SCENES)) {
    const page = await browser.newPage({ viewport: { width: 760, height: h }, deviceScaleFactor: 1 });
    const errors = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => m.type() === "error" && !/favicon/.test(m.text()) && errors.push(`console: ${m.text().slice(0, 200)}`));
    await page.goto(`${base}/out/harness.html?scene=${scene}&preset=${preset}`);
    await page.waitForTimeout(700);
    const name = `${preset}-${scene}.png`;
    await page.screenshot({ path: join(shots, name), fullPage: true });
    if (process.env.PARITY_OUT) {
      await mkdir(process.env.PARITY_OUT, { recursive: true });
      await copyFile(join(shots, name), join(process.env.PARITY_OUT, name));
    }
    if (errors.length) failed++;
    console.log(`${errors.length ? "FAIL" : "ok  "} ${preset} ${scene}${errors.length ? "\n      " + errors.join("\n      ") : ""}`);
    await page.close();
  }
}

// Collector check on the hostile page.
{
  const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
  await page.goto(`${base}/out/hostile.html`);
  const nodes = await page.evaluate(() => window.__lensCollect());
  const find = (mark) => nodes.find((n) => n.text.includes(mark));
  const expect = [
    ["MARK-VISIBLE", (n) => n && !n.displayNone && n.opacity === 1 && n.contrast > 10 && !n.offscreen && !n.clipped, "visible text is normal"],
    ["MARK-WHITE", (n) => n && n.contrast < 1.6, "white-on-white has low contrast"],
    ["MARK-NONE", (n) => n && n.displayNone, "display:none is detected"],
    ["MARK-GHOST", (n) => n && n.opacity < 0.1, "opacity 0 is detected"],
    ["MARK-TINY", (n) => n && n.fontPx < 4, "1px text is detected"],
    ["MARK-AWAY", (n) => n && n.offscreen, "off-screen text is detected"],
    ["MARK-INDENT", (n) => n && n.offscreen, "text-indent hiding is detected"],
    ["MARK-SR", (n) => n && n.clipped, "clipped text is detected"],
    ["MARK-DARKCARD", (n) => n && n.contrast < 1.6, "dark-on-dark card has low contrast"],
    ["MARK-ARIA", (n) => n && n.ariaHidden, "aria-hidden is detected"],
    ["ALT:", (n) => n && n.source === "alt", "alt text is collected as an attribute"],
    ["META:", (n) => n && n.source === "meta", "meta description is collected"],
    ["COMMENT:", (n) => n && n.source === "meta", "HTML comments are collected"],
  ];
  let bad = 0;
  for (const [mark, ok, what] of expect) {
    const n = find(mark);
    const pass = ok(n);
    if (!pass) bad++;
    console.log(`${pass ? "ok  " : "FAIL"} collector: ${what}${pass ? "" : ` → ${JSON.stringify(n)}`}`);
  }
  if (bad) failed++;
  if (nodes.some((n) => /window.__ready/.test(n.text))) {
    failed++;
    console.log("FAIL collector: script text was collected");
  }
  await page.close();
}
await browser.close();
server.close();
console.log(`[parity:agentsafe] ${failed ? `${failed} check(s) failed` : "all scenes rendered cleanly and the collector passed"}`);
process.exit(failed ? 1 : 0);
