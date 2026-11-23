// Real-Windows end-to-end tests (docs/TESTING.md › End-to-end). Starts the built Lens UI app and
// drives its WebView2 windows over the Chrome DevTools Protocol with Playwright.
//
// Why CDP and not tauri-driver/msedgedriver: wry passes its own AdditionalBrowserArguments to
// WebView2, which replace WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS, so msedgedriver can never open its
// debugging port ("DevToolsActivePort file doesn't exist" on CI). The test build instead bakes a
// fixed port into every window (tests/e2e/tauri-config.mjs) and Playwright attaches to it.
//
// Run on Windows:
//   node tests/e2e/tauri-config.mjs
//   bun run tauri build --debug --no-bundle --config tests/e2e/out/tauri.e2e.json
//   npm i --no-save playwright@1.63.0
//   pwsh tools/e2e/probe.ps1 snapshot tests/e2e/out/before.json
//   node tests/e2e/run.mjs                     # PR set; E2E_ONLY=palette,theme-switch for a subset
//   E2E_RESTARTS=10 node tests/e2e/run.mjs     # nightly: + start → quit → start loop
//   pwsh tools/e2e/probe.ps1 compare tests/e2e/out/before.json
//
// Env: LENS_EXE (default src-tauri/target/debug/lens-ui.exe), E2E_CDP_PORT (9222).
//
// Each Lens surface is its own WebView2 window (a CDP page). Scenarios find a window by its
// `surface` URL parameter and call backend commands the way the UI does, through
// window.__TAURI_INTERNALS__.invoke.
import { mkdirSync, writeFileSync } from "node:fs";
import { execFileSync, spawn } from "node:child_process";
import { join, resolve } from "node:path";
import { chromium } from "playwright";

const root = resolve(import.meta.dirname, "../..");
const outDir = join(root, "tests/e2e/out");
mkdirSync(outDir, { recursive: true });
const EXE = resolve(process.env.LENS_EXE || join(root, "src-tauri/target/debug/lens-ui.exe"));
const PORT = Number(process.env.E2E_CDP_PORT || 9222);
const ONLY = (process.env.E2E_ONLY || "").split(",").filter(Boolean);
const RESTARTS = Number(process.env.E2E_RESTARTS || 0);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** A running Lens with Playwright attached: { proc, browser, logs }. */
async function startLens(timeoutMs = 60000) {
  const logs = [];
  const proc = spawn(EXE, [], { stdio: ["ignore", "pipe", "pipe"], windowsHide: false });
  proc.stdout.on("data", (b) => logs.push(String(b)));
  proc.stderr.on("data", (b) => logs.push(String(b)));
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (proc.exitCode !== null) throw new Error(`lens-ui exited with ${proc.exitCode} before its webviews came up:\n${logs.join("").slice(-2000)}`);
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (r.ok) break;
    } catch {}
    await sleep(500);
  }
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`, { timeout: 30000 });
  return { proc, browser, logs };
}

function pages(s) {
  return s.browser.contexts().flatMap((c) => c.pages());
}

/** Map of surface name → page for every Lens webview currently open. */
function surfaces(s) {
  const map = {};
  for (const p of pages(s)) {
    try {
      // Only real Lens surfaces: every window loads index.html?surface=<name>. Anything else
      // (about:blank while a window is being built, DevTools targets) is skipped.
      const surface = new URL(p.url()).searchParams.get("surface");
      if (surface && !p.isClosed()) map[surface] = p;
    } catch {}
  }
  return map;
}

async function waitForSurface(s, name, ms = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const p = surfaces(s)[name];
    if (p) {
      await p.waitForFunction(() => (document.getElementById("root")?.innerHTML.length || 0) > 0, null, { timeout: 15000 });
      return p;
    }
    await sleep(400);
  }
  throw new Error(`no "${name}" window after ${ms} ms (have: ${Object.keys(surfaces(s)).join(", ")})`);
}

/** Shows a surface through the same command the Dock and hotkeys use, and waits until it settles
 * (lazy windows load, then may reload once while the surface wires itself up). */
async function showSurface(s, name) {
  await invoke(surfaces(s).dock, "open_surface", { label: name });
  let p = await waitForSurface(s, name);
  await p.waitForLoadState("load").catch(() => {});
  await sleep(1200);
  p = await waitForSurface(s, name);
  return p;
}

/** Clicks through the DOM, so a window that is still gliding in (or hidden) doesn't matter. */
const domClick = (locator) => locator.evaluate((el) => el.click());

/** Calls a Tauri command from a window, like the UI does. */
async function invoke(page, cmd, args = {}) {
  const r = await page.evaluate(
    ([cmd, args]) => window.__TAURI_INTERNALS__.invoke(cmd, args).then((v) => ({ ok: true, v }), (e) => ({ ok: false, e: String(e) })),
    [cmd, args]
  );
  if (!r.ok) throw new Error(`${cmd} failed: ${r.e}`);
  return r.v;
}

/** Collects errors from a page from now on; returns a function that drains them. */
function watchErrors(page) {
  const errs = [];
  page.on("pageerror", (e) => errs.push(`error: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errs.push(`console: ${m.text().slice(0, 300)}`); });
  return () => errs.splice(0);
}

