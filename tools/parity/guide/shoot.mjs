// Screenshots Lens Guide scenes × presets, fails on page/console errors, and writes a contact sheet
// per preset. Env: PARITY_PRESETS, PARITY_CHROME, PARITY_PLAYWRIGHT (as in tools/parity/shoot.mjs).
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "out");
const shots = join(here, "shots");
await mkdir(shots, { recursive: true });
const { chromium } = await import(process.env.PARITY_PLAYWRIGHT ? pathToFileURL(process.env.PARITY_PLAYWRIGHT).href : "playwright");

// scene → [width, height, extra query]
const SCENES = {
  home: [520, 720, ""],
  search: [520, 720, ""],
  answer: [520, 720, ""],
  lesson: [520, 720, ""],
  coach: [1100, 760, "&tab=system"],
  drawer: [1100, 760, "&tab=theme"],
};
const PRESETS = (process.env.PARITY_PRESETS || "obsidian,alabaster-daylight").split(",");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png" };

const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^([/\\])+/, "");
  const file = join(here, path);
  if (!file.startsWith(out) && !file.startsWith(shots)) return res.writeHead(403).end();
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
  for (const [scene, [w, h, extra]] of Object.entries(SCENES)) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    const errors = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => m.type() === "error" && !/favicon/.test(m.text()) && errors.push(`console: ${m.text().slice(0, 200)}`));
    await page.goto(`${base}/out/harness.html?scene=${scene}&preset=${preset}${extra}`);
    await page.waitForTimeout(scene === "coach" || scene === "drawer" ? 1500 : 700);
    const empty = await page.evaluate(() => (document.getElementById("root")?.innerText ?? "").trim().length < 20);
    if (empty) errors.push("empty render");
    if (scene === "coach") {
      const ring = await page.$(".guide-coach-ring");
      if (!ring) errors.push("coach mark did not find its target");
    }
    await page.screenshot({ path: join(shots, `${preset}-${scene}.png`) });
    if (errors.length) failed++;
    console.log(`${errors.length ? "FAIL" : "ok  "} ${preset} ${scene}${errors.length ? "\n      " + errors.join("\n      ") : ""}`);
    await page.close();
  }
  const cells = Object.keys(SCENES).map((s) => `<figure><img src="../shots/${preset}-${s}.png"><figcaption>${s}</figcaption></figure>`).join("");
  await writeFile(join(out, `sheet-${preset}.html`), `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#111;color:#bbb;font:12px system-ui"><div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:8px;align-items:start">${cells}</div><style>figure{margin:0}img{width:100%;display:block;border-radius:6px}figcaption{padding:4px 2px}</style></body></html>`);
  const sheet = await browser.newPage({ viewport: { width: 2400, height: 900 } });
  await sheet.goto(`${base}/out/sheet-${preset}.html`);
  await sheet.waitForTimeout(500);
  await sheet.screenshot({ path: join(shots, `contact-${preset}.png`), fullPage: true });
  await sheet.close();
}
await browser.close();
server.close();
if (failed) {
  console.error(`[parity:guide] ${failed} scene(s) failed`);
  process.exit(1);
}
