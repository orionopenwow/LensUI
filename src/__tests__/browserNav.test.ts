import { describe, expect, test } from "bun:test";
import type { BrowserState, Tab } from "../browser/api";
import { cycleTab, errorInfo, fileName, groupByDay, matchScore, navFromStatus, suggestions, tabAt, topSites, zoomStep } from "../browser/nav";

const tab = (id: string, url: string, title: string, o: Partial<Tab> = {}): Tab => ({
  id, spaceId: "s1", url, title, pinned: false, muted: false, audible: false, life: "live", lastActiveMs: 0, order: 0, zoom: 1, scrollY: 0, ...o,
});
const state = (tabs: Tab[], activeTab: string | null): BrowserState => ({
  version: 1, spaces: [{ id: "s1", name: "A", profile: "p" }], folders: [], tabs, activeSpace: "s1", activeTab, bookmarks: [],
  settings: { sleepAfterMin: 15, maxLiveTabs: 6, searchUrl: "https://d.test/?q={q}", blockTrackers: true, lensContextMenu: true, defaultZoom: 1 }, nextId: 9,
});

describe("toolbar state", () => {
  test("no status means nothing is enabled", () => {
    expect(navFromStatus(null)).toEqual({ canBack: false, canForward: false, loading: false, error: "", hasVideo: false });
  });
  test("loading until the document is complete", () => {
    expect(navFromStatus({ ready: "loading" }).loading).toBe(true);
    expect(navFromStatus({ ready: "interactive", canBack: true }).canBack).toBe(true);
    expect(navFromStatus({ ready: "complete" }).loading).toBe(false);
  });
  test("an error page is not 'loading'", () => {
    const n = navFromStatus({ ready: "loading", error: " ERR_NAME_NOT_RESOLVED " });
    expect(n.loading).toBe(false);
    expect(n.error).toBe("ERR_NAME_NOT_RESOLVED");
  });
});

describe("error pages", () => {
  test("each family gets its own words", () => {
    expect(errorInfo("ERR_INTERNET_DISCONNECTED", "https://a.test").kind).toBe("offline");
    expect(errorInfo("ERR_NAME_NOT_RESOLVED", "https://a.test").kind).toBe("dns");
    expect(errorInfo("ERR_CONNECTION_REFUSED", "https://a.test").kind).toBe("refused");
    expect(errorInfo("ERR_TIMED_OUT", "https://a.test").kind).toBe("timeout");
    expect(errorInfo("ERR_BLOCKED_BY_CLIENT", "https://a.test").kind).toBe("blocked");
    expect(errorInfo("ERR_SOMETHING_NEW", "https://a.test").kind).toBe("other");
  });
  test("certificate problems are marked unsafe and name the site", () => {
    const e = errorInfo("ERR_CERT_DATE_INVALID", "https://www.bank.test/login");
    expect(e.unsafe).toBe(true);
    expect(e.body).toContain("bank.test");
  });
  test("being offline wins over the code", () => {
    expect(errorInfo("ERR_NAME_NOT_RESOLVED", "https://a.test", false).kind).toBe("offline");
  });
});

