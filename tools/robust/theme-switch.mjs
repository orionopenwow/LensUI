// Theme-switch rig: drives the real Settings window (headless harness, parity mock backend) through
// theme changes and checks that each switch is clean, the way a person sees it:
//
//   layout   key elements (sidebar, nav buttons, page header, cards, rows, theme cards) keep their
//            size and position. A change of font family or shape style (Expressive, Dot Matrix) is allowed to
//            reflow (listed, not failed).
//   growth   nothing grows or moves *during* the switch beyond where it starts and ends.
//   flash    no frame during the switch is brighter or darker than both the old and the new theme
//            (a washed-out or white frame), sampled from a CDP screencast.
//   latency  the new theme is on screen within one frame budget of the click (stale frames count).
//   cost     layout shift (CLS), long tasks and console errors during the switch.
//   function after all switches: a switch row toggles, tabs change, search finds a setting.
//
// Switches are made the way people make them: clicking theme cards and the Dark/Light control on
// the Appearance page, and by broadcast (another window changed the theme) while Settings shows
// other pages.
//
//   node tools/robust/build.mjs && node tools/robust/theme-switch.mjs           # CI subset
//   node tools/robust/theme-switch.mjs --full                                   # every pack
// Output: tools/robust/out/theme-rig/{report.md,report.json,*.png}; copied to $THEME_RIG_COPY or
// /mnt/user-data/outputs/theme-rig when that folder's parent exists.
import { mkdirSync, writeFileSync, existsSync, cpSync } from "node:fs";
import { join } from "node:path";
import { serve, launch, openSurface, settingsTabs, here } from "./lib.mjs";

const FULL = process.argv.includes("--full");
const outDir = join(here, "out", "theme-rig");
mkdirSync(outDir, { recursive: true });

/** Elements whose box must not move when only colours change. Index-matched per selector. */
const KEYS = [".cc-nav-btn", ".cc-page-head, .cc-header, header", ".cc-card", ".cc-row", ".tux-pack", ".tux-hero", ".cc-search, input[type=search]"];

// Tolerances. Layout: 1px (sub-pixel rounding). Flash: a frame's mean luminance may sit outside the
// old→new range by at most 10 (0–255), and its share of near-white pixels may exceed both ends by
// at most 0.08. Latency: the new theme must be applied and fully on screen within 250 ms of the action (a whole Settings page re-renders; CI runners are slow).
const LAYOUT_PX = 1;
const FLASH_L = 10;
const FLASH_WHITE = 0.08;
const SETTLE_MS = 250;

const server = await serve();
const browser = await launch();
const helper = await (await browser.newContext()).newPage();

/** Mean luminance and near-white share of each PNG frame, decoded in a plain page (no native deps). */
async function frameStats(frames) {
  return helper.evaluate(async (imgs) => {
    const load = (src) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = src; });
    const out = [];
    for (const s of imgs) {
      const i = await load("data:image/png;base64," + s);
      const c = document.createElement("canvas");
      c.width = i.width; c.height = i.height;
      const x = c.getContext("2d");
      x.drawImage(i, 0, 0);
      const d = x.getImageData(0, 0, i.width, i.height).data;
      let L = 0, white = 0;
      for (let k = 0; k < d.length; k += 16) {
        const l = 0.2126 * d[k] + 0.7152 * d[k + 1] + 0.0722 * d[k + 2];
        L += l;
        if (l > 235) white++;
      }
      const n = d.length / 16;
      out.push({ L: L / n, white: white / n });
    }
    return out;
  }, frames.map((f) => f.data));
}

/** A labelled contact sheet of the frames (written for failures and one sample per scenario). */
async function contactSheet(frames, stats, file) {
  const b64 = await helper.evaluate(async ({ imgs, stats }) => {
    const load = (src) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = src; });
    const ims = [];
    for (const s of imgs) ims.push(await load("data:image/png;base64," + s));
    const w = 300, h = Math.round((ims[0].height * w) / ims[0].width), cols = 5, rows = Math.ceil(ims.length / cols);
    const c = document.createElement("canvas");
    c.width = w * cols; c.height = (h + 14) * rows;
    const x = c.getContext("2d");
    x.fillStyle = "#222"; x.fillRect(0, 0, c.width, c.height);
    ims.forEach((im, k) => {
      const cx = (k % cols) * w, cy = Math.floor(k / cols) * (h + 14);
      x.drawImage(im, cx, cy + 14, w, h);
      x.fillStyle = stats[k].bad ? "#d11" : "#000"; x.fillRect(cx, cy, w, 14);
      x.fillStyle = "#fff"; x.font = "11px sans-serif";
      x.fillText(`#${k} +${stats[k].t}ms L=${Math.round(stats[k].L)} white=${stats[k].white.toFixed(2)}`, cx + 4, cy + 11);
    });
    return c.toDataURL("image/png").split(",")[1];
  }, { imgs: frames.map((f) => f.data), stats });
  writeFileSync(join(outDir, file), Buffer.from(b64, "base64"));
}

