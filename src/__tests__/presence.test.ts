import { describe, expect, test } from "bun:test";
import {
  caption,
  controlPoint,
  ease,
  hotkeyProblem,
  maskLocal,
  pathAt,
  pathPoints,
  restPoint,
  sceneFor,
  travelMs,
  twinAnchor,
  ORB_SIZE,
} from "../presence/model";
import type { PresenceEvent } from "../presence/types";

const ev = (over: Partial<PresenceEvent> = {}): PresenceEvent => ({
  run: 1,
  seq: 1,
  actor: { kind: "internal", label: "Lens" },
  external: false,
  visual: "full",
  travel: true,
  catchUp: false,
  kind: "click",
  target: { x: 400, y: 300, w: 40, h: 40 },
  dest: null,
  monitor: null,
  caption: "Lens · Clicking ‘Files’ · 1/2",
  text: null,
  index: 1,
  total: 2,
  settings: [],
  durationMs: 400,
  captions: true,
  ...over,
});

describe("presence: travel path", () => {
  test("eases from start to end", () => {
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
    expect(ease(0.5)).toBeCloseTo(0.5, 6);
    expect(ease(0.25)).toBeLessThan(0.25); // slow start
    expect(ease(0.75)).toBeGreaterThan(0.75); // slow finish
  });
  test("path starts and ends on the points and stays gentle", () => {
    const a = { x: 0, y: 0 };
    const b = { x: 1000, y: 0 };
    expect(pathAt(a, b, 0)).toEqual(a);
    const end = pathAt(a, b, 1);
    expect(end.x).toBeCloseTo(1000, 6);
    expect(end.y).toBeCloseTo(0, 6);
    const pts = pathPoints(a, b, 20);
    const maxLift = Math.max(...pts.map((p) => Math.abs(p.y)));
    expect(maxLift).toBeGreaterThan(0);
    expect(maxLift).toBeLessThanOrEqual(120);
    // monotonic along the path direction (no loops)
    for (let i = 1; i < pts.length; i++) expect(pts[i].x).toBeGreaterThanOrEqual(pts[i - 1].x - 1e-9);
  });
  test("zero-length paths do not divide by zero", () => {
    const p = { x: 5, y: 5 };
    expect(controlPoint(p, p)).toEqual(p);
    expect(pathAt(p, p, 0.5)).toEqual(p);
  });
  test("travel time matches the backend (250–450 ms)", () => {
    expect(travelMs(0)).toBe(250);
    expect(travelMs(800)).toBe(350);
    expect(travelMs(5000)).toBe(450);
    expect(travelMs(Number.NaN)).toBe(250);
  });
});

describe("presence: scenes", () => {
  test("first step of a run fades in place; later steps travel", () => {
    const first = sceneFor(ev(), null);
    expect(first.travel).toBe(false);
    expect(first.from).toEqual(first.to);
    const next = sceneFor(ev({ seq: 2 }), { x: 10, y: 10 });
    expect(next.travel).toBe(true);
    expect(next.from).toEqual({ x: 10, y: 10 });
    expect(next.to).toEqual({ x: 420, y: 320 });
    expect(next.ripple).toEqual({ x: 420, y: 320 });
  });
  test("reduced motion (travel=false) never travels", () => {
    const s = sceneFor(ev({ travel: false }), { x: 10, y: 10 });
    expect(s.travel).toBe(false);
    expect(s.from).toEqual(s.to);
  });
  test("catch-up jumps with no animation", () => {
    const s = sceneFor(ev({ catchUp: true }), { x: 10, y: 10 });
    expect(s.travel).toBe(false);
    expect(s.durationMs).toBe(0);
  });
  test("subtle: rings and captions, no orb", () => {
    const s = sceneFor(ev({ visual: "subtle" }), { x: 0, y: 0 });
    expect(s.orb).toBe(false);
    expect(s.travel).toBe(false);
    expect(s.ring).not.toBeNull();
    expect(s.caption).toContain("Lens");
  });
  test("none draws nothing", () => {
    const s = sceneFor(ev({ visual: "none" }), null);
    expect(s.ring).toBeNull();
    expect(s.caption).toBeNull();
    expect(s.chip).toBeNull();
  });
  test("window steps show a ghost at the destination", () => {
    const dest = { x: 0, y: 0, w: 960, h: 1040 };
    const s = sceneFor(ev({ kind: "window", dest }), null);
    expect(s.ghost?.to).toEqual(dest);
    expect(s.to).toEqual({ x: 480, y: 520 });
  });
  test("typing and setting chips", () => {
    expect(sceneFor(ev({ kind: "type", text: "hello" }), null).chip).toEqual({ kind: "type", text: "hello" });
    expect(sceneFor(ev({ kind: "setting", settings: ["Theme → Nord"] }), null).chip).toEqual({ kind: "setting", text: "Theme → Nord" });
  });
  test("waiting parks beside the approval card", () => {
    const card = { x: 500, y: 200, w: 440, h: 180 };
    const p = restPoint("wait", card, null, { x: 0, y: 0 });
    expect(p.x).toBeLessThan(card.x - ORB_SIZE / 2);
    expect(p.y).toBeGreaterThanOrEqual(card.y);
  });
  test("captions can be turned off", () => {
    expect(sceneFor(ev({ captions: false }), null).caption).toBeNull();
  });
});

