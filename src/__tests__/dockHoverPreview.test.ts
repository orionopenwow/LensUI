// Dock hover card and window switching (src/dock/hoverIntent.ts, src/dock/carousel.ts): the card
// must survive the trip from the icon onto it (and onto its live pictures), every window you can
// see in it is a live picture, and clicking an app's icon walks through its windows.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { HOVER_CLOSE_MS, HOVER_INTENT_MS, HOVER_WARM_MS, activationTarget } from "../dock/hoverIntent";
import { carouselTiles } from "../dock/carousel";
import type { RunningWindow } from "../types/lens";

const src = (p: string) => readFileSync(join(import.meta.dir, "..", p), "utf8");
const rust = (p: string) => readFileSync(join(import.meta.dir, "..", "..", "src-tauri", "src", p), "utf8");

const win = (hwnd: number, isFocused = false): RunningWindow =>
  ({ hwnd, title: `w${hwnd}`, processName: "app.exe", exePath: "C:\\app.exe", isFocused }) as unknown as RunningWindow;

describe("hover timing", () => {
  test("the card waits long enough to cross the gap, and no longer than the native previews do", () => {
    expect(HOVER_CLOSE_MS).toBeGreaterThanOrEqual(220);
    const grace = Number(/PREVIEW_LEAVE_GRACE_MS: u64 = (\d+)/.exec(rust("win_previews.rs"))?.[1]);
    expect(HOVER_CLOSE_MS).toBe(grace);
    expect(HOVER_INTENT_MS).toBeLessThan(HOVER_WARM_MS);
  });

  test("leaving the page (pointer onto a native picture, a fast flick) is a grace close, never instant", () => {
    const dock = src("surfaces/DockSurface.tsx");
    const leave = dock.slice(dock.indexOf("const onDocLeave"), dock.indexOf('document.addEventListener("mouseout"'));
    expect(leave).toContain("scheduleHoverCloseRef.current()");
    expect(leave).not.toContain("setHoverCard(null)");
  });

  test("an invisible bridge covers the gap between icon and card on every edge", () => {
    const css = src("surfaces/DockSurface.css");
    for (const edge of ["bottom", "top", "left", "right"]) {
      expect(css).toContain(`.dock-hover-card.dock-hover-edge-${edge}::before`);
    }
  });
});

describe("native previews", () => {
  test("preview tiles are click-through (layered + transparent), so the card keeps the pointer", () => {
    const r = rust("win_previews.rs");
    expect(r).toMatch(/PREVIEW_TILE_EX_STYLE[\s\S]*0x0000_0020[\s\S]*0x0008_0000/);
    expect(r).toContain("SetLayeredWindowAttributes(tile,");
  });
});

describe("carousel live pictures", () => {
  const stage = { x: 0, y: 40, w: 420, h: 172 };
  const current = { hwnd: 1, shot: { x: 86, y: 40, w: 248, h: 140 } };

  test("the current window and both neighbours are live; neighbours are cut to what peeks out and dimmed", () => {
    const tiles = carouselTiles(stage, current, [
      { hwnd: 2, offset: -1, shot: { x: -1.3, y: 59.6, w: 178.6, h: 100.8 } },
      { hwnd: 3, offset: 1, shot: { x: 242.7, y: 59.6, w: 178.6, h: 100.8 } },
    ]);
    expect(tiles.map((t) => t.hwnd)).toEqual([1, 2, 3]);
    expect(tiles[0].clip).toBeUndefined();
    const [, left, right] = tiles;
    // Never over the current window, never into the faded edges.
    expect(left.clip!.x + left.clip!.w).toBeLessThanOrEqual(current.shot.x);
    expect(left.clip!.x).toBeGreaterThan(stage.x);
    expect(right.clip!.x).toBeGreaterThanOrEqual(current.shot.x + current.shot.w);
    expect(right.clip!.x + right.clip!.w).toBeLessThan(stage.x + stage.w);
    // The picture keeps its full slide size, so the visible slice matches the slide.
    expect(left.w).toBe(179);
    expect(left.opacity).toBeLessThan(1);
  });

  test("windows two places away, or neighbours with only a sliver showing, keep their icon", () => {
    const tiles = carouselTiles(stage, current, [
      { hwnd: 4, offset: 2, shot: { x: 400, y: 60, w: 178, h: 100 } },
      { hwnd: 5, offset: 1, shot: { x: 300, y: 60, w: 40, h: 100 } },
    ]);
    expect(tiles.map((t) => t.hwnd)).toEqual([1]);
  });
});

describe("switching windows from the icon", () => {
  test("one window: the main window (focus, restore, or minimize when in front)", () => {
    expect(activationTarget([win(7, true)], win(7, true))).toBe(7);
    expect(activationTarget([win(7)], win(7))).toBe(7);
  });

  test("several windows with none in front: the main one comes forward", () => {
    expect(activationTarget([win(1), win(2), win(3)], win(2))).toBe(2);
  });

  test("several windows with one in front: each click goes to the next, wrapping round", () => {
    expect(activationTarget([win(1, true), win(2), win(3)], win(1, true))).toBe(2);
    expect(activationTarget([win(1), win(2), win(3, true)], win(3, true))).toBe(1);
  });

  test("nothing running: nothing to switch to (the Dock launches the app instead)", () => {
    expect(activationTarget([], undefined)).toBeNull();
  });
});
