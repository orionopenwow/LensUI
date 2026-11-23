// Remove-all proof (docs/TESTING.md › Remove all). Real Windows, real app, over CDP like run.mjs.
//
//   1. Start Lens and read the change registry (`changes_manifest_cmd`): every HKCU key or value
//      and every file Lens may write outside its own data folder.
//   2. Snapshot all of it.
//   3. Turn features on through the same commands the UI calls.
//   4. Snapshot again. A feature only counts as "proven" if its part of the snapshot changed.
//   5. Run "Remove all Lens changes" (`remove_all_lens_changes_cmd`).
//   6. Snapshot and diff against step 2. Any leftover fails the job. So does a failed step in the
//      report, or fewer than MIN_PROVEN features having changed anything (a check that proves
//      nothing must not pass).
//   7. Quit Lens and diff once more: quitting must not write anything back.
//
// Run on Windows after the E2E build (see run.mjs):  node tests/e2e/remove-all.mjs
// Env: LENS_EXE, E2E_CDP_PORT, REMOVE_ALL_MIN_PROVEN (default 6).
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "../..");
const outDir = join(root, "tests/e2e/out");
const EXE = resolve(process.env.LENS_EXE || join(root, "src-tauri/target/debug/lens-ui.exe"));
const PORT = Number(process.env.E2E_CDP_PORT || 9222);
const MIN_PROVEN = Number(process.env.REMOVE_ALL_MIN_PROVEN || 6);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Values Windows itself rewrites while the desktop runs (same list as tools/e2e/probe.ps1).
const VOLATILE = ["WallpaperOriginX", "WallpaperOriginY", "TranscodedImageCache", "TranscodedImageCount", "LastUpdated", "ColorizationAfterglowBalance", "ColorizationBlurBalance"];

// ---------------------------------------------------------------------------------------------
// Pure helpers (unit-tested in src/lib/removeAllProof.test.ts)
// ---------------------------------------------------------------------------------------------

/** One `writes` entry of the registry → what to read. */
export function parseWrite(entry) {
  if (entry.startsWith("HKCU\\")) {
    const i = entry.indexOf("::");
    return i < 0 ? { kind: "key", key: entry } : { kind: "value", key: entry.slice(0, i), value: entry.slice(i + 2) };
  }
  return { kind: "file", path: entry };
}

/** Expands %VAR% from `env`; unknown variables are left as written. */
export function expandEnv(path, env) {
  return path.replace(/%([^%]+)%/g, (m, name) => {
    const hit = Object.keys(env).find((k) => k.toLowerCase() === name.toLowerCase());
    return hit ? env[hit] : m;
  });
}

/** `reg query` output as a sorted list of meaningful lines, without volatile values. */
export function normalizeReg(text, volatile = VOLATILE) {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !volatile.some((v) => l.startsWith(v + " ")))
    .sort();
}

/** Lines only in `after` (added) and only in `before` (missing), per snapshot entry. */
export function diffSnapshots(before, after) {
  const out = [];
  for (const entry of Object.keys(before)) {
    const a = new Set(before[entry]);
    const b = new Set(after[entry] || []);
    const added = [...b].filter((l) => !a.has(l));
    const missing = [...a].filter((l) => !b.has(l));
    if (added.length || missing.length) out.push({ entry, added, missing });
  }
  return out;
}

/** Ids of the registry rows whose entries differ between two snapshots. */
export function changedRows(manifest, before, after) {
  const changed = new Set(diffSnapshots(before, after).map((d) => d.entry));
  return manifest.filter((row) => row.writes.some((w) => changed.has(w))).map((row) => row.id);
}

// ---------------------------------------------------------------------------------------------
// Windows side
// ---------------------------------------------------------------------------------------------

