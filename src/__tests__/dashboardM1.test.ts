// Magic Dashboard wave M1: lanes from local data, the context strip, what's remembered, and the
// Command phrases (docs/plans/MAGIC_WAVES.md §4).
import { describe, expect, test, beforeEach } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  feedCards,
  inboxCards,
  loadSnapshot,
  nextEvent,
  nowPlayingCards,
  shelfCards,
  stripItems,
  todayCards,
  dateKeyOf,
  type Readers,
} from "../dashboard/sources";
import { contextStrip, initialState, laneCards, reduce } from "../dashboard/store";
import { clearOpens, MAX_OPENS, readLayout, readOpens, writeLayout, writeOpens } from "../dashboard/memory";
import { dashboardTemplates, isDashboardPhrase, isDashboardStub } from "../dashboard/command";

const NOW = new Date(2026, 10, 25, 14, 0, 0);
const key = dateKeyOf(NOW);

// A tiny localStorage for the memory tests.
class Mem {
  m = new Map<string, string>();
  getItem(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, String(v));
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  clear() {
    this.m.clear();
  }
}
(globalThis as any).localStorage = new Mem();

describe("lanes from local data", () => {
  test("inbox shows only conversations with something unread, newest first", () => {
    const cards = inboxCards([
      { id: "a", app: "Slack", title: "Team", unread: 2, mentions: 1, lastPreview: null, lastTs: 100, url: "" },
      { id: "b", app: "Matrix", title: "Alex", unread: 1, mentions: 0, lastPreview: "Lunch?", lastTs: 200, url: "" },
      { id: "c", app: "Discord", title: "Read", unread: 0, mentions: 0, lastPreview: null, lastTs: 300, url: "" },
    ]);
    expect(cards.map((c) => c.title)).toEqual(["Alex", "Team"]);
    expect(cards[0].detail).toBe("Lunch?");
    expect(cards[1].detail).toBe("2 unread, 1 mention");
    expect(cards.every((c) => c.lane === "inbox" && c.action.kind === "app")).toBe(true);
  });

  test("feed cards link to their posts and fall back to the Feeds app", () => {
    const cards = feedCards([
      { key: "1", source: "Bluesky", author: "Sam", title: null, text: "Hello", url: "https://example.com/1", ts: 10 },
      { key: "2", source: "RSS", author: "", title: "Notes", text: "Body", url: "", ts: 20 },
    ]);
    expect(cards[0].title).toBe("Notes");
    expect(cards[0].action).toEqual({ kind: "app", app: "feeds" });
    expect(cards[1].action).toEqual({ kind: "url", url: "https://example.com/1" });
    expect(cards[1].source).toBe("Sam · Bluesky");
  });

  test("today shows today's open events, earliest first, after sorting the lane", () => {
    const events = [
      { id: "1", dateKey: key, time: "16:30", title: "Later", done: false },
      { id: "2", dateKey: key, time: "09:00", title: "Earlier", done: false },
      { id: "3", dateKey: key, time: "10:00", title: "Done", done: true },
      { id: "4", dateKey: "2026-11-26", time: "09:00", title: "Tomorrow", done: false },
    ];
    const s = reduce(initialState(), { type: "cards", cards: todayCards(events, NOW) });
    expect(laneCards(s, "today").map((c) => c.title)).toEqual(["Earlier", "Later"]);
    expect(nextEvent(events, NOW)?.title).toBe("Later");
  });

  test("shelf: pinned first, then newest", () => {
    const cards = shelfCards([
      { id: "a", title: "Old", text: "", kind: "text", created_ms: 1, pinned: false },
      { id: "b", title: "New", text: "", kind: "text", created_ms: 5, pinned: false },
      { id: "c", title: "Pinned", text: "", kind: "text", created_ms: 0, pinned: true },
    ]);
    const s = reduce(initialState(), { type: "cards", cards });
    expect(laneCards(s, "shelf").map((c) => c.title)).toEqual(["Pinned", "New", "Old"]);
  });

  test("now playing only when something has a session", () => {
    expect(nowPlayingCards(null)).toEqual([]);
    expect(nowPlayingCards({ hasSession: false, isPlaying: false, title: "", artist: "", sourceApp: "" })).toEqual([]);
    const [c] = nowPlayingCards({ hasSession: true, isPlaying: true, title: "Song", artist: "Band", sourceApp: "Spotify" });
    expect(c.detail).toBe("Band · Playing");
    expect(c.action.kind).toBe("media");
  });
});

