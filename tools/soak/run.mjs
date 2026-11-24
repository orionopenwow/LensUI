// Soak and chaos (docs/TESTING.md › Soak). Hammers the real frontend (mocked Tauri) and checks that
// nothing leaks and nothing goes blank:
//
//   soak   — 500 settings toggles, 200 theme switches, 200 Command/Mini open-close cycles.
//            DOM nodes, event listeners and JS heap are sampled through DevTools after a warm-up
//            and again at the end (after forced GC). Growth beyond the limits below fails, as does
//            any console error or uncaught exception.
//   chaos  — the same surfaces with 5 % of backend calls failing or timing out (?chaos=0.05).
//            The UI must stay rendered (no blank root, no React crash). Unhandled promise
//            rejections are counted and listed by command, as findings rather than failures.
//
//   node tools/robust/build.mjs && node tools/soak/run.mjs
//   SOAK_SCALE=0.2 node tools/soak/run.mjs     # quick local pass (20 % of the iterations)
//   failsafe — a surface made to throw: the boundary reports, reloads once, offers Reload, then
//            switches the surface off; overlays show nothing; a storm of failing backend calls
//            (half of them) must not crash any surface (docs/FAILSAFE.md §8).
//   SOAK_ONLY=chaos node tools/soak/run.mjs
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { serve, launch, openSurface, setConfig, settingsTabs, here as robustDir } from "../robust/lib.mjs";

const outDir = join(robustDir, "../soak/out");
mkdirSync(outDir, { recursive: true });
const SCALE = Number(process.env.SOAK_SCALE || 1);
const ONLY = (process.env.SOAK_ONLY || "").split(",").filter(Boolean);
const n = (x) => Math.max(5, Math.round(x * SCALE));

/** Allowed growth between the warm-up sample and the end, after GC. */
const LIMITS = { Nodes: 0.25, JSEventListeners: 0.25, JSHeapUsedSize: 0.5 };
/** Absolute slack so tiny pages don't fail on a handful of nodes. */
const SLACK = { Nodes: 200, JSEventListeners: 40, JSHeapUsedSize: 3 * 1024 * 1024 };

async function metrics(page) {
  const cdp = page.__cdp || (page.__cdp = await page.context().newCDPSession(page));
  await cdp.send("HeapProfiler.collectGarbage").catch(() => {});
  await page.waitForTimeout(150);
  await cdp.send("HeapProfiler.collectGarbage").catch(() => {});
  await cdp.send("Performance.enable").catch(() => {});
  const { metrics: m } = await cdp.send("Performance.getMetrics");
  const pick = Object.fromEntries(m.filter((x) => x.name in LIMITS).map((x) => [x.name, x.value]));
  pick.Nodes = await page.evaluate(() => document.getElementsByTagName("*").length);
  return pick;
}

function growth(before, after) {
  const bad = [];
  for (const k of Object.keys(LIMITS)) {
    const limit = before[k] * (1 + LIMITS[k]) + SLACK[k];
    if (after[k] > limit) bad.push(`${k} ${Math.round(before[k])} → ${Math.round(after[k])} (limit ${Math.round(limit)})`);
  }
  return bad;
}

const BOOL_PATHS = [
  ["dock", "autoHide", ["never", "smart", "always"]],
  ["topBar", "enabled", [true, false]],
  ["topBar", "floating", [true, false]],
  ["topBar", "showMediaControls", [true, false]],
  ["func", "middleClickNewInstance", [true, false]],
  ["func", "gamingPause", [true, false]],
  ["windowControls", "frameBorderEnabled", [true, false]],
  ["dock", "magnification", ["off", "subtle", "classic"]],
  ["dock", "style", ["floating", "slim", "taskbar", "studio", "minimal", "split"]],
];
const PACKS = ["obsidian", "catppuccin-mocha", "alabaster-daylight", "tokyo-night", "nord-frost", "gruvbox-warm", "paper-minimal", "windows-mesh"];

