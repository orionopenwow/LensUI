// Dock & Bar › Advanced (src/dock/advanced.ts, src/themeux/DockTab.tsx): the Dock settings that
// worked but had no row in Settings. Each row's value and each click's exact config change.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { LensConfig } from "../types/lens";
import {
  DOCK_ADVANCED_PATHS,
  LAUNCH_CHOICES,
  MAGNIFICATION_CHOICES,
  STYLE_ICON_MAX,
  STYLE_ICON_MIN,
  clearSeparators,
  dockAdvancedSummary,
  dockAdvancedView,
  POPOUT_CLOSE_DELAYS,
  normalizePopoutCloseDelay,
  setAutoClosePopouts,
  setPopoutCloseDelay,
  setFileDropOpen,
  setLaunchAnimation,
  setMagnification,
  setMagnificationRange,
  setMiddleClickNewInstance,
  setMinimizeFeedback,
  setScrollCyclesWindows,
  setScrollVolume,
  setShowLabels,
  setStyleIconSize,
  sharedStyleIconSize,
  toggleSeparatorAfter,
} from "../dock/advanced";
import { DOCK_STYLES, resolveDockIconSize } from "../dock/styles";
import { resolveTarget, getPage } from "../settings/registry";
import { sampleConfig } from "./fixtures";

const root = join(import.meta.dir, "..", "..");
const app = (id: string, name: string) => ({ id, name, path: `C:\\Apps\\${name}.exe` }) as LensConfig["dock"]["pinnedApps"][number];
const withPins = (): LensConfig => {
  const c = sampleConfig();
  return { ...c, dock: { ...c.dock, pinnedApps: [app("a", "Alpha"), app("b", "Beta"), app("c", "Gamma")] } };
};

/** Paths (dot-joined) whose values differ between two configs. */
function changed(a: unknown, b: unknown, prefix = ""): string[] {
  if (JSON.stringify(a) === JSON.stringify(b)) return [];
  const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
  if (!isObj(a) || !isObj(b)) return [prefix];
  const out: string[] = [];
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) out.push(...changed(a[k], b[k], prefix ? `${prefix}.${k}` : k));
  return out;
}

describe("Dock & Bar › Advanced: what the rows show", () => {
  test("a config that never set them shows the defaults Lens uses", () => {
    const v = dockAdvancedView(sampleConfig());
    expect(v.magnification).toBe("off");
    expect(v.magnificationRange).toBe(2);
    expect(v.launchAnimation).toBe("lift");
    expect(v.minimizeFeedback).toBe(false);
    expect(v.showLabels).toBe(false);
    expect(v.scrollCyclesWindows).toBe(false);
    expect(v.scrollVolume).toBe(false);
    expect(v.fileDropOpen).toBe(false);
    expect(v.middleClickNewInstance).toBe(true);
    expect(v.autoClosePopouts).toBe(true);
    expect(v.popoutCloseDelay).toBe("normal");
    expect(v.style).toBe("floating");
    expect(v.styleIconSizeIsCustom).toBe(false);
    expect(v.customSizes).toEqual([]);
    expect(v.separators).toEqual([]);
  });

  test("damaged values read as their defaults, like the Dock itself reads them", () => {
    const c = sampleConfig();
    const v = dockAdvancedView({
      ...c,
      dock: { ...c.dock, magnification: "huge", magnificationRange: 99, launchAnimation: "explode", iconSizes: { slim: 5000, taskbar: Number.NaN, studio: 30 }, style: "nope" },
    });
    expect(v.magnification).toBe("off");
    expect(v.magnificationRange).toBe(4);
    expect(v.launchAnimation).toBe("lift");
    expect(v.style).toBe("floating");
    expect(v.customSizes).toEqual([{ style: "studio", label: "Studio", size: 30 }]);
  });

  test("the choices offered are exactly the ones the Dock understands", () => {
    expect(MAGNIFICATION_CHOICES.map((c) => c.id)).toEqual(["off", "subtle", "classic"]);
    expect(LAUNCH_CHOICES.map((c) => c.id)).toEqual(["none", "lift", "bounce", "jelly"]);
  });
});

