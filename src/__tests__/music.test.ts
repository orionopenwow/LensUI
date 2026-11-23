// Lens Music: timeline, lyrics line maths, mini-player state, palette/contrast against every
// built-in pack, the accent planner, title splitting and queue end time.
import { describe, expect, test } from "bun:test";
import {
  contrast, currentLine, endTimeLabel, ensureContrast, formatTime, heroGradient, hexToRgb, initials, lineOpacity, lineState,
  livePosition, lyricScroll, miniState, musicAccent, pickVivid, quantize, queueRemaining, sourceCaps, splitArtists, splitTitle,
  type NowPlaying,
} from "../music/model";
import { planAccent, MIN_GAP_MS } from "../music/themeFollow";
import { THEME_PACKS } from "../themes/packs";

const base: NowPlaying = {
  hasSession: true,
  sessionId: "Spotify.exe",
  sourceLabel: "Spotify",
  title: "Placeholder Song [From Lens: Original Score]",
  artist: "Lens Test Band, Second Artist & Third",
  album: "Fixtures",
  artwork: null,
  trackKey: "k1",
  status: "playing",
  positionMs: 10_000,
  updatedMs: 1_000,
  durationMs: 200_000,
  rate: 1,
  controls: { play: true, pause: true, next: true, prev: true, seek: true, shuffle: true, repeat: true },
  shuffle: false,
  repeat: "none",
  sessions: [],
  sleepAtMs: null,
  sleepEndOfTrack: false,
};

describe("timeline", () => {
  test("extrapolates only while playing and clamps", () => {
    expect(livePosition(base, 3_000)).toBe(12_000);
    expect(livePosition({ ...base, status: "paused" }, 3_000)).toBe(10_000);
    expect(livePosition({ ...base, positionMs: 199_000 }, 99_999_999)).toBe(200_000);
    expect(livePosition({ ...base, updatedMs: 0 }, 99_999)).toBe(10_000);
    expect(livePosition({ ...base, rate: Number.NaN }, 2_000)).toBe(11_000);
  });
  test("formats", () => {
    expect(formatTime(0)).toBe("0:00");
    expect(formatTime(187_400)).toBe("3:07");
    expect(formatTime(3_723_000)).toBe("1:02:03");
  });
  test("end time label", () => {
    const now = new Date(2026, 10, 23, 15, 9, 0);
    expect(endTimeLabel(25 * 60_000, now)).toBe("25 min → 3:34 PM");
    expect(endTimeLabel(25 * 60_000, now, false)).toBe("25 min → 15:34");
    expect(endTimeLabel(90 * 60_000, now)).toBe("1 h 30 min → 4:39 PM");
    expect(queueRemaining(60_000, [{ durationMs: 120_000 }, { durationMs: -5 }])).toBe(180_000);
  });
});

describe("lyrics view", () => {
  const lines = [0, 1000, 2500, 4000, 9000].map((startMs, i) => ({ startMs, text: `L${i}` }));
  test("current line with offsets", () => {
    expect(currentLine([], 5000)).toBe(-1);
    expect(currentLine(lines.slice(1), 500)).toBe(-1);
    expect(currentLine(lines, 999)).toBe(0);
    expect(currentLine(lines, 1000)).toBe(1);
    expect(currentLine(lines, 2000, 600)).toBe(2);
    expect(currentLine(lines, 2600, -200)).toBe(1);
    expect(currentLine(lines, 99_000)).toBe(4);
  });
  test("line states and opacity ramp", () => {
    expect([0, 1, 2, 3, 4].map((i) => lineState(i, 1))).toEqual(["past", "current", "next", "upcoming", "upcoming"]);
    expect(lineOpacity(1, 1)).toBe(1);
    expect(lineOpacity(2, 1)).toBeGreaterThan(lineOpacity(3, 1));
    expect(lineOpacity(3, 1)).toBeGreaterThan(lineOpacity(6, 1));
    expect(lineOpacity(40, 1)).toBeGreaterThanOrEqual(0.12);
  });
  test("scroll keeps the current line at a third of the view", () => {
    expect(lyricScroll([0, 50, 100, 150], 2, 300)).toBe(1);
    expect(lyricScroll([0, 50], 0, 300)).toBe(0);
    expect(lyricScroll([], 3, 300)).toBe(0);
  });
});

describe("mini player", () => {
  test("hidden without a session", () => {
    expect(miniState(null, 0).visible).toBe(false);
    expect(miniState({ ...base, hasSession: false }, 0).visible).toBe(false);
    expect(miniState({ ...base, title: "", artist: "" }, 0).visible).toBe(false);
  });
  test("label, marquee, progress, icon", () => {
    const s = miniState(base, 1_000);
    expect(s.visible).toBe(true);
    expect(s.label).toContain("·");
    expect(s.marquee).toBe(true);
    expect(s.progress).toBeCloseTo(0.05, 3);
    expect(s.icon).toBe("pause");
    expect(miniState({ ...base, title: "Short", artist: "" }, 1_000).marquee).toBe(false);
    expect(miniState({ ...base, status: "paused", controls: { ...base.controls, play: false } }, 0).canToggle).toBe(false);
  });
});