const SOAKS = {
  /** Settings: real toggle clicks on the current tab plus config churn broadcast to the UI. */
  "settings-toggles": {
    surface: "settings",
    iterations: n(500),
    async step(page, i) {
      if (i % 25 === 0) {
        const tabs = settingsTabs(page);
        await tabs.nth(Math.floor(i / 25) % (await tabs.count())).click();
      }
      if (i % 2 === 0) {
        const toggles = page.locator(".cc-toggle:visible");
        const count = await toggles.count();
        if (count) {
          const t = toggles.nth(i % count);
          await t.click({ timeout: 1000 }).catch(() => {});
          // Close anything a toggle opened (consent dialogs etc.) so the run keeps going.
          await page.keyboard.press("Escape");
        }
      } else {
        const [sec, key, values] = BOOL_PATHS[i % BOOL_PATHS.length];
        await setConfig(page, new Function("c", `c.${sec} = c.${sec} || {}; c.${sec}.${key} = ${JSON.stringify(values)}[${i} % ${values.length}];`));
      }
    },
  },
  "dock-config-churn": {
    surface: "dock",
    iterations: n(500),
    async step(page, i) {
      const [sec, key, values] = BOOL_PATHS[i % BOOL_PATHS.length];
      await setConfig(page, new Function("c", `c.${sec} = c.${sec} || {}; c.${sec}.${key} = ${JSON.stringify(values)}[${i} % ${values.length}];`));
      if (i % 10 === 0) await page.mouse.move(600 + (i % 700), 720);
    },
  },
  "theme-switches": {
    surface: "settings",
    iterations: n(200),
    async step(page, i) {
      await setConfig(page, new Function("c", `c.theme.preset = ${JSON.stringify(PACKS[i % PACKS.length])};`));
    },
  },
  "command-open-close": {
    surface: "command",
    iterations: n(200),
    async step(page, i) {
      await page.evaluate((layout) => window.__lensEmit("lens://command/open", { layout }), i % 2 ? "mini" : "full");
      await page.waitForTimeout(20);
      if (i % 3 === 0) await page.keyboard.type("dark mode", { delay: 0 });
      await page.keyboard.press("Escape");
      await page.keyboard.press("Escape");
    },
  },
};

/**
 * Known defects found by this suite (docs/TESTING.md › Findings). A chaos result that matches one
 * is reported as "fixme" instead of failing, so CI stays green until the app is fixed; the
 * matcher is removed with the fix.
 */
const KNOWN = [
  // F1 fixed on integration/waves-7-8 (useLensState loads config and theme independently).
];

const CHAOS_SURFACES = ["dock", "topbar", "settings", "palette", "launcher", "quicksettings", "widgets", "notifications", "overview", "command", "desktopfolder"];

const server = await serve();
const browser = await launch();
const report = { soak: {}, chaos: {} };
let failures = 0;

if (!ONLY.length || ONLY.includes("soak")) {
  for (const [name, s] of Object.entries(SOAKS)) {
    const page = await openSurface(browser, server.base, { surface: s.surface, settle: 1200 });
    const warm = Math.max(3, Math.round(s.iterations * 0.1));
    for (let i = 0; i < warm; i++) await s.step(page, i);
    await page.waitForTimeout(300);
    const before = await metrics(page);
    const t0 = Date.now();
    for (let i = warm; i < s.iterations; i++) await s.step(page, i);
    await page.waitForTimeout(800);
    const after = await metrics(page);
    await page.collectRejections();
    const rootEmpty = await page.evaluate(() => (document.getElementById("root")?.innerHTML.length ?? 0) === 0);
    const bad = growth(before, after);
    const errs = page.problems.errors;
    const ok = !bad.length && !errs.length && !rootEmpty;
    if (!ok) failures++;
    report.soak[name] = { iterations: s.iterations, seconds: (Date.now() - t0) / 1000, before, after, leaks: bad, errors: errs.slice(0, 20), rejections: page.problems.rejections.slice(0, 20), rootEmpty };
    console.log(`${ok ? "ok  " : "FAIL"} soak ${name}: ${s.iterations} steps in ${report.soak[name].seconds.toFixed(1)} s · nodes ${Math.round(before.Nodes)}→${Math.round(after.Nodes)} · listeners ${Math.round(before.JSEventListeners)}→${Math.round(after.JSEventListeners)} · heap ${(before.JSHeapUsedSize / 1e6).toFixed(1)}→${(after.JSHeapUsedSize / 1e6).toFixed(1)} MB`);
    for (const b of bad) console.log(`      leak: ${b}`);
    for (const e of errs.slice(0, 8)) console.log(`      ${e}`);
    if (rootEmpty) console.log("      the surface went blank");
    await page.context().close();
  }
}

