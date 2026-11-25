// Lens Browser sidebar: tab sections, the Lens row's plans (nothing changes before Apply), and
// sidebar preferences. Pure logic from src/browser/tabAi.ts.
import { describe, expect, test } from "bun:test";
import { DEFAULT_SIDEBAR, SIDEBAR_WIDTH, type BrowserState, type Tab } from "../browser/api";
import { dropIndex, sidebarModel } from "../browser/model";
import {
  applyProposal, DAY_MS, duplicateTabs, pageKey, propose, sidebarPrefs, siteGroups, startOfDay, summarisePrompt, tabSections, tidyPreview, type TabActionDeps,
} from "../browser/tabAi";

const NOW = new Date(2026, 10, 24, 15, 0, 0).getTime();
const tab = (id: string, o: Partial<Tab> = {}): Tab => ({
  id, spaceId: "s1", folderId: null, url: `https://${id}.test/`, title: id.toUpperCase(), favicon: null, pinned: false, muted: false,
  audible: false, life: "live", lastActiveMs: NOW, order: 0, zoom: 1, scrollY: 0, badge: null, ...o,
});
const state = (tabs: Tab[], o: Partial<BrowserState> = {}): BrowserState => ({
  version: 1,
  spaces: [{ id: "s1", name: "Work", profile: "space-s1" }],
  folders: [{ id: "f1", spaceId: "s1", name: "Errands", collapsed: true }],
  tabs,
  activeSpace: "s1",
  activeTab: "a",
  bookmarks: [],
  settings: { sleepAfterMin: 15, maxLiveTabs: 6, searchUrl: "https://duckduckgo.com/?q={q}", blockTrackers: true, lensContextMenu: true, defaultZoom: 1 },
  nextId: 10,
  ...o,
});

/** Deps that record every call, so a test can prove nothing was changed. */
function spyDeps() {
  const calls: string[] = [];
  const deps: TabActionDeps = {
    tidy: async () => calls.push("tidy"),
    closeTab: async (id) => calls.push(`close:${id}`),
    addFolder: async (name) => (calls.push(`folder:${name}`), `new-${name}`),
    moveToFolder: async (id, f) => calls.push(`move:${id}->${f}`),
  };
  return { calls, deps };
}

describe("tab sections", () => {
  const today = startOfDay(NOW);
  const tabs = [
    tab("a", { order: 0, lastActiveMs: today + 1000 }),
    tab("b", { order: 1, lastActiveMs: today - 1000 }),
    tab("c", { order: 2, lastActiveMs: today + 5000 }),
  ];
  test("by time: Today and Earlier, keeping the manual order inside each", () => {
    const s = tabSections(tabs, "time", NOW);
    expect(s.map((x) => [x.label, x.tabs.map((t) => t.id)])).toEqual([["Today", ["a", "c"]], ["Earlier", ["b"]]]);
  });
  test("by time with everything from today is one unlabelled list", () => {
    expect(tabSections(tabs.filter((t) => t.id !== "b"), "time", NOW)).toEqual([{ id: "all", label: null, tabs: [tabs[0], tabs[2]] }]);
  });
  test("by site: sites with two or more tabs get a label, singles go under Other", () => {
    const s = tabSections([tab("x", { url: "https://news.test/1", order: 0 }), tab("y", { url: "https://www.news.test/2", order: 1 }), tab("z", { order: 2 })], "site", NOW);
    expect(s.map((x) => [x.label, x.tabs.map((t) => t.id)])).toEqual([["news.test", ["x", "y"]], ["Other", ["z"]]]);
  });
  test("off: one list in tab order", () => {
    expect(tabSections([tab("q", { order: 3 }), tab("p", { order: 1 })], "none", NOW)[0].tabs.map((t) => t.id)).toEqual(["p", "q"]);
  });
});

describe("reorder and folder drop (the sidebar's drag targets)", () => {
  const s = state([tab("a", { order: 0 }), tab("b", { order: 1 }), tab("c", { order: 2, folderId: "f1" })]);
  test("dropping before a tab lands at its index; on the list end lands last", () => {
    expect(dropIndex(s, "b", null)).toEqual({ index: 1, folder: null });
    expect(dropIndex(s, null, null)).toEqual({ index: 3, folder: null });
  });
  test("dropping on a folder files the tab into it", () => {
    expect(dropIndex(s, null, "f1")).toEqual({ index: 3, folder: "f1" });
  });
  test("folders stay out of the loose list, collapsed or not", () => {
    const m = sidebarModel(s);
    expect(m.loose.map((t) => t.id)).toEqual(["a", "b"]);
    expect(m.folders[0].tabs.map((t) => t.id)).toEqual(["c"]);
  });
});

