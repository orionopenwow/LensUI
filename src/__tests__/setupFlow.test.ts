// Lens setup (docs/SETUP.md): when it opens, and that Skip and Finish write only what they say.
import { describe, expect, it, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  applyChoices,
  compareVersions,
  describeChoices,
  EXTRAS,
  STORE_PIN,
  extrasFor,
  looksFor,
  markSeen,
  NO_CHOICES,
  setupReason,
  suggestFromDesktop,
  isLightLook,
  DEFAULT_DARK_LOOK,
  DEFAULT_LIGHT_LOOK,
  whatsNewSince,
  type SetupStatus,
} from "../setup/flow";
import { packById } from "../themes/packs";
import { FEATURED_LOOKS } from "../themes/featured";
import { sampleConfig } from "./fixtures";
import { parseChangelog, render } from "../../tools/setup/whats-new.mjs";

const status = (s: Partial<SetupStatus>): SetupStatus => ({ version: "0.3.0", seenVersion: "", onboardingCompleted: false, forced: false, ...s });

/** Every leaf path whose value differs between two configs. */
function changedPaths(a: unknown, b: unknown, prefix = ""): string[] {
  if (JSON.stringify(a) === JSON.stringify(b)) return [];
  if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) {
    const keys = new Set([...Object.keys(a as object), ...Object.keys(b as object)]);
    return [...keys].flatMap((k) => changedPaths((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], prefix ? `${prefix}.${k}` : k));
  }
  return [prefix];
}

describe("when setup opens", () => {
  test("first launch, a new version, or the launcher asking; never otherwise", () => {
    expect(setupReason(status({}))).toBe("first");
    expect(setupReason(status({ onboardingCompleted: true, seenVersion: "0.3.0" }))).toBeNull();
    expect(setupReason(status({ onboardingCompleted: true, seenVersion: "0.2.0" }))).toBe("update");
    expect(setupReason(status({ onboardingCompleted: true, seenVersion: "" }))).toBe("update");
    expect(setupReason(status({ onboardingCompleted: true, seenVersion: "0.3.0", forced: true }))).toBe("forced");
    expect(setupReason(null)).toBeNull();
  });

  test("versions compare numerically", () => {
    expect(compareVersions("0.10.0", "0.9.2")).toBe(1);
    expect(compareVersions("0.3.0", "0.3.0")).toBe(0);
    expect(compareVersions("", "0.1.0")).toBe(-1);
  });
});

describe("Skip and Finish", () => {
  test("skipping (no choices) changes only the seen markers", () => {
    const base = { ...sampleConfig(), onboardingCompleted: false, setupSeenVersion: "" };
    const out = applyChoices(base, NO_CHOICES, "0.3.0");
    expect(changedPaths(base, out).sort()).toEqual(["onboardingCompleted", "setupSeenVersion"]);
    expect(markSeen(base, "0.3.0")).toEqual(out);
  });

  test("the setup's defaults are the floating Dock: skipping never changes the Dock", () => {
    const base = sampleConfig();
    expect(applyChoices(base, NO_CHOICES, "0.3.0").dock).toEqual(base.dock);
  });

  test("Finish writes only the picked keys", () => {
    const base = sampleConfig();
    const out = applyChoices(base, { extras: { runOnStartup: true }, dockEdge: "left" }, "0.3.0");
    expect(out.func.runOnStartup).toBe(true);
    expect(out.dock.position).toBe("left");
    for (const p of changedPaths(base, out)) expect(["dock.position", "func.runOnStartup", "onboardingCompleted", "setupSeenVersion"]).toContain(p);
  });

  test("a look never changes the Dock unless a Dock was picked", () => {
    const base = sampleConfig();
    const look = FEATURED_LOOKS.find((l) => l.dock.style !== base.dock.style)!;
    const out = applyChoices(base, { extras: {}, look: look.id }, "0.3.0");
    expect(out.theme.preset).toBe(look.id);
    expect(out.dock.style).toBe(base.dock.style);
    const picked = applyChoices(base, { extras: {}, look: look.id, dockStyle: "taskbar" }, "0.3.0");
    expect(picked.dock.style).toBe("taskbar");
  });

  test("Day & night sets a schedule with one light and one dark look", () => {
    const out = applyChoices(sampleConfig(), { extras: {}, look: "catppuccin-mocha", scheme: "auto" }, "0.3.0");
    expect(out.themeSchedule?.enabled).toBe(true);
    expect(out.themeSchedule?.nightPack).toBe("catppuccin-mocha");
    expect(out.themeSchedule?.dayPack).toBe("alabaster-daylight");
  });

  test("an accent choice sets custom or Windows accent", () => {
    expect(applyChoices(sampleConfig(), { extras: {}, accent: "#22c55e" }, "1").theme).toMatchObject({ accentMode: "custom", customAccent: "#22c55e" });
    expect(applyChoices(sampleConfig(), { extras: {}, accent: "windows" }, "1").theme.accentMode).toBe("windows");
  });
});

