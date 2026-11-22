// Ask panel logic: context chips, the privacy gate, hand-off text, Shelf @-mentions, Markdown-lite,
// quick actions, notification digest and "what was I doing" grouping.
import { describe, expect, mock, test } from "bun:test";

mock.module("@tauri-apps/api/core", () => ({
  invoke: async () => null,
  convertFileSrc: (p: string) => `asset://localhost/${encodeURIComponent(p)}`,
  transformCallback: () => 0,
}));
mock.module("@tauri-apps/api/event", () => ({ listen: async () => () => {}, emit: async () => {} }));

const ctxMod = await import("../ai/context");
const { parseBlocks, parseInline } = await import("../ai/MarkdownLite");
const { clipboardActions, notificationDigest, actionsForFiles, DIGEST_MAX_ITEMS } = await import("../ai/actions");
const { groupWindows, canSendTitles, activityOf } = await import("../dock/ai/activityGroups");
type P = import("../ai/contract.shim").AiProviderInfo;

const prov = (o: Partial<P>): P => ({ id: "x", kind: "local", label: "X", available: true, model: "m", is_local: true, needs_key: false, has_key: false, ...o });
const local = prov({ id: "ollama", label: "Ollama" });
const script = prov({ id: "script", kind: "script", label: "Script", is_local: true });
const claude = prov({ id: "claude", kind: "claude", label: "Claude", is_local: false, needs_key: true, has_key: true });

describe("context chips", () => {
  const ctx = { selection: "one two three", clipboard: "  ", app_name: "Chrome", window_title: "Docs", url: "https://example.com/a", files: ["C:\\a\\b.pdf"] };
  test("one chip per non-empty field, in order", () => {
    expect(ctxMod.buildChips(ctx).map((c) => c.kind)).toEqual(["selection", "window", "url", "files"]);
    expect(ctxMod.buildChips(ctx)[0].label).toBe("Selection · 3 words");
    expect(ctxMod.buildChips(ctx)[2].label).toBe("Link · example.com");
    expect(ctxMod.buildChips(ctx)[3].label).toBe("File · b.pdf");
  });
  test("removing window clears title and app", () => {
    const next = ctxMod.removeContext(ctx, "window");
    expect(next.app_name).toBeUndefined();
    expect(next.window_title).toBeUndefined();
    expect(ctx.app_name).toBe("Chrome"); // not mutated
  });
});

describe("privacy gate", () => {
  test("local and script always send", () => {
    expect(ctxMod.sendGate("local_only", local)).toBe("ok");
    expect(ctxMod.sendGate("local_only", script)).toBe("ok");
  });
  test("cloud depends on privacy", () => {
    expect(ctxMod.sendGate("local_only", claude)).toBe("blocked");
    expect(ctxMod.sendGate("ask_each_time", claude)).toBe("consent");
    expect(ctxMod.sendGate("ask_each_time", claude, true)).toBe("ok");
    expect(ctxMod.sendGate("allow_cloud", claude)).toBe("ok");
  });
  test("missing key and missing provider", () => {
    expect(ctxMod.sendGate("allow_cloud", { ...claude, has_key: false })).toBe("needs-key");
    expect(ctxMod.sendGate("allow_cloud", { ...local, available: false })).toBe("no-provider");
    expect(ctxMod.sendGate("allow_cloud", null)).toBe("no-provider");
  });
  test("unknown providers count as cloud", () => {
    expect(ctxMod.isCloud(undefined)).toBe(true);
    expect(ctxMod.contextForProvider({ selection: "x" }, claude, "local_only")).toEqual({});
  });
});

describe("hand-off and size", () => {
  test("Continue in Claude text carries prompt and every attachment", () => {
    const t = ctxMod.composeHandoff("Fix this", { selection: "teh", url: "https://a.b" }, "the");
    expect(t).toContain("Fix this");
    expect(t).toContain("--- Selection ---\nteh");
    expect(t).toContain("--- Link ---\nhttps://a.b");
    expect(t).toContain("--- Answer so far ---\nthe");
  });
  test("token estimate and formatting", () => {
    expect(ctxMod.approxTokens(400)).toBe(100);
    expect(ctxMod.estimateTokens("abcd", { selection: "x".repeat(396) }, 50)).toBe(150);
    expect(ctxMod.formatTokens(950)).toBe("≈ 950 tokens");
    expect(ctxMod.formatTokens(1234)).toBe("≈ 1.2k tokens");
    expect(ctxMod.formatTokens(23456)).toBe("≈ 23k tokens");
  });
});

