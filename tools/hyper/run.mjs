// The hyper suite (docs/TESTING.md › Hyper suite): drives every Settings control, every surface and
// the cross-cutting rules in the headless harness (tools/robust, parity mock backend), merges the
// real-Windows results (tests/e2e/out/autohide.json, intents.json) and writes a coverage report
// that lists every inventoried feature as pass / fail / untested.
//
//   node tools/robust/build.mjs && node tools/hyper/run.mjs          # quick tier (CI, every PR)
//   node tools/hyper/run.mjs --full                                   # nightly: + reload checks for
//                                                                     #   every switch, every pack
// Gate: fails only on failures not listed in tools/hyper/known.json (known bugs are logged in
// docs/brain/BUGS.md); a known failure that passes again is reported so it can be removed.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { serve, launch, openSurface, root, SURFACES } from "../robust/lib.mjs";
import { buildInventory } from "./inventory.mjs";

const FULL = process.argv.includes("--full");
const outDir = join(root, "tools/hyper/out");
mkdirSync(outDir, { recursive: true });
const inventory = buildInventory(root);
const byId = new Map(inventory.map((i) => [i.id, i]));
const results = []; // { id, check, status: pass|fail, detail }
const record = (id, check, ok, detail = "") => {
  results.push({ id, check, status: ok ? "pass" : "fail", detail: String(detail).slice(0, 400) });
  if (!ok) console.log(`FAIL ${id} · ${check}: ${String(detail).slice(0, 200)}`);
};

/** Flat key → JSON value map, so a config diff names exactly what changed. */
function flat(o, p = "", acc = {}) {
  if (o && typeof o === "object" && !Array.isArray(o)) {
    for (const [k, v] of Object.entries(o)) flat(v, p ? `${p}.${k}` : k, acc);
  } else acc[p] = JSON.stringify(o);
  return acc;
}
function diff(a, b, { existingOnly = false } = {}) {
  const fa = flat(a), fb = flat(b);
  return [...new Set([...Object.keys(fa), ...Object.keys(fb)])].filter((k) => fa[k] !== fb[k] && (!existingOnly || k in fa));
}
const cfg = (page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__lensConfig())));

const server = await serve();
const browser = await launch();
const t0 = Date.now();

