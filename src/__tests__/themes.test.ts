// Theme packs, .lenstheme import/export, custom packs and the day/night schedule.
import { describe, expect, mock, test } from "bun:test";
import { sampleConfig } from "./fixtures";

const files: Record<string, string> = {};
mock.module("@tauri-apps/api/core", () => ({
  convertFileSrc: (p: string) => `asset://localhost/${encodeURIComponent(p)}`,
  transformCallback: () => 0,
  invoke: async (cmd: string, args?: { name?: string }) => {
    if (cmd === "list_theme_files_cmd") return Object.keys(files).map((name) => ({ name, path: `C:\\t\\${name}` }));
    if (cmd === "read_theme_file_cmd") return files[args?.name ?? ""];
    return null;
  },
}));

const packs = await import("../themes/packs");
const { exportLensTheme, exportLensThemeAsCustomPack, importLensTheme } = await import("../themes/lenstheme");
const { loadCustomPacksFromDisk, ensurePackLoaded } = await import("../themes/customPacks");
const schedule = await import("../themes/schedule");

describe("theme packs", () => {
  test("ids are unique and every built-in pack is internally consistent", () => {
    const ids = packs.THEME_PACKS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    const folderIds = packs.FOLDER_THEMES.map((f) => f.id);
    const frameIds = packs.FRAME_STYLES.map((f) => f.id);
    for (const p of packs.THEME_PACKS) {
      expect(p.accent).toMatch(/^#[0-9A-F]{6}$/);
      if (p.base) expect(p.base).toMatch(/^#[0-9A-F]{6}$/);
      expect(p.radius).toBeGreaterThanOrEqual(0);
      expect(p.radius).toBeLessThanOrEqual(20);
      expect(packs.ICON_THEMES).toContain(p.iconTheme);
      expect(packs.ICON_SHAPES).toContain(p.iconShape);
      expect(packs.CONTROL_STYLES).toContain(p.controlStyle);
      expect(folderIds).toContain(p.folderTheme);
      expect(frameIds).toContain(p.frameStyle);
    }
  });
  test("text stays readable on every pack surface", () => {
    for (const p of packs.THEME_PACKS) {
      const base = p.base ?? "#09090B";
      const ink = p.scheme === "light" ? "#18181B" : "#FAFAFA";
      expect(packs.contrastRatio(base, ink)).toBeGreaterThanOrEqual(4.5);
    }
  });
  test("aliases resolve", () => {
    expect(packs.packByAlias("Catppuccin")?.id).toBe("catppuccin-mocha");
    expect(packs.packByAlias(" nord ")?.id).toBe("nord-frost");
    expect(packs.packByAlias("nope")).toBeUndefined();
  });
  test("applyThemePack sets every part of the look at once and ignores unknown ids", () => {
    const cfg = sampleConfig();
    const next = packs.applyThemePack(cfg, "tokyo-night");
    expect(next.theme.preset).toBe("tokyo-night");
    expect(next.theme.customAccent).toBe("#7AA2F7");
    expect(next.theme.surfaceHex).toBe("#1A1B26");
    expect(next.theme.borderRadius).toBe(10);
    expect(next.iconStyle).toEqual({ theme: "obsidian-squircle", shape: "squircle" });
    expect(next.windowControls.frameStyle).toBe("accent-glow");
    expect(packs.applyThemePack(cfg, "does-not-exist")).toBe(cfg);
    expect(cfg.theme.preset).toBe("obsidian"); // input not mutated
  });
  test("every built-in pack has a description, a known dock style and a distinct look", () => {
    const dockIds = ["floating", "slim", "taskbar", "studio", "minimal", "split", "islands"];
    const looks = new Set<string>();
    for (const p of packs.THEME_PACKS) {
      expect(p.description && p.description.length).toBeGreaterThan(10);
      expect(dockIds).toContain(p.dockStyle);
      looks.add(`${p.base ?? "#09090B"}|${p.accent}`);
    }
    expect(looks.size).toBe(packs.THEME_PACKS.length);
  });
  test("exactly six recommended packs, including at least one light pack", () => {
    const rec = packs.recommendedPacks();
    expect(rec.length).toBe(6);
    expect(rec.some((p) => p.scheme === "light")).toBe(true);
  });
  test("applying any pack or featured look never changes the Dock", async () => {
    const { applyFeaturedLook } = await import("../themes/featured");
    const cfg = sampleConfig();
    const before = JSON.stringify(cfg.dock);
    for (const p of packs.allPacks()) {
      for (const opts of [{}, { withFontAndShape: true }]) {
        expect(JSON.stringify(packs.applyThemePack(cfg, p.id, opts).dock.style)).toBe(JSON.stringify(cfg.dock.style));
        const next = applyFeaturedLook(cfg, p.id, opts);
        const { pinnedFolders: _a, ...restNext } = next.dock;
        const { pinnedFolders: _b, ...restBefore } = JSON.parse(before);
        expect(JSON.stringify(restNext)).toBe(JSON.stringify(restBefore));
      }
    }
  });
  test("lighten and swatch", () => {
    expect(packs.lighten("#000000", 0.5)).toBe("#808080");
    expect(packs.lighten("bad", 0.5)).toBe("bad");
    expect(packs.packSwatch(packs.packById("obsidian")!)).toContain("#27272A");
  });
});

describe("custom packs", () => {
  test("validation accepts a readable pack and normalises it", () => {
    const p = packs.validateCustomPack({ id: "My Dusk!", base: "#101820", accent: "#ff8800", radius: 99, iconTheme: "bogus" });
    expect(p).not.toBeNull();
    expect(p!.id).toBe("custom-my-dusk");
    expect(p!.accent).toBe("#FF8800");
    expect(p!.radius).toBe(20);
    expect(p!.iconTheme).toBe("obsidian-squircle");
    expect(p!.tier).toBe("Custom");
  });
  test("validation rejects bad colours, empty ids and unreadable schemes", () => {
    expect(packs.validateCustomPack(null)).toBeNull();
    expect(packs.validateCustomPack([])).toBeNull();
    expect(packs.validateCustomPack({ id: "x", base: "red", accent: "#FFFFFF" })).toBeNull();
    expect(packs.validateCustomPack({ id: "!!!", base: "#101010", accent: "#FFFFFF" })).toBeNull();
    // Light scheme forced onto a dark surface: dark text on dark background.
    expect(packs.validateCustomPack({ id: "x", base: "#101010", accent: "#FFFFFF", scheme: "light" })).toBeNull();
    // Light surfaces are detected automatically.
    expect(packs.validateCustomPack({ id: "paper2", base: "#FAFAFA", accent: "#2563EB" })?.scheme).toBe("light");
  });
  test("register / list / unregister", () => {
    const p = packs.registerCustomPack({ id: "zz-temp", base: "#101820", accent: "#00FF88" })!;
    expect(packs.packById(p.id)).toEqual(p);
    expect(packs.allPacks().at(-1)?.id).toBe(p.id);
    packs.unregisterCustomPack(p.id);
    expect(packs.packById(p.id)).toBeUndefined();
  });
  test("customPackDefinition round-trips through validation", () => {
    const p = packs.validateCustomPack({ id: "round", label: "Round Trip", base: "#1A1B26", accent: "#BB9AF7", radius: 6 })!;
    expect(packs.validateCustomPack(packs.customPackDefinition(p))).toEqual(p);
  });
});

describe(".lenstheme", () => {
  test("export then import restores the look", () => {
    const styled = packs.applyThemePack(sampleConfig(), "nord-frost");
    const file = exportLensTheme(styled, "Nordish");
    expect(file.lenstheme).toBe(1);
    expect(file.pack).toBeUndefined();
    const restored = importLensTheme(sampleConfig(), JSON.parse(JSON.stringify(file)));
    expect(restored.theme.preset).toBe("nord-frost");
    expect(restored.theme.customAccent).toBe(styled.theme.customAccent);
    expect(restored.windowControls.frameStyle).toBe(styled.windowControls.frameStyle);
  });
  test("import clamps hostile values to the safe ranges", () => {
    const cfg = importLensTheme(sampleConfig(), {
      lenstheme: 1,
      theme: { preset: "<script>", accentMode: "x", customAccent: "javascript:", glassOpacity: 0.01, blurPx: 999, borderRadius: -5, accentTintStrength: 9, uiScale: 1000 },
    });
    expect(cfg.theme.preset).toBe("obsidian");
    expect(cfg.theme.accentMode).toBe("custom");
    expect(cfg.theme.customAccent).toBe("#FAFAFA");
    expect(cfg.theme.glassOpacity).toBe(0.4);
    expect(cfg.theme.blurPx).toBe(60);
    expect(cfg.theme.borderRadius).toBe(0);
    expect(cfg.theme.accentTintStrength).toBe(0.5);
    expect(cfg.theme.uiScale).toBe(130);
  });
  test("import rejects files that are not themes or carry a broken pack", () => {
    expect(() => importLensTheme(sampleConfig(), { theme: {} })).toThrow();
    expect(() => importLensTheme(sampleConfig(), "x")).toThrow();
    expect(() => importLensTheme(sampleConfig(), { lenstheme: 1, theme: {}, pack: { base: "nope" } })).toThrow();
  });
  test("a custom pack travels inside the file", () => {
    const file = exportLensThemeAsCustomPack(sampleConfig(), "Harbor", { base: "#0B1D2A", accent: "#4FD1C5" });
    expect(file.theme.preset).toBe("custom-harbor");
    expect(file.pack?.base).toBe("#0B1D2A");
    packs.unregisterCustomPack("custom-harbor");
    const cfg = importLensTheme(sampleConfig(), JSON.parse(JSON.stringify(file)));
    expect(cfg.theme.preset).toBe("custom-harbor");
    expect(cfg.theme.surfaceHex).toBe("#0B1D2A");
    expect(() => exportLensThemeAsCustomPack(sampleConfig(), "Bad", { base: "#zzzzzz" })).toThrow();
  });
});

describe("custom packs from disk", () => {
  test("valid files register, broken files are skipped", async () => {
    files["a.lenstheme"] = JSON.stringify({ lenstheme: 1, pack: { id: "disk-a", base: "#151515", accent: "#E11D48" } });
    files["b.lenstheme"] = "{ not json";
    files["c.lenstheme"] = JSON.stringify({ lenstheme: 1, pack: { id: "disk-c", base: "#151515", accent: "nope" } });
    expect(await loadCustomPacksFromDisk()).toBe(1);
    expect(packs.packById("custom-disk-a")).toBeDefined();
    expect(await ensurePackLoaded("obsidian")).toBe(true);
  });
});

describe("schedule", () => {
  test("readSchedule fills defaults and sanitises", () => {
    const s = schedule.readSchedule({ ...sampleConfig(), themeSchedule: { enabled: true, mode: "sun", dayStart: "25:00", latitude: 200, longitude: -500 } } as never);
    expect(s.enabled).toBe(true);
    expect(s.mode).toBe("sun");
    expect(s.dayStart).toBe("07:00");
    expect(s.latitude).toBe(90);
    expect(s.longitude).toBe(-180);
    expect(schedule.readSchedule(null)).toEqual(schedule.DEFAULT_THEME_SCHEDULE);
  });
  test("parseClock", () => {
    expect(schedule.parseClock("07:30")).toBe(450);
    expect(schedule.parseClock(" 7:05 ")).toBe(425);
    expect(schedule.parseClock("24:00")).toBeNull();
    expect(schedule.parseClock("7pm")).toBeNull();
  });
  test("fixed mode, including a day that wraps past midnight", () => {
    const s = { ...schedule.DEFAULT_THEME_SCHEDULE, enabled: true };
    const at = (h: number, m = 0) => new Date(2026, 5, 1, h, m);
    expect(schedule.packForNow(s, at(12))).toBe(s.dayPack);
    expect(schedule.packForNow(s, at(19))).toBe(s.nightPack);
    expect(schedule.packForNow(s, at(6, 59))).toBe(s.nightPack);
    const wrap = { ...s, dayStart: "22:00", nightStart: "06:00" };
    expect(schedule.isDaytime(wrap, at(23))).toBe(true);
    expect(schedule.isDaytime(wrap, at(12))).toBe(false);
    expect(schedule.packForNow({ ...s, enabled: false }, at(12))).toBeNull();
  });
  test("sun times are plausible and handle polar day / night", () => {
    // London, summer solstice: sunrise ~03:43 UTC, sunset ~20:21 UTC.
    const t = schedule.sunTimes(new Date(Date.UTC(2026, 5, 21, 12)), 51.5, -0.12);
    expect(t.polar).toBeNull();
    const rise = t.sunrise!.getUTCHours() * 60 + t.sunrise!.getUTCMinutes();
    const set = t.sunset!.getUTCHours() * 60 + t.sunset!.getUTCMinutes();
    expect(Math.abs(rise - (3 * 60 + 43))).toBeLessThan(10);
    expect(Math.abs(set - (20 * 60 + 21))).toBeLessThan(10);
    expect(schedule.sunTimes(new Date(Date.UTC(2026, 5, 21, 12)), 80, 0).polar).toBe("day");
    expect(schedule.sunTimes(new Date(Date.UTC(2026, 11, 21, 12)), 80, 0).polar).toBe("night");
  });
});

describe("dock style picker", () => {
  test("a pick changes only the style and its icon size", async () => {
    const { configForStyle } = await import("../dock/useStylePick");
    const cfg = sampleConfig();
    const next = configForStyle(cfg, "slim");
    expect(next.dock.style).toBe("slim");
    expect(next.theme).toEqual(cfg.theme);
    expect(configForStyle(cfg, "no-such-style")).toBe(cfg);
  });
});

// Themes are colours and materials only (#95), so packs that differed just in the Dock they were
// drawn with are one theme on screen. They are merged, not deleted (docs/THEMES_AUDIT.md "Merged").
describe("near-duplicate packs that only differed by Dock are merged", () => {
  const { MERGED_PACKS, isMergedPack, allPacks, packById, packByAlias, applyThemePack, THEME_PACKS, COMMUNITY_PACKS } = packs;

  test("the Dock is not part of how different two packs are", async () => {
    const { distanceParts, packDistance } = await import("../themes/distance");
    const a = packById("obsidian")!;
    expect(packDistance(a, { ...a, dockStyle: "taskbar" })).toBe(0);
    expect(Object.keys(distanceParts(a, a))).not.toContain("dock");
  });

  test("every merged pack is the same on screen as the pack it was folded into", async () => {
    const { packDistance, distanceParts, SAME_ON_SCREEN } = await import("../themes/distance");
    expect(Object.keys(MERGED_PACKS).length).toBeGreaterThanOrEqual(2);
    for (const [gone, kept] of Object.entries(MERGED_PACKS)) {
      const a = packById(gone)!;
      const b = packById(kept)!;
      expect(a).toBeDefined();
      expect(b).toBeDefined();
      expect(isMergedPack(kept)).toBe(false); // no chains
      expect(packDistance(a, b)).toBeLessThan(SAME_ON_SCREEN);
      const parts = distanceParts(a, b);
      expect(parts.base).toBe(0);
      expect(parts.scheme).toBe(0);
      expect(parts.chrome).toBe(0);
      // Same collection and credit, so nobody's work is hidden behind someone else's name.
      expect(a.collection).toBe(b.collection);
      expect(a.source?.url).toBe(b.source?.url);
    }
  });

  test("no two listed built-in packs are the same on screen", async () => {
    const { packDistance, SAME_ON_SCREEN } = await import("../themes/distance");
    const listed = allPacks().filter((p) => p.tier !== "Custom");
    for (let i = 0; i < listed.length; i++) for (let j = i + 1; j < listed.length; j++) {
      const d = packDistance(listed[i], listed[j]);
      expect({ pair: `${listed[i].id} ~ ${listed[j].id}`, distinct: d >= SAME_ON_SCREEN }).toEqual({ pair: `${listed[i].id} ~ ${listed[j].id}`, distinct: true });
    }
  });

  test("merged packs are not listed, but their ids and names still work", () => {
    const listed = new Set(allPacks().map((p) => p.id));
    for (const [gone, kept] of Object.entries(MERGED_PACKS)) {
      expect(listed.has(gone)).toBe(false);
      expect(listed.has(kept)).toBe(true);
      // A config, schedule or .lenstheme that names the merged pack keeps its exact colours.
      const pack = packById(gone)!;
      const applied = applyThemePack(sampleConfig(), gone);
      expect(applied.theme.preset).toBe(gone);
      expect(applied.theme.customAccent).toBe(pack.accent);
      expect(applied.theme.surfaceHex).toBe(pack.base ?? "");
      // Asking by name gets the pack that is still listed.
      for (const alias of pack.aliases) expect(packByAlias(alias)?.id).toBe(kept);
      expect(packByAlias(gone)?.id).toBe(kept);
    }
    expect(packByAlias("crt")?.id).toBe("cc-retro-green");
    expect(packByAlias("claude light brand")?.id).toBe("cc-claude-light");
    // Nothing else left the list.
    const builtIn = allPacks().filter((p) => p.tier !== "Custom");
    const living = builtIn.filter((p) => p.tier === "Living").length;
    expect(builtIn.length).toBe(THEME_PACKS.length + living + COMMUNITY_PACKS.length - Object.keys(MERGED_PACKS).length);
  });

  test("a featured look's pack carries no Dock style", async () => {
    const { FEATURED_LOOKS, lookPack } = await import("../themes/featured");
    const plain = new Map(packs.THEME_PACKS.map((p) => [p.id, p.dockStyle]));
    for (const look of FEATURED_LOOKS) {
      if (!plain.has(look.id)) continue;
      expect(lookPack(look).dockStyle).toBe(plain.get(look.id));
    }
  });
});
