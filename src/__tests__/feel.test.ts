// The feel (DESIGN.md §5): press timing, flow maths, and the guardrail that keeps migrated
// surfaces on weighted presses and motion tokens.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PressMachine, RELEASE_SLACK_MS as SLACK, isDisabled, weightOf, type PressClock, type PressHost } from "../ui/press/machine";
import { CLASS_WEIGHTS, classWeight } from "../ui/press/weights";
import { pressProps } from "../ui/press/usePress";
import { GROW_MAX_SHIFT, GROW_MIN_SCALE, STAGGER_CAP, SWAP_SHIFT, growPose, staggerDelay, swapDirection, swapPose } from "../ui/motion/flow";
import { localOrigin, ORIGIN_MAX_DISTANCE } from "../ui/motion/origin";
import { indicatorBox } from "../ui/motion/indicator";
import { flipDelta } from "../ui/motion/flip";
import { PRESS_MS, PRESS_WEIGHT, pressMs, releaseMs } from "../ui/motion/tokens";
import { defaultWeight } from "../ui/Button";

const ROOT = join(import.meta.dir, "..", "..");

/** A fake element: attributes in a map, and a log of data-press changes with their time. */
function host(attrs: Record<string, string> = {}) {
  const a = new Map(Object.entries(attrs));
  const log: [number, string | null][] = [];
  const h: PressHost & { log: typeof log; attrs: typeof a } = {
    log,
    attrs: a,
    getAttribute: (n) => a.get(n) ?? null,
    setAttribute: (n, v) => {
      a.set(n, v);
      if (n === "data-press") log.push([clock.t, v]);
    },
    removeAttribute: (n) => {
      if (n === "data-press" && a.has(n)) log.push([clock.t, null]);
      a.delete(n);
    },
    hasAttribute: (n) => a.has(n),
  };
  return h;
}

/** A manual clock: timers fire only when advanced. */
const clock = {
  t: 0,
  timers: [] as { at: number; fn: () => void; id: number }[],
  next: 1,
  reset() {
    this.t = 0;
    this.timers = [];
  },
  advance(ms: number) {
    const end = this.t + ms;
    for (;;) {
      this.timers.sort((x, y) => x.at - y.at);
      const due = this.timers[0];
      if (!due || due.at > end) break;
      this.timers.shift();
      this.t = due.at;
      due.fn();
    }
    this.t = end;
  },
};
const pc: PressClock = {
  now: () => clock.t,
  set: (fn, ms) => {
    const id = clock.next++;
    clock.timers.push({ at: clock.t + ms, fn, id });
    return id;
  },
  clear: (id) => {
    clock.timers = clock.timers.filter((x) => x.id !== id);
  },
};
const timing = { holdMin: () => 90, release: (w: string) => (w === "heavy" ? 260 : w === "light" ? 140 : 220) };
const machine = (attrs?: Record<string, string>) => {
  clock.reset();
  const h = host(attrs);
  return { h, m: new PressMachine(h, pc, timing) };
};

