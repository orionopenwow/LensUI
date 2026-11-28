// Lens Browser stock themes, new-tab backdrops and the welcome: a theme only changes colours,
// the Rust and TS backdrop lists agree, and the welcome names what is new.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { applyTheme, BACKDROP_IDS, backdropCss, matchingTheme, STOCK_THEMES } from "../browser/themes";
import { applyDraft, initialDraft, NOVEL, summary, TOUR } from "../browser/setupFlow";
import { DEFAULT_APPEARANCE, type BrowserSettings } from "../browser/api";

const base: BrowserSettings = { sleepAfterMin: 15, maxLiveTabs: 6, searchUrl: "https://duckduckgo.com/?q={q}", blockTrackers: true, lensContextMenu: true, defaultZoom: 1, setupSeen: false };

describe("browser themes", () => {
  test("ids are unique, every backdrop exists, and the default look is the Lens theme", () => {
    expect(new Set(STOCK_THEMES.map((t) => t.id)).size).toBe(STOCK_THEMES.length);
    expect(STOCK_THEMES.length).toBeGreaterThanOrEqual(10);
    for (const t of STOCK_THEMES) expect(BACKDROP_IDS).toContain(t.patch.backdrop);
    expect(matchingTheme(DEFAULT_APPEARANCE)?.id).toBe("lens");
    expect(STOCK_THEMES[0].id).toBe("lens");
  });
  test("a theme changes colours and texture only", () => {
    const mine = { ...DEFAULT_APPEARANCE, tabsLayout: "horizontal" as const, density: "compact" as const, typeface: "serif" as const, tabTint: true };
    const next = applyTheme(mine, "aurora");
    expect(next.scheme).toBe("dark");
    expect(next.backdrop).toBe("aurora");
    expect(next.theme).toBe("aurora");
    expect(next.tabsLayout).toBe("horizontal");
    expect(next.density).toBe("compact");
    expect(next.typeface).toBe("serif");
    expect(next.tabTint).toBe(true);
    expect(matchingTheme(next)?.id).toBe("aurora");
    expect(applyTheme(mine, "nope")).toBe(mine);
  });
  test("accents are valid colours", () => {
    for (const t of STOCK_THEMES) if (t.patch.accent) expect(t.patch.accent).toMatch(/^#[0-9a-f]{6}$/i);
  });
  test("unknown backdrops draw nothing", () => {
    expect(backdropCss("nope")).toBe("none");
    expect(backdropCss("aurora")).toContain("gradient");
  });
  test("the Rust model accepts exactly the same backdrops", () => {
    const rs = readFileSync(new URL("../../src-tauri/src/browser/model.rs", import.meta.url), "utf8");
    const m = /pub const BACKDROPS: \[&str; \d+\] = \[([^\]]+)\]/.exec(rs);
    expect(m).not.toBeNull();
    const ids = [...m![1].matchAll(/"([a-z-]+)"/g)].map((x) => x[1]);
    expect([...ids].sort()).toEqual([...BACKDROP_IDS].sort());
  });
});

describe("browser setup: welcome, tour and theme", () => {
  test("the welcome names what is new and the tour covers each of them", () => {
    expect(NOVEL.map((n) => n.id)).toEqual(["ai", "magic", "brain", "agents", "colour"]);
    expect(TOUR.map((t) => t.id)).toEqual(NOVEL.map((n) => n.id));
    for (const t of TOUR) expect(t.tries.length).toBeGreaterThan(0);
  });
  test("a theme picked in setup is written on Done, and only then", () => {
    const d = { ...initialDraft(base), theme: "paper" };
    const next = applyDraft(base, d);
    expect(next.appearance?.scheme).toBe("light");
    expect(next.appearance?.theme).toBe("paper");
    expect(summary(d, base)).toContain("Paper theme");
    // Keeping the current theme leaves its colours alone (the person may have tweaked them).
    const tweaked: BrowserSettings = { ...base, appearance: { ...DEFAULT_APPEARANCE, accent: "#123456" } };
    expect(applyDraft(tweaked, initialDraft(tweaked)).appearance?.accent).toBe("#123456");
  });
});