/** Installs the in-page recorder: rAF samples of key boxes, layout shifts and long tasks. */
async function armRecorder(page) {
  await page.evaluate((KEYS) => {
    const rects = () => KEYS.map((sel) => [...document.querySelectorAll(sel)].map((e) => { const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; }));
    // Looks may change the font or the shape style (Expressive, Dot Matrix): both reflow by design.
    const font = () => getComputedStyle(document.body).fontFamily + "|" + (document.documentElement.dataset.shape || "");
    const theme = () => [document.documentElement.dataset.preset, document.documentElement.dataset.contrast, document.documentElement.dataset.scheme, getComputedStyle(document.documentElement).getPropertyValue("--lens-accent")].join("|");
    const rec = { start: rects(), startFont: font(), startTheme: theme(), samples: [], cls: 0, longTasks: 0, longMs: 0, appliedAt: null, vtDoneAt: null, t0: null };
    window.__rig = rec;
    // A view transition keeps the old picture on screen until it finishes: count that as latency.
    if (!window.__rigVtPatched && typeof document.startViewTransition === "function") {
      window.__rigVtPatched = true;
      const orig = document.startViewTransition.bind(document);
      document.startViewTransition = (cb) => { const vt = orig(cb); vt.finished.finally(() => { if (window.__rig) window.__rig.vtDoneAt = performance.now(); }); return vt; };
    }
    // The clock starts at the real action: the click (capture phase) or the broadcast below.
    addEventListener("pointerdown", () => { if (rec.t0 === null) rec.t0 = performance.now(); }, { capture: true, once: true });
    const watch = () => { if (rec.done) return; if (rec.t0 !== null && rec.appliedAt === null && theme() !== rec.startTheme) rec.appliedAt = performance.now(); requestAnimationFrame(watch); };
    requestAnimationFrame(watch);
    const t0 = performance.now();
    const tick = () => { if (!rec.done) { rec.samples.push(rects()); if (performance.now() - t0 < 900) requestAnimationFrame(tick); } };
    requestAnimationFrame(tick);
    try {
      rec.po1 = new PerformanceObserver((l) => l.getEntries().forEach((e) => { if (!e.hadRecentInput) rec.cls += e.value; }));
      rec.po1.observe({ type: "layout-shift", buffered: false });
      rec.po2 = new PerformanceObserver((l) => l.getEntries().forEach((e) => { rec.longTasks++; rec.longMs += e.duration; }));
      rec.po2.observe({ type: "longtask", buffered: false });
    } catch {}
  }, KEYS);
}

async function readRecorder(page) {
  return page.evaluate((KEYS) => {
    const rec = window.__rig;
    rec.done = true;
    rec.po1?.disconnect(); rec.po2?.disconnect();
    const end = KEYS.map((sel) => [...document.querySelectorAll(sel)].map((e) => { const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; }));
    const shownAt = rec.appliedAt === null ? null : Math.max(rec.appliedAt, rec.vtDoneAt ?? 0);
    return { start: rec.start, end, samples: rec.samples, cls: rec.cls, longTasks: rec.longTasks, longMs: rec.longMs, fontChanged: rec.startFont !== getComputedStyle(document.body).fontFamily + "|" + (document.documentElement.dataset.shape || ""), settleMs: shownAt === null ? null : Math.round(shownAt - rec.t0) };
  }, KEYS);
}

/** Compares boxes: moved at the end (layout) and grew mid-switch beyond both ends (growth). */
function boxes(rec) {
  const moved = [], grew = [];
  KEYS.forEach((sel, si) => {
    const a = rec.start[si], z = rec.end[si];
    if (a.length !== z.length) return; // content changed (e.g. light swatches): not a layout question
    a.forEach((ra, i) => {
      const rz = z[i];
      const d = Math.max(...ra.map((v, k) => Math.abs(v - rz[k])));
      if (d > LAYOUT_PX) moved.push({ sel, i, from: ra.map(Math.round), to: rz.map(Math.round) });
      for (const s of rec.samples) {
        const r = s[si]?.[i];
        if (!r) continue;
        const over = Math.max(r[2] - Math.max(ra[2], rz[2]), r[3] - Math.max(ra[3], rz[3]));
        if (over > 2) { grew.push({ sel, i, by: Math.round(over) }); break; }
      }
    });
  });
  return { moved, grew };
}

