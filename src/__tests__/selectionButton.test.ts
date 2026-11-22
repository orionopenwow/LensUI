// In-page selection button: placement maths, denylist / password detection, per-site settings.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
// @ts-ignore — classic script; attaches globalThis.LensSel
await import("../../extensions/browser/src/content/selectionLogic.js");
// @ts-ignore
import { CONTENT_SCRIPT_FILES } from "../../extensions/browser/build.mjs";
const L: any = (globalThis as any).LensSel;

const vp = (o: Partial<{ width: number; height: number; scrollX: number; scrollY: number }> = {}) => ({ width: 1200, height: 800, scrollX: 0, scrollY: 0, ...o });
const rect = (left: number, top: number, width: number, height: number) => ({ left, top, width, height, right: left + width, bottom: top + height });

describe("dot placement", () => {
  test("sits just below the end of the selection, in document coordinates", () => {
    const p = L.dotPosition(rect(100, 200, 300, 18), vp({ scrollY: 1000, scrollX: 5 }), 22, 6);
    expect(p).toEqual({ left: 403 + 5, top: 224 + 1000, placement: "below" });
  });

  test("flips above when there's no room below", () => {
    const p = L.dotPosition(rect(100, 770, 200, 18), vp(), 22, 6);
    expect(p.placement).toBe("above");
    expect(p.top).toBe(770 - 6 - 22);
  });

  test("never leaves the viewport horizontally or vertically", () => {
    const right = L.dotPosition(rect(1100, 100, 200, 18), vp(), 22, 6, 4);
    expect(right.left).toBe(1200 - 22 - 4);
    const tiny = L.dotPosition(rect(-50, -40, 10, 10), vp({ height: 30 }), 22, 6, 4);
    expect(tiny.left).toBeGreaterThanOrEqual(4);
    expect(tiny.top).toBeGreaterThanOrEqual(4);
  });

  test("panel opens below the dot, flips above, and stays on screen", () => {
    const below = L.panelPosition({ left: 400, top: 300 }, { width: 340, height: 360 }, vp());
    expect(below).toEqual({ left: 388, top: 330, placement: "below" });
    const above = L.panelPosition({ left: 400, top: 700 }, { width: 340, height: 360 }, vp());
    expect(above.placement).toBe("above");
    expect(above.top).toBe(700 - 8 - 360);
    const edge = L.panelPosition({ left: 1180, top: 100 }, { width: 340, height: 360 }, vp());
    expect(edge.left).toBe(1200 - 340 - 8);
    const scrolled = L.panelPosition({ left: 400, top: 2300 }, { width: 340, height: 360 }, vp({ scrollY: 2000 }));
    expect(scrolled.top).toBe(2330);
    // A panel taller than the viewport pins to the top margin rather than going negative.
    const huge = L.panelPosition({ left: 10, top: 10 }, { width: 340, height: 2000 }, vp());
    expect(huge.top).toBe(8);
  });
});

describe("where the button may appear", () => {
  test("built-in denylist: banks, payments, identity, password managers", () => {
    for (const u of [
      "https://www.chase.com/personal",
      "https://secure.chase.com/web/auth",
      "https://www.paypal.com/myaccount",
      "https://accounts.google.com/signin",
      "https://login.microsoftonline.com/common",
      "https://vault.bitwarden.com/",
      "https://mybank.example.com/",
      "https://www.firstbank.com/",
      "https://onlinebanking.example.org/",
    ]) {
      expect(L.isDeniedUrl(u).denied).toBe(true);
    }
  });

  test("sign-in, checkout and payment paths on any site", () => {
    for (const u of ["https://shop.example.com/checkout", "https://example.com/login?next=/", "https://example.com/account/reset-password", "https://example.com/oauth/authorize", "https://example.com/payment/"]) {
      expect(L.isDeniedUrl(u).denied).toBe(true);
    }
  });

  test("ordinary pages are allowed; words like 'bankruptcy' don't trip it", () => {
    for (const u of ["https://en.wikipedia.org/wiki/Bankruptcy", "https://news.ycombinator.com/item?id=1", "https://developer.mozilla.org/en-US/docs/Web", "https://example.com/blog/how-to-login-faster-isnt-a-path"]) {
      expect(L.isDeniedUrl(u).denied).toBe(false);
    }
    expect(L.isDeniedUrl("chrome://settings").denied).toBe(true);
    expect(L.isDeniedUrl("file:///C:/x.html").denied).toBe(true);
  });

  test("the user's never list includes subdomains", () => {
    expect(L.isDeniedUrl("https://docs.example.com/a", ["example.com"]).denied).toBe(true);
    expect(L.isDeniedUrl("https://notexample.com/a", ["example.com"]).denied).toBe(false);
  });

  test("off by default; per-site and all-sites modes", () => {
    expect(L.buttonEnabledFor(undefined, "https://example.com/")).toBe(false);
    const sites = { selectionButton: "sites", sites: ["example.com"] };
    expect(L.buttonEnabledFor(sites, "https://blog.example.com/post")).toBe(true);
    expect(L.buttonEnabledFor(sites, "https://other.org/")).toBe(false);
    const all = { selectionButton: "all", never: ["other.org"] };
    expect(L.buttonEnabledFor(all, "https://anything.dev/")).toBe(true);
    expect(L.buttonEnabledFor(all, "https://other.org/")).toBe(false);
    expect(L.buttonEnabledFor(all, "https://www.paypal.com/")).toBe(false);
  });

  test("password and sensitive fields", () => {
    expect(L.isSensitiveField({ tag: "INPUT", type: "password" })).toBe(true);
    expect(L.isSensitiveField({ tag: "INPUT", type: "text", autocomplete: "one-time-code" })).toBe(true);
    expect(L.isSensitiveField({ tag: "INPUT", type: "text", autocomplete: "cc-number" })).toBe(true);
    expect(L.isSensitiveField({ tag: "DIV", contentEditable: "true", attrs: { "data-sensitive": "" } })).toBe(true);
    expect(L.isSensitiveField({ tag: "SPAN", ancestors: [{ tag: "DIV", contentEditable: "true", attrs: { "aria-label": "Enter your PIN" } }] })).toBe(true);
    expect(L.isSensitiveField({ tag: "P", ancestors: [{ tag: "SECTION", attrs: { "data-lens-ignore": "true" } }] })).toBe(true);
    expect(L.isSensitiveField({ tag: "P", ancestors: [{ tag: "ARTICLE" }] })).toBe(false);
    expect(L.isSensitiveField({ tag: "DIV", contentEditable: "true", attrs: { "aria-label": "Message body" } })).toBe(false);
    expect(L.isSensitiveField({ tag: "DIV", attrs: { "data-sensitive": "false" } })).toBe(false);
    expect(L.isSensitiveField(null)).toBe(false);
  });

  test("a visible password field anywhere turns the page off", () => {
    expect(L.pageHasVisiblePassword([{ type: "password", visible: true }])).toBe(true);
    expect(L.pageHasVisiblePassword([{ type: "password", visible: false }, { type: "text", visible: true }])).toBe(false);
    expect(L.pageHasVisiblePassword([])).toBe(false);
  });

  test("selection length limits", () => {
    expect(L.selectionTextOk("a")).toBe(false);
    expect(L.selectionTextOk("   \n ")).toBe(false);
    expect(L.selectionTextOk("ok")).toBe(true);
    expect(L.selectionTextOk("x".repeat(50_001))).toBe(false);
  });
});

