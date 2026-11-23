// Lens Snip: region maths, the annotation model (undo/redo, steps, redactions) and the actions
// bar keyboard flow.
import { describe, expect, test } from "bun:test";
import { area, boundsOf, contains, cssToPhysical, normalize, physicalToCss, snapEdges, snapTarget, type Rect } from "../snip/geom";
import { empty, isRedacted, nextStep, redactedLines, redactionCount, reduce, type Shape } from "../snip/annotations";
import { ACTIONS, disabledReason, initialFocus, onKey } from "../snip/actions";

/** xorshift so the property tests are deterministic. */
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return (lo: number, hi: number) => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return lo + (s % (hi - lo + 1));
  };
}

describe("geom", () => {
  test("normalize works in any drag direction", () => {
    expect(normalize(20, 30, 10, 10)).toEqual({ x: 10, y: 10, w: 11, h: 21 });
  });

  test("css → physical rounds outward and round-trips without losing pixels", () => {
    const r = rng(9);
    for (let i = 0; i < 2000; i++) {
      const dpr = [1, 1.25, 1.5, 1.75, 2][r(0, 4)];
      const origin = { x: r(-4000, 0), y: r(-2000, 0) };
      const phys = normalize(r(-4000, 4000), r(-2000, 2000), r(-4000, 4000), r(-2000, 2000));
      const back = cssToPhysical(physicalToCss(phys, origin, dpr), origin, dpr);
      expect(back.x <= phys.x && back.y <= phys.y).toBe(true);
      expect(back.x + back.w >= phys.x + phys.w && back.y + back.h >= phys.y + phys.h).toBe(true);
      expect(back.w - phys.w <= 2 && back.h - phys.h <= 2).toBe(true);
    }
  });

  test("snapping prefers the smallest containing rect and ignores slivers", () => {
    const win: Rect = { x: 0, y: 0, w: 800, h: 600 };
    const btn: Rect = { x: 100, y: 100, w: 80, h: 30 };
    expect(snapTarget([win, btn], 120, 110)).toEqual(btn);
    expect(snapTarget([win, btn], 500, 400)).toEqual(win);
    expect(snapTarget([{ x: 119, y: 109, w: 2, h: 2 }, win], 120, 110)).toEqual(win);
    expect(snapTarget([win], 900, 10)).toBeNull();
  });

  test("edge snapping only within the threshold", () => {
    const c = [{ x: 100, y: 100, w: 400, h: 300 }];
    expect(snapEdges({ x: 103, y: 96, w: 394, h: 310 }, c, 6)).toEqual(c[0]);
    expect(snapEdges({ x: 103, y: 96, w: 394, h: 310 }, c, 2)).toEqual({ x: 103, y: 96, w: 394, h: 310 });
  });

  test("lasso bounds", () => {
    expect(boundsOf([{ x: 1, y: 1 }])).toBeNull();
    const b = boundsOf([{ x: 10.2, y: 5 }, { x: 30, y: 9.7 }, { x: 15, y: 40 }])!;
    expect(b).toEqual({ x: 10, y: 5, w: 21, h: 36 });
    expect(contains(b, 30, 40)).toBe(true);
    expect(area(b)).toBe(21 * 36);
  });
});

const box = (id: string): Shape => ({ id, kind: "box", rect: { x: 0, y: 0, w: 10, h: 10 }, color: "#f00", width: 2 });
const step = (id: string): Shape => ({ id, kind: "step", x: 1, y: 1, n: 0, color: "#f00" });