describe("snapshot", () => {
  const readers = (over: Partial<Readers> = {}): Readers => ({
    inbox: async () => [{ id: "a", app: "Slack", title: "Team", unread: 3, mentions: 0, lastPreview: null, lastTs: 1, url: "" }],
    feeds: async () => [],
    calendar: () => [{ id: "e", dateKey: key, time: "14:30", title: "Review", done: false }],
    shelf: async () => [{ id: "s", title: "Quote", text: "", kind: "text", created_ms: 1, pinned: false }],
    nowPlaying: async () => ({ hasSession: true, isPlaying: true, title: "Song", artist: "", sourceApp: "" }),
    ...over,
  });

  test("reads every source once and builds the strip from what it read", async () => {
    const snap = await loadSnapshot(readers(), NOW);
    expect(snap.unread).toBe(3);
    expect(snap.shelfCount).toBe(1);
    expect(snap.next?.title).toBe("Review");
    const strip = stripItems(contextStrip({ now: NOW, unread: snap.unread, nextEvent: snap.next, shelfCount: snap.shelfCount }), snap);
    expect(strip).toEqual(["Good afternoon", "3 unread", "Review in 30 min", "1 on the Shelf", "Playing Song"]);
  });

  test("a source that answers with nothing counts as empty", async () => {
    const snap = await loadSnapshot(readers({ inbox: async () => null as never, shelf: async () => ({}) as never, nowPlaying: async () => null }), NOW);
    expect(snap.unread).toBe(0);
    expect(snap.shelfCount).toBe(0);
    expect(snap.cards.some((c) => c.lane === "today")).toBe(true);
  });

  test("a failing source leaves only its own lane empty", async () => {
    const snap = await loadSnapshot(
      readers({
        inbox: async () => {
          throw new Error("off");
        },
        calendar: () => {
          throw new Error("bad json");
        },
      }),
      NOW,
    );
    expect(snap.unread).toBe(0);
    expect(snap.cards.some((c) => c.lane === "inbox" || c.lane === "today")).toBe(false);
    expect(snap.cards.some((c) => c.lane === "shelf")).toBe(true);
  });
});

describe("what the Dashboard remembers", () => {
  beforeEach(() => (globalThis as any).localStorage.clear());

  test("layout round-trips and junk falls back to Glance", () => {
    expect(readLayout()).toBe("glance");
    writeLayout("board");
    expect(readLayout()).toBe("board");
    (globalThis as any).localStorage.setItem("lens.dashboard.layout.v1", "nonsense");
    expect(readLayout()).toBe("glance");
  });

  test("open counts are bounded, cleaned and forgettable", () => {
    const many: Record<string, number> = {};
    for (let i = 0; i < MAX_OPENS + 50; i++) many[`c${i}`] = i + 1;
    writeOpens(many);
    expect(Object.keys(readOpens()).length).toBe(MAX_OPENS);
    (globalThis as any).localStorage.setItem("lens.dashboard.opens.v1", JSON.stringify({ a: 2, b: -1, c: "x", d: 1.7 }));
    expect(readOpens()).toEqual({ a: 2, d: 1 });
    clearOpens();
    expect(readOpens()).toEqual({});
    writeOpens({});
    expect((globalThis as any).localStorage.getItem("lens.dashboard.opens.v1")).toBeNull();
  });
});

describe("Command", () => {
  test("only exact Dashboard phrases open it", () => {
    for (const t of ["dashboard", "Dashboard", "open dashboard", "open the dashboard", "show my dashboard", "open the magic dashboard.", "  lens dashboard "]) expect(isDashboardPhrase(t)).toBe(true);
    for (const t of ["dashboard settings", "what is a dashboard", "make a dashboard for sales", "open dashboards", ""]) expect(isDashboardPhrase(t)).toBe(false);
  });

  test("/dashboard is offered only when on, and never over a user's own template", () => {
    expect(dashboardTemplates([], false)).toEqual([]);
    const [t] = dashboardTemplates([], true);
    expect(t.id).toBe("dashboard");
    expect(isDashboardStub(t)).toBe(true);
    expect(isDashboardStub({ id: "dashboard" })).toBe(false);
    expect(dashboardTemplates([{ id: "dashboard" }], true)).toEqual([]);
  });
});

describe("privacy", () => {
  test("the Dashboard's code makes no network requests", () => {
    for (const f of ["sources.ts", "DashboardWindow.tsx", "DashboardSurface.tsx", "memory.ts", "command.ts", "store.ts"]) {
      const t = readFileSync(join(import.meta.dir, "../dashboard", f), "utf8");
      expect(t).not.toMatch(/\bfetch\(|XMLHttpRequest|WebSocket|feeds_refresh|messages_matrix_sync/);
    }
  });
});
