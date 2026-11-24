// Failsafe chaos on real Windows (docs/FAILSAFE.md §8). Real app, driven over CDP like run.mjs.
// Each scenario breaks something on purpose and checks that the desktop stays usable:
//
//   config-damaged   config.json with wrong-typed values: only those fall back to defaults, a
//                    copy of the old file is kept, the rest of the settings survive.
//   config-garbage   config.json that is not JSON at all: Lens starts with defaults, keeps a copy.
//   kill-switch      features.json switches a feature off for the run; saving settings does not
//                    rewrite the stored choice.
//   crash-loop       Lens is killed twice before its UI is up; the third start is offered Safe
//                    Mode (answered through LENS_SAFE_MODE_CHOICE): optional features and every
//                    low-level hook stay off, and the stored settings are untouched.
//   crash-loop-quit  the same, answered "quit": Lens exits at once and changes nothing.
//   surface-crash    a window is made to throw while rendering: it reports, reloads itself and
//                    the rest of Lens carries on.
//   webview-killed   every WebView2 renderer of Lens is killed: the Lens process survives, and
//                    the Dock page is reloaded within seconds (WebView2 reports the dead renderer).
//   registry-denied  the HKCU Run key is made read-only, then "start with Windows" is switched
//                    on: the command reports the failure, Lens keeps running.
//
// Lens' own data folder is saved before the first scenario and put back after the last one.
//
// Run on Windows after the E2E build (see run.mjs):  node tests/e2e/failsafe.mjs
// Env: LENS_EXE, E2E_CDP_PORT, FAILSAFE_ONLY=<id,id>, FAILSAFE_RUN=1 (needed outside CI).
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync, spawn } from "node:child_process";
import { join, resolve } from "node:path";
import { chromium } from "playwright";

const root = resolve(import.meta.dirname, "../..");
const outDir = join(root, "tests/e2e/out");
mkdirSync(outDir, { recursive: true });
const EXE = resolve(process.env.LENS_EXE || join(root, "src-tauri/target/debug/lens-ui.exe"));
const PORT = Number(process.env.E2E_CDP_PORT || 9222);
const ONLY = (process.env.FAILSAFE_ONLY || "").split(",").filter(Boolean);
const DATA = join(process.env.APPDATA || "", "LensUI");
const CONFIG = join(DATA, "config.json");
const FEATURES = join(DATA, "features.json");
const BOOT = join(DATA, "boot-guard.json");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------------------------
// Driving the app
// ---------------------------------------------------------------------------------------------

