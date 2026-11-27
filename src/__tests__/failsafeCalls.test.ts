// B-18, Dock and pop-outs share: failures are logged, and a call that keeps a window in step with
// Lens Core is tried once more before giving up.
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const calls: { cmd: string; args: unknown }[] = [];
let failures: Record<string, number> = {};
mock.module("@tauri-apps/api/core", () => ({
  invoke: async (cmd: string, args?: unknown) => {
    calls.push({ cmd, args });
    if ((failures[cmd] ?? 0) > 0) {
      failures[cmd]--;
      throw new Error("The window is being rebuilt");
    }
    return null;
  },
  convertFileSrc: (p: string) => p,
  transformCallback: () => 0,
}));

const { failLine, hideSurface, logFail, quiet, retryOnce, setCallReporter, setDockMenuOpen } = await import("../failsafe/calls");

const logged: { level: string; text: string }[] = [];
let prev: ReturnType<typeof setCallReporter>;
beforeEach(() => {
  calls.length = 0;
  failures = {};
  logged.length = 0;
  prev = setCallReporter((level, e) => logged.push({ level, text: String(e) }));
});
afterEach(() => setCallReporter(prev));

describe("calls that keep windows in step", () => {
  test("a call that works runs once and logs nothing", async () => {
    expect(await hideSurface("quicksettings")).toBe(true);
    expect(calls).toEqual([{ cmd: "hide_surface", args: { label: "quicksettings" } }]);
    expect(logged).toEqual([]);
  });

  test("a refused hide is tried once more, so the pop-out still closes", async () => {
    failures.hide_surface = 1;
    expect(await hideSurface("settings", "Dock")).toBe(true);
    expect(calls.map((c) => c.cmd)).toEqual(["hide_surface", "hide_surface"]);
    expect(logged).toHaveLength(1);
    expect(logged[0].level).toBe("warn");
    expect(logged[0].text).toBe("Dock: couldn't close settings (The window is being rebuilt). It worked on the second try.");
  });

  test("two refusals are logged as an error and never retried a third time", async () => {
    failures.set_dock_menu_open = 5;
    expect(await setDockMenuOpen(false)).toBe(false);
    expect(calls.filter((c) => c.cmd === "set_dock_menu_open")).toHaveLength(2);
    expect(logged.map((l) => l.level)).toEqual(["error"]);
    expect(logged[0].text).toContain("Dock: couldn't report a closed menu");
  });

  test("retryOnce never rejects and waits before the second try", async () => {
    let n = 0;
    const t0 = performance.now();
    const ok = await retryOnce(async () => {
      n++;
      throw "nope";
    }, "Top Bar", "close Search", 30);
    expect(ok).toBe(false);
    expect(n).toBe(2);
    expect(performance.now() - t0).toBeGreaterThanOrEqual(25);
  });
});

describe("user actions and background calls", () => {
  test("logFail names the place and the action; quiet logs nothing", () => {
    logFail("Dock", "play or pause")(new Error("No media session"));
    logFail("Dock", "open the Launcher")();
    quiet();
    expect(logged.map((l) => l.text)).toEqual(["Dock: couldn't play or pause (No media session).", "Dock: couldn't open the Launcher."]);
    expect(failLine("Dock", "do that", { code: 5 })).toBe('Dock: couldn\'t do that ({"code":5}).');
  });
});

describe("no silent failures left in the Dock, Magic and the Dashboard", () => {
  const src = (p: string) => readFileSync(join(import.meta.dir, "..", p), "utf8");
  const silent = /\.catch\(\(\) => (\{\}|undefined)\)/g;

  test("the Dock, its attention badges and its system area", () => {
    for (const f of ["surfaces/DockSurface.tsx", "dock/attention.ts", "dock/DockSystemArea.tsx", "dock/usePeek.ts", "dock/DockContextMenu.tsx", "dock/DockHoverCard.tsx", "dock/DockSearchDrawer.tsx", "dock/DockAppItem.tsx", "dock/act.ts", "dock/keys.ts", "topbar/clickThrough.ts", "magic/LensPan.tsx", "magic/contract.ts", "magic/MagicSurface.tsx", "dashboard/DashboardWindow.tsx", "dashboard/TopBarDashboardButton.tsx"]) {
      expect({ f, left: src(f).match(silent) ?? [] }).toEqual({ f, left: [] });
    }
  });

  test("every pop-out closes through the retrying hide", () => {
    for (const f of ["surfaces/DockSurface.tsx", "surfaces/QuickSettingsSurface.tsx", "surfaces/WidgetDrawerSurface.tsx", "surfaces/CommandPaletteSurface.tsx", "surfaces/LauncherSurface.tsx", "surfaces/OverviewSurface.tsx", "surfaces/NotificationOverlaySurface.tsx"]) {
      expect({ f, raw: src(f).match(/invoke\("hide_surface"/g) ?? [] }).toEqual({ f, raw: [] });
    }
  });

  test("Dock window calls that end without any catch are gone", () => {
    const text = src("surfaces/DockSurface.tsx");
    for (const cmd of ["focus_window_cmd", "toggle_settings_docked"]) {
      const bare = text.split("\n").filter((l) => l.includes(`invoke("${cmd}"`) && !l.includes(".catch("));
      expect({ cmd, bare }).toEqual({ cmd, bare: [] });
    }
  });
});

describe("quick wins", () => {
  const src = (p: string) => readFileSync(join(import.meta.dir, "..", p), "utf8");
  test("the Top Bar's own buttons are named in sentence case", () => {
    const bar = src("surfaces/TopBarSurface.tsx");
    for (const name of ["Previous desktop", "Desktops overview", "Next desktop", "New desktop", "Previous track", "Next track", "Wi-Fi and network", "Volume and audio mixer"]) {
      expect(bar).toContain(`aria-label="${name}"`);
    }
    expect(bar).not.toMatch(/aria-label="(Previous|Next) (Track|Desktop)"|Audio Mixer"|and Network"/);
  });
  test("screen readers hear Command's results and Magic's target changes", () => {
    expect(src("command/cards/Cards.tsx")).toMatch(/ct-tool risk-\$\{p\.risk\} is-\$\{item\.state\}`\} aria-live="polite"/);
    expect(src("command/cards/Cards.tsx")).toMatch(/ct-action[^\n]*role="status" aria-live="polite"/);
    expect(src("magic/MagicSurface.tsx")).toContain('className="magic-target" aria-live="polite" aria-atomic="true"');
  });
});
