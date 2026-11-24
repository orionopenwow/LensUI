// Wallpaper Switcher: the picker's pure rules (src/wallpapers/model.ts). The Rust side has its own
// tests for ids, sanitising and "what comes next" (src-tauri/src/wallpapers/tests.rs).
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  EMPTY_META,
  FAN_REACH,
  autoSummary,
  byLightness,
  dHash,
  duplicateGroups,
  fanPose,
  fanWindow,
  fileCard,
  grayFromRgba,
  hamming,
  inSource,
  intervalLabel,
  moveIndex,
  nextFit,
  paletteFromRgba,
  sourceOptions,
  toggleLabel,
  visibleCards,
  type Card,
} from "../wallpapers/model";
import { virtualCards } from "../wallpapers/virtual";
import { parseWallpaperSlash, wallpaperTemplate, isWallpaperStub } from "../wallpapers/command";
import type { AutoChange, LibraryItem } from "../types/generated";

const ROOT = join(import.meta.dir, "..", "..");

const item = (id: string, over: Partial<LibraryItem["meta"]> = {}, kind: "image" | "video" = "image"): LibraryItem => ({
  id,
  path: `C:\\Pics\\${id}.jpg`,
  name: `${id}.jpg`,
  folder: "C:\\Pics",
  kind,
  bytes: 2048,
  modifiedMs: 0,
  thumb: "",
  meta: { ...EMPTY_META, ...over },
});
const card = (id: string, over: Partial<LibraryItem["meta"]> = {}, kind: "image" | "video" = "image"): Card => fileCard(item(id, over, kind));

/** A 9 × 8 grey ramp, optionally nudged, as the indexer would hand it over. */
const ramp = (f: (row: number, col: number) => number) => Array.from({ length: 72 }, (_, i) => f(Math.floor(i / 9), i % 9));

describe("perceptual hash", () => {
  test("is 16 hex digits and stable for the same picture", () => {
    const a = dHash(ramp((r, c) => (r * 9 + c * 31) % 255));
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(dHash(ramp((r, c) => (r * 9 + c * 31) % 255))).toBe(a);
    expect(dHash([1, 2, 3])).toBe("");
  });

  test("a brighter or slightly noisy copy stays close; a different picture does not", () => {
    const base = ramp((r, c) => Math.sin(r * 1.3 + c * 0.9) * 90 + 120);
    const brighter = base.map((v) => v * 1.1 + 6);
    const other = ramp((r, c) => ((r * 7 + c * 13) % 5) * 50);
    expect(hamming(dHash(base), dHash(brighter))).toBe(0);
    expect(hamming(dHash(base), dHash(other))).toBeGreaterThan(12);
    expect(hamming("zz", "00")).toBe(64);
    expect(hamming("ffffffffffffffff", "0000000000000000")).toBe(64);
    expect(hamming("000000000000000f", "0000000000000000")).toBe(4);
  });

  test("grey comes from RGBA", () => {
    expect(grayFromRgba([255, 255, 255, 255, 0, 0, 0, 255]).map(Math.round)).toEqual([255, 0]);
  });

  test("duplicate groups are found for review and singles are left out", () => {
    const groups = duplicateGroups([
      { id: "a", phash: "00000000000000ff" },
      { id: "b", phash: "00000000000000fe" },
      { id: "c", phash: "ffffffff00000000" },
      { id: "d", phash: "" },
      { id: "e", phash: "00000000000000fc" },
    ]);
    expect(groups).toEqual([["a", "b", "e"]]);
  });
});