describe("settings", () => {
  test("sanitizing normalises hosts and drops junk", () => {
    const s = L.sanitizeSettings({ selectionButton: "everywhere", sites: ["https://WWW.Example.com/a", "example.com", "not a host", 5], never: ["bank.test"], defaultAction: "rm", extra: 1 });
    expect(s).toEqual({ selectionButton: "off", sites: ["example.com"], never: ["bank.test"], defaultAction: "summarize" });
  });

  test("match patterns and permissions follow the mode", () => {
    expect(L.contentScriptMatches({ selectionButton: "off" }).matches).toEqual([]);
    expect(L.contentScriptMatches({ selectionButton: "all", never: ["x.com"] })).toEqual({
      matches: ["https://*/*", "http://*/*"],
      excludeMatches: ["https://x.com/*", "http://x.com/*", "https://*.x.com/*", "http://*.x.com/*"],
    });
    expect(L.originsFor({ selectionButton: "sites", sites: ["a.com"] })).toEqual(["https://a.com/*", "http://a.com/*", "https://*.a.com/*", "http://*.a.com/*"]);
    expect(L.normalizeHost("localhost")).toBe("localhost");
    expect(L.normalizeHost("javascript:alert(1)")).toBe(null);
  });

  test("background registers exactly the files the packager checks", () => {
    const bg = readFileSync(join(import.meta.dir, "../../extensions/browser/src/background.js"), "utf8");
    const list = bg.match(/js: \[([^\]]+)\]/)![1].split(",").map((s) => s.trim().replace(/"/g, ""));
    expect(list).toEqual(CONTENT_SCRIPT_FILES);
  });
});

describe("dashboard helpers", () => {
  test("modes and context scoping", async () => {
    (globalThis as any).document ??= undefined;
    // @ts-ignore
    await import("../../extensions/browser/src/ui/dashboard.js");
    const D: any = (globalThis as any).LensDash;
    expect(D.TILES.map((t: any) => t.action)).toEqual(L.TILE_ACTIONS);
    expect(D.modesFor({ selection: "x", url: "https://a.com" }).map((m: any) => m[0])).toEqual(["selection", "page", "none"]);
    expect(D.modesFor({}).map((m: any) => m[0])).toEqual(["none"]);
    expect(D.scoped({ selection: "s", pageText: "p", title: "t", url: "u" }, "selection")).toEqual({ title: "t", url: "u", selection: "s" });
    expect(D.scoped({ selection: "s", pageText: "p", title: "t", url: "u" }, "page")).toEqual({ title: "t", url: "u", pageText: "p" });
    expect(D.scoped({ selection: "s" }, "none")).toEqual({});
    expect(D.chipsFor({ selection: "abc", title: "T", url: "https://www.x.com/a" }, "selection")).toEqual(["Selection · 3 chars", "T", "x.com"]);
    // The shared CSS never reaches outside its root (everything is scoped under .lens-root / .l-*).
    const selectors = D.CSS.replace(/@[^{]+\{/g, "").match(/(^|\})\s*([^{}@]+)\{/g) || [];
    for (const s of selectors) {
      const sel = s.replace(/[{}]/g, "").trim();
      if (!sel || /^(from|to|\d+%)$/.test(sel)) continue;
      for (const part of sel.split(",")) expect(part.trim()).toMatch(/^(\.lens-root|\.l-|:where\(\.lens-root\))/);
    }
  });
});