const results = [];
let sheetBudget = 6;

/** One switch: arm, record the screencast around `act`, settle, analyse. */
async function measure(page, cdp, name, act) {
  await page.waitForTimeout(250);
  const frames = [];
  let recording = false, tClick = 0;
  const onFrame = async (f) => {
    if (recording) frames.push({ t: Date.now() - tClick, data: f.data });
    await cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
  };
  cdp.on("Page.screencastFrame", onFrame);
  await cdp.send("Page.startScreencast", { format: "png", everyNthFrame: 1 });
  await page.waitForTimeout(120);
  await armRecorder(page);
  const errorsBefore = page.problems.errors.length;
  recording = true;
  tClick = Date.now();
  frames.push({ t: 0, data: (await cdp.send("Page.captureScreenshot", { format: "png" })).data });
  tClick = Date.now();
  await act();
  await page.waitForTimeout(800);
  recording = false;
  await cdp.send("Page.stopScreencast");
  cdp.off("Page.screencastFrame", onFrame);
  frames.push({ t: Date.now() - tClick, data: (await cdp.send("Page.captureScreenshot", { format: "png" })).data });
  const rec = await readRecorder(page);
  const stats = (await frameStats(frames)).map((s, k) => ({ ...s, t: frames[k].t }));
  const first = stats[0], last = stats[stats.length - 1];
  const lo = Math.min(first.L, last.L) - FLASH_L, hi = Math.max(first.L, last.L) + FLASH_L;
  const wmax = Math.max(first.white, last.white) + FLASH_WHITE;
  const flashes = stats.filter((s) => s.L < lo || s.L > hi || s.white > wmax);
  flashes.forEach((s) => (s.bad = true));
  // Latency, measured in the page: theme variables applied, and any view transition finished.
  const settleMs = rec.settleMs ?? 0;
  const { moved, grew } = boxes(rec);
  const errors = page.problems.errors.slice(errorsBefore);
  const problems = [];
  if (flashes.length) problems.push(`${flashes.length} flash frame(s): ${flashes.map((s) => `+${s.t}ms L=${Math.round(s.L)} white=${s.white.toFixed(2)}`).join(", ")} (old L=${Math.round(first.L)}, new L=${Math.round(last.L)})`);
  if (grew.length) problems.push(`grew mid-switch: ${grew.slice(0, 4).map((g) => `${g.sel}[${g.i}] +${g.by}px`).join(", ")}`);
  if (moved.length && !rec.fontChanged) problems.push(`layout moved without a font change: ${moved.slice(0, 4).map((m) => `${m.sel}[${m.i}] ${m.from}→${m.to}`).join("; ")}`);
  if (settleMs > SETTLE_MS) problems.push(`new theme took ${settleMs} ms to show`);
  if (rec.cls > 0.02 && !rec.fontChanged) problems.push(`layout shift ${rec.cls.toFixed(3)}`);
  if (errors.length) problems.push(`errors: ${errors.slice(0, 3).join(" | ")}`);
  const r = { name, ok: !problems.length, problems, settleMs, cls: +rec.cls.toFixed(4), longTasks: rec.longTasks, longMs: Math.round(rec.longMs), frames: frames.length, fontChanged: rec.fontChanged, reflowed: rec.fontChanged ? moved.length : 0 };
  results.push(r);
  if (problems.length || sheetBudget-- > 0) await contactSheet(frames, stats, `${name.replace(/[^a-z0-9]+/gi, "_")}.png`);
  console.log(`${r.ok ? "ok  " : "FAIL"} ${name}${problems.length ? "\n       " + problems.join("\n       ") : ""}`);
  return r;
}

/** Another window saved a change: the backend broadcasts the new config (starts the clock in-page). */
async function broadcast(page, body) {
  await page.evaluate((body) => {
    const next = JSON.parse(JSON.stringify(window.__lensConfig()));
    new Function("c", body)(next);
    window.__rig.t0 = performance.now();
    window.__lensSetConfig(next);
    window.__lensEmit("lens://config-updated", next);
  }, body);
}

async function openTab(page, label) {
  await settingsTabs(page).filter({ hasText: new RegExp(`^${label}$`) }).first().click();
  await page.waitForTimeout(500);
}

