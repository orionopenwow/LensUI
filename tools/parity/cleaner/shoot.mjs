// Screenshots every Lens Cleaner scene in each preset (plus Expressive and Dot Matrix variants of
// the key screens), fails on page/console errors. With RECORD=1 it also records the whole flow
// (home → scan → cleanup → preview → done → share → space map) as video.
// Env: PARITY_CHROME (Chromium path), PARITY_PLAYWRIGHT (playwright module path), PARITY_OUT (copy shots there),
//      PARITY_PRESETS, RECORD=1.
import { createServer } from "node:http";
import { readFile, mkdir, copyFile, readdir, rename } from "node:fs/promises";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "out");
const shots = join(here, "shots");
await mkdir(shots, { recursive: true });
const { chromium } = await import(process.env.PARITY_PLAYWRIGHT ? pathToFileURL(process.env.PARITY_PLAYWRIGHT).href : "playwright");
const SCENES = ["home", "scanning", "cleanup", "expanded", "smart", "approval", "space-list", "treemap", "sunburst", "biggest", "done", "share", "undo", "empty", "apps", "timeline", "downloads", "settings"];
const PRESETS = (process.env.PARITY_PRESETS || "obsidian,alabaster-daylight").split(",");
const STYLED = [
  ["obsidian", "expressive", ["home", "cleanup", "sunburst", "done"]],
  ["alabaster-daylight", "dotmatrix", ["home", "cleanup"]],
];
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml" };
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^([/\\])+/, "");
  const file = join(here, path);
  if (!file.startsWith(out)) return res.writeHead(403).end();
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" }).end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch(process.env.PARITY_CHROME ? { executablePath: process.env.PARITY_CHROME } : {});
let failed = 0;

async function shoot(preset, scene, shape) {
  const page = await browser.newPage({ viewport: { width: 1040, height: 760 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && !/favicon/.test(m.text()) && errors.push(`console: ${m.text().slice(0, 200)}`));
  await page.goto(`${base}/out/harness.html?scene=${scene}&preset=${preset}${shape ? `&shape=${shape}` : ""}`);
  await page.waitForTimeout(1500);
  if (scene === "expanded") await page.mouse.move(0, 0);
  const name = `${preset}${shape ? `-${shape}` : ""}-${scene}.png`;
  await page.screenshot({ path: join(shots, name) });
  if (process.env.PARITY_OUT) {
    await mkdir(process.env.PARITY_OUT, { recursive: true });
    await copyFile(join(shots, name), join(process.env.PARITY_OUT, name));
  }
  if (errors.length) failed++;
  console.log(`${errors.length ? "FAIL" : "ok  "} ${preset}${shape ? `/${shape}` : ""} ${scene}${errors.length ? "\n      " + errors.join("\n      ") : ""}`);
  await page.close();
}

for (const preset of PRESETS) for (const scene of SCENES) await shoot(preset, scene);
for (const [preset, shape, scenes] of STYLED) for (const scene of scenes) await shoot(preset, scene, shape);

if (process.env.RECORD) {
  const vdir = join(here, "video");
  await mkdir(vdir, { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: 1040, height: 760 }, recordVideo: { dir: vdir, size: { width: 1040, height: 760 } } });
  const page = await ctx.newPage();
  const wait = (ms) => page.waitForTimeout(ms);
  await page.goto(`${base}/out/harness.html?scene=flow&preset=${process.env.RECORD_PRESET || "obsidian"}`);
  await wait(1800);
  await page.getByRole("button", { name: /Scan my PC/ }).click();
  await wait(5200);
  await page.getByRole("button", { name: /Big downloads/ }).first().click();
  await wait(900);
  await page.getByRole("checkbox", { name: /Pick .*ubuntu/ }).click();
  await wait(700);
  await page.getByRole("button", { name: /Big downloads/ }).first().click();
  await wait(500);
  await page.getByRole("button", { name: /^Clean up / }).click();
  await wait(1900);
  await page.locator(".cl-sheet-foot .cl-btn.is-primary").click();
  await wait(3600);
  await page.getByRole("button", { name: /Share my result/ }).click();
  await wait(2000);
  await page.keyboard.press("Escape");
  await wait(600);
  await page.getByRole("button", { name: /^Done/ }).click();
  await wait(900);
  await page.getByRole("tab", { name: "Space map" }).click();
  await wait(2600);
  await page.getByRole("tab", { name: "Treemap" }).click();
  await wait(1800);
  await page.getByRole("tab", { name: "Sunburst" }).click();
  await wait(2200);
  await page.getByRole("radio", { name: "Videos" }).click();
  await wait(1500);
  await ctx.close();
  const vids = (await readdir(vdir)).filter((f) => f.endsWith(".webm"));
  if (vids.length) await rename(join(vdir, vids[vids.length - 1]), join(vdir, "flow.webm"));
  console.log(`[parity:cleaner] recorded ${join(vdir, "flow.webm")}`);
}

await browser.close();
server.close();
console.log(`[parity:cleaner] ${failed ? `${failed} scene(s) failed` : "all scenes rendered cleanly"}`);
process.exit(failed ? 1 : 0);
