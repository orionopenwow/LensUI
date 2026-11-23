// Replays the phrase table and edge-case tests from src-tauri/src/ai/intent.rs against the site's
// browser port (docs/site/js/intent.js). Run: node tools/site/test/intent.test.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse, normalize, formatNumber } from "../../../docs/site/js/intent.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const rs = readFileSync(join(root, "src-tauri/src/ai/intent.rs"), "utf8");
const table = rs.slice(rs.indexOf("const TABLE"), rs.indexOf("];", rs.indexOf("const TABLE")));
const rows = [...table.matchAll(/\("((?:[^"\\]|\\.)*)",\s*"([^"]*)",\s*"((?:[^"\\]|\\.)*)"\)/g)].map((m) => [JSON.parse(`"${m[1]}"`), m[2], JSON.parse(`"${m[3]}"`)]);
let fail = 0;
const check = (ok, msg) => { if (!ok) { fail++; console.log("FAIL", msg); } };
check(rows.length >= 60, `table has ${rows.length} rows`);
// Intents added to the app after the site port was written (voice, window and look commands).
// The site demo doesn't model them yet; they're reported as skipped, not silently passed.
// Port them in docs/site/js/intent.js and drop them from this list (docs/NEXT_STEPS.md).
const APP_ONLY = new Set(["window_action", "move_window", "open_overview", "lock_screen", "set_calm_mode", "next_wallpaper", "set_wallpaper_scene", "set_accent", "set_dock_style", "make_backdrop"]);
let skipped = 0;
for (const [phrase, action, spec] of rows) {
  if (APP_ONLY.has(action) || (action === "set_dnd" && spec.startsWith("minutes"))) {
    skipped++;
    continue;
  }
  const i = parse(phrase);
  let ok = i && i.action === action;
  if (ok && spec) {
    const [k, v] = spec.split(/=(.*)/s);
    const a = i.args[k];
    ok = typeof a === "number" ? formatNumber(a) === v : String(a) === v;
  }
  check(ok, `${JSON.stringify(phrase)} → ${JSON.stringify(i)} (want ${action} ${spec})`);
}
for (const p of ["", "   ", "why is the sky blue", "write me a poem about autumn", "summarize this page", "what do you think about rust", "explain quantum computing simply", "open a new tab", "open notifications", "x".repeat(500)])
  check(parse(p) === null, `${JSON.stringify(p.slice(0, 30))} should not be a command, got ${JSON.stringify(parse(p))}`);
check(parse("switch to windows")?.action === "switch_app", "switch to windows → app");
check(parse("use the windows theme")?.action === "set_theme_pack", "windows theme");
check(parse("open paper")?.action === "open_app", "open paper → app");
check(normalize("  Hey Lens, could you please Open Spotify for me?! ") === "open spotify", "normalize filler");
check(normalize("/dark mode") === "dark mode", "normalize slash");
console.log(`${rows.length - skipped} phrases + edge cases (${skipped} app-only phrases skipped): ${fail ? fail + " failed" : "all pass"}`);
process.exit(fail ? 1 : 0);
