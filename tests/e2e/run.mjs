// Real-Windows end-to-end tests (docs/TESTING.md › End-to-end). Drives the built Lens UI app through
// tauri-driver + msedgedriver (WebDriver on WebView2) with selenium-webdriver.
//
// Run on Windows after `bun run tauri build --debug --no-bundle`:
//   tauri-driver --native-driver <msedgedriver.exe>      (separate terminal, port 4444)
//   pwsh tools/e2e/probe.ps1 snapshot tests/e2e/out/before.json
//   node tests/e2e/run.mjs                     # PR set
//   E2E_RESTARTS=10 node tests/e2e/run.mjs     # nightly: + start → quit → start loop
//   pwsh tools/e2e/probe.ps1 compare tests/e2e/out/before.json
//
// Env: LENS_EXE (default src-tauri/target/debug/lens-ui.exe), E2E_DRIVER_URL (default
// http://127.0.0.1:4444), E2E_ONLY (comma list of scenario ids).
//
// Each Lens surface is its own WebView2 window. Scenarios find a window by the `surface` URL
// parameter, so they don't depend on window order or titles. Backend commands are called the way
// the UI calls them, through window.__TAURI_INTERNALS__.invoke.
import { mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { Builder, By, Capabilities, until } from "selenium-webdriver";

const root = resolve(import.meta.dirname, "../..");
const outDir = join(root, "tests/e2e/out");
mkdirSync(outDir, { recursive: true });
const EXE = resolve(process.env.LENS_EXE || join(root, "src-tauri/target/debug/lens-ui.exe"));
const DRIVER = process.env.E2E_DRIVER_URL || "http://127.0.0.1:4444";
const ONLY = (process.env.E2E_ONLY || "").split(",").filter(Boolean);
const RESTARTS = Number(process.env.E2E_RESTARTS || 0);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function startSession() {
  const caps = new Capabilities();
  caps.set("browserName", "wry");
  caps.set("tauri:options", { application: EXE });
  return new Builder().withCapabilities(caps).usingServer(DRIVER).build();
}

/** Calls a Tauri command from the current window, like the UI does. */
async function invoke(d, cmd, args = {}) {
  return d.executeAsyncScript(
    `const [cmd, args, done] = arguments;
     window.__TAURI_INTERNALS__.invoke(cmd, args)
       .then((v) => done({ ok: true, v }))
       .catch((e) => done({ ok: false, e: String(e) }));`,
    cmd,
    args
  ).then((r) => {
    if (!r.ok) throw new Error(`${cmd} failed: ${r.e}`);
    return r.v;
  });
}

/** Map of surface name → window handle for every Lens webview currently open. */
async function surfaces(d) {
  const map = {};
  const current = await d.getWindowHandle().catch(() => null);
  for (const h of await d.getAllWindowHandles()) {
    try {
      await d.switchTo().window(h);
      const s = await d.executeScript("return new URLSearchParams(location.search).get('surface') || 'dock'");
      map[s] = h;
    } catch {}
  }
  if (current) await d.switchTo().window(current).catch(() => {});
  return map;
}

async function waitForSurface(d, name, ms = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const m = await surfaces(d);
    if (m[name]) {
      await d.switchTo().window(m[name]);
      await d.wait(async () => (await d.executeScript("return document.getElementById('root')?.innerHTML.length || 0")) > 0, 15000);
      return m[name];
    }
    await sleep(500);
  }
  throw new Error(`no "${name}" window after ${ms} ms (have: ${Object.keys(await surfaces(d)).join(", ")})`);
}

/** Installs an error collector in the current window (errors after this point are captured). */
async function watchErrors(d) {
  await d.executeScript(`
    if (!window.__e2e) {
      window.__e2e = [];
      window.addEventListener('error', (e) => window.__e2e.push('error: ' + e.message));
      window.addEventListener('unhandledrejection', (e) => window.__e2e.push('rejection: ' + String(e.reason)));
      const ce = console.error.bind(console);
      console.error = (...a) => { window.__e2e.push('console: ' + a.map(String).join(' ').slice(0, 300)); ce(...a); };
    }`);
}
const takeErrors = (d) => d.executeScript("const e = window.__e2e || []; window.__e2e = []; return e;");

async function shot(d, name) {
  try {
    writeFileSync(join(outDir, `${name}.png`), await d.takeScreenshot(), "base64");
  } catch {}
}

