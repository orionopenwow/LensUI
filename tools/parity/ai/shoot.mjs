// Screenshots every AI surface state in a dark and a light pack, fails on any page/console error,
// and writes contact sheets (one per preset) to tools/parity/ai/shots/.
// Env: PARITY_PRESETS, PARITY_CHROME, PARITY_PLAYWRIGHT (as tools/parity/shoot.mjs).
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "out");
const shots = join(here, "shots");
await mkdir(shots, { recursive: true });
const { chromium } = await import(process.env.PARITY_PLAYWRIGHT ? pathToFileURL(process.env.PARITY_PLAYWRIGHT).href : "playwright");

// [scene, params, [w, h], wait ms, optional action]
const SCENES = [
  ["ask-empty", "active=ollama", [608, 568], 500],
  ["ask-streaming", "active=ollama&stream=slow", [608, 568], 1900],
  ["ask-done", "active=ollama&stream=fast", [608, 568], 1600],
  ["ask-tool", "active=ollama&stream=tool", [608, 568], 1600],
  ["ask-error", "active=ollama&stream=error", [608, 568], 800],
  ["ask-consent", "active=claude&privacy=ask_each_time", [608, 568], 800],
  ["ask-blocked", "active=claude&privacy=local_only", [608, 568], 800],
  ["ask-mention", "active=ollama", [608, 568], 500, async (p) => { await p.click(".ai-input"); await p.keyboard.type("Summarise @road"); await p.waitForTimeout(200); }],
  ["dock-search", "", [760, 140], 500],
  ["dock-ask", "", [760, 140], 500],
  ["dock-answer", "active=ollama&stream=fast", [760, 560], 1600],
  ["dock-drop", "", [420, 300], 400],
  ["dock-transcribe", "", [420, 260], 900],
  ["dock-suggested", "", [760, 200], 400, async (p) => { await p.hover(".ai-suggested-app"); await p.waitForTimeout(250); }],
  ["groups", "", [608, 260], 300, async (p) => { await p.click(".ai-group-chip.act-web"); await p.waitForTimeout(100); }],
  ["groups-locked", "", [608, 200], 300],
  ["aicard-off", "ai=off", [688, 720], 500],
  ["aicard", "active=ollama", [688, 1180], 600, async (p) => {
    await p.click(".ai-prov-test >> nth=1"); await p.waitForTimeout(200);
    await p.click("text=What can AI see?"); await p.waitForTimeout(100);
  }],
  ["aicard-intro", "ai=off", [688, 840], 500, async (p) => {
    await p.evaluate(() => localStorage.removeItem("lens.ai.introSeen"));
    await p.click('[aria-label="Use AI in Lens"]'); await p.waitForTimeout(400);
  }],
];
const PRESETS = (process.env.PARITY_PRESETS || "obsidian,alabaster-daylight").split(",");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png" };
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^([/\\])+/, "");
  const file = join(path.startsWith("shots") ? here : out, path);
  try {
    res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" }).end(await readFile(file));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch(process.env.PARITY_CHROME ? { executablePath: process.env.PARITY_CHROME } : {});
const report = [];
for (const preset of PRESETS) {
  for (const [scene, params, [w, h], wait, action] of SCENES) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => m.type() === "error" && !/favicon|Failed to load resource/.test(m.text()) && errors.push(`console: ${m.text().slice(0, 200)}`));
    await page.goto(`${base}/index.html?scene=${scene}&preset=${preset}&${params}`);
    await page.waitForTimeout(wait);
    if (action) await action(page).catch((e) => errors.push(`action: ${e.message.split("\n")[0]}`));
    if ((await page.locator("#root").innerHTML()).length === 0) errors.push("rendered nothing");
    await page.screenshot({ path: join(shots, `${preset}-${scene}.png`) });
    report.push({ preset, scene, ok: !errors.length, errors });
    console.log(`${errors.length ? "FAIL" : "ok  "} ${preset} ${scene}${errors.length ? "\n      " + errors.join("\n      ") : ""}`);
    await page.close();
  }
  // Contact sheet
  const sheet = await browser.newPage({ viewport: { width: 1800, height: 900 } });
  const cells = SCENES.map(([s]) => `<figure><img src="/shots/${preset}-${s}.png"><figcaption>${s}</figcaption></figure>`).join("");
  await sheet.setContent(`<html><body style="margin:0;padding:16px;background:#222;font:12px sans-serif;color:#ddd"><div style="display:flex;flex-wrap:wrap;gap:14px;align-items:flex-start">${cells}</div><style>figure{margin:0}img{max-width:600px;max-height:560px;display:block;border:1px solid #444}</style></body></html>`, { waitUntil: "load" });
  await sheet.goto(`${base}/index.html`).catch(() => {});
  await sheet.setContent(`<html><head><base href="${base}/"></head><body style="margin:0;padding:16px;background:#222;font:12px sans-serif;color:#ddd"><div style="display:flex;flex-wrap:wrap;gap:14px;align-items:flex-start">${cells}</div><style>figure{margin:0}img{max-width:600px;max-height:560px;display:block;border:1px solid #444}</style></body></html>`, { waitUntil: "networkidle" });
  await sheet.screenshot({ path: join(shots, `contact-${preset}.png`), fullPage: true });
  await sheet.close();
}
await browser.close();
server.close();
await writeFile(join(shots, "report.json"), JSON.stringify(report, null, 2));
const failed = report.filter((r) => !r.ok).length;
console.log(`[parity-ai] ${report.length - failed}/${report.length} states rendered cleanly`);
process.exit(failed ? 1 : 0);
