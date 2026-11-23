// Screenshots every approval scene × preset, fails on page/console errors, writes contact sheets.
// Env: PARITY_CHROME, PARITY_PLAYWRIGHT, PARITY_OUT (copy shots there too).
import { createServer } from "node:http";
import { readFile, mkdir, writeFile, copyFile } from "node:fs/promises";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "out");
const shots = join(here, "shots");
await mkdir(shots, { recursive: true });
const { chromium } = await import(process.env.PARITY_PLAYWRIGHT ? pathToFileURL(process.env.PARITY_PLAYWRIGHT).href : "playwright");
const SCENES = { delete: [520, 340], payment: [520, 340], send: [520, 300], click: [520, 560], look: [520, 820], window: [520, 440], settings: [520, 320], compact: [440, 480], hold: [520, 320], done: [520, 260], blocked: [520, 320], pill: [520, 200], noaccess: [520, 200], permissions: [720, 1500], showcase: [1600, 1180] };
const PRESETS = (process.env.PARITY_PRESETS || "obsidian,alabaster-daylight").split(",");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png" };
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^([/\\])+/, "");
  if (path === "favicon.ico") return res.writeHead(204).end();
  const file = join(here, path);
  if (!file.startsWith(out) && !file.startsWith(shots)) return res.writeHead(403).end();
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
for (const preset of PRESETS) {
  for (const [scene, [w, h]] of Object.entries(SCENES)) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    const errors = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => m.type() === "error" && !/favicon/.test(m.text()) && errors.push(`console: ${m.text().slice(0, 200)}`));
    await page.goto(`${base}/out/harness.html?scene=${scene}&preset=${preset}`);
    await page.waitForTimeout(500);
    // Layout checks: nothing overflows the card horizontally; no clipped question text.
    const issues = await page.evaluate(() => {
      const bad = [];
      const card = document.querySelector(".ap-card");
      if (card) {
        const cr = card.getBoundingClientRect();
        for (const el of card.querySelectorAll("*")) {
          const r = el.getBoundingClientRect();
          if (r.width && (r.right > cr.right + 1 || r.left < cr.left - 1)) bad.push(`overflow: ${el.className || el.tagName}`);
        }
      }
      return bad.slice(0, 5);
    });
    errors.push(...issues);
    const name = `${preset}-${scene}.png`;
    await page.screenshot({ path: join(shots, name), fullPage: true });
    if (errors.length) failed++;
    console.log(`${errors.length ? "FAIL" : "ok  "} ${preset} ${scene}${errors.length ? "\n      " + errors.join("\n      ") : ""}`);
    await page.close();
  }
  const cells = Object.keys(SCENES).filter((x) => x !== "showcase").map((s) => `<figure><img src="../shots/${preset}-${s}.png"><figcaption>${s}</figcaption></figure>`).join("");
  await writeFile(join(out, `sheet-${preset}.html`), `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#111;color:#bbb;font:12px system-ui"><div style="display:grid;grid-template-columns:repeat(6,1fr);gap:8px;padding:8px;align-items:start">${cells}</div><style>figure{margin:0}img{width:100%;display:block;border-radius:6px}figcaption{padding:4px 2px}</style></body></html>`);
  const sheet = await browser.newPage({ viewport: { width: 2400, height: 900 } });
  await sheet.goto(`${base}/out/sheet-${preset}.html`);
  await sheet.waitForTimeout(400);
  await sheet.screenshot({ path: join(shots, `contact-${preset}.png`), fullPage: true });
  await sheet.close();
}
await browser.close();
server.close();
if (process.env.PARITY_OUT) {
  await mkdir(process.env.PARITY_OUT, { recursive: true });
  const { readdir } = await import("node:fs/promises");
  for (const f of await readdir(shots)) await copyFile(join(shots, f), join(process.env.PARITY_OUT, f));
}
if (failed) {
  console.error(`[parity:approval] ${failed} scene(s) failed`);
  process.exit(1);
}
console.log("[parity:approval] all scenes rendered cleanly");
