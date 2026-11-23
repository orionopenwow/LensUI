// Screenshots every Lens Apps scene in each preset, fails on page/console errors.
// Env: PARITY_CHROME (Chromium path), PARITY_PLAYWRIGHT (playwright module path), PARITY_OUT (copy shots there).
import { createServer } from "node:http";
import { readFile, mkdir, copyFile } from "node:fs/promises";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "out");
const shots = join(here, "shots");
await mkdir(shots, { recursive: true });
const { chromium } = await import(process.env.PARITY_PLAYWRIGHT ? pathToFileURL(process.env.PARITY_PLAYWRIGHT).href : "playwright");
const SCENES = { home: 1700, hover: 900, "popover-winget": 760, "popover-release": 760, run: 760, installing: 1000, setup: 820, detail: 1080, "detail-suite": 1080, search: 900, category: 760, settings: 900 };
const PRESETS = (process.env.PARITY_PRESETS || "obsidian,alabaster-daylight").split(",");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".mp4": "video/mp4", ".webm": "video/webm" };
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^([/\\])+/, "");
  const file = join(here, path);
  if (!file.startsWith(out)) {
    if (process.env.PARITY_DEBUG) console.log("403", req.url);
    return res.writeHead(403).end();
  }
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
    const page = await browser.newPage({ viewport: { width: Number(process.env.PARITY_WIDTH || 1024), height: h }, deviceScaleFactor: 1 });
    const errors = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => m.type() === "error" && !/favicon/.test(m.text()) && errors.push(`console: ${m.text().slice(0, 200)}`));
    await page.goto(`${base}/out/harness.html?scene=${scene}&preset=${preset}`);
    await page.waitForTimeout(scene === "hover" ? 2900 : 1500);
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
await browser.close();
server.close();
console.log(`[parity:apps] ${failed ? `${failed} scene(s) failed` : "all scenes rendered cleanly"}`);
process.exit(failed ? 1 : 0);
