// B-131: "other-flyout: flyout(s) left open: launcher" in E2E topbar-quicksettings-dismiss.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { inside, pointOutside } from "../../tests/e2e/points.mjs";

const root = join(import.meta.dir, "../..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

/** The Launcher window as Windows places it: its tauri.conf.json size, centred on the screen. */
function launcherRect(screen: { w: number; h: number }) {
  const conf = JSON.parse(read("src-tauri/tauri.conf.json"));
  const w = conf.app.windows.find((x: { label: string }) => x.label === "launcher");
  expect(w.center).toBe(true);
  return { x: Math.round((screen.w - w.width) / 2), y: Math.round((screen.h - w.height) / 2), w: w.width, h: w.height };
}

describe("B-131: the Launcher left open after a click outside", () => {
  test("the old fixed click point was inside the Launcher on the 1024x768 runner (it clicked the app grid)", () => {
    const screen = { w: 1024, h: 768 };
    expect(inside(launcherRect(screen), Math.round(screen.w * 0.25), Math.round(screen.h * 0.7))).toBe(true);
  });

  test("the point the scenario clicks now is outside the Launcher on common screens", () => {
    for (const screen of [{ w: 1024, h: 768 }, { w: 1280, h: 720 }, { w: 1920, h: 1080 }, { w: 2560, h: 1440 }]) {
      const r = launcherRect(screen);
      const p = pointOutside(r, { x: 0, y: 0, ...screen });
      expect(p).not.toBeNull();
      expect(inside(r, p.x, p.y)).toBe(false);
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThan(screen.w);
    }
    // No room on either side: say so instead of clicking inside.
    expect(pointOutside({ x: 10, y: 0, w: 1004, h: 768 }, { x: 0, y: 0, w: 1024, h: 768 })).toBeNull();
  });

  test("other-flyout clicks outside the Launcher's real window rect", () => {
    const e2e = read("tests/e2e/autohide.mjs");
    const branch = e2e.slice(e2e.indexOf('open_surface", { label: "launcher" }'), e2e.indexOf("${how}: bar hides"));
    expect(branch).toContain('d("win Lens Launcher")');
    expect(branch).toContain("pointOutside(lw,");
    expect(branch).not.toMatch(/SCREEN\.w \* 0\.25/);
  });

  test("the watcher times the Launcher's settle from the show and never re-reads the buttons mid-pass", () => {
    const w = read("src-tauri/src/app/watcher.rs");
    expect(w).toContain('shown_for_ms("launcher")');
    const popout = w.slice(w.indexOf("fn popout_may_auto_close"), w.indexOf("pub(crate) const LAUNCHER_SETTLE_MS"));
    expect(popout).not.toContain("mouse_button_down()");
    expect(popout).toContain("mouse_button_held_this_pass()");
    expect(w.match(/let clicked = mouse_button_down\(\);/g)?.length).toBe(1);
    // A click outside closes it whether or not its window is in front: a page that never got the
    // focus gets no blur, so the foreground window alone is no promise the Launcher will close.
    const rule = w.slice(w.indexOf("if clicked && launcher_settled"), w.indexOf("// --- TOP BAR AUTO-HIDE ON OVERLAP ---"));
    expect(rule).toContain('glide_hide_surface(&watcher_handle, "launcher")');
    expect(rule).not.toMatch(/if !is_foreground\(&lau\)/);
    const s = read("src-tauri/src/commands/surfaces.rs");
    expect(s).toMatch(/surface_state::mark_shown\(label, generation\);\s*note_shown\(label\);/);
  });

  test("a Quick Settings press that counts as closing still dismisses the other flyouts", () => {
    const s = read("src-tauri/src/commands/surfaces.rs");
    const f = s.slice(s.indexOf("fn open_quicksettings_tab_cmd"), s.indexOf("let cfg = state.config", s.indexOf("fn open_quicksettings_tab_cmd")));
    const early = f.slice(f.indexOf('hidden_just_now("quicksettings")'), f.indexOf("return;"));
    expect(early).toContain('dismiss_other_surfaces(&app, "quicksettings")');
  });
});