describe("annotations", () => {
  test("undo and redo walk the history", () => {
    let h = empty();
    h = reduce(h, { type: "add", shape: box("a") });
    h = reduce(h, { type: "add", shape: box("b") });
    expect(h.doc.shapes.map((s) => s.id)).toEqual(["a", "b"]);
    h = reduce(h, { type: "undo" });
    expect(h.doc.shapes.map((s) => s.id)).toEqual(["a"]);
    h = reduce(h, { type: "redo" });
    expect(h.doc.shapes.map((s) => s.id)).toEqual(["a", "b"]);
    h = reduce(h, { type: "undo" });
    h = reduce(h, { type: "add", shape: box("c") });
    // A new change drops the redo stack.
    expect(h.future).toHaveLength(0);
    expect(reduce(h, { type: "redo" })).toBe(h);
    // Undo past the start is a no-op.
    let u = h;
    for (let i = 0; i < 10; i++) u = reduce(u, { type: "undo" });
    expect(u.doc.shapes).toHaveLength(0);
  });

  test("steps renumber when one is removed", () => {
    let h = empty();
    for (const id of ["s1", "s2", "s3"]) h = reduce(h, { type: "add", shape: step(id) });
    expect(h.doc.shapes.map((s) => (s.kind === "step" ? s.n : 0))).toEqual([1, 2, 3]);
    h = reduce(h, { type: "remove", id: "s2" });
    expect(h.doc.shapes.map((s) => (s.kind === "step" ? s.n : 0))).toEqual([1, 2]);
    expect(nextStep(h.doc)).toBe(3);
  });

  test("accepting redactions twice adds them once", () => {
    const rects = [{ rect: { x: 5, y: 5, w: 40, h: 12 }, label: "Email address" }];
    let h = reduce(empty(), { type: "redact", rects });
    const again = reduce(h, { type: "redact", rects });
    expect(again).toBe(h);
    expect(redactionCount(h.doc)).toBe(1);
    expect(isRedacted(h.doc, rects[0].rect)).toBe(true);
    h = reduce(h, { type: "undo" });
    expect(redactionCount(h.doc)).toBe(0);
  });

  test("update keeps id and kind; unknown ids are ignored", () => {
    let h = reduce(empty(), { type: "add", shape: box("a") });
    h = reduce(h, { type: "update", id: "a", patch: { color: "#0f0" } });
    expect(h.doc.shapes[0]).toMatchObject({ id: "a", kind: "box", color: "#0f0" });
    expect(reduce(h, { type: "update", id: "zzz", patch: { color: "#000" } })).toBe(h);
  });

  test("text under hidden areas is masked everywhere it leaves the studio", () => {
    const w = (text: string, x: number, y = 10) => ({ text, rect: { x, y, w: 40, h: 16 } });
    const lines = [{ words: [w("Owner:", 0), w("jane@x.com", 50), w("extra", 100)] }, { words: [w("Plan:", 0, 40), w("Team", 50, 40)] }];
    let h = reduce(empty(), { type: "redact", rects: [{ rect: { x: 48, y: 8, w: 95, h: 20 } }] });
    expect(redactedLines(lines, h.doc)).toEqual(["Owner: •••", "Plan: Team"]);
    h = reduce(h, { type: "undo" });
    expect(redactedLines(lines, h.doc)).toEqual(["Owner: jane@x.com extra", "Plan: Team"]);
    // A box that only grazes a word (under 40 % of it) leaves it alone.
    h = reduce(empty(), { type: "redact", rects: [{ rect: { x: 85, y: 10, w: 10, h: 16 } }] });
    expect(redactedLines(lines, h.doc)[0]).toBe("Owner: jane@x.com extra");
  });

  test("tiny crops are ignored", () => {
    const h = reduce(empty(), { type: "crop", rect: { x: 0, y: 0, w: 1, h: 1 } });
    expect(h.doc.crop).toBeNull();
  });
});

describe("actions bar", () => {
  const ready = { ocrReady: true, hasText: true, aiOn: true };

  test("number keys run actions, in order 1…0", () => {
    expect(ACTIONS.map((a) => a.key).join("")).toBe("1234567890");
    expect(onKey({ focus: 0 }, "4", {}, ready).run).toBe("pin");
    expect(onKey({ focus: 0 }, "6", {}, ready).run).toBe("claude");
  });

  test("text actions wait for OCR", () => {
    const waiting = { ocrReady: false, hasText: false, aiOn: true };
    expect(onKey({ focus: 0 }, "2", {}, waiting).run).toBeUndefined();
    expect(disabledReason("copyText", waiting)).toBe("Reading text…");
    expect(disabledReason("translate", { ocrReady: true, hasText: true, aiOn: false })).toContain("Lens Intelligence");
    expect(disabledReason("copy", waiting)).toBeNull();
  });

  test("arrows skip disabled chips and Enter runs the focused one", () => {
    const noText = { ocrReady: true, hasText: false, aiOn: true };
    const r1 = onKey({ focus: 0 }, "ArrowRight", {}, noText);
    expect(ACTIONS[r1.state.focus].id).toBe("save"); // skips Copy text
    expect(onKey(r1.state, "Enter", {}, noText).run).toBe("save");
    const back = onKey({ focus: 0 }, "ArrowLeft", {}, noText);
    expect(ACTIONS[back.state.focus].id).toBe("openIn");
  });

  test("ctrl shortcuts and escape", () => {
    expect(onKey({ focus: 3 }, "c", { ctrl: true }, ready).run).toBe("copy");
    expect(onKey({ focus: 3 }, "C", { ctrl: true, shift: true }, ready).run).toBe("copyText");
    expect(onKey({ focus: 3 }, "s", { ctrl: true }, ready).run).toBe("save");
    expect(onKey({ focus: 3 }, "Escape", {}, ready).close).toBe(true);
  });

  test("after-capture setting picks the first focused chip", () => {
    expect(ACTIONS[initialFocus("pin")].id).toBe("pin");
    expect(initialFocus("studio")).toBe(0);
  });
});
