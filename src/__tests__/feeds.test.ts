import { describe, expect, test } from "bun:test";
import { ago, bySourceChips, charCount, composeLimit, count, deckColumns, lanes, newSince, parseVoice, shelfPayload, sourceMeta, statusLine } from "../feeds/model";
import { NOW, SAMPLE_INBOX, SAMPLE_ITEMS, SAMPLE_SOURCES, SAMPLE_TIMELINE } from "../feeds/sample";
import { capability, filterInbox, pillLabel, totals } from "../messages/model";

describe("feeds model", () => {
  test("relative time and counts", () => {
    expect(ago(NOW - 10_000, NOW)).toBe("now");
    expect(ago(NOW - 5 * 60_000, NOW)).toBe("5m");
    expect(ago(NOW - 3 * 3_600_000, NOW)).toBe("3h");
    expect(ago(NOW - 2 * 86_400_000, NOW)).toBe("2d");
    expect(count(null)).toBe("");
    expect(count(0)).toBe("");
    expect(count(999)).toBe("999");
    expect(count(1200)).toBe("1.2k");
    expect(count(2000)).toBe("2k");
    expect(count(34_400)).toBe("34k");
    expect(count(1_100_000)).toBe("1.1M");
  });

  test("source chips keep cross-posts visible via their other network", () => {
    const off = new Set(["bluesky"]);
    const kept = bySourceChips(SAMPLE_ITEMS, off);
    expect(kept.some((i) => i.key === "bluesky:1")).toBe(true); // also on mastodon
    expect(kept.some((i) => i.key === "bluesky:7")).toBe(false);
    expect(bySourceChips(SAMPLE_ITEMS, new Set())).toHaveLength(SAMPLE_ITEMS.length);
  });

  test("new since last seen", () => {
    expect(newSince(SAMPLE_ITEMS, NOW - 30 * 60_000)).toBe(3);
    expect(newSince(SAMPLE_ITEMS, NOW)).toBe(0);
  });

  test("deck lanes per source; cross-posts in each", () => {
    const cols = deckColumns(SAMPLE_SOURCES);
    expect(cols).toHaveLength(6);
    const l = lanes(SAMPLE_ITEMS, cols);
    expect(l.get("bluesky:pip.example")!.map((i) => i.key)).toEqual(["bluesky:1", "bluesky:7"]);
    expect(l.get("mastodon:toot.example")!.map((i) => i.key)).toEqual(["bluesky:1", "mastodon:3"]);
    expect(l.get("github:octo-fern")!).toHaveLength(2);
    expect(deckColumns(SAMPLE_SOURCES, 2)).toHaveLength(2);
    expect(deckColumns(SAMPLE_SOURCES.map((s) => ({ ...s, enabled: false })))).toHaveLength(0);
  });

  test("compose limits use the strictest target", () => {
    const kinds = { a: "bluesky", b: "mastodon" };
    expect(composeLimit(["a", "b"], kinds)).toBe(300);
    expect(composeLimit(["b"], kinds)).toBe(500);
    expect(composeLimit([], kinds)).toBe(500);
    expect(charCount("héllo 🌿")).toBe(7);
  });

  test("only Bluesky and Mastodon can post; X is read-only", () => {
    expect(sourceMeta("bluesky").canPost).toBe(true);
    expect(sourceMeta("mastodon").canPost).toBe(true);
    expect(sourceMeta("x").canPost).toBe(false);
    expect(sourceMeta("reddit").canPost).toBe(false);
    expect(sourceMeta("unknown").label).toBe("unknown");
  });

  test("shelf payload is small and labelled", () => {
    const p = shelfPayload(SAMPLE_ITEMS[1]);
    expect(p.title).toBe("Garden tool library gets the green light");
    expect(p.note).toBe("RSS · The Daily Teapot");
    expect(shelfPayload({ ...SAMPLE_ITEMS[0], text: "x".repeat(400) }).title.length).toBe(120);
  });

  test("status line", () => {
    expect(statusLine(SAMPLE_TIMELINE)).toBe("1 source needs attention · 3 muted");
    expect(statusLine({ ...SAMPLE_TIMELINE, quiet: true, hiddenByMutes: 0, sources: [] })).toBe("Quiet hours — refresh paused");
    expect(statusLine(null)).toBe("");
  });
});

