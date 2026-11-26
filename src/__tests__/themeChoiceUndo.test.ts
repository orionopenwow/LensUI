// B-39: going back to the first theme choice restores every setting exactly, including the ones a
// pack sets besides colours (folder colours, pinned-folder colours) and the Day & night schedule.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { LensConfig } from "../types/lens";
import { chooseTheme, restoreThemeOwned, sameThemeOwned, themeOwned, type ThemeChoiceRun } from "../themes/choiceUndo";
import { applyFeaturedLook, FEATURED_LOOKS } from "../themes/featured";
import { allPacks, applyThemePack } from "../themes/packs";
import { readSchedule } from "../themes/schedule";
import { sampleConfig } from "./fixtures";

/** A person's own setup: a pack whose folder colours, icons and frame they changed by hand. */
function personal(): LensConfig {
  const base = applyThemePack(sampleConfig(), "obsidian");
  return {
    ...base,
    theme: { ...base.theme, customAccent: "#12AB34", borderRadius: 13, glassOpacity: 0.81, blurPx: 7, fontFamily: "segoe" },
    iconStyle: { theme: "monochrome", shape: "circle" },
    windowControls: { ...base.windowControls, style: "accent-pills", frameStyle: "none" },
    folderStyle: { theme: "rose", globalExplorerOverride: true },
    dock: {
      ...base.dock,
      pinnedFolders: [
        { id: "f1", name: "Work", path: "C:\\Work", theme: "cobalt", viewMode: "grid" },
        { id: "f2", name: "Play", path: "C:\\Play", theme: "amber", viewMode: "fan" },
      ],
    },
  };
}

const newRun = (): { run: ThemeChoiceRun | null } => ({ run: null });
const pick = (config: LensConfig, id: string, run: { run: ThemeChoiceRun | null }) => chooseTheme(config, (c) => applyFeaturedLook(c, id), run);

/** What Lens hands back after saving: 32-bit floats and `null` for a setting that is not there. */
function roundTrip(config: LensConfig): LensConfig {
  const f32 = (n: number) => Math.fround(n);
  return {
    ...config,
    theme: { ...config.theme, glassOpacity: f32(config.theme.glassOpacity), accentTintStrength: f32(config.theme.accentTintStrength) },
    dock: { ...config.dock, hoverScale: f32(config.dock.hoverScale) },
    themeSchedule: config.themeSchedule ?? null,
  };
}

