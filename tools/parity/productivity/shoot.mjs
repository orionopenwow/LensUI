// Screenshots for the productivity-input package (W5-E): the three Control Center cards, the
// Notification Center with quiet hours open, the calendar's week start, and the Overview's
// workspace strip mid-drag. Fails on any page error. Output: tools/parity/shots/productivity/.
// Usage: node tools/parity/productivity/shoot.mjs   (needs esbuild + playwright, like the main harness)
import { build } from "esbuild";
import { createServer } from "node:http";
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const parity = resolve(here, "..");
// Inside tools/parity/out (git-ignored); run `node tools/parity/build.mjs` first, it clears that folder.
const out = join(parity, "out", "productivity");
const shots = join(parity, "shots", "productivity");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
mkdirSync(shots, { recursive: true });

await build({
  entryPoints: [join(here, "entry.tsx")],
  bundle: true,
  outdir: out,
  format: "esm",
  jsx: "automatic",
  loader: { ".css": "css" },
  alias: {
    "@tauri-apps/api/core": join(parity, "mock/core.ts"),
    "@tauri-apps/api/event": join(parity, "mock/event.ts"),
    "@tauri-apps/api/window": join(parity, "mock/window.ts"),
  },
  define: { "process.env.NODE_ENV": '"production"' },
  logLevel: "warning",
});
const css = readdirSync(out).filter((f) => f.endsWith(".css"));
writeFileSync(
  join(out, "gallery.html"),
  `<!DOCTYPE html><html><head><meta charset="utf-8">${css.map((c) => `<link rel="stylesheet" href="${c}">`).join("")}<style>body{margin:0;padding:14px;background:#2a2a30}</style></head><body><div id="root"></div><script type="module" src="entry.js"></script></body></html>`
);

const root = join(parity, "out");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml" };
const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const file = join(root, normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, ""));
  if (!file.startsWith(root)) return res.writeHead(403).end();
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" }).end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;

const { chromium } = await import(process.env.PARITY_PLAYWRIGHT ? pathToFileURL(process.env.PARITY_PLAYWRIGHT).href : "playwright");
const browser = await chromium.launch(process.env.PARITY_CHROME ? { executablePath: process.env.PARITY_CHROME } : {});
const PRESETS = (process.env.PARITY_PRESETS || "obsidian,alabaster-daylight").split(",");

const SHOTS = [
  { name: "hotcorners", url: "productivity/gallery.html?card=hotcorners", size: [640, 520] },
  { name: "hotcorners-off", url: "productivity/gallery.html?card=hotcorners&off=1", size: [640, 520] },
  { name: "altdrag", url: "productivity/gallery.html?card=altdrag", size: [640, 720] },
  { name: "summon", url: "productivity/gallery.html?card=summon", size: [640, 440] },
  {
    name: "dnd-quiet-hours",
    url: "productivity/gallery.html?card=dnd",
    size: [404, 900],
    act: async (p) => p.click(".nc-schedule-toggle"),
  },
  {
    name: "calendar-week-start",
    url: "harness.html?surface=quicksettings",
    size: [404, 780],
    act: async (p) => {
      await p.evaluate(() => localStorage.setItem("lens_week_start", "1"));
      await p.reload();
      await p.waitForTimeout(700);
      await p.evaluate(() => globalThis.__lensEmit("lens://qs-tab", { tab: "calendar" }));
    },
  },
  {
    name: "overview-drag",
    url: "harness.html?surface=overview&ws=groups",
    size: [1120, 700],
    act: async (p) => {
      // Start dragging the Chrome tile and hover it over the "Play" workspace.
      await p.evaluate(() => {
        const dt = new DataTransfer();
        const tile = document.querySelector('[data-hwnd="102"]');
        const target = [...document.querySelectorAll(".ov-ws")].find((b) => b.textContent.includes("Play"));
        tile.dispatchEvent(new DragEvent("dragstart", { bubbles: true, dataTransfer: dt }));
        setTimeout(() => target.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: dt })), 60);
      });
    },
  },
  { name: "overview-strip", url: "harness.html?surface=overview&ws=groups", size: [1120, 700] },
];

let failed = 0;
for (const preset of PRESETS) {
  for (const s of SHOTS) {
    const page = await browser.newPage({ viewport: { width: s.size[0], height: s.size[1] } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => {
      if (m.type() === "error" && !/^Failed to load resource/.test(m.text())) errors.push(`console: ${m.text().slice(0, 300)}`);
    });
    const sep = s.url.includes("?") ? "&" : "?";
    await page.goto(`${base}/${s.url}${sep}preset=${preset}`);
    await page.waitForTimeout(900);
    if (s.act) {
      try {
        await s.act(page);
      } catch (e) {
        errors.push(`act: ${e.message}`);
      }
      await page.waitForTimeout(500);
    }
    if ((await page.locator("#root").innerHTML()).length === 0) errors.push("rendered nothing");
    await page.screenshot({ path: join(shots, `${preset}-${s.name}.png`) });
    if (errors.length) failed++;
    console.log(`${errors.length ? "FAIL" : "ok  "} ${preset} ${s.name}${errors.length ? "\n      " + errors.join("\n      ") : ""}`);
    await page.close();
  }
}
await browser.close();
server.close();
process.exit(failed ? 1 : 0);