describe("address suggestions", () => {
  const src = {
    tabs: [tab("t1", "https://tables.example/harbor", "Harbor & Vine"), tab("t2", "https://news.test/", "News")],
    bookmarks: [{ id: "b1", url: "https://harborkitchen.example/", title: "Harbour Kitchen", createdMs: 1 }],
    history: [
      { url: "https://tables.example/harbor", title: "Harbor & Vine", lastVisitMs: 1, visits: 3 },
      { url: "https://maps.test/harbor-road", title: "Harbor Road", lastVisitMs: 1, visits: 1 },
    ],
    activeTab: "t2",
  };
  test("first row is what Enter does", () => {
    expect(suggestions("harbor", src)[0]).toMatchObject({ kind: "search", value: "harbor" });
    expect(suggestions("example.com", src)[0]).toMatchObject({ kind: "url", value: "https://example.com" });
  });
  test("an open tab is offered once, as a switch, ahead of history", () => {
    const rows = suggestions("harbor", src);
    expect(rows[1]).toMatchObject({ kind: "tab", value: "t1" });
    expect(rows.filter((r) => r.url === "https://tables.example/harbor").length).toBe(1);
    expect(rows.map((r) => r.kind)).toEqual(["search", "tab", "bookmark", "history"]);
  });
  test("the active tab is never suggested", () => {
    expect(suggestions("news", src).some((r) => r.kind === "tab")).toBe(false);
  });
  test("ask only when the AI helper allows it", () => {
    expect(suggestions("ask what is this", { ...src, ask: true })[0].kind).toBe("ask");
    expect(suggestions("ask what is this", src)[0]).toMatchObject({ kind: "search", value: "ask what is this" });
  });
  test("empty input gives nothing; the limit holds", () => {
    expect(suggestions("  ", src)).toEqual([]);
    expect(suggestions("e", { ...src, limit: 2 }).length).toBe(2);
  });
  test("host prefix beats a title word beats a substring", () => {
    expect(matchScore("tab", "https://www.tables.example/", "x")).toBe(3);
    expect(matchScore("vine", "https://a.test/", "Harbor & Vine")).toBe(2);
    expect(matchScore("arb", "https://a.test/", "Harbor")).toBe(1);
    expect(matchScore("zzz", "https://a.test/", "Harbor")).toBe(0);
  });
});

describe("tabs by keyboard", () => {
  const s = state([tab("a", "https://a.test", "A", { order: 2 }), tab("b", "https://b.test", "B", { order: 1 }), tab("p", "https://p.test", "P", { order: 9, pinned: true }), tab("z", "https://z.test", "Z", { order: 0, archivedMs: 5 })], "b");
  test("order is pinned first, then by position; archived tabs are skipped", () => {
    expect(cycleTab(s, 1)).toBe("a");
    expect(cycleTab(s, -1)).toBe("p");
    expect(cycleTab({ ...s, activeTab: "a" }, 1)).toBe("p");
  });
  test("Ctrl+1 is the first tab, Ctrl+9 the last, the current tab is a no-op", () => {
    expect(tabAt(s, 1)).toBe("p");
    expect(tabAt(s, 2)).toBe(null);
    expect(tabAt(s, 9)).toBe("a");
    expect(tabAt(s, 7)).toBe(null);
  });
  test("one tab has nowhere to cycle", () => {
    expect(cycleTab(state([tab("a", "https://a.test", "A")], "a"), 1)).toBe(null);
  });
});

describe("zoom, history, downloads", () => {
  test("zoom walks the usual browser steps and stops at the ends", () => {
    expect(zoomStep(1, 1)).toBe(1.1);
    expect(zoomStep(1, -1)).toBe(0.9);
    expect(zoomStep(1.2, 1)).toBe(1.25);
    expect(zoomStep(5, 1)).toBe(5);
    expect(zoomStep(0.25, -1)).toBe(0.25);
  });
  test("history groups by day, newest first", () => {
    const now = new Date(2026, 10, 23, 15).getTime();
    const g = groupByDay([
      { url: "https://a.test", title: "A", lastVisitMs: now - 3600_000, visits: 1 },
      { url: "https://b.test", title: "B", lastVisitMs: now - 26 * 3600_000, visits: 1 },
      { url: "https://c.test", title: "C", lastVisitMs: now - 60_000, visits: 1 },
    ], now);
    expect(g.map((x) => x.label)).toEqual(["Today", "Yesterday"]);
    expect(g[0].items.map((x) => x.title)).toEqual(["C", "A"]);
  });
  test("top sites: one per host, the most visited page stands for it", () => {
    const t = topSites([
      { url: "https://www.a.test/x", title: "X", lastVisitMs: 1, visits: 2 },
      { url: "https://a.test/y", title: "Y", lastVisitMs: 1, visits: 5 },
      { url: "https://b.test/", title: "B", lastVisitMs: 1, visits: 6 },
    ]);
    expect(t).toEqual([{ host: "a.test", url: "https://a.test/y", title: "Y", visits: 7 }, { host: "b.test", url: "https://b.test/", title: "B", visits: 6 }]);
  });
  test("file names come from Windows paths and URLs", () => {
    expect(fileName("C:\\Users\\me\\Downloads\\report final.pdf")).toBe("report final.pdf");
    expect(fileName("https://a.test/files/My%20File.zip?token=1")).toBe("My File.zip");
  });
});
