// Productivity input: hot corners / Alt+drag / app hotkeys config readers, hotkey capture,
// quiet-hours maths (must agree with win_notifications::range_active), week start, and the
// Overview's workspace-move keys.
import { describe, expect, test } from "bun:test";
import {
  DEFAULT_ALT_DRAG,
  DEFAULT_DND_SCHEDULE,
  DEFAULT_HOT_CORNERS,
  describeDays,
  describeDndStatus,
  describeRange,
  eventToHotkey,
  hotkeyParts,
  leadingBlanks,
  localeWeekStart,
  minToTime,
  rangeActive,
  readAltDrag,
  readAppSummon,
  readDndSchedule,
  readHotCorners,
  resolveWeekStart,
  timeToMin,
  weekdayLabels,
} from "../utils/productivity";
import { moveTargetFor, workspaceCounts } from "../utils/overviewWorkspaces";
import type { LensConfig } from "../types/lens";

const cfg = (extra: object) => ({ ...extra }) as unknown as LensConfig;

describe("config readers", () => {
  test("everything is off by default", () => {
    expect(readHotCorners(cfg({}))).toEqual(DEFAULT_HOT_CORNERS);
    expect(readHotCorners(cfg({})).enabled).toBe(false);
    expect(readAltDrag(cfg({}))).toEqual(DEFAULT_ALT_DRAG);
    expect(readAltDrag(cfg({})).enabled).toBe(false);
    expect(readAppSummon(cfg({}))).toEqual({ enabled: false, bindings: [] });
    expect(readDndSchedule(null)).toEqual(DEFAULT_DND_SCHEDULE);
    expect(readDndSchedule(null).enabled).toBe(false);
  });
  test("partial configs keep the rest of the defaults", () => {
    const hc = readHotCorners(cfg({ hotCorners: { enabled: true, bottomRight: "lock" } }));
    expect(hc.enabled).toBe(true);
    expect(hc.bottomRight).toBe("lock");
    expect(hc.topLeft).toBe("overview");
    expect(hc.dwellMs).toBe(250);
    expect(readAltDrag(cfg({ altDrag: { enabled: true } })).exclude).toEqual([]);
    expect(readDndSchedule(cfg({ dndSchedule: { enabled: true } })).ranges.length).toBe(1);
  });
});

describe("hotkey capture", () => {
  const ev = (code: string, key: string, mods: Partial<Record<"ctrlKey" | "altKey" | "shiftKey" | "metaKey", boolean>> = {}) => ({
    code,
    key,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    ...mods,
  });
  test("canonical form matches the backend", () => {
    expect(eventToHotkey(ev("Backquote", "`", { ctrlKey: true, altKey: true }))).toBe("ctrl+alt+Backquote");
    expect(eventToHotkey(ev("KeyT", "T", { altKey: true, shiftKey: true }))).toBe("alt+shift+KeyT");
    expect(eventToHotkey(ev("Digit3", "#", { metaKey: true, shiftKey: true }))).toBe("shift+super+Digit3");
    expect(eventToHotkey(ev("F13", "F13"))).toBe("F13");
  });
  test("modifiers alone and unsupported keys are ignored", () => {
    expect(eventToHotkey(ev("ControlLeft", "Control", { ctrlKey: true }))).toBeNull();
    expect(eventToHotkey(ev("AltLeft", "Alt", { altKey: true }))).toBeNull();
    expect(eventToHotkey(ev("ArrowLeft", "ArrowLeft", { ctrlKey: true }))).toBeNull();
    expect(eventToHotkey(ev("Numpad1", "1", { ctrlKey: true }))).toBeNull();
  });
  test("labels for <kbd> chips", () => {
    expect(hotkeyParts("ctrl+alt+Backquote")).toEqual(["Ctrl", "Alt", "`"]);
    expect(hotkeyParts("shift+super+Digit3")).toEqual(["Shift", "Win", "3"]);
    expect(hotkeyParts("ctrl+shift+F12")).toEqual(["Ctrl", "Shift", "F12"]);
    expect(hotkeyParts("")).toEqual([]);
  });
});

