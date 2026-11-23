// Writes tests/e2e/out/tauri.e2e.json: a `tauri build --config` overlay that opens a DevTools port
// on every Lens webview, so the end-to-end tests can attach over CDP (docs/TESTING.md › End-to-end).
//
// Why an overlay: wry always passes its own AdditionalBrowserArguments to WebView2, which replaces
// WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS — the variable msedgedriver/tauri-driver rely on — so a
// normal build never opens a debugging port (seen on CI: "DevToolsActivePort file doesn't exist").
// All webviews share one WebView2 environment, so every window gets identical arguments. Only test
// builds use this; release builds are unchanged.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const port = Number(process.env.E2E_CDP_PORT || 9222);
const conf = JSON.parse(readFileSync(join(root, "src-tauri/tauri.conf.json"), "utf8"));
// wry's defaults, kept so the test build behaves like the real one.
const WRY_DEFAULT = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection";
const windows = (conf.app?.windows || []).map((w) => ({
  ...w,
  additionalBrowserArgs: `${w.additionalBrowserArgs || WRY_DEFAULT} --remote-debugging-port=${port}`,
}));
mkdirSync(join(root, "tests/e2e/out"), { recursive: true });
const out = join(root, "tests/e2e/out/tauri.e2e.json");
writeFileSync(out, JSON.stringify({ app: { windows } }, null, 2));
console.log(`[e2e] ${windows.length} windows get --remote-debugging-port=${port} → ${out}`);
