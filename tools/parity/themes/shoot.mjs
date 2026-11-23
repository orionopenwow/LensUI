// Screenshots for the featured themes and the Wallpaper Switcher, from the main harness
// (tools/parity/out, built by tools/parity/build.mjs):
//   look-<id>.png       each featured look applied: its backdrop, the Dock and a window
//   gallery.png         the Theme gallery, featured first
//   picker-<preset>.png the wallpaper picker in two themes
//   settings-wallpaper.png  Simple mode's Appearance page with the Wallpaper card
// Fails on page or console errors. Env: PARITY_CHROME, PARITY_PLAYWRIGHT, PARITY_OUT (output dir).
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, "..", "out");
const shots = process.env.PARITY_OUT ? resolve(process.env.PARITY_OUT) : join(here, "shots");
await mkdir(shots, { recursive: true });
const { chromium } = await import(process.env.PARITY_PLAYWRIGHT ? pathToFileURL(process.env.PARITY_PLAYWRIGHT).href : "playwright");

const FEATURED = (process.env.PARITY_LOOKS ||
  "obsidian,alabaster-daylight,living-sky,catppuccin-mocha,hyprland-neon,cyberpunk-amber,paper-minimal,lens-expressive,lens-dot-matrix,everforest-dark,solarized-matte,gruvbox-warm").split(",");

// One desktop: the look's backdrop behind, a window in the middle, the Dock along the bottom.
const desk = (id) => `<!DOCTYPE html><html><head><meta charset="utf-8"><link rel="icon" href="data:,"><style>
html,body{margin:0;height:100%;overflow:hidden;background:#000}
iframe{position:absolute;border:0;background:transparent}
#wp{inset:0;width:100%;height:100%}
#win{left:50%;top:44px;width:760px;height:560px;margin-left:-380px;border-radius:12px;box-shadow:0 40px 90px -30px rgb(0 0 0 / .7)}
#dock{left:0;bottom:0;width:100%;height:760px}
</style></head><body>
<iframe id="wp" src="/harness.html?surface=wallpaper&preset=${id}&look=1&${id.startsWith("living-") ? `scene=${id}` : "ambient=lively"}"></iframe>
<iframe id="win" src="/harness.html?surface=settings&tab=theme&preset=${id}&look=1&settingsMode=simple"></iframe>
<iframe id="dock" src="/harness.html?surface=dock&preset=${id}&look=1"></iframe>
</body></html>`;

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml" };
const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/favicon.ico") return res.writeHead(204).end();
  if (url.pathname === "/desk.html") return res.writeHead(200, { "content-type": "text/html" }).end(desk(url.searchParams.get("preset") || "obsidian"));
  const path = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, "");
  const file = join(out, path);
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

async function shot(name, url, [width, height], prepare) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !/^Failed to load resource/.test(m.text())) errors.push(`console: ${m.text().slice(0, 300)}`);
  });
  await page.goto(`${base}${url}`);
  await page.waitForTimeout(1500);
  try {
    if (prepare) await prepare(page);
  } catch (e) {
    errors.push(`prepare: ${e.message.split("\n")[0]}`);
  }
  await page.screenshot({ path: join(shots, `${name}.png`) });
  if (errors.length) failed++;
  console.log(`${errors.length ? "FAIL" : "ok  "} ${name}${errors.length ? "\n      " + errors.join("\n      ") : ""}`);
  await page.close();
}

for (const id of FEATURED) await shot(`look-${id}`, `/desk.html?preset=${id}`, [1600, 900], (p) => p.waitForTimeout(1200));

await shot("gallery", "/harness.html?surface=settings&tab=theme&preset=obsidian&settingsMode=advanced", [1100, 1500], async (page) => {
  await page.getByRole("button", { name: /Browse all/ }).first().click();
  await page.waitForTimeout(700);
});

await shot("settings-wallpaper", "/harness.html?surface=settings&tab=theme&preset=obsidian&settingsMode=simple", [760, 900], async (page) => {
  await page.locator("[data-wallpaper-switcher]").first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
});

for (const preset of ["obsidian", "alabaster-daylight"]) {
  await shot(`picker-${preset}`, `/harness.html?surface=studio&view=wallpapers&preset=${preset}`, [1440, 860], async (page) => {
    await page.locator("[data-wallpaper-picker]").waitFor();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(700);
  });
}
await shot("picker-schedule", "/harness.html?surface=studio&view=wallpapers&preset=obsidian", [1440, 860], async (page) => {
  await page.locator("[data-wallpaper-picker]").waitFor();
  await page.keyboard.press("End");
  await page.keyboard.press("s");
  await page.waitForTimeout(700);
});

await browser.close();
server.close();
console.log(`[parity:themes] shots in ${shots}${failed ? `, ${failed} with errors` : ""}`);
process.exit(failed ? 1 : 0);
