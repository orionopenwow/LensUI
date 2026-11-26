// Screenshots the Magic scaffold (docs/plans/MAGIC_WAVES.md, wave M0) in Settings › About ›
// Magic (preview): the section with every flag off (Tester mode only), then with the Dashboard,
// Magic button and Studio shells on, in a dark and a light theme. Fails on page errors, on a
// shell that doesn't render, and if the section shows outside Tester mode with every flag off.
// Run after `node tools/parity/build.mjs`. Output: tools/parity/magicwaves/shots (or $MAGIC_SHOTS).
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "out");
const shots = process.env.MAGIC_SHOTS || join(here, "shots");
await mkdir(shots, { recursive: true });
const { chromium } = await import("playwright");

const PRESETS = (process.env.PARITY_PRESETS || "obsidian,alabaster-daylight").split(",");
const SCENES = [
  { id: "off", magic: "", expect: [], hidden: true },
  { id: "preview", magic: "none", expect: ["[data-section='magic']"] },
  { id: "dashboard", magic: "dashboard", expect: [".mdb", ".mdb-lane"] },
  { id: "dashboard-board", magic: "dashboard,widgets,learn", expect: [".mdb", '[data-lane="widgets"]'], click: '.mdb-layout:has-text("Board")' },
  { id: "start", magic: "startButton", expect: [".mstart"] },
  { id: "notes", magic: "shelfNotes", expect: [".snp", ".snp-body"] },
  { id: "studio", magic: "studioV2", expect: [".sv2", '[role="tab"][aria-selected="true"]'] },
];
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
  for (const sc of SCENES) {
    const pg = await browser.newPage({ viewport: { width: 1024, height: 760 } });
    const errors = [];
    pg.on("pageerror", (e) => errors.push(e.message));
    pg.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(m.text().slice(0, 200)));
    const q = sc.magic === "" ? "" : `&magic=${sc.magic}`;
    await pg.goto(`${base}/harness.html?surface=settings&tab=about%23magic&preset=${preset}${q}`);
    await pg.waitForTimeout(1100);
    if (sc.hidden) {
      if (await pg.locator("[data-section='magic'], .mdb, .sv2, .mstart").count()) errors.push("Magic preview showed with every flag off and Tester mode off");
    } else {
      await pg.locator("[data-section='magic']").first().scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
      if (sc.click) await pg.locator(sc.click).first().click({ timeout: 3000 }).catch((e) => errors.push(`click: ${e.message.slice(0, 80)}`));
      await pg.waitForTimeout(250);
      for (const sel of sc.expect) if (!(await pg.locator(sel).count())) errors.push(`missing ${sel}`);
      const target = sc.expect.length > 1 ? pg.locator(sc.expect[0]).first() : pg.locator("[data-section='magic']").first();
      await target.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
    }
    await pg.screenshot({ path: join(shots, `${preset}-${sc.id}.png`) });
    report.push({ preset, scene: sc.id, ok: errors.length === 0, errors });
    console.log(`${errors.length ? "FAIL" : "ok  "} ${preset} ${sc.id}${errors.length ? " " + errors.join(" | ") : ""}`);
    await pg.close();
  }
}
await browser.close();
srv.close();
await writeFile(join(shots, "report.json"), JSON.stringify(report, null, 2));
const failed = report.filter((r) => !r.ok).length;
console.log(`[parity:magicwaves] ${report.length - failed}/${report.length} scenes clean`);
process.exit(failed ? 1 : 0);