// ── Scenario A: clicking theme cards on the Appearance page ──────────────────────────────────────
{
  const page = await openSurface(browser, server.base, { surface: "settings", settle: 1500 });
  const cdp = await page.context().newCDPSession(page);
  await openTab(page, "Appearance");
  if (FULL) {
    await page.locator("[data-browse-all]").click();
    await page.waitForTimeout(600);
  }
  const labels = await page.locator("button.tux-pack .tux-pack-label").allInnerTexts();
  // CI: every featured look in and out once, in an order that alternates dark and light and fonts.
  const order = FULL ? labels : labels.slice(0, 12);
  let prev = "Obsidian";
  for (const label of order.filter((l) => l !== "Obsidian").concat("Obsidian")) {
    const card = page.locator("button.tux-pack", { has: page.locator(".tux-pack-label", { hasText: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) }) }).first();
    if (!(await card.count())) continue;
    await card.scrollIntoViewIfNeeded();
    await measure(page, cdp, `card ${prev} → ${label}`, () => card.click());
    prev = label;
  }
  // Dark ↔ Light ↔ Dark with the segmented control in the hero.
  for (const mode of ["Light", "Dark"]) {
    const btn = page.locator(".tux-hero button", { hasText: new RegExp(`^${mode}$`) }).first();
    if (!(await btn.count())) continue;
    await btn.scrollIntoViewIfNeeded();
    await measure(page, cdp, `appearance → ${mode}`, () => btn.click());
  }

  // Function check after the switches: tabs change, a switch row toggles, search finds a setting.
  const fn = [];
  await openTab(page, "Dock & Bar");
  if (!(await page.locator(".cc-nav-btn.active, .cc-nav-btn[aria-current]", { hasText: "Dock & Bar" }).count())) fn.push("the Dock & Bar tab did not become active");
  const sw = page.locator('[role="switch"][aria-label="Enable Top Bar"]').first();
  try {
    const before = await sw.getAttribute("aria-checked", { timeout: 5000 });
    await sw.click({ timeout: 5000 });
    await page.waitForTimeout(250);
    const after = await sw.getAttribute("aria-checked", { timeout: 5000 });
    if (before === after) fn.push(`"Enable Top Bar" did not toggle (aria-checked stayed ${before})`);
    await sw.click({ timeout: 5000 });
  } catch (e) {
    fn.push(`"Enable Top Bar" could not be used: ${String(e.message).split("\n")[0]}`);
  }
  const search = page.locator('input[placeholder*="Search settings"]').first();
  if (await search.count()) {
    await search.fill("roundness");
    await page.waitForTimeout(400);
    // Results are listed in the sidebar by where the setting lives ("Lens › Appearance").
    const hits = await page.getByText(/Lens › Appearance/).count();
    if (!hits) fn.push('searching "roundness" did not list the Appearance page');
    await search.fill("");
  } else fn.push("no settings search box");
  results.push({ name: "function after switches", ok: !fn.length, problems: fn });
  console.log(`${fn.length ? "FAIL" : "ok  "} function after switches${fn.length ? "\n       " + fn.join("\n       ") : ""}`);
  await page.context().close();
}

// ── Scenario S: Simple mode (what new users see first): Quick settings' theme chips and the Dark
//    mode tile ──────────────────────────────────────────────────────────────────────────────────────
{
  const page = await openSurface(browser, server.base, { surface: "settings", settle: 1500 });
  const cdp = await page.context().newCDPSession(page);
  await page.getByRole("radio", { name: /^Simple$/ }).first().click();
  await page.waitForTimeout(600);
  const chips = page.locator(".sh-quick-pack");
  const names = (await chips.allInnerTexts()).map((t) => t.trim()).filter(Boolean);
  const pick = FULL ? names : names.filter((n) => /Alabaster|Catppuccin|Obsidian/.test(n));
  let prev = "Obsidian";
  for (const label of pick.filter((n) => n !== "Obsidian").concat("Obsidian")) {
    const chip = chips.filter({ hasText: new RegExp(`^${label}$`) }).first();
    if (!(await chip.count())) continue;
    await chip.scrollIntoViewIfNeeded();
    await measure(page, cdp, `simple chip ${prev} → ${label}`, () => chip.click());
    prev = label;
  }
  // The tile is labelled by the current mode ("Dark mode" / "Light mode").
  const tile = page.locator("button", { hasText: /^(Dark|Light) mode/ }).first();
  if (await tile.count()) {
    await tile.scrollIntoViewIfNeeded();
    await measure(page, cdp, "simple Dark mode tile → light", () => tile.click());
    await measure(page, cdp, "simple Light mode tile → dark", () => tile.click());
  }
  await page.context().close();
}

