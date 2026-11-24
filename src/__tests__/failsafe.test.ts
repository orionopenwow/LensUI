// Failsafe policy for crashed surfaces (docs/FAILSAFE.md §1).
import { describe, expect, test } from "bun:test";
import {
  FIRST_RELOAD_MS,
  MAX_IN_A_ROW,
  OVERLAY_SURFACES,
  ROW_WINDOW_MS,
  SECOND_RELOAD_MS,
  createRateLimit,
  describeError,
  isDisabled,
  isOverlay,
  nextRecord,
  parseRecord,
  problemText,
  stepFor,
} from "../failsafe/policy";
import { noticeTitle } from "../failsafe/FailsafeNotices";

describe("surface crash policy", () => {
  test("the first failure reloads by itself after a short wait", () => {
    const r = nextRecord(null, 1_000);
    expect(r).toEqual({ count: 1, lastAt: 1_000 });
    expect(stepFor(r.count, false)).toEqual({ kind: "reload", afterMs: FIRST_RELOAD_MS });
    expect(stepFor(r.count, true)).toEqual({ kind: "reload", afterMs: FIRST_RELOAD_MS });
  });

  test("the second failure in a row offers Reload in a window and backs off in an overlay", () => {
    const r = nextRecord({ count: 1, lastAt: 1_000 }, 2_000);
    expect(r.count).toBe(2);
    expect(stepFor(r.count, false)).toEqual({ kind: "offer" });
    expect(stepFor(r.count, true)).toEqual({ kind: "reload", afterMs: SECOND_RELOAD_MS });
    expect(SECOND_RELOAD_MS).toBeGreaterThan(FIRST_RELOAD_MS);
  });

  test("three failures in a row switch the surface off", () => {
    let r = nextRecord(null, 0);
    r = nextRecord(r, 900);
    r = nextRecord(r, 5_000);
    expect(r.count).toBe(MAX_IN_A_ROW);
    expect(stepFor(r.count, false)).toEqual({ kind: "disabled" });
    expect(stepFor(r.count, true)).toEqual({ kind: "disabled" });
    expect(isDisabled(r)).toBe(true);
    expect(isDisabled({ count: 2, lastAt: 0 })).toBe(false);
    expect(isDisabled(null)).toBe(false);
  });

  test("failures far apart are not in a row", () => {
    const r = nextRecord({ count: 2, lastAt: 1_000 }, 1_000 + ROW_WINDOW_MS + 1);
    expect(r.count).toBe(1);
  });

  test("a clock that went backwards or a damaged record starts again from one", () => {
    expect(nextRecord({ count: 2, lastAt: 9_000 }, 1_000).count).toBe(1);
    expect(nextRecord({ count: Number.NaN, lastAt: 0 }, 10).count).toBe(1);
    expect(parseRecord("{not json")).toBeNull();
    expect(parseRecord('{"count":"3","lastAt":1}')).toBeNull();
    expect(parseRecord('{"count":0,"lastAt":1}')).toBeNull();
    expect(parseRecord(null)).toBeNull();
    expect(parseRecord('{"count":2,"lastAt":77}')).toEqual({ count: 2, lastAt: 77 });
  });

  test("see-through and click-through surfaces are overlays; windows are not", () => {
    for (const s of ["wallpaper", "cursorfx", "snip", "notifications", "desktopfolder"]) expect(isOverlay(s)).toBe(true);
    for (const s of ["dock", "topbar", "settings", "launcher", "palette"]) expect(isOverlay(s)).toBe(false);
    expect(OVERLAY_SURFACES.size).toBeGreaterThan(8);
  });

  test("the card text says what is happening in plain words", () => {
    expect(problemText({ kind: "reload", afterMs: 800 })).toContain("Reloading");
    expect(problemText({ kind: "offer" })).toBe("This part of Lens hit a problem.");
    expect(problemText({ kind: "disabled" })).toContain("off until Lens restarts");
  });
});

describe("reporter", () => {
  test("errors are cut to a short message and the top of the stack", () => {
    const e = new Error("x".repeat(900));
    e.stack = Array.from({ length: 40 }, (_, i) => `at frame${i}`).join("\n");
    const d = describeError(e);
    expect(d.message.length).toBe(400);
    expect(d.stack.split("\n").length).toBe(12);
    expect(describeError("plain").message).toBe("plain");
    expect(describeError({ a: 1 }).message).toBe('{"a":1}');
    expect(describeError(undefined).message).toBe("undefined");
    const loop: Record<string, unknown> = {};
    loop.self = loop;
    expect(typeof describeError(loop).message).toBe("string");
  });

  test("a page stuck in an error loop cannot flood the log", () => {
    const allow = createRateLimit(3, 1_000);
    expect([allow(0), allow(1), allow(2), allow(3)]).toEqual([true, true, true, false]);
    expect(allow(1_500)).toBe(true);
  });

  test("notices get a title that says what kind they are", () => {
    expect(noticeTitle({ id: "safe-mode", kind: "info" })).toBe("Lens is in Safe Mode");
    expect(noticeTitle({ id: "breaker:volume", kind: "error" })).toBe("A feature was paused");
    expect(noticeTitle({ id: "config-repaired", kind: "info" })).toBe("Settings were repaired");
    expect(noticeTitle({ id: "surface:topbar", kind: "error" })).toBe("Part of Lens is off");
    expect(noticeTitle({ id: "other", kind: "error" })).toBe("Lens hit a problem");
  });
});
