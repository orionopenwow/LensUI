// Screenshots Feeds & Messages scenes × presets and writes a contact sheet per preset.
// Env: PARITY_CHROME, PARITY_PLAYWRIGHT, PARITY_OUT (copy shots there), PARITY_PRESETS.
import { createServer } from "node:http";
import { readFile, mkdir, writeFile, copyFile } from "node:fs/promises";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "out");
const shots = join(here, "shots");
await mkdir(shots, { recursive: true });
const { chromium } = await import(process.env.PARITY_PLAYWRIGHT ? pathToFileURL(process.env.PARITY_PLAYWRIGHT).href : "playwright");
const SCENES = ["column", "deck", "digest", "compose", "approval", "inbox", "conversation", "focus", "widgets", "topbar"];
const SIZES = { deck: [1480, 820], widgets: [760, 420], topbar: [760, 140] };
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
const report = [];

for (const preset of PRESETS) {
  for (const scene of SCENES) {
    const [vw, vh] = SIZES[scene] ?? [900, 820];
    const page = await browser.newPage({ viewport: { width: vw, height: vh }, deviceScaleFactor: 1 });
    const errors = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => m.type() === "error" && !/favicon/.test(m.text()) && errors.push(`console: ${m.text().slice(0, 200)}`));
    await page.goto(`${base}/out/harness.html?scene=${scene}&preset=${preset}`);
    await page.waitForTimeout(600);
    // No native title tooltips on Lens surfaces (AGENTS.md).
    const titled = await page.evaluate(() => document.querySelectorAll("#root [title]").length);
    if (titled) errors.push(`${titled} element(s) with a native title tooltip`);
    const name = `${preset}-${scene}.png`;
    await page.screenshot({ path: join(shots, name) });
    report.push({ preset, scene, ok: errors.length === 0, errors, file: name });
    console.log(`${errors.length ? "FAIL" : "ok  "} ${preset} ${scene}${errors.length ? "\n      " + errors.join("\n      ") : ""}`);
    await page.close();
  }
  const cells = SCENES.map((s) => `<figure><img src="../shots/${preset}-${s}.png"><figcaption>${s}</figcaption></figure>`).join("");
  await writeFile(join(out, `sheet-${preset}.html`), `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#111;color:#bbb;font:12px system-ui"><div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;padding:8px;align-items:start">${cells}</div><style>figure{margin:0}img{width:100%;display:block;border-radius:6px}figcaption{padding:4px 2px}</style></body></html>`);
  const sheet = await browser.newPage({ viewport: { width: 2400, height: 900 } });
  await sheet.goto(`${base}/out/sheet-${preset}.html`);
  await sheet.waitForTimeout(400);
  await sheet.screenshot({ path: join(shots, `contact-${preset}.png`), fullPage: true });
  await sheet.close();
}
await browser.close();
server.close();
if (process.env.PARITY_OUT) {
  await mkdir(process.env.PARITY_OUT, { recursive: true });
  for (const r of report) await copyFile(join(shots, r.file), join(process.env.PARITY_OUT, r.file));
  for (const preset of PRESETS) await copyFile(join(shots, `contact-${preset}.png`), join(process.env.PARITY_OUT, `contact-${preset}.png`));
}
const failed = report.filter((r) => !r.ok).length;
console.log(`[parity:feeds] ${report.length - failed}/${report.length} scenes clean`);
process.exit(failed ? 1 : 0);