describe("Apps page", () => {
  const timer = { id: "lens-app-timer", name: "Lens Timer", path: "lens-app:timer", iconHint: null };
  const notes = { id: "lens-app-notes", name: "Lens Notes", path: "lens-app:notes", iconHint: null };

  test("ticked Lens apps are added to the Dock, after the ones already pinned, and only once", () => {
    const base = sampleConfig();
    const before = base.dock.pinnedApps ?? [];
    const out = applyChoices(base, { extras: {}, pins: [timer, notes, timer] }, "1");
    expect(out.dock.pinnedApps).toEqual([...before, timer, notes]);
    expect(changedPaths(base, out).filter((p) => !["onboardingCompleted", "setupSeenVersion"].includes(p))).toEqual(["dock.pinnedApps"]);
  });

  test("an app that is already pinned is not pinned twice", () => {
    const base = { ...sampleConfig(), dock: { ...sampleConfig().dock, pinnedApps: [timer] } };
    expect(applyChoices(base, { extras: {}, pins: [timer] }, "1").dock.pinnedApps).toEqual([timer]);
  });

  test("Lens Apps goes on the Dock once, and widgets follow the switch", () => {
    const base = sampleConfig();
    const out = applyChoices(base, { extras: {}, pinStore: true, widgets: true }, "1");
    expect(out.dock.pinnedApps.filter((p) => p.path === STORE_PIN.path)).toHaveLength(1);
    expect(out.magicWaves?.desktopWidgets).toBe(true);
    expect(applyChoices(out, { extras: {}, pinStore: true }, "1").dock.pinnedApps.filter((p) => p.path === STORE_PIN.path)).toHaveLength(1);
    expect(applyChoices(out, { extras: {}, widgets: false }, "1").magicWaves?.desktopWidgets).toBe(false);
    expect(describeChoices({ extras: {}, pinStore: true, widgets: true }, (id) => id, (id) => id)).toEqual(["Lens Apps on the Dock: on", "Desktop widgets: on"]);
  });

  test("the Done page lists what gets pinned", () => {
    expect(describeChoices({ extras: {}, pins: [timer, notes] }, (id) => id, (id) => id)).toEqual(["Pin to the Dock: Lens Timer, Lens Notes"]);
    expect(describeChoices({ extras: {}, pins: [] }, (id) => id, (id) => id)).toEqual([]);
  });
});

describe("pages", () => {
  test("light and dark lists split the featured looks", () => {
    const light = looksFor("light").map((l) => l.id);
    const dark = looksFor("dark").map((l) => l.id);
    expect(light.length + dark.length).toBe(FEATURED_LOOKS.length);
    expect(light).toContain("alabaster-daylight");
    expect(dark).toContain("obsidian");
  });

  test("an update offers only extras added since the last setup, and never ones already on", () => {
    const cfg = { ...sampleConfig(), func: { ...sampleConfig().func, runOnStartup: true } };
    expect(extrasFor("first", "", cfg).map((e) => e.id)).not.toContain("runOnStartup");
    expect(extrasFor("update", "0.3.0", cfg)).toEqual([]);
    const newer = [...EXTRAS, { ...EXTRAS[0], id: "tester" as const, since: "0.4.0" }];
    expect(extrasFor("update", "0.3.0", sampleConfig(), newer).map((e) => e.since)).toEqual(["0.4.0"]);
  });

  test("What's new lists versions after the last one seen, up to the running one", () => {
    const rel = (version: string) => ({ version, date: "", sections: [{ title: "Added", items: [version] }] });
    const all = [rel("0.4.0"), rel("0.3.0"), rel("0.2.0")];
    expect(whatsNewSince("0.2.0", "0.3.0", all).map((r) => r.version)).toEqual(["0.3.0"]);
    expect(whatsNewSince("0.1.0", "0.4.0", all).map((r) => r.version)).toEqual(["0.4.0", "0.3.0", "0.2.0"]);
    expect(whatsNewSince("", "0.4.0", all).map((r) => r.version)).toEqual(["0.4.0"]);
  });

  test("src/setup/whatsNew.ts matches CHANGELOG.md (run node tools/setup/whats-new.mjs)", () => {
    const root = join(import.meta.dir, "../..");
    const expected = render(parseChangelog(readFileSync(join(root, "CHANGELOG.md"), "utf8")));
    expect(readFileSync(join(root, "src/setup/whatsNew.ts"), "utf8")).toBe(expected);
  });
});

describe("setup starts from the person's desktop colours", () => {
  const looks = FEATURED_LOOKS.map((l) => ({ id: l.id, accent: packById(l.id)?.accent ?? "#888888" }));
  it("follows Windows' light or dark app mode", () => {
    expect(suggestFromDesktop({ windowsAccent: "#0078D4", wallpaperAccent: null, lightApps: false }, looks).scheme).toBe("dark");
    expect(suggestFromDesktop({ windowsAccent: "#0078D4", wallpaperAccent: null, lightApps: true }, looks).scheme).toBe("light");
  });
  it("starts from the wallpaper's colour, else follows Windows", () => {
    expect(suggestFromDesktop({ windowsAccent: "#0078D4", wallpaperAccent: "#E0457B", lightApps: false }, looks).accent).toBe("#E0457B");
    expect(suggestFromDesktop({ windowsAccent: "#0078D4", wallpaperAccent: null, lightApps: false }, looks).accent).toBe("windows");
  });
  it("picks a look of the right scheme, and the neutral default for a grey desktop", () => {
    for (const lightApps of [false, true]) {
      const s = suggestFromDesktop({ windowsAccent: "#3A7BD5", wallpaperAccent: "#3A7BD5", lightApps }, looks);
      expect(isLightLook(s.look)).toBe(lightApps);
    }
    expect(suggestFromDesktop({ windowsAccent: "#808080", wallpaperAccent: null, lightApps: false }, looks).look).toBe(DEFAULT_DARK_LOOK);
    expect(suggestFromDesktop({ windowsAccent: "#808080", wallpaperAccent: null, lightApps: true }, looks).look).toBe(DEFAULT_LIGHT_LOOK);
  });
  it("is only a draft: applying no choices leaves the config untouched", () => {
    const cfg = sampleConfig();
    expect(applyChoices(cfg, NO_CHOICES, "")).toEqual(markSeen(cfg, ""));
  });
});
