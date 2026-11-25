// "Lens ›" in Lens's own right-click menus: the panel lists the same rows the Magic window will,
// a pre-chosen row only runs when it is fresh and from a Lens menu, keys pan in and out, and the
// stand-alone menu stays on screen.
import { describe, expect, mock, test } from "bun:test";

mock.module("@tauri-apps/api/core", () => ({
  invoke: async () => null,
  convertFileSrc: (p: string) => `asset://localhost/${encodeURIComponent(p)}`,
  transformCallback: () => 0,
}));
mock.module("@tauri-apps/api/event", () => ({ listen: async () => () => {}, emit: async () => {} }));

const pan = await import("../magic/lensPanModel");
const model = await import("../magic/model");
const { PREVIEW_SETS } = await import("../magic/previews");
const { DEFAULT_MAGIC } = await import("../magic/contract");
const { placeMenu } = await import("../magic/LensContextMenu");

const cfg = { ...DEFAULT_MAGIC, enabled: true };
const dock = { kind: "dockItem" as const, id: "code", label: "Visual Studio Code", path: "C:\\Users\\you\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe" };

describe("Lens panel rows", () => {
  test("the panel's target is the one the backend builds for a Lens item", () => {
    // The Magic preview set mirrors magic::target::resolve for a dock item.
    const preview = PREVIEW_SETS.dockItem[0];
    const ours = pan.targetFor(dock);
    expect(ours.kind).toBe(preview.kind);
    expect(ours.detail).toBe("lens");
    expect(ours.path).toBe(preview.path);
    expect(ours.window).toBeNull();
  });

  test("rows are the Magic window's rows for that item, in the same order, capped", () => {
    const { rows, more } = pan.panelRows(dock, cfg);
    const set = model.rowsFor(pan.targetFor(dock), cfg);
    const all = [...set.top, ...set.more];
    expect(rows.length).toBeLessThanOrEqual(pan.PANEL_ROWS);
    expect(rows.map((r) => r.id)).toEqual(all.slice(0, pan.PANEL_ROWS).map((r) => r.id));
    expect(more).toBe(Math.max(0, all.length - pan.PANEL_ROWS));
  });

  test("every row id can travel to the backend as a pre-chosen row", () => {
    for (const kind of ["dockItem", "shelfItem", "notification"] as const) {
      const { rows } = pan.panelRows({ ...dock, kind }, cfg);
      expect(rows.length).toBeGreaterThan(0);
      for (const r of rows) expect(pan.isRunId(r.id)).toBe(true);
    }
  });

  test("AI rows disappear when Magic's AI is off", () => {
    const { rows } = pan.panelRows(dock, { ...cfg, ai: false });
    expect(rows.every((r) => r.group !== "ai")).toBe(true);
  });

  test("inputFor carries the item and the chosen row", () => {
    expect(pan.inputFor(dock, "summarize")).toEqual({ kind: "dockItem", id: "code", label: "Visual Studio Code", path: dock.path, run: "summarize" });
    expect(pan.inputFor({ kind: "shelfItem", id: "s", label: "x" }).run).toBeNull();
  });
});

describe("pre-chosen row", () => {
  const t = pan.targetFor(dock);
  const open = (o: Partial<{ run: string | null; via: string; atMs: number }>) => ({ run: "summarize", via: "lens", atMs: 1000, targets: [t], ...o });

  test("runs when fresh, from a Lens menu, for a Lens item", () => {
    expect(pan.shouldRun(open({}), 1500)).toBe("summarize");
  });

  test("never from the mouse or hotkey trigger, never stale, never malformed", () => {
    expect(pan.shouldRun(open({ via: "mouse" }), 1500)).toBeNull();
    expect(pan.shouldRun(open({ via: "hotkey" }), 1500)).toBeNull();
    expect(pan.shouldRun(open({}), 1000 + pan.RUN_FRESH_MS + 1)).toBeNull();
    expect(pan.shouldRun(open({ run: "rm -rf /" }), 1500)).toBeNull();
    expect(pan.shouldRun(open({ run: null }), 1500)).toBeNull();
    expect(pan.shouldRun({ ...open({}), targets: [PREVIEW_SETS.selection[0]] }, 1500)).toBeNull();
    expect(pan.shouldRun({ ...open({}), targets: [] }, 1500)).toBeNull();
  });
});

describe("keys", () => {
  test("→, Enter and Space pan in from the Lens row; other keys don't", () => {
    for (const k of ["ArrowRight", "Enter", " "]) expect(pan.panKey(k, false)).toBe("pan");
    for (const k of ["ArrowLeft", "ArrowDown", "Escape", "a"]) expect(pan.panKey(k, false)).toBe("none");
  });

  test("←, Esc and Backspace pan back out of the panel", () => {
    for (const k of ["ArrowLeft", "Escape", "Backspace"]) expect(pan.panKey(k, true)).toBe("back");
    for (const k of ["ArrowRight", "ArrowDown", "Enter"]) expect(pan.panKey(k, true)).toBe("none");
  });

  test("right-to-left swaps the arrows", () => {
    expect(pan.panKey("ArrowLeft", false, true)).toBe("pan");
    expect(pan.panKey("ArrowRight", true, true)).toBe("back");
  });
});

describe("stand-alone menu placement", () => {
  test("opens down-right of the pointer when it fits", () => {
    expect(placeMenu({ x: 100, y: 100 }, 220, 200, 800, 600)).toEqual({ left: 100, top: 100 });
  });

  test("flips left and up near the edges and never leaves the window", () => {
    const p = placeMenu({ x: 790, y: 590 }, 220, 200, 800, 600);
    expect(p.left).toBe(570);
    expect(p.top).toBe(390);
    const tiny = placeMenu({ x: 50, y: 50 }, 220, 200, 200, 150);
    expect(tiny.left).toBeGreaterThanOrEqual(6);
    expect(tiny.top).toBeGreaterThanOrEqual(6);
  });
});
