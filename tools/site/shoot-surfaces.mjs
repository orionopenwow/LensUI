// Real screenshots for the site, taken from the same real surfaces the demo runs (docs/site/live/app):
//   docs/media/core-<app>.webp      the nine core apps
//   docs/media/surface-<name>.webp  Lens Music and Lens Cleaner; Lens Feeds and Lens Messages come from
//                                   the Feeds parity gallery (build it first: node tools/parity/feeds/build.mjs)
// Run after `node tools/site/build.mjs` (needs Playwright's Chromium and ffmpeg for WebP):
//   PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node tools/site/shoot-surfaces.mjs
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const site = join(root, "docs/site");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".webp": "image/webp", ".png": "image/png" };
const srv = createServer(async (q, r) => {
  try { const f = join(site, decodeURIComponent(q.url.split("?")[0])); r.writeHead(200, { "content-type": TYPES[extname(f)] ?? "application/octet-stream" }); r.end(await readFile(f)); } catch { r.writeHead(404); r.end(); }
}).listen(0);
const base = `http://localhost:${srv.address().port}/live/app/`;
const CORE = ["monitor", "timer", "notes", "calculator", "color", "power", "network", "clipboard", "startup"];
const SHOTS = [
  // [name, page, width, height, device scale]: the grid shows core apps at about half this width.
  ...CORE.map((a) => [`core-${a}`, `coreapps.html?app=${a}&preset=obsidian`, 760, 520, 1]),
  ["surface-music", "music.html?scene=np-expanded&preset=obsidian", 1100, 660, 1.25],
  ["surface-cleaner", "cleaner.html?scene=cleanup&preset=obsidian", 1100, 660, 1.25],
];
const tmp = await mkdtemp(join(tmpdir(), "lens-shots-"));
const browser = await chromium.launch();
for (const [name, url, width, height, scale] of SHOTS) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: scale, colorScheme: "dark" });
  await page.goto(base + url);
  await page.waitForFunction(() => !!document.getElementById("root")?.firstElementChild);
  await page.waitForTimeout(900);
  // The windows are frameless on a transparent page: give the shot the app's own base colour behind it.
  await page.evaluate(() => { document.documentElement.style.setProperty("background", "#09090b", "important"); });
  const png = join(tmp, `${name}.png`);
  await page.screenshot({ path: png });
  await page.close();
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", png, "-quality", "78", join(root, "docs/media", `${name}.webp`)]);
  console.log(`[shots] docs/media/${name}.webp`);
}
// Feeds and Messages: the Feeds & Messages parity gallery (tools/parity/feeds/out), same treatment.
const fmRoot = join(root, "tools/parity/feeds/out");
const fm = createServer(async (q, r) => {
  try { const f = join(fmRoot, decodeURIComponent(q.url.split("?")[0])); r.writeHead(200, { "content-type": TYPES[extname(f)] ?? "application/octet-stream" }); r.end(await readFile(f)); } catch { r.writeHead(404); r.end(); }
}).listen(0);
for (const [name, sc] of [["surface-feeds", "deck"], ["surface-messages", "conversation"]]) {
  const page = await browser.newPage({ viewport: { width: 1100, height: 660 }, colorScheme: "dark" });
  await page.goto(`http://localhost:${fm.address().port}/harness.html?scene=${sc}&preset=obsidian`);
  await page.waitForTimeout(1500);
  await page.evaluate(() => { document.documentElement.style.setProperty("background", "#09090b", "important"); });
  const png = join(tmp, `${name}.png`);
  await page.screenshot({ path: png });
  await page.close();
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", png, "-quality", "78", join(root, "docs/media", `${name}.webp`)]);
  console.log(`[shots] docs/media/${name}.webp`);
}
fm.close();
await browser.close();
srv.close();
await rm(tmp, { recursive: true, force: true });