describe("Lens row plans", () => {
  const dupes = state([
    tab("a", { url: "https://dup.test/page", lastActiveMs: NOW }),
    tab("b", { url: "https://dup.test/page/", lastActiveMs: NOW - 10 }),
    tab("c", { url: "https://dup.test/page#x", lastActiveMs: NOW - 20, pinned: true }),
    tab("d", { url: "https://dup.test/page", lastActiveMs: NOW - 30, busy: true }),
    tab("e", { url: "https://old.test/", lastActiveMs: NOW - 2 * DAY_MS }),
  ]);
  test("duplicates: same page ignoring # and trailing /; never pinned, busy or active", () => {
    expect(pageKey("https://x.test/a/#h")).toBe("https://x.test/a");
    expect(duplicateTabs(dupes).map((t) => t.id)).toEqual(["b"]);
  });
  test("tidy preview mirrors the backend: closes duplicates and archives tabs unused for a day", () => {
    const p = tidyPreview(dupes, NOW);
    expect(p.close.map((t) => t.id)).toEqual(["b"]);
    expect(p.archive.map((t) => t.id)).toEqual(["e"]);
  });
  test("group by site: loose, unpinned tabs on a site with two or more", () => {
    const s = state([tab("a", { url: "https://a.test/1" }), tab("b", { url: "https://a.test/2" }), tab("c", { url: "https://a.test/3", folderId: "f1" }), tab("d")]);
    expect(siteGroups(s).map((g) => [g.host, g.tabs.map((t) => t.id)])).toEqual([["a.test", ["a", "b"]]]);
  });
  test("nothing to do gives no plan", () => {
    const clean = state([tab("a"), tab("b")]);
    expect(propose("duplicates", clean, NOW)).toBeNull();
    expect(propose("tidy", clean, NOW)).toBeNull();
    expect(propose("group-site", clean, NOW)).toBeNull();
  });
  test("a plan lists every change before anything happens", () => {
    const p = propose("tidy", dupes, NOW)!;
    expect(p.title).toBe("Close 1 duplicate, archive 1 old tab");
    expect(p.lines.map((l) => [l.id, l.detail])).toEqual([["b", "close"], ["e", "archive"]]);
  });
  test("summarise sends titles and hosts only", () => {
    const text = summarisePrompt(state([tab("a", { title: "Inbox", url: "https://mail.test/secret?token=1" })]));
    expect(text).toContain("Inbox (mail.test)");
    expect(text).not.toContain("token");
  });
});

describe("nothing changes without confirmation", () => {
  const s = state([tab("a", { url: "https://x.test/" }), tab("b", { url: "https://x.test" }), tab("c", { url: "https://y.test/1" }), tab("d", { url: "https://y.test/2" })]);
  for (const kind of ["tidy", "duplicates", "group-site"] as const) {
    test(`${kind}: proposing calls nothing; applying unconfirmed calls nothing`, async () => {
      const { calls, deps } = spyDeps();
      const p = propose(kind, s, NOW);
      expect(p).not.toBeNull();
      expect(calls).toEqual([]);
      expect(await applyProposal(p!, false, deps)).toBe(false);
      expect(calls).toEqual([]);
    });
  }
  test("confirmed: duplicates close exactly the listed tabs", async () => {
    const { calls, deps } = spyDeps();
    await applyProposal(propose("duplicates", s, NOW)!, true, deps);
    expect(calls).toEqual(["close:b"]);
  });
  test("confirmed: group by site makes one folder per site and files its tabs", async () => {
    const { calls, deps } = spyDeps();
    await applyProposal(propose("group-site", s, NOW)!, true, deps);
    expect(calls).toEqual(["folder:x.test", "move:a->new-x.test", "move:b->new-x.test", "folder:y.test", "move:c->new-y.test", "move:d->new-y.test"]);
  });
  test("confirmed: tidy runs the backend's tidy once", async () => {
    const { calls, deps } = spyDeps();
    await applyProposal(propose("tidy", s, NOW)!, true, deps);
    expect(calls).toEqual(["tidy"]);
  });
});

describe("sidebar preferences", () => {
  test("missing preferences (older settings) give the defaults", () => {
    expect(sidebarPrefs(undefined, DEFAULT_SIDEBAR, SIDEBAR_WIDTH)).toEqual(DEFAULT_SIDEBAR);
  });
  test("out-of-range and unknown values are repaired", () => {
    const p = sidebarPrefs({ width: 9000, mode: "tiles" as never, side: "middle" as never, group: "colour" as never, showChats: false }, DEFAULT_SIDEBAR, SIDEBAR_WIDTH);
    expect(p).toEqual({ ...DEFAULT_SIDEBAR, width: SIDEBAR_WIDTH.max, showChats: false });
    expect(sidebarPrefs({ width: 10 }, DEFAULT_SIDEBAR, SIDEBAR_WIDTH).width).toBe(SIDEBAR_WIDTH.min);
  });
});
