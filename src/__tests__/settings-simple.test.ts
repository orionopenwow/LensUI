import { describe, expect, test } from "bun:test";
import {
  SIMPLE_CARD_PAGES,
  SIMPLE_NAV,
  SIMPLE_RESETS,
  effectiveMode,
  hasSimpleCards,
  inSimpleNav,
  isAdvancedHit,
  modeUnchosen,
  morePages,
  moreStartsOpen,
  moreSummary,
} from "../settings/simple/mode";
import { PAGES } from "../settings/registry";
import { buildIndex, search } from "../settings/search";
import { sampleConfig as makeConfig } from "./fixtures";

describe("Settings Simple / Advanced", () => {
  test("new users start Simple, people who finished setup keep Advanced", () => {
    expect(effectiveMode({ settingsMode: "", onboardingCompleted: false })).toBe("simple");
    expect(effectiveMode({ settingsMode: "", onboardingCompleted: true })).toBe("advanced");
    expect(effectiveMode({ settingsMode: "simple", onboardingCompleted: true })).toBe("simple");
    expect(effectiveMode({ settingsMode: "advanced", onboardingCompleted: false })).toBe("advanced");
    expect(modeUnchosen({ settingsMode: "" })).toBe(true);
    expect(modeUnchosen({ settingsMode: "simple" })).toBe(false);
  });

  test("Simple sidebar keeps the core pages and folds the rest", () => {
    for (const id of SIMPLE_NAV) expect(PAGES.some((p) => p.id === id)).toBe(true);
    expect(SIMPLE_NAV[0]).toBe("quick");
    expect(SIMPLE_NAV.length).toBeLessThanOrEqual(10);
    const folded = morePages().map((p) => p.id);
    expect(folded).toContain("gaming");
    expect(folded).toContain("privacy");
    expect(folded).not.toContain("appearance");
    expect(folded.length + SIMPLE_NAV.length).toBe(PAGES.length);
    for (const id of SIMPLE_CARD_PAGES) expect(inSimpleNav(id)).toBe(true);
  });

  test("search finds advanced settings and tags them in Simple mode only", () => {
    const index = buildIndex();
    const gaming = search("game mode", index, 9).find((r) => r.page === "gaming");
    expect(gaming).toBeTruthy();
    expect(isAdvancedHit("simple", "gaming")).toBe(true);
    expect(isAdvancedHit("advanced", "gaming")).toBe(false);
    // A section on a card page lives under "More options".
    expect(isAdvancedHit("simple", "appearance", "pointer")).toBe(true);
    expect(isAdvancedHit("simple", "appearance")).toBe(false);
    // Windows pages in the Simple list show as they are.
    expect(isAdvancedHit("simple", "sound", "mixer")).toBe(false);
  });

  test("an advanced result opens More options", () => {
    expect(moreStartsOpen("simple", "appearance", "pointer")).toBe(true);
    expect(moreStartsOpen("simple", "appearance")).toBe(false);
    expect(moreStartsOpen("advanced", "appearance")).toBe(true);
    expect(moreStartsOpen("simple", "sound")).toBe(true);
    expect(hasSimpleCards("sound")).toBe(false);
  });

  test("More options summary names the page's sections", () => {
    const s = moreSummary("ai");
    expect(s.count).toBeGreaterThan(4);
    expect(s.text).toMatch(/more$/);
    expect(moreSummary("dock").text).toContain("dock style");
  });

  test("Reset puts the Simple cards back to defaults, keeping the Windows button order", () => {
    const c = makeConfig();
    c.dock = { ...c.dock, iconSize: 54, autoHide: "always", position: "left" };
    const d = SIMPLE_RESETS.dock!(c);
    expect(d.dock.iconSize).toBe(40);
    expect(d.dock.autoHide).toBe("never");
    expect(d.dock.position).toBe("bottom");
    c.windowControls = { ...c.windowControls, order: "red-yellow-green", enabled: false };
    const k = SIMPLE_RESETS.keys!(c);
    expect(k.windowControls.order).toBe("yellow-green-red");
    expect(k.windowControls.enabled).toBe(true);
  });
});
