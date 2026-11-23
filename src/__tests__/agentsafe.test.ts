import { describe, expect, test } from "bun:test";
import { collectorHelpers, collectorScript, lensTextCollector } from "../agentsafe/collector";
import { grantExpiryLabel, verdictHeadline, worstSeverity } from "../agentsafe/contract";

const h = collectorHelpers;

describe("agent safety: collector helpers", () => {
  test("parses CSS colours", () => {
    expect(h.parseColor("rgb(255, 0, 10)")).toEqual([255, 0, 10, 1]);
    expect(h.parseColor("rgba(0,0,0,0.5)")).toEqual([0, 0, 0, 0.5]);
    expect(h.parseColor("rgb(1 2 3 / 50%)")).toEqual([1, 2, 3, 0.5]);
    expect(h.parseColor("#fff")).toEqual([255, 255, 255, 1]);
    expect(h.parseColor("#00000080")?.[3]).toBeCloseTo(0.5, 2);
    expect(h.parseColor("transparent")).toEqual([0, 0, 0, 0]);
    expect(h.parseColor("hsl(0, 0%, 0%)")).toBeNull();
  });

  test("contrast ratio matches WCAG", () => {
    expect(h.contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 0);
    expect(h.contrastRatio([255, 255, 255], [255, 255, 255])).toBeCloseTo(1, 5);
    // White-on-white with 2% darkening: the classic hidden-instruction trick is well under 1.6.
    expect(h.contrastRatio([250, 250, 250], [255, 255, 255])).toBeLessThan(1.6);
    expect(h.contrastRatio([118, 118, 118], [255, 255, 255])).toBeGreaterThanOrEqual(4.5);
  });

  test("blends translucent text onto its background", () => {
    expect(h.blend([0, 0, 0, 0.5], [255, 255, 255])).toEqual([127.5, 127.5, 127.5]);
    expect(h.blend([10, 20, 30, 1], [0, 0, 0])).toEqual([10, 20, 30]);
  });

  test("off-screen detection", () => {
    const r = (left: number, top: number, w = 100, hgt = 20) => ({ left, top, right: left + w, bottom: top + hgt, width: w, height: hgt });
    expect(h.isOffscreen(r(-9999, 10), 1200, 3000)).toBe(true);
    expect(h.isOffscreen(r(10, -5000), 1200, 3000)).toBe(true);
    expect(h.isOffscreen(r(1300, 10), 1200, 3000)).toBe(true);
    expect(h.isOffscreen(r(10, 10), 1200, 3000)).toBe(false);
    expect(h.isOffscreen(r(10, 2900), 1200, 3000)).toBe(false);
  });

  test("injectable script is a self-contained expression", () => {
    const src = collectorScript(50);
    expect(src.startsWith("(")).toBe(true);
    expect(() => new Function(`return ${src}`)).not.toThrow();
    // With no document it returns an empty list instead of throwing.
    expect(new Function(`return ${src}`)()).toEqual([]);
    expect(lensTextCollector(10)).toEqual([]);
  });
});

describe("agent safety: contract helpers", () => {
  test("worst severity", () => {
    expect(worstSeverity([])).toBe("info");
    expect(worstSeverity([{ severity: "low" }, { severity: "critical" }, { severity: "medium" }])).toBe("critical");
    expect(worstSeverity([{ severity: "bogus" }])).toBe("info");
  });

  test("headlines", () => {
    expect(verdictHeadline("block", [])).toBe("Lens stopped this step");
    expect(verdictHeadline("ask", [{ severity: "high" }])).toBe("Check this before you approve");
    expect(verdictHeadline("ask", [{ severity: "low" }])).toBe("Needs your OK");
    expect(verdictHeadline("allow", [])).toBe("Looks fine");
  });

  test("grant expiry labels", () => {
    expect(grantExpiryLabel({ scope: "run", expiresAt: null }, 0)).toBe("This run only");
    expect(grantExpiryLabel({ scope: "day", expiresAt: 3600 * 18 }, 0)).toBe("18 h left");
    expect(grantExpiryLabel({ scope: "day", expiresAt: 600 }, 0)).toBe("10 min left");
    expect(grantExpiryLabel({ scope: "day", expiresAt: 10 }, 100)).toBe("0 min left");
  });
});
