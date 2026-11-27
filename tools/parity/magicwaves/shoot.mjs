// Screenshots the Magic scaffold (docs/plans/MAGIC_WAVES.md, wave M0) in Settings › About ›
// Magic (preview): the section with every flag off (Tester mode only), then with the Dashboard,
// Magic button and Studio shells on, the Magic Mouse card (wave M3), in a dark and a light theme. Fails on page errors, on a
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
  { id: "start-window", magic: "startButton", surface: "magicstart", expect: [".mstart-window", ".mstart-search input", ".mstart-actions"] },
  { id: "notes", magic: "shelfNotes", expect: [".snp", ".snp-body"] },
  { id: "studio", magic: "studioV2", expect: [".sv2", '[role="tab"][aria-selected="true"]'] },
  // Magic Mouse (wave M3): the card with the pointer frames, high-contrast frames, the grab
  // picture and its actions; and the confirmation shown before the flag turns on.
  { id: "mouse", magic: "mouse", expect: [".mmp", ".mmp-sprite img", ".mmp-rect", ".mmp-chip"] },
  { id: "mouse-hc", magic: "mouse", expect: [".mmp", ".mmp-sprite img"], click: ".mmp-hc input" },
  { id: "mouse-confirm", magic: "none", expect: [".mpv-confirm", ".mmp"], click: '[data-section="magic"] [role="switch"][aria-label="Magic Mouse"], [data-section="magic"] input[aria-label="Magic Mouse"]' },
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
    await pg.goto(
      sc.surface
        ? `${base}/harness.html?surface=${sc.surface}&preset=${preset}${q}`
        : `${base}/harness.html?surface=settings&tab=about%23magic&preset=${preset}${q}`
    );
    await pg.waitForTimeout(1100);
    if (sc.hidden) {
      if (await pg.locator("[data-section='magic'], .mdb, .sv2, .mstart").count()) errors.push("Magic preview showed with every flag off and Tester mode off");
    } else if (sc.surface) {
      for (const sel of sc.expect) if (!(await pg.locator(sel).count())) errors.push(`missing ${sel}`);
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

// The Dashboard window itself (wave M1): empty lanes, then lanes filled from the mock's local
// sample data (?dashdata=1) in each layout, and with learned ordering on.
const WINDOW_SCENES = [
  { id: "win-empty", magic: "dashboard", data: false, expect: [".mdb-window", ".mdb-empty"] },
  { id: "win-glance", magic: "dashboard", data: true, expect: [".mdb-window", '[data-lane="inbox"] .mdb-card', '[data-lane="shelf"] .mdb-card', ".mdb-strip"] },
  { id: "win-focus", magic: "dashboard", data: true, expect: ['.mdb[data-layout="focus"]', '[data-lane="inbox"] .mdb-card'], click: '.mdb-layout:has-text("Focus")' },
  { id: "win-board", magic: "dashboard,widgets,learn", data: true, expect: ['.mdb[data-layout="board"]', '[data-lane="feeds"] .mdb-card', '[data-lane="widgets"]', ".mdb-forget"], click: '.mdb-layout:has-text("Board")' },
  // Wave M2: widgets from the gallery (mocked fetch, invented data), the gallery, the consent
  // screen, Sources with the kill switch, and the X lane's consent.
  { id: "win-widgets", magic: "dashboard,widgets", data: true, extra: "&widgets=sample", expect: ['[data-lane="widgets"] .mwg-tile', '[data-widget="weather"] .mac-columns', '[data-widget="rss"] .mac-actions', '[data-widget="clocks"] .mac-facts', '[data-widget="system"] .mac-facts', ".mdb-card-ask"], click: '.mdb-layout:has-text("Board")', focus: '[data-lane="widgets"]' },
  { id: "win-widgets-gallery", magic: "dashboard,widgets", data: false, expect: ['[data-view="gallery"]', '[data-gallery-id="weather"]', '[data-gallery-id="system"]'], clicks: ['.mdb-layout:has-text("Board")', '[data-lane="widgets"] .mwg-btn:has-text("Add a widget")'], focus: '[data-lane="widgets"]' },
  { id: "win-widgets-consent", magic: "dashboard,widgets", data: false, expect: ['[data-view="consent"]', '.mwg-hosts li:has-text("api.open-meteo.com")'], clicks: ['.mdb-layout:has-text("Board")', '[data-lane="widgets"] .mwg-btn:has-text("Add a widget")', '[data-gallery-id="weather"]', '.mwg-field:has-text("Latitude") input', '.mwg-btn:has-text("Next")'], fill: { '.mwg-field:has-text("Latitude") input': "33.45", '.mwg-field:has-text("Longitude") input': "-112.07" }, focus: '[data-lane="widgets"]' },
  { id: "win-widgets-sources", magic: "dashboard,widgets", data: false, extra: "&widgets=sample", expect: ['[data-view="sources"]', '.mwg-sources li:has-text("api.open-meteo.com")', ".mwg-switch input"], clicks: ['.mdb-layout:has-text("Board")', '[data-lane="widgets"] .mwg-btn:has-text("Sources")'], focus: '[data-lane="widgets"]' },
  { id: "win-x", magic: "dashboard,widgets", data: false, expect: ['[data-lane="x"] [data-view="x-consent"]', '[data-lane="x"] .mwg-btn:has-text("Open X")'], click: '.mdb-layout:has-text("Board")', focus: '[data-lane="x"]' },
];
for (const preset of PRESETS) {
  for (const sc of WINDOW_SCENES) {
    const pg = await browser.newPage({ viewport: { width: 440, height: 900 } });
    const errors = [];
    pg.on("pageerror", (e) => errors.push(e.message));
    pg.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(m.text().slice(0, 200)));
    await pg.goto(`${base}/harness.html?surface=dashboard&preset=${preset}&magic=${sc.magic}${sc.data ? "&dashdata=1" : ""}${sc.extra ?? ""}`);
    await pg.waitForTimeout(1100);
    for (const sel of sc.clicks ?? (sc.click ? [sc.click] : [])) {
      // Fill the form fields that come before this click (the consent scene's coordinates).
      for (const [f, v] of Object.entries(sc.fill ?? {})) if (await pg.locator(f).count()) await pg.locator(f).first().fill(v).catch(() => {});
      await pg.locator(sel).first().click({ timeout: 3000 }).catch((e) => errors.push(`click ${sel}: ${e.message.slice(0, 80)}`));
      await pg.waitForTimeout(200);
    }
    await pg.waitForTimeout(250);
    if (sc.focus) await pg.locator(sc.focus).first().scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
    for (const sel of sc.expect) if (!(await pg.locator(sel).count())) errors.push(`missing ${sel}`);
    // Esc and × both ask Rust to hide the window.
    const n0 = await pg.evaluate(() => window.__lensCalls.length);
    await pg.keyboard.press("Escape");
    await pg.waitForTimeout(120);
    const afterEsc = await pg.evaluate((n) => window.__lensCalls.slice(n), n0);
    if (!afterEsc.includes("dashboard_hide")) errors.push("Esc did not hide the Dashboard");
    await pg.screenshot({ path: join(shots, `${preset}-${sc.id}.png`) });
    report.push({ preset, scene: sc.id, ok: errors.length === 0, errors });
    console.log(`${errors.length ? "FAIL" : "ok  "} ${preset} ${sc.id}${errors.length ? " " + errors.join(" | ") : ""}`);
    await pg.close();
  }
}
// Desktop widgets (docs/features/desktop-widgets.md): the host with the sample layout, the widget
// menu, a resize to Large, edit mode with the gallery, adding from the gallery, removing, and Esc.
// The page must report every widget's rectangle to Lens (that's what keeps the rest click-through).
const deskCount = (pg) => pg.locator(".dwg-item:not(.is-preview)").count();
const DESK_SCENES = [
  { id: "desk", desk: "sample", run: async (pg, errors) => {
    if ((await deskCount(pg)) < 6) errors.push(`only ${await deskCount(pg)} widgets`);
    const hits = await pg.evaluate(() => window.__deskHits?.rects?.length ?? 0);
    if (hits < (await deskCount(pg))) errors.push(`reported ${hits} hit rects for ${await deskCount(pg)} widgets`);
    if (await pg.evaluate(() => window.__deskHits?.hold)) errors.push("holds the pointer with nothing open");
  } },
  { id: "desk-menu", desk: "sample", run: async (pg, errors) => {
    await pg.locator('.dwg-item[data-kind="today"]').first().click({ button: "right" });
    await pg.waitForTimeout(250);
    for (const t of ["Small", "Medium", "Large", "Remove Widget", "Edit Widgets…"]) if (!(await pg.locator(".dwg-menu-row", { hasText: t }).count())) errors.push(`menu misses ${t}`);
    if (!(await pg.evaluate(() => window.__deskHits?.hold))) errors.push("an open menu doesn't hold the pointer");
  } },
  { id: "desk-large", desk: "sample", run: async (pg, errors) => {
    await pg.locator('.dwg-item[data-kind="today"]').first().click({ button: "right" });
    await pg.waitForTimeout(200);
    await pg.locator(".dwg-menu-row", { hasText: "Large" }).first().click();
    await pg.waitForTimeout(120);
    await pg.screenshot({ path: join(shots, "desk-reflow-mid.png") });
    await pg.waitForTimeout(400);
    if ((await pg.locator('.dwg-item[data-kind="today"]').getAttribute("data-size")) !== "large") errors.push("Today didn't become Large");
    const saved = await pg.evaluate(() => window.__lensCallLog.filter((c) => c.cmd === "desktop_widgets_save").pop()?.args?.items ?? []);
    if (!saved.some((i) => i.kind === "today" && i.size === "large")) errors.push("the new size wasn't saved");
    const boxes = await pg.evaluate(() => [...document.querySelectorAll(".dwg-item")].map((e) => e.getBoundingClientRect()).map((r) => [r.left, r.top, r.right, r.bottom]));
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) { const [a, b] = [boxes[i], boxes[j]]; if (a[0] < b[2] - 1 && b[0] < a[2] - 1 && a[1] < b[3] - 1 && b[1] < a[3] - 1) errors.push(`widgets ${i} and ${j} overlap after the resize`); }
  } },
  { id: "desk-edit", desk: "edit", run: async (pg, errors) => {
    if (!(await pg.locator(".dwg-panel").count())) errors.push("no gallery panel in edit mode");
    for (const k of ["batteries", "clock", "music", "notes", "today", "weather"]) if (!(await pg.locator(`.dwg-kind[data-kind="${k}"]`).count())) errors.push(`gallery misses ${k}`);
    await pg.locator(".dwg-search input").fill("remind");
    await pg.waitForTimeout(150);
    if ((await pg.locator(".dwg-kind").count()) !== 1) errors.push("search for 'remind' didn't narrow to Today");
    await pg.locator(".dwg-search input").fill("");
    await pg.locator('.dwg-kind[data-kind="batteries"]').click();
    const n0 = await deskCount(pg);
    await pg.locator('[data-preview="batteries:medium"]').click();
    await pg.waitForTimeout(400);
    if ((await deskCount(pg)) !== n0 + 1) errors.push("clicking a preview didn't add the widget");
    await pg.locator('.dwg-kind[data-kind="weather"]').click();
    await pg.waitForTimeout(150);
    if (!(await pg.locator(".dwg-needs").count())) errors.push("Weather without a Dashboard widget should ask for one first");
  } },
  { id: "desk-remove-done", desk: "edit", run: async (pg, errors) => {
    const n0 = await deskCount(pg);
    await pg.locator('.dwg-item[data-kind="notes"] .dwg-remove').first().click();
    await pg.waitForTimeout(400);
    if ((await deskCount(pg)) !== n0 - 1) errors.push("remove didn't remove");
    await pg.keyboard.press("Escape");
    await pg.waitForTimeout(250);
    const calls = await pg.evaluate(() => window.__lensCallLog.filter((c) => c.cmd === "desktop_widgets_edit").map((c) => c.args.on));
    if (!calls.includes(false)) errors.push("Esc didn't leave edit mode");
    if (await pg.locator(".dwg-panel").count()) errors.push("the gallery stayed after Esc");
  } },
];
for (const preset of PRESETS) {
  for (const sc of DESK_SCENES) {
    const pg = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    const errors = [];
    pg.on("pageerror", (e) => errors.push(e.message));
    pg.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(m.text().slice(0, 200)));
    await pg.goto(`${base}/harness.html?surface=deskwidgets&preset=${preset}&magic=desktopWidgets&desk=${sc.desk}`);
    await pg.waitForTimeout(1100);
    await sc.run(pg, errors).catch((e) => errors.push(`run: ${e.message.slice(0, 120)}`));
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
