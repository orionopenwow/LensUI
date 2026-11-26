import { describe, expect, test } from "bun:test";
import {
  checkState,
  countAt,
  defaultTicked,
  driveTone,
  flow,
  fmtSize,
  headline,
  initialFlow,
  keyAction,
  neighbour,
  ordered,
  selectedBytes,
  selectedCount,
  selectionPayload,
  sparkPath,
  squarify,
  sunburst,
  arcPath,
  cleanCode,
  fmtScanTime,
  confirmStep,
} from "../cleaner/model";
import type { CleanerCategory, ScanReport, SpaceNode } from "../cleaner/types";

const cat = (id: string, safety: CleanerCategory["safety"], size: number, extra: Partial<CleanerCategory> = {}): CleanerCategory => ({
  id,
  title: id,
  description: "",
  cost: "",
  icon: "box",
  safety,
  method: safety === "REVIEW" ? "recycleFiles" : safety === "ADMIN" ? "elevated" : "deleteFiles",
  preTicked: safety === "SAFE",
  size,
  count: 1,
  items: [],
  partial: false,
  ...extra,
});

const report: ScanReport = {
  categories: [
    cat("browser-cache", "SAFE", 4_000_000_000),
    cat("recycle-bin", "SAFE", 1_000_000_000, { method: "emptyRecycleBin" }),
    cat("shader-cache", "SAFE", 2_000_000_000, { preTicked: false }),
    cat("windows-update", "ADMIN", 3_000_000_000),
    cat("big-downloads", "REVIEW", 9_000_000_000, {
      items: [
        { path: "C:\\d\\a.mkv", size: 6_000_000_000, ageDays: 40 },
        { path: "C:\\d\\b.iso", size: 3_000_000_000, ageDays: 90 },
      ],
    }),
  ],
  safeBytes: 7_000_000_000,
  reviewBytes: 12_000_000_000,
  elapsedMs: 900,
};

describe("lens cleaner flow", () => {
  test("SAFE pre-ticked starts selected; shader, ADMIN and REVIEW never", () => {
    expect(defaultTicked(report)).toEqual(["browser-cache", "recycle-bin"]);
    const s = flow(flow(initialFlow, { type: "scan" }), { type: "scanned", report });
    expect(s.screen).toBe("cleanup");
    expect(selectedBytes(s)).toBe(5_000_000_000);
    expect(selectedCount(s)).toBe(2);
  });

  test("toggles, picks and totals", () => {
    let s = flow(initialFlow, { type: "scanned", report });
    s = flow(s, { type: "toggle", id: "browser-cache" });
    expect(selectedBytes(s)).toBe(1_000_000_000);
    s = flow(s, { type: "pick", category: "big-downloads", path: "C:\\d\\b.iso" });
    expect(checkState(s, report.categories[4])).toBe("mixed");
    expect(selectedBytes(s)).toBe(4_000_000_000);
    s = flow(s, { type: "toggle", id: "big-downloads" });
    expect(checkState(s, report.categories[4])).toBe("checked");
    expect(selectedBytes(s)).toBe(10_000_000_000);
    s = flow(s, { type: "select-all-safe" });
    expect(s.ticked).toEqual(["browser-cache", "recycle-bin", "shader-cache"]);
    const pay = selectionPayload(s);
    expect(pay.picks.map((p) => p.path).sort()).toEqual(["C:\\d\\a.mkv", "C:\\d\\b.iso"]);
    s = flow(s, { type: "select-none" });
    expect(selectedBytes(s)).toBe(0);
    s = flow(s, { type: "cleaned", freed: 123 });
    expect(s.screen).toBe("done");
    expect(flow(s, { type: "home" })).toEqual(initialFlow);
  });

  test("display order: SAFE by size, ADMIN, then REVIEW", () => {
    expect(ordered(report).map((c) => c.id)).toEqual(["browser-cache", "shader-cache", "recycle-bin", "windows-update", "big-downloads"]);
    expect(headline(report).empty).toBe(false);
    expect(headline({ ...report, safeBytes: 1000, reviewBytes: 0 }).empty).toBe(true);
  });

  test("keyboard map", () => {
    expect(keyAction({ key: " " })).toBe("toggle");
    expect(keyAction({ key: "a", ctrlKey: true })).toBe("select-all-safe");
    expect(keyAction({ key: "Enter" })).toBe("clean");
    expect(keyAction({ key: "Enter", ctrlKey: true })).toBe("smart");
    expect(keyAction({ key: "Escape" })).toBe("back");
    expect(keyAction({ key: " ", target: { tagName: "input" } })).toBe(null);
  });
});

describe("lens cleaner formatting and motion", () => {
  test("sizes read like Explorer", () => {
    expect(fmtSize(32_500_000_000)).toBe("32.5 GB");
    expect(fmtSize(238_000_000_000)).toBe("238 GB");
    expect(fmtSize(9_600_000_000)).toBe("9.6 GB");
    expect(fmtSize(512)).toBe("512 B");
    expect(fmtSize(1_000_000_000_000)).toBe("1.0 TB");
  });
  test("drive tone", () => {
    expect(driveTone(238e9, 9.6e9)).toBe("danger");
    expect(driveTone(1000, 200)).toBe("warn");
    expect(driveTone(1000, 600)).toBe("ok");
  });
  test("count-up eases out and lands exactly", () => {
    expect(countAt(0, 100, 0, 900)).toBe(0);
    expect(countAt(0, 100, 900, 900)).toBe(100);
    expect(countAt(0, 100, 450, 900)).toBeGreaterThan(90);
    expect(countAt(5, 10, 1, 0)).toBe(10);
  });
  test("sparkline", () => {
    expect(sparkPath([1], 100, 20)).toBe("");
    expect(sparkPath([1, 2, 3], 100, 20).startsWith("M2.0 18.0")).toBe(true);
  });
});

