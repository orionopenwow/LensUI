// Lens Expressive + Lens Dot Matrix style layers: shapes, glyphs, islands geometry, packs and contrast.
import { describe, expect, test } from "bun:test";
import { SHAPE_IDS, shapePath, shapeSvg, normalizeShapeStyle, onAccentFor, contrast, SHAPE_STYLES } from "../themes/shapes/shapes";
import { DOT_GLYPHS, REQUIRED_GLYPHS, layoutDots, DOT_PICTOGRAMS, layoutPictogram } from "../themes/dotmatrix/glyphs";
import { islandsLayout, islandsValid } from "../dock/islands/layout";
import { THEME_PACKS, applyThemePack, lighten, packById, recommendedPacks } from "../themes/packs";
import { DOCK_STYLES, normalizeDockStyle, dockStyleInfo } from "../dock/styles";
import { sampleConfig } from "./fixtures";

describe("shape set", () => {
  test("every shape is a closed path and deterministic", () => {
    for (const id of SHAPE_IDS) {
      const a = shapePath(id);
      expect(a.startsWith("M")).toBe(true);
      expect(a.endsWith("Z")).toBe(true);
      expect(shapePath(id)).toBe(a);
      expect(shapeSvg(id)).toContain(a);
      expect(a).not.toContain("NaN");
    }
  });
  test("options are clamped and change the shape", () => {
    expect(shapePath("cookie", { lobes: 99 })).toBe(shapePath("cookie", { lobes: 16 }));
    expect(shapePath("cookie", { lobes: 8 })).not.toBe(shapePath("cookie", { lobes: 12 }));
    expect(shapePath("squircle", { exponent: 0 })).toBe(shapePath("squircle", { exponent: 2 }));
  });
  test("cookie points stay inside the 100×100 box", () => {
    const nums = shapePath("cookie").match(/-?\d+(\.\d+)?/g)!.map(Number);
    for (const n of nums) {
      expect(n).toBeGreaterThanOrEqual(-1);
      expect(n).toBeLessThanOrEqual(101);
    }
  });
  test("style names normalise", () => {
    expect(normalizeShapeStyle("expressive")).toBe("expressive");
    expect(normalizeShapeStyle("dotmatrix")).toBe("dotmatrix");
    expect(normalizeShapeStyle("bogus")).toBe("classic");
    expect(normalizeShapeStyle(undefined)).toBe("classic");
    expect(SHAPE_STYLES.map((s) => s.id)).toEqual(["classic", "expressive", "dotmatrix"]);
  });
});

