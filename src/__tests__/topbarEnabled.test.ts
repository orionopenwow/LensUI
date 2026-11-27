// One switch for the Top Bar (config v4): `topBar.enabled`. `dock.showTopBar` used to be a second
// one and the two could disagree. The Rust side folds the old key on load
// (src-tauri/src/tests/win_backup.rs); these tests keep the page on the single flag.
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { resolveSystemArea } from "../dock/styles";
import { topBarEnabled, withTopBarEnabled } from "../topbar/enabled";
import { sampleConfig } from "./fixtures";

const root = join(import.meta.dir, "..", "..");

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) files(path, out);
    else if (/\.(ts|tsx|rs|mjs)$/.test(name)) out.push(path);
  }
  return out;
}

describe("Top Bar: one enable flag", () => {
  test("topBar.enabled decides; a missing section counts as on", () => {
    const config = sampleConfig();
    expect(topBarEnabled(config)).toBe(true);
    expect(topBarEnabled({ ...config, topBar: { ...config.topBar!, enabled: false } })).toBe(false);
    expect(topBarEnabled({})).toBe(true);
    expect(topBarEnabled(null)).toBe(true);
  });

  test("turning it off and on changes topBar.enabled and nothing else", () => {
    const config = sampleConfig();
    const off = withTopBarEnabled(config, false);
    expect(off.topBar!.enabled).toBe(false);
    expect({ ...off, topBar: { ...off.topBar!, enabled: true } }).toEqual(config);
    expect(off.dock).toBe(config.dock);
    expect(withTopBarEnabled(off, true)).toEqual(config);
  });

  test("a config without a Top Bar section gets the defaults plus the choice", () => {
    const { topBar: _dropped, ...rest } = sampleConfig();
    const off = withTopBarEnabled(rest as { topBar?: { enabled?: boolean } }, false);
    expect(off.topBar).toEqual({ enabled: false, autoHide: "overlap", revealDelayMs: 100, hideDelayMs: 350, height: 34, floating: false });
  });

  test("an old dock.showTopBar on the page side is ignored", () => {
    const config = sampleConfig();
    const stale = { ...config, dock: { ...config.dock, showTopBar: false } };
    expect(topBarEnabled(stale)).toBe(true);
    expect(resolveSystemArea({ style: "taskbar", systemArea: "topbar", showTopBar: false } as never, { enabled: true })).toBe("topbar");
  });

  test("system icons fall back into the Dock only when the one flag is off", () => {
    expect(resolveSystemArea({ style: "taskbar", systemArea: "topbar" }, { enabled: true })).toBe("topbar");
    expect(resolveSystemArea({ style: "taskbar", systemArea: "topbar" }, { enabled: false })).toBe("dock");
    expect(resolveSystemArea({ style: "taskbar", systemArea: "topbar" })).toBe("topbar");
    // Floating has no place for them, so they stay in the (hidden) Top Bar's slot.
    expect(resolveSystemArea({ style: "floating", systemArea: "topbar" }, { enabled: false })).toBe("topbar");
  });

  test("no source file reads or writes a second flag", () => {
    const allowed = new Set([
      join(root, "src-tauri/src/win_backup.rs"), // the fold itself
      join(root, "src-tauri/src/tests/win_backup.rs"),
      join(root, "src-tauri/src/config.rs"), // doc comment naming the old key
      join(root, "src/topbar/enabled.ts"),
      join(root, "src/types/generated.ts"), // the same doc comment, generated; checked below
      join(root, "src/__tests__/topbarEnabled.test.ts"),
    ]);
    const offenders = [...files(join(root, "src")), ...files(join(root, "src-tauri/src")), ...files(join(root, "tests")), ...files(join(root, "tools/parity/mock"))]
      .filter((path) => !allowed.has(path))
      .filter((path) => /showTopBar|show_top_bar/.test(readFileSync(path, "utf8")));
    expect(offenders).toEqual([]);
    for (const types of ["src/types/generated.ts", "src/types/lens.ts"]) {
      expect(readFileSync(join(root, types), "utf8")).not.toMatch(/showTopBar\??:/);
    }
  });

  test("Settings' switch reads and writes through the helper", () => {
    const tsx = readFileSync(join(root, "src/surfaces/ControlCenterSurface.tsx"), "utf8");
    expect(tsx).toContain("aria-checked={topBarEnabled(config)}");
    expect(tsx).toContain("updateConfig(withTopBarEnabled(config, !topBarEnabled(config)))");
  });
});