if (!ONLY.length || ONLY.includes("chaos")) {
  const byCommand = {};
  for (const surface of CHAOS_SURFACES) {
    for (const seed of [1, 2, 3]) {
      const page = await openSurface(browser, server.base, { surface, query: `chaos=0.05&seed=${seed * 97 + CHAOS_SURFACES.indexOf(surface)}`, settle: 2200 });
      // Exercise the surface a little so more commands run under chaos.
      if (surface === "settings") {
        const tabs = settingsTabs(page);
        const count = await tabs.count();
        for (let i = 0; i < count; i++) { await tabs.nth(i).click(); await page.waitForTimeout(120); }
      } else if (surface === "command") {
        await page.evaluate(() => window.__lensEmit("lens://command/open", { layout: "mini" }));
        await page.waitForTimeout(300);
        await page.keyboard.type("dark mode");
        await page.keyboard.press("Enter");
      } else if (surface === "dock") {
        await page.locator(".dock-search-mag-btn").first().click().catch(() => {});
        await page.keyboard.type("note");
      } else if (surface === "palette") {
        await page.keyboard.type("spo");
      }
      await page.waitForTimeout(1800);
      const rejections = await page.collectRejections();
      const state = await page.evaluate(() => ({
        rootLen: document.getElementById("root")?.innerHTML.length ?? 0,
        visibleText: (document.getElementById("root")?.innerText || "").trim().length,
        chaos: window.__lensChaos,
      }));
      // A crash is an uncaught exception or the surface emptying; console noise from a failed
      // call that the UI reported is expected under chaos.
      const crashes = page.problems.errors.filter((e) => e.startsWith("pageerror") && !/chaos:/.test(e));
      // With the surface boundary in place a render crash no longer blanks the page: it shows
      // the boundary's card (or nothing, for an overlay) and reports. That is still a crash here.
      if (await page.evaluate(() => !!document.querySelector(".fs-problem") || (window.__lensCalls || []).includes("failsafe_ui_crash"))) {
        crashes.push("the surface crashed and its boundary took over");
      }
      const blank = state.rootLen === 0 && surface !== "wallpaper";
      const broken = [...state.chaos.failed, ...state.chaos.timedOut];
      const known = KNOWN.find((k) => k.match({ blank, crashes, broken }));
      const ok = (!crashes.length && !blank) || !!known;
      if (!ok) failures++;
      for (const r of rejections) {
        const cmd = (r.match(/chaos: ([a-z_0-9]+)/) || [])[1] || "(other)";
        byCommand[cmd] = (byCommand[cmd] || 0) + 1;
      }
      report.chaos[`${surface}#${seed}`] = { ok, broken, crashes, blank, rejections: rejections.length, knownFinding: known?.id ?? null };
      console.log(`${known ? `fixme(${known.id})` : ok ? "ok  " : "FAIL"} chaos ${surface} seed ${seed}: ${state.chaos.failed.length} failed + ${state.chaos.timedOut.length} timed-out calls, ${rejections.length} unhandled rejections${blank ? ", WENT BLANK" : ""}${blank || !ok ? " [broke: " + broken.join(", ") + "]" : ""}${crashes.length ? "\n      " + crashes.join("\n      ") : ""}`);
      await page.context().close();
    }
  }
  report.chaos.unhandledByCommand = byCommand;
  const top = Object.entries(byCommand).sort((a, b) => b[1] - a[1]);
  if (top.length) console.log(`[chaos] unhandled rejections by command (findings, not failures): ${top.map(([k, v]) => `${k}×${v}`).join(", ")}`);
}