describe("Shelf @-mentions", () => {
  test("detects a mention at the caret, not inside emails", () => {
    expect(ctxMod.mentionAt("summarise @meet", 15)).toEqual({ query: "meet", start: 10 });
    expect(ctxMod.mentionAt("@", 1)).toEqual({ query: "", start: 0 });
    expect(ctxMod.mentionAt("mail me@x.com", 13)).toBeNull();
    expect(ctxMod.mentionAt("done @x and more", 16)).toBeNull();
  });
  test("strips the mention and keeps the rest", () => {
    expect(ctxMod.stripMention("summarise @meet please", 10, 15)).toEqual({ text: "summarise please", caret: 10 });
  });
  test("filters shelf items and skips attached ones", () => {
    const items = [
      { id: "1", kind: "page", title: "Meeting notes", source_app: "Edge" },
      { id: "2", kind: "transcript", title: "Standup recording" },
      { id: "3", kind: "answer", text: "Meet at 5\nmore" },
    ];
    expect(ctxMod.filterShelf(items, "meet").map((i) => i.id)).toEqual(["1", "3"]);
    expect(ctxMod.filterShelf(items, "meet", ["1"]).map((i) => i.id)).toEqual(["3"]);
    expect(ctxMod.filterShelf(items, "transcript").map((i) => i.id)).toEqual(["2"]);
    expect(ctxMod.shelfTitle(items[2])).toBe("Meet at 5");
  });
  test("shelf text is folded into page_text", () => {
    expect(ctxMod.withShelfText({}, "abc").page_text).toBe("--- From your Shelf ---\nabc");
    expect(ctxMod.withShelfText({ page_text: "p" }, "abc").page_text).toBe("p\n\n--- From your Shelf ---\nabc");
    expect(ctxMod.withShelfText({ selection: "s" }, "  ")).toEqual({ selection: "s" });
  });
});

describe("Markdown-lite", () => {
  test("blocks", () => {
    const b = parseBlocks("# Title\nline one\nline two\n\n- a\n- [x] done\n1. one\n2. two\n```ts\nconst x = 1;\n```");
    expect(b.map((x) => x.t)).toEqual(["h", "p", "ul", "ol", "code"]);
    expect(b[1]).toEqual({ t: "p", text: "line one line two" });
    expect(b[2]).toEqual({ t: "ul", items: [{ text: "a" }, { text: "done", task: true, done: true }] });
    expect(b[4]).toEqual({ t: "code", lang: "ts", text: "const x = 1;", open: false });
  });
  test("an unclosed fence while streaming renders as open code", () => {
    const b = parseBlocks("text\n```\npartial");
    expect(b[1]).toEqual({ t: "code", lang: "", text: "partial", open: true });
  });
  test("inline", () => {
    expect(parseInline("a **b** `c` *d* [e](https://x.y)")).toEqual([
      { t: "text", v: "a " },
      { t: "b", v: "b" },
      { t: "text", v: " " },
      { t: "code", v: "c" },
      { t: "text", v: " " },
      { t: "i", v: "d" },
      { t: "text", v: " " },
      { t: "a", v: "e", href: "https://x.y" },
    ]);
  });
  test("non-http links stay text", () => {
    expect(parseInline("[x](javascript:alert(1))").every((n) => n.t === "text")).toBe(true);
  });
});

describe("quick actions", () => {
  test("clipboard actions attach only the clipboard", () => {
    const tr = clipboardActions().find((a) => a.id === "translate")!;
    const r = tr.build({ text: "hola", language: "French" });
    expect(r.prompt).toContain("French");
    expect(r.context).toEqual({ clipboard: "hola" });
  });
  test("notification digest is newest first and capped", () => {
    const now = 1_000_000_000;
    const list = Array.from({ length: 60 }, (_, i) => ({ appName: "Mail", title: `t${i}`, body: "x".repeat(500), time: now - i * 60000 }));
    const d = notificationDigest(list, now);
    const lines = d.context.page_text!.split("\n");
    expect(lines).toHaveLength(DIGEST_MAX_ITEMS);
    expect(lines[0].startsWith("[0m ago] Mail: t0 — ")).toBe(true);
    expect(lines[0].length).toBeLessThan(240);
  });
  test("file actions fit the files", () => {
    expect(actionsForFiles(["a.mp4"]).map((a) => a.id)).toEqual(["summarise", "transcribe", "rename", "ask"]);
    expect(actionsForFiles(["a.pdf"]).map((a) => a.id)).toEqual(["summarise", "rename", "ask"]);
    expect(actionsForFiles(["a.mp4", "b.pdf"]).map((a) => a.id)).toEqual(["summarise", "rename", "ask"]);
    expect(actionsForFiles(["a.exe"]).map((a) => a.id)).toEqual(["rename", "ask"]);
    expect(actionsForFiles([])).toEqual([]);
  });
});

describe("what was I doing", () => {
  const wins = [
    { hwnd: 1, title: "main.rs - Code", processName: "Code.exe", isFocused: true },
    { hwnd: 2, title: "Docs", processName: "chrome.exe" },
    { hwnd: 3, title: "Search", processName: "msedge.exe" },
    { hwnd: 4, title: "", processName: "explorer.exe" },
    { hwnd: 5, title: "Thing", processName: "mystery.exe" },
  ];
  test("groups by activity, focused group first, empty titles skipped, other last", () => {
    expect(groupWindows(wins).map((g) => [g.activity, g.windows.length])).toEqual([["code", 1], ["web", 2], ["other", 1]]);
    expect(activityOf("Spotify.exe")).toBe("media");
  });
  test("titles never go to the cloud unless allowed", () => {
    expect(canSendTitles(local, "local_only")).toBe(true);
    expect(canSendTitles(claude, "ask_each_time")).toBe(false);
    expect(canSendTitles(claude, "allow_cloud")).toBe(true);
    expect(canSendTitles(null, "allow_cloud")).toBe(false);
  });
});