function regQuery(args) {
  try {
    return normalizeReg(execFileSync("reg", ["query", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
  } catch {
    return ["<absent>"];
  }
}

function snapshot(manifest) {
  const snap = {};
  for (const row of manifest) {
    for (const entry of row.writes) {
      const w = parseWrite(entry);
      if (w.kind === "key") snap[entry] = regQuery([w.key, "/s"]);
      else if (w.kind === "value") snap[entry] = regQuery([w.key, "/v", w.value]);
      else {
        const p = expandEnv(w.path, process.env);
        snap[entry] = existsSync(p) ? [`sha256 ${createHash("sha256").update(readFileSync(p)).digest("hex")}`] : ["<absent>"];
      }
    }
  }
  return snap;
}

async function startLens(chromium, timeoutMs = 60000) {
  const logs = [];
  const proc = spawn(EXE, [], { stdio: ["ignore", "pipe", "pipe"], windowsHide: false });
  proc.stdout.on("data", (b) => logs.push(String(b)));
  proc.stderr.on("data", (b) => logs.push(String(b)));
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (proc.exitCode !== null) throw new Error(`lens-ui exited with ${proc.exitCode}:\n${logs.join("").slice(-2000)}`);
    try {
      if ((await fetch(`http://127.0.0.1:${PORT}/json/version`)).ok) break;
    } catch {}
    await sleep(500);
  }
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`, { timeout: 30000 });
  return { proc, browser, logs };
}

async function dockPage(s, ms = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    for (const p of s.browser.contexts().flatMap((c) => c.pages())) {
      try {
        if (new URL(p.url()).searchParams.get("surface") === "dock" && !p.isClosed()) {
          await p.waitForFunction(() => !!window.__TAURI_INTERNALS__, null, { timeout: 15000 });
          return p;
        }
      } catch {}
    }
    await sleep(400);
  }
  throw new Error("no dock window");
}

async function invoke(page, cmd, args = {}) {
  const r = await page.evaluate(
    ([cmd, args]) => window.__TAURI_INTERNALS__.invoke(cmd, args).then((v) => ({ ok: true, v }), (e) => ({ ok: false, e: String(e) })),
    [cmd, args]
  );
  if (!r.ok) throw new Error(`${cmd} failed: ${r.e}`);
  return r.v;
}

function lensProcessCount() {
  try {
    return Number(execFileSync("powershell", ["-NoProfile", "-Command", "(Get-Process lens-ui -ErrorAction SilentlyContinue | Measure-Object).Count"], { encoding: "utf8" }).trim()) || 0;
  } catch {
    return -1;
  }
}

/** Features turned on the way the UI does it: registry row id → what to call. A step that cannot
 * run on this machine (app not installed, development build) is noted and skipped; the check
 * still demands MIN_PROVEN rows whose snapshot really changed. */
const APPLY = [
  ["url-scheme", (p) => invoke(p, "url_scheme_install", { confirm: true })],
  ["explorer-verbs", (p) => invoke(p, "explorer_verbs_install", { confirm: true })],
  ["browser-bridge", (p) => invoke(p, "bridge_install", { browsers: ["chrome", "edge", "brave", "chromium", "firefox"], extraExtensionIds: [], confirm: true })],
  ["cleaner-verb", async (p) => invoke(p, "cleaner_settings_set", { next: { ...(await invoke(p, "cleaner_settings_get")), explorerVerb: true } })],
  ["windows-accent", async (p) => {
    const cur = regQuery(["HKCU\\Software\\Microsoft\\Windows\\DWM", "/v", "ColorPrevalence"]).join(" ");
    await invoke(p, "set_windows_titlebar_accent_cmd", { enabled: !/0x1\b/.test(cur) });
  }],
  ["explorer-folder-icons", (p) => invoke(p, "apply_global_folder_theme_cmd", { theme: "glass", accentHex: "#3b82f6" })],
  ["folder-icons", (p) => invoke(p, "apply_all_user_folders_cmd", { theme: "glass", accentHex: "#3b82f6" })],
  ["print-screen", async (p) => {
    const st = await invoke(p, "snip_status");
    await invoke(p, "snip_set_settings", { settings: { ...st.settings, printScreen: true } });
  }],
  ["windows-settings", async (p) => {
    const a = await invoke(p, "sys_access_cmd");
    await invoke(p, "sys_set_animations_cmd", { on: !(a.animations ?? true) });
  }],
  ["cursors", async (p) => {
    const st = await invoke(p, "cursor_suite_status_cmd");
    await invoke(p, "pointer_set_cmd", { settings: { ...st.pointer, wheelLines: st.pointer.wheelLines === 5 ? 4 : 5 } });
  }],
  ["shell-mode", (p) => invoke(p, "enable_shell_mode_cmd")],
  ["run-on-startup", async (p) => {
    const cfg = await invoke(p, "get_config");
    cfg.func.runOnStartup = true;
    await invoke(p, "save_config_cmd", { newConfig: cfg });
  }],
];

async function main() {
  mkdirSync(outDir, { recursive: true });
  const { chromium } = await import("playwright");
  const problems = [];
  const s = await startLens(chromium);
  let report = {};
  try {
    const page = await dockPage(s);
    const manifest = await invoke(page, "changes_manifest_cmd");
    const persistent = manifest.filter((r) => r.scope === "persistent");
    console.log(`registry: ${manifest.length} rows, ${persistent.length} persistent, ${persistent.reduce((n, r) => n + r.writes.length, 0)} keys/files watched`);

    const before = snapshot(persistent);

    const notes = [];
    for (const [id, run] of APPLY) {
      if (!manifest.some((r) => r.id === id)) {
        problems.push(`the check applies "${id}", which is no longer a registry row`);
        continue;
      }
      try {
        await run(page);
        console.log(`  applied ${id}`);
      } catch (e) {
        notes.push(`${id}: ${String(e.message || e).slice(0, 200)}`);
        console.log(`  note ${id}: could not be applied here (${String(e.message || e).slice(0, 160)})`);
      }
      await sleep(300);
    }
    await sleep(1500);

    const applied = snapshot(persistent);
    const proven = changedRows(persistent, before, applied);
    console.log(`changed Windows: ${proven.join(", ") || "nothing"}`);
    if (proven.length < MIN_PROVEN) problems.push(`only ${proven.length} feature(s) changed anything (${proven.join(", ")}); need at least ${MIN_PROVEN} for the check to mean something`);

    const steps = await invoke(page, "remove_all_lens_changes_cmd", { deleteData: false });
    for (const st of steps) {
      console.log(`  ${st.ok ? "ok  " : "FAIL"} ${st.step}: ${st.detail}`);
      if (!st.ok) problems.push(`Remove all reported a failure. ${st.step}: ${st.detail}`);
    }
    for (const row of manifest) {
      if (!steps.some((st) => st.step === row.label)) problems.push(`Remove all has no step for registry row "${row.id}"`);
    }
    if (!steps.some((st) => st.step.startsWith("Not changed: apps you installed"))) problems.push(`the report does not say installed apps were left alone`);
    await sleep(1500);

    const after = snapshot(persistent);
    const leftovers = diffSnapshots(before, after);
    for (const d of leftovers) {
      problems.push(`leftover in ${d.entry}\n      added:   ${d.added.join("\n               ") || "-"}\n      missing: ${d.missing.join("\n               ") || "-"}`);
    }

    // Quit, then make sure nothing was written back on the way out.
    await page.evaluate(() => { window.__TAURI_INTERNALS__.invoke("quit_lens").catch(() => {}); }).catch(() => {});
    for (let i = 0; i < 40 && lensProcessCount() > 0; i++) await sleep(500);
    await s.browser.close().catch(() => {});
    const afterQuit = snapshot(persistent);
    for (const d of diffSnapshots(before, afterQuit)) {
      if (!leftovers.some((l) => l.entry === d.entry)) problems.push(`changed again while quitting: ${d.entry}\n      added:   ${d.added.join(" | ") || "-"}\n      missing: ${d.missing.join(" | ") || "-"}`);
    }
    report = { manifest, proven, notes, steps, leftovers, before, applied, after, afterQuit };
  } finally {
    writeFileSync(join(outDir, "remove-all.json"), JSON.stringify({ ...report, problems }, null, 2));
    if (lensProcessCount() > 0) {
      try { s.proc.kill(); } catch {}
    }
  }
  if (problems.length) {
    console.error(`\nRemove all left Windows changed (${problems.length} problem(s)):`);
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }
  console.log("\nRemove all put back everything the registry lists.");
  process.exit(0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