describe("presence: captions, masking, hotkeys, twin", () => {
  test("caption mirrors presence::caption", () => {
    expect(caption("Claude Desktop", "Clicking ‘Book’", 3, 7)).toBe("Claude Desktop · Clicking ‘Book’ · 3/7");
    expect(caption("Lens", "Done", 9, 7)).toBe("Lens · Done · 7/7");
    expect(caption("Lens", "Step", 2, null)).toBe("Lens · Step · step 2");
    expect(caption("Lens", "a\u0007b", 1, null)).toBe("Lens · ab");
  });
  test("local masking", () => {
    expect(maskLocal("hunter2", true)).toBe("•••");
    expect(maskLocal("key sk-abcdef1234567890 ok", false)).toBe("key ••• ok");
    expect(maskLocal("card 4111111111111111", false)).toBe("card •••");
    expect(maskLocal("hello world", false)).toBe("hello world");
  });
  test("pause hotkey must not clash", () => {
    expect(hotkeyProblem("Ctrl+Alt+Pause")).toBeNull();
    expect(hotkeyProblem("alt+space")).not.toBeNull();
    expect(hotkeyProblem("Space+Alt")).not.toBeNull();
    expect(hotkeyProblem("Pause")).not.toBeNull();
    expect(hotkeyProblem("Foo+P")).not.toBeNull();
  });
  test("twin anchors", () => {
    expect(twinAnchor("Theme → Nord")).toBe("theme");
    expect(twinAnchor("Mode → Dark")).toBe("theme-mode");
    expect(twinAnchor("Volume → 30%")).toBe("volume");
    expect(twinAnchor("Something else")).toBeNull();
  });
});

import { pageStepInput, pageToWindow } from "../presence/browser";

describe("presence: browser page rects", () => {
  const host = { left: 260, top: 88, width: 900, height: 600 };
  test("offsets by the page box", () => {
    expect(pageToWindow([10, 20, 100, 30], host)).toEqual({ x: 270, y: 108, w: 100, h: 30 });
  });
  test("clips to the visible page and drops off-screen elements", () => {
    expect(pageToWindow([-50, 590, 100, 40], host)).toEqual({ x: 260, y: 678, w: 50, h: 10 });
    expect(pageToWindow([10, 700, 100, 30], host)).toBeNull();
    expect(pageToWindow([10, 10, 0, 30], host)).toBeNull();
    expect(pageToWindow([Number.NaN, 10, 10, 10], host)).toEqual({ x: 260, y: 98, w: 10, h: 10 });
  });
  test("step labels; secret fields stay secret", () => {
    expect(pageStepInput({ do: "click", target: {} }, "Book table", false)).toEqual({ kind: "click", label: "Clicking ‘Book table’" });
    const t = pageStepInput({ do: "type", target: {}, text: "hunter2" }, "Password", true);
    expect(t.kind).toBe("type");
    expect(t.secret).toBe(true);
    expect(pageStepInput({ do: "scroll", dy: 300 }, "", false).kind).toBe("travel");
  });
});