function ps(command) {
  try {
    return execFileSync("powershell", ["-NoProfile", "-Command", command], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

const lensProcessCount = () => Number(ps("(Get-Process lens-ui -ErrorAction SilentlyContinue | Measure-Object).Count")) || 0;

function killLens() {
  try {
    execFileSync("taskkill", ["/IM", "lens-ui.exe", "/T", "/F"], { stdio: "ignore" });
  } catch {}
}

function spawnLens(env = {}) {
  const logs = [];
  const proc = spawn(EXE, [], { stdio: ["ignore", "pipe", "pipe"], windowsHide: false, env: { ...process.env, ...env } });
  proc.stdout.on("data", (b) => logs.push(String(b)));
  proc.stderr.on("data", (b) => logs.push(String(b)));
  return { proc, logs };
}

async function startLens(env = {}, timeoutMs = 60000) {
  const { proc, logs } = spawnLens(env);
  const t0 = Date.now();
  let up = false;
  while (Date.now() - t0 < timeoutMs) {
    if (proc.exitCode !== null) throw new Error(`lens-ui exited with ${proc.exitCode} before its webviews came up:\n${logs.join("").slice(-2000)}`);
    try {
      if ((await fetch(`http://127.0.0.1:${PORT}/json/version`)).ok) {
        up = true;
        break;
      }
    } catch {}
    await sleep(500);
  }
  if (!up) throw new Error(`no DevTools port after ${timeoutMs} ms:\n${logs.join("").slice(-2000)}`);
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`, { timeout: 30000 });
  return { proc, browser, logs };
}

function surfaces(s) {
  const map = {};
  for (const p of s.browser.contexts().flatMap((c) => c.pages())) {
    try {
      const surface = new URL(p.url()).searchParams.get("surface");
      if (surface && !p.isClosed()) map[surface] = p;
    } catch {}
  }
  return map;
}

async function waitForSurface(s, name, ms = 40000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const p = surfaces(s)[name];
    if (p) {
      try {
        await p.waitForFunction(() => !!window.__TAURI_INTERNALS__ && (document.getElementById("root")?.innerHTML.length || 0) > 0, null, { timeout: 5000 });
        return p;
      } catch {}
    }
    await sleep(400);
  }
  throw new Error(`no "${name}" window after ${ms} ms (have: ${Object.keys(surfaces(s)).join(", ")})`);
}

async function invoke(page, cmd, args = {}) {
  const r = await page.evaluate(
    ([cmd, args]) => window.__TAURI_INTERNALS__.invoke(cmd, args).then((v) => ({ ok: true, v }), (e) => ({ ok: false, e: String(e) })),
    [cmd, args]
  );
  if (!r.ok) throw new Error(`${cmd} failed: ${r.e}`);
  return r.v;
}

async function quitLens(s) {
  const m = surfaces(s);
  const p = m.dock || Object.values(m)[0];
  if (p) await p.evaluate(() => { window.__TAURI_INTERNALS__.invoke("quit_lens").catch(() => {}); }).catch(() => {});
  for (let i = 0; i < 40 && lensProcessCount() > 0; i++) await sleep(500);
  await s.browser.close().catch(() => {});
  if (lensProcessCount() > 0) killLens();
}

/** Evaluates `expression` in the page of one surface through its own DevTools socket.
 *  Returns the value, or undefined if the page is not there or does not answer in time. */
async function cdpEval(surface, expression, timeoutMs = 6000) {
  try {
    const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    const target = targets.find((t) => t.type === "page" && t.webSocketDebuggerUrl && String(t.url).includes(`surface=${surface}`));
    if (!target) return undefined;
    return await new Promise((done) => {
      const ws = new WebSocket(target.webSocketDebuggerUrl);
      const finish = (v) => {
        clearTimeout(timer);
        try { ws.close(); } catch {}
        done(v);
      };
      const timer = setTimeout(() => finish(undefined), timeoutMs);
      ws.onopen = () => ws.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression, awaitPromise: true, returnByValue: true } }));
      ws.onmessage = (m) => {
        const msg = JSON.parse(String(m.data));
        if (msg.id === 1) finish(msg.result?.result?.value);
      };
      ws.onerror = () => finish(undefined);
    });
  } catch {
    return undefined;
  }
}

/** The DevTools targets that show the Settings page. */
async function settingsTargets() {
  try {
    const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    return targets.filter((t) => t.type === "page" && t.webSocketDebuggerUrl && String(t.url).includes("surface=settings"));
  } catch {
    return [];
  }
}

/** Like cdpEval, but for one fixed target (its id survives a reload of the page). */
async function cdpEvalTarget(target, expression, timeoutMs = 6000) {
  return new Promise((done) => {
    let ws;
    const finish = (v) => {
      clearTimeout(timer);
      try { ws?.close(); } catch {}
      done(v);
    };
    const timer = setTimeout(() => finish(undefined), timeoutMs);
    try {
      ws = new WebSocket(target.webSocketDebuggerUrl);
    } catch {
      finish(undefined);
      return;
    }
    ws.onopen = () => ws.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression, awaitPromise: true, returnByValue: true } }));
    ws.onmessage = (m) => {
      const msg = JSON.parse(String(m.data));
      if (msg.id === 1) finish(msg.result?.result?.value);
    };
    ws.onerror = () => finish(undefined);
  });
}

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const unreadableCopies = () => (existsSync(DATA) ? readdirSync(DATA).filter((f) => f.startsWith("config.json.unreadable-")) : []);
function expect(problems, ok, what) {
  if (!ok) problems.push(what);
}

/** Starts Lens once with a good config and quits it cleanly, so every scenario begins from a
 *  config Lens wrote itself and a boot record with no unfinished starts. */
async function cleanStart() {
  rmSync(BOOT, { force: true });
  rmSync(FEATURES, { force: true });
  const s = await startLens({ LENS_SAFE_MODE_CHOICE: "normal" });
  await waitForSurface(s, "dock");
  await quitLens(s);
}

// ---------------------------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------------------------

const SCENARIOS = [
  {
    id: "config-damaged",
    title: "wrong-typed values in config.json fall back alone; the rest survives",
    async run(problems) {
      const cfg = readJson(CONFIG);
      const copiesBefore = unreadableCopies().length;
      cfg.theme.customAccent = "#12ab34";
      cfg.theme.borderRadius = "very round";
      cfg.dock = "this used to be an object";
      writeFileSync(CONFIG, JSON.stringify(cfg));
      const s = await startLens({ LENS_SAFE_MODE_CHOICE: "normal" });
      try {
        const dock = await waitForSurface(s, "dock");
        const live = await invoke(dock, "get_config");
        expect(problems, live.dock && typeof live.dock === "object", "the dock section did not fall back to its defaults");
        expect(problems, typeof live.theme.borderRadius === "number", "theme.borderRadius did not fall back to its default");
        expect(problems, live.theme.customAccent === "#12ab34", "an undamaged value in the same section was lost");
        const report = await invoke(dock, "failsafe_status");
        const repairs = report.status.configRepairs;
        expect(problems, repairs.includes("dock"), `the repair list does not name "dock" (${repairs.join(", ")})`);
        expect(problems, repairs.includes("theme.borderRadius"), `the repair list does not name "theme.borderRadius" (${repairs.join(", ")})`);
        expect(problems, unreadableCopies().length === copiesBefore + 1, "no copy of the damaged file was kept");
        expect(problems, typeof readJson(CONFIG).dock === "object", "config.json on disk was not rewritten in a loadable form");
      } finally {
        await quitLens(s);
      }
    },
  },
  {
    id: "config-garbage",
    title: "a config.json that is not JSON starts Lens with defaults and keeps a copy",
    async run(problems) {
      const copiesBefore = unreadableCopies().length;
      writeFileSync(CONFIG, '{{{ "theme": not json at all \u0000\u0001');
      const s = await startLens({ LENS_SAFE_MODE_CHOICE: "normal" });
      try {
        const dock = await waitForSurface(s, "dock");
        const live = await invoke(dock, "get_config");
        expect(problems, !!live.theme && !!live.dock && !!live.func, "Lens did not start with a full default config");
        const report = await invoke(dock, "failsafe_status");
        expect(problems, report.status.configRepairs.length > 0, "the Safety net does not say the settings were reset");
        expect(problems, unreadableCopies().length === copiesBefore + 1, "no copy of the unreadable file was kept");
      } finally {
        await quitLens(s);
      }
    },
  },
  {
    id: "kill-switch",
    title: "features.json holds a feature off without rewriting the stored choice",
    async run(problems) {
      const cfg = readJson(CONFIG);
      cfg.hotCorners.enabled = true;
      writeFileSync(CONFIG, JSON.stringify(cfg));
      writeFileSync(FEATURES, JSON.stringify({ off: ["hotCorners", "no-such-feature"] }));
      const s = await startLens({ LENS_SAFE_MODE_CHOICE: "normal" });
      try {
        const dock = await waitForSurface(s, "dock");
        const live = await invoke(dock, "get_config");
        expect(problems, live.hotCorners.enabled === false, "the switched-off feature is on in the running config");
        const report = await invoke(dock, "failsafe_status");
        expect(problems, report.status.killed.includes("hotCorners"), "the Safety net does not list the kill switch");
        expect(problems, !report.status.killed.includes("no-such-feature"), "an unknown feature id was accepted");
        expect(problems, report.switches.some((x) => x.id === "hotCorners" && x.off), "the switch list does not show it as off");
        // Saving any setting must not write the held-off value over the person's choice.
        live.theme.customAccent = "#0a0b0c";
        await invoke(dock, "save_config_cmd", { newConfig: live });
        await sleep(800);
        const stored = readJson(CONFIG);
        expect(problems, stored.hotCorners.enabled === true, "saving settings rewrote the stored choice of a held-off feature");
        expect(problems, stored.theme.customAccent === "#0a0b0c", "the unrelated setting was not saved");
      } finally {
        await quitLens(s);
        rmSync(FEATURES, { force: true });
      }
    },
  },
  {
    id: "crash-loop",
    title: "two starts killed before the UI is up lead to Safe Mode, hooks off, settings untouched",
    async run(problems) {
      const cfg = readJson(CONFIG);
      cfg.altDrag.enabled = true;
      cfg.func.clipboardHistory = true;
      writeFileSync(CONFIG, JSON.stringify(cfg));
      rmSync(BOOT, { force: true });
      for (let i = 0; i < 2; i++) {
        spawnLens({ LENS_SAFE_MODE_CHOICE: "normal" });
        await sleep(3500); // well inside the 20 s after which a start counts as good
        killLens();
        for (let k = 0; k < 20 && lensProcessCount() > 0; k++) await sleep(300);
      }
      const record = existsSync(BOOT) ? readJson(BOOT) : { starts: [] };
      expect(problems, record.starts.filter((x) => !x.ok).length >= 2, `the boot record does not show two unfinished starts (${JSON.stringify(record)})`);
      const s = await startLens({ LENS_SAFE_MODE_CHOICE: "safe" });
      try {
        const dock = await waitForSurface(s, "dock");
        const report = await invoke(dock, "failsafe_status");
        expect(problems, report.status.safeMode === true, "the third start is not in Safe Mode");
        expect(problems, /did not finish starting/.test(report.status.safeReason), `unexpected Safe Mode reason: ${report.status.safeReason}`);
        const live = await invoke(dock, "get_config");
        expect(problems, live.altDrag.enabled === false && live.func.clipboardHistory === false, "optional features are on in Safe Mode");
        const input = await invoke(dock, "input_status_cmd");
        expect(problems, !input.keyboardHook && !input.mouseHook, "a low-level hook is installed in Safe Mode");
        const stored = readJson(CONFIG);
        expect(problems, stored.altDrag.enabled === true && stored.func.clipboardHistory === true, "Safe Mode rewrote the stored settings");
        // Saving in Safe Mode keeps the stored choices too.
        await invoke(dock, "save_config_cmd", { newConfig: live });
        await sleep(800);
        expect(problems, readJson(CONFIG).altDrag.enabled === true, "saving in Safe Mode switched a feature off for good");
      } finally {
        await quitLens(s);
      }
      // The next start is normal again and is not asked anything.
      const s2 = await startLens({ LENS_SAFE_MODE_CHOICE: "quit" });
      try {
        const dock = await waitForSurface(s2, "dock");
        const report = await invoke(dock, "failsafe_status");
        expect(problems, report.status.safeMode === false, "Safe Mode did not end with the restart");
        const live = await invoke(dock, "get_config");
        live.altDrag.enabled = false;
        live.func.clipboardHistory = false;
        await invoke(dock, "save_config_cmd", { newConfig: live });
      } finally {
        await quitLens(s2);
      }
    },
  },
  {
    id: "crash-loop-quit",
    title: "answering the Safe Mode question with Quit exits at once and counts as no failure",
    async run(problems) {
      rmSync(BOOT, { force: true });
      for (let i = 0; i < 2; i++) {
        spawnLens({ LENS_SAFE_MODE_CHOICE: "normal" });
        await sleep(3500);
        killLens();
        for (let k = 0; k < 20 && lensProcessCount() > 0; k++) await sleep(300);
      }
      const { proc } = spawnLens({ LENS_SAFE_MODE_CHOICE: "quit" });
      let code = null;
      for (let i = 0; i < 40 && code === null; i++) {
        await sleep(500);
        code = proc.exitCode;
      }
      expect(problems, code === 0, `Lens did not exit cleanly after "quit" (exit code ${code})`);
      // Explorer was opened on the crash reports folder; close that window again.
      ps("(New-Object -ComObject Shell.Application).Windows() | Where-Object { $_.LocationURL -like '*LensUI/crashes*' } | ForEach-Object { $_.Quit() }");
      const record = existsSync(BOOT) ? readJson(BOOT) : { starts: [] };
      expect(problems, record.starts.length > 0 && record.starts[record.starts.length - 1].ok === true, "the start that was declined is recorded as a failure");
      killLens();
      rmSync(BOOT, { force: true });
    },
  },
  {
    id: "surface-crash",
    title: "a window that throws while rendering reports, reloads itself, and Lens carries on",
    async run(problems) {
      const s = await startLens({ LENS_SAFE_MODE_CHOICE: "normal" });
      try {
        const dock = await waitForSurface(s, "dock");
        await invoke(dock, "open_surface", { label: "settings" });
        let settings = await waitForSurface(s, "settings");
        await sleep(1500);
        settings = await waitForSurface(s, "settings");
        // Everything below talks to one DevTools target (the Settings window's page), fixed before
        // the crash, so a second page with the same URL can never be read by mistake (B-31: the
        // earlier versions of this check could not tell which page they were reading).
        const targets = await settingsTargets();
        expect(problems, targets.length === 1, `expected one Settings page, found ${targets.length}`);
        const target = targets[0];
        await cdpEvalTarget(target, "window.__beforeCrash = true; window.dispatchEvent(new Event('lens:test-crash')); true");
        let reloaded = false;
        for (const t0 = Date.now(); Date.now() - t0 < 8000 && !reloaded; await sleep(100)) {
          const marker = await cdpEvalTarget(target, "!!window.__beforeCrash && (document.getElementById('root') ? 1 : 0)", 1500);
          if (marker === false) reloaded = true;
        }
        expect(problems, reloaded, "the crashed window did not reload itself within 8 s");
        // The boundary records the notice when it is on screen (sessionStorage survives the reload).
        const notice = await cdpEvalTarget(target, "sessionStorage.getItem('lens.failsafe.settings.notice') || ''");
        expect(problems, /Reloading/.test(String(notice)), `the crashed window never showed "Reloading…" (recorded: ${JSON.stringify(notice)})`);
        settings = await waitForSurface(s, "settings");
        const back = await settings.evaluate(() => !document.querySelector(".fs-problem") && (document.getElementById("root")?.innerHTML.length || 0) > 0);
        expect(problems, back, "the window did not come back after its automatic reload");
        const log = await invoke(dock, "tester_log_get", { after: null, limit: 500 }).catch(() => []);
        expect(problems, log.some((l) => l.area === "ui-crash"), "the crash is not in the session log");
        // The Dock never noticed.
        expect(problems, (await invoke(dock, "get_config")).theme !== undefined, "the Dock stopped answering after another window crashed");
      } finally {
        await quitLens(s);
      }
    },
  },
  {
    id: "webview-killed",
    title: "killing every WebView2 renderer leaves Lens running and the Dock page is reloaded",
    async run(problems) {
      const s = await startLens({ LENS_SAFE_MODE_CHOICE: "normal", LENS_ALIVE_STALE_SECS: "12" });
      try {
        await waitForSurface(s, "dock");
        await sleep(6000); // at least one heartbeat, and the renderer watchdog is registered
        await s.browser.close().catch(() => {});
        const killed = ps(
          "$n = 0; Get-CimInstance Win32_Process -Filter \"Name='msedgewebview2.exe'\" | Where-Object { $_.CommandLine -match '--type=renderer' -and $_.CommandLine -match 'lens-ui' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue; $n++ }; $n"
        );
        expect(problems, Number(killed) > 0, "found no Lens WebView2 renderer to kill");
        await sleep(2000);
        expect(problems, lensProcessCount() > 0, "Lens went down with its WebView renderers");
        // WebView2 reports the dead renderer (ProcessFailed) and the load guard reloads the Dock
        // within about a second of noticing; the heartbeat (12 s here) is only the backstop. The
        // page is polled every second until it is back. Playwright cannot follow targets through a
        // renderer crash, so the page is asked directly over its DevTools socket (cdpEval).
        let revived = false;
        const t0 = Date.now();
        while (Date.now() - t0 < 90000 && !revived) {
          await sleep(1000);
          const alive = await cdpEval("dock", "!!window.__TAURI_INTERNALS__ && (document.getElementById('root')?.innerHTML.length || 0) > 0");
          if (alive !== true) continue;
          const hasDock = await cdpEval("dock", "window.__TAURI_INTERNALS__.invoke('get_config').then((c) => !!c && !!c.dock)");
          expect(problems, hasDock === true, "the reloaded Dock page cannot reach the backend");
          const logged = await cdpEval("dock", "window.__TAURI_INTERNALS__.invoke('tester_log_get', { after: null, limit: 500 }).then((l) => l.some((x) => x.area === 'loadguard' && /stopped answering/.test(x.message)))");
          expect(problems, logged === true, "the session log does not say the Dock page was reloaded by the load guard");
          revived = true;
        }
        if (!revived) {
          const said = s.logs.join("").split(/\r?\n/).filter((l) => /\[Lens UI\]|failsafe|renderer/i.test(l)).slice(-12);
          problems.push(`the Dock page was not reloaded after its renderer was killed. Lens said:\n        ${said.join("\n        ") || "(nothing)"}`);
        }
        expect(problems, lensProcessCount() > 0, "Lens exited while recovering");
      } finally {
        await cdpEval("dock", "window.__TAURI_INTERNALS__.invoke('quit_lens').catch(() => {}); true");
        for (let i = 0; i < 30 && lensProcessCount() > 0; i++) await sleep(500);
        if (lensProcessCount() > 0) killLens();
      }
    },
  },
  {
    id: "registry-denied",
    title: "a registry key Lens may not write gives an error, not a crash",
    async run(problems) {
      const key = "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run";
      const deny = `$acl = Get-Acl '${key}'; $rule = New-Object System.Security.AccessControl.RegistryAccessRule([System.Security.Principal.WindowsIdentity]::GetCurrent().Name, 'SetValue,CreateSubKey,Delete', 'Deny'); $acl.AddAccessRule($rule); Set-Acl '${key}' $acl; 'denied'`;
      const allow = `$acl = Get-Acl '${key}'; $acl.Access | Where-Object { $_.AccessControlType -eq 'Deny' } | ForEach-Object { [void]$acl.RemoveAccessRule($_) }; Set-Acl '${key}' $acl; 'allowed'`;
      const s = await startLens({ LENS_SAFE_MODE_CHOICE: "normal" });
      let denied = false;
      try {
        const dock = await waitForSurface(s, "dock");
        // Start from "off", so switching it on below really is a write to the Run key.
        const live = await invoke(dock, "get_config");
        live.func.runOnStartup = false;
        await invoke(dock, "save_config_cmd", { newConfig: live }).catch(() => {});
        denied = ps(deny) === "denied";
        if (!denied) {
          console.log("      (could not make the Run key read-only on this machine; skipped)");
          return;
        }
        live.func.runOnStartup = true;
        // Whatever the command answers, Lens must still be there and still answer afterwards.
        await invoke(dock, "save_config_cmd", { newConfig: live }).catch(() => {});
        await sleep(1500);
        expect(problems, lensProcessCount() > 0, "Lens went down when a registry write was refused");
        expect(problems, !!(await invoke(dock, "get_config").catch(() => null)), "Lens stopped answering after a refused registry write");
        ps(allow);
        denied = false;
        live.func.runOnStartup = false;
        await invoke(dock, "save_config_cmd", { newConfig: live }).catch(() => {});
      } finally {
        if (denied) ps(allow);
        await quitLens(s);
      }
    },
  },
];

// ---------------------------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------------------------

// A DevTools client can throw from its own internals while pages are being torn down; that must
// not end the run before Lens' data folder has been put back.
process.on("uncaughtException", (e) => console.log(`      (ignored: ${String(e && e.message ? e.message : e).slice(0, 200)})`));

if (process.platform !== "win32") {
  console.log("[failsafe] Windows only; nothing to do here.");
  process.exit(0);
}
// This test rewrites Lens' data folder (and, for one scenario, the permissions of the HKCU Run
// key) and puts both back afterwards. It is meant for the CI runner; on a PC someone uses it
// only runs when asked for by name.
if (!process.env.CI && process.env.FAILSAFE_RUN !== "1") {
  console.log("[failsafe] Not a CI runner. Set FAILSAFE_RUN=1 to run these scenarios on this PC (close Lens first).");
  process.exit(0);
}
if (!existsSync(EXE)) {
  console.error(`[failsafe] ${EXE} not found. Build first (see tests/e2e/run.mjs).`);
  process.exit(1);
}

killLens();
const backup = join(outDir, "failsafe-appdata-backup");
rmSync(backup, { recursive: true, force: true });
const hadData = existsSync(DATA);
if (hadData) cpSync(DATA, backup, { recursive: true });

const results = [];
try {
  for (const sc of SCENARIOS) {
    if (ONLY.length && !ONLY.includes(sc.id)) continue;
    const problems = [];
    const t0 = Date.now();
    try {
      await cleanStart();
      await sc.run(problems);
    } catch (e) {
      problems.push(`threw: ${String(e && e.message ? e.message : e).slice(0, 1500)}`);
    }
    if (lensProcessCount() > 0) killLens();
    await sleep(800);
    const ok = problems.length === 0;
    results.push({ id: sc.id, title: sc.title, ok, seconds: (Date.now() - t0) / 1000, problems });
    console.log(`${ok ? "ok  " : "FAIL"} ${sc.id}: ${sc.title}${ok ? "" : "\n      " + problems.join("\n      ")}`);
  }
} finally {
  killLens();
  await sleep(500);
  // Put the person's (or the runner's) Lens data back exactly as it was.
  rmSync(DATA, { recursive: true, force: true });
  if (hadData) cpSync(backup, DATA, { recursive: true });
  rmSync(backup, { recursive: true, force: true });
  writeFileSync(join(outDir, "failsafe.json"), JSON.stringify(results, null, 2));
}

const failed = results.filter((r) => !r.ok);
console.log(`[failsafe] ${results.length - failed.length}/${results.length} scenarios passed`);
process.exit(failed.length ? 1 : 0);
