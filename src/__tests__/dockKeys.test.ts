// Dock keys (src/dock/keys.ts): arrows between icons, type to find an app, the window list.
import { describe, expect, test } from "bun:test";
import { dockArrows, dockKeyAction, findHits, findRank, findTarget, listKeyAction, type DockKeyInput } from "../dock/keys";
import { iconName } from "../dock/hooks/useDockKeys";
import { enterPose } from "../dock/reflow";

const names = ["Search", "Files", "Slack", "Spotify", "Steam", "Visual Studio Code", "System and tasks", "Settings"];
const at = (key: string, more: Partial<DockKeyInput> = {}) => dockKeyAction({ key, modified: false, edge: "bottom", index: 3, count: names.length, names, query: "", ...more });

describe("Dock keys", () => {
  test("the arrows along the Dock move one icon and stop at the ends", () => {
    expect(at("ArrowRight")).toEqual({ kind: "move", to: 4 });
    expect(at("ArrowLeft")).toEqual({ kind: "move", to: 2 });
    expect(at("ArrowLeft", { index: 0 })).toEqual({ kind: "move", to: 0 });
    expect(at("ArrowRight", { index: 7 })).toEqual({ kind: "move", to: 7 });
    expect(at("Home")).toEqual({ kind: "move", to: 0 });
    expect(at("End")).toEqual({ kind: "move", to: 7 });
  });

  test("on every edge the arrow that points into the screen opens the window list", () => {
    expect(dockArrows("bottom")).toEqual({ prev: "ArrowLeft", next: "ArrowRight", into: "ArrowUp" });
    expect(dockArrows("top").into).toBe("ArrowDown");
    expect(dockArrows("left")).toEqual({ prev: "ArrowUp", next: "ArrowDown", into: "ArrowRight" });
    expect(dockArrows("right").into).toBe("ArrowLeft");
    for (const edge of ["bottom", "top", "left", "right"] as const) {
      expect(at(dockArrows(edge).into, { edge })).toEqual({ kind: "windows" });
      expect(at(dockArrows(edge).next, { edge })).toEqual({ kind: "move", to: 4 });
    }
    // The arrow that points off the screen is nobody's.
    expect(at("ArrowDown")).toBeNull();
  });

  test("keys held with Ctrl, Alt or the Windows key are never the Dock's", () => {
    expect(at("ArrowRight", { modified: true })).toBeNull();
    expect(at("s", { modified: true })).toBeNull();
  });

  test("typing finds an app: start of the name first, then a word, then anywhere", () => {
    expect(findRank("Spotify", "spo")).toBe(3);
    expect(findRank("Visual Studio Code", "code")).toBe(2);
    expect(findRank("Spotify", "tif")).toBe(1);
    expect(findRank("Spotify", "x")).toBe(0);
    expect(findRank("Café", "cafe")).toBe(3);
    expect(at("s", { index: 0 })).toEqual({ kind: "find", query: "s", to: 0 });
    expect(at("p", { query: "s" })).toEqual({ kind: "find", query: "sp", to: 3 });
    expect(at("o", { query: "c" })).toEqual({ kind: "find", query: "co", to: 5 });
    expect(at("q")).toEqual({ kind: "find", query: "q", to: -1 });
  });

  test("the same letter again steps through the apps that start with it", () => {
    expect(findTarget(names, "ss", 0)).toBe(2);
    expect(findTarget(names, "ss", 2)).toBe(3);
    expect(findTarget(names, "sss", 4)).toBe(6);
    expect(findTarget(names, "ss", 7)).toBe(0);
    expect(findHits(names, "ss")).toEqual([true, true, true, true, true, true, true, true]);
    expect(findHits(names, "sp")).toEqual([false, false, false, true, false, false, false, false]);
  });

  test("Space presses the icon unless a name is being typed; Backspace and Esc edit the find", () => {
    expect(at(" ")).toBeNull();
    expect(at(" ", { query: "visual" })).toEqual({ kind: "find", query: "visual ", to: 5 });
    expect(at("Backspace", { query: "sp" })).toEqual({ kind: "find", query: "s", to: 0 });
    expect(at("Backspace", { query: "s" })).toEqual({ kind: "clear" });
    expect(at("Backspace")).toBeNull();
    expect(at("Escape", { query: "s" })).toEqual({ kind: "clear" });
    expect(at("Escape")).toBeNull();
    expect(at("Enter")).toBeNull();
    expect(at("Tab")).toBeNull();
    expect(at("F5")).toBeNull();
  });

  test("an icon's name leaves out its state and badge", () => {
    const el = (label: string) => ({ getAttribute: () => label }) as unknown as Element;
    expect(iconName(el("Spotify (running), 2 windows"))).toBe("Spotify");
    expect(iconName(el("Slack (focused), 99+ notifications"))).toBe("Slack");
    expect(iconName(el("Settings"))).toBe("Settings");
    expect(iconName(el("Files, 3 notifications"))).toBe("Files");
  });

  test("the window list: Up and Down wrap, Delete closes, Esc goes back to the icon", () => {
    expect(listKeyAction("ArrowDown", 2, 3)).toEqual({ kind: "move", to: 0 });
    expect(listKeyAction("ArrowUp", 0, 3)).toEqual({ kind: "move", to: 2 });
    expect(listKeyAction("Home", 2, 3)).toEqual({ kind: "move", to: 0 });
    expect(listKeyAction("End", 0, 3)).toEqual({ kind: "move", to: 2 });
    expect(listKeyAction("Delete", 1, 3)).toEqual({ kind: "close" });
    expect(listKeyAction("Escape", 1, 3)).toEqual({ kind: "back" });
    expect(listKeyAction("Enter", 1, 3)).toBeNull();
    expect(listKeyAction("ArrowDown", 0, 0)).toBeNull();
  });
});

describe("a pin drops in with weight", () => {
  test("a new pin comes from the screen side of the Dock and settles with the spring", () => {
    expect(enterPose("pin-abc", "bottom")).toEqual({ from: { y: -12, scale: 0.86, opacity: 0 }, spring: true });
    expect(enterPose("pin-abc", "top").from).toMatchObject({ y: 12 });
    expect(enterPose("pin-abc", "left").from).toMatchObject({ x: 12 });
    expect(enterPose("pin-abc", "right").from).toMatchObject({ x: -12 });
  });
  test("an app that simply opened grows in, as before", () => {
    expect(enterPose("unpin-chrome.exe", "bottom")).toEqual({ from: { scale: 0.6, opacity: 0 }, spring: false });
    expect(enterPose("sys", "left").spring).toBe(false);
  });
});

describe("clocks that show minutes wake on the minute", () => {
  test("the wait runs to the next whole minute and is never zero", async () => {
    const { msToNextMinute } = await import("../hooks/useMinuteClock");
    expect(msToNextMinute(new Date(2026, 10, 26, 10, 30, 0, 0))).toBe(60_000);
    expect(msToNextMinute(new Date(2026, 10, 26, 10, 30, 59, 900))).toBe(100);
    expect(msToNextMinute(new Date(2026, 10, 26, 10, 30, 12, 500))).toBe(47_500);
  });

  test("neither bar keeps a per-second or 15-second clock timer", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const src = (p: string) => readFileSync(join(import.meta.dir, "..", p), "utf8");
    expect(src("surfaces/TopBarSurface.tsx")).not.toMatch(/setInterval\(\(\) => setNow/);
    expect(src("dock/DockSystemArea.tsx")).not.toMatch(/setInterval\(\(\) => setNow/);
    expect(src("surfaces/TopBarSurface.tsx")).toContain("useMinuteClock(visible)");
  });
});