async function shot(page, name) {
  try {
    await page.screenshot({ path: join(outDir, `${name}.png`), timeout: 5000 });
  } catch {}
}

async function updateConfig(page, mutate) {
  const cfg = await invoke(page, "get_config");
  mutate(cfg);
  await invoke(page, "save_config_cmd", { newConfig: cfg });
  return cfg;
}

function lensProcessCount() {
  try {
    const out = execFileSync("powershell", ["-NoProfile", "-Command", "(Get-Process lens-ui -ErrorAction SilentlyContinue | Measure-Object).Count"], { encoding: "utf8" });
    return Number(out.trim()) || 0;
  } catch {
    return -1;
  }
}

async function quitLens(s) {
  const m = surfaces(s);
  const p = m.dock || Object.values(m)[0];
  // quit_lens tears the app down; the reply may never arrive.
  if (p) await p.evaluate(() => { window.__TAURI_INTERNALS__.invoke("quit_lens").catch(() => {}); }).catch(() => {});
  for (let i = 0; i < 40 && lensProcessCount() > 0; i++) await sleep(500);
  await s.browser.close().catch(() => {});
}

// ------------------------------------------------------------------------------------------------
// Scenarios
// ------------------------------------------------------------------------------------------------

const SKIP_THEME = ["wallpaper", "cursorfx", "focusdim", "bubble", "edgeshelf"];