describe("theme choices: going back restores exactly (B-39)", () => {
  test("every pack: first → pack → first restores the whole config", () => {
    const start = personal();
    for (const pack of allPacks()) {
      if (pack.id === start.theme.preset) continue;
      const run = newRun();
      const away = pick(start, pack.id, run);
      expect(away.theme.preset).toBe(pack.id);
      expect(away.folderStyle?.theme).toBe(pack.folderTheme);
      const back = pick(away, start.theme.preset, run);
      expect(back).toEqual(start);
      // Byte for byte, key order included (the hyper suite compares the saved text).
      expect(JSON.stringify(back)).toBe(JSON.stringify(start));
    }
  });

  test("every pack as the starting point, through two others and back", () => {
    const ids = allPacks().map((p) => p.id);
    ids.forEach((id, i) => {
      const start = { ...personal(), theme: { ...personal().theme, preset: id } };
      const run = newRun();
      let config = pick(start, ids[(i + 1) % ids.length], run);
      config = pick(config, ids[(i + 2) % ids.length], run);
      expect(pick(config, id, run)).toEqual(start);
    });
  });

  test("it also works across a save round trip between clicks", () => {
    const start = roundTrip(personal());
    const run = newRun();
    let config = roundTrip(pick(start, "catppuccin-mocha", run));
    config = roundTrip(pick(config, "paper-minimal", run));
    expect(pick(config, "obsidian", run)).toEqual(start);
  });

  test("plain pack apply without the wrapper is what used to leave folder colours behind", () => {
    const start = personal();
    const back = applyThemePack(applyThemePack(start, "tokyo-night"), "obsidian");
    expect(back.folderStyle?.theme).not.toBe("rose");
    expect(back.dock.pinnedFolders.map((f) => f.theme)).not.toEqual(["cobalt", "amber"]);
  });

  test("the other pack is applied in full while away", () => {
    const start = personal();
    const away = pick(start, "tokyo-night", newRun());
    expect(away).toEqual(applyFeaturedLook(start, "tokyo-night"));
  });

  test("Dark → Day & night → Dark leaves no schedule behind", () => {
    const start = personal();
    expect(start.themeSchedule).toBeUndefined();
    const run = newRun();
    const mode = (config: LensConfig, enabled: boolean) =>
      chooseTheme(config, (c) => ({ ...c, themeSchedule: { ...readSchedule(c), dayPack: "alabaster-daylight", nightPack: "obsidian", enabled } }), run);
    const auto = mode(start, true);
    expect(auto.themeSchedule?.enabled).toBe(true);
    const back = mode(auto, false);
    expect(back).toEqual(start);
    expect("themeSchedule" in back).toBe(false);
  });

  test("Dark → Light → Day & night → Dark restores folder colours and the schedule", () => {
    const start = { ...personal(), themeSchedule: { ...readSchedule(personal()), mode: "sun" as const, latitude: 51.5, longitude: -0.1 } };
    const run = newRun();
    const light = chooseTheme(start, (c) => applyThemePack({ ...c, themeSchedule: { ...readSchedule(c), enabled: false } }, "alabaster-daylight"), run);
    const auto = chooseTheme(light, (c) => ({ ...c, themeSchedule: { ...readSchedule(c), dayPack: "alabaster-daylight", nightPack: "obsidian", enabled: true } }), run);
    const dark = chooseTheme(auto, (c) => applyThemePack({ ...c, themeSchedule: { ...readSchedule(c), enabled: false } }, "obsidian"), run);
    expect(dark).toEqual(start);
  });

  test("a deliberate change in between is kept: the run starts again from it", () => {
    const start = personal();
    const run = newRun();
    const away = pick(start, "nord-frost", run);
    // The person picks a folder colour by hand while on the second theme.
    const edited: LensConfig = { ...away, folderStyle: { ...away.folderStyle!, theme: "emerald" } };
    const back = pick(edited, "obsidian", run);
    // Not rolled back to "rose": obsidian's own folder colour, as a fresh choice.
    expect(back.folderStyle?.theme).toBe(applyThemePack(edited, "obsidian").folderStyle?.theme);
    // And that fresh run restores the edited state when they return to it.
    expect(pick(back, "nord-frost", run)).toEqual(edited);
  });

  test("settings a theme does not own are never touched by the restore", () => {
    const start = personal();
    const run = newRun();
    const away = pick(start, "gruvbox-warm", run);
    const moved: LensConfig = { ...away, dock: { ...away.dock, iconSize: 48, style: "slim" } as LensConfig["dock"], func: { ...away.func, gamingPause: false } };
    const back = pick(moved, "obsidian", run);
    expect(back.dock.iconSize).toBe(48);
    expect(back.dock.style).toBe("slim");
    expect(back.func.gamingPause).toBe(false);
    expect(themeOwned(back)).toEqual(themeOwned(start));
  });

  test("a folder pinned while away keeps its colour; the others get theirs back", () => {
    const start = personal();
    const run = newRun();
    const away = pick(start, "everforest", run);
    const pinned: LensConfig = { ...away, dock: { ...away.dock, pinnedFolders: [...away.dock.pinnedFolders, { id: "f3", name: "New", path: "C:\\New", theme: "accent", viewMode: "grid" }] } };
    // Pinning changed theme-owned state (a new folder colour), so this is a new run: a fresh apply.
    const back = pick(pinned, "obsidian", run);
    expect(back.dock.pinnedFolders).toHaveLength(3);
    // restoreThemeOwned itself leaves unknown folders alone.
    const restored = restoreThemeOwned(pinned, themeOwned(start));
    expect(restored.dock.pinnedFolders.map((f) => f.theme)).toEqual(["cobalt", "amber", "accent"]);
  });

  test("an unknown theme id changes nothing and does not start a run", () => {
    const start = personal();
    const run = newRun();
    expect(pick(start, "does-not-exist", run)).toBe(start);
  });

  test("the comparison allows for 32-bit floats and null, and nothing looser", () => {
    expect(sameThemeOwned({ a: 0.92, b: undefined }, { a: Math.fround(0.92), b: null })).toBe(true);
    expect(sameThemeOwned({ a: 0.92 }, { a: 0.93 })).toBe(false);
    expect(sameThemeOwned({ a: "x" }, { a: "y" })).toBe(false);
    expect(sameThemeOwned([1, 2], [1])).toBe(false);
    expect(sameThemeOwned({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(sameThemeOwned(null, undefined)).toBe(true);
    expect(sameThemeOwned(null, {})).toBe(false);
  });

  test("all twelve featured looks, clicked in order and back to the start", () => {
    const start = personal();
    const run = newRun();
    let config = start;
    for (const look of FEATURED_LOOKS) if (look.id !== "obsidian") config = pick(config, look.id, run);
    expect(pick(config, "obsidian", run)).toEqual(start);
  });

  test("every theme picker in Settings and Quick Settings goes through chooseTheme", () => {
    const src = (path: string) => readFileSync(join(import.meta.dir, "..", path), "utf8");
    for (const [file, count] of [
      ["themeux/ThemeTab.tsx", 2],
      ["settings/simple/SimpleView.tsx", 2],
      ["settings/pages/QuickPage.tsx", 2],
      ["surfaces/QuickSettingsSurface.tsx", 1],
      ["surfaces/ControlCenterSurface.tsx", 1],
      ["themes/living/LivingThemesRow.tsx", 1],
    ] as const) {
      expect(src(file).split("chooseTheme(config,").length - 1).toBe(count);
    }
  });
});
