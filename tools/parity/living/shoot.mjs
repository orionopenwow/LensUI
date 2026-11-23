// Living Themes parity shots (docs/LIVING_THEMES.md). Needs tools/parity/living/out (build.mjs) and
// tools/parity/out (../build.mjs) for the Dock, widgets and settings pages.
// Env: LIVING_OUT (default tools/parity/living/shots), PARITY_CHROME, PARITY_PLAYWRIGHT, LIVING_TIMELAPSE=0.
import { createServer } from "node:http";
import { readFile, mkdir, rm } from "node:fs/promises";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const parity = join(here, "..");
const shots = process.env.LIVING_OUT || join(here, "shots");
await mkdir(shots, { recursive: true });
const { chromium } = await import(process.env.PARITY_PLAYWRIGHT ? pathToFileURL(process.env.PARITY_PLAYWRIGHT).href : "playwright");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml" };
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^([/\\])+/, "");
  const file = join(parity, path);
  if (!file.startsWith(parity)) return res.writeHead(403).end();
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
const errors = [];
const watch = (page, label) => {
  page.on("pageerror", (e) => errors.push(`${label}: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && !/favicon|Failed to load resource/.test(m.text()) && errors.push(`${label}: ${m.text()}`));
};

async function framePage(theme, { lat = 51.5, lon = -0.1, weather = "clear", w = 1920, h = 1080, iso }) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  watch(page, `frame-${theme}`);
  await page.goto(`${base}/living/out/index.html?theme=${theme}&lat=${lat}&lon=${lon}&weather=${weather}&iso=${encodeURIComponent(iso)}`);
  await page.waitForFunction(() => window.ready);
  return page;
}

/** Dock + widgets dressed with the living look for that instant, over the real frame. */
async function desktop(name, theme, opts) {
  const page = await framePage(theme, opts);
  const look = await page.evaluate(([t, iso, la, lo]) => window.look(t, iso, la, lo), [theme, opts.iso, opts.lat ?? 51.5, opts.lon ?? -0.1]);
  const bg = await page.screenshot();
  await page.close();
  const bgUrl = `data:image/png;base64,${bg.toString("base64")}`;
  const dress = async (surface, w, h, x, y) => {
    const p = await browser.newPage({ viewport: { width: w, height: h } });
    watch(p, `${surface}-${name}`);
    await p.goto(`${base}/out/harness.html?surface=${surface}&preset=${theme}`);
    await p.waitForTimeout(1100);
    await p.addStyleTag({ content: `html{background:url(${bgUrl}) -${x}px -${y}px/1920px 1080px no-repeat!important} body,#root{background:transparent!important}` });
    await p.evaluate((l) => {
      const r = document.documentElement;
      r.dataset.scheme = l.scheme;
      r.style.setProperty("--lens-pack-base", l.base);
      r.style.setProperty("--lens-pack-elevated", l.elevated);
      r.style.setProperty("--lens-accent", l.accent);
    }, look);
    await p.waitForTimeout(250);
    const file = join(shots, `_${surface}-${name}.png`);
    await p.screenshot({ path: file });
    await p.close();
    return file;
  };
  const bgFile = join(shots, `_bg-${name}.png`);
  await (await import("node:fs/promises")).writeFile(bgFile, bg);
  const dock = await dress("dock", 1920, 760, 0, 320);
  const widgets = await dress("widgets", 360, 680, 1536, 60);
  execFileSync("python3", ["-c", `from PIL import Image
bg=Image.open(${JSON.stringify(bgFile)}).convert("RGB")
bg.paste(Image.open(${JSON.stringify(dock)}).convert("RGB"),(0,320))
bg.paste(Image.open(${JSON.stringify(widgets)}).convert("RGB"),(1536,60))
bg.resize((1600,900),Image.LANCZOS).save(${JSON.stringify(join(shots, `${name}.png`))})`]);
  await rm(bgFile);
  await rm(dock);
  await rm(widgets);
  return look;
}

// 1. Sky through one autumn day in London (sunrise, noon, sunset, dusk, night).
const day = "2026-10-15";
const probe = await framePage("living-sky", { iso: `${day}T12:00:00Z`, w: 64, h: 36 });
const { sunrise, sunset } = await probe.evaluate((d) => window.times(d), `${day}T12:00:00Z`);
await probe.close();
const plus = (iso, min) => new Date(new Date(iso).getTime() + min * 60_000).toISOString();
const SKY = [
  ["sky-1-sunrise", plus(sunrise, 6)],
  ["sky-2-noon", `${day}T11:50:00Z`],
  ["sky-3-sunset", plus(sunset, -8)],
  ["sky-4-dusk", plus(sunset, 38)],
  ["sky-5-night", `${day}T22:30:00Z`],
];
const looks = {};
for (const [name, iso] of SKY) looks[name] = await desktop(name, "living-sky", { iso });

// 2. Each family theme at its best moment.
const FAMILY = [
  ["moonlight", "living-moonlight", { iso: "2026-10-26T21:30:00Z" }],
  ["seasons-autumn", "living-seasons", { iso: `${day}T14:00:00Z` }],
  ["golden-hour", "living-golden-hour", { iso: plus(sunset, -4) }],
  ["weather-rain", "living-weather", { iso: `${day}T13:00:00Z`, weather: "rain" }],
  ["tides", "living-tides", { iso: plus(sunset, -15) }],
  ["city-night", "living-city-night", { iso: `${day}T19:30:00Z` }],
  ["northern-lights", "living-aurora", { iso: "2026-12-05T21:00:00Z", lat: 69.6, lon: 19 }],
  ["desert-day", "living-desert", { iso: "2026-10-15T05:45:00Z", lat: 23.4, lon: 25.7 }],
];
for (const [name, theme, opts] of FAMILY) looks[name] = await desktop(name, theme, opts);

// 3. Settings row with the scrubber at dusk.
{
  const page = await browser.newPage({ viewport: { width: 1100, height: 1500 } });
  watch(page, "settings");
  await page.goto(`${base}/out/harness.html?surface=settings&preset=living-sky`);
  await page.waitForTimeout(900);
  const themeTab = page.getByRole("button", { name: /Theme & Look/i }).first();
  if (await themeTab.count()) await themeTab.click().catch(() => {});
  await page.waitForTimeout(500);
  const row = page.locator('section[aria-label="Living themes"]').first();
  await row.scrollIntoViewIfNeeded();
  await page.locator('input[aria-label="Preview time of day"]').evaluate((el) => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    set.call(el, "1110");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.waitForTimeout(900);
  await row.screenshot({ path: join(shots, "settings-living-row.png") });
  await page.close();
}

// 4. A full Sky day as a 10-second time-lapse (12 fps, 120 frames).
if (process.env.LIVING_TIMELAPSE !== "0") {
  const page = await framePage("living-sky", { iso: `${day}T00:00:00Z`, w: 960, h: 540 });
  const dir = join(shots, "_frames");
  await mkdir(dir, { recursive: true });
  for (let i = 0; i < 120; i++) {
    const iso = new Date(Date.UTC(2026, 9, 15) + (i / 120) * 86_400_000).toISOString();
    await page.evaluate(([iso, t]) => window.render(iso, t), [iso, 20 + i / 12]);
    await page.screenshot({ path: join(dir, `${String(i).padStart(3, "0")}.png`) });
  }
  await page.close();
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", "12", "-i", join(dir, "%03d.png"), "-vf", "scale=800:-1:flags=lanczos", "-c:v", "libwebp", "-lossless", "0", "-q:v", "72", "-loop", "0", join(shots, "sky-day-timelapse.webp")]);
  await rm(dir, { recursive: true });
}

await browser.close();
server.close();
await (await import("node:fs/promises")).writeFile(join(shots, "looks.json"), JSON.stringify(looks, null, 2));
if (errors.length) {
  console.error("[living] problems:\n  " + errors.join("\n  "));
  process.exit(1);
}
console.log(`[living] shots in ${shots}`);
