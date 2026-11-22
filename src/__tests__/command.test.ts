// Lens Command input logic: modes, slash commands, @ mentions, templates, request building, thread.
import { describe, expect, mock, test } from "bun:test";

// Other test files mock @tauri-apps/api/core without transformCallback; stub event/window too so
// modules that import them load in any order.
mock.module("@tauri-apps/api/core", () => ({ invoke: async () => null, transformCallback: () => 0 }));
mock.module("@tauri-apps/api/event", () => ({ listen: async () => () => {}, emit: async () => {} }));

const { MODES, chipBlocked, cycleMode, destinationOf, expandTemplate, mentionAtCaret, mentionSuggestions, parseMentions, parseSlash, slashSuggestions } = await import("../command/parse");
type CommandTemplate = import("../command/parse").CommandTemplate;
const { buildRequest, resolveProvider } = await import("../command/request");
const { normaliseCommandSettings, DEFAULT_COMMAND_SETTINGS } = await import("../command/settings");
const { bridgeCommand, threadReducer } = await import("../command/thread");
type ContextChip = import("../command/thread").ContextChip;
type ThreadItem = import("../command/thread").ThreadItem;
const { approxTokens, formatTokens } = await import("../shelf/contract");
import type { ProviderInfo } from "../command/ai";


const tpl = (id: string, o: Partial<CommandTemplate> = {}): CommandTemplate => ({
  id, name: id[0].toUpperCase() + id.slice(1), description: `${id} things`, template: `Do ${id}: {selection}`, provider: "local",
  input: "selection", options: [], output: "thread", builtin: true, enabled: true, ...o,
});

const COMMANDS: CommandTemplate[] = [
  tpl("summarise", { options: ["key points", "tl;dr", "headline"], template: "Summarise as {option | default:\"key points\"}:\n{selection | trim}" }),
  tpl("explain"),
  tpl("translate", { template: "Translate into {lang | default:\"English\"}:\n{selection}" }),
  tpl("rewrite", { options: ["shorter", "friendlier", "formal"], template: "Rewrite {option}: {selection}", output: "paste" }),
  tpl("fix"),
  tpl("todo", { output: "shelf" }),
  tpl("ask-page", { template: "Q: {input}\nPage {title} ({url}):\n{page}" }),
  tpl("note", { template: "" }),
  tpl("hidden", { enabled: false }),
];

const chip = (source: ContextChip["source"], value: string, o: Partial<ContextChip> = {}): ContextChip => ({
  key: `${source}-${value.slice(0, 6)}`, source, label: source, detail: "", chars: value.length, tokens: approxTokens(value), localOnly: false, value, ...o,
});

const PROVIDERS: ProviderInfo[] = [
  { id: "script", kind: "script", label: "Offline", available: true, is_local: true, needs_key: false, has_key: false },
  { id: "ollama", kind: "local", label: "Ollama", available: true, model: "llama3.2", is_local: true, needs_key: false, has_key: false },
  { id: "claude", kind: "claude", label: "Claude", available: true, model: "claude-sonnet-5-5", is_local: false, needs_key: true, has_key: true },
];

describe("modes", () => {
  test("Tab cycles forward and back, wrapping", () => {
    expect(cycleMode("ask")).toBe("do");
    expect(cycleMode("actions")).toBe("ask");
    expect(cycleMode("ask", -1)).toBe("actions");
    expect(MODES.length).toBe(5);
  });
  test("skips disabled modes and recovers from an unknown one", () => {
    expect(cycleMode("ask", 1, ["ask", "clipboard"])).toBe("clipboard");
    expect(cycleMode("do", 1, ["ask", "clipboard"])).toBe("ask");
    expect(cycleMode("ask", 1, [])).toBe("ask");
  });
});