// ── Scenario B: another window changes the theme while Settings shows other pages ────────────────
{
  const page = await openSurface(browser, server.base, { surface: "settings", settle: 1500 });
  const cdp = await page.context().newCDPSession(page);
  const pages = FULL ? ["Dock & Bar", "Desktop", "Windows & Keys", "Accessibility", "About & Testing"] : ["Dock & Bar", "Accessibility"];
  const presets = ["catppuccin-mocha", "alabaster-daylight", "hyprland-neon", "obsidian"];
  for (const tab of pages) {
    await openTab(page, tab);
    for (const preset of presets) {
      await measure(page, cdp, `broadcast on ${tab} → ${preset}`, () => broadcast(page, `c.theme.preset = ${JSON.stringify(preset)};`));
    }
  }
  // High contrast on and off (broadcast).
  for (const contrast of ["high", "normal"]) {
    await measure(page, cdp, `contrast → ${contrast}`, () => broadcast(page, `c.theme.contrast = ${JSON.stringify(contrast)};`));
  }
  await page.context().close();
}

// ── Scenario C: desktop widgets follow a theme change without moving ────────────────────────────
// The desktop host (docs/features/desktop-widgets.md) with one widget of each local kind: a theme
// broadcast may recolour the cards, but no widget may move or change size, and nothing may error.
{
  const page = await openSurface(browser, server.base, { surface: "deskwidgets", query: "magic=desktopWidgets&desk=sample", width: 1600, height: 900, settle: 1500 });
  const boxes = () => page.evaluate(() => [...document.querySelectorAll(".dwg-item")].map((e) => { const r = e.getBoundingClientRect(); return [e.getAttribute("data-id"), Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)].join(":"); }));
  const before = await boxes();
  const problems = [];
  if (before.length < 4) problems.push(`only ${before.length} widgets rendered`);
  for (const preset of ["alabaster-daylight", "catppuccin-mocha", "obsidian"]) {
    await broadcast(page, `c.theme.preset = ${JSON.stringify(preset)};`);
    await page.waitForTimeout(SETTLE_MS + 150);
    const after = await boxes();
    if (after.join("|") !== before.join("|")) problems.push(`widgets moved on ${preset}: ${after.filter((b, i) => b !== before[i]).join(", ")}`);
  }
  if (page.problems.errors.length) problems.push(...page.problems.errors);
  results.push({ name: "desktop widgets: theme broadcast keeps the layout", ok: !problems.length, problems });
  console.log(`${problems.length ? "FAIL" : "ok  "} desktop widgets: theme broadcast keeps the layout${problems.length ? "\n       " + problems.join("\n       ") : ""}`);
  await page.context().close();
}

await browser.close();
server.close();

const failed = results.filter((r) => !r.ok);
const md = [
  `# Theme-switch rig${FULL ? " (full)" : ""}`,
  "",
  `${results.length} checks, ${failed.length} failed. Tolerances: layout ${LAYOUT_PX}px, flash ±${FLASH_L} L / +${FLASH_WHITE} white share, settle ${SETTLE_MS} ms.`,
  "",
  "| check | ok | settle ms | CLS | long tasks | frames | font/shape change (reflowed boxes) | problems |",
  "|---|---|---|---|---|---|---|---|",
  ...results.map((r) => `| ${r.name} | ${r.ok ? "yes" : "**no**"} | ${r.settleMs ?? ""} | ${r.cls ?? ""} | ${r.longTasks ?? ""}${r.longMs ? ` (${r.longMs} ms)` : ""} | ${r.frames ?? ""} | ${r.fontChanged ? `yes (${r.reflowed})` : ""} | ${r.problems.join("<br>")} |`),
  "",
].join("\n");
writeFileSync(join(outDir, "report.md"), md);
writeFileSync(join(outDir, "report.json"), JSON.stringify(results, null, 2));
const copyTo = process.env.THEME_RIG_COPY || (existsSync("/mnt/user-data/outputs") ? "/mnt/user-data/outputs/theme-rig" : "");
if (copyTo) cpSync(outDir, copyTo, { recursive: true });
console.log(`\n[theme-rig] ${results.length - failed.length}/${results.length} checks clean → ${join(outDir, "report.md")}`);
process.exit(failed.length ? 1 : 0);
