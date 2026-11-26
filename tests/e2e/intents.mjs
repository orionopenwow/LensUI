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
  const before = await invoke(dock, "get_config");
  const light = await invoke(dock, "ai_intent", { text: "light mode" });
  const runOk = await invoke(dock, "ai_run_intent", { intent: light }).then(() => true, (e) => String(e));
  await sleep(2000);
  const mid = await invoke(dock, "get_config");
  const dark = await invoke(dock, "ai_intent", { text: "dark mode" });
  await invoke(dock, "ai_run_intent", { intent: dark }).catch(() => {});
  await sleep(2000);
  const after = await invoke(dock, "get_config");
  if (runOk !== true) push("set_color_mode", "runs and changes the look", false, `ai_run_intent: ${runOk}`);
  else {
    push("set_color_mode", "running it changes the look", JSON.stringify(mid.theme) !== JSON.stringify(before.theme), "theme unchanged after \"light mode\"");
    push("set_color_mode", "running the opposite puts the look back", after.theme?.preset === before.theme?.preset, `preset ${before.theme?.preset} → ${after.theme?.preset}`);
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
