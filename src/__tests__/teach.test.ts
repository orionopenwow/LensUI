import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SETTING_HOMES, whereItLives } from "../command/teach";
import { resolveTarget } from "../settings/registry";

const intentRs = readFileSync(join(import.meta.dir, "../../src-tauri/src/ai/intent.rs"), "utf8");
const block = intentRs.slice(intentRs.indexOf("pub const ACTIONS"), intentRs.indexOf("];", intentRs.indexOf("pub const ACTIONS")));
const ACTIONS = [...block.matchAll(/^\s*"([a-z_]+)",/gm)].map((m) => m[1]);

describe("Command › Teach me", () => {
  test("every action it explains is a real offline intent", () => {
    expect(ACTIONS.length).toBeGreaterThan(30);
    for (const action of Object.keys(SETTING_HOMES)) expect(ACTIONS).toContain(action);
  });

  test("every home is a page (and section) that exists in Settings", () => {
    for (const [action, target] of Object.entries(SETTING_HOMES)) {
      const hit = resolveTarget(target);
      expect(hit, action).not.toBeNull();
      const [, section] = target.split("#");
      // resolveTarget drops a section it doesn't know: a stale id would lose the deep link.
      expect(hit?.section, action).toBe(section);
      const where = whereItLives(action);
      expect(where?.target).toBe(target);
      expect(where?.path.startsWith("Settings › ")).toBe(true);
      expect(where?.path.split(" › ").length).toBe(section ? 3 : 2);
    }
  });

  test("names the place in plain words", () => {
    expect(whereItLives("set_dock_style")).toEqual({ target: "dock#style", path: "Settings › Dock & Bar › Dock style" });
    expect(whereItLives("set_color_mode")?.path).toBe("Settings › Appearance › Current theme");
    expect(whereItLives("set_dnd")?.path).toBe("Settings › Focus & Notifications");
    expect(whereItLives("set_volume")?.path).toBe("Settings › Sound › Mixer");
  });

  test("says nothing for actions that change no setting", () => {
    for (const action of ["open_app", "calculate", "convert", "lock_screen", "search_files", "start_timer", "create_note"]) {
      expect(ACTIONS).toContain(action);
      expect(whereItLives(action)).toBeNull();
    }
    expect(whereItLives("")).toBeNull();
    expect(whereItLives(null)).toBeNull();
    expect(whereItLives("not_an_action")).toBeNull();
  });

  test("the applied card carries the place and Command opens it", () => {
    const surface = readFileSync(join(import.meta.dir, "../command/CommandSurface.tsx"), "utf8");
    expect(surface).toContain("where: whereItLives(out.intent.action) ?? undefined");
    expect(surface).toContain("onShowSetting: (target) =>");
    const cards = readFileSync(join(import.meta.dir, "../command/cards/Cards.tsx"), "utf8");
    expect(cards).toContain("item.ok && item.where");
    expect(cards).toContain("Show me");
  });
});
