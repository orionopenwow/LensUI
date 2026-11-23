// Screenshots the voice gallery in two packs; fails on any page error or console error.
// Env: VOICE_SHOTS (output dir), PARITY_PRESETS, PARITY_CHROME, PARITY_PLAYWRIGHT.
import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "out");
const shots = process.env.VOICE_SHOTS || join(here, "shots");
await mkdir(shots, { recursive: true });
const { chromium } = await import(process.env.PARITY_PLAYWRIGHT ? pathToFileURL(process.env.PARITY_PLAYWRIGHT).href : "playwright");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const server = createServer(async (req, res) => {
  const p = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^([/\\])+/, "");
  const file = join(out, p);
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
const PRESETS = (process.env.PARITY_PRESETS || "obsidian,alabaster-daylight").split(",");
const SCENES = [
  ["sheet", 1040, 1900],
  ["card", 760, 2700],
  ...["listening", "partial", "thinking", "recognised", "undo", "confirm", "suggest", "error", "refused", "muted", "help"].map((s) => [s, 512, s === "help" ? 660 : 172]),
  ["conv-panel-speaking", 520, 820],
  ["conv-panel-listening", 520, 820],
  ["conv-panel-thinking", 520, 820],
  ["conv-panel-muted", 520, 820],
  ["conv-full-speaking", 1280, 800],
  ["conv-full-done", 1280, 800],
  ["conv-full-speaking-reduced", 1280, 800],
];
let failed = 0;
for (const preset of PRESETS) {
  for (const [scene, w, h] of SCENES) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && !/favicon/.test(m.text()) && errors.push(m.text()));
    await page.goto(`${base}/index.html?scene=${scene}&preset=${preset}`);
    await page.waitForTimeout(500);
    const empty = await page.evaluate(() => (document.getElementById("root")?.innerText || "").trim().length === 0);
    await page.screenshot({ path: join(shots, `${preset}-${scene}.png`), fullPage: !scene.startsWith("conv-") });
    if (errors.length || empty) {
      failed++;
      console.log(`FAIL ${preset} ${scene}: ${empty ? "empty " : ""}${errors.join(" | ")}`);
    } else console.log(`ok   ${preset} ${scene}`);
    await page.close();
  }
}
await browser.close();
server.close();
process.exit(failed ? 1 : 0);
