// Command intents on real Windows (docs/TESTING.md › Hyper suite). For every action the offline
// intent engine knows (src-tauri/src/ai/intent.rs ACTIONS), its first phrasing from the engine's own
// phrase table must parse to that action with a summary for the preview. One reversible action
// (dark ↔ light mode) is also run end to end and put back. Results land in
// tests/e2e/out/intents.json, which tools/hyper/run.mjs folds into the coverage report.
//
// Run on Windows after the E2E build: node tests/e2e/intents.mjs
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { startLens, page, invoke, quit, sleep } from "./lens.mjs";

const root = resolve(import.meta.dirname, "../..");
const outDir = join(root, "tests/e2e/out");
mkdirSync(outDir, { recursive: true });
const src = readFileSync(join(root, "src-tauri/src/ai/intent.rs"), "utf8");
const actions = [...(src.match(/pub const ACTIONS: &\[&str\] = &\[([\s\S]*?)\];/)?.[1] || "").matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
const table = [...(src.match(/const TABLE: &\[\(&str, &str, &str\)\] = &\[([\s\S]*?)\n    \];/)?.[1] || "").matchAll(/\("([^"]+)",\s*"([a-z_]+)",\s*"([^"]*)"\)/g)];

const results = [];
const push = (action, title, ok, error = "") => {
  results.push({ id: action, inventoryId: `intent:${action}`, title, status: ok ? "pass" : "fail", error });
  console.log(`${ok ? "ok  " : "FAIL"} ${action}: ${title}${ok ? "" : `\n      ${error}`}`);
};

let s;
try {
  s = await startLens();
  const dock = await page(s, "dock");
  await sleep(1500);
  for (const action of actions) {
    const ex = table.find((m) => m[2] === action);
    if (!ex) {
      push(action, "has a phrasing in the engine's table", false, "no phrase in TABLE for this action");
      continue;
    }
    const phrase = ex[1];
    const intent = await invoke(dock, "ai_intent", { text: phrase }).catch((e) => ({ error: String(e) }));
    const ok = intent && intent.action === action && typeof intent.summary === "string" && intent.summary.length > 0 && intent.confidence >= 0 && intent.confidence <= 1;
    push(action, `"${phrase}" previews as ${action}`, ok, JSON.stringify(intent).slice(0, 300));
  }
  // Run one reversible intent end to end and put it back.
  // "toggle theme" twice: works whether Lens starts light or dark (first-run setup now picks the
  // mode from Windows, which is light on the CI runner).
  //
  // The toggle goes backend → `lens://ai/apply` → the Dock's AiApplyBridge → save_config_cmd, and
  // both the event and the (synchronous) save run on Lens's main thread. Right after start-up that
  // thread is busy building the start-up windows (Settings, Search, ...) for several seconds, so a
  // fixed 2 s wait sometimes read the config before the save landed; the second toggle then
  // replaced the first one in the Dock's save queue, and the check failed with "unchanged".
  // Wait for the builds to finish, then wait on the saved config itself, not on time.
  const t0Built = Date.now();
  while (!s.logs.join("").includes("Start-up windows") && Date.now() - t0Built < 90000) await sleep(250);
  const builtNote = `start-up windows ${s.logs.join("").includes("Start-up windows built.") ? "built" : "still building"} after ${Date.now() - t0Built} ms`;
  console.log(`      ${builtNote}`);
  const SAVE_WITHIN_MS = 8000;
  const waitPreset = async (pred) => {
    const t0 = Date.now();
    let cfg;
    while (Date.now() - t0 <= SAVE_WITHIN_MS) {
      cfg = await invoke(dock, "get_config");
      if (pred(cfg.theme?.preset)) return { cfg, ms: Date.now() - t0 };
      await sleep(100);
    }
    return { cfg, ms: null };
  };
  /** What Lens itself saw, for a failure message: the Dock's own idea of the look, the run's
   *  answer, and the AI / config / window lines from the Tester log. */
  const colourDiag = async (runId) => {
    const dockPreset = await dock.evaluate(() => document.documentElement.dataset.preset).catch(() => "?");
    const log = await invoke(dock, "tester_log_get", { after: null, limit: 2000 }).catch(() => []);
    const lines = log.filter((l) => /^(ai|config|settings|surface|setup|watcher)$/.test(l.area)).slice(-12)
      .map((l) => `        ${new Date(l.atMs).toISOString().slice(11, 23)} [${l.area}] ${l.message}`);
    return [`      the Dock draws ${dockPreset}; run id ${runId}; ${builtNote}`, ...lines].join("\n");
  };
  const before = await invoke(dock, "get_config");
  const startPreset = before.theme?.preset;
  const toggle = await invoke(dock, "ai_intent", { text: "toggle theme" });
  const runOk = await invoke(dock, "ai_run_intent", { intent: toggle }).then((id) => ({ id }), (e) => String(e));
  if (typeof runOk === "string") push("set_color_mode", "runs and changes the look", false, `ai_run_intent: ${runOk}`);
  else {
    const mid = await waitPreset((p) => p !== startPreset);
    push("set_color_mode", "running it changes the look", mid.ms !== null,
      `preset still ${startPreset} ${SAVE_WITHIN_MS} ms after "toggle theme"\n${await colourDiag(runOk.id)}`);
    if (mid.ms !== null) console.log(`      toggled ${startPreset} → ${mid.cfg.theme?.preset} in ${mid.ms} ms`);
    const back = await invoke(dock, "ai_intent", { text: "toggle theme" });
    const backId = await invoke(dock, "ai_run_intent", { intent: back }).catch((e) => String(e));
    const after = await waitPreset((p) => p === startPreset);
    push("set_color_mode", "running the opposite puts the look back", after.ms !== null,
      `preset ${startPreset} → ${after.cfg?.theme?.preset} (${SAVE_WITHIN_MS} ms after the second toggle)\n${await colourDiag(backId)}`);
  }
  await invoke(dock, "save_config_cmd", { newConfig: before }).catch(() => {});
} catch (e) {
  results.push({ id: "session", status: "fail", error: String(e.stack || e) });
  console.log(`FAIL session: ${e.stack || e}`);
} finally {
  if (s) await quit(s);
}
writeFileSync(join(outDir, "intents.json"), JSON.stringify(results, null, 2));
const failed = results.filter((r) => r.status === "fail");
console.log(`[intents] ${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
