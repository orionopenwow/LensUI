// Every Lens window shares one WebView2 environment. A window built in code with
// WebviewWindowBuilder::new can end up with different browser arguments than the windows in
// tauri.conf.json (the E2E build adds a DevTools port to every configured window), and WebView2
// then refuses it with 0x8007139F. On-demand windows are declared in tauri.conf.json with
// "create": false and built with app::setup::build_window_from_config. This keeps the list of
// code-built windows from growing silently.
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..", "..", "src-tauri", "src");
// Known code-built windows, each a deliberate exception (the browser uses its own profiles).
const ALLOWED = new Set([
  "app/integration.rs",
  "commands/coreapps.rs",
  "commands/snip.rs", // pins and the recording frame; the overlay itself comes from tauri.conf.json
  "music/desktop_lyrics.rs",
  "presence/win.rs",
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith(".rs")) out.push(p);
  }
  return out;
}

describe("WebView2 environment", () => {
  test("no new windows are built in code (declare them in tauri.conf.json with create: false)", () => {
    const offenders = walk(ROOT)
      .filter((p) => readFileSync(p, "utf8").includes("WebviewWindowBuilder::new("))
      .map((p) => p.slice(ROOT.length + 1).replaceAll("\\", "/"))
      .filter((p) => !ALLOWED.has(p) && !p.startsWith("tests/"));
    expect(offenders).toEqual([]);
  });
  test("the Magic, Magic Start, Dashboard and Snip windows are declared on demand", () => {
    const conf = JSON.parse(readFileSync(join(ROOT, "..", "tauri.conf.json"), "utf8"));
    for (const label of ["magic", "magicstart", "dashboard", "snip"]) {
      const w = conf.app.windows.find((x: { label: string }) => x.label === label);
      expect(w?.create).toBe(false);
    }
  });
});