describe("Dock & Bar › Advanced: each click changes its own setting only", () => {
  const base = withPins();
  const cases: [string, (c: LensConfig) => LensConfig, string, unknown][] = [
    ["magnification", (c) => setMagnification(c, "classic"), "dock.magnification", "classic"],
    ["magnification reach", (c) => setMagnificationRange(c, 3), "dock.magnificationRange", 3],
    ["launch animation", (c) => setLaunchAnimation(c, "jelly"), "dock.launchAnimation", "jelly"],
    ["minimise pulse", (c) => setMinimizeFeedback(c, true), "dock.minimizeFeedback", true],
    ["app names", (c) => setShowLabels(c, true), "dock.showLabels", true],
    ["scroll to switch", (c) => setScrollCyclesWindows(c, true), "dock.scrollCyclesWindows", true],
    ["scroll for volume", (c) => setScrollVolume(c, true), "dock.scrollVolume", true],
    ["drop files", (c) => setFileDropOpen(c, true), "dock.fileDropOpen", true],
    ["middle-click", (c) => setMiddleClickNewInstance(c, false), "func.middleClickNewInstance", false],
    ["close pop-outs", (c) => setAutoClosePopouts(c, false), "func.autoClosePopouts", false],
    ["close delay", (c) => setPopoutCloseDelay(c, "long"), "func.popoutCloseDelay", "long"],
    ["style icon size", (c) => setStyleIconSize(c, "slim", 28), "dock.iconSizes", { slim: 28 }],
    ["divider", (c) => toggleSeparatorAfter(c, "b"), "dock.separatorsAfter", ["b"]],
  ];
  for (const [name, change, path, value] of cases) {
    test(`${name} writes ${path}`, () => {
      const next = change(base);
      expect(changed(base, next)).toEqual([path]);
      const got = path.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], next);
      expect(got).toEqual(value);
      expect(DOCK_ADVANCED_PATHS as readonly string[]).toContain(path);
    });
  }

  test("every advanced path has a case above", () => {
    expect(new Set(cases.map((c) => c[2]))).toEqual(new Set(DOCK_ADVANCED_PATHS));
  });

  test("values outside what the Dock accepts are clamped or normalised, never stored raw", () => {
    expect(setMagnification(base, "enormous").dock.magnification).toBe("off");
    expect(setLaunchAnimation(base, "spin").dock.launchAnimation).toBe("lift");
    expect(setMagnificationRange(base, 0).dock.magnificationRange).toBe(1);
    expect(setMagnificationRange(base, 12).dock.magnificationRange).toBe(4);
    expect(setMagnificationRange(base, Number.NaN).dock.magnificationRange).toBe(2);
    expect(setStyleIconSize(base, "slim", 4).dock.iconSizes).toEqual({ slim: STYLE_ICON_MIN });
    expect(setStyleIconSize(base, "slim", 400).dock.iconSizes).toEqual({ slim: STYLE_ICON_MAX });
    expect(setStyleIconSize(base, "slim", 27.6).dock.iconSizes).toEqual({ slim: 28 });
  });
});

describe("pop-out close delay (func.popoutCloseDelay)", () => {
  test("Normal is today's timing and the default; unknown values read as Normal", () => {
    const normal = POPOUT_CLOSE_DELAYS.find((d) => d.id === "normal")!;
    expect([normal.quickSettingsMs, normal.settingsMs]).toEqual([1500, 1800]);
    expect(normalizePopoutCloseDelay(undefined)).toBe("normal");
    expect(normalizePopoutCloseDelay("forever")).toBe("normal");
    expect(setPopoutCloseDelay(sampleConfig(), "forever").func.popoutCloseDelay).toBe("normal");
    expect(POPOUT_CLOSE_DELAYS.map((d) => d.id)).toEqual(["short", "normal", "long"]);
  });

  test("the presets match Lens Core's popout_delays table", () => {
    const rs = readFileSync(join(root, "src-tauri/src/app/watcher.rs"), "utf8");
    const fn = rs.slice(rs.indexOf("pub(crate) fn popout_delays"), rs.indexOf("pub(crate) fn popout_delays") + 400);
    for (const d of POPOUT_CLOSE_DELAYS) {
      if (d.id === "normal") {
        expect(rs).toContain(`pub(crate) const FLYOUT_IDLE_MS: u128 = ${d.quickSettingsMs};`);
        expect(rs).toContain(`pub(crate) const POPOUT_AWAY_MS: u128 = ${d.settingsMs};`);
      } else expect(fn).toContain(`"${d.id}" => (${d.quickSettingsMs}, ${d.settingsMs})`);
    }
    // Both pop-outs use the setting, not the fixed constants.
    expect(rs.match(/popout_delays\(&cfg\.func\.popout_close_delay\)/g)?.length).toBe(2);
  });
});

describe("icon size per Dock style", () => {
  test("a style's own size is what the Dock draws, for every style", () => {
    for (const style of DOCK_STYLES) {
      const next = setStyleIconSize(sampleConfig(), style.id, 30);
      expect(resolveDockIconSize(next.dock, style.id)).toBe(30);
      const v = dockAdvancedView({ ...next, dock: { ...next.dock, style: style.id } });
      expect(v.styleIconSize).toBe(30);
      expect(v.styleIconSizeIsCustom).toBe(true);
      // Every other style still follows the shared size.
      for (const other of DOCK_STYLES) {
        if (other.id === style.id) continue;
        expect(resolveDockIconSize(next.dock, other.id)).toBe(sharedStyleIconSize(next, other.id));
      }
    }
  });

  test("a style's own size can go past the style's usual cap; the shared size cannot", () => {
    const c = sampleConfig();
    expect(sharedStyleIconSize({ ...c, dock: { ...c.dock, iconSize: 54 } }, "slim")).toBe(32);
    expect(resolveDockIconSize(setStyleIconSize(c, "slim", 40).dock, "slim")).toBe(40);
  });

  test("handing a style back removes only its entry and never touches the shared size", () => {
    let c = setStyleIconSize(sampleConfig(), "slim", 28);
    c = setStyleIconSize(c, "taskbar", 30);
    const back = setStyleIconSize(c, "slim", null);
    expect(back.dock.iconSizes).toEqual({ taskbar: 30 });
    expect(back.dock.iconSize).toBe(sampleConfig().dock.iconSize);
    expect(resolveDockIconSize(back.dock, "slim")).toBe(sharedStyleIconSize(back, "slim"));
    expect(dockAdvancedView(back).customSizes.map((s) => s.style)).toEqual(["taskbar"]);
  });

  test("an unknown style id is stored under the style the Dock would use for it", () => {
    expect(setStyleIconSize(sampleConfig(), "nonsense", 30).dock.iconSizes).toEqual({ floating: 30 });
  });
});

