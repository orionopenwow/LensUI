// Ambient backdrop screenshots, loops and timing (docs/AMBIENT.md).
// Needs tools/parity/ambient/out (build.mjs) and, for composed desktops, tools/parity/out (../build.mjs).
// Env: PARITY_CHROME, PARITY_PLAYWRIGHT, AMBIENT_OUT (output folder; default tools/parity/ambient/shots),
//      AMBIENT_LOOPS=0 to skip the animated loops, AMBIENT_DESKTOPS=0 to skip composites (CI),
//      AMBIENT_BUDGET_MS (default 3; the unit test in src/__tests__/ambient.test.ts is the strict gate).
import { createServer } from "node:http";
import { readFile, mkdir, writeFile, rm } from "node:fs/promises";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const parity = join(here, "..");
const shots = process.env.AMBIENT_OUT || join(here, "shots");
await mkdir(shots, { recursive: true });
const { chromium } = await import(process.env.PARITY_PLAYWRIGHT ? pathToFileURL(process.env.PARITY_PLAYWRIGHT).href : "playwright");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml" };
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^([/\\])+/, "");
  const file = join(parity, path);
  if (!file.startsWith(parity)) return res.writeHead(403).end();
  try {
    res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" }).end(await readFile(file));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch(process.env.PARITY_CHROME ? { executablePath: process.env.PARITY_CHROME } : {});
const errors = [];
const watch = (page, label) => {
  page.on("pageerror", (e) => errors.push(`${label}: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && !/favicon|Failed to load resource/.test(m.text()) && errors.push(`${label}: ${m.text()}`));
};

// 1. Contact sheets (still frame + 3-frame strip per built-in pack).
for (const bg of ["dark", "light"]) {
  const page = await browser.newPage({ viewport: { width: 1380, height: 900 } });
  watch(page, `sheet-${bg}`);
  await page.goto(`${base}/ambient/out/index.html?mode=sheet&bg=${bg}`);
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(shots, `contact-${bg}.png`), fullPage: true });
  await page.close();
}

// 2. Timing in the browser (paint + putImageData at 1080p).
{
  const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
  watch(page, "perf");
  await page.goto(`${base}/ambient/out/index.html?mode=perf`);
  await page.waitForFunction(() => window.perf, null, { timeout: 120000 });
  const perf = await page.evaluate(() => window.perf);
  await writeFile(join(shots, "perf.json"), JSON.stringify(perf, null, 2));
  const budget = Number(process.env.AMBIENT_BUDGET_MS || 3);
  console.log("[ambient] ms/frame at 1080p (paint + putImageData):", Object.entries(perf).map(([k, v]) => `${k} ${v.ms}`).join(", "));
  for (const [k, v] of Object.entries(perf)) if (v.ms > budget) errors.push(`perf: ${k} ${v.ms} ms > ${budget} ms`);
  await page.close();
}

// 3. Composed desktops: backdrop + the real Dock surface over it, and short loops.
const REP = [
  ["obsidian", "Obsidian waves"],
  ["nord-frost", "Nord aurora"],
  ["tokyo-night", "Tokyo contours"],
  ["alabaster-daylight", "Alabaster paper"],
  ["catppuccin-mocha", "Catppuccin breathe"],
  ["gruvbox-warm", "Gruvbox fog"],
];
let haveHarness = process.env.AMBIENT_DESKTOPS !== "0"; // composites need Python + Pillow
try {
  await readFile(join(parity, "out", "harness.html"));
} catch {
  haveHarness = false;
}
for (const [pack] of REP) {
  const bgPage = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  watch(bgPage, `frame-${pack}`);
  await bgPage.goto(`${base}/ambient/out/index.html?mode=frame&pack=${pack}&t=20`);
  await bgPage.waitForTimeout(200);
  const bgFile = join(shots, `_bg-${pack}.png`);
  await bgPage.screenshot({ path: bgFile });
  if (haveHarness) {
    const dock = await browser.newPage({ viewport: { width: 1920, height: 760 } });
    watch(dock, `dock-${pack}`);
    await dock.goto(`${base}/out/harness.html?surface=dock&preset=${pack}`);
    await dock.addStyleTag({ content: "html,body,#root{background:transparent!important}" });
    await dock.waitForTimeout(1200);
    const dockFile = join(shots, `_dock-${pack}.png`);
    await dock.screenshot({ path: dockFile, omitBackground: true });
    await dock.close();
    execFileSync("python3", [
      "-c",
      `from PIL import Image
bg=Image.open(${JSON.stringify(bgFile)}).convert("RGBA")
d=Image.open(${JSON.stringify(dockFile)}).convert("RGBA")
bg.alpha_composite(d,(0,1080-760))
bg.convert("RGB").resize((1280,720),Image.LANCZOS).save(${JSON.stringify(join(shots, `desktop-${pack}.png`))})`,
    ]);
    await rm(dockFile);
  }
  // Loop: 5 s at 12 fps, scene time sped up 4× so the slow motion reads in a short clip.
  if (process.env.AMBIENT_LOOPS !== "0") {
    await bgPage.setViewportSize({ width: 640, height: 360 });
    const dir = join(shots, `_frames-${pack}`);
    await mkdir(dir, { recursive: true });
    for (let i = 0; i < 60; i++) {
      await bgPage.evaluate((t) => window.render(t), 20 + (i / 12) * 4);
      await bgPage.screenshot({ path: join(dir, `${String(i).padStart(3, "0")}.png`) });
    }
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", "12", "-i", join(dir, "%03d.png"), "-vf", "scale=480:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=64:stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle", "-loop", "0", join(shots, `loop-${pack}.gif`)]);
    try {
      execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", "12", "-i", join(dir, "%03d.png"), "-c:v", "libwebp", "-lossless", "0", "-q:v", "70", "-loop", "0", join(shots, `loop-${pack}.webp`)]);
    } catch {
      /* ffmpeg without libwebp: the GIF is enough */
    }
    await rm(dir, { recursive: true });
  }
  await rm(bgFile);
  await bgPage.close();
}

await browser.close();
server.close();
if (errors.length) {
  console.error("[ambient] problems:\n  " + errors.join("\n  "));
  process.exit(1);
}
console.log(`[ambient] shots in ${shots}`);
