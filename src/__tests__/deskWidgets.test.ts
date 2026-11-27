// Desktop widgets (docs/features/desktop-widgets.md): grid packing, collisions, moving, resizing,
// adding and removing with reflow, monitor changes and display scaling, the shared tick, the
// small models each widget uses, the flag and the Command phrases.
import { afterEach, describe, expect, test } from "bun:test";
import {
  addItem, cellAt, firstFree, fits, gridFor, layout, moveTo, newId, overlaps, rectOf, removeItem, resize, settle, snapCell, type GridItem,
} from "../deskwidgets/grid";
import { clock, setTickPaused, subscribe, tickDebug } from "../deskwidgets/tick";
import {
  DEFAULT_ZONES, KINDS, cityOf, handAngles, offsetLabel, parseZones, readCalendar, ringDash, searchKinds, secondDelay, tickOff, timeLeft, todayOpen, weatherFrom,
} from "../deskwidgets/model";
import { isEditWidgetsPhrase } from "../deskwidgets/api";
import { MAGIC_DEFAULTS, MAGIC_FLAGS, magicFlags } from "../magicwaves/flags";

const it = (id: string, size: string, col = -1, row = -1, kind = "clock"): GridItem => ({ id, kind, size, col, row, params: {} });
const pos = (items: GridItem[]) => Object.fromEntries(layout(items, G).placed.map((p) => [p.id, [p.col, p.row]]));
// 6 columns × 4 rows.
const G = gridFor(6 * 152 + 5 * 16 + 48, 4 * 152 + 3 * 16 + 48);

describe("grid geometry", () => {
  test("cells fit the window with margins and the Top Bar kept free", () => {
    expect([G.cols, G.rows]).toEqual([6, 4]);
    const withBar = gridFor(1920, 1040, { topInset: 34 });
    expect(withBar.top).toBe(24 + 34);
    expect(withBar.cols).toBe(Math.floor((1920 - 48 + 16) / 168));
    expect(withBar.rows).toBe(Math.floor((1040 - 58 - 24 + 16) / 168));
    expect(gridFor(100, 100).cols).toBe(0);
    expect(gridFor(NaN, 500).cols).toBe(0);
  });

  test("sizes span 1×1, 2×1 and 2×2 cells", () => {
    expect(rectOf(0, 0, "small", G)).toEqual({ x: 24, y: 24, w: 152, h: 152 });
    expect(rectOf(1, 2, "medium", G)).toEqual({ x: 24 + 168, y: 24 + 2 * 168, w: 320, h: 152 });
    expect(rectOf(0, 0, "large", G)).toEqual({ x: 24, y: 24, w: 320, h: 320 });
    expect(rectOf(0, 0, "nonsense", G).w).toBe(152);
  });

  test("fits and overlaps", () => {
    expect(fits(5, 3, "small", G)).toBe(true);
    expect(fits(5, 0, "medium", G)).toBe(false);
    expect(fits(4, 3, "large", G)).toBe(false);
    expect(fits(-1, 0, "small", G)).toBe(false);
    expect(fits(0.5, 0, "small", G)).toBe(false);
    expect(overlaps({ col: 0, row: 0, size: "large" }, { col: 1, row: 1, size: "small" })).toBe(true);
    expect(overlaps({ col: 0, row: 0, size: "medium" }, { col: 2, row: 0, size: "small" })).toBe(false);
    expect(overlaps({ col: 0, row: 0, size: "medium" }, { col: 0, row: 1, size: "medium" })).toBe(false);
  });
});

describe("packing", () => {
  test("fills top-left, down each column, then the next", () => {
    expect(pos([it("a", "small"), it("b", "small"), it("c", "medium"), it("d", "small")])).toEqual({ a: [0, 0], b: [0, 1], c: [0, 2], d: [0, 3] });
    // A medium can't start in a column that only has a 1-wide gap left; it goes where it fits.
    expect(pos([it("a", "large"), it("b", "large"), it("c", "small")])).toEqual({ a: [0, 0], b: [0, 2], c: [2, 0] });
  });

  test("chosen spots are kept, others flow around them, and nothing overlaps", () => {
    const placed = layout([it("a", "small", 3, 1), it("b", "large"), it("c", "medium", 0, 0)], G).placed;
    expect(placed.find((p) => p.id === "a")).toMatchObject({ col: 3, row: 1 });
    expect(placed.find((p) => p.id === "c")).toMatchObject({ col: 0, row: 0 });
    expect(placed.find((p) => p.id === "b")).toMatchObject({ col: 0, row: 1 });
    for (const x of placed) for (const y of placed) if (x.id !== y.id) expect(overlaps(x, y)).toBe(false);
  });

  test("a chosen spot that collides with an earlier one is reflowed", () => {
    expect(pos([it("a", "large", 0, 0), it("b", "small", 1, 1)])).toEqual({ a: [0, 0], b: [0, 2] });
  });

  test("what doesn't fit overflows and keeps its place in the list", () => {
    const many = Array.from({ length: 7 }, (_, i) => it(`l${i}`, "large"));
    const r = layout(many, G);
    expect(r.placed.length).toBe(6);
    expect(r.overflow).toEqual(["l6"]);
    expect(settle(many, G).find((x) => x.id === "l6")).toMatchObject({ col: -1, row: -1 });
    expect(firstFree(r.placed, "small", G)).toBeNull();
  });

  test("settle writes positions back and is stable", () => {
    const s = settle([it("a", "small"), it("b", "medium")], G);
    expect(s.map((x) => [x.col, x.row])).toEqual([[0, 0], [0, 1]]);
    expect(settle(s, G)).toEqual(s);
  });
});

