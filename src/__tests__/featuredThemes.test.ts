import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { allPacks, contrastRatio, lighten, packById } from "../themes/packs";
import { NEAR_DUPLICATE, packBase, packDistance } from "../themes/distance";
import { FEATURED_LOOKS, applyFeaturedLook, familyOf, featuredPacks, isFeatured, lookApplied, lookDistance, lookPack, lookScene, morePacks } from "../themes/featured";
import { AMBIENT_SCENES } from "../playground/ambient/scenes";
import { DOCK_STYLES } from "../dock/styles";
import { buildAudit } from "../../tools/themes/audit";
import { sampleConfig } from "./fixtures";

const DEFAULT_CONFIG = sampleConfig();

describe("featured looks", () => {
  test("twelve looks, each on a real pack, no pack twice", () => {
    expect(FEATURED_LOOKS.length).toBe(12);
    expect(new Set(FEATURED_LOOKS.map((l) => l.id)).size).toBe(12);
    for (const l of FEATURED_LOOKS) expect({ id: l.id, pack: !!packById(l.id) }).toEqual({ id: l.id, pack: true });
  });

  test("unmistakably different: every pair is at least 1.5× the near-duplicate line apart", () => {
    for (const a of FEATURED_LOOKS) for (const b of FEATURED_LOOKS) {
      if (a.id >= b.id) continue;
      expect({ pair: `${a.id} ~ ${b.id}`, far: lookDistance(a, b) >= NEAR_DUPLICATE * 1.5 }).toEqual({ pair: `${a.id} ~ ${b.id}`, far: true });
    }
  });

  test("each has its own animated backdrop and a Dock style Lens knows", () => {
    const scenes = FEATURED_LOOKS.map(lookScene);
    expect(new Set(scenes).size).toBe(scenes.length);
    const ambient = new Set(AMBIENT_SCENES.map((s) => s.id));
    const docks = new Set(DOCK_STYLES.map((d) => d.id));
    for (const l of FEATURED_LOOKS) {
      const scene = lookScene(l);
      expect({ id: l.id, scene: ambient.has(scene) || scene === l.id }).toEqual({ id: l.id, scene: true });
      expect({ id: l.id, dock: docks.has(l.dock.style) }).toEqual({ id: l.id, dock: true });
      expect(l.glass).toBeGreaterThanOrEqual(0.4);
      expect(l.glass).toBeLessThanOrEqual(1);
      expect(l.character.length).toBeGreaterThan(20);
      expect(l.character.length).toBeLessThan(70);
    }
  });

  test("contrast: text 4.5:1 and accent 3:1 on the surface and on cards", () => {
    for (const l of FEATURED_LOOKS) {
      const p = packById(l.id)!;
      const base = packBase(p);
      const light = p.scheme === "light";
      const text = light ? "#18181B" : "#FAFAFA";
      const card = light ? "#FFFFFF" : lighten(base, 0.045);
      const got = {
        id: l.id,
        textOnBase: contrastRatio(text, base) >= 4.5,
        textOnCard: contrastRatio(text, card) >= 4.5,
        accentOnBase: contrastRatio(p.accent, base) >= 3,
        accentOnCard: contrastRatio(p.accent, card) >= 3,
      };
      expect(got).toEqual({ id: l.id, textOnBase: true, textOnCard: true, accentOnBase: true, accentOnCard: true });
    }
  });

  test("applying a look sets everything it defines, in one config, and can be undone", () => {
    const before = DEFAULT_CONFIG;
    for (const l of FEATURED_LOOKS) {
      const after = applyFeaturedLook(before, l.id);
      expect(after.theme.preset).toBe(l.id);
      expect(after.theme.fontFamily).toBe(l.font);
      expect(after.theme.glassOpacity).toBe(l.glass);
      expect(after.theme.blurPx).toBe(l.blur);
      expect(after.dock.style).toBe(l.dock.style);
      expect(after.dock.magnification).toBe(l.dock.magnification);
      expect(after.dock.launchAnimation).toBe(l.dock.launch);
      expect(after.windowControls.frameStyle).toBe(lookPack(l).frameStyle);
      expect(lookApplied(after, l.id)).toBe(true);
      // Nothing outside the look moves: pins, hotkeys and the button order stay.
      expect(after.dock.pinnedApps).toEqual(before.dock.pinnedApps);
      expect(after.func).toEqual(before.func);
      expect(after.windowControls.order).toBe(before.windowControls.order);
    }
    expect(before.theme.preset).toBe(DEFAULT_CONFIG.theme.preset); // input untouched: undo = re-apply `before`
    expect(applyFeaturedLook(before, "tokyo-night").theme.preset).toBe("tokyo-night"); // not featured: plain pack
  });
});

describe("more themes", () => {
  test("every other pack is kept and filed under a featured family", () => {
    const more = morePacks();
    expect(more.length).toBe(allPacks().length - 12);
    const featured = new Set(featuredPacks().map((p) => p.id));
    for (const p of more) {
      expect(isFeatured(p.id)).toBe(false);
      const fam = familyOf(p);
      expect(featured.has(fam.id)).toBe(true);
      // The family really is the closest featured look.
      for (const f of featuredPacks()) expect(packDistance(p, fam)).toBeLessThanOrEqual(packDistance(p, f) + 1e-9);
    }
  });

  test("community packs keep their credit and link", () => {
    for (const p of morePacks().filter((x) => x.tier === "Community")) {
      expect({ id: p.id, credited: !!p.source?.author && /^https:\/\//.test(p.source?.url ?? "") }).toEqual({ id: p.id, credited: true });
    }
  });
});

test("docs/THEMES_AUDIT.md is current (bun tools/themes/audit.ts)", () => {
  const doc = readFileSync(join(import.meta.dir, "../../docs/THEMES_AUDIT.md"), "utf8");
  expect(doc).toBe(buildAudit());
});
