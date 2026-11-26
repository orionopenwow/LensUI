// Small shared launcher for the newer E2E suites (autohide.mjs, intents.mjs): starts the E2E build
// of Lens, attaches Playwright over CDP and calls backend commands the way the UI does.
import { spawn, execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { chromium } from "playwright";

const root = resolve(import.meta.dirname, "../..");
const EXE = resolve(process.env.LENS_EXE || join(root, "src-tauri/target/debug/lens-ui.exe"));
const PORT = Number(process.env.E2E_CDP_PORT || 9222);
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function startLens() {
  const logs = [];
  const proc = spawn(EXE, [], { stdio: ["ignore", "pipe", "pipe"] });
  proc.stdout.on("data", (b) => logs.push(String(b)));
  proc.stderr.on("data", (b) => logs.push(String(b)));
  for (let t0 = Date.now(); Date.now() - t0 < 60000; await sleep(500)) {
    if (proc.exitCode !== null) throw new Error(`lens-ui exited early:\n${logs.join("").slice(-2000)}`);
    try { if ((await fetch(`http://127.0.0.1:${PORT}/json/version`)).ok) break; } catch {}
  }
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`, { timeout: 30000 });
  return { proc, browser, logs };
}
export function surfaces(s) {
  const m = {};
  for (const p of s.browser.contexts().flatMap((c) => c.pages())) {
    try { const n = new URL(p.url()).searchParams.get("surface"); if (n && !p.isClosed()) m[n] = p; } catch {}
  }
  return m;
}
export async function page(s, name, ms = 20000) {
  for (let t0 = Date.now(); Date.now() - t0 < ms; await sleep(300)) {
    const p = surfaces(s)[name];
    if (p) {
      try { await p.waitForFunction(() => (document.getElementById("root")?.innerHTML.length || 0) > 0, null, { timeout: 5000 }); return p; } catch {}
    }
  }
  throw new Error(`no "${name}" window`);
}
export async function invoke(p, cmd, args = {}) {
  const r = await p.evaluate(([c, a]) => window.__TAURI_INTERNALS__.invoke(c, a).then((v) => ({ ok: true, v }), (e) => ({ ok: false, e: String(e) })), [cmd, args]);
  if (!r.ok) throw new Error(`${cmd}: ${r.e}`);
  return r.v;
}
export async function setConfig(s, mutate) {
  const p = await page(s, "dock");
  const cfg = await invoke(p, "get_config");
  mutate(cfg);
  await invoke(p, "save_config_cmd", { newConfig: cfg });
}
export function lensCount() {
  try { return Number(execFileSync("powershell", ["-NoProfile", "-Command", "(Get-Process lens-ui -ErrorAction SilentlyContinue | Measure-Object).Count"], { encoding: "utf8" }).trim()) || 0; } catch { return -1; }
}
export async function quit(s) {
  const p = surfaces(s).dock;
  if (p) await p.evaluate(() => { window.__TAURI_INTERNALS__.invoke("quit_lens").catch(() => {}); }).catch(() => {});
  for (let i = 0; i < 40 && lensCount() > 0; i++) await sleep(500);
  await s.browser.close().catch(() => {});
}