describe("moving, resizing, adding, removing", () => {
  const base = settle([it("a", "small"), it("b", "small"), it("c", "medium"), it("d", "small")], G);

  test("moving onto a neighbour pushes it to the next free spot", () => {
    const next = moveTo(base, "d", 0, 0, G);
    const p = Object.fromEntries(next.map((x) => [x.id, [x.col, x.row]]));
    expect(p.d).toEqual([0, 0]);
    expect(p.a).not.toEqual([0, 0]);
    const placed = layout(next, G).placed;
    for (const x of placed) for (const y of placed) if (x.id !== y.id) expect(overlaps(x, y)).toBe(false);
    // The list order is kept (it's the reading order on screen).
    expect(next.map((x) => x.id)).toEqual(["a", "b", "c", "d"]);
  });

  test("moving to an empty spot moves only that widget", () => {
    const next = moveTo(base, "a", 4, 2, G);
    expect(next.find((x) => x.id === "a")).toMatchObject({ col: 4, row: 2 });
    expect(next.filter((x) => x.id !== "a")).toEqual(base.filter((x) => x.id !== "a"));
  });

  test("a move off the grid is ignored", () => {
    expect(moveTo(base, "c", 5, 0, G)).toEqual(base);
    expect(moveTo(base, "nope", 1, 1, G)).toEqual(base);
  });

  test("growing to Large keeps the spot and neighbours make room", () => {
    const next = resize(base, "a", "large", G);
    expect(next.find((x) => x.id === "a")).toMatchObject({ size: "large", col: 0, row: 0 });
    const placed = layout(next, G).placed;
    expect(placed.length).toBe(4);
    for (const x of placed) for (const y of placed) if (x.id !== y.id) expect(overlaps(x, y)).toBe(false);
  });

  test("a widget at the right edge that grows moves to where it fits", () => {
    const edge = settle([it("a", "small", 5, 0)], G);
    const next = resize(edge, "a", "medium", G);
    expect(next[0]).toMatchObject({ size: "medium", col: 0, row: 0 });
  });

  test("shrinking keeps the spot", () => {
    const big = resize(base, "c", "large", G);
    const back = resize(big, "c", "small", G);
    const c = big.find((x) => x.id === "c")!;
    expect(back.find((x) => x.id === "c")).toMatchObject({ size: "small", col: c.col, row: c.row });
  });

  test("adding goes to the first free spot, or the dropped cell", () => {
    const one = addItem(base, { id: "n", kind: "notes", size: "small", params: {} }, G);
    expect(one.find((x) => x.id === "n")).toMatchObject({ col: 1, row: 0 });
    const dropped = addItem(base, { id: "n", kind: "notes", size: "medium", params: {}, col: 3, row: 3 }, G);
    expect(dropped.find((x) => x.id === "n")).toMatchObject({ col: 3, row: 3, size: "medium" });
    const onTop = addItem(base, { id: "n", kind: "notes", size: "small", params: {}, col: 0, row: 0 }, G);
    expect(onTop.find((x) => x.id === "n")).toMatchObject({ col: 0, row: 0 });
    expect(onTop.find((x) => x.id === "a")).not.toMatchObject({ col: 0, row: 0 });
  });

  test("removing leaves the others where they are", () => {
    const next = removeItem(base, "b");
    expect(next.map((x) => x.id)).toEqual(["a", "c", "d"]);
    expect(next.find((x) => x.id === "c")).toMatchObject({ col: 0, row: 2 });
  });

  test("new ids are unique and clean", () => {
    const ids = new Set(Array.from({ length: 50 }, () => newId("clock", 1)));
    expect(ids.size).toBe(50);
    expect(newId("we ird!", 1)).toMatch(/^weird-[0-9a-z]+$/);
  });
});

