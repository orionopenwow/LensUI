// Screenshots every page of Lens setup (docs/SETUP.md) — first launch and the "What's new" path —
// in a dark and a light theme, and fails on page errors or a page that doesn't render.
// Run after `node tools/parity/build.mjs`. Output: tools/parity/setup/shots (or $SETUP_SHOTS).
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "out");
const shots = process.env.SETUP_SHOTS || join(here, "shots");
await mkdir(shots, { recursive: true });
const { chromium } = await import("playwright");

const PRESETS = (process.env.PARITY_PRESETS || "obsidian,alabaster-daylight").split(",");
const FLOWS = { first: ["welcome", "dock", "colour", "store", "widgets", "apps", "extras", "done"], update: ["whatsnew", "extras", "done"] };
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
  for (const [flow, expected] of Object.entries(FLOWS)) {
    const pg = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = [];
    pg.on("pageerror", (e) => errors.push(e.message));
    pg.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(m.text().slice(0, 200)));
    await pg.goto(`${base}/harness.html?surface=setup&preset=${preset}&setup=${flow}`);
    await pg.waitForTimeout(900);
    const seen = [];
    for (let i = 0; i < expected.length; i++) {
      const page = await pg.locator(".wiz").getAttribute("data-setup-page").catch(() => null);
      seen.push(page);
      await pg.waitForTimeout(350);
      await pg.screenshot({ path: join(shots, `${preset}-${flow}-${i + 1}-${page}.png`) });
      if (i < expected.length - 1) await pg.locator("[data-wiz-next]").click();
    }
    if (JSON.stringify(seen) !== JSON.stringify(expected)) errors.push(`pages ${seen.join(",")} != ${expected.join(",")}`);
    // Skip setup must close it without writing anything but the seen markers (checked in unit tests).
    await pg.locator("[data-setup-skip]").click();
    await pg.waitForTimeout(200);
    // Skip hides the window and the page gets ready for the next open: "Run setup again" (Welcome).
    await pg.waitForTimeout(300);
    const after = await pg.locator(".wiz").getAttribute("data-setup-page").catch(() => null);
    if (after && after !== "welcome") errors.push(`Skip setup did not close it (still on ${after})`);
    report.push({ preset, flow, pages: seen, ok: errors.length === 0, errors });
    console.log(`${errors.length ? "FAIL" : "ok  "} ${preset} ${flow} ${seen.join(" > ")}${errors.length ? " " + errors.join(" | ") : ""}`);
    await pg.close();
  }
}
await browser.close();
srv.close();
await writeFile(join(shots, "report.json"), JSON.stringify(report, null, 2));
const failed = report.filter((r) => !r.ok).length;
console.log(`[setup] ${report.length - failed}/${report.length} clean`);
process.exit(failed ? 1 : 0);