// ------------------------------------------------------------------------------------------------
// 1. Every switch on every Settings page: flips, writes only its own keys, flips back byte-for-byte,
//    no errors; and (full tier, or the first per page in quick) the saved value survives a reload.
// ------------------------------------------------------------------------------------------------
const catalogueByLabel = new Map(inventory.filter((i) => i.kind === "setting").map((i) => [i.label.toLowerCase(), i]));
const pages = inventory.filter((i) => i.kind === "settings-page").map((i) => i.page);
const untested = new Map(); // id -> reason (checked, but only Windows can tell)
const touched = new Map(); // config path -> the row that changed it
const tested = new Set();
for (const mode of FULL ? ["advanced", "simple"] : ["advanced"]) {
  for (const pageId of pages) {
    const page = await openSurface(browser, server.base, { surface: "settings", query: `tab=${pageId}&settingsMode=${mode}`, settle: 1300 });
    const pid = `page:${pageId}`;
    record(pid, `${mode}: opens without errors`, page.problems.errors.length === 0, page.problems.errors.join(" | "));
    const switches = page.locator('.sh-row [role="switch"]:not([disabled]), .cc-content [role="switch"]:not([disabled])');
    const n = await switches.count().catch(() => 0);
    let reloadChecked = false;
    const names = [];
    for (let i = 0; i < n; i++) {
      const el = switches.nth(i);
      const aria = await el.getAttribute("aria-label", { timeout: 1000 }).catch(() => null);
      const rowLabel = await el.evaluate((e) => e.closest(".sh-row")?.querySelector(".sh-row-label")?.textContent || "").catch(() => "");
      names.push({ aria, name: (aria || rowLabel || "").trim(), index: i });
    }
    for (const { aria, name, index } of names) {
      if (!name) continue;
      // Found again by name before each use: a click can add or remove other switches above it.
      const sw = aria ? page.locator(`[role="switch"][aria-label="${aria.replace(/"/g, '\\"')}"]`).first() : switches.nth(index);
      const id = `row:${pageId}:${name}`;
      if (!byId.has(id)) byId.set(id, { id, kind: "settings-row", label: name, source: "found in the UI", page: pageId, tier: "headless", status: "untested" });
      const before = await cfg(page);
      const was = await sw.getAttribute("aria-checked", { timeout: 1500 }).catch(() => null);
      if (was === null) continue;
      const errs0 = page.problems.errors.length;
      try {
        await sw.click({ timeout: 2000 });
        await page.waitForTimeout(160);
        const now = await sw.getAttribute("aria-checked", { timeout: 1500 }).catch(() => "gone");
        const after = await cfg(page);
        const changed = diff(before, after, { existingOnly: true });
        const dialogNow = await page.locator('[role="dialog"], [role="alertdialog"]').count();
        if (now === was && !changed.length && !dialogNow) {
          // Nothing in the settings changed and the switch didn't move: it drives Windows directly
          // (Wi-Fi, startup apps …) or needs a real backend reply. Only the Windows tier can tell.
          untested.set(id, "drives Windows directly; checked on a real PC");
          continue;
        }
        tested.add(name.toLowerCase());
        for (const k of changed) touched.set(k, id);
        // A switch must visibly flip (or open a confirmation, which leaves it as it was).
        const dialog = await page.locator('[role="dialog"], [role="alertdialog"]').count();
        record(id, `${mode}: flips when clicked`, now !== was || dialog > 0, `aria-checked stayed ${was}`);
        const cat = catalogueByLabel.get(name.toLowerCase());
        if (cat && cat.store === "config" && changed.length) {
          const own = changed.every((k) => k === cat.path || k.startsWith(cat.path + "."));
          record(id, `${mode}: writes only its own setting (${cat.path})`, own, `changed ${changed.join(", ")}`);
        } else if (changed.length > 4) {
          record(id, `${mode}: writes a small, focused change`, false, `one switch changed ${changed.length} settings: ${changed.slice(0, 8).join(", ")}`);
        }
        if (dialog) {
          await page.keyboard.press("Escape").catch(() => {});
          await page.waitForTimeout(150);
        } else {
          if (now === "gone") { record(id, `${mode}: stays on the page when clicked`, false, "the switch disappeared after one click"); continue; }
          await sw.click({ timeout: 2000 });
          await page.waitForTimeout(160);
          const back = await cfg(page);
          const rest = diff(before, back, { existingOnly: true });
          record(id, `${mode}: flipping back restores the settings exactly`, rest.length === 0, `left changed: ${rest.join(", ")}`);
          record(id, `${mode}: shows its state again after flipping back`, (await sw.getAttribute("aria-checked", { timeout: 1500 }).catch(() => null)) === was, "");
        }
        record(id, `${mode}: no errors`, page.problems.errors.length === errs0, page.problems.errors.slice(errs0).join(" | "));
        // Reload: the value the UI wrote is what the page shows after a restart.
        if (mode === "advanced" && changed.length && !dialog && (FULL || !reloadChecked)) {
          reloadChecked = true;
          await sw.click({ timeout: 2000 });
          await page.waitForTimeout(160);
          const saved = await cfg(page);
          const expect = await sw.getAttribute("aria-checked", { timeout: 1500 }).catch(() => null);
          await page.addInitScript((c) => { window.__lensSeedConfig = c; }, saved);
          await page.reload();
          await page.waitForTimeout(1300);
          const again = page.locator(`[role="switch"][aria-label="${name.replace(/"/g, '\\"')}"]`).first();
          const shown = (await again.count()) ? await again.getAttribute("aria-checked", { timeout: 1500 }).catch(() => null) : null;
          record(id, "advanced: survives a reload", shown === null || shown === expect, `after reload aria-checked=${shown}, expected ${expect}`);
          break; // the page was reloaded: the remaining switches are re-found on the next page open
        }
      } catch (e) {
        record(id, `${mode}: can be clicked`, false, e.message.split("\n")[0]);
      }
    }
    // Choice groups (Segmented): pick every option, then the original; settings come back exactly.
    const groups = page.locator('[role="radiogroup"][aria-label]');
    const g = await groups.count().catch(() => 0);
    for (let j = 0; j < g; j++) {
      const grp = groups.nth(j);
      const name = ((await grp.getAttribute("aria-label", { timeout: 1000 }).catch(() => "")) || "").trim();
      if (!name) continue;
      const id = `row:${pageId}:${name}`;
      if (!byId.has(id)) byId.set(id, { id, kind: "settings-row", label: name, source: "found in the UI", page: pageId, tier: "headless", status: "untested" });
      const radios = grp.locator('[role="radio"]:not([disabled])');
      const k = await radios.count().catch(() => 0);
      if (k < 2) continue;
      let orig = -1;
      for (let r = 0; r < k; r++) if ((await radios.nth(r).getAttribute("aria-checked", { timeout: 1000 }).catch(() => null)) === "true") orig = r;
      if (orig < 0) continue;
      const before = await cfg(page);
      const errs0 = page.problems.errors.length;
      let moved = 0;
      const sweep = new Set();
      try {
        for (let r = 0; r < k && r < 6; r++) {
          if (r === orig) continue;
          if (!(await radios.nth(r).isVisible().catch(() => false))) continue;
          await radios.nth(r).click({ timeout: 2000 });
          await page.waitForTimeout(140);
          if ((await radios.nth(r).getAttribute("aria-checked", { timeout: 1000 }).catch(() => null)) === "true") moved++;
          for (const key of diff(before, await cfg(page), { existingOnly: true })) sweep.add(key);
        }
        await radios.nth(orig).click({ timeout: 2000 });
        await page.waitForTimeout(160);
        if (!moved && !diff(before, await cfg(page), { existingOnly: true }).length) { untested.set(id, "drives Windows directly; checked on a real PC"); continue; }
        for (const key of sweep) touched.set(key, id);
        tested.add(name.toLowerCase());
        const tried = Math.min(k, 6) - (orig < 6 ? 1 : 0);
        record(id, `${mode}: every option can be picked`, moved === tried, `${moved} of ${tried} options took`);
        const rest = diff(before, await cfg(page), { existingOnly: true });
        record(id, `${mode}: going back to the first choice restores the settings exactly`, rest.length === 0, `left changed: ${rest.join(", ")}`);
        record(id, `${mode}: no errors`, page.problems.errors.length === errs0, page.problems.errors.slice(errs0).join(" | "));
      } catch (e) {
        record(id, `${mode}: can be used`, false, e.message.split("\n")[0]);
      }
    }
    await page.context().close();
  }
}