describe("quiet hours", () => {
  const r = (startMin: number, endMin: number, days: number[]) => ({ startMin, endMin, days });
  test("same-day ranges", () => {
    const work = r(540, 1020, [1, 2, 3, 4, 5]);
    expect(rangeActive(work, 1, 540)).toBe(true);
    expect(rangeActive(work, 5, 1019)).toBe(true);
    expect(rangeActive(work, 5, 1020)).toBe(false);
    expect(rangeActive(work, 6, 720)).toBe(false);
  });
  test("overnight ranges belong to the day they start", () => {
    const nights = r(1320, 420, [5, 6]);
    expect(rangeActive(nights, 5, 1320)).toBe(true);
    expect(rangeActive(nights, 6, 0)).toBe(true);
    expect(rangeActive(nights, 6, 419)).toBe(true);
    expect(rangeActive(nights, 6, 420)).toBe(false);
    expect(rangeActive(nights, 0, 180)).toBe(true);
    expect(rangeActive(nights, 1, 180)).toBe(false);
    expect(rangeActive(nights, 5, 180)).toBe(false);
  });
  test("whole day", () => {
    expect(rangeActive(r(0, 0, [0]), 0, 1439)).toBe(true);
    expect(rangeActive(r(0, 0, [0]), 1, 0)).toBe(false);
  });
  test("times and descriptions", () => {
    expect(minToTime(0)).toBe("00:00");
    expect(minToTime(1439)).toBe("23:59");
    expect(minToTime(9999)).toBe("23:59");
    expect(timeToMin("07:30")).toBe(450);
    expect(timeToMin("7:05")).toBe(425);
    expect(timeToMin("24:00")).toBeNull();
    expect(timeToMin("noon")).toBeNull();
    expect(describeDays([0, 1, 2, 3, 4, 5, 6])).toBe("Every day");
    expect(describeDays([5, 1, 2, 3, 4])).toBe("Weekdays");
    expect(describeDays([6, 0])).toBe("Weekends");
    expect(describeDays([1, 3, 5])).toBe("Mon, Wed, Fri");
    expect(describeRange(r(1320, 420, [0, 1, 2, 3, 4, 5, 6]))).toBe("22:00–07:00 (overnight) · Every day");
    expect(describeRange(r(0, 0, [6, 0]))).toBe("All day · Weekends");
  });
  test("status line", () => {
    expect(describeDndStatus(null, false)).toBe("Notifications pop up as they arrive.");
    expect(describeDndStatus(null, true)).toContain("paused");
    const sched = { active: true, manual: false, scheduled: true, fullscreen: false, reason: "schedule", untilMin: 420 };
    expect(describeDndStatus(sched, false)).toBe("Quiet hours until 07:00. Timers still alert.");
    const fs = { ...sched, scheduled: false, fullscreen: true, reason: "fullscreen", untilMin: null };
    expect(describeDndStatus(fs, false)).toContain("fullscreen");
  });
});

describe("first day of the week", () => {
  test("explicit choices win", () => {
    expect(resolveWeekStart("1", "en-US")).toBe(1);
    expect(resolveWeekStart("0", "de-DE")).toBe(0);
    expect(resolveWeekStart("6", "en-GB")).toBe(6);
  });
  test("automatic follows the region", () => {
    expect(localeWeekStart("en-US")).toBe(0);
    expect(localeWeekStart("de-DE")).toBe(1);
    expect(localeWeekStart("en-GB")).toBe(1);
    expect(resolveWeekStart("auto", "fr-FR")).toBe(1);
    expect(resolveWeekStart(null, "en-US")).toBe(0);
  });
  test("headers and leading blanks", () => {
    expect(weekdayLabels(0)).toEqual(["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]);
    expect(weekdayLabels(1)).toEqual(["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]);
    expect(weekdayLabels(6)[0]).toBe("Sa");
    // November 2026 starts on a Sunday.
    expect(leadingBlanks(new Date(2026, 10, 1).getDay(), 0)).toBe(0);
    expect(leadingBlanks(new Date(2026, 10, 1).getDay(), 1)).toBe(6);
    expect(leadingBlanks(3, 1)).toBe(2);
    expect(leadingBlanks(1, 1)).toBe(0);
  });
});

describe("overview workspace moves", () => {
  test("Shift+arrows step without wrapping", () => {
    expect(moveTargetFor("ArrowRight", "ArrowRight", 0, 3)).toBe(1);
    expect(moveTargetFor("ArrowRight", "ArrowRight", 2, 3)).toBeNull();
    expect(moveTargetFor("ArrowLeft", "ArrowLeft", 0, 3)).toBeNull();
    expect(moveTargetFor("ArrowLeft", "ArrowLeft", 2, 3)).toBe(1);
  });
  test("Shift+digit uses the physical key", () => {
    expect(moveTargetFor("!", "Digit1", 2, 3)).toBe(0);
    expect(moveTargetFor("#", "Digit3", 0, 3)).toBe(2);
    expect(moveTargetFor("$", "Digit4", 0, 3)).toBeNull();
    expect(moveTargetFor("!", "Digit1", 0, 3)).toBeNull();
    expect(moveTargetFor("A", "KeyA", 0, 3)).toBeNull();
    expect(moveTargetFor("ArrowRight", "ArrowRight", 0, 0)).toBeNull();
  });
  test("counts per workspace", () => {
    const map = new Map([
      [1, 0],
      [2, 1],
      [3, 1],
    ]);
    expect(workspaceCounts([1, 2, 3, 4], (h) => map.get(h) ?? 0, 3)).toEqual([2, 2, 0]);
    expect(workspaceCounts([1], () => 7, 3)).toEqual([0, 0, 0]);
  });
});
