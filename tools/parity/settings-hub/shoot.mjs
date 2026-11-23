// Screenshots every Settings hub page in two themes and two window sizes, and fails on page errors.
// Run after `node tools/parity/build.mjs`. Output: tools/parity/settings-hub/shots (or $SETTINGS_SHOTS).
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "out");
const shots = process.env.SETTINGS_SHOTS || join(here, "shots");
await mkdir(shots, { recursive: true });
const { chromium } = await import("playwright");

const PAGES = ["appearance", "dock", "desktop", "keys", "ai", "display", "sound", "network", "power", "apps", "storage", "focus", "privacy", "update", "time", "accessibility", "gaming", "tasks", "notifications", "about"];
const PRESETS = (process.env.PARITY_PRESETS || "obsidian,alabaster-daylight").split(",");
const SIZES = [[760, 560], [1024, 640]];
const T = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml" };

const srv = createServer(async (q, r) => {
  const p = normalize(decodeURIComponent(new URL(q.url, "http://x").pathname)).replace(/^([/\\])+/, "");
  try {
    r.writeHead(200, { "content-type": T[extname(p)] || "application/octet-stream" }).end(await readFile(join(out, p)));
  } catch {
    r.writeHead(404).end();
  }
});
await new Promise((r) => srv.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${srv.address().port}`;
const browser = await chromium.launch();
const report = [];
for (const preset of PRESETS) {
  for (const [w, h] of SIZES) {
    for (const page of PAGES) {
      const pg = await browser.newPage({ viewport: { width: w, height: h } });
      const errors = [];
      pg.on("pageerror", (e) => errors.push(e.message));
      pg.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(m.text().slice(0, 200)));
      await pg.goto(`${base}/harness.html?surface=settings&preset=${preset}&tab=${page}`);
      await pg.waitForTimeout(900);
      const crashed = await pg.locator(".sh-crash").count();
      if (crashed) errors.push("page error boundary shown");
      await pg.screenshot({ path: join(shots, `${preset}-${w}-${page}.png`) });
      report.push({ preset, size: `${w}x${h}`, page, ok: errors.length === 0, errors });
      console.log(`${errors.length ? "FAIL" : "ok  "} ${preset} ${w}x${h} ${page}${errors.length ? " " + errors.join(" | ") : ""}`);
      await pg.close();
    }
  }
}
await browser.close();
srv.close();
await writeFile(join(shots, "report.json"), JSON.stringify(report, null, 2));
const failed = report.filter((r) => !r.ok).length;
console.log(`[settings-hub] ${report.length - failed}/${report.length} clean`);
process.exit(failed ? 1 : 0);