describe("@ mentions", () => {
  test("extracts sources and args, strips them from the text", () => {
    const r = parseMentions("explain @selection please @file:\"C:\\My Docs\\a.txt\" and @shelf:s12");
    expect(r.rest).toBe("explain please and");
    expect(r.mentions.map((m) => m.source)).toEqual(["selection", "file", "shelf"]);
    expect(r.mentions[1].arg).toBe("C:\\My Docs\\a.txt");
    expect(r.mentions[2].arg).toBe("s12");
  });
  test("ignores emails and unknown sources; de-duplicates", () => {
    const r = parseMentions("mail me@host.com about @foo and @clipboard @clipboard");
    expect(r.mentions.map((m) => m.source)).toEqual(["clipboard"]);
    expect(r.rest).toBe("mail me@host.com about @foo and");
  });
  test("caret detection for the popover", () => {
    expect(mentionAtCaret("ask @cl", 7)).toEqual({ start: 4, partial: "cl" });
    expect(mentionAtCaret("@", 1)).toEqual({ start: 0, partial: "" });
    expect(mentionAtCaret("me@host", 7)).toBeNull();
    expect(mentionSuggestions("cl").map((m) => m.source)).toEqual(["clipboard"]);
    expect(mentionSuggestions("").length).toBe(6);
  });
});

describe("/ commands", () => {
  test("not a command", () => {
    expect(parseSlash("hello /there", COMMANDS)).toBeNull();
  });
  test("completing vs resolved", () => {
    const p = parseSlash("/sum", COMMANDS)!;
    expect(p.completing).toBe(true);
    expect(p.command).toBeNull();
    const q = parseSlash("/summarise", COMMANDS)!;
    expect(q.command?.id).toBe("summarise");
    const r = parseSlash("/sum this text", COMMANDS)!;
    expect(r.command?.id).toBe("summarise"); // unique prefix once you keep typing
    expect(r.args).toBe("this text");
  });
  test("options are recognised, longest first", () => {
    const p = parseSlash("/summarise tl;dr", COMMANDS)!;
    expect(p.option).toBe("tl;dr");
    expect(p.args).toBe("");
    const r = parseSlash("/rewrite friendlier hey you", COMMANDS)!;
    expect(r.option).toBe("friendlier");
    expect(r.args).toBe("hey you");
  });
  test("translate picks up the language", () => {
    expect(parseSlash("/translate to french", COMMANDS)!.lang).toBe("French");
    const p = parseSlash("/translate into Brazilian Portuguese: bom dia", COMMANDS)!;
    expect(p.lang).toBe("Brazilian Portuguese");
    expect(p.args).toBe("bom dia");
    expect(parseSlash("/translate hola", COMMANDS)!.lang).toBeUndefined();
  });
  test("disabled commands never resolve", () => {
    expect(parseSlash("/hidden x", COMMANDS)!.command).toBeNull();
  });
  test("suggestions rank exact > id prefix > name > substring", () => {
    expect(slashSuggestions("", COMMANDS).length).toBe(8);
    expect(slashSuggestions("fix", COMMANDS)[0].id).toBe("fix");
    expect(slashSuggestions("re", COMMANDS)[0].id).toBe("rewrite");
    expect(slashSuggestions("page", COMMANDS)[0].id).toBe("ask-page");
    expect(slashSuggestions("zzz", COMMANDS)).toEqual([]);
  });
});

describe("templates (same rules as Rust)", () => {
  test("variables and modifiers", () => {
    const v = { selection: "  Hello World  ", lang: "" };
    expect(expandTemplate("[{selection}]", v)).toBe("[  Hello World  ]");
    expect(expandTemplate("[{selection | trim | upper}]", v)).toBe("[HELLO WORLD]");
    expect(expandTemplate('{lang | default:"French"}', v)).toBe("French");
    expect(expandTemplate("{clipboard}", v)).toBe("");
    expect(expandTemplate("{selection | trim | first:5}", v)).toBe("Hello\n[…]");
    expect(expandTemplate('{option | default:"a|b"}', {})).toBe("a|b");
  });
  test("unknown and broken placeholders stay visible", () => {
    expect(expandTemplate("keep {unknown} and {json: 1}", {})).toBe("keep {unknown} and {json: 1}");
    expect(expandTemplate("open { never closed", {})).toBe("open { never closed");
    expect(expandTemplate("{}", {})).toBe("{}");
  });
});