async function updateConfig(d, mutate) {
  const cfg = await invoke(d, "get_config");
  mutate(cfg);
  await invoke(d, "save_config_cmd", { newConfig: cfg });
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

async function quitLens(d) {
  const m = await surfaces(d);
  await d.switchTo().window(m.dock || Object.values(m)[0]);
  // quit_lens tears the app down; the reply may never arrive.
  await d.executeScript("window.__TAURI_INTERNALS__.invoke('quit_lens').catch(() => {})").catch(() => {});
  for (let i = 0; i < 40 && lensProcessCount() > 0; i++) await sleep(500);
  await d.quit().catch(() => {});
}

// ------------------------------------------------------------------------------------------------
// Scenarios
// ------------------------------------------------------------------------------------------------

const SCENARIOS = [
  {
    id: "startup",
    title: "app starts; the Dock and Top Bar windows exist and render",
    async run(d) {
      await waitForSurface(d, "dock", 40000);
      await shot(d, "startup-dock");
      const cfg = await invoke(d, "get_config");
      if (cfg.dock?.showTopBar !== false && cfg.topBar?.enabled !== false) {
        await waitForSurface(d, "topbar");
        await shot(d, "startup-topbar");
      }
    },
  },
  {
    id: "control-center",
    title: "Control Center opens and every tab renders without errors",
    async run(d) {
      await d.switchTo().window((await surfaces(d)).dock);
      await invoke(d, "toggle_surface", { label: "settings" });
      await waitForSurface(d, "settings");
      await watchErrors(d);
      // Close the first-run wizard if it is up; it has its own scenario.
      await d.executeScript("document.querySelector('.wiz')?.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}))");
      await sleep(400);
      const tabs = await d.findElements(By.css(".cc-nav-btn"));
      const names = [];
      for (const t of tabs) names.push((await t.getText()).trim());
      const problems = [];
      for (let i = 0; i < names.length; i++) {
        if (/Setup Wizard|Quit Lens/.test(names[i])) continue;
        const t = (await d.findElements(By.css(".cc-nav-btn")))[i];
        await t.click();
        await sleep(600);
        const len = await d.executeScript("return document.querySelector('.cc-content')?.innerText.trim().length || 0");
        if (!len) problems.push(`tab "${names[i]}" rendered nothing`);
        for (const e of await takeErrors(d)) problems.push(`tab "${names[i]}": ${e}`);
        await shot(d, `cc-${names[i].replace(/[^A-Za-z]+/g, "-").toLowerCase()}`);
      }
      if (problems.length) throw new Error(problems.join("\n"));
    },
  },
  {
    id: "theme-switch",
    title: "a theme switch reaches every open surface",
    async run(d) {
      const m = await surfaces(d);
      await d.switchTo().window(m.dock);
      const read = async () => {
        const out = {};
        for (const [name, h] of Object.entries(await surfaces(d))) {
          await d.switchTo().window(h);
          out[name] = await d.executeScript("const r = document.documentElement; return (r.dataset.scheme || '') + '|' + getComputedStyle(r).getPropertyValue('--lens-pack-base').trim()");
        }
        return out;
      };
      const before = await read();
      await d.switchTo().window(m.dock);
      const prev = (await invoke(d, "get_config")).theme.preset;
      const target = prev === "alabaster-daylight" ? "obsidian" : "alabaster-daylight";
      await updateConfig(d, (c) => { c.theme.preset = target; });
      await sleep(1500);
      const after = await read();
      const stale = Object.keys(after).filter((k) => after[k] === before[k] && !["wallpaper", "cursorfx", "focusdim", "bubble", "edgeshelf"].includes(k));
      await shot(d, "theme-after");
      await d.switchTo().window(m.dock);
      await updateConfig(d, (c) => { c.theme.preset = prev; });
      if (stale.length) throw new Error(`surfaces kept the old theme: ${stale.join(", ")} (${JSON.stringify(after)})`);
      const values = new Set(Object.entries(after).filter(([k]) => !["wallpaper", "cursorfx"].includes(k)).map(([, v]) => v));
      if (values.size > 1) throw new Error(`surfaces disagree on the theme tokens: ${JSON.stringify(after)}`);
    },
  },
  {
    id: "dock-style",
    title: "switching the Dock style re-renders the Dock",
    async run(d) {
      const h = (await surfaces(d)).dock;
      await d.switchTo().window(h);
      const prev = (await invoke(d, "get_config")).dock.style || "floating";
      for (const style of ["taskbar", "slim", "split", "floating"]) {
        await updateConfig(d, (c) => { c.dock.style = style; });
        await d.wait(async () => d.executeScript(`return !!document.querySelector('.dock-stage.dock-style-${style}')`), 5000, `Dock never showed style ${style}`);
        await shot(d, `dock-style-${style}`);
      }
      await updateConfig(d, (c) => { c.dock.style = prev; });
    },
  },
  {
    id: "palette",
    title: "the palette opens and finds results",
    async run(d) {
      await d.switchTo().window((await surfaces(d)).dock);
      await invoke(d, "toggle_surface", { label: "palette" });
      await waitForSurface(d, "palette");
      const input = await d.wait(until.elementLocated(By.css("input")), 5000);
      await input.sendKeys("notepad");
      await d.wait(async () => (await d.findElements(By.css(".pal-result-row"))).length > 0, 8000, "no palette results for 'notepad'");
      await shot(d, "palette-results");
      await input.sendKeys(""); // Escape
    },
  },
  {
    id: "lens-command",
    title: "Lens Command opens and the offline engine runs \"dark mode\"",
    async run(d) {
      await d.switchTo().window((await surfaces(d)).dock);
      await updateConfig(d, (c) => { c.command = { ...(c.command || {}), enabled: true }; });
      await sleep(800);
      await invoke(d, "show_command_cmd", { payload: { layout: "full", mode: "do" } });
      await waitForSurface(d, "command");
      await watchErrors(d);
      const box = await d.wait(until.elementLocated(By.css("textarea")), 5000);
      await box.sendKeys("dark mode");
      await box.sendKeys(""); // Enter
      await d.wait(
        async () => /dark mode/i.test(await d.executeScript("return document.getElementById('root').innerText")) &&
          (await d.executeScript("return document.querySelectorAll('[class*=card], [class*=thread] > *').length")) > 0,
        10000,
        "no answer or action card for \"dark mode\""
      );
      await shot(d, "command-dark-mode");
      const errs = await takeErrors(d);
      if (errs.length) throw new Error(errs.join("\n"));
    },
  },
  {
    id: "setup-wizard",
    title: "the setup wizard can be skipped and completed",
    async run(d) {
      await d.switchTo().window((await surfaces(d)).dock);
      await invoke(d, "toggle_surface", { label: "settings" }).catch(() => {});
      await waitForSurface(d, "settings");
      const open = async () => {
        for (const b of await d.findElements(By.css(".cc-nav-btn"))) if (/Setup Wizard/.test(await b.getText())) { await b.click(); break; }
        return d.wait(until.elementLocated(By.css(".wiz[role=dialog]")), 5000);
      };
      // Skip: Escape leaves without finishing.
      await open();
      await d.findElement(By.css(".wiz")).sendKeys("");
      await d.wait(async () => (await d.findElements(By.css(".wiz"))).length === 0, 5000, "Escape did not close the wizard");
      // Complete: Next through every step.
      await open();
      for (let i = 0; i < 8 && (await d.findElements(By.css(".wiz"))).length; i++) {
        await d.findElement(By.css("[data-wiz-next]")).click();
        await sleep(500);
        await shot(d, `wizard-step-${i + 1}`);
      }
      if ((await d.findElements(By.css(".wiz"))).length) throw new Error("the wizard never finished");
      const cfg = await invoke(d, "get_config");
      if (cfg.onboardingCompleted !== true) throw new Error("finishing the wizard did not set onboardingCompleted");
    },
  },
  {
    id: "quit-clean",
    title: "quitting leaves no Lens process behind",
    last: true,
    async run(d) {
      await quitLens(d);
      const n = lensProcessCount();
      if (n !== 0) throw new Error(`${n} lens-ui process(es) still running after quit`);
    },
  },
];

const results = [];
async function runScenario(s, d) {
  if (ONLY.length && !ONLY.includes(s.id)) return;
  const t0 = Date.now();
  try {
    await s.run(d);
    results.push({ id: s.id, title: s.title, status: "pass", ms: Date.now() - t0 });
    console.log(`pass  ${s.id} (${Date.now() - t0} ms)`);
  } catch (e) {
    results.push({ id: s.id, title: s.title, status: "fail", ms: Date.now() - t0, error: String(e.stack || e).slice(0, 2000) });
    console.log(`FAIL  ${s.id}: ${String(e.message || e).slice(0, 1500)}`);
    await shot(d, `fail-${s.id}`);
  }
}

let driver;
try {
  driver = await startSession();
  for (const s of SCENARIOS) await runScenario(s, driver);
} catch (e) {
  results.push({ id: "session", status: "fail", error: String(e.stack || e) });
  console.log(`FAIL  session: ${e.message}`);
} finally {
  if (lensProcessCount() > 0 && driver) await quitLens(driver).catch(() => {});
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
    let d;
    try {
      d = await startSession();
      await waitForSurface(d, "dock", 40000);
      await quitLens(d);
      const n = lensProcessCount();
      if (n !== 0) leaks.push(`run ${i + 1}: ${n} lens-ui left running`);
    } catch (e) {
      leaks.push(`run ${i + 1}: ${e.message}`);
      if (d) await d.quit().catch(() => {});
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
