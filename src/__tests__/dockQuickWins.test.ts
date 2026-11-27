// Dock quick wins (feat/dock-quick-wins): the titles list for apps with many windows, scroll on an
// icon to change its app's volume, and the "focus the Dock" hotkey. Pure rules only; the page
// behaviour is driven in tools/robust/dock-keys.mjs.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MANY_WINDOWS, MANY_WINDOWS_CHOICES, normalizeManyWindows, pickCardMode } from "../dock/cardMode";
import { VOLUME_STEP, VOLUME_STEP_MS, currentLevel, nextVolume, sessionsForApp, volumeReadout, volumeStepDir, wheelIntent } from "../dock/volume";
import { keysHint, landingIcon } from "../dock/hooks/useDockFocusKeys";
import { dockAdvancedSummary, dockAdvancedView, scrollVolumeDesc, setManyWindows } from "../dock/advanced";
import { comboProblem, dockFocusKeys, shortcutsFor, SIMPLE, withShortcut, withSimpleShortcuts } from "../keys/shortcuts";
import type { LensConfig, RunningWindow } from "../types/lens";
import type { AudioAppSession } from "../types/generated";
import { sampleConfig } from "./fixtures";

const root = join(import.meta.dir, "..", "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
const win = (hwnd: number, proc: string): RunningWindow => ({ hwnd, title: `w${hwnd}`, processName: proc, exePath: `C:\\x\\${proc}`, isFocused: false, isMinimized: false, isMaximized: false });
const session = (pid: number, name: string, volume: number, muted = false): AudioAppSession => ({ pid, name, volume, muted, iconDataUrl: null });

describe("hover card: titles list past four windows (B-150)", () => {
  const mode = (windows: number, livePreviews = true, manyWindows?: unknown) => pickCardMode({ isSpotify: false, livePreviews, windows, manyWindows });

  test("previews on: one window strip, two to four carousel, more than four the titles list", () => {
    expect(MANY_WINDOWS).toBe(4);
    expect(mode(1)).toBe("strip");
    expect(mode(2)).toBe("carousel");
    expect(mode(4)).toBe("carousel");
    expect(mode(5)).toBe("list");
    expect(mode(23)).toBe("list");
  });

  test("the person can keep previews for many windows; anything else reads as the list", () => {
    expect(mode(9, true, "previews")).toBe("carousel");
    expect(mode(9, true, "list")).toBe("list");
    expect(mode(9, true, "nonsense")).toBe("list");
    expect(normalizeManyWindows(undefined)).toBe("list");
    expect(MANY_WINDOWS_CHOICES.map((c) => c.id)).toEqual(["list", "previews"]);
  });

  test("previews off is always the list; music keeps its card", () => {
    expect(mode(1, false)).toBe("list");
    expect(mode(9, false, "previews")).toBe("list");
    expect(pickCardMode({ isSpotify: true, livePreviews: true, windows: 9 })).toBe("spotify");
  });

  test("the setting writes dock.manyWindows only, normalised", () => {
    const c = sampleConfig();
    expect(setManyWindows(c, "previews").dock.manyWindows).toBe("previews");
    expect(setManyWindows(c, "grid").dock.manyWindows).toBe("list");
    expect({ ...setManyWindows(c, "previews"), dock: c.dock }).toEqual(c);
  });

  test("the card draws the list for list mode even with live previews on", () => {
    const src = read("src/dock/DockHoverCard.tsx");
    expect(src).toContain('cardMode === "strip" ? (');
    expect(src).not.toMatch(/\) : livePreviews \? \(/);
    expect(read("src/surfaces/DockSurface.tsx")).toContain("pickCardMode(");
  });
});

describe("scroll on an icon to change its app's volume (B-151)", () => {
  test("off by default; with scroll-to-switch on, Shift+wheel is the volume", () => {
    expect(dockAdvancedView(sampleConfig()).scrollVolume).toBe(false);
    expect(wheelIntent({ scrollCycles: false, scrollVolume: false, shift: false })).toBeNull();
    expect(wheelIntent({ scrollCycles: false, scrollVolume: true, shift: false })).toBe("volume");
    expect(wheelIntent({ scrollCycles: true, scrollVolume: false, shift: true })).toBe("windows");
    expect(wheelIntent({ scrollCycles: true, scrollVolume: true, shift: false })).toBe("windows");
    expect(wheelIntent({ scrollCycles: true, scrollVolume: true, shift: true })).toBe("volume");
    expect(scrollVolumeDesc({ scrollCyclesWindows: true })).toContain("Shift");
    expect(scrollVolumeDesc({ scrollCyclesWindows: false })).not.toContain("Shift");
  });

  test("wheel up is louder, one step per notch, throttled, Shift's horizontal delta counts", () => {
    expect(volumeStepDir(0, -100, 0, 1000)).toBe(1);
    expect(volumeStepDir(0, 100, 0, 1000)).toBe(-1);
    expect(volumeStepDir(-120, 0, 0, 1000)).toBe(1);
    expect(volumeStepDir(0, -100, 1000, 1000 + VOLUME_STEP_MS - 1)).toBe(0);
    expect(volumeStepDir(0, 0.2, 0, 1000)).toBe(0);
    expect(volumeStepDir(0, Number.NaN, 0, 1000)).toBe(0);
  });

  test("levels stay on the step grid within 0–100", () => {
    expect(VOLUME_STEP).toBe(5);
    expect(nextVolume(40, 1)).toBe(45);
    expect(nextVolume(42, 1)).toBe(45);
    expect(nextVolume(42, -1)).toBe(40);
    expect(nextVolume(40, -1)).toBe(35);
    expect(nextVolume(98, 1)).toBe(100);
    expect(nextVolume(100, 1)).toBe(100);
    expect(nextVolume(2, -1)).toBe(0);
    expect(nextVolume(0, -1)).toBe(0);
    expect(nextVolume(Number.NaN, 1)).toBe(5);
  });

  test("an app's sessions are found by program name (browsers play from a child process)", () => {
    const all = [session(11, "Chrome", 40), session(12, "Chrome", 60), session(13, "Spotify", 70), session(0, "System Sounds", 50)];
    expect(sessionsForApp(all, [win(1, "chrome.exe")]).map((s) => s.pid)).toEqual([11, 12]);
    expect(sessionsForApp(all, [win(1, "Spotify.exe")]).map((s) => s.pid)).toEqual([13]);
    expect(sessionsForApp(all, [], "C:\\Apps\\Spotify.exe").map((s) => s.pid)).toEqual([13]);
    expect(sessionsForApp(all, [win(1, "notepad.exe")])).toEqual([]);
    expect(sessionsForApp(all, [])).toEqual([]);
    // System sounds are never an app's.
    expect(sessionsForApp(all, [win(1, "System Sounds")])).toEqual([]);
  });

  test("the level starts from what you hear; no session says so", () => {
    expect(currentLevel([session(1, "a", 40), session(2, "a", 60)])).toBe(60);
    expect(currentLevel([session(1, "a", 80, true)])).toBe(0);
    expect(currentLevel([])).toBeNull();
    expect(volumeReadout(45)).toBe("45%");
    expect(volumeReadout(null)).toBe("No sound");
  });

  test("the readout is light: tabular numbers, accent fill, transform only, no title tooltips", () => {
    const css = read("src/dock/DockAppItem.css");
    expect(css).toContain("font-variant-numeric: tabular-nums");
    expect(css).toMatch(/\.dock-volume-fill \{[^}]*var\(--lens-accent-ui\)/);
    expect(css).toMatch(/\.dock-volume-fill \{[^}]*transition: transform var\(--lens-dur-fast\)/);
    expect(read("src/dock/DockAppItem.tsx")).not.toContain("title=");
  });

  test("the summary names it when on", () => {
    const c = sampleConfig();
    const on = { ...c, dock: { ...c.dock, scrollVolume: true } } as LensConfig;
    expect(dockAdvancedSummary(dockAdvancedView(on))).toContain("Scroll for volume");
  });
});

describe("focus the Dock hotkey (B-152)", () => {
  test("Ctrl+Alt+D by default, clashes with nothing on the sheet, can be turned off", () => {
    const c = sampleConfig();
    expect(dockFocusKeys(c)).toBe(SIMPLE.dock);
    expect(SIMPLE.dock).toBe("Ctrl+Alt+D");
    const all = shortcutsFor(withSimpleShortcuts(c));
    const row = all.find((s) => s.id === "dock")!;
    expect(row.editable && row.offable).toBe(true);
    expect(comboProblem(row.keys, "dock", all)).toBeNull();
    const off = withShortcut(c, "dock", "");
    expect(off.func.dockFocusHotkey).toBe("");
    expect(dockFocusKeys(off)).toBe("");
    // An off shortcut never "clashes" with another one being set.
    expect(comboProblem("Ctrl+Alt+B", "widgets", shortcutsFor(off))).toBeNull();
    expect(withSimpleShortcuts(off).func.dockFocusHotkey).toBe(SIMPLE.dock);
    expect(withShortcut(c, "dock", "ctrl+alt+h").func.dockFocusHotkey).toBe("Ctrl+Alt+H");
  });

  test("another Lens shortcut can't take the Dock's keys", () => {
    const all = shortcutsFor(withSimpleShortcuts(sampleConfig()));
    expect(comboProblem("Ctrl+Alt+D", "widgets", all)?.level).toBe("block");
  });

  test("Lens Core registers the same default, and app summon treats it as taken", () => {
    expect(read("src-tauri/src/config.rs")).toContain('pub const DEFAULT_DOCK_FOCUS_HOTKEY: &str = "Ctrl+Alt+D";');
    expect(read("src-tauri/src/win_summon.rs")).toContain('"ctrl+alt+KeyD"');
  });

  test("the hint names the arrows that run along the Dock's edge", () => {
    expect(keysHint("bottom")).toBe("← → to move · Enter to open · Esc to leave");
    expect(keysHint("left")).toStartWith("↑ ↓");
  });

  test("it lands on the app that was in front, else the first icon", () => {
    const el = (focused: boolean) => ({ classList: { contains: (c: string) => focused && c === "is-focused" } }) as unknown as HTMLElement;
    const a = el(false);
    const b = el(true);
    expect(landingIcon([a, b])).toBe(b);
    expect(landingIcon([a, el(false)])).toBe(a);
    expect(landingIcon([])).toBeNull();
  });
});