const SCENARIOS = [
  {
    id: "startup",
    title: "app starts; the Dock and Top Bar windows exist and render",
    async run(s) {
      const dock = await waitForSurface(s, "dock", 40000);
      await shot(dock, "startup-dock");
      const cfg = await invoke(dock, "get_config");
      if (cfg.dock?.showTopBar !== false && cfg.topBar?.enabled !== false) await shot(await waitForSurface(s, "topbar"), "startup-topbar");
    },
  },
  {
    id: "control-center",
    title: "Control Center opens and every tab renders without errors",
    async run(s) {
      const cc = await showSurface(s, "settings");
      const take = watchErrors(cc);
      // The first-run wizard has its own scenario.
      if (await cc.locator(".wiz").count()) await cc.locator(".wiz").press("Escape").catch(() => {});
      await sleep(400);
      const tabs = cc.locator(".cc-nav-btn").filter({ hasNotText: /Setup Wizard|Quit Lens/ });
      const n = await tabs.count();
      if (n < 5) throw new Error(`only ${n} Control Center tabs found`);
      const problems = [];
      const reloads = [];
      for (let i = 0; i < n; i++) {
        let page = surfaces(s).settings;
        let name = "";
        // A tab may reload its window (e.g. applying UI scale); finish the check on the reloaded
        // page and report which tab did it.
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const tab = page.locator(".cc-nav-btn").filter({ hasNotText: /Setup Wizard|Quit Lens/ }).nth(i);
            name = (await tab.innerText()).trim();
            await domClick(tab);
            await sleep(600);
            const len = await page.evaluate(() => document.querySelector(".cc-content")?.innerText.trim().length || 0);
            if (!len) problems.push(`tab "${name}" rendered nothing`);
            break;
          } catch (e) {
            if (!/context was destroyed|navigation|Target closed/i.test(String(e))) throw e;
            reloads.push(name || `#${i}`);
            await sleep(1500);
            page = await waitForSurface(s, "settings");
          }
        }
        for (const e of take()) problems.push(`tab "${name}": ${e}`);
        await shot(page, `cc-${name.replace(/[^A-Za-z]+/g, "-").toLowerCase()}`);
      }
      if (reloads.length) console.log(`note  Control Center reloaded while opening: ${reloads.join(", ")}`);
      if (problems.length) throw new Error(problems.join("\n"));
    },
  },
  {
    id: "theme-switch",
    title: "a theme switch reaches every open surface",
    async run(s) {
      const read = async () => {
        const out = {};
        for (const [name, p] of Object.entries(surfaces(s))) {
          if (SKIP_THEME.includes(name)) continue;
          out[name] = await p.evaluate(() => (document.documentElement.dataset.scheme || "") + "|" + getComputedStyle(document.documentElement).getPropertyValue("--lens-pack-base").trim());
        }
        return out;
      };
      const dock = surfaces(s).dock;
      const before = await read();
      const prev = (await invoke(dock, "get_config")).theme.preset;
      const target = prev === "alabaster-daylight" ? "obsidian" : "alabaster-daylight";
      await updateConfig(dock, (c) => { c.theme.preset = target; });
      await sleep(1500);
      const after = await read();
      await shot(dock, "theme-after-dock");
      await updateConfig(dock, (c) => { c.theme.preset = prev; });
      const stale = Object.keys(after).filter((k) => after[k] === before[k]);
      if (stale.length) throw new Error(`surfaces kept the old theme: ${stale.join(", ")} (${JSON.stringify(after)})`);
      if (new Set(Object.values(after)).size > 1) throw new Error(`surfaces disagree on the theme tokens: ${JSON.stringify(after)}`);
    },
  },
  {
    id: "dock-style",
    title: "switching the Dock style re-renders the Dock",
    async run(s) {
      const dock = surfaces(s).dock;
      const prev = (await invoke(dock, "get_config")).dock.style || "floating";
      for (const style of ["taskbar", "slim", "split", "floating"]) {
        await updateConfig(dock, (c) => { c.dock.style = style; });
        await dock.waitForSelector(`.dock-stage.dock-style-${style}`, { timeout: 5000 });
        await shot(dock, `dock-style-${style}`);
      }
      await updateConfig(dock, (c) => { c.dock.style = prev; });
    },
  },
  {
    id: "palette",
    title: "the palette opens and finds results",
    async run(s) {
      const pal = await showSurface(s, "palette");
      // The palette has no input of its own: its search field lives in the Top Bar / Dock, which
      // send each keystroke as a lens://palette-query event. Send it the same way.
      for (const q of ["n", "no", "note", "notepad"]) {
        await surfaces(s).dock.evaluate((q) => window.__TAURI_INTERNALS__.invoke("plugin:event|emit", { event: "lens://palette-query", payload: q }), q);
        await sleep(120);
      }
      await pal.waitForSelector(".pal-result-row", { timeout: 8000 }).catch(async () => {
        throw new Error(`no palette results for "notepad"; palette shows: ${(await pal.evaluate(() => document.getElementById("root").innerText)).slice(0, 400)}`);
      });
      await shot(pal, "palette-results");
      await pal.keyboard.press("Escape");
    },
  },
  {
    id: "lens-command",
    title: "Lens Command opens and the offline engine runs \"dark mode\"",
    async run(s) {
      const dock = surfaces(s).dock;
      // Lens Command on, Lens Intelligence OFF: "dark mode" must still run through the offline
      // intent engine (ai_intent → ai_run_intent), which needs no model.
      await updateConfig(dock, (c) => {
        c.command = { ...(c.command || {}), enabled: true };
        c.ai = { ...(c.ai || {}), enabled: false, allowTools: true };
      });
      await sleep(800);
      await invoke(dock, "show_command_cmd", { payload: { layout: "full", mode: "do", text: "dark mode" } });
      const cmd = await waitForSurface(s, "command");
      const take = watchErrors(cmd);
      const box = cmd.locator("textarea").first();
      // Ready handshake (docs/brain/BUGS.md B-12): the page asks the backend for the open it
      // still has to apply once its listeners are registered, applies it once (the open carries
      // a seq) and confirms it. One open, one Enter, no retry.
      await cmd.waitForFunction(() => document.querySelector("textarea")?.value === "dark mode", null, { timeout: 8000 }).catch(async () => {
        throw new Error(`the opening text never reached Command; input is "${await box.inputValue()}"; link: ${JSON.stringify(await invoke(dock, "command_link_status_cmd").catch((e) => String(e)))}`);
      });
      await box.press("Enter");
      const ok = await cmd
        .waitForFunction(() => /dark mode/i.test(document.getElementById("root").innerText) && document.querySelectorAll("[class*=card], [class*=thread] > *").length > 0, null, { timeout: 8000 })
        .then(() => true, () => false);
      if (!ok) {
        const link = await invoke(dock, "command_link_status_cmd").catch((e) => String(e));
        const page = await cmd.evaluate(() => ({
          input: document.querySelector("textarea")?.value,
          mode: document.querySelector(".cmd-mode")?.textContent,
          ready: document.documentElement.dataset.commandReady,
          open: document.documentElement.dataset.commandOpen,
          visible: document.visibilityState,
          focused: document.hasFocus(),
          text: document.getElementById("root").innerText.slice(0, 600),
        }));
        throw new Error(`no answer or action card for "dark mode"; link ${JSON.stringify(link)}; page ${JSON.stringify(page)}`);
      }
      await shot(cmd, "command-dark-mode");
      const errs = take();
      if (errs.length) throw new Error(errs.join("\n"));
    },
  },
  {
    id: "setup-wizard",
    title: "the setup wizard can be skipped and completed",
    async run(s) {
      const cc = await showSurface(s, "settings");
      const open = async () => {
        if (!(await cc.locator(".wiz").count())) await domClick(cc.locator(".cc-nav-btn", { hasText: "Setup Wizard" }));
        await cc.waitForSelector(".wiz[role=dialog]", { timeout: 5000 });
      };
      await open();
      await cc.locator(".wiz").press("Escape");
      await cc.waitForSelector(".wiz", { state: "detached", timeout: 5000 }).catch(() => { throw new Error("Escape did not close the wizard"); });
      await open();
      for (let i = 0; i < 8 && (await cc.locator(".wiz").count()); i++) {
        await domClick(cc.locator("[data-wiz-next]"));
        await sleep(500);
        await shot(cc, `wizard-step-${i + 1}`);
      }
      if (await cc.locator(".wiz").count()) throw new Error("the wizard never finished");
      if ((await invoke(cc, "get_config")).onboardingCompleted !== true) throw new Error("finishing the wizard did not set onboardingCompleted");
    },
  },
  {
    id: "quit-clean",
    title: "quitting leaves no Lens process behind",
    async run(s) {
      await quitLens(s);
      const n = lensProcessCount();
      if (n !== 0) throw new Error(`${n} lens-ui process(es) still running after quit`);
    },
  },
];

