// "Top Bar on every monitor" together with "Follow the pointer". The planning is pure Rust and
// tested there (win_monitors::extra_topbar_plan: every monitor has exactly one bar wherever the
// main bar is). These checks keep the wiring in place, since a missing call compiles fine.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const rust = (path: string) => readFileSync(join(import.meta.dir, "../../src-tauri/src", path), "utf8");

describe("per-monitor Top Bars follow the main bar", () => {
  test("placing the main bars also re-places the extra ones", () => {
    const watcher = rust("app/watcher.rs");
    const place = watcher.slice(watcher.indexOf("pub(crate) fn position_dock_and_bars"));
    expect(place).toContain("if cfg.func.per_monitor_bars {");
    expect(place).toContain("crate::app::integration::place_extra_topbars(app, cfg, (pos.x, pos.y));");
    // The watcher re-places the bars whenever their monitor changes (follow the pointer included).
    expect(watcher).toContain("if last_place_key != Some(place_key)");
  });

  test("the extra bars are planned, not left where they were built", () => {
    const integration = rust("app/integration.rs");
    expect(integration).toContain("win_monitors::extra_topbar_plan(monitors.len(), home, main)");
    // They start around the monitor the pointer is on, like the main bars do under Follow the pointer.
    expect(integration).toContain("win_monitors::pick_monitor(&monitors, &cfg.func.target_monitor, win_monitors::cursor_pos())");
  });

  test("the one Top Bar switch hides and shows the extra bars too", () => {
    const integration = rust("app/integration.rs");
    const fn = integration.slice(integration.indexOf("pub(crate) fn place_extra_topbars"), integration.indexOf("fn build_extra_topbars"));
    expect(fn).toContain("if cfg.top_bar.enabled {");
    expect(fn).toContain("win.hide()");
  });

  test("the Rust tests for the plan exist", () => {
    const monitors = rust("win_monitors.rs");
    for (const name of [
      "extra_top_bars_cover_every_monitor_once_wherever_the_main_bar_is",
      "extra_top_bars_follow_the_pointer_and_come_back",
      "extra_top_bars_survive_an_unplugged_monitor",
      "follow_the_pointer_with_per_monitor_bars_places_each_bar_on_its_monitor",
    ]) {
      expect(monitors).toContain(`fn ${name}()`);
    }
  });
});
