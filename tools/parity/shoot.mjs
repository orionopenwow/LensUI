// Renders every Lens surface in Obsidian and Alabaster Daylight, saves PNGs to tools/parity/shots/,
// and exits 1 if any surface throws, logs a console error, or renders nothing.
// Env: PARITY_PRESETS (comma list), PARITY_CHROME (browser executable), PARITY_PLAYWRIGHT (module path).
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "out");
const shots = join(here, "shots");
await mkdir(shots, { recursive: true });

const { chromium } = await import(process.env.PARITY_PLAYWRIGHT ? pathToFileURL(process.env.PARITY_PLAYWRIGHT).href : "playwright");

const SURFACES = {
  dock: [1920, 760],
  topbar: [1920, 34],
  settings: [760, 560],
  palette: [660, 460],
  widgets: [360, 680],
  quicksettings: [404, 580],
  notifications: [364, 420],
  desktopfolder: [420, 640],
  launcher: [780, 640],
  overview: [1120, 700],
  wallpaper: [960, 540],
};
const PRESETS = (process.env.PARITY_PRESETS || "obsidian,alabaster-daylight").split(",");
// Messages from the harness itself (missing optional assets) that aren't app bugs.
const IGNORE = [/favicon\.ico/i];

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml" };
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^([/\\])+/, "");
  const file = join(out, path);
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
const report = [];
for (const preset of PRESETS) {
  for (const [surface, [width, height]] of Object.entries(SURFACES)) {
    const page = await browser.newPage({ viewport: { width, height } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => {
      // Failed loads are reported with their URL by the "response" handler below.
      if (m.type() === "error" && !/^Failed to load resource/.test(m.text())) errors.push(`console: ${m.text().slice(0, 300)}`);
    });
    page.on("response", (r) => {
      if (r.status() >= 400 && !IGNORE.some((re) => re.test(r.url()))) errors.push(`http ${r.status()}: ${r.url()}`);
    });
    await page.goto(`${base}/harness.html?surface=${surface}&preset=${preset}`);
    await page.waitForTimeout(1200);
    const html = await page.locator("#root").innerHTML();
    // The wallpaper surface is intentionally empty until a wallpaper is chosen.
    if (html.length === 0 && surface !== "wallpaper") errors.push("rendered nothing");
    await page.screenshot({ path: join(shots, `${preset}-${surface}.png`) });
    report.push({ preset, surface, ok: errors.length === 0, errors });
    console.log(`${errors.length ? "FAIL" : "ok  "} ${preset} ${surface}${errors.length ? "\n      " + errors.join("\n      ") : ""}`);
    await page.close();
  }
}
await browser.close();
server.close();
await writeFile(join(shots, "report.json"), JSON.stringify(report, null, 2));
const failed = report.filter((r) => !r.ok).length;
console.log(`[parity] ${report.length - failed}/${report.length} surfaces rendered cleanly`);
process.exit(failed ? 1 : 0);
