// Backdrop Lab checks + screenshots (docs/BACKDROP_LAB.md §Tests). Needs ./out (build.mjs).
// Fails on: a shader that doesn't compile, NaN/Inf pixels, a visible jump at the loop seam, a
// blank frame, a flash while switching wallpaper looks, or any page error.
// Env: PARITY_CHROME, PARITY_PLAYWRIGHT, BACKDROP_OUT (default ./shots),
//      BACKDROP_LOOPS=1 to also record loops and live captures (needs ffmpeg; off in CI).
import { createServer } from "node:http";
import { readFile, mkdir, writeFile, rm } from "node:fs/promises";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const shots = process.env.BACKDROP_OUT || join(here, "shots");
await mkdir(shots, { recursive: true });
const { chromium } = await import(process.env.PARITY_PLAYWRIGHT ? pathToFileURL(process.env.PARITY_PLAYWRIGHT).href : "playwright");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
const root = join(here, "out");
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^([/\\])+/, "");
  const file = join(root, path);
  if (!file.startsWith(root)) return res.writeHead(403).end();
  try {
    res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" }).end(await readFile(file));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}/index.html`;
const browser = await chromium.launch({
  ...(process.env.PARITY_CHROME ? { executablePath: process.env.PARITY_CHROME } : {}),
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"],
});
const errors = [];
const page = async (q, vp = { width: 1440, height: 900 }) => {
  const p = await browser.newPage({ viewport: vp, deviceScaleFactor: 1 });
  p.on("pageerror", (e) => errors.push(`${q}: ${e.message}`));
  p.on("console", (m) => m.type() === "error" && !/favicon|Failed to load resource|GL Driver/.test(m.text()) && errors.push(`${q}: ${m.text()}`));
  await p.goto(`${base}?${q}`, { waitUntil: "commit" });
  await p.waitForLoadState("load", { timeout: 300000 }).catch(() => {});
  return p;
};
const result = async (p, timeout = 240000) => {
  await p.waitForFunction(() => window.result, null, { timeout });
  return p.evaluate(() => window.result);
};
const log = (...a) => console.log("[backdrop]", ...a);

// 1. Engine checks: compile, NaN, seam, blank.
{
  const p = await page("scene=checks", { width: 400, height: 300 });
  const r = await result(p);
  await writeFile(join(shots, "checks.json"), JSON.stringify(r, null, 2));
  if (r.error) errors.push(`checks: ${r.error}`);
  for (const e of r.errors ?? []) errors.push(`compile ${e}`);
  for (const [k, v] of Object.entries(r.nan ?? {})) errors.push(`NaN/Inf pixels: ${k} (${v})`);
  for (const k of r.blank ?? []) errors.push(`blank frame: ${k}`);
  const worstSeam = Object.entries(r.seams ?? {}).sort((a, b) => b[1] - a[1])[0];
  for (const [k, v] of Object.entries(r.seams ?? {})) if (v > 0.5) errors.push(`loop seam ${k}: ${v.toFixed(2)} (> 0.5 of 255)`);
  log(`${r.count} looks/presets checked; worst seam ${worstSeam?.[0]} ${worstSeam?.[1]?.toFixed(3)}`);
  await p.close();
}

// 2. Timing at 1080p (software GL in CI: recorded, loosely gated).
{
  const p = await page("scene=perf", { width: 400, height: 300 });
  const r = await result(p);
  await writeFile(join(shots, "perf.json"), JSON.stringify(r, null, 2));
  const worst = Object.entries(r).sort((a, b) => b[1] - a[1])[0];
  log(`ms/frame scaled to 1080p (software GL, not a GPU): worst ${worst[0]} ${worst[1]}`);
  const gate = Number(process.env.BACKDROP_SW_BUDGET_MS || 60000);
  for (const [k, v] of Object.entries(r)) if (v > gate) errors.push(`perf: ${k} ${v} ms > ${gate} ms (software)`);
  await p.close();
}

// 3. No flash when switching wallpaper looks (incl. to and from another scene).
{
  const p = await page("scene=flash&wp=lens-nebula", { width: 640, height: 360 });
  const r = await result(p, 60000);
  await writeFile(join(shots, "flash.json"), JSON.stringify(r, null, 2));
  for (const s of r.report ?? []) if (s.flash) errors.push(`flash during "${s.step}": min ${s.min.toFixed(1)} max ${s.max.toFixed(1)} (looks ${s.lo.toFixed(1)}–${s.hi.toFixed(1)})`);
  log(`switch checks: ${(r.report ?? []).map((s) => `${s.step} ${s.flash ? "FLASH" : "ok"}`).join(", ")}`);
  await p.close();
}

// 4. Screenshots.
const snap = async (q, file, vp, wait = 1200) => {
  const p = await page(q, vp);
  await p.waitForTimeout(wait);
  await p.screenshot({ path: join(shots, file) });
  return p;
};
for (const preset of ["obsidian", "alabaster-daylight"]) {
  (await snap(`scene=lab&preset=${preset}&id=lens-nebula`, `lab-${preset}.png`, { width: 1440, height: 900 }, 2500)).close();
}
{
  // Advanced controls, compare and in-context preview on a beam look.
  const p = await page(`scene=lab&preset=obsidian&id=light-gallery-beam`, { width: 1440, height: 900 });
  await p.waitForTimeout(1500);
  await p.getByRole("radio", { name: "Advanced" }).click();
  await p.getByRole("radio", { name: "Always" }).click();
  await p.waitForTimeout(600);
  await p.screenshot({ path: join(shots, "lab-advanced-handles.png") });
  await p.getByRole("button", { name: /In context/ }).click();
  await p.keyboard.press("c");
  await p.waitForTimeout(900);
  await p.screenshot({ path: join(shots, "lab-compare-context.png") });
  await p.keyboard.press("e");
  await p.waitForTimeout(500);
  await p.screenshot({ path: join(shots, "lab-export.png") });
  await p.close();
}
{
  // Compact window (controls become a sheet) and the first-run coach mark.
  const p = await page(`scene=lab&preset=obsidian&id=nature-moon-sea&coach=1`, { width: 960, height: 680 });
  await p.waitForTimeout(1500);
  await p.screenshot({ path: join(shots, "lab-compact-coach.png") });
  await p.close();
}
(await snap("scene=creator&preset=obsidian", "creator-obsidian.png", { width: 800, height: 560 }, 2500)).close();
(await snap("scene=modes", "modes.png", { width: 1880, height: 1100 }, 300)).close();
const PRESETS8 = ["lens-nebula", "light-gallery-beam", "nature-polar-curtain", "nature-moon-sea", "nature-afternoon-wall", "glass-amethyst", "pattern-midnight-tiles", "light-hyperspace"];
for (const id of PRESETS8) (await snap(`scene=frame&id=${id}&w=1920&h=1080`, `preset-${id}.png`, { width: 1920, height: 1080 }, 200)).close();
{
  const p = await page(`scene=theme&id=lens-nebula`, { width: 1280, height: 720 });
  const r = await result(p);
  await writeFile(join(shots, "theme.json"), JSON.stringify(r, null, 2));
  if (!r.report?.ok) errors.push(`theme from backdrop not readable: ${JSON.stringify(r.report)}`);
  await p.close();
}

// 5. Loops and live captures (local; needs ffmpeg).
if (process.env.BACKDROP_LOOPS === "1") {
  const tmp = join(shots, "_frames");
  const ff = (args) => execFileSync("ffmpeg", ["-loglevel", "error", "-y", ...args]);
  const capture = async (q, seconds, fps, vp) => {
    await rm(tmp, { recursive: true, force: true });
    await mkdir(tmp, { recursive: true });
    const p = await page(q, vp);
    await p.waitForTimeout(1500);
    const n = seconds * fps;
    for (let i = 0; i < n; i++) {
      await p.screenshot({ path: join(tmp, `f${String(i).padStart(4, "0")}.png`) });
      await p.waitForTimeout(1000 / fps / 3);
    }
    await p.close();
    return n;
  };
  await mkdir(join(shots, "live"), { recursive: true });
  for (const id of ["lens-nebula", "nature-polar-curtain", "glass-night-drive"]) {
    // Loop clip: each frame rendered at its exact time, so the clip repeats seamlessly.
    const fps = 15;
    const secs = 6;
    for (let i = 0; i < fps * secs; i++) {
      const f = await page(`scene=frame&id=${id}&w=640&h=360&t=${(i / fps).toFixed(4)}`, { width: 640, height: 360 });
      await result(f);
      await f.screenshot({ path: join(tmp, `f${String(i).padStart(4, "0")}.png`) });
      await f.close();
    }
    ff(["-framerate", String(fps), "-i", join(tmp, "f%04d.png"), "-c:v", "libvpx-vp9", "-b:v", "1.5M", "-pix_fmt", "yuv420p", join(shots, `loop-${id}.webm`)]);
    // Live: the real wallpaper surface running the backdrop scene for 10 s.
    await capture(`scene=wallpaper&wp=${id}`, 10, 8, { width: 960, height: 540 });
    ff(["-framerate", "8", "-i", join(tmp, "f%04d.png"), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", "24", join(shots, "live", `live-${id}.mp4`)]);
  }
  await rm(tmp, { recursive: true, force: true });
}

await browser.close();
server.close();
if (errors.length) {
  console.error("[backdrop] FAILED:\n  " + errors.join("\n  "));
  process.exit(1);
}
log(`ok → ${shots}`);
