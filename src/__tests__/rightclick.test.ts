// W7-E: the right-click action catalogue, micro-saves, context packs and YouTube transcripts.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  CATALOG, DEFAULT_PREFS, MAX_TOP, addCustom, appliesTo, expandPrompt, exportPrefs, fileTypeOf, importPrefs, menuFor,
  move, orderedActions, recordUse, removeCustom, toggleHidden, togglePin, validateCustom, type MenuPrefs,
} from "../context/actions";
import { activePackChip, autoTrim, budgetLevel, claudeRequest, formatTokens, meterPercent, planTrim, trimmedTotal } from "../context/packs";
import { microToastText, withNote } from "../context/microToast";
import * as yt from "../../extensions/browser/src/youtube.js";
import { microItem, microToast } from "../../extensions/browser/src/micro.js";
import { menuItems, findItem, toCreateProps, YOUTUBE_PATTERNS } from "../../extensions/browser/src/menus.js";
import { buildManifest, checkManifest, catalogModule, NETWORK_EXCEPTIONS, TARGETS } from "../../extensions/browser/build.mjs";

const root = join(import.meta.dir, "../..");
const fx = (f: string) => readFileSync(join(import.meta.dir, "fixtures/youtube", f), "utf8");
const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

describe("action catalogue", () => {
  test("is well formed", () => {
    const seen = new Set<string>();
    for (const a of CATALOG.actions) {
      expect(seen.has(a.id)).toBe(false);
      seen.add(a.id);
      expect(a.label.length).toBeGreaterThan(0);
      expect(["local", "default", "claude", "none"]).toContain(a.provider);
      for (const c of a.contexts) {
        const [k, t] = c.split(":");
        expect(CATALOG.contexts).toContain(k as any);
        if (t) expect(CATALOG.fileTypes[t]).toBeDefined();
      }
      if (a.provider === "claude") expect(a.risk).toBe("confirm");
    }
  });

  test("filters per context and file type", () => {
    const sel = menuFor({ kind: "selection" });
    expect(ids(sel.top)).toContain("ask");
    expect(ids([...sel.top, ...sel.more])).toContain("micro_save");
    expect(ids([...sel.top, ...sel.more])).not.toContain("yt_transcript");
    const yt1 = menuFor({ kind: "youtube" });
    expect(ids([...yt1.top, ...yt1.more])).toContain("yt_transcript");
    expect(fileTypeOf("C:\\v\\Talk.MP4")).toEqual(expect.arrayContaining(["media", "video"]));
    expect(appliesTo(CATALOG.actions.find((a) => a.id === "transcribe")!, { kind: "file", path: "a.mp4" })).toBe(true);
    expect(appliesTo(CATALOG.actions.find((a) => a.id === "transcribe")!, { kind: "file", path: "a.pdf" })).toBe(false);
    expect(appliesTo(CATALOG.actions.find((a) => a.id === "summarize")!, { kind: "file", path: "notes.md" })).toBe(true);
    const desk = menuFor({ kind: "desktop" });
    expect(ids(desk.top)).toEqual(["command_here"]);
    // Surface filter: Explorer-only actions never show in the browser.
    expect(ids(menuFor({ kind: "file", path: "a.txt", surface: "browser" }).top)).not.toContain("ask_files");
    // Several files selected: "Ask about these files" appears; one file: it doesn't.
    expect(ids(menuFor({ kind: "file", path: "a.txt", count: 3 }).top.concat(menuFor({ kind: "file", path: "a.txt", count: 3 }).more))).toContain("ask_files");
    expect(ids(menuFor({ kind: "file", path: "a.txt", count: 1 }).top)).not.toContain("ask_files");
  });

  test("menus stay short: top 7, the rest under More", () => {
    const m = menuFor({ kind: "selection" });
    expect(m.top.length).toBe(MAX_TOP);
    expect(m.more.length).toBeGreaterThan(0);
  });

  test("order: pinned, then user order, then catalogue; hidden left out", () => {
    let p: MenuPrefs = { ...DEFAULT_PREFS };
    p = togglePin(p, "micro_save");
    expect(menuFor({ kind: "selection" }, p).top[0].id).toBe("micro_save");
    p = move(p, "copy_md", 0);
    expect(ids(orderedActions(p)).slice(0, 2)).toEqual(["micro_save", "copy_md"]);
    p = toggleHidden(p, "ask");
    expect(ids([...menuFor({ kind: "selection" }, p).top, ...menuFor({ kind: "selection" }, p).more])).not.toContain("ask");
    // Hiding a pinned action unpins it; pinning a hidden one shows it.
    p = toggleHidden(p, "micro_save");
    expect(p.pinned).not.toContain("micro_save");
    p = togglePin(p, "micro_save");
    expect(p.hidden).not.toContain("micro_save");
  });

  test("learn from use floats frequent actions within the unpinned part only", () => {
    let usage = {};
    for (let i = 0; i < 5; i++) usage = recordUse(usage, "fix_grammar");
    const off = menuFor({ kind: "selection" }, DEFAULT_PREFS, usage);
    expect(off.top[0].id).toBe("ask");
    const on = menuFor({ kind: "selection" }, { ...DEFAULT_PREFS, learn: true, pinned: ["copy_md"] }, usage);
    expect(ids(on.top).slice(0, 2)).toEqual(["copy_md", "fix_grammar"]);
  });

  test("custom actions: validation, ids, placeholders, removal", () => {
    expect(validateCustom({ label: "", prompt: "", contexts: [] }).length).toBeGreaterThan(2);
    expect(validateCustom({ label: "X", prompt: "Use {nope}", contexts: ["selection"], provider: "local" })[0]).toContain("{nope}");
    expect(validateCustom({ label: "X", prompt: "y", contexts: ["file:zip"], provider: "local" })[0]).toContain("zip");
    let p = addCustom(DEFAULT_PREFS, { label: "Explain like a lawyer", prompt: "Explain {selection} for {title}", contexts: ["selection"], provider: "local" });
    p = addCustom(p, { label: "Explain like a lawyer", prompt: "Again {page}", contexts: ["page"], provider: "claude" });
    expect(p.custom.map((c) => c.id)).toEqual(["custom:explain-like-a-lawyer", "custom:explain-like-a-lawyer-2"]);
    const m = menuFor({ kind: "selection" }, { ...p, pinned: ["custom:explain-like-a-lawyer"] });
    expect(m.top[0].custom).toBe(true);
    expect(orderedActions(p).find((a) => a.id === "custom:explain-like-a-lawyer-2")!.risk).toBe("confirm");
    expect(expandPrompt("Explain {selection} for {title}{nope}", { selection: "x" })).toBe("Explain x for {nope}");
    p = removeCustom({ ...p, pinned: ["custom:explain-like-a-lawyer"] }, "custom:explain-like-a-lawyer");
    expect(p.custom.length).toBe(1);
    expect(p.pinned).toEqual([]);
    expect(() => addCustom(DEFAULT_PREFS, { label: "", prompt: "x", contexts: ["page"], provider: "local" })).toThrow();
  });

  test("import / export round-trip drops unknown ids and bad customs", () => {
    const p = addCustom({ ...DEFAULT_PREFS, pinned: ["ask"], hidden: ["copy_md"], learn: true }, { label: "Tone", prompt: "{selection}", contexts: ["selection"], provider: "local" });
    const back = importPrefs(exportPrefs(p));
    expect(back.prefs).toEqual(p);
    expect(back.skipped).toEqual([]);
    const dirty = JSON.stringify({ kind: "lens-context-menu", version: 1, prefs: { order: ["ask", "rm_rf"], pinned: ["nope"], hidden: 3, custom: [{ label: "Bad", prompt: "{evil}", contexts: ["selection"] }, { label: "Ok", prompt: "x", contexts: ["page"], provider: "weird" }] } });
    const r = importPrefs(dirty);
    expect(r.prefs.order).toEqual(["ask"]);
    expect(r.prefs.pinned).toEqual([]);
    expect(r.prefs.hidden).toEqual([]);
    expect(r.prefs.learn).toBe(false);
    expect(r.skipped).toEqual(["Bad"]);
    expect(r.prefs.custom[0].provider).toBe("local");
    expect(() => importPrefs("{nope")).toThrow();
    expect(() => importPrefs(JSON.stringify({ kind: "other" }))).toThrow();
  });

  test("Explorer verbs and the Rust mirror use catalogued ids", () => {
    const manifest = readFileSync(join(root, "src-tauri/src/bridge/manifest.rs"), "utf8");
    const verbs = [...manifest.matchAll(/\("\d+[a-z]+", "[^"]+", "([a-z_]+)"\)/g)].map((m) => m[1]);
    expect(verbs.length).toBeGreaterThan(8);
    for (const v of verbs) {
      const a = CATALOG.actions.find((x) => x.id === v);
      expect(a, v).toBeDefined();
      expect(a!.surfaces).toContain("explorer");
    }
    const actionsRs = readFileSync(join(root, "src-tauri/src/bridge/actions.rs"), "utf8");
    expect(actionsRs).toContain('include_str!("../../../src/context/actions.catalog.json")');
  });
});

describe("micro-saves", () => {
  test("toast text", () => {
    expect(microToastText({ duplicate: true, merged: false, approx_tokens: 9, quotes: 1, title: "Page" }).title).toBe("Already on your Shelf");
    expect(microToastText({ duplicate: false, merged: true, approx_tokens: 1200, quotes: 3, title: "Page" })).toEqual({ title: "Added to the same note", detail: "3 quotes · ~1.2k tok" });
    expect(microToastText({ duplicate: false, merged: false, approx_tokens: 40, quotes: 1, title: "Page" }).detail).toBe("Page · ~40 tok");
    expect(withNote("> quote", "  check  ")).toBe("> quote\n\n_Note: check_");
    expect(withNote("x", "   ")).toBe("x");
  });

  test("extension: what is saved and what the in-page toast says", () => {
    expect(microItem({ selection: "s", title: "T", url: "https://x.com" })).toEqual({ kind: "selection", text: "s", title: "T", url: "https://x.com" });
    expect(microItem({ title: "T", url: "https://x.com" })).toEqual({ kind: "text", title: "T", url: "https://x.com" });
    expect(microItem({ linkUrl: "https://y.com", linkText: "Y" }).title).toBe("Y");
    expect(microToast({ ok: true, micro: { duplicate: true } })[0]).toBe("Already on your Shelf");
    expect(microToast({ ok: true, micro: { merged: true, approxTokens: 1500 } })).toEqual(["Added to the same note", "~1,500 tokens", "ok"]);
    expect(microToast({ ok: false, error: "nope" })).toEqual(["Couldn't save to your Shelf", "nope", "error"]);
  });

  test("menu: Micro-save and Get transcript are wired, transcript only on YouTube", () => {
    expect(findItem("micro_save").action).toBe("micro_save");
    const t = findItem("yt_transcript");
    expect(t.kind).toBe("transcript");
    expect(t.documentUrlPatterns).toEqual(YOUTUBE_PATTERNS);
    expect(YOUTUBE_PATTERNS.every((p: string) => /youtube\.com\//.test(p))).toBe(true);
    expect(toCreateProps(t).documentUrlPatterns).toEqual(YOUTUBE_PATTERNS);
    expect(findItem("summarize").title).toBe(CATALOG.actions.find((a) => a.id === "summarize")!.label);
    expect(menuItems().filter((i: any) => !i.parentId).length).toBe(1);
  });
});

describe("context packs", () => {
  test("trim plan mirrors the Rust rule", () => {
    const items = [{ id: "a", tokens: 100 }, { id: "b", tokens: 5000 }, { id: "c", tokens: 3000 }];
    expect(planTrim(items, 10_000)).toEqual([]);
    const plan = planTrim(items, 4000);
    expect(plan.map((s) => s.id)).toEqual(["b", "c"]);
    expect(plan[0].to_tokens).toBe(plan[1].to_tokens);
    expect(100 + plan[0].to_tokens * 2).toBeLessThanOrEqual(4000);
    expect(planTrim(Array.from({ length: 10 }, (_, i) => ({ id: `i${i}`, tokens: 500 })), 100).every((s) => s.to_tokens === 64)).toBe(true);
  });

  test("meter, labels and totals", () => {
    expect(budgetLevel(100, 1000)).toBe("ok");
    expect(budgetLevel(850, 1000)).toBe("near");
    expect(budgetLevel(1001, 1000)).toBe("over");
    expect(formatTokens(950)).toBe("950");
    expect(formatTokens(1500)).toBe("1.5k");
    expect(formatTokens(2000)).toBe("2k");
    expect(formatTokens(24_400)).toBe("24k");
    expect(meterPercent(2000, 1000)).toBe(100);
    const view: any = {
      pack: { id: "p1", name: "Brief", item_ids: [], budget_tokens: 1000, auto_trim: true, created_ms: 0, updated_ms: 0 },
      items: [{ id: "a", approx_tokens: 10, missing: false, local_only: false }, { id: "b", approx_tokens: 5000, missing: false, local_only: true }, { id: "z", approx_tokens: 0, missing: true }],
      trim_plan: [{ id: "b", from_tokens: 5000, to_tokens: 990 }],
      total_tokens: 5010, over_budget: true, active: true, local_only: true,
    };
    expect(trimmedTotal(view)).toBe(1000);
    expect(activePackChip(view)).toEqual({ label: "Pack · Brief", detail: "2 items · 1k tok", localOnly: true });
    expect(activePackChip(null)).toBeNull();
  });

  test("auto-trim summarises locally and skips failures", async () => {
    const out = await autoTrim(
      [{ id: "a", from_tokens: 900, to_tokens: 100 }, { id: "b", from_tokens: 900, to_tokens: 100 }],
      async (id) => (id === "a" ? "long text a" : "long text b"),
      async (text, max) => {
        if (text.endsWith("b")) throw new Error("model offline");
        return `summary (${max})`;
      },
    );
    expect(out).toEqual({ a: "summary (100)" });
  });

  test("Send to Claude goes through Lens AI as Shelf context, never with tools", () => {
    const r = claudeRequest("Brief", "# Brief\n...");
    expect(r.provider).toBe("claude");
    expect(r.allow_tools).toBe(false);
    expect(r.context).toEqual({ shelf_text: "# Brief\n..." });
    expect(claudeRequest("Brief", "x", "  What changed?  ").prompt).toBe("What changed?");
  });
});

describe("YouTube transcripts", () => {
  test("video ids and urls", () => {
    expect(yt.videoIdOf("https://www.youtube.com/watch?v=abcDEF12345&t=3")).toBe("abcDEF12345");
    expect(yt.videoIdOf("https://youtu.be/abcDEF12345")).toBe("abcDEF12345");
    expect(yt.videoIdOf("https://m.youtube.com/shorts/abcDEF12345")).toBe("abcDEF12345");
    expect(yt.videoIdOf("https://www.youtube.com/feed/subscriptions")).toBeNull();
    expect(yt.videoIdOf("https://evil.com/watch?v=x")).toBeNull();
    expect(yt.timeLink("https://youtu.be/abcDEF12345", 75.9)).toBe("https://www.youtube.com/watch?v=abcDEF12345&t=75s");
  });

  test("track choice prefers a human track in the reader's language", () => {
    const tracks = [
      { languageCode: "en", kind: "asr", baseUrl: "1" },
      { languageCode: "de", baseUrl: "2" },
      { languageCode: "en-GB", baseUrl: "3" },
    ];
    expect(yt.pickTrack(tracks, "en-US").baseUrl).toBe("3");
    expect(yt.pickTrack(tracks, "de-DE").baseUrl).toBe("2");
    expect(yt.pickTrack(tracks, "fr").baseUrl).toBe("3");
    expect(yt.pickTrack([{ languageCode: "en", kind: "asr", baseUrl: "1" }], "fr").baseUrl).toBe("1");
    expect(yt.pickTrack([], "en")).toBeNull();
  });

  test("json3 captions", () => {
    const s = yt.parseCaptions(fx("json3.json"));
    expect(s.map((x: any) => x.text)).toEqual([
      "Welcome to the talk on calm technology.",
      "Tools should live in the periphery & inform",
      "without demanding attention.",
      "[Music]",
      "Q&A starts now — thanks!",
    ]);
    expect(s[1]).toMatchObject({ start: 3.6, dur: 4.2 });
    expect(yt.parseJson3("{broken")).toEqual([]);
  });

  test("srv3 and srv1 XML captions", () => {
    const s3 = yt.parseCaptions(fx("srv3.xml"));
    expect(s3.map((x: any) => x.text)).toEqual(["Welcome to the talk on calm technology.", "Tools should live in the periphery & inform", "without demanding attention."]);
    expect(s3[2]).toMatchObject({ start: 7.8, dur: 3 });
    const s1 = yt.parseCaptions(fx("srv1.xml"));
    expect(s1).toEqual([{ start: 0.5, dur: 2.1, text: "Hello & welcome" }, { start: 2.6, dur: 1.9, text: "it's a test." }]);
    expect(yt.parseCaptions("plain text")).toEqual([]);
  });

  test("markdown with timestamp links, SRT, Shelf item", () => {
    const t = { meta: { title: "Calm Tech", channel: "Amber", lengthSeconds: 3725 }, url: "https://www.youtube.com/watch?v=abcDEF12345", language: "English", auto: true, segments: yt.parseCaptions(fx("json3.json")) };
    const md = yt.toMarkdown(t);
    expect(md.startsWith("# Calm Tech\nAmber · 1:02:05 · English (auto captions)\nSource: <https://www.youtube.com/watch?v=abcDEF12345>\n")).toBe(true);
    expect(md).toContain("**[0:00](https://www.youtube.com/watch?v=abcDEF12345&t=0s)** Welcome to the talk");
    expect(md).toContain("[0:40](https://www.youtube.com/watch?v=abcDEF12345&t=40s)");
    const srt = yt.toSrt(t.segments.slice(0, 2));
    expect(srt).toBe("1\n00:00:00,000 --> 00:00:03,500\nWelcome to the talk on calm technology.\n\n2\n00:00:03,600 --> 00:00:07,800\nTools should live in the periphery & inform\n");
    const item = yt.transcriptShelfItem(t);
    expect(item.kind).toBe("transcript");
    expect(item.title).toBe("Calm Tech — transcript");
    expect(item.tags).toEqual(["youtube", "transcript", "Amber"]);
    expect(yt.transcriptSummary(t).segments).toBe(5);
    expect(yt.formatTimestamp(59.9)).toBe("0:59");
  });
});

describe("extension stays minimal", () => {
  const base = JSON.parse(readFileSync(join(root, "extensions/browser/manifest.base.json"), "utf8"));
  test("no new permissions; YouTube is reached through activeTab / the optional host permission only", () => {
    for (const target of TARGETS) {
      const m = buildManifest(base, target);
      expect(m.host_permissions).toBeUndefined();
      expect(m.content_scripts).toBeUndefined();
      expect(m.optional_host_permissions).toEqual(["https://*/*", "http://*/*"]);
      expect(m.permissions).not.toContain("downloads");
      expect(m.permissions).not.toContain("tabs");
    }
  });

  test("the only network call is the guarded same-origin caption fetch", () => {
    expect(Object.keys(NETWORK_EXCEPTIONS)).toEqual(["src/content/ytPage.js"]);
    const page = readFileSync(join(root, "extensions/browser/src/content/ytPage.js"), "utf8");
    expect(page).toContain("assertTimedtextUrl(");
    expect(page).toContain('u.pathname !== "/api/timedtext"');
    expect((page.match(/\bfetch\s*\(/g) || []).length).toBe(1);
    const m = buildManifest(base, "chrome");
    // A second fetch, or a fetch anywhere else, fails the build check.
    expect(checkManifest(m, [], { "src/content/ytPage.js": page + "\nfetch('https://evil')" }).join()).toContain("guarded");
    expect(checkManifest(m, [], { "src/x.js": "fetch('https://evil')" }).join()).toContain("network calls are not allowed");
  });

  test("the bundled catalogue is in sync with Lens", () => {
    const gen = readFileSync(join(root, "extensions/browser/src/catalog.gen.js"), "utf8");
    expect(gen).toBe(catalogModule(readFileSync(join(root, "src/context/actions.catalog.json"), "utf8")));
  });
});
