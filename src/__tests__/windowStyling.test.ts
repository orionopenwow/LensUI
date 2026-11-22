// Window styling 2.0: the UI's copy of the backend's cleaning rules, and what the preview draws.
import { describe, expect, test } from "bun:test";
import {
  DEFAULT_CAPS, DEFAULT_STYLING, capsNote, dimLabel, effectiveBorder, isIdle, normalizeStyling, previewRadius, processKey, ringBackground,
} from "../utils/windowStyling";

describe("normalizeStyling", () => {
  test("defaults are idle and keep fullscreen safety on", () => {
    const s = normalizeStyling(null);
    expect(s).toEqual(DEFAULT_STYLING);
    expect(isIdle(s)).toBe(true);
    expect(s.skipFullscreen).toBe(true);
  });

  test("clamps and cleans like sanitize_styling", () => {
    const s = normalizeStyling({
      dimInactive: 90,
      peekDelayMs: 5,
      activeBorder: { mode: "OVERLAY", style: "Gradient", colors: ["#ff0000", "nope", "00ff00", "#0000FF", "#111111", "#222222"], widthPx: 0, glowPx: 99 },
      exclusions: ["C:\\Games\\Game.EXE", "game", " ", "obs64"],
    });
    expect(s.dimInactive).toBe(40);
    expect(s.peekDelayMs).toBe(200);
    expect(s.activeBorder).toEqual({ mode: "overlay", style: "gradient", colors: ["#FF0000", "#00FF00", "#0000FF", "#111111"], widthPx: 1, glowPx: 24 });
    expect(s.exclusions).toEqual(["game", "obs64"]);
    expect(isIdle(s)).toBe(false);
  });

  test("unknown modes and empty colours fall back", () => {
    const s = normalizeStyling({ activeBorder: { mode: "lasers", style: "x", colors: ["bad"], widthPx: 3, glowPx: 0 } });
    expect(s.activeBorder.mode).toBe("off");
    expect(s.activeBorder.style).toBe("solid");
    expect(s.activeBorder.colors).toEqual(["#60A5FA", "#C084FC"]);
  });

  test("an older file without skipFullscreen keeps it on", () => {
    expect(normalizeStyling({ dimInactive: 10 } as any).skipFullscreen).toBe(true);
    expect(normalizeStyling({ skipFullscreen: false }).skipFullscreen).toBe(false);
  });
});

describe("preview", () => {
  const overlay = normalizeStyling({ activeBorder: { mode: "overlay", style: "gradient", colors: ["#FF0000", "#0000FF"], widthPx: 3, glowPx: 8 } }).activeBorder;
  test("ring background", () => {
    expect(ringBackground(overlay)).toBe("linear-gradient(135deg, #FF0000, #0000FF)");
    expect(ringBackground({ ...overlay, style: "solid" })).toBe("#FF0000");
    expect(ringBackground({ ...overlay, colors: ["#00FF00"] })).toBe("#00FF00");
  });

  test("native border is 1px and only on Windows 11", () => {
    const native = { ...overlay, mode: "native" };
    expect(effectiveBorder(native, DEFAULT_CAPS)).toEqual({ width: 1, glow: 0, background: "#FF0000" });
    expect(effectiveBorder(native, { ...DEFAULT_CAPS, nativeBorder: false })).toBeNull();
    expect(effectiveBorder(overlay, { ...DEFAULT_CAPS, nativeBorder: false })?.width).toBe(3);
    expect(effectiveBorder({ ...overlay, mode: "off" }, DEFAULT_CAPS)).toBeNull();
  });

  test("Windows 10 gets square corners and a note", () => {
    const w10 = { windowsBuild: 19045, nativeBorder: false, roundedCorners: false, overlays: true };
    expect(previewRadius(w10)).toBe(0);
    expect(previewRadius(DEFAULT_CAPS)).toBe(8);
    expect(capsNote(w10)).toContain("Windows 10");
    expect(capsNote(DEFAULT_CAPS)).toBeNull();
    expect(capsNote({ ...DEFAULT_CAPS, overlays: false })).toContain("need Windows");
  });

  test("labels and process keys", () => {
    expect(dimLabel(0)).toBe("Off");
    expect(dimLabel(25)).toBe("25%");
    expect(processKey("C:\\Program Files\\Obs\\OBS64.exe")).toBe("obs64");
  });
});
