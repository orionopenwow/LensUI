// Screenshots Lens Snip scenes × presets, fails on page/console errors, writes contact sheets.
// Env: PARITY_CHROME, PARITY_PLAYWRIGHT, PARITY_PRESETS, SNIP_SHOTS (output dir).
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "out");
const shots = process.env.SNIP_SHOTS || join(here, "shots");
await mkdir(shots, { recursive: true });
const { chromium } = await import(process.env.PARITY_PLAYWRIGHT ? pathToFileURL(process.env.PARITY_PLAYWRIGHT).href : "playwright");

const SCENES = {
  select: [1280, 800],
  "select-window": [1280, 800],
  studio: [1280, 800],
  "studio-livetext": [1280, 800],
  "studio-crop": [1280, 800],
  "studio-claude": [1280, 800],
  "studio-translate": [1280, 800],
  "studio-openin": [1280, 800],
  "studio-frame": [1280, 800],
  pin: [1280, 800],
  record: [1280, 800],
  history: [1280, 800],
  "history-undo": [1280, 800],
  "history-empty": [1280, 800],
  card: [808, 1500],
};
const PRESETS = (process.env.PARITY_PRESETS || "obsidian,alabaster-daylight").split(",");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png" };

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
  for (const [scene, [w, h]] of Object.entries(SCENES)) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    const errors = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => m.type() === "error" && !/favicon/.test(m.text()) && errors.push(`console: ${m.text().slice(0, 200)}`));
    await page.goto(`${base}/out/harness.html?scene=${scene}&preset=${preset}`);
    await page.waitForTimeout(900);
    if (scene === "pin") await page.hover(".pin-demo");
    const text = await page.evaluate(() => document.body.innerText.trim().length + document.querySelectorAll("img,canvas,svg").length);
    if (!text) errors.push("empty scene");
    await page.screenshot({ path: join(shots, `${preset}-${scene}.png`), fullPage: scene === "card" });
    if (errors.length) failed++;
    console.log(`${errors.length ? "FAIL" : "ok  "} ${preset} ${scene}${errors.length ? "\n      " + errors.join("\n      ") : ""}`);
    await page.close();
  }
  const names = Object.keys(SCENES).filter((s) => s !== "card");
  const cells = names.map((s) => `<figure><img src="file://${join(shots, `${preset}-${s}.png`)}"><figcaption>${s}</figcaption></figure>`).join("");
  const html = join(shots, `sheet-${preset}.html`);
  await writeFile(html, `<!DOCTYPE html><html><body style="margin:0;background:#111;color:#bbb;font:13px system-ui"><div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:8px">${cells}</div><style>figure{margin:0}img{width:100%;display:block;border-radius:6px}figcaption{padding:4px 2px}</style></body></html>`);
  const sheet = await browser.newPage({ viewport: { width: 2400, height: 900 } });
  await sheet.goto(pathToFileURL(html).href);
  await sheet.waitForTimeout(500);
  await sheet.screenshot({ path: join(shots, `contact-${preset}.png`), fullPage: true });
  await sheet.close();
}
await browser.close();
server.close();
if (failed) {
  console.error(`[parity:snip] ${failed} scene(s) failed`);
  process.exit(1);
}
