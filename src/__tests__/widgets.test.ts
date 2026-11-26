// Dashboard widgets (docs/plans/MAGIC_WAVES.md, wave M2): the safe Adaptive Card subset, the feed
// reader, the gallery's addresses and settings checks, "Ask about this" and the X lane's handle.
// Fetch rules (https only, approved hosts, no local network, size/time limits, cache) are Rust's
// and tested in src-tauri/src/magic_waves/tests.rs.
import { describe, expect, test } from "bun:test";
import { parseFeed, validateCard } from "../widgets/format";
import { GALLERY, galleryDef, initialParams, weatherWords } from "../widgets/gallery";
import { askText } from "../dashboard/ask";
import { cleanHandle, embedUrl } from "../widgets/XLane";
import { LANES, visibleLanes } from "../dashboard/store";

describe("Adaptive Card subset", () => {
  test("keeps the supported elements and drops the rest", () => {
    const c = validateCard(
      [
        { type: "TextBlock", text: "Hello", size: "large", weight: "bolder" },
        { type: "Input.Text", id: "x" },
        { type: "FactSet", facts: [{ title: "A", value: "1" }] },
        { type: "Media", sources: [] },
      ],
      [],
    );
    expect(c.body.map((e) => e.type)).toEqual(["TextBlock", "FactSet"]);
    // Still a card (it has content), with a plain note for each part left out.
    expect(c.ok).toBe(true);
    expect(c.errors).toHaveLength(2);
  });

  test("accepts a whole card ({ body }) as well as a bare body", () => {
    expect(validateCard({ type: "AdaptiveCard", body: [{ type: "TextBlock", text: "x" }] }, []).body).toHaveLength(1);
  });

  test("images only from approved hosts, links only over https", () => {
    const c = validateCard(
      [
        { type: "Image", url: "https://img.example.com/a.png" },
        { type: "Image", url: "https://evil.example.net/a.png" },
        { type: "Image", url: "http://img.example.com/a.png" },
        {
          type: "ActionSet",
          actions: [
            { type: "Action.OpenUrl", title: "Good", url: "https://example.com" },
            { type: "Action.OpenUrl", title: "Plain", url: "http://example.com" },
            { type: "Action.OpenUrl", title: "Script", url: "javascript:alert(1)" },
            { type: "Action.Submit", title: "Submit" },
          ],
        },
      ],
      ["img.example.com"],
    );
    const imgs = c.body.filter((e) => e.type === "Image");
    expect(imgs).toHaveLength(1);
    const set = c.body.find((e) => e.type === "ActionSet") as Extract<(typeof c.body)[number], { type: "ActionSet" }>;
    expect(set.actions.map((a) => a.url)).toEqual(["https://example.com/"]);
  });

  test("limits text length, depth and element count", () => {
    const long = validateCard([{ type: "TextBlock", text: "x".repeat(5000) }], []);
    expect((long.body[0] as { text: string }).text.length).toBeLessThanOrEqual(600);
    let deep: unknown = { type: "TextBlock", text: "bottom" };
    for (let i = 0; i < 12; i++) deep = { type: "Container", items: [deep] };
    const flat = JSON.stringify(validateCard([deep], []).body);
    expect(flat.includes("bottom")).toBe(false);
    const many = validateCard(Array.from({ length: 500 }, () => ({ type: "TextBlock", text: "a" })), []);
    expect(many.body.length).toBeLessThanOrEqual(80);
  });

  test("junk never throws", () => {
    for (const junk of [null, undefined, 3, "x", {}, [null], [{ type: 5 }], { body: "no" }]) expect(() => validateCard(junk, [])).not.toThrow();
  });
});

describe("Feed reader", () => {
  test("reads RSS and Atom, strips markup and keeps https links only", () => {
    const rss = `<rss><channel><item><title><![CDATA[First &amp; <b>best</b>]]></title><link>https://a.example/1</link></item><item><title>Second</title><link>http://a.example/2</link></item></channel></rss>`;
    const items = parseFeed(rss);
    expect(items[0].title).toBe("First & best");
    expect(items[0].url).toBe("https://a.example/1");
    expect(items[1].url).toBeFalsy();
    const atom = `<feed><entry><title>Atom one</title><link href="https://b.example/x"/></entry></feed>`;
    expect(parseFeed(atom)).toEqual([expect.objectContaining({ title: "Atom one", url: "https://b.example/x" })]);
  });

  test("caps the number of entries and survives junk", () => {
    const many = `<rss>${Array.from({ length: 30 }, (_, i) => `<item><title>T${i}</title></item>`).join("")}</rss>`;
    expect(parseFeed(many)).toHaveLength(8);
    expect(parseFeed("not xml at all")).toEqual([]);
  });
});