// ------------------------------------------------------------------------------------------------
// 2. Themes never change layout: every look and pack on Appearance changes colours and materials,
//    never the Dock, the Top Bar or behaviour.
// ------------------------------------------------------------------------------------------------
{
  const LAYOUT = /^(dock\.(style|iconSize|position|autoHide|groundedMarginBottom|hoverScale|hoverLift)|topBar\.(enabled|autoHide|height|floating|revealDelayMs|hideDelayMs)|func\.)/;
  const page = await openSurface(browser, server.base, { surface: "settings", query: "tab=theme", settle: 1500 });
  if (FULL && (await page.locator("[data-browse-all]").count())) await page.locator("[data-browse-all]").first().click().catch(() => {});
  const cards = page.locator("button.tux-pack");
  const n = await cards.count();
  let bad = 0;
  for (let i = 0; i < n; i++) {
    const label = (await cards.nth(i).locator(".tux-pack-label").innerText().catch(() => `#${i}`)).trim();
    const before = await cfg(page);
    await cards.nth(i).click().catch(() => {});
    await page.waitForTimeout(200);
    const layout = diff(before, await cfg(page)).filter((k) => LAYOUT.test(k));
    if (layout.length) bad++;
    record(`invariant:themes-colour-only:${label}`, "a theme changes colours only", layout.length === 0, `changed layout: ${layout.join(", ")}`);
  }
  record("invariant:themes-colour-only", `${n} looks checked`, bad === 0, `${bad} of ${n} looks change the Dock, Top Bar or behaviour`);
  await page.context().close();
}

