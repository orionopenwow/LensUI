// Screenshots every Lens core app in obsidian + alabaster-daylight and one style variant each,
// then a contact sheet. Fails on page or console errors.
// Env: PARITY_CHROME (Chromium path), PARITY_PLAYWRIGHT (playwright module path), PARITY_OUT (copy shots there).
import { createServer } from "node:http";
import { readFile, mkdir, copyFile, writeFile } from "node:fs/promises";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "out");
const shots = join(here, "shots");
await mkdir(shots, { recursive: true });
const { chromium } = await import(process.env.PARITY_PLAYWRIGHT ? pathToFileURL(process.env.PARITY_PLAYWRIGHT).href : "playwright");
// app → [scene, height, variant preset]
const APPS = [
  ["monitor", "home", 980, "lens-expressive"],
  ["startup", "startup", 860, "lens-dot-matrix"],
  ["startup", "uninstall", 900, null],
  ["timer", "timers", 900, "lens-dot-matrix"],
  ["timer", "pomodoro", 860, null],
  ["calculator", "standard", 800, "lens-expressive"],
  ["calculator", "programmer", 760, null],
  ["color", "home", 920, "lens-expressive"],
  ["notes", "home", 820, "lens-dot-matrix"],
  ["notes", "remind", 820, null],
  ["notes", "sticky", 280, null],
  ["power", "home", 1080, "lens-dot-matrix"],
  ["network", "home", 1000, "lens-expressive"],
  ["clipboard", "home", 900, "lens-expressive"],
];
const BASE = (process.env.PARITY_PRESETS || "obsidian,alabaster-daylight").split(",");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml" };
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
const done = [];
for (const [app, scene, h, variant] of APPS) {
  const presets = [...BASE, ...(variant ? [variant] : [])];
  for (const preset of presets) {
    const shape = preset === "lens-expressive" ? "expressive" : preset === "lens-dot-matrix" ? "dotmatrix" : "";
    const w = scene === "sticky" ? 300 : 900;
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    const errors = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => m.type() === "error" && !/favicon/.test(m.text()) && errors.push(`console: ${m.text().slice(0, 200)}`));
    await page.goto(`${base}/out/harness.html?app=${app}&scene=${scene}&preset=${preset}${shape ? `&shape=${shape}` : ""}`);
    await page.waitForTimeout(1300);
    const name = `${app}-${scene}-${preset}.png`;
    await page.screenshot({ path: join(shots, name) });
    done.push({ name, app, scene, preset });
    if (process.env.PARITY_OUT) {
      await mkdir(process.env.PARITY_OUT, { recursive: true });
      await copyFile(join(shots, name), join(process.env.PARITY_OUT, name));
    }
    if (errors.length) failed++;
    console.log(`${errors.length ? "FAIL" : "ok  "} ${app} ${scene} ${preset}${errors.length ? "\n      " + errors.join("\n      ") : ""}`);
    await page.close();
  }
}
// Contact sheet: every shot as a thumbnail with its label.
const sheet = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;padding:24px;background:#18181b;color:#e4e4e7;font:13px system-ui}h1{font-size:18px;margin:0 0 16px}.g{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}figure{margin:0;background:#27272a;border-radius:10px;padding:8px}img{width:100%;height:300px;object-fit:cover;object-position:top;border-radius:6px;display:block}figcaption{margin-top:6px;font:11px ui-monospace,monospace;color:#a1a1aa}</style></head><body><h1>Lens core apps · ${done.length} shots</h1><div class="g">${done
  .map((d) => `<figure><img src="${d.name}"><figcaption>${d.app} · ${d.scene} · ${d.preset}</figcaption></figure>`)
  .join("")}</div></body></html>`;
await writeFile(join(shots, "contact-sheet.html"), sheet);
const sp = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 });
await sp.goto(pathToFileURL(join(shots, "contact-sheet.html")).href);
await sp.waitForTimeout(500);
await sp.screenshot({ path: join(shots, "contact-sheet.png"), fullPage: true });
if (process.env.PARITY_OUT) {
  await copyFile(join(shots, "contact-sheet.png"), join(process.env.PARITY_OUT, "contact-sheet.png"));
  await copyFile(join(shots, "contact-sheet.html"), join(process.env.PARITY_OUT, "contact-sheet.html"));
}
await browser.close();
server.close();
console.log(`[parity:coreapps] ${failed ? `${failed} shot(s) failed` : "all core apps rendered cleanly"}`);
process.exit(failed ? 1 : 0);
