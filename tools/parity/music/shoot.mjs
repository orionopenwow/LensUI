// Screenshots every Lens Music scene; fails on page/console errors.
// Env: PARITY_CHROME, PARITY_PLAYWRIGHT, PARITY_OUT, PARITY_PRESETS (as tools/parity/shoot.mjs).
import { createServer } from "node:http";
import { readFile, mkdir, copyFile } from "node:fs/promises";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "out");
const shots = join(here, "shots");
await mkdir(shots, { recursive: true });
const { chromium } = await import(process.env.PARITY_PLAYWRIGHT ? pathToFileURL(process.env.PARITY_PLAYWRIGHT).href : "playwright");

// name -> [scene, width, height, element selector (optional), tinted variant?]
const SHOTS = [
  ["mini-floating", "mini-floating", 960, 200, null, true],
  ["mini-taskbar", "mini-taskbar", 960, 200, null, false],
  ["np-compact", "np-compact", 900, 420, null, false],
  ["np-expanded", "np-expanded", 1440, 860, null, true],
  ["np-expanded-spotify", "np-expanded-spotify", 1440, 860, null, false],
  ["np-fullscreen", "np-fullscreen", 1440, 860, null, false],
  ["np-empty", "np-empty", 900, 500, null, false],
  ["hero", "np-expanded", 1440, 860, ".lm-hero", false],
  ["queue-generic", "np-expanded", 1440, 860, ".lm-queue", false],
  ["queue-spotify", "np-expanded-spotify", 1440, 860, ".lm-queue", false],
  ["bar", "np-expanded-spotify", 1440, 860, ".lm-bar", false],
  ["accent", "accent", 600, 260, null, true],
  ["scene", "scene", 960, 540, null, false],
  ["card", "card", 760, 1900, null, false],
  ["spicetify", "spicetify", 1280, 760, null, true],
  // Learned from Cider: Immersive (dark and light via the presets), no artwork, long lyrics,
  // original + translation, nothing playing, the sound glow; Now Playing tinted vs theme accent.
  ["imm", "imm", 1440, 860, null, false],
  ["imm-noart", "imm-noart", 1440, 860, null, false],
  ["imm-long", "imm-long", 1440, 860, null, false],
  ["imm-both", "imm-both", 1440, 860, null, false],
  ["imm-empty", "imm-empty", 1440, 860, null, false],
  ["imm-glow", "imm-glow", 1440, 860, null, false],
  ["imm-small", "imm", 900, 640, null, false],
  ["np-theme-accent", "np-theme-accent", 1440, 860, null, false],
  ["card-setup", "card-setup", 760, 2400, null, false],
];
const PRESETS = (process.env.PARITY_PRESETS || "obsidian,alabaster-daylight").split(",");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".ini": "text/plain" };
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^([/\\])+/, "");
  const file = join(here, path);
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
const runs = [];
for (const preset of PRESETS) for (const s of SHOTS) runs.push([preset, s, false]);
for (const s of SHOTS) if (s[5]) runs.push(["obsidian", s, true]);
for (const [preset, [name, scene, w, h, sel], tint] of runs) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && !/favicon/.test(m.text()) && errors.push(`console: ${m.text().slice(0, 200)}`));
  await page.goto(`${base}/out/harness.html?scene=${scene}&preset=${preset}${tint ? "&tint=1" : ""}`);
  await page.waitForTimeout(1500);
  const file = `${preset}${tint ? "-tint" : ""}-${name}.png`;
  try {
    if (sel) await page.locator(sel).first().screenshot({ path: join(shots, file) });
    else await page.screenshot({ path: join(shots, file), fullPage: scene === "card" });
  } catch (e) {
    errors.push(`screenshot: ${String(e).slice(0, 160)}`);
  }
  if (process.env.PARITY_OUT && !errors.some((x) => x.startsWith("screenshot"))) {
    await mkdir(process.env.PARITY_OUT, { recursive: true });
    await copyFile(join(shots, file), join(process.env.PARITY_OUT, file));
  }
  if (errors.length) failed++;
  console.log(`${errors.length ? "FAIL" : "ok  "} ${file}${errors.length ? "\n      " + errors.join("\n      ") : ""}`);
  await page.close();
}
await browser.close();
server.close();
console.log(`[parity:music] ${failed ? `${failed} shot(s) failed` : "all scenes rendered cleanly"}`);
process.exit(failed ? 1 : 0);
