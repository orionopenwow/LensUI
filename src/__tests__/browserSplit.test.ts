import { describe, expect, test } from "bun:test";
import { clampRatio, dropSide, pairFor, partnerOf, ratioAt, ratioKey, splitOf, splitRects, SPLIT_GAP, SPLIT_MAX, SPLIT_MIN } from "../browser/split";
import { addIcons, clearIcons, iconFor, rawHost } from "../browser/icons";
import type { BrowserState } from "../browser/api";

const state = (splits: BrowserState["splits"]) => ({ splits } as unknown as BrowserState);

describe("split view model", () => {
  test("rects mirror the core: whole pixels, a gap, the right edge reaches the end", () => {
    for (const [w, r] of [[900, 0.5], [1001, 0.33], [733.5, 0.8], [300, 0.2], [1440, 0.61]] as const) {
      const [a, b] = splitRects({ x: 264, y: 52, w, h: 700 }, r);
      expect(a.x).toBe(264);
      expect(Number.isInteger(a.w)).toBe(true);
      expect(b.x).toBeGreaterThanOrEqual(a.x + a.w + SPLIT_GAP - 0.5);
      expect(Math.abs(b.x + b.w - (264 + w))).toBeLessThan(1);
    }
  });
  test("ratios are clamped and NaN centres", () => {
    expect(clampRatio(0)).toBe(SPLIT_MIN);
    expect(clampRatio(1)).toBe(SPLIT_MAX);
    expect(clampRatio(Number.NaN)).toBe(0.5);
  });
  test("dropping a tab picks the side under the pointer", () => {
    const area = { x: 100, y: 0, w: 800, h: 600 };
    expect(dropSide(120, area)).toBe("left");
    expect(dropSide(880, area)).toBe("right");
    expect(pairFor("left", "a", "b")).toEqual({ left: "b", right: "a" });
    expect(pairFor("right", "a", "b")).toEqual({ left: "a", right: "b" });
    expect(pairFor("right", "a", "a")).toBeNull();
  });
  test("divider follows the pointer and the keyboard", () => {
    const area = { x: 0, y: 0, w: 1006, h: 600 };
    expect(ratioAt(503, area)).toBeCloseTo(0.5, 2);
    expect(ratioAt(-50, area)).toBe(SPLIT_MIN);
    expect(ratioKey("ArrowRight", 0.5)).toBeCloseTo(0.52);
    expect(ratioKey("Home", 0.5)).toBe(SPLIT_MIN);
    expect(ratioKey("5", 0.7)).toBe(0.5);
    expect(ratioKey("x", 0.5)).toBeNull();
  });
  test("finding a tab's split and its partner", () => {
    const s = state([{ left: "a", right: "b", ratio: 0.5 }]);
    expect(splitOf(s, "b")?.left).toBe("a");
    expect(partnerOf(s, "a")).toBe("b");
    expect(partnerOf(s, "c")).toBeNull();
    expect(splitOf(state(undefined), "a")).toBeNull();
  });
});

describe("favicons in the frame", () => {
  test("only data:image URLs are kept, looked up with and without www", () => {
    clearIcons();
    addIcons({ "www.news.example": "data:image/png;base64,AAAA", "evil.example": "https://evil.example/x.png", "js.example": "data:text/html;base64,PHNjcmlwdD4=" });
    expect(iconFor("https://news.example/a")).toBe("data:image/png;base64,AAAA");
    expect(iconFor("https://www.news.example/a")).toBe("data:image/png;base64,AAAA");
    expect(iconFor("https://evil.example/")).toBeNull();
    expect(iconFor("https://js.example/")).toBeNull();
    expect(rawHost("https://User@WWW.A.test:8080/x")).toBe("www.a.test");
    clearIcons();
    expect(iconFor("https://news.example/a")).toBeNull();
  });
});

import { spacesLine } from "../browser/ImportPanel";
describe("import preview line", () => {
  test("names only what the import has", () => {
    expect(spacesLine({ bookmarks: 0, history: 0, openTabs: 0, pinnedTabs: 0, spaces: 3, folders: 12, splits: 2, rules: 1, notes: [] })).toBe("3 spaces · 12 folders · 2 split views · 1 link rule · colours and icons kept");
    expect(spacesLine({ bookmarks: 0, history: 0, openTabs: 0, pinnedTabs: 0, spaces: 0, notes: [] })).toBe("0 spaces");
  });
});