describe("voice intents", () => {
  test("feeds", () => {
    expect(parseVoice("open my feeds")).toEqual({ do: "open-feeds", filter: "all" });
    expect(parseVoice("Show dev feed")).toEqual({ do: "open-feeds", filter: "dev" });
    expect(parseVoice("show videos timeline")).toEqual({ do: "open-feeds", filter: "video" });
    expect(parseVoice("refresh feeds")).toEqual({ do: "refresh" });
    expect(parseVoice("catch me up")).toEqual({ do: "digest", hours: 12 });
    expect(parseVoice("summarize my feeds from the last 4 hours")).toEqual({ do: "digest", hours: 4 });
    expect(parseVoice("catch me up on the news")).toEqual({ do: "digest", hours: 12 });
  });
  test("compose only opens the composer", () => {
    expect(parseVoice("new post")).toEqual({ do: "compose" });
    expect(parseVoice("draft a post saying hi")).toEqual({ do: "compose" });
  });
  test("messages", () => {
    expect(parseVoice("open messages")).toEqual({ do: "open-messages" });
    expect(parseVoice("catch me up on allotment committee")).toEqual({ do: "catch-up", channel: "allotment committee" });
    expect(parseVoice("snooze messages for 2 hours")).toEqual({ do: "focus", mode: "snooze", minutes: 120 });
    expect(parseVoice("mute notifications 30 min")).toEqual({ do: "focus", mode: "snooze", minutes: 30 });
    expect(parseVoice("VIP only")).toEqual({ do: "focus", mode: "vip" });
    expect(parseVoice("end focus")).toEqual({ do: "focus", mode: "all" });
    expect(parseVoice("what's the weather")).toBeNull();
    expect(parseVoice("")).toBeNull();
  });
});

describe("messages model", () => {
  test("inbox filters", () => {
    expect(filterInbox(SAMPLE_INBOX, "all")).toHaveLength(8);
    expect(filterInbox(SAMPLE_INBOX, "unread").every((c) => c.unread > 0)).toBe(true);
    expect(filterInbox(SAMPLE_INBOX, "mentions").map((c) => c.id)).toEqual(["matrix:!garden", "space:slack"]);
    expect(filterInbox(SAMPLE_INBOX, "vip").map((c) => c.id)).toEqual(["matrix:!garden"]);
    expect(filterInbox(SAMPLE_INBOX, "all", "picnic").map((c) => c.id)).toEqual(["space:telegram"]);
  });
  test("totals and pill", () => {
    expect(totals(SAMPLE_INBOX)).toEqual({ unread: 28, mentions: 3 });
    expect(pillLabel(null)).toBeNull();
    expect(pillLabel({ total: 0, mentions: 0, label: "", focus: "all" })).toBeNull();
    expect(pillLabel({ total: 7, mentions: 1, label: "7", focus: "all" })).toBe("7");
    expect(pillLabel({ total: 140, mentions: 0, label: "99+", focus: "vip" })).toBe("99+");
    expect(pillLabel({ total: 3, mentions: 0, label: "3", focus: "snoozed" })).toBe("Snoozed");
  });
  test("capability is honest per source", () => {
    expect(capability(SAMPLE_INBOX[0])).toMatch(/Matrix/);
    expect(capability(SAMPLE_INBOX[1])).toMatch(/badge only/);
    expect(capability({ ...SAMPLE_INBOX[1], source: "toast:signal" })).toMatch(/notifications/);
  });
});