// ------------------------------------------------------------------------------------------------
// 3. Every surface: opens with no errors in dark, light, high contrast and reduced motion, passes a
//    quick accessibility pass, and Esc closes the flyouts.
// ------------------------------------------------------------------------------------------------
const FLYOUTS = new Set(["palette", "quicksettings", "launcher", "widgets", "overview", "settings", "dashboard"]);
// Surfaces Rust builds on first use that the quick tier also covers (the rest run nightly).
const QUICK_EXTRA = new Set(["dashboard"]);
const ALL_VARIANTS = [
  { name: "dark", preset: "obsidian" },
  { name: "light", preset: "alabaster-daylight", colorScheme: "light" },
  { name: "high contrast", preset: "obsidian", contrast: true },
  { name: "reduced motion", preset: "obsidian", reducedMotion: true },
];
const VARIANTS = FULL ? ALL_VARIANTS : ALL_VARIANTS.filter((v) => v.name === "dark" || v.name === "light");
const surfaceIds = inventory.filter((i) => i.kind === "surface").map((i) => i.surface).filter((s) => SURFACES[s] || QUICK_EXTRA.has(s) || FULL);
let axeSrc = null;
try { axeSrc = readFileSync(join(root, "node_modules/axe-core/axe.min.js"), "utf8"); } catch {}
for (const s of surfaceIds) {
  for (const v of VARIANTS) {
    const page = await openSurface(browser, server.base, { surface: s, preset: v.preset, colorScheme: v.colorScheme, reducedMotion: v.reducedMotion, settle: 1100 });
    if (v.contrast) {
      await page.evaluate(() => document.documentElement.setAttribute("data-contrast", "high"));
      await page.waitForTimeout(150);
    }
    const rendered = await page.evaluate(() => (document.getElementById("root")?.innerHTML.length || 0) > 0);
    record(`surface:${s}`, `${v.name}: renders without errors`, rendered && page.problems.errors.length === 0, rendered ? page.problems.errors.join(" | ") : "nothing rendered");
    if (axeSrc && v.name === "dark") {
      await page.addScriptTag({ content: axeSrc });
      const vio = await page.evaluate(async () => {
        const r = await window.axe.run(document, { resultTypes: ["violations"], runOnly: ["wcag2a", "wcag2aa"] });
        return r.violations.filter((x) => x.impact === "critical").map((x) => `${x.id} (${x.nodes.length})`);
      });
      record(`surface:${s}`, "no critical accessibility problems", vio.length === 0, vio.join(", "));
    }
    if (FLYOUTS.has(s) && v.name === "dark") {
      const calls0 = await page.evaluate(() => window.__lensCalls.length);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(250);
      const calls = await page.evaluate((n) => window.__lensCalls.slice(n), calls0);
      record(`surface:${s}`, "Esc closes it", calls.some((c) => /hide|close|dismiss/.test(c)), `calls after Esc: ${calls.join(", ") || "none"}`);
    }
    await page.context().close();
  }
}

