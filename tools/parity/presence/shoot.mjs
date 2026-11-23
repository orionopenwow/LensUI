// Screenshots the "Lens at work" scenes × presets, fails on page/console errors, writes contact
// sheets, and renders the "Lens, tile left and turn on dark mode" reel as frames (and, when ffmpeg
// is present, an animated WebP). Env: PARITY_CHROME, PARITY_PLAYWRIGHT, PARITY_PRESETS,
// PRESENCE_REEL=0 to skip the reel.
import { createServer } from "node:http";
import { readFile, mkdir, writeFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "out");
const shots = join(here, "shots");
await mkdir(shots, { recursive: true });
const { chromium } = await import(process.env.PARITY_PLAYWRIGHT ? pathToFileURL(process.env.PARITY_PLAYWRIGHT).href : "playwright");

const SCENES = ["travel", "click", "typing", "snap", "setting", "flip", "banner", "waiting", "subtle", "card"];
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
const watch = (page) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && !/favicon/.test(m.text()) && errors.push(`console: ${m.text().slice(0, 200)}`));
  return errors;
};
for (const preset of PRESETS) {
  for (const scene of SCENES) {
    const card = scene === "card";
    const page = await browser.newPage({ viewport: card ? { width: 672, height: 360 } : { width: 1000, height: 640 }, deviceScaleFactor: 1 });
    const errors = watch(page);
    await page.goto(`${base}/out/harness.html?scene=${scene}&preset=${preset}`);
    await page.waitForTimeout(600);
    await page.screenshot({ path: join(shots, `${preset}-${scene}.png`), fullPage: card });
    if (errors.length) failed++;
    console.log(`${errors.length ? "FAIL" : "ok  "} ${preset} ${scene}${errors.length ? "\n      " + errors.join("\n      ") : ""}`);
    await page.close();
  }
  const cells = SCENES.filter((s) => s !== "card").map((s) => `<figure><img src="../shots/${preset}-${s}.png"><figcaption>${s}</figcaption></figure>`).join("");
  await writeFile(join(out, `sheet-${preset}.html`), `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#111;color:#bbb;font:12px system-ui"><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:8px">${cells}</div><style>figure{margin:0}img{width:100%;display:block;border-radius:6px}figcaption{padding:4px 2px}</style></body></html>`);
  const sheet = await browser.newPage({ viewport: { width: 1800, height: 900 } });
  await sheet.goto(`${base}/out/sheet-${preset}.html`);
  await sheet.waitForTimeout(400);
  await sheet.screenshot({ path: join(shots, `contact-${preset}.png`), fullPage: true });
  await sheet.close();
}

if (process.env.PRESENCE_REEL !== "0") {
  const FPS = 15;
  const DURATION = 5600;
  const frames = join(shots, "reel");
  await rm(frames, { recursive: true, force: true });
  await mkdir(frames, { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1000, height: 640 }, deviceScaleFactor: 1 });
  const errors = watch(page);
  await page.goto(`${base}/out/harness.html?scene=demo&preset=alabaster-daylight&t=0`);
  await page.waitForTimeout(500);
  const n = Math.round((DURATION / 1000) * FPS);
  for (let i = 0; i <= n; i++) {
    await page.evaluate((t) => window.__frame(t), (i * 1000) / FPS);
    await page.waitForTimeout(30);
    await page.screenshot({ path: join(frames, `f${String(i).padStart(4, "0")}.png`) });
  }
  await page.close();
  if (errors.length) {
    failed++;
    console.log(`FAIL reel\n      ${errors.join("\n      ")}`);
  }
  const ff = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-framerate", String(FPS), "-i", join(frames, "f%04d.png"), "-vf", "scale=800:-1:flags=lanczos", "-c:v", "libwebp_anim", "-lossless", "0", "-q:v", "78", "-loop", "0", join(shots, "lens-at-work.webp")], { stdio: "inherit" });
  console.log(ff.status === 0 ? `ok   reel → shots/lens-at-work.webp (${n + 1} frames @ ${FPS} fps)` : "note reel frames written; ffmpeg not available for WebP");
}
await browser.close();
server.close();
if (failed) {
  console.error(`[parity:presence] ${failed} scene(s) had errors`);
  process.exit(1);
}