describe("Widget gallery", () => {
  test("every widget fetches only https addresses on the hosts it declares", () => {
    const samples: Record<string, Record<string, string>> = {
      weather: { lat: "33.45", lon: "-112.07", units: "c" },
      rss: { url: "https://example.com/feed.xml" },
      "github-release": { repo: "orionopenwow/LensUI" },
      crypto: { ids: "bitcoin", currency: "usd" },
    };
    for (const def of GALLERY) {
      const p = { ...initialParams(def), ...(samples[def.id] ?? {}) };
      const url = def.url(p);
      if (def.local) {
        expect(url).toBeNull();
        expect(def.hosts(p)).toEqual([]);
        continue;
      }
      expect(def.check?.(p) ?? null).toBeNull();
      expect(url).not.toBeNull();
      const u = new URL(url!);
      expect(u.protocol).toBe("https:");
      expect(def.hosts(p)).toContain(u.hostname);
    }
  });

  test("settings checks catch incomplete or unsafe settings", () => {
    expect(galleryDef("weather")!.check!({ lat: "200", lon: "0" })).not.toBeNull();
    expect(galleryDef("rss")!.check!({ url: "http://example.com/feed" })).not.toBeNull();
    expect(galleryDef("rss")!.url({ url: "http://example.com/feed" })).toBeNull();
    expect(galleryDef("github-release")!.check!({ repo: "../../etc" })).not.toBeNull();
    expect(galleryDef("crypto")!.check!({ ids: " " })).not.toBeNull();
  });

  test("cards come out of fetched data and survive bad data", () => {
    const now = new Date("2026-11-26T12:00:00Z");
    const weather = galleryDef("weather")!;
    const body = JSON.stringify({ current: { temperature_2m: 21.4, weather_code: 2, wind_speed_10m: 9 }, daily: { temperature_2m_max: [26], temperature_2m_min: [14] } });
    const card = validateCard(weather.toCard(body, { place: "Sample", units: "c" }, { now }), []);
    expect(JSON.stringify(card.body)).toContain("21°C");
    expect(card.ok).toBe(true);
    for (const def of GALLERY) {
      expect(() => validateCard(def.toCard("{garbage", initialParams(def), { now, telemetry: null }), [])).not.toThrow();
    }
    const clocks = validateCard(galleryDef("clocks")!.toCard("", { zones: "UTC,Not/AZone" }, { now }), []);
    expect(JSON.stringify(clocks.body)).toContain("Unknown time zone");
    const sys = validateCard(galleryDef("system")!.toCard("", {}, { now, telemetry: { cpuUsage: 14, memPercent: 29, memUsedGb: 9.2, memTotalGb: 32, uptimeMinutes: 125 } }), []);
    expect(JSON.stringify(sys.body)).toContain("2 h 5 min");
  });

  test("weather codes read as plain words", () => {
    expect(weatherWords(0)).toMatch(/clear/i);
    expect(weatherWords(95)).toMatch(/thunder/i);
    expect(typeof weatherWords(12345)).toBe("string");
  });
});

describe("Ask about this", () => {
  test("hands over only the card's own words, clipped", () => {
    const t = askText({ title: "Sample: Design review", detail: "In 45 min", source: "Calendar" });
    expect(t).toContain("Sample: Design review");
    expect(t).toContain("In 45 min");
    expect(t).toContain("Calendar");
    expect(askText({ title: "x".repeat(5000), source: "Feeds" }).length).toBeLessThanOrEqual(1200);
  });
});

describe("X lane", () => {
  test("accepts only real handles and builds the official embed address", () => {
    expect(cleanHandle("@lens_ui")).toBe("lens_ui");
    expect(cleanHandle("a/b")).toBeNull();
    expect(cleanHandle("much_too_long_handle_here")).toBeNull();
    expect(embedUrl("lens_ui")).toBe("https://syndication.twitter.com/srv/timeline-profile/screen-name/lens_ui?dnt=true");
  });

  test("the X and Widgets lanes show only with the widgets flag", () => {
    expect(LANES.some((l) => l.id === "x")).toBe(true);
    expect(visibleLanes("board", { widgets: false }).map((l) => l.id)).not.toContain("x");
    expect(visibleLanes("board", { widgets: true }).map((l) => l.id)).toEqual(expect.arrayContaining(["widgets", "x"]));
  });
});
