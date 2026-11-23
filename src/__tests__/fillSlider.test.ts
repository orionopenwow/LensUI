// FillSlider behaviour (keys, wheel, drag commits) and the mixer's stable row order.
import { describe, expect, test } from "bun:test";
import { createFillController, keyStep, valueAt, wheelStep } from "../settings/ui/fillModel";
import { emptyMix, reorderSessions } from "../settings/audioOrder";

/** Manual clock so debounced commits are deterministic. */
function fakeTimers() {
  let pending: { fn: () => void; id: number } | null = null;
  let next = 1;
  return {
    setTimer: (fn: () => void) => {
      pending = { fn, id: next++ };
      return pending.id;
    },
    clearTimer: (id: unknown) => {
      if (pending && pending.id === id) pending = null;
    },
    run: () => {
      const p = pending;
      pending = null;
      p?.fn();
    },
    get pending() {
      return !!pending;
    },
  };
}

describe("keys and wheel", () => {
  test("arrows move 1, PageUp/PageDown 10, Home/End jump; clamped", () => {
    expect(keyStep("ArrowRight", 50)).toBe(51);
    expect(keyStep("ArrowUp", 50)).toBe(51);
    expect(keyStep("ArrowLeft", 50)).toBe(49);
    expect(keyStep("ArrowDown", 0)).toBe(0);
    expect(keyStep("PageUp", 95)).toBe(100);
    expect(keyStep("PageDown", 5)).toBe(0);
    expect(keyStep("Home", 40)).toBe(0);
    expect(keyStep("End", 40)).toBe(100);
    expect(keyStep("a", 40)).toBeNull();
  });
  test("wheel up is louder, 2% per notch, clamped", () => {
    expect(wheelStep(-100, 50)).toBe(52);
    expect(wheelStep(100, 50)).toBe(48);
    expect(wheelStep(-300, 50)).toBe(56);
    expect(wheelStep(-30, 99)).toBe(100);
    expect(wheelStep(0, 50)).toBe(50);
  });
  test("pointer position maps across the bar", () => {
    expect(valueAt(0, 0, 200)).toBe(0);
    expect(valueAt(100, 0, 200)).toBe(50);
    expect(valueAt(260, 0, 200)).toBe(100);
    expect(valueAt(-5, 0, 200)).toBe(0);
    expect(valueAt(5, 0, 0)).toBe(0);
  });
});

describe("commit behaviour", () => {
  test("dragging moves the bar every time but commits once, on release", () => {
    const shown: number[] = [];
    const committed: number[] = [];
    const c = createFillController(40, (v) => shown.push(v), (v) => committed.push(v));
    c.press(45);
    c.move(60);
    c.move(72);
    expect(committed).toEqual([]);
    c.release();
    expect(shown).toEqual([45, 60, 72]);
    expect(committed).toEqual([72]);
  });
  test("releasing at the starting value commits nothing", () => {
    const committed: number[] = [];
    const c = createFillController(40, () => {}, (v) => committed.push(v));
    c.press(70);
    c.move(40);
    c.release();
    expect(committed).toEqual([]);
  });
  test("keys and wheel commit once after a pause (debounced)", () => {
    const t = fakeTimers();
    const committed: number[] = [];
    const c = createFillController(50, () => {}, (v) => committed.push(v), t);
    c.key("ArrowRight");
    c.key("ArrowRight");
    c.key("PageUp");
    c.wheel(-100);
    expect(committed).toEqual([]);
    expect(t.pending).toBe(true);
    t.run();
    expect(committed).toEqual([64]);
    expect(c.key("x")).toBe(false);
  });
  test("outside updates don't move the bar mid-drag or mid-debounce", () => {
    const t = fakeTimers();
    const c = createFillController(50, () => {}, () => {}, t);
    c.press(80);
    c.sync(10);
    expect(c.value).toBe(80);
    c.release();
    c.key("ArrowUp");
    c.sync(10);
    expect(c.value).toBe(81);
    t.run();
    c.sync(10);
    expect(c.value).toBe(10);
  });
  test("cancel snaps back to the last committed value", () => {
    const committed: number[] = [];
    const c = createFillController(30, () => {}, (v) => committed.push(v));
    c.press(90);
    c.cancel();
    expect(c.value).toBe(30);
    expect(committed).toEqual([]);
  });
});

describe("mixer order", () => {
  const step = (prev: ReturnType<typeof emptyMix>, rows: [number, boolean][]) =>
    reorderSessions(prev, rows.map(([pid, active]) => ({ pid, active })));

  test("playing apps come first", () => {
    const m = step(emptyMix(), [
      [1, false],
      [2, true],
      [3, false],
      [4, true],
    ]);
    expect(m.order.slice(0, 2).sort()).toEqual([2, 4]);
    expect(m.order.slice(2).sort()).toEqual([1, 3]);
  });

  test("rows stay put while nothing starts or stops playing", () => {
    let m = step(emptyMix(), [
      [1, true],
      [2, true],
      [3, false],
    ]);
    const first = [...m.order];
    for (let i = 0; i < 5; i++) m = step(m, [[3, false], [2, true], [1, true]]);
    expect(m.order).toEqual(first);
  });

  test("an app that starts playing moves to the top; one that stops leads the rest", () => {
    let m = step(emptyMix(), [
      [1, true],
      [2, false],
      [3, false],
    ]);
    m = step(m, [
      [1, true],
      [2, false],
      [3, true],
    ]);
    expect(m.order[0]).toBe(3);
    expect(m.order[1]).toBe(1);
    m = step(m, [
      [1, false],
      [2, false],
      [3, true],
    ]);
    expect(m.order).toEqual([3, 1, 2]);
  });

  test("closed apps disappear; new quiet apps join at the end", () => {
    let m = step(emptyMix(), [
      [1, true],
      [2, false],
    ]);
    m = step(m, [
      [1, true],
      [5, false],
    ]);
    expect(m.order).toEqual([1, 5]);
  });
});
