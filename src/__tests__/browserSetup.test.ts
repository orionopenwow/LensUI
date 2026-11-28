// Lens Browser setup: nothing changes until Done; Skip writes only "seen"; the summary is plain.
import { describe, expect, test } from "bun:test";
import { applyDraft, initialDraft, SEARCH_ENGINES, SENDS, skipSettings, stepAfter, STEPS, summary } from "../browser/setupFlow";
import type { BrowserSettings } from "../browser/api";

const base: BrowserSettings = { sleepAfterMin: 15, maxLiveTabs: 6, searchUrl: "https://duckduckgo.com/?q={q}", blockTrackers: true, lensContextMenu: true, defaultZoom: 1, pageMarks: true, setupSeen: false };

describe("browser setup", () => {
  test("the draft starts from the current settings", () => {
    const d = initialDraft(base);
    expect(d).toEqual({ importFrom: null, tabsLayout: "vertical", tabStyle: "dynamic", blockTrackers: true, searchUrl: base.searchUrl, aiEnabled: true, theme: "lens" });
  });
  test("skip changes nothing but seen", () => {
    const next = skipSettings(base);
    expect(next).toEqual({ ...base, setupSeen: true });
  });
  test("done writes exactly the choices, and keeps everything else", () => {
    const d = { ...initialDraft(base), tabsLayout: "horizontal" as const, tabStyle: "compact" as const, blockTrackers: false, searchUrl: "https://www.startpage.com/do/search?q={q}", aiEnabled: false };
    const next = applyDraft(base, d);
    expect(next.setupSeen).toBe(true);
    expect(next.appearance?.tabsLayout).toBe("horizontal");
    expect(next.appearance?.tabStyle).toBe("compact");
    expect(next.blockTrackers).toBe(false);
    expect(next.searchUrl).toBe("https://www.startpage.com/do/search?q={q}");
    expect(next.ai?.enabled).toBe(false);
    expect(next.pageMarks).toBe(true);
    expect(next.sleepAfterMin).toBe(15);
    // An unknown engine is never written.
    expect(applyDraft(base, { ...d, searchUrl: "https://evil.example/?q={q}" }).searchUrl).toBe(base.searchUrl);
  });
  test("engines are listed alphabetically, none recommended", () => {
    const names = SEARCH_ENGINES.map((e) => e.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    expect(SEARCH_ENGINES.every((e) => e.url.includes("{q}") && e.url.startsWith("https://"))).toBe(true);
    expect(SEARCH_ENGINES.some((e) => /recommend/i.test(e.note))).toBe(false);
  });
  test("steps go forward and back, clamped; five choices and a summary", () => {
    expect(STEPS.length).toBe(6);
    expect(stepAfter("welcome", -1)).toBe("welcome");
    expect(stepAfter("ai", 1)).toBe("done");
    expect(stepAfter("done", 1)).toBe("done");
    const lines = summary({ ...initialDraft(base), importFrom: { browser: "arc", profile: "arc", label: "Arc" } }, base);
    expect(lines[0]).toContain("Arc");
    expect(lines.some((l) => /unchanged/.test(l))).toBe(true);
  });
  test("what Lens Browser sends is spelled out", () => {
    expect(SENDS.map((s) => s.to)).toEqual(["easylist.to", "the site you visited", "github.com (Lens releases)"]);
  });
});
