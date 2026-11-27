// Tab position and styles: the top-chrome maths per mode, density and DPI, and the strip model.
import { describe, expect, test } from "bun:test";
import { contentRect, cssVars, geometry, snap, stripKey, TAB_STYLES, validStyle, type TabStyle } from "../browser/tabModes";
import { stripModel } from "../browser/TabStrip";
import type { BrowserState, Tab } from "../browser/api";

const STYLES = TAB_STYLES.map((s) => s.id);

describe("tab mode geometry", () => {
  test("vertical has the toolbar only; the sidebar takes the side", () => {
    const g = geometry("vertical", "curved");
    expect(g.mode).toBe("vertical");
    expect(g.rows).toEqual(["toolbar"]);
    expect(g.chromeH).toBe(48);
    expect(contentRect({ w: 1280, h: 820 }, g, { side: 248 })).toEqual({ x: 248, y: 48, w: 1032, h: 772 });
    expect(contentRect({ w: 1280, h: 820 }, g, { side: 248, sideRight: true, panel: 384 })).toEqual({ x: 0, y: 48, w: 648, h: 772 });
  });
  test("each horizontal style has its rows in order and no sidebar", () => {
    const rows = Object.fromEntries(STYLES.map((s) => [s, geometry("horizontal", s).rows]));
    expect(rows).toEqual({ curved: ["strip", "toolbar"], joined: ["strip", "toolbar"], compact: ["toolbar"], dynamic: ["toolbar", "strip"], merged: ["toolbar"] });
    for (const s of STYLES) {
      const g = geometry("horizontal", s);
      expect(g.chromeH).toBe(g.toolbarH + g.stripH);
      expect(contentRect({ w: 1280, h: 820 }, g, { side: 248 }).x).toBe(0);
    }
    expect(geometry("horizontal", "merged").merged).toBe(true);
    expect(geometry("horizontal", "compact").iconTabs).toBe(true);
    expect(geometry("horizontal", "curved").stripH).toBeGreaterThan(geometry("horizontal", "joined").stripH);
  });
  test("compact density is shorter in every mode", () => {
    for (const s of STYLES) expect(geometry("horizontal", s, "compact").chromeH).toBeLessThan(geometry("horizontal", s, "comfortable").chromeH);
  });
  test("the page lands on whole device pixels at common scales, never empty", () => {
    for (const dpi of [1, 1.25, 1.5, 1.75, 2, 2.25, 3]) {
      for (const s of ["vertical", ...STYLES] as const) {
        const g = s === "vertical" ? geometry("vertical", "dynamic") : geometry("horizontal", s as TabStyle);
        for (const win of [{ w: 1280, h: 820 }, { w: 721, h: 481 }, { w: 1919.6, h: 1031.2 }]) {
          const r = contentRect(win, g, { side: 247.4, panel: 383.3, extraTop: 37, dpi });
          for (const v of [r.x, r.y, r.x + r.w, r.y + r.h]) expect(Math.abs(v * dpi - Math.round(v * dpi))).toBeLessThan(1e-6);
          expect(r.w).toBeGreaterThan(0);
          expect(r.h).toBeGreaterThan(0);
        }
      }
    }
    expect(snap(10.3, 0)).toBe(10);
  });
  test("css variables match the geometry; unknown styles fall back", () => {
    expect(cssVars(geometry("horizontal", "dynamic"))).toEqual({ "--lb-top": "48px", "--lb-strip": "36px" });
    expect(cssVars(geometry("horizontal", "compact"))).toEqual({ "--lb-top": "48px", "--lb-strip": "0px" });
    expect(validStyle("wavy")).toBe("dynamic");
    expect(validStyle(undefined)).toBe("dynamic");
  });
  test("roving focus wraps and jumps", () => {
    expect(stripKey("ArrowRight", 2, 3)).toBe(0);
    expect(stripKey("ArrowLeft", 0, 3)).toBe(2);
    expect(stripKey("End", 0, 3)).toBe(2);
    expect(stripKey("Home", 2, 3)).toBe(0);
    expect(stripKey("x", 0, 3)).toBeNull();
    expect(stripKey("ArrowRight", 0, 0)).toBeNull();
  });
});

const tab = (id: string, o: Partial<Tab> = {}): Tab => ({ id, spaceId: "s1", folderId: null, url: `https://${id}.test/`, title: id, favicon: null, pinned: false, muted: false, audible: false, life: "live", lastActiveMs: 0, order: 0, zoom: 1, scrollY: 0, badge: null, ...o });
describe("strip model", () => {
  test("pinned first, folders become chips, the open tab always shows", () => {
    const s = {
      spaces: [{ id: "s1", name: "Work", profile: "p" }, { id: "s2", name: "Home", profile: "q" }],
      folders: [{ id: "f1", spaceId: "s1", name: "Errands", collapsed: false }, { id: "f2", spaceId: "s1", name: "Empty", collapsed: false }],
      tabs: [tab("a", { order: 2 }), tab("b", { pinned: true, order: 5 }), tab("c", { folderId: "f1", order: 1 }), tab("d", { folderId: "f1", order: 3 }), tab("e", { spaceId: "s2" }), tab("z", { archivedMs: 1 })],
      activeSpace: "s1",
      activeTab: "d",
    } as unknown as BrowserState;
    const m = stripModel(s);
    expect(m.loose.map((t) => t.id)).toEqual(["b", "a", "d"]);
    expect(m.chips.map((c) => [c.folder.name, c.tabs.map((t) => t.id)])).toEqual([["Errands", ["c", "d"]]]);
  });
});
