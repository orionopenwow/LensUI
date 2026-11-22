// Lens Mini: app-aware tiles, edge-shelf geometry.
import { describe, expect, mock, test } from "bun:test";

// Other test files mock @tauri-apps/api/core without transformCallback; stub event/window too so
// modules that import them load in any order.
mock.module("@tauri-apps/api/core", () => ({ invoke: async () => null, transformCallback: () => 0 }));
mock.module("@tauri-apps/api/event", () => ({ listen: async () => () => {}, emit: async () => {} }));

const { DEFAULT_TILES, categorize, moveTile, tilesFor } = await import("../command/contextProviders");
const { DEFAULT_EDGE, contains, hitRect, offsetFromPoint, panelRect, tabRect, tabVisible } = await import("../command/mini/edgeGeometry");
type EdgeSettings = import("../command/mini/edgeGeometry").EdgeSettings;
type Rect = import("../command/mini/edgeGeometry").Rect;
const { normaliseCommandSettings } = await import("../command/settings");


describe("app categories (same table as clip/appctx.rs)", () => {
  test("maps processes by file name, case-insensitively", () => {
    expect(categorize("C:\\Users\\u\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe")).toBe("code");
    expect(categorize("EXPLORER.EXE")).toBe("explorer");
    expect(categorize("msedge.exe")).toBe("browser");
    expect(categorize("WINWORD.EXE")).toBe("office");
    expect(categorize("WindowsTerminal.exe")).toBe("terminal");
    expect(categorize("notepad.exe")).toBe("notes");
    expect(categorize("Slack.exe")).toBe("chat");
    expect(categorize("game.exe")).toBe("other");
    expect(categorize("")).toBe("other");
  });
  test("every category offers six tiles", () => {
    for (const [cat, tiles] of Object.entries(DEFAULT_TILES)) expect(tiles.length, cat).toBe(6);
  });
});

describe("tiles", () => {
  const known = new Set(["summarise", "explain", "translate", "rewrite", "fix", "todo", "extract", "compare", "ask-page", "transcribe"]);
  test("category defaults", () => {
    expect(tilesFor("Code.exe", {}, known)).toEqual(["explain", "review", "fix", "ask", "shelf-add", "summarise"]);
    expect(tilesFor("WindowsTerminal.exe", {}, known)[0]).toBe("explain-error");
    expect(tilesFor("chrome.exe", {}, known)).toContain("ask-page");
  });
  test("per-app beats per-category beats base; unknown ids dropped and padded to six", () => {
    const o = { apps: { "code.exe": ["translate", "nope"] }, categories: { code: ["todo"] }, base: ["fix", "ask"] };
    const t = tilesFor("C:\\x\\Code.exe", o, known);
    expect(t[0]).toBe("translate");
    expect(t).not.toContain("nope");
    expect(t.length).toBe(6);
    expect(tilesFor("cursor.exe", o, known)[0]).toBe("todo");
    expect(tilesFor("game.exe", o, known).slice(0, 2)).toEqual(["fix", "ask"]);
    expect(new Set(tilesFor("game.exe", o, known)).size).toBe(6);
  });
  test("reorder", () => {
    expect(moveTile(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(moveTile(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
    expect(moveTile(["a", "b"], 5, 0)).toEqual(["a", "b"]);
  });
});

describe("edge shelf geometry", () => {
  const area: Rect = { x: 0, y: 0, w: 1920, h: 1040 };
  const s = (o: Partial<EdgeSettings> = {}): EdgeSettings => ({ ...DEFAULT_EDGE, enabled: true, ...o });
  test("tab sits flush on each edge, centred on the offset", () => {
    expect(tabRect(area, s({ edge: "right", offset: 0.5 }))).toEqual({ x: 1914, y: 472, w: 6, h: 96 });
    expect(tabRect(area, s({ edge: "left", offset: 0.5 }))).toEqual({ x: 0, y: 472, w: 6, h: 96 });
    expect(tabRect(area, s({ edge: "top", offset: 0.5 }))).toEqual({ x: 912, y: 0, w: 96, h: 6 });
    expect(tabRect(area, s({ edge: "bottom", offset: 0.5 }))).toEqual({ x: 912, y: 1034, w: 96, h: 6 });
  });
  test("tab and panel never leave the work area (incl. second monitor)", () => {
    expect(tabRect(area, s({ offset: 0 })).y).toBe(0);
    expect(tabRect(area, s({ offset: 1 })).y).toBe(1040 - 96);
    const p = panelRect(area, s({ edge: "right", offset: 0.98 }));
    expect(p.y + p.h).toBeLessThanOrEqual(1040 - 8);
    expect(p.x + p.w).toBe(1920 - 8);
    const second: Rect = { x: 1920, y: -200, w: 2560, h: 1400 };
    const q = panelRect(second, s({ edge: "left", offset: 0.02 }));
    expect(q.x).toBe(1928);
    expect(q.y).toBe(-192);
  });
  test("hit zone is a little larger than the tab; drag sets the offset", () => {
    const h = hitRect(area, s({ edge: "right", offset: 0.5 }));
    expect(contains(h, 1905, 520)).toBe(true);
    expect(contains(h, 1890, 520)).toBe(false);
    expect(offsetFromPoint(area, "right", 1919, 260)).toBe(0.25);
    expect(offsetFromPoint(area, "bottom", 0, 1039)).toBe(0.05);
  });
  test("hidden while fullscreen, and only-while-dragging mode", () => {
    expect(tabVisible(s(), false, false, false)).toBe(true);
    expect(tabVisible(s(), true, false, true)).toBe(false);
    expect(tabVisible(s({ enabled: false }), false, false, false)).toBe(false);
    expect(tabVisible(s(), false, true, false)).toBe(false);
    expect(tabVisible(s(), false, true, true)).toBe(true);
  });
  test("settings clamp edge values", () => {
    const n = normaliseCommandSettings({ edge: { edge: "diagonal", thickness: 99, panel: { w: 9999 } } });
    expect(n.edge.edge).toBe("right");
    expect(n.edge.thickness).toBe(16);
    expect(n.edge.panel.w).toBe(480);
    expect(n.edge.enabled).toBe(false);
  });
});
