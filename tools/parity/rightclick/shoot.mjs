// Screenshots the right-click scenes × presets, fails on page errors, writes a contact sheet per preset.
// Env: PARITY_CHROME, PARITY_PLAYWRIGHT, OUT_DIR (default ./shots).
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "out");
const shots = process.env.OUT_DIR || join(here, "shots");
await mkdir(shots, { recursive: true });
const { chromium } = await import(process.env.PARITY_PLAYWRIGHT ? pathToFileURL(process.env.PARITY_PLAYWRIGHT).href : "playwright");
const SCENES = ["card", "card-youtube", "card-files", "card-desktop", "pack", "pack-fits", "clipper", "clipper-approve", "toast-saved", "toast-merged", "toast-duplicate", "toast-note"];
const PRESETS = (process.env.PARITY_PRESETS || "obsidian,alabaster-daylight").split(",");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png" };
const server = createServer(async (req, res) => {
  const p = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^([/\\])+/, "");
  const file = join(here, p);
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
const done = {};
for (const preset of PRESETS) {
  done[preset] = [];
  for (const scene of SCENES) {
    const page = await browser.newPage({ viewport: { width: 768, height: 1400 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => m.type() === "error" && !/favicon/.test(m.text()) && errors.push(`console: ${m.text().slice(0, 200)}`));
    await page.goto(`${base}/out/index.html?scene=${scene}&preset=${preset}`);
    await page.waitForTimeout(500);
    const name = `${preset}-${scene}.png`;
    const box = await page.locator("#root").boundingBox();
    const inner = await page.evaluate(() => {
      const r = document.querySelector("#root > *")?.getBoundingClientRect();
      return r ? Math.ceil(r.bottom + 24) : 400;
    });
    await page.screenshot({ path: join(shots, name), clip: { x: 0, y: 0, width: 768, height: Math.min(1400, Math.max(200, inner)) } });
    done[preset].push(name);
    if (errors.length) failed++;
    console.log(`${errors.length ? "FAIL" : "ok  "} ${preset} ${scene}${errors.length ? "\n      " + errors.join("\n      ") : ""}`);
    await page.close();
  }
}
// Contact sheet per preset.
for (const preset of PRESETS) {
  const html = `<!DOCTYPE html><html><body style="margin:0;background:#222;display:grid;grid-template-columns:repeat(2,768px);gap:8px;padding:8px;font:12px system-ui;color:#ddd">${done[preset]
    .map((f) => `<figure style="margin:0"><figcaption>${f}</figcaption><img src="${pathToFileURL(join(shots, f)).href}" style="width:768px;display:block"></figure>`)
    .join("")}</body></html>`;
  const sheet = join(shots, `contact-${preset}.html`);
  await writeFile(sheet, html);
  const page = await browser.newPage({ viewport: { width: 1560, height: 800 } });
  await page.goto(pathToFileURL(sheet).href);
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(shots, `contact-${preset}.png`), fullPage: true });
  await page.close();
}
await browser.close();
server.close();
if (failed) {
  console.error(`${failed} scene(s) had errors`);
  process.exit(1);
}