describe("dividers", () => {
  test("toggle adds, toggle again removes, order follows the Dock", () => {
    let c = withPins();
    c = toggleSeparatorAfter(c, "c");
    c = toggleSeparatorAfter(c, "a");
    expect(c.dock.separatorsAfter).toEqual(["a", "c"]);
    expect(dockAdvancedView(c).separators).toEqual([
      { id: "a", name: "Alpha", on: true },
      { id: "b", name: "Beta", on: false },
      { id: "c", name: "Gamma", on: true },
    ]);
    c = toggleSeparatorAfter(c, "a");
    expect(c.dock.separatorsAfter).toEqual(["c"]);
  });

  test("ids of apps that were unpinned are dropped on the next change; unknown ids do nothing", () => {
    const c = { ...withPins(), dock: { ...withPins().dock, separatorsAfter: ["gone", "b"] } };
    expect(toggleSeparatorAfter(c, "nope")).toBe(c);
    expect(toggleSeparatorAfter(c, "a").dock.separatorsAfter).toEqual(["a", "b"]);
  });

  test("remove all clears them and is a no-op when there are none", () => {
    const none = withPins();
    expect(clearSeparators(none)).toBe(none);
    expect(clearSeparators(toggleSeparatorAfter(none, "b")).dock.separatorsAfter).toEqual([]);
  });
});

describe("the collapsed section says what is on", () => {
  test("defaults read as a list of what lives here", () => {
    expect(dockAdvancedSummary(dockAdvancedView(sampleConfig()))).toBe("Magnification, launch animation, app names, dividers");
  });
  test("switched-on things are named, at most three, then a count", () => {
    let c = setMagnification(withPins(), "classic");
    expect(dockAdvancedSummary(dockAdvancedView(c))).toBe("Classic magnification");
    c = setLaunchAnimation(c, "bounce");
    c = setShowLabels(c, true);
    c = toggleSeparatorAfter(c, "a");
    c = setStyleIconSize(c, "slim", 28);
    expect(dockAdvancedSummary(dockAdvancedView(c))).toBe("Classic magnification · Bounce launch · App names · +2");
  });
});

describe("the rows exist in Settings and can be found", () => {
  const tab = readFileSync(join(root, "src/themeux/DockTab.tsx"), "utf8");
  test("Dock & Bar has an Advanced section that a deep link opens", () => {
    expect(tab).toContain('<Section id="advanced" title="Advanced"');
    expect(tab).toContain('open={section === "advanced"}');
    expect(resolveTarget("dock#advanced")).toEqual({ page: "dock", section: "advanced" });
    expect(readFileSync(join(root, "src/surfaces/ControlCenterSurface.tsx"), "utf8")).toContain("<DockTab config={config} accent={activeAccentHex} updateConfig={updateConfig} section={section} />");
  });
  test("every setter is wired to a control", () => {
    for (const fn of [
      "setMagnification(", "setMagnificationRange(", "setLaunchAnimation(", "setMinimizeFeedback(", "setShowLabels(", "setScrollCyclesWindows(",
      "setFileDropOpen(", "setMiddleClickNewInstance(", "setAutoClosePopouts(", "setStyleIconSize(", "toggleSeparatorAfter(", "clearSeparators(",
    ]) {
      expect({ fn, wired: tab.includes(`updateConfig(${fn}config`) }).toEqual({ fn, wired: true });
    }
  });
  test("each row has a plain, sentence-case name and settings search finds the section", () => {
    for (const label of ["Magnification", "Launch animation", "Minimise pulse", "Show app names", "Scroll to switch windows", "Drop files on apps", "Middle-click opens a new window", "Close pop-outs when the pointer leaves", "Dividers"]) {
      expect({ label, there: tab.includes(`label="${label}"`) || tab.includes(`>${label}<`) }).toEqual({ label, there: true });
    }
    const keywords = getPage("dock").sections.find((s) => s.id === "advanced")?.keywords ?? [];
    for (const k of ["magnification", "launch animation", "dividers", "app names"]) expect(keywords).toContain(k);
  });
  test("the catalogue lists every advanced setting, so agents and Command reach the same ones", () => {
    const catalogue = JSON.parse(readFileSync(join(root, "src/control/catalogue.json"), "utf8")) as { entries: { path: string }[] };
    const paths = new Set(catalogue.entries.map((e) => e.path));
    for (const p of DOCK_ADVANCED_PATHS) expect({ p, listed: paths.has(p) }).toEqual({ p, listed: true });
  });
});