describe("request building", () => {
  test("provider resolution: override > template > active", () => {
    expect(resolveProvider(COMMANDS[0], {}, PROVIDERS, "claude")).toEqual({ id: "ollama", kind: "local" });
    expect(resolveProvider(COMMANDS[0], { summarise: "claude" }, PROVIDERS, "ollama")).toEqual({ id: "claude", kind: "claude" });
    expect(resolveProvider(null, {}, PROVIDERS, "claude")).toEqual({ id: undefined, kind: "claude" });
    expect(destinationOf("claude")).toBe("Claude");
    expect(destinationOf("script")).toBe("Script");
    expect(destinationOf(undefined)).toBe("Local");
  });

  test("a command fills its template from the chips", () => {
    const slash = parseSlash("/summarise tl;dr", COMMANDS);
    const b = buildRequest({ text: "/summarise tl;dr", slash, chips: [chip("selection", "  The text.  ")], overrides: {}, providers: PROVIDERS, active: "ollama" });
    expect(b.req.prompt).toBe("Summarise as tl;dr:\nThe text.");
    expect(b.req.provider).toBe("ollama");
    expect(b.dest).toBe("Local");
    expect(b.display).toBe("/summarise tl;dr");
  });

  test("falls back to typed text when there is no selection", () => {
    const slash = parseSlash("/fix teh cat", COMMANDS);
    const b = buildRequest({ text: "/fix teh cat", slash, chips: [], overrides: {}, providers: PROVIDERS, active: "ollama" });
    expect(b.req.prompt).toBe("Do fix: teh cat");
  });

  test("ask-page uses the page chip", () => {
    const slash = parseSlash("/ask-page who wrote it?", COMMANDS);
    const page = chip("page", "Body text", { label: "Article", url: "https://x.dev/a" });
    const b = buildRequest({ text: "", slash, chips: [page], overrides: {}, providers: PROVIDERS, active: "ollama" });
    expect(b.req.prompt).toBe("Q: who wrote it?\nPage Article (https://x.dev/a):\nBody text");
    expect(b.req.context.url).toBe("https://x.dev/a");
  });

  test("free questions carry context fields and Shelf text", () => {
    const b = buildRequest({
      text: "what changed?",
      slash: null,
      chips: [chip("selection", "sel"), chip("clipboard", "clip"), chip("window", "Report.docx - Word", { detail: "WINWORD" }), chip("shelf", "", { ids: ["s1"] })],
      overrides: {},
      providers: PROVIDERS,
      active: "ollama",
      shelfText: "### Text — note\n\nhello",
    });
    expect(b.req.context).toEqual({
      selection: "sel",
      clipboard: "clip",
      window_title: "Report.docx - Word",
      app_name: "WINWORD",
      shelf_text: "### Text — note\n\nhello",
    });
    expect(b.req.prompt).toBe("what changed?");
  });

  test("private items never go to Claude", () => {
    const secret = chip("clip", "token=abc", { localOnly: true });
    const ok = chip("selection", "fine");
    const b = buildRequest({ text: "hi", slash: null, chips: [secret, ok], overrides: {}, providers: PROVIDERS, active: "claude" });
    expect(b.dest).toBe("Claude");
    expect(b.dropped).toEqual([secret]);
    expect(b.req.context.selection).toBe("fine");
    expect(chipBlocked(true, "Local")).toBe(false);
    const local = buildRequest({ text: "hi", slash: null, chips: [secret], overrides: {}, providers: PROVIDERS, active: "ollama" });
    expect(local.dropped).toEqual([]);
    expect(local.req.context.selection).toBe("token=abc");
  });
});