describe("usePress timing (DESIGN.md §5.1)", () => {
  test("press-in starts in the same event, with no wait", () => {
    const { h, m } = machine({ "data-weight": "medium" });
    expect(m.down()).toBe(true);
    expect(h.getAttribute("data-press")).toBe("in");
    expect(h.log).toEqual([[0, "in"]]);
  });

  test("an instant click still shows the press for at least 90 ms", () => {
    const { h, m } = machine({ "data-weight": "medium" });
    m.down();
    clock.advance(5);
    m.up();
    expect(h.getAttribute("data-press")).toBe("in");
    clock.advance(84);
    expect(h.getAttribute("data-press")).toBe("in");
    clock.advance(1);
    expect(h.getAttribute("data-press")).toBe("out");
    // The release runs its spring (plus a frame of slack), then the attribute is cleared.
    clock.advance(219 + SLACK);
    expect(h.getAttribute("data-press")).toBe("out");
    clock.advance(1);
    expect(h.getAttribute("data-press")).toBeNull();
    expect(h.log).toEqual([
      [0, "in"],
      [90, "out"],
      [310 + SLACK, null],
    ]);
  });

  test("a long press releases on pointer up, at once", () => {
    const { h, m } = machine({ "data-weight": "heavy" });
    m.down();
    clock.advance(400);
    m.up();
    expect(h.getAttribute("data-press")).toBe("out");
    clock.advance(260 + SLACK);
    expect(h.getAttribute("data-press")).toBeNull();
  });

  test("release length follows the weight (light 140, medium 220, heavy 260)", () => {
    for (const [w, ms] of [["light", 140], ["medium", 220], ["heavy", 260]] as const) {
      const { h, m } = machine({ "data-weight": w });
      m.down();
      clock.advance(100);
      m.up();
      clock.advance(ms + SLACK - 1);
      expect({ w, s: h.getAttribute("data-press") }).toEqual({ w, s: "out" });
      clock.advance(1);
      expect({ w, s: h.getAttribute("data-press") }).toEqual({ w, s: null });
    }
  });

  test("keyboard presses play the same press (down on keydown, min hold on keyup)", () => {
    // The delegate maps Space/Enter keydown → down() and keyup → up(); same machine, same timing.
    const { h, m } = machine({ "data-weight": "medium" });
    m.down();
    clock.advance(20);
    m.up();
    clock.advance(69);
    expect(h.getAttribute("data-press")).toBe("in");
    clock.advance(1);
    expect(h.getAttribute("data-press")).toBe("out");
  });

  test("pointer leave / cancel releases cleanly at once, and a later up is ignored", () => {
    const { h, m } = machine({ "data-weight": "medium" });
    m.down();
    clock.advance(10);
    m.cancel();
    expect(h.getAttribute("data-press")).toBe("out");
    m.up();
    clock.advance(220 + SLACK);
    expect(h.getAttribute("data-press")).toBeNull();
    expect(h.log.map((x) => x[1])).toEqual(["in", "out", null]);
  });

  test("a scheduled release is dropped when the control is pressed again (no queueing)", () => {
    const { h, m } = machine({ "data-weight": "medium" });
    m.down();
    m.up(); // release scheduled for t=90
    clock.advance(30);
    m.down(); // pressed again mid-hold
    clock.advance(200);
    expect(h.getAttribute("data-press")).toBe("in");
    m.up();
    expect(h.getAttribute("data-press")).toBe("out");
    // Pressing during the spring-back sinks again from where it is.
    clock.advance(50);
    m.down();
    expect(h.getAttribute("data-press")).toBe("in");
    expect(clock.timers.length).toBe(0);
  });

  test("disabled controls never press", () => {
    for (const attrs of [{ disabled: "" }, { "aria-disabled": "true" }, { "data-no-press": "" }]) {
      const { h, m } = machine({ "data-weight": "medium", ...attrs });
      expect(m.down()).toBe(false);
      m.up();
      clock.advance(500);
      expect(h.log).toEqual([]);
    }
    expect(isDisabled(host({ "aria-disabled": "false" }))).toBe(false);
  });

  test("pending: the control stays sunk (CSS [data-pending]); release() springs it back when work answers", () => {
    const { h, m } = machine({ "data-weight": "heavy", "data-pending": "true" });
    m.down();
    m.up();
    clock.advance(90);
    // The machine releases its own state; [data-pending] keeps the sunk pose in CSS.
    expect(h.getAttribute("data-pending")).toBe("true");
    h.removeAttribute("data-pending");
    m.release();
    expect(h.getAttribute("data-press")).toBe("out");
    clock.advance(260 + SLACK);
    expect(h.getAttribute("data-press")).toBeNull();
    const p = pressProps({ weight: "heavy", pending: true });
    expect(p).toEqual({ "data-weight": "heavy", "data-pending": "true", "aria-busy": true });
    expect(pressProps({ disabled: true })).toEqual({ "data-weight": "medium", "aria-disabled": true });
  });

  test("weights and tokens", () => {
    expect(weightOf(host({ "data-weight": "heavy" }))).toBe("heavy");
    expect(weightOf(host({}))).toBe("medium");
    expect(PRESS_MS).toEqual({ "press-in": 70, "press-release": 220, "press-release-heavy": 260, "press-hold-min": 90, "pending-delay": 300 });
    // No document in tests: the fallbacks.
    expect(pressMs("press-hold-min")).toBe(90);
    expect(releaseMs("heavy")).toBe(260);
    expect(releaseMs("medium")).toBe(220);
    expect(releaseMs("light")).toBe(140);
    expect(PRESS_WEIGHT.medium.scale).toBe(0.97);
    expect(PRESS_WEIGHT.heavy.scale).toBe(0.955);
    expect(PRESS_WEIGHT.light.scale).toBe(1);
    expect(defaultWeight("primary")).toBe("heavy");
    expect(defaultWeight("danger")).toBe("heavy");
    expect(defaultWeight("ghost")).toBe("medium");
  });

  test("motion.css and tokens.ts agree, and reduced motion keeps the fill step but drops depth", () => {
    const css = readFileSync(join(ROOT, "src/styles/motion.css"), "utf8");
    const root = css.slice(css.indexOf(":root {"), css.indexOf("@media"));
    for (const [k, v] of Object.entries(PRESS_MS)) expect({ k, ok: new RegExp(`--lens-${k}:\\s*${v}ms`).test(root) }).toEqual({ k, ok: true });
    expect(root).toMatch(/--lens-press-scale-heavy:\s*0\.955;/);
    expect(root).toMatch(/--lens-press-y-medium:\s*1px;/);
    expect(root).toMatch(/--lens-press-y-heavy:\s*1\.5px;/);
    expect(css).toMatch(/:root\[data-scheme="light"\] \{\s*--lens-press-tint: 255 255 255;/);
    const press = readFileSync(join(ROOT, "src/ui/press/press.css"), "utf8");
    // Depth through scale/translate (never transform, never layout); the fill step is a box-shadow.
    expect(press).toMatch(/scale: var\(--lens-p-scale\)/);
    expect(press).toMatch(/inset 0 0 0 100vmax rgb\(var\(--lens-press-tint\)/);
    expect(press).not.toMatch(/\b(width|height|top|left|margin|padding)\s*:\s*[^;]*var\(--lens-p-/);
    expect(press).toContain("var(--lens-ease-spring)");
  });
});

describe("class weights (shared classes inherit the feel)", () => {
  test("primary beats the base button class; rows are light", () => {
    const has = (cls: string[]) => (sel: string) => sel.split(".").filter(Boolean).every((c) => cls.includes(c));
    expect(classWeight(has(["cc-btn", "cc-btn-primary"]))).toBe("heavy");
    expect(classWeight(has(["cc-btn"]))).toBe("medium");
    expect(classWeight(has(["cc-nav-btn"]))).toBe("light");
    expect(classWeight(has(["qs-tile"]))).toBe("medium");
    expect(classWeight(has(["dock-item"]))).toBeNull();
    // The Dock and Lens Browser adopt in their own pass.
    expect(CLASS_WEIGHTS.some(([s]) => /dock|browser|lb-/.test(s))).toBe(false);
  });
});

describe("flows (DESIGN.md §5.3)", () => {
  const panel = { left: 0, top: 0, width: 400, height: 560 };
  test("grow: origin at the trigger, scale floored, nudged towards an outside trigger", () => {
    // A 32px bar button above the right end of the panel.
    const g = growPose({ left: 360, top: -30, width: 32, height: 24 }, panel);
    expect(g.origin).toBe("376px 0px");
    expect(g.from.scale).toBe(GROW_MIN_SCALE);
    expect(g.from.opacity).toBe(0);
    expect(g.from.y).toBe(-GROW_MAX_SHIFT);
    expect(g.from.x).toBeUndefined();
    expect(g.transform).toBe(`translate(0px, -14px) scale(${GROW_MIN_SCALE})`);
    // A big card opening into a slightly bigger panel: true-ish scale, no nudge.
    const c = growPose({ left: 20, top: 40, width: 360, height: 500 }, panel);
    expect(c.from.scale).toBeCloseTo(0.9, 2);
    expect(c.from.x).toBeUndefined();
    expect(c.from.y).toBeUndefined();
    expect(c.origin).toBe("200px 290px");
    // Never grows past 1 and never divides by zero.
    expect(growPose({ left: 0, top: 0, width: 900, height: 900 }, panel).from.scale).toBe(1);
    expect(growPose({ left: 0, top: 0, width: 10, height: 10 }, { left: 0, top: 0, width: 0, height: 0 }).from.scale).toBe(1);
  });

  test("the pop-out maps a screen rect into its own window, and ignores far-away triggers", () => {
    const win = { screenX: 1500, screenY: 34, innerWidth: 404, innerHeight: 580 };
    expect(localOrigin({ label: "quicksettings", left: 1860, top: 4, width: 28, height: 26, at: 0 }, win)).toEqual({ left: 360, top: -30, width: 28, height: 26 });
    expect(localOrigin({ label: "quicksettings", left: 1500 - ORIGIN_MAX_DISTANCE - 50, top: 40, width: 28, height: 26, at: 0 }, win)).toBeNull();
  });

  test("FLIP maths of the sliding indicator", () => {
    const a = indicatorBox({ offsetLeft: 2, offsetTop: 2, offsetWidth: 60, offsetHeight: 24 });
    const b = indicatorBox({ offsetLeft: 64, offsetTop: 2, offsetWidth: 90, offsetHeight: 24 });
    const d = flipDelta(a, b);
    expect(d).toMatchObject({ x: -62, y: 0, scaleY: 1, still: false });
    expect(d.scaleX).toBeCloseTo(60 / 90, 5);
    // Applying the delta to the new box (origin 0 0) lands exactly on the old one.
    expect(b.left + d.x).toBe(a.left);
    expect(b.width * d.scaleX).toBeCloseTo(a.width, 5);
  });

  test("stagger: --lens-stagger per item, first 6 only, then together", () => {
    const d = Array.from({ length: 10 }, (_, i) => staggerDelay(i, 30));
    expect(d).toEqual([0, 30, 60, 90, 120, 150, 180, 180, 180, 180]);
    expect(STAGGER_CAP).toBe(6);
    expect(Math.max(...d)).toBe(STAGGER_CAP * 30);
    // Reduced motion: --lens-stagger is 0ms, so everything arrives together.
    expect(Array.from({ length: 8 }, (_, i) => staggerDelay(i, 0))).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  });

  test("content swaps: 6px in the direction of travel", () => {
    expect(swapDirection(1, 3)).toBe("forward");
    expect(swapDirection(3, 1)).toBe("back");
    expect(swapDirection(2, 2)).toBe("none");
    expect(swapDirection(-1, 0)).toBe("none");
    expect(swapPose("forward")).toEqual({ x: SWAP_SHIFT, opacity: 0 });
    expect(swapPose("back")).toEqual({ x: -SWAP_SHIFT, opacity: 0 });
    expect(swapPose("none")).toEqual({ opacity: 0 });
    expect(SWAP_SHIFT).toBe(6);
  });

  test("flow helpers are transform/opacity only", () => {
    for (const f of ["flow.ts", "origin.ts", "indicator.ts"]) {
      const s = readFileSync(join(ROOT, "src/ui/motion", f), "utf8").replace(/\/\/[^\n]*/g, "");
      expect({ f, layout: s.match(/\.style\.(width|height|top|left|margin\w*|padding\w*)\b/g) }).toEqual({ f, layout: null });
      expect({ f, resize: s.match(/setSize|setPosition|_resize_cmd|place_surface_cmd/g) }).toEqual({ f, resize: null });
    }
  });
});

// ── Guardrail (DESIGN.md §5.5): migrated surfaces declare a press weight on every interactive element
// and use motion tokens, never raw durations. The list grows as Fable passes migrate areas.
function openingTags(src: string, name: string): { tag: string; start: number }[] {
  const res: { tag: string; start: number }[] = [];
  const re = new RegExp(`<${name}\\b`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    let i = m.index + m[0].length;
    let depth = 0;
    for (; i < src.length; i++) {
      const c = src[i];
      if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0) break;
    }
    res.push({ tag: src.slice(m.index, i + 1), start: m.index });
  }
  return res;
}
const lineOf = (s: string, i: number) => s.slice(0, i).split("\n").length;
const INTERACTIVE_ROLE = /\brole="(button|tab|menuitem|menuitemradio|menuitemcheckbox|option|radio|switch)"/;
const MIGRATED = readFileSync(join(ROOT, "tools/polish/feel-migrated.txt"), "utf8").split(/\s+/).filter(Boolean);

/** Interactive elements in a TSX source that have no press weight. Exported shape for the test below. */
export function unweighted(src: string): number[] {
  const bad: number[] = [];
  for (const el of ["button", "div", "span", "li", "a", "label", "section", "article"]) {
    for (const t of openingTags(src, el)) {
      const interactive = el === "button" ? !/role="(presentation|none)"/.test(t.tag) : INTERACTIVE_ROLE.test(t.tag);
      if (!interactive) continue;
      if (/\bdata-weight=/.test(t.tag) || /\{\.\.\.[^}]*\}/.test(t.tag)) continue;
      bad.push(lineOf(src, t.start));
    }
  }
  return bad;
}

/** Raw durations / curves in a migrated TSX source (strings and glide options). */
export function rawDurations(src: string): number[] {
  const code = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/\/\/[^\n]*/g, "");
  const bad: number[] = [];
  for (const m of code.matchAll(/(["'`])[^"'`\n]*?(?<![\w.-])\d+(?:\.\d+)?ms\b[^"'`\n]*\1/g)) bad.push(lineOf(code, m.index!));
  for (const m of code.matchAll(/cubic-bezier\(/g)) bad.push(lineOf(code, m.index!));
  for (const m of code.matchAll(/\b(duration|delay)\s*:\s*\d/g)) bad.push(lineOf(code, m.index!));
  return bad;
}

describe("feel guardrail (migrated surfaces)", () => {
  test("the migrated list covers the kit, Settings, setup, Quick settings and Search", () => {
    for (const f of ["src/ui/Button.tsx", "src/surfaces/ControlCenterSurface.tsx", "src/components/SetupWizard.tsx", "src/surfaces/QuickSettingsSurface.tsx", "src/surfaces/CommandPaletteSurface.tsx", "src/settings/SettingsNav.tsx"])
      expect(MIGRATED).toContain(f);
  });

  test("every button / role=button / tab / switch / option has a press weight", () => {
    const bad: string[] = [];
    for (const f of MIGRATED) for (const l of unweighted(readFileSync(join(ROOT, f), "utf8"))) bad.push(`${f}:${l}`);
    expect(bad).toEqual([]);
  });

  test("no raw durations or cubic-beziers (use the motion tokens)", () => {
    const bad: string[] = [];
    for (const f of MIGRATED) for (const l of rawDurations(readFileSync(join(ROOT, f), "utf8"))) bad.push(`${f}:${l}`);
    expect(bad).toEqual([]);
  });

  test("the checks catch what they should", () => {
    expect(unweighted(`<button type="button" onClick={() => a > b}>x</button>`)).toEqual([1]);
    expect(unweighted(`<button data-weight="light">x</button>\n<div role="button">y</div>\n<div className="x">z</div>`)).toEqual([2]);
    expect(unweighted(`<button {...press.props}>x</button><li role="option" data-weight="light" />`)).toEqual([]);
    expect(rawDurations(`const s = { transition: "opacity 200ms ease" };\n// 200ms in a comment\nglide(el, a, b, { duration: 180 });`)).toEqual([1, 3]);
    expect(rawDurations(`glide(el, a, b, { duration: "base" });`)).toEqual([]);
  });

  test("global.css no longer hand-writes :active presses for the migrated classes", () => {
    const g = readFileSync(join(ROOT, "src/styles/global.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const actives = [...g.matchAll(/([^{}]+):active\s*[{,]/g)].map((m) => m[1].trim().split(/\s|,/).pop());
    // Only the Dock's context menu keeps its own press until the Dock's pass.
    expect(actives).toEqual([".dock-ctx-item"]);
    // The legacy :active fallback skips anything that declares a weight.
    expect(readFileSync(join(ROOT, "src/styles/motion.css"), "utf8")).toContain(':where(:active):where(:not(:root:not([data-press-mode="own"]) [data-weight]))');
    // Windows in "own" press mode (Dock, Lens Browser, until their pass) get no weighted press.
    const main = readFileSync(join(ROOT, "src/main.tsx"), "utf8");
    expect(main).toMatch(/if \(ownPress\) document\.documentElement\.dataset\.pressMode = "own";\s*else installPress\(\);/);
  });

  test("kit components declare their weights", () => {
    const ui = (f: string) => readFileSync(join(ROOT, "src/ui", f), "utf8");
    expect(ui("Button.tsx")).toContain("usePress<HTMLButtonElement>({ weight: weight ?? defaultWeight(variant), pending })");
    expect(ui("Toggle.tsx")).toContain('data-weight="light"');
    expect(ui("Chip.tsx")).toContain('data-weight="light"');
    expect(ui("Segmented.tsx")).toContain('data-weight="medium"');
    expect(ui("Segmented.tsx")).toContain("useSlidingIndicator(");
    expect(ui("FlyoutClose.tsx")).toContain('data-weight="medium"');
  });
});