describe("palette", () => {
  test("picks the common colours and keeps them apart", () => {
    const px: number[] = [];
    const push = (r: number, g: number, b: number, n: number) => {
      for (let i = 0; i < n; i++) px.push(r, g, b, 255);
    };
    push(10, 20, 120, 500);
    push(12, 22, 122, 200); // nearly the same blue: must not take a second chip
    push(240, 200, 40, 300);
    push(20, 160, 90, 100);
    push(0, 0, 0, 0);
    const p = paletteFromRgba(px, 5);
    expect(p[0]).toMatch(/^#0[A-C]1[4-6]7[8-A]$/);
    expect(p.length).toBeGreaterThanOrEqual(3);
    expect(new Set(p).size).toBe(p.length);
    expect(p.every((h) => /^#[0-9A-F]{6}$/.test(h))).toBe(true);
    const sorted = byLightness(p);
    expect(sorted[0]).toBe(p[0]);
  });

  test("transparent pixels are ignored and an empty picture gives nothing", () => {
    expect(paletteFromRgba([255, 0, 0, 0, 255, 0, 0, 10])).toEqual([]);
  });
});

describe("library filtering", () => {
  const cards = [
    card("a", { favorite: true, tags: ["Sea"] }),
    card("b", { collections: ["Calm"], phash: "00000000000000ff" }),
    card("c", { hidden: true, favorite: true }),
    card("d", { phash: "00000000000000fe" }, "video"),
  ];

  test("sources", () => {
    const ids = (source: string, q = "") => visibleCards(cards, source, q).map((c) => c.id);
    expect(ids("")).toEqual(["a", "b", "d"]);
    expect(ids("favorites")).toEqual(["a"]);
    expect(ids("c:calm")).toEqual(["b"]);
    expect(ids("t:sea")).toEqual(["a"]);
    expect(ids("hidden")).toEqual(["c"]);
    expect(ids("live")).toEqual(["d"]);
    expect(ids("", "sea")).toEqual(["a"]);
    expect(ids("", "pics video")).toEqual(["d"]);
    expect(inSource(cards[2], "favorites")).toBe(false);
  });

  test("look-alikes are listed group by group", () => {
    const groups = duplicateGroups(cards.map((c) => ({ id: c.id, phash: c.meta.phash })));
    expect(visibleCards(cards, "dupes", "", groups).map((c) => c.id)).toEqual(["b", "d"]);
    const opts = sourceOptions({ folders: [], collections: ["Empty"], auto: {} as AutoChange, ofTheDay: false }, cards, groups);
    expect(opts.map((o) => o.id)).toEqual(["", "favorites", "live", "c:Calm", "c:Empty", "t:Sea", "dupes", "hidden"]);
    expect(opts.find((o) => o.id === "c:Empty")?.count).toBe(0);
    expect(opts.find((o) => o.id === "hidden")?.count).toBe(1);
  });

  test("labels toggle without caring about case", () => {
    expect(toggleLabel(["Sea"], "sea")).toEqual([]);
    expect(toggleLabel(["Sea"], " Dunes ")).toEqual(["Sea", "Dunes"]);
    expect(toggleLabel(["Sea"], "  ")).toEqual(["Sea"]);
    expect(toggleLabel([], "a:b")).toEqual(["ab"]);
  });

  test("Lens' own backdrops and living themes are in the library, never hidden by default", () => {
    const live = virtualCards();
    expect(live.length).toBeGreaterThan(20);
    expect(live.some((c) => c.kind === "living" && c.id === "living:living-sky")).toBe(true);
    expect(live.some((c) => c.kind === "preset")).toBe(true);
    expect(live.every((c) => c.palette.length === 5 && c.art.includes("gradient") && !c.meta.hidden)).toBe(true);
    expect(new Set(live.map((c) => c.id)).size).toBe(live.length);
  });
});

describe("the fan", () => {
  test("the middle card faces you; neighbours fall back, turn inward and dim", () => {
    const mid = fanPose(0);
    expect(mid).toMatchObject({ x: 0, z: 0, turn: 0, scale: 1, dim: 0, opacity: 1 });
    let prev = mid;
    for (let d = 1; d <= FAN_REACH; d++) {
      const right = fanPose(d);
      const left = fanPose(-d);
      expect(right.x).toBeGreaterThan(prev.x);
      expect(right.z).toBeLessThan(prev.z);
      expect(right.layer).toBeLessThan(prev.layer);
      expect(right.dim).toBeGreaterThan(prev.dim);
      expect(right.scale).toBeLessThan(prev.scale);
      // Cards stay solid while they are in the fan: see-through cards read as washed out.
      expect(right.opacity).toBe(1);
      expect(left.x).toBeCloseTo(-right.x);
      expect(left.turn).toBeCloseTo(-right.turn);
      expect(right.turn).toBeLessThan(0);
      prev = right;
    }
    // It curves: each step sideways is shorter than the one before.
    expect(fanPose(2).x - fanPose(1).x).toBeLessThan(fanPose(1).x);
    expect(fanPose(3).x - fanPose(2).x).toBeLessThan(fanPose(2).x - fanPose(1).x);
    expect(fanPose(FAN_REACH + 1).opacity).toBe(0);
    expect(fanPose(40)).toEqual(fanPose(FAN_REACH + 1));
  });

  test("moving stops at the ends and only nearby cards are mounted", () => {
    expect(moveIndex(0, -1, 10)).toBe(0);
    expect(moveIndex(9, 1, 10)).toBe(9);
    expect(moveIndex(3, 2, 10)).toBe(5);
    expect(moveIndex(3, 2, 0)).toBe(0);
    expect(fanWindow(0, 100)).toEqual([0, FAN_REACH + 1]);
    expect(fanWindow(50, 100)).toEqual([50 - FAN_REACH - 1, 50 + FAN_REACH + 1]);
    expect(fanWindow(99, 100)[1]).toBe(99);
  });
});

describe("words", () => {
  const auto: AutoChange = {
    enabled: true,
    everyMinutes: 30,
    atSignIn: false,
    order: "random",
    source: "",
    dayNight: false,
    daySource: "",
    nightSource: "",
    dayHour: 7,
    nightHour: 19,
    crossfadeMs: 900,
  };

  test("auto-change says what it will do", () => {
    expect(autoSummary({ ...auto, enabled: false })).toBe("Off");
    expect(autoSummary(auto)).toBe("Every 30 minutes · shuffled · from everything");
    expect(autoSummary({ ...auto, everyMinutes: 0, atSignIn: true, order: "inOrder", source: "c:Calm" })).toBe("When Lens starts · in order · from Calm");
    expect(autoSummary({ ...auto, dayNight: true, daySource: "c:Bright", nightSource: "favorites" })).toContain("Bright by day, favourites at night");
    expect(intervalLabel(60)).toBe("Every hour");
    expect(intervalLabel(240)).toBe("Every 4 hours");
    expect(intervalLabel(1440)).toBe("Once a day");
    expect(nextFit("cover")).toBe("contain");
    expect(nextFit("center")).toBe("cover");
    expect(nextFit("nonsense")).toBe("cover");
  });

  test("/wallpaper understands next, previous, random and open", () => {
    expect(parseWallpaperSlash("")).toBe("open");
    expect(parseWallpaperSlash("next")).toBe("next");
    expect(parseWallpaperSlash(" Previous ")).toBe("prev");
    expect(parseWallpaperSlash("back")).toBe("prev");
    expect(parseWallpaperSlash("shuffle")).toBe("random");
    expect(parseWallpaperSlash("surprise me")).toBe("random");
    expect(parseWallpaperSlash("picker")).toBe("open");
    const [t] = wallpaperTemplate([{ id: "note" }]);
    expect(t.id).toBe("wallpaper");
    expect(isWallpaperStub(t)).toBe(true);
    expect(isWallpaperStub({ id: "wallpaper" })).toBe(false);
    expect(wallpaperTemplate([{ id: "wallpaper" }])).toEqual([]);
  });
});

describe("safety", () => {
  const rust = readFileSync(join(ROOT, "src-tauri", "src", "wallpapers", "mod.rs"), "utf8");
  const cmds = readFileSync(join(ROOT, "src-tauri", "src", "commands", "wallpapers.rs"), "utf8");

  test("the switcher never writes the Windows wallpaper or the registry", () => {
    for (const text of [rust, cmds]) {
      expect(text).not.toMatch(/SPI_SET|SystemParametersInfo|RegSetValue|Command::new/);
    }
    expect(rust).toContain("win_wallpaper::save_settings");
  });

  test("it is registered with Remove all, and deleting needs a yes and goes to the Recycle Bin", () => {
    const registry = readFileSync(join(ROOT, "src-tauri", "src", "changes.rs"), "utf8");
    expect(registry).toContain('id: "wallpaper-switcher"');
    expect(registry.indexOf('id: "wallpaper-switcher"')).toBeLessThan(registry.indexOf('id: "wallpaper"'));
    expect(registry).toContain("crate::wallpapers::undo()");
    expect(cmds).toMatch(/if !confirmed \{\s*return Err/);
    expect(rust).toContain("crate::cleaner::win::recycle");
    expect(rust).not.toMatch(/remove_dir_all|fs::remove_dir\b/);
  });

  test("auto-change and wallpaper of the day are off by default", () => {
    expect(rust).toMatch(/impl Default for AutoChange[\s\S]*?enabled: false/);
    expect(rust).toMatch(/Wallpaper of the day\. OFF by default/);
  });
});