const results = [];
async function runScenario(sc, s) {
  if (ONLY.length && !ONLY.includes(sc.id) && sc.id !== "quit-clean") return;
  const t0 = Date.now();
  try {
    await sc.run(s);
    results.push({ id: sc.id, title: sc.title, status: "pass", ms: Date.now() - t0 });
    console.log(`pass  ${sc.id} (${Date.now() - t0} ms)`);
  } catch (e) {
    results.push({ id: sc.id, title: sc.title, status: "fail", ms: Date.now() - t0, error: String(e.stack || e).slice(0, 2000) });
    console.log(`FAIL  ${sc.id}: ${String(e.message || e).slice(0, 1500)}`);
    for (const p of pages(s)) await shot(p, `fail-${sc.id}-${new URL(p.url()).searchParams.get("surface") || "page"}`);
  }
}

let session;
try {
  session = await startLens();
  for (const sc of SCENARIOS) await runScenario(sc, session);
} catch (e) {
  results.push({ id: "session", status: "fail", error: String(e.stack || e) });
  console.log(`FAIL  session: ${e.message}`);
} finally {
  if (session) writeFileSync(join(outDir, "lens-ui.log"), session.logs.join(""));
  if (lensProcessCount() > 0 && session) await quitLens(session).catch(() => {});
  if (lensProcessCount() > 0) {
    // Nothing to quit through: force it, and tell the probe Lens never got to restore Windows.
    try { execFileSync("taskkill", ["/IM", "lens-ui.exe", "/T", "/F"]); } catch {}
    writeFileSync(join(outDir, "forced-kill.txt"), "lens-ui had to be force-killed; Windows state could not be restored by Lens itself\n");
    console.log("note  lens-ui force-killed (could not quit it normally)");
  }
}

// Nightly: start → quit → start again without leaking processes.
if (RESTARTS > 0 && (!ONLY.length || ONLY.includes("restart-loop"))) {
  const t0 = Date.now();
  const leaks = [];
  const webviews = () => {
    try {
      return Number(execFileSync("powershell", ["-NoProfile", "-Command", "(Get-Process msedgewebview2 -ErrorAction SilentlyContinue | Measure-Object).Count"], { encoding: "utf8" }).trim()) || 0;
    } catch { return -1; }
  };
  const baseWebviews = webviews();
  for (let i = 0; i < RESTARTS; i++) {
    let s;
    try {
      s = await startLens();
      await waitForSurface(s, "dock", 40000);
      await quitLens(s);
      const n = lensProcessCount();
      if (n !== 0) leaks.push(`run ${i + 1}: ${n} lens-ui left running`);
    } catch (e) {
      leaks.push(`run ${i + 1}: ${e.message}`);
      if (s) await s.browser.close().catch(() => {});
      try { execFileSync("taskkill", ["/IM", "lens-ui.exe", "/T", "/F"]); } catch {}
    }
  }
  await sleep(3000);
  const extra = webviews() - baseWebviews;
  if (extra > 2) leaks.push(`${extra} more msedgewebview2 processes than before the loop`);
  results.push({ id: "restart-loop", title: `start → quit × ${RESTARTS}`, status: leaks.length ? "fail" : "pass", ms: Date.now() - t0, error: leaks.join("\n") || undefined });
  console.log(`${leaks.length ? "FAIL" : "pass"}  restart-loop × ${RESTARTS}${leaks.length ? "\n      " + leaks.join("\n      ") : ""}`);
}

writeFileSync(join(outDir, "report.json"), JSON.stringify(results, null, 2));
const failed = results.filter((r) => r.status === "fail");
console.log(`[e2e] ${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