describe("lens cleaner maps", () => {
  test("squarified treemap fills the box exactly, biggest first, no overlaps", () => {
    const items = [6, 6, 4, 3, 2, 2, 1].map((v, i) => ({ id: i, v }));
    const cells = squarify(items, (t) => t.v, { x: 0, y: 0, w: 600, h: 400 });
    expect(cells.length).toBe(7);
    const area = cells.reduce((a, c) => a + c.w * c.h, 0);
    expect(Math.abs(area - 240000)).toBeLessThan(1);
    for (const c of cells) {
      expect(Math.abs(c.w * c.h - (c.item.v / 24) * 240000)).toBeLessThan(1);
      expect(c.x).toBeGreaterThanOrEqual(-0.001);
      expect(c.x + c.w).toBeLessThanOrEqual(600.001);
    }
    for (let i = 0; i < cells.length; i++)
      for (let j = i + 1; j < cells.length; j++) {
        const a = cells[i];
        const b = cells[j];
        const overlap = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
        expect(overlap).toBeLessThan(0.5);
      }
    // Squarified cells stay reasonably square.
    const worst = Math.max(...cells.map((c) => Math.max(c.w / c.h, c.h / c.w)));
    expect(worst).toBeLessThan(4);
    expect(squarify([], (t: number) => t, { x: 0, y: 0, w: 10, h: 10 })).toEqual([]);
  });

  test("treemap arrow keys move to the nearest neighbour", () => {
    const cells = [
      { x: 0, y: 0, w: 50, h: 50 },
      { x: 50, y: 0, w: 50, h: 50 },
      { x: 0, y: 50, w: 100, h: 50 },
    ];
    expect(neighbour(cells, 0, "right")).toBe(1);
    expect(neighbour(cells, 1, "left")).toBe(0);
    expect(neighbour(cells, 0, "down")).toBe(2);
    expect(neighbour(cells, 2, "down")).toBe(2);
  });

  test("sunburst covers the circle and merges slivers into one petal", () => {
    const n = (id: number, size: number, children: SpaceNode[] = []): SpaceNode => ({ id, name: `n${id}`, path: "", size, files: 1, kind: "dir", hasChildren: children.length > 0, ageDays: 0, children });
    const kids = [n(1, 500, [n(11, 300), n(12, 200)]), n(2, 480), ...Array.from({ length: 10 }, (_, i) => n(100 + i, 2))];
    const arcs = sunburst(kids, 1000, { inner: 40, ring: 30, depth: 2, minAngle: 0.05 });
    const ring0 = arcs.filter((a) => a.depth === 0);
    const span = ring0.reduce((s, a) => s + (a.a1 - a.a0), 0);
    expect(Math.abs(span - Math.PI * 2)).toBeLessThan(1e-9);
    expect(ring0.filter((a) => a.small).length).toBe(1);
    const ring1 = arcs.filter((a) => a.depth === 1);
    expect(ring1.length).toBe(2);
    expect(ring1[0].a0).toBeCloseTo(ring0[0].a0, 9);
    expect(arcPath(100, 100, 40, 70, 0, Math.PI / 2)).toMatch(/^M/);
    expect(arcPath(100, 100, 40, 70, 0, Math.PI * 2)).toContain("A70 70 0 1 1");
  });
});

describe("permanent delete: the typed one-time code", () => {
  test("typed input keeps digits only", () => {
    expect(cleanCode(" 48 27 ")).toBe("4827");
    expect(cleanCode("4827999")).toBe("4827");
    expect(cleanCode("abcd")).toBe("");
  });
  test("the hold-to-confirm card only appears once the shown code is typed", () => {
    expect(confirmStep(false, null, "", false)).toBe("bin");
    expect(confirmStep(true, null, "", false)).toBe("loading");
    expect(confirmStep(true, "4827", "", false)).toBe("type");
    expect(confirmStep(true, "4827", "482", false)).toBe("type");
    expect(confirmStep(true, "4827", "4828", false)).toBe("type");
    expect(confirmStep(true, "4827", "4827", false)).toBe("hold");
    expect(confirmStep(true, "0007", "0007", false)).toBe("hold");
  });
  test("an expired code can't be used, even typed correctly", () => {
    expect(confirmStep(true, "4827", "4827", true)).toBe("expired");
  });
});

describe("measured scan time", () => {
  test("reads as seconds, then minutes", () => {
    expect(fmtScanTime(3_412)).toBe("3.4 s");
    expect(fmtScanTime(412)).toBe("0.4 s");
    expect(fmtScanTime(59_900)).toBe("59.9 s");
    expect(fmtScanTime(60_000)).toBe("1 min");
    expect(fmtScanTime(72_300)).toBe("1 min 12 s");
    expect(fmtScanTime(-5)).toBe("0.0 s");
  });
});
