// Screenshots Lens Command scenes × presets × widths, fails on page/console errors, and writes a
// contact sheet per preset. Env: PARITY_CHROME, PARITY_PLAYWRIGHT (as in tools/parity/shoot.mjs).
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "out");
const shots = join(here, "shots");
await mkdir(shots, { recursive: true });
const { chromium } = await import(process.env.PARITY_PLAYWRIGHT ? pathToFileURL(process.env.PARITY_PLAYWRIGHT).href : "playwright");

const SCENES = ["compact", "slash", "thread", "shelf", "tool", "clipboard"];
// Mini, edge shelf and bubble scenes render on a mock desktop at a fixed size (one width).
const DESKTOP = { "mini-cursor": [880, 640], "mini-dock": [640, 560], "mini-answer": [880, 640], "mini-dash": [880, 640], "expand-1": [880, 640], "expand-2": [1048, 640], "edge-collapsed": [640, 520], "edge-hover": [640, 520], "edge-drop": [640, 520], "bubble": [640, 360] };
const PRESETS = (process.env.PARITY_PRESETS || "obsidian,alabaster-daylight").split(",");
const WIDTHS = [560, 800];
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
const report = [];
for (const preset of PRESETS) {
  for (const w of WIDTHS) {
    for (const scene of SCENES) {
      const drawer = scene === "shelf";
      const page = await browser.newPage({ viewport: { width: w + (drawer ? 288 : 0) + 48, height: 640 }, deviceScaleFactor: 1 });
      const errors = [];
      page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
      page.on("console", (m) => m.type() === "error" && !/favicon/.test(m.text()) && errors.push(`console: ${m.text().slice(0, 200)}`));
      await page.goto(`${base}/out/harness.html?scene=${scene}&preset=${preset}&w=${w}`);
      await page.waitForTimeout(700);
      const name = `${preset}-${w}-${scene}.png`;
      await page.screenshot({ path: join(shots, name) });
      report.push({ preset, w, scene, ok: errors.length === 0, errors, file: name });
      console.log(`${errors.length ? "FAIL" : "ok  "} ${preset} ${w} ${scene}${errors.length ? "\n      " + errors.join("\n      ") : ""}`);
      await page.close();
    }
  }
}
for (const preset of PRESETS) {
  for (const [scene, [vw, vh]] of Object.entries(DESKTOP)) {
    const page = await browser.newPage({ viewport: { width: vw, height: vh }, deviceScaleFactor: 1 });
    const errors = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => m.type() === "error" && !/favicon/.test(m.text()) && errors.push(`console: ${m.text().slice(0, 200)}`));
    await page.goto(`${base}/out/harness.html?scene=${scene}&preset=${preset}&w=640`);
    await page.waitForTimeout(scene === "bubble" ? 400 : 700);
    const name = `${preset}-${scene}.png`;
    await page.screenshot({ path: join(shots, name) });
    report.push({ preset, w: vw, scene, ok: errors.length === 0, errors, file: name });
    console.log(`${errors.length ? "FAIL" : "ok  "} ${preset} ${scene}${errors.length ? "\n      " + errors.join("\n      ") : ""}`);
    await page.close();
  }
  const cells = Object.keys(DESKTOP).map((s) => `<figure><img src="../shots/${preset}-${s}.png"><figcaption>${s}</figcaption></figure>`).join("");
  await writeFile(join(out, `sheet-mini-${preset}.html`), `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#111;color:#bbb;font:12px system-ui"><div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;padding:8px">${cells}</div><style>figure{margin:0}img{width:100%;display:block;border-radius:6px}figcaption{padding:4px 2px}</style></body></html>`);
  const sheet = await browser.newPage({ viewport: { width: 2600, height: 900 } });
  await sheet.goto(`${base}/out/sheet-mini-${preset}.html`);
  await sheet.waitForTimeout(400);
  await sheet.screenshot({ path: join(shots, `contact-mini-${preset}.png`), fullPage: true });
  await sheet.close();
}

// Contact sheets: one per preset, widths as rows, scenes as columns.
for (const preset of PRESETS) {
  const cells = WIDTHS.map((w) => SCENES.map((s) => `<figure><img src="../shots/${preset}-${w}-${s}.png"><figcaption>${s} · ${w}px</figcaption></figure>`).join("")).join("");
  await writeFile(join(out, `sheet-${preset}.html`), `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#111;color:#bbb;font:12px system-ui"><div style="display:grid;grid-template-columns:repeat(${SCENES.length},1fr);gap:8px;padding:8px">${cells}</div><style>figure{margin:0}img{width:100%;display:block;border-radius:6px}figcaption{padding:4px 2px}</style></body></html>`);
  const sheet = await browser.newPage({ viewport: { width: 3000, height: 900 } });
  await sheet.goto(`${base}/out/sheet-${preset}.html`);
  await sheet.waitForTimeout(400);
  await sheet.screenshot({ path: join(shots, `contact-${preset}.png`), fullPage: true });
  await sheet.close();
}
await browser.close();
server.close();
await writeFile(join(shots, "report.json"), JSON.stringify(report, null, 2));
const failed = report.filter((r) => !r.ok).length;
console.log(`[parity:command] ${report.length - failed}/${report.length} scenes rendered cleanly`);
process.exit(failed ? 1 : 0);