// ------------------------------------------------------------------------------------------------
// 3b. Stuck states (docs/FAILSAFE.md §10): every pop-out closes when focus leaves it (another app,
//     the Win key, Alt+Tab, the lock screen all take focus away), a refused close is tried again,
//     and the Dock closes its menus when it hides or the watcher says they went stale.
// ------------------------------------------------------------------------------------------------
{
  const hidesOf = (page, label) => page.evaluate((l) => window.__lensCallLog.filter((c) => c.cmd === "hide_surface" && c.args?.label === l).length, label);
  const loseFocus = (page) => page.evaluate(() => {
    document.hasFocus = () => false;
    window.dispatchEvent(new Event("blur"));
  });
  for (const s of ["quicksettings", "widgets", "launcher", "overview", "palette"]) {
    const id = `stuck:${s}`;
    try {
      const page = await openSurface(browser, server.base, { surface: s, settle: 1100 });
      const n0 = await hidesOf(page, s);
      await loseFocus(page);
      await page.waitForTimeout(500);
      record(id, "closes when focus leaves it (another app, Win key, Alt+Tab, lock screen)", (await hidesOf(page, s)) > n0, "no hide_surface after blur");
      if (s === "quicksettings" || s === "widgets" || s === "palette") {
        // The close is refused once (window busy): it is tried again, so the pop-out still goes.
        const n1 = await hidesOf(page, s);
        await page.evaluate((l) => { window.__lensFailOnce.hide_surface = 1; }, s);
        await loseFocus(page);
        await page.waitForTimeout(700);
        record(id, "a refused close is tried again", (await hidesOf(page, s)) - n1 >= 2, `${(await hidesOf(page, s)) - n1} hide call(s)`);
      }
      record(id, "no errors", page.problems.errors.length === 0, page.problems.errors.join(" | "));
      await page.context().close();
    } catch (e) {
      record(id, "can be checked", false, e.message.split("\n")[0]);
    }
  }
  {
    const id = "stuck:dock";
    try {
      const page = await openSurface(browser, server.base, { surface: "dock", settle: 1400 });
      const openMenu = async () => {
        await page.locator(".dock-item").first().click({ button: "right", timeout: 2000 });
        await page.waitForTimeout(250);
        return (await page.locator(".dock-ctx-menu").count()) > 0;
      };
      const menuGone = async () => {
        await page.waitForTimeout(350);
        return (await page.locator(".dock-ctx-menu").count()) === 0;
      };
      const closedReports = () => page.evaluate(() => window.__lensCallLog.filter((c) => c.cmd === "set_dock_menu_open" && c.args?.open === false).length);
      if (!(await openMenu())) throw new Error("the app menu did not open");
      const r0 = await closedReports();
      await page.evaluate(() => window.__lensEmit("lens://dock-dismiss-menus", null));
      record(id, "a stale menu closes when the watcher says so", await menuGone(), "menu still open");
      record(id, "closing a menu tells the watcher", (await closedReports()) > r0, "no set_dock_menu_open(false)");
      await openMenu();
      await page.evaluate(() => window.dispatchEvent(new Event("blur")));
      record(id, "the menu closes when focus leaves the Dock", await menuGone(), "menu still open");
      await openMenu();
      await page.evaluate(() => { window.__lensVisible = { ...(window.__lensVisible || {}), settings: true }; });
      await page.evaluate(() => window.__lensEmit("lens://settings-open", true));
      await page.waitForTimeout(200);
      const s0 = await page.evaluate(() => window.__lensCallLog.filter((c) => c.cmd === "hide_surface" && c.args?.label === "settings").length);
      await page.evaluate(() => window.__lensEmit("lens://dock-visible", false));
      record(id, "nothing stays open on a hidden Dock (menu)", await menuGone(), "menu still open");
      const s1 = await page.evaluate(() => window.__lensCallLog.filter((c) => c.cmd === "hide_surface" && c.args?.label === "settings").length);
      record(id, "nothing stays open on a hidden Dock (Settings)", s1 > s0, "Settings was not closed");
      await page.evaluate(() => window.__lensEmit("lens://dock-visible", true));
      // A refused "menu closed" report is sent again, or the watcher would hold the Dock up.
      await openMenu();
      const r1 = await closedReports();
      await page.evaluate(() => { window.__lensFailOnce.set_dock_menu_open = 1; });
      await page.keyboard.press("Escape");
      await page.waitForTimeout(500);
      record(id, "a refused \"menu closed\" report is sent again", (await closedReports()) - r1 >= 2, `${(await closedReports()) - r1} report(s)`);
      record(id, "no errors", page.problems.errors.length === 0, page.problems.errors.join(" | "));
      await page.context().close();
    } catch (e) {
      record(id, "can be checked", false, e.message.split("\n")[0]);
    }
  }
}

await browser.close();
server.close();