describe("monitor changes and display scaling", () => {
  test("a smaller monitor clamps widgets back onto the grid", () => {
    const wide = gridFor(1920, 1040);
    const items = settle([it("a", "small", 10, 0), it("b", "large", 8, 2)], wide);
    const small = gridFor(1280, 680);
    const next = settle(items, small);
    for (const x of next) expect(fits(x.col, x.row, x.size, small)).toBe(true);
  });

  test("150 % scaling gives fewer CSS pixels, so fewer cells, and the layout still fits", () => {
    const at100 = gridFor(1920, 1040);
    const at150 = gridFor(1920 / 1.5, 1040 / 1.5);
    expect(at150.cols).toBeLessThan(at100.cols);
    const items = settle([it("a", "large"), it("b", "large"), it("c", "medium"), it("d", "small", 9, 4)], at100);
    const r = layout(items, at150);
    for (const p of r.placed) expect(fits(p.col, p.row, p.size, at150)).toBe(true);
    expect(r.placed.length + r.overflow.length).toBe(4);
  });

  test("snapping and dropping clamp to the grid", () => {
    expect(snapCell(24 + 168 * 2 + 40, 24 + 10, "small", G)).toEqual({ col: 2, row: 0 });
    expect(snapCell(99999, 99999, "large", G)).toEqual({ col: 4, row: 2 });
    expect(snapCell(-500, -500, "small", G)).toEqual({ col: 0, row: 0 });
    expect(cellAt(24 + 170, 24 + 5, G)).toEqual({ col: 1, row: 0 });
    expect(cellAt(5, 5, G)).toBeNull();
  });
});

describe("the shared tick", () => {
  const timers: { fn: () => void }[] = [];
  const orig = { ...clock };
  afterEach(() => Object.assign(clock, orig));

  test("one timer for every listener, none while paused or unused", () => {
    clock.every = ((fn: () => void) => (timers.push({ fn }), timers.length) as never) as typeof clock.every;
    clock.stop = (() => {}) as typeof clock.stop;
    let t = new Date(2026, 0, 1, 10, 0, 0);
    clock.now = () => t;
    const seen: string[] = [];
    const a = subscribe("second", () => seen.push("s1"));
    const b = subscribe("second", () => seen.push("s2"));
    const c = subscribe("minute", () => seen.push("m"));
    expect(tickDebug()).toMatchObject({ running: true, seconds: 2, minutes: 1 });
    expect(timers.length).toBe(1);
    timers[0].fn();
    t = new Date(2026, 0, 1, 10, 0, 1);
    timers[0].fn();
    expect(seen.filter((x) => x === "m").length).toBe(1);
    expect(seen.filter((x) => x === "s1").length).toBe(2);
    setTickPaused(true);
    expect(tickDebug().running).toBe(false);
    setTickPaused(false);
    expect(tickDebug().running).toBe(true);
    a();
    b();
    c();
    expect(tickDebug()).toMatchObject({ running: false, seconds: 0, minutes: 0 });
  });
});