// ------------------------------------------------------------------------------------------------
// failsafe — a surface is made to throw while rendering (docs/FAILSAFE.md §1 and §8).
//   window surface : reports → reloads by itself → second crash offers "Reload" → third crash
//                    switches the surface off ("Try again" starts over); it stays off across
//                    its own reloads.
//   overlay surface: never shows a card, asks for its window to be hidden, reloads twice, then
//                    stays off.
//   helper crash   : a rejected backend call storm (half of all calls failing) must not take any
//                    surface down: no boundary card.
// ------------------------------------------------------------------------------------------------
if (!ONLY.length || ONLY.includes("failsafe")) {
  report.failsafe = {};
  const crash = (page) => page.evaluate(() => window.dispatchEvent(new Event("lens:test-crash")));
  const card = (page) => page.evaluate(() => document.querySelector(".fs-problem-text")?.textContent ?? null);
  const button = (page) => page.evaluate(() => document.querySelector(".fs-problem-btn")?.textContent ?? null);
  const called = (page, cmd) => page.evaluate((c) => (window.__lensCalls || []).filter((x) => x === c).length, cmd);
  const healthy = async (page) => (await card(page)) === null && (await page.evaluate(() => (document.getElementById("root")?.innerHTML.length ?? 0) > 0));
  const check = (list, ok, what) => {
    if (!ok) list.push(what);
  };

  for (const surface of ["settings", "topbar", "quicksettings"]) {
    const bad = [];
    const page = await openSurface(browser, server.base, { surface, settle: 1500 });
    check(bad, await healthy(page), "did not start healthy");
    // 1st crash: reported, card says it is reloading, then the page comes back by itself.
    await crash(page);
    await page.waitForTimeout(250);
    check(bad, /Reloading/.test((await card(page)) || ""), "1st crash: no 'Reloading' card");
    check(bad, (await button(page)) === null, "1st crash: a button was offered before the automatic reload");
    check(bad, (await called(page, "failsafe_ui_crash")) === 1, "1st crash: not reported");
    await page.waitForTimeout(2600);
    check(bad, await healthy(page), "1st crash: did not come back after the automatic reload");
    // 2nd crash in a row: no more automatic reloads; the person is offered Reload.
    await crash(page);
    await page.waitForTimeout(250);
    check(bad, (await card(page)) === "This part of Lens hit a problem.", "2nd crash: wrong card");
    check(bad, (await button(page)) === "Reload", "2nd crash: no Reload button");
    await page.waitForTimeout(1500);
    check(bad, (await button(page)) === "Reload", "2nd crash: reloaded by itself");
    await page.click(".fs-problem-btn");
    await page.waitForTimeout(1800);
    check(bad, await healthy(page), "2nd crash: Reload did not bring the surface back");
    // 3rd crash in a row: off for the session, and it stays off across a reload.
    await crash(page);
    await page.waitForTimeout(250);
    check(bad, /off until Lens restarts/.test((await card(page)) || ""), "3rd crash: not switched off");
    await page.reload();
    await page.waitForTimeout(1500);
    check(bad, /off until Lens restarts/.test((await card(page)) || ""), "3rd crash: came back on after a reload");
    // "Try again" is the person's decision: the surface starts over.
    check(bad, (await button(page)) === "Try again", "3rd crash: no Try again button");
    await page.click(".fs-problem-btn");
    await page.waitForTimeout(1800);
    check(bad, await healthy(page), "Try again did not bring the surface back");
    const ok = bad.length === 0;
    if (!ok) failures++;
    report.failsafe[`boundary:${surface}`] = { ok, problems: bad };
    console.log(`${ok ? "ok  " : "FAIL"} failsafe boundary ${surface}${bad.length ? "\n      " + bad.join("\n      ") : ""}`);
    await page.context().close();
  }

  for (const surface of ["notifications", "desktopfolder"]) {
    const bad = [];
    const page = await openSurface(browser, server.base, { surface, settle: 1500 });
    await crash(page);
    await page.waitForTimeout(250);
    check(bad, (await card(page)) === null, "an overlay showed a card");
    check(bad, (await called(page, "failsafe_ui_crash")) === 1, "not reported");
    check(bad, (await called(page, "hide_surface")) >= 1, "did not ask for its window to be hidden");
    await page.waitForTimeout(2600); // reloaded once
    await crash(page);
    await page.waitForTimeout(6200); // backs off longer, reloads once more
    check(bad, (await page.evaluate(() => JSON.parse(sessionStorage.getItem(`lens.failsafe.${new URLSearchParams(location.search).get("surface")}`) || "{}").count)) === 2, "second failure was not counted in a row");
    await crash(page);
    await page.waitForTimeout(400);
    await page.reload();
    await page.waitForTimeout(1500);
    check(bad, (await card(page)) === null, "an overlay showed a card after giving up");
    check(bad, (await page.evaluate(() => document.querySelector("#root")?.children.length ?? 0)) <= 2, "a switched-off overlay still rendered its surface");
    check(bad, (await called(page, "hide_surface")) >= 1, "a switched-off overlay did not ask to be hidden on load");
    const ok = bad.length === 0;
    if (!ok) failures++;
    report.failsafe[`overlay:${surface}`] = { ok, problems: bad };
    console.log(`${ok ? "ok  " : "FAIL"} failsafe overlay ${surface}${bad.length ? "\n      " + bad.join("\n      ") : ""}`);
    await page.context().close();
  }

  // Half of all backend calls failing or timing out: degraded, but no surface may crash.
  for (const surface of ["dock", "topbar", "settings", "quicksettings", "launcher", "widgets"]) {
    const page = await openSurface(browser, server.base, { surface, query: "chaos=0.5&seed=7", settle: 3000 });
    const tabs = surface === "settings" ? settingsTabs(page) : null;
    if (tabs) for (let i = 0; i < Math.min(await tabs.count(), 8); i++) await tabs.nth(i).click().catch(() => {});
    await page.waitForTimeout(2500);
    const crashed = (await card(page)) !== null || (await called(page, "failsafe_ui_crash")) > 0;
    const blank = await page.evaluate(() => (document.getElementById("root")?.innerHTML.length ?? 0) === 0);
    const state = await page.evaluate(() => ({ failed: window.__lensChaos.failed.length, timedOut: window.__lensChaos.timedOut.length }));
    const ok = !crashed && !blank;
    if (!ok) failures++;
    report.failsafe[`ipc-storm:${surface}`] = { ok, crashed, blank, ...state };
    console.log(`${ok ? "ok  " : "FAIL"} failsafe ipc-storm ${surface}: ${state.failed} failed + ${state.timedOut} timed out${crashed ? " · the surface crashed" : ""}${blank ? " · blank" : ""}`);
    await page.context().close();
  }
}

await browser.close();
server.close();
writeFileSync(join(outDir, "report.json"), JSON.stringify(report, null, 2));
console.log(`[soak] ${failures ? failures + " failure(s)" : "all clean"}`);
process.exit(failures ? 1 : 0);