describe("dot matrix glyphs", () => {
  test("every required glyph exists and is a well-formed 7-row grid", () => {
    for (const ch of REQUIRED_GLYPHS) {
      const g = DOT_GLYPHS[ch];
      expect(g, `glyph ${ch}`).toBeDefined();
      expect(g.length).toBe(7);
      const w = g[0].length;
      for (const row of g) {
        expect(row.length).toBe(w);
        expect(row).toMatch(/^[#.]+$/);
      }
      if (ch !== " ") expect(g.join("")).toContain("#");
    }
  });
  test("digits and letters are distinct (zero and O share a shape, as on LED displays)", () => {
    const seen = new Map<string, string>();
    for (const ch of REQUIRED_GLYPHS) {
      if (ch === "O") continue;
      const key = DOT_GLYPHS[ch].join("|");
      expect(seen.has(key), `${ch} duplicates ${seen.get(key)}`).toBe(false);
      seen.set(key, ch);
    }
  });
  test("layout is deterministic, case-insensitive and spaces glyphs", () => {
    const a = layoutDots("07:32");
    expect(layoutDots("07:32")).toEqual(a);
    expect(a.cols).toBe(5 + 1 + 5 + 1 + 1 + 1 + 5 + 1 + 5);
    expect(layoutDots("abc")).toEqual(layoutDots("ABC"));
    expect(layoutDots("~").dots.length).toBe(0);
  });
  test("weather pictograms are 7×7 and non-empty", () => {
    for (const [kind, g] of Object.entries(DOT_PICTOGRAMS)) {
      expect(g.length).toBe(7);
      for (const row of g) expect(row.length).toBe(7);
      expect(layoutPictogram(kind as never).dots.length).toBeGreaterThan(8);
    }
  });
});

describe("islands dock geometry", () => {
  for (const width of [1366, 1920]) {
    test(`fits without overlap at ${width}px, top and bottom`, () => {
      for (const edge of ["bottom", "top"] as const) {
        const l = islandsLayout({ width, edge, left: 180, apps: 420, chips: 220, right: 260 });
        expect(islandsValid(l, width)).toBe(true);
        expect(l.islands.map((i) => i.id)).toEqual(["left", "apps", "chips", "right"]);
        const apps = l.islands.find((i) => i.id === "apps")!;
        expect(Math.abs(apps.x + apps.w / 2 - width / 2)).toBeLessThanOrEqual(200);
        expect(l.reserved).toBe(48 + 16);
      }
    });
  }
  test("empty sections are hidden", () => {
    const l = islandsLayout({ width: 1920, left: 0, apps: 300, right: 200 });
    expect(l.islands.map((i) => i.id)).toEqual(["apps", "right"]);
  });
  test("apps shrink instead of overlapping, and chips drop first", () => {
    const l = islandsLayout({ width: 900, left: 200, apps: 900, chips: 200, right: 200 });
    expect(islandsValid(l, 900)).toBe(true);
    expect(l.appsCompressed).toBe(true);
    expect(l.islands.some((i) => i.id === "chips")).toBe(false);
  });
  test("islands is a registered full-width dock style", () => {
    expect(DOCK_STYLES.some((s) => s.id === "islands")).toBe(true);
    expect(normalizeDockStyle("islands")).toBe("islands");
    expect(dockStyleInfo("islands").fullWidth).toBe(true);
  });
});

describe("Lens Expressive / Dot Matrix packs", () => {
  test("packs exist, use Lens colours, bring their shape style and keep six recommended", () => {
    const ex = packById("lens-expressive")!;
    const dm = packById("lens-dot-matrix")!;
    const exl = packById("lens-expressive-light")!;
    expect(ex.shapeStyle).toBe("expressive");
    expect(dm.shapeStyle).toBe("dotmatrix");
    expect(exl.scheme).toBe("light");
    for (const p of [ex, dm, exl]) expect(p.dockStyle).toBe("islands");
    expect(recommendedPacks().length).toBe(6);
    // The shape style comes along only when the person asks for the look's font and shape.
    expect(applyThemePack(sampleConfig(), "lens-expressive").theme.shapeStyle).toBe(sampleConfig().theme.shapeStyle);
    const cfg = applyThemePack(sampleConfig(), "lens-expressive", { withFontAndShape: true });
    expect(cfg.theme.shapeStyle).toBe("expressive");
    // A pack without a shape style keeps the user's choice.
    const kept = applyThemePack({ ...cfg, theme: { ...cfg.theme, shapeStyle: "dotmatrix" } }, "nord-frost");
    expect(kept.theme.shapeStyle).toBe("dotmatrix");
  });
  test("on-accent text is readable on every pack accent (Expressive active pills)", () => {
    for (const p of THEME_PACKS) {
      expect(contrast(p.accent, onAccentFor(p.accent)), p.id).toBeGreaterThanOrEqual(4.5);
    }
  });
  test("body text stays readable on Expressive and Dot Matrix raised surfaces for every pack", () => {
    for (const p of THEME_PACKS) {
      const base = p.base ?? "#09090B";
      const light = p.scheme === "light";
      // Expressive elev-3 / Dot Matrix surface-2: the pack's elevated layer mixed up to 12 % toward ink.
      const elevated = light ? "#FFFFFF" : lighten(base, 0.045);
      const raised = light ? elevated : lighten(elevated, 0.12);
      const fg = light ? "#18181B" : "#FAFAFA";
      expect(contrast(raised, fg), p.id).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("active fill", () => {
  test("an accent that vanishes into the surface falls back to the text colour", async () => {
    const { activeFillFor } = await import("../themes/shapes/shapes");
    expect(activeFillFor("#FAFAFA", "#EEEEF0")).toBe("#18181B");
    expect(activeFillFor("#0B0B0E", "#09090B")).toBe("#FAFAFA");
    expect(activeFillFor("#2563EB", "#EEEEF0")).toBe("#2563EB");
    expect(activeFillFor("#FAFAFA", undefined)).toBe("#FAFAFA");
  });
  test("every pack accent yields a visible active fill with readable on-accent text", async () => {
    const { activeFillFor } = await import("../themes/shapes/shapes");
    for (const p of THEME_PACKS) {
      const base = p.base ?? "#09090B";
      const fill = activeFillFor(p.accent, base);
      expect(contrast(fill, base), p.id).toBeGreaterThanOrEqual(1.6);
      expect(contrast(fill, onAccentFor(fill)), p.id).toBeGreaterThanOrEqual(4.5);
    }
  });
});