// ------------------------------------------------------------------------------------------------
// 4. Source-level rules (one owner, one writer, one undo table).
// ------------------------------------------------------------------------------------------------
const src = (p) => readFileSync(join(root, p), "utf8");
{
  // One owner of "shown" for the Top Bar: every place that tells the bar to show itself also sets
  // the shared flag the watcher reads (B-36).
  const surfaces = src("src-tauri/src/commands/surfaces.rs");
  const block = surfaces.slice(surfaces.indexOf("fn sync_topbar_search_cmd"), surfaces.indexOf("fn sync_topbar_search_cmd") + 1500);
  record("invariant:topbar-one-owner", "Search sets the shared Top Bar flag when it shows the bar", /topbar_visible\.store\(true/.test(block), "sync_topbar_search_cmd emits topbar-visible without storing the flag");
  const watcher = src("src-tauri/src/app/watcher.rs");
  record("invariant:topbar-one-owner", "repositioning keeps the watcher's Top Bar state", !/topbar-visible", true\);\n\s*\} else \{\n\s*let _ = topbar\.hide/.test(watcher), "position_dock_and_bars forces the bar shown");
  record("invariant:topbar-one-owner", "the watcher adopts the shared flag every tick", /topbar_visible = bg_topbar_visible\.load/.test(watcher), "");
}
{
  // Every flyout that is shown through the glide also dismisses the others (no two flyouts at once).
  const surfaces = src("src-tauri/src/commands/surfaces.rs");
  const fns = surfaces.split(/\n(?=pub\(crate\) fn |fn )/);
  const missing = fns.filter((f) => /glide_show_surface\(&app, "(palette|quicksettings|launcher|widgets|overview|settings)"/.test(f) && !/dismiss_other_surfaces/.test(f)).map((f) => f.match(/fn (\w+)/)?.[1]);
  record("invariant:one-flyout", "every flyout show path dismisses the others", missing.length === 0, `no dismiss in: ${missing.join(", ")}`);
}
for (const [id, cmd, args] of [
  ["invariant:change-registry", "node", ["tools/changes/check.mjs"]],
]) {
  try {
    execFileSync(cmd, args, { cwd: root, stdio: "pipe" });
    record(id, "Remove all covers every change Lens can make", true);
  } catch (e) {
    record(id, "Remove all covers every change Lens can make", false, String(e.stdout || e.message).slice(-300));
  }
}
{
  // One settings writer: nothing but config::write_config_file writes config.json.
  const offenders = [];
  try {
    const out = execFileSync("git", ["grep", "-n", "config.json", "--", "src-tauri/src"], { cwd: root, encoding: "utf8" });
    for (const line of out.split("\n")) if (/fs::write|File::create|OpenOptions/.test(line) && !/tests?\/|write_config_file/.test(line)) offenders.push(line.slice(0, 160));
  } catch {}
  record("invariant:one-writer", "only the settings writer writes config.json", offenders.length === 0, offenders.join(" | "));
}

// ------------------------------------------------------------------------------------------------
// 5. Real-Windows results from the E2E job, when they are on disk.
// ------------------------------------------------------------------------------------------------
for (const f of ["autohide.json", "intents.json"]) {
  const p = join(root, "tests/e2e/out", f);
  if (!existsSync(p)) continue;
  for (const r of JSON.parse(readFileSync(p, "utf8"))) record(r.inventoryId || `e2e:${f.replace(".json", "")}:${r.id}`, r.title || r.id, r.status === "pass", r.error || "");
}

// ------------------------------------------------------------------------------------------------
// Coverage report and gate
// ------------------------------------------------------------------------------------------------
const items = [...byId.values()];
for (const it of items) {
  const rs = results.filter((r) => r.id === it.id);
  if (rs.length) it.status = rs.some((r) => r.status === "fail") ? "fail" : "pass";
}
// The Guide names pages by their old tab ids, so a row is covered when a control with its label
// was tested on any page.
for (const it of items.filter((i) => i.kind === "settings-row" && i.status === "untested")) {
  const twin = items.find((r) => r.kind === "settings-row" && r !== it && r.label.toLowerCase() === it.label.toLowerCase() && r.status !== "untested");
  if (twin) { it.status = twin.status; it.coveredBy = twin.id; }
  else if (untested.has(it.id)) it.reason = untested.get(it.id);
  else if ([...untested.keys()].some((k) => k.toLowerCase().endsWith(":" + it.label.toLowerCase()))) it.reason = "drives Windows directly; checked on a real PC";
}
for (const it of items) if (it.status === "untested" && !it.reason) {
  it.reason = it.kind === "command-intent" || it.kind === "tool" ? "Windows tier (tests/e2e/intents.mjs)" : it.kind === "feature" ? "covered through its settings, surfaces and E2E scenarios" : it.kind === "settings-row" ? "not a switch or choice (slider, field, list); no automated check yet" : "";
}
// A catalogue setting is covered by the Settings control that was seen writing it.
for (const it of items.filter((i) => i.kind === "setting" && i.status === "untested" && i.store === "config")) {
  const via = touched.get(it.path) || [...touched.entries()].find(([k]) => k.startsWith(it.path + "."))?.[1];
  if (via) { const row = byId.get(via); it.status = !row || row.status === "untested" ? "pass" : row.status; it.coveredBy = via; }
}
// Catalogue settings are covered by the row that shows them, when there is one.
for (const it of items.filter((i) => i.kind === "setting" && i.status === "untested")) {
  const row = items.find((r) => r.kind === "settings-row" && r.label.toLowerCase() === it.label.toLowerCase() && r.status !== "untested");
  if (row) { it.status = row.status; it.coveredBy = row.id; }
}
const extra = [...new Set(results.map((r) => r.id))].filter((id) => !byId.has(id)).map((id) => ({ id, kind: id.split(":")[0], label: id, source: "suite", status: results.some((r) => r.id === id && r.status === "fail") ? "fail" : "pass" }));
const all = [...items, ...extra];
const count = (k) => {
  const xs = k ? all.filter((i) => i.kind === k) : all;
  return { total: xs.length, pass: xs.filter((i) => i.status === "pass").length, fail: xs.filter((i) => i.status === "fail").length, untested: xs.filter((i) => i.status === "untested").length };
};
const kinds = [...new Set(all.map((i) => i.kind))];
const summary = Object.fromEntries([["all", count()], ...kinds.map((k) => [k, count(k)])]);
const failures = results.filter((r) => r.status === "fail");
const knownPath = join(root, "tools/hyper/known.json");
const known = existsSync(knownPath) ? JSON.parse(readFileSync(knownPath, "utf8")) : [];
const keyOf = (r) => `${r.id} · ${r.check}`;
const knownSet = new Set(known.map((k) => k.key));
const fresh = failures.filter((r) => !knownSet.has(keyOf(r)));
const fixed = known.filter((k) => !failures.some((r) => keyOf(r) === k.key));

const md = [
  `# Hyper suite coverage`,
  ``,
  `${FULL ? "Full" : "Quick"} tier · ${new Date().toISOString().slice(0, 16)} · ${Math.round((Date.now() - t0) / 1000)} s · ${results.length} checks`,
  ``,
  `| Kind | Total | Pass | Fail | Untested |`,
  `|---|---|---|---|---|`,
  ...Object.entries(summary).map(([k, v]) => `| ${k} | ${v.total} | ${v.pass} | ${v.fail} | ${v.untested} |`),
  ``,
  `## Failures (${failures.length}; ${fresh.length} new)`,
  ``,
  ...failures.map((r) => `- ${knownSet.has(keyOf(r)) ? "(known) " : "**NEW** "}\`${r.id}\` · ${r.check} — ${r.detail}`),
  ``,
  fixed.length ? `## Known failures that now pass (remove from tools/hyper/known.json)\n\n${fixed.map((k) => `- ${k.key}`).join("\n")}\n` : "",
  `## Every feature`,
  ``,
  `| Status | Kind | Feature | Source | Note |`,
  `|---|---|---|---|---|`,
  ...all.sort((a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id)).map((i) => `| ${i.status} | ${i.kind} | ${String(i.label).replace(/\|/g, "\\|")} | ${i.source} | ${i.coveredBy ? `via ${i.coveredBy}` : i.reason || ""} |`),
].join("\n");
writeFileSync(join(outDir, "coverage.md"), md);
writeFileSync(join(outDir, "coverage.json"), JSON.stringify({ summary, failures, items: all }, null, 2));
try {
  mkdirSync("/mnt/user-data/outputs/hyper", { recursive: true });
  writeFileSync("/mnt/user-data/outputs/hyper/coverage.md", md);
  writeFileSync("/mnt/user-data/outputs/hyper/coverage.json", JSON.stringify({ summary, failures, items: all }, null, 2));
} catch {}
console.log(`[hyper] ${results.length} checks, ${failures.length} failing (${fresh.length} new, ${fixed.length} known now passing) in ${Math.round((Date.now() - t0) / 1000)} s`);
console.log(`[hyper] coverage: ${JSON.stringify(summary.all)}`);
if (process.argv.includes("--write-known")) {
  writeFileSync(knownPath, JSON.stringify(failures.map((r) => ({ key: keyOf(r), detail: r.detail })), null, 2) + "\n");
  console.log(`[hyper] wrote ${failures.length} known failures`);
}
process.exit(fresh.length ? 1 : 0);