describe("thread", () => {
  const ans: ThreadItem = { kind: "answer", key: "a1", reqId: null, text: "", status: "streaming", ts: 1 };
  test("stream, finish, cancel", () => {
    let s = threadReducer([], { type: "push", item: ans });
    s = threadReducer(s, { type: "attachReq", key: "a1", reqId: "r1" });
    s = threadReducer(s, { type: "delta", reqId: "r1", text: "Hel" });
    s = threadReducer(s, { type: "delta", reqId: "r1", text: "lo" });
    s = threadReducer(s, { type: "delta", reqId: "other", text: "x" });
    expect((s[0] as Extract<ThreadItem, { kind: "answer" }>).text).toBe("Hello");
    s = threadReducer(s, { type: "done", done: { id: "r1", provider: "Ollama", model: "llama", usage: { input_tokens: 3, output_tokens: 2 } } });
    const a = s[0] as Extract<ThreadItem, { kind: "answer" }>;
    expect(a.status).toBe("done");
    expect(a.tokens).toEqual({ in: 3, out: 2 });
    s = threadReducer(s, { type: "delta", reqId: "r1", text: "late" });
    expect((s[0] as Extract<ThreadItem, { kind: "answer" }>).text).toBe("Hello");
    let c = threadReducer([ans], { type: "cancel", key: "a1" });
    expect((c[0] as Extract<ThreadItem, { kind: "answer" }>).status).toBe("cancelled");
    c = threadReducer(c, { type: "clear" });
    expect(c).toEqual([]);
  });
  test("tool proposals: blocked are never pending; decisions and results", () => {
    const p = { id: "r", call_id: "c1", tool: "set_theme", args: { pack: "nord" }, summary: "Switch to Nord", risk: "confirm" as const };
    let s = threadReducer([], { type: "proposal", proposal: p, ts: 1 });
    s = threadReducer(s, { type: "proposal", proposal: p, ts: 2 });
    expect(s.length).toBe(1);
    expect((s[0] as Extract<ThreadItem, { kind: "tool" }>).state).toBe("pending");
    s = threadReducer(s, { type: "toolDecision", callId: "c1", approve: true });
    s = threadReducer(s, { type: "toolResult", result: { id: "r", call_id: "c1", ok: true, message: "Theme set." } });
    expect((s[0] as Extract<ThreadItem, { kind: "tool" }>).state).toBe("done");
    const b = threadReducer([], { type: "proposal", proposal: { ...p, call_id: "c2", risk: "blocked" }, ts: 1 });
    expect((b[0] as Extract<ThreadItem, { kind: "tool" }>).state).toBe("denied");
  });
  test("caps length", () => {
    let s: ThreadItem[] = [];
    for (let i = 0; i < 210; i++) s = threadReducer(s, { type: "push", item: { kind: "action", key: `k${i}`, title: "t", ok: true, ts: i } });
    expect(s.length).toBe(200);
    expect(s[0].key).toBe("k10");
  });
  test("bridge actions map to commands", () => {
    expect(bridgeCommand("summarize")).toBe("summarise");
    expect(bridgeCommand("ask_page")).toBe("ask-page");
    expect(bridgeCommand("save_note")).toBe("note");
    expect(bridgeCommand("weird")).toBe("ask-page");
  });
});

describe("settings and tokens", () => {
  test("normalise clamps and fills defaults", () => {
    expect(normaliseCommandSettings(undefined)).toEqual(DEFAULT_COMMAND_SETTINGS);
    const s = normaliseCommandSettings({ width: 2000, defaultMode: "nope", autoAttach: ["window", "evil"], density: "compact", position: "top" });
    expect(s.width).toBe(880);
    expect(s.defaultMode).toBe("ask");
    expect(s.autoAttach).toEqual(["window"]);
    expect(s.density).toBe("compact");
    expect(normaliseCommandSettings({ width: 601 }).width).toBe(600);
  });
  test("token estimate matches the Rust side", () => {
    expect(approxTokens("")).toBe(0);
    expect(approxTokens("abcd")).toBe(1);
    expect(approxTokens("abcde")).toBe(2);
    expect(approxTokens("日本語")).toBe(3);
    expect(formatTokens(950)).toBe("950 tok");
    expect(formatTokens(1500)).toBe("1.5k tok");
    expect(formatTokens(24000)).toBe("24k tok");
  });
});