describe("palette and contrast", () => {
  const solid = (r: number, g: number, b: number, n = 64) => Array.from({ length: n }, () => [r, g, b, 255]).flat();
  test("quantize finds dominant colours and skips transparent pixels", () => {
    const px = [...solid(200, 30, 120, 96), ...solid(20, 20, 30, 32), ...Array.from({ length: 50 }, () => [255, 255, 255, 0]).flat()];
    const p = quantize(px, 4);
    expect(p.length).toBeGreaterThan(0);
    expect(p[0].weight).toBeGreaterThan(0.5);
    expect(Math.round(p[0].color.r)).toBe(200);
    expect(quantize([], 4)).toEqual([]);
    const vivid = pickVivid(p)!;
    expect(vivid.r).toBeGreaterThan(150);
  });
  test("music accent reads on every built-in pack", () => {
    const arts = [{ r: 40, g: 20, b: 60 }, { r: 200, g: 40, b: 140 }, { r: 240, g: 236, b: 220 }, { r: 20, g: 70, b: 40 }, null];
    for (const pack of THEME_PACKS) {
      const packBase = pack.base ?? "#09090B";
      for (const art of arts) {
        const hex = musicAccent(art, pack.accent, packBase, 0.7);
        expect(contrast(hexToRgb(hex)!, hexToRgb(packBase)!)).toBeGreaterThanOrEqual(3);
      }
    }
  });
  test("ensureContrast is a no-op when already readable", () => {
    const w = { r: 255, g: 255, b: 255 };
    expect(ensureContrast(w, { r: 0, g: 0, b: 0 }, 4.5)).toEqual(w);
  });
  test("hero gradient is built from the palette", () => {
    expect(heroGradient([], "#09090b")).toMatch(/^linear-gradient\(180deg, #[0-9a-f]{6} 0%/);
    expect(heroGradient([{ color: { r: 200, g: 40, b: 140 }, weight: 1 }], "#09090b")).not.toBe(heroGradient([], "#09090b"));
  });
});

describe("theme follows music", () => {
  const common = { enabled: true, suppressed: false, playing: true, stoppedForMs: 0, restoreDelayMs: 20_000, current: null, candidate: "#cc3388", lastChangeMs: 0, nowMs: 100_000 };
  test("applies, rate-limits and restores", () => {
    expect(planAccent(common)).toEqual({ target: "#cc3388", restore: false });
    expect(planAccent({ ...common, current: "#112233", lastChangeMs: 100_000 - MIN_GAP_MS + 1 }).target).toBeNull();
    expect(planAccent({ ...common, current: "#112233", lastChangeMs: 100_000 - MIN_GAP_MS }).target).toBe("#cc3388");
    expect(planAccent({ ...common, current: "#cc3388" }).target).toBeNull();
    expect(planAccent({ ...common, playing: false, current: "#cc3388", stoppedForMs: 5_000 })).toEqual({ target: null, restore: false });
    expect(planAccent({ ...common, playing: false, current: "#cc3388", stoppedForMs: 20_000 })).toEqual({ target: null, restore: true });
  });
  test("never in fullscreen/games, and turning it off restores", () => {
    expect(planAccent({ ...common, suppressed: true, current: "#cc3388" })).toEqual({ target: null, restore: true });
    expect(planAccent({ ...common, enabled: false, current: null })).toEqual({ target: null, restore: false });
  });
});

describe("titles and sources", () => {
  test("split title into main + subtitle", () => {
    expect(splitTitle("Placeholder Song [From Lens: Original Score]")).toEqual({ main: "Placeholder Song", sub: "From Lens: Original Score" });
    expect(splitTitle("Tune (from The Film)")).toEqual({ main: "Tune", sub: "From The Film" });
    expect(splitTitle("Plain Song", "Album")).toEqual({ main: "Plain Song", sub: "Album" });
    expect(splitTitle("Song (Live)", "Album").main).toBe("Song (Live)");
  });
  test("artists and initials", () => {
    expect(splitArtists("A, B & C feat. D")).toEqual(["A", "B", "C", "D"]);
    expect(splitArtists("")).toEqual([]);
    expect(initials("Lens Test Band")).toBe("LB");
    expect(initials("Ö")).toBe("Ö");
    expect(initials("!!")).toBe("♪");
  });
  test("what each source can do", () => {
    expect(sourceCaps("Spotify.exe", true)).toMatchObject({ queue: true, like: true, note: "" });
    expect(sourceCaps("Spotify.exe", false).queue).toBe(false);
    expect(sourceCaps("Spotify.exe", false).note).toContain("Connect Spotify");
    expect(sourceCaps("AppleInc.AppleMusicWin_x!App", true).note).toContain("Cider");
    expect(sourceCaps("msedge.exe", true)).toMatchObject({ queue: false, note: "" });
  });
});