describe("widget models", () => {
  test("zones: valid ones kept, defaults fill to four", () => {
    expect(parseZones("Europe/Paris, Not/AZone, Europe/Paris")).toEqual(["Europe/Paris", ...DEFAULT_ZONES.slice(0, 3)]);
    expect(parseZones(undefined)).toEqual(DEFAULT_ZONES);
    expect(cityOf("America/New_York")).toBe("New York");
    expect(cityOf("local")).toBe("Here");
  });

  test("hands and the second sweep", () => {
    expect(handAngles({ h: 15, m: 30, s: 0 })).toEqual({ hour: 105, minute: 180, second: 0 });
    expect(secondDelay(new Date(2026, 0, 1, 1, 2, 15, 500))).toBe("-15.50s");
    expect(offsetLabel(new Date(), "local")).toBe("Today");
  });

  test("today: open items in time order, tick-off touches only one", () => {
    const now = new Date(2026, 4, 3, 9, 0);
    const ev = readCalendar(
      JSON.stringify([
        { id: "1", dateKey: "2026-05-03", time: "13:00", title: "B", done: false },
        { id: "2", dateKey: "2026-05-03", time: "", title: "untimed", done: false },
        { id: "3", dateKey: "2026-05-03", time: "08:00", title: "A", done: false },
        { id: "4", dateKey: "2026-05-04", time: "08:00", title: "tomorrow", done: false },
        { id: "5", dateKey: "2026-05-03", time: "07:00", title: "done", done: true },
        { nope: 1 },
      ]),
    );
    expect(todayOpen(ev, now).map((e) => e.id)).toEqual(["3", "1", "2"]);
    const after = tickOff(ev, "1");
    expect(todayOpen(after, now).map((e) => e.id)).toEqual(["3", "2"]);
    expect(after.find((e) => e.id === "4")).toEqual(ev.find((e) => e.id === "4")!);
    expect(readCalendar("not json")).toEqual([]);
    expect(readCalendar(null)).toEqual([]);
  });

  test("weather from the approved Open-Meteo answer", () => {
    const body = JSON.stringify({ current: { temperature_2m: 21.4, weather_code: 2, wind_speed_10m: 9.3 }, daily: { temperature_2m_max: [26.1], temperature_2m_min: [14.8] } });
    expect(weatherFrom(body, "c")).toEqual({ temp: 21.4, code: 2, hi: 26.1, lo: 14.8, wind: 9.3, unit: "°C" });
    expect(weatherFrom(body, "f")?.unit).toBe("°F");
    expect(weatherFrom("{}", "c")).toBeNull();
    expect(weatherFrom("<html>", "c")).toBeNull();
  });

  test("battery ring and time left", () => {
    const c = 2 * Math.PI * 20;
    expect(ringDash(50, 20)).toBe(`${(c / 2).toFixed(2)} ${c.toFixed(2)}`);
    expect(ringDash(null, 20)).toBe(`0.00 ${c.toFixed(2)}`);
    expect(ringDash(150, 20).split(" ")[0]).toBe(c.toFixed(2));
    expect(timeLeft(3 * 3600 + 120)).toBe("3 h 2 min left");
    expect(timeLeft(null)).toBeNull();
  });

  test("gallery search and kinds", () => {
    expect(searchKinds("remind").map((k) => k.id)).toEqual(["today"]);
    expect(searchKinds("").length).toBe(KINDS.length);
    expect(searchKinds("battery").map((k) => k.id)).toEqual(["batteries"]);
    // Only kinds that go through an approved Dashboard widget may use the network.
    expect(KINDS.filter((k) => k.fetches).map((k) => k.id).sort()).toEqual(["gallery", "weather"]);
    for (const k of KINDS) expect(k.sizes).toEqual(["small", "medium", "large"]);
  });
});

describe("flag and Command", () => {
  test("desktop widgets are off by default and a real flag", () => {
    expect(MAGIC_FLAGS).toContain("desktopWidgets");
    expect(MAGIC_DEFAULTS.desktopWidgets).toBe(false);
    expect(magicFlags({ magicWaves: { desktopWidgets: true } as never }).desktopWidgets).toBe(true);
    expect(magicFlags({ magicWaves: { desktopWidgets: "yes" } as never }).desktopWidgets).toBe(false);
  });

  test("edit widgets phrases", () => {
    for (const p of ["edit widgets", "Edit my desktop widgets.", "arrange widgets", "customize the widgets", "/widgets", "add a desktop widget"]) expect(isEditWidgetsPhrase(p)).toBe(true);
    for (const p of ["widgets", "show widgets", "what are widgets", "edit widgets settings please"]) expect(isEditWidgetsPhrase(p)).toBe(false);
  });
});

describe("press weight", () => {
  test("a press stays visible for at least 90 ms, even on the quickest click", async () => {
    const { releaseDelay, MIN_HOLD_MS } = await import("../deskwidgets/press");
    expect(MIN_HOLD_MS).toBe(90);
    expect(releaseDelay(1000, 1010)).toBe(80);
    expect(releaseDelay(1000, 1090)).toBe(0);
    expect(releaseDelay(1000, 1500)).toBe(0);
    expect(releaseDelay(1000, 900)).toBe(90);
  });

  test("every interactive element in the desktop widgets declares a weight", async () => {
    const { readFileSync, readdirSync } = await import("node:fs");
    const dir = new URL("../deskwidgets/", import.meta.url);
    for (const f of readdirSync(dir).filter((n) => n.endsWith(".tsx"))) {
      const src = readFileSync(new URL(f, dir), "utf8");
      for (const m of src.matchAll(/<button\b[\s\S]*?<\/button>/g)) {
        const tag = m[0].slice(0, m[0].search(/\n\s*>|">\s*\n|<\//) + 1 || 400);
        expect(`${f}: ${tag.replace(/\s+/g, " ").slice(0, 160)}`).toMatch(/data-weight="(light|medium|heavy)"/);
      }
    }
  });
});
