// Screenshots the Lens Expressive / Lens Dot Matrix style layers:
//  - gallery scenes from ./out (widgets, stat pills, islands dock, composed desktop, theme gallery);
//  - real Lens surfaces from the main harness (../out, built by tools/parity/build.mjs) with
//    ?shape=…&dockStyle=islands, so the CSS layer is verified on the real components.
// Fails on page or console errors. Env: PARITY_CHROME, PARITY_PLAYWRIGHT, PARITY_OUT.
import { createServer } from "node:http";
import { readFile, mkdir, copyFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const parityRoot = resolve(here, "..");
const shots = join(here, "shots");
await mkdir(shots, { recursive: true });
const { chromium } = await import(process.env.PARITY_PLAYWRIGHT ? pathToFileURL(process.env.PARITY_PLAYWRIGHT).href : "playwright");

const STYLES = {
  expressive: (process.env.PARITY_EXPRESSIVE || "obsidian,alabaster-daylight,catppuccin-mocha,tokyo-night").split(","),
  dotmatrix: (process.env.PARITY_DOTMATRIX || "obsidian,alabaster-daylight,nord-frost").split(","),
};
const GALLERY = {
  widgets: [1000, 760],
  statpills: [560, 60],
  dock: [1366, 120],
  gallery: [760, 1900],
  notifications: [400, 560],
  calendar: [400, 760],
};
const SURFACES = { dock: [1920, 760], quicksettings: [404, 580], settings: [760, 560], widgets: [360, 680] };
const haveMain = existsSync(join(parityRoot, "out", "harness.html"));

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml" };
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^([/\\])+/, "");
  if (path === "favicon.ico") return res.writeHead(204).end();
  // /styles/out/* = this gallery; everything else = the main harness output served at the root,
  // exactly as tools/parity/shoot.mjs serves it (its chunks use root-relative paths).
  const gallery = path.startsWith("styles/out/") || path.startsWith("styles\\out\\");
  const rootDir = gallery ? join(here, "out") : join(parityRoot, "out");
  const file = gallery ? join(here, "out", path.slice("styles/out/".length)) : join(parityRoot, "out", path);
  if (!file.startsWith(rootDir)) return res.writeHead(403).end();
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

async function shoot(url, [width, height], name) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && !/favicon/.test(m.text()) && errors.push(`console: ${m.text().slice(0, 200)}`));
  await page.goto(`${base}${url}`);
  await page.waitForTimeout(900);
  await page.screenshot({ path: join(shots, name) });
  if (process.env.PARITY_OUT) {
    await mkdir(process.env.PARITY_OUT, { recursive: true });
    await copyFile(join(shots, name), join(process.env.PARITY_OUT, name));
  }
  if (errors.length) failed++;
  console.log(`${errors.length ? "FAIL" : "ok  "} ${name}${errors.length ? "\n      " + errors.join("\n      ") : ""}`);
  await page.close();
}

for (const [shape, presets] of Object.entries(STYLES)) {
  for (const preset of presets) {
    for (const [scene, size] of Object.entries(GALLERY)) {
      if (scene === "statpills" && shape !== "dotmatrix") continue;
      await shoot(`/styles/out/harness.html?scene=${scene}&preset=${preset}&shape=${shape}`, size, `${shape}-${preset}-${scene}.png`);
    }
    if (haveMain) {
      for (const [surface, size] of Object.entries(SURFACES)) {
        await shoot(`/harness.html?surface=${surface}&preset=${preset}&shape=${shape}&dockStyle=islands`, size, `${shape}-${preset}-surface-${surface}.png`);
      }
    }
  }
  await shoot(`/styles/out/harness.html?scene=desktop&preset=obsidian&shape=${shape}`, [1600, 900], `${shape}-obsidian-desktop.png`);
}
if (!haveMain) console.log("note: main harness not built (node tools/parity/build.mjs); real-surface scenes skipped");
await browser.close();
server.close();
console.log(`[parity:styles] ${failed ? `${failed} scene(s) failed` : "all scenes rendered cleanly"}`);
process.exit(failed ? 1 : 0);
