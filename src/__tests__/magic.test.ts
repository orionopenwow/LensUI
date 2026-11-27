// Magic right-click window: actions per target, keyboard model, Do/Ask switching, requests.
import { describe, expect, mock, test } from "bun:test";

mock.module("@tauri-apps/api/core", () => ({
  invoke: async () => null,
  convertFileSrc: (p: string) => `asset://localhost/${encodeURIComponent(p)}`,
  transformCallback: () => 0,
}));
mock.module("@tauri-apps/api/event", () => ({ listen: async () => () => {}, emit: async () => {} }));

const model = await import("../magic/model");
const { PREVIEW_SETS, previewOpen, PREVIEW_TARGETS } = await import("../magic/previews");
const { DEFAULT_MAGIC } = await import("../magic/contract");
const { DEFAULT_PREFS } = await import("../context/actions");
const { INITIAL_RUN, reduceAiEvent, pendingApprovals } = await import("../ai/contract");

const cfg = { ...DEFAULT_MAGIC, enabled: true };
const ids = (rows: { id: string }[]) => rows.map((r) => r.id);
const target = (k: string) => PREVIEW_SETS[k][0];

describe("actions per target", () => {
  test("selection gets text actions, never window actions", () => {
    const s = model.rowsFor(target("selection"), cfg);
    const all = ids([...s.top, ...s.more]);
    expect(all).toContain("summarize");
    expect(all).toContain("fix_grammar");
    expect(all.some((i) => i.startsWith("win:"))).toBe(false);
    expect(all).not.toContain("command_open"); // the footer has Expand to Command
    expect(s.top.length).toBeLessThanOrEqual(cfg.maxRows);
  });

  test("a window leads with window actions; close asks first", () => {
    const s = model.rowsFor(target("window"), cfg);
    expect(s.top[0].id).toBe("win:minimize");
    const close = [...s.top, ...s.more].find((r) => r.id === "win:close")!;
    expect(close.risk).toBe("confirm");
    expect(close.windowAction).toBe("close");
  });

  test("window actions can be turned off", () => {
    const s = model.rowsFor(target("window"), { ...cfg, windowActions: false });
    expect(ids([...s.top, ...s.more]).some((i) => i.startsWith("win:"))).toBe(false);
  });

  test("AI off hides AI actions everywhere", () => {
    const s = model.rowsFor(target("selection"), { ...cfg, ai: false });
    for (const r of [...s.top, ...s.more]) {
      expect(r.group).not.toBe("ai");
      expect(r.action?.provider === "claude" || r.action?.provider === "local").toBe(false);
    }
    expect(ids([...s.top, ...s.more])).toContain("copy_md");
  });

  test("YouTube links get the transcript action; plain links don't", () => {
    const yt = { ...target("link"), url: "https://www.youtube.com/watch?v=abc" };
    expect(ids(model.rowsFor(yt, { ...cfg, maxRows: 9 }).top.concat(model.rowsFor(yt, cfg).more))).toContain("yt_transcript");
    const plain = model.rowsFor(target("link"), cfg);
    expect(ids([...plain.top, ...plain.more])).not.toContain("yt_transcript");
    expect(model.isYouTube("https://youtu.be/x")).toBe(true);
    expect(model.isYouTube("not a url")).toBe(false);
  });

  test("files map to file types, the desktop to Command here", () => {
    const f = model.rowsFor(target("file"), cfg);
    expect(ids([...f.top, ...f.more])).toContain("ask_files");
    const d = model.rowsFor(target("desktop"), cfg);
    expect(ids([...d.top, ...d.more])).toContain("command_here");
  });

  test("user order, pins and hidden actions from right-click settings apply", () => {
    const prefs = { ...DEFAULT_PREFS, pinned: ["copy_md"], hidden: ["summarize"] };
    const s = model.rowsFor(target("selection"), cfg, prefs);
    expect(s.top[0].id).toBe("copy_md");
    expect(ids([...s.top, ...s.more])).not.toContain("summarize");
  });

  test("frequent-first only reorders when learning is on", () => {
    const usage = { translate: 50 };
    const off = model.rowsFor(target("selection"), cfg, DEFAULT_PREFS, usage);
    const on = model.rowsFor(target("selection"), { ...cfg, learn: true }, DEFAULT_PREFS, usage);
    expect(off.top[0].id).not.toBe("translate");
    expect(on.top[0].id).toBe("translate");
  });

  test("max rows is clamped to 3–9", () => {
    expect(model.rowsFor(target("selection"), { ...cfg, maxRows: 1 }).top.length).toBe(3);
    expect(model.rowsFor(target("window"), { ...cfg, maxRows: 99 }).top.length).toBe(9);
  });

  test("Snip and Lens Browser rows only when installed", () => {
    const without = model.windowRows(PREVIEW_SETS.link[1]);
    expect(ids(without)).not.toContain("win:snip");
    const withCaps = model.windowRows(PREVIEW_SETS.link[1], { snip: true, browser: true });
    expect(ids(withCaps)).toContain("win:snip");
    expect(ids(withCaps)).toContain("win:browser");
    expect(ids(model.windowRows(target("window"), { snip: false, browser: true }))).not.toContain("win:browser");
  });

  test("every preview target produces a usable menu", () => {
    for (const p of PREVIEW_TARGETS) {
      const s = model.rowsFor(previewOpen(p.id).targets[0], cfg);
      expect(s.top.length).toBeGreaterThan(0);
    }
  });
});

describe("keyboard", () => {
  const set = model.rowsFor(target("window"), cfg);
  const k0 = model.initialKeys("do");

  test("arrows wrap, numbers run, Enter runs the selected row", () => {
    const up = model.onKey(k0, "ArrowUp", set, 1);
    expect(up.type === "state" && up.state.index).toBe(set.top.length - 1);
    const n = model.onKey(k0, "3", set, 1);
    expect(n.type === "run" && n.row.id).toBe(set.top[2].id);
    const e = model.onKey({ ...k0, index: 1 }, "Enter", set, 1);
    expect(e.type === "run" && e.row.id).toBe(set.top[1].id);
    expect(model.onKey(k0, "9", { top: set.top.slice(0, 3), more: [] }, 1).type).toBe("none");
  });

  test("Tab switches Do ↔ Ask; Enter in Ask asks", () => {
    const t = model.onKey(k0, "Tab", set, 1);
    expect(t.type === "state" && t.state.mode).toBe("ask");
    const a = model.onKey({ ...k0, mode: "ask", query: "  what is this? " }, "Enter", set, 1);
    expect(a.type === "ask" && a.question).toBe("what is this?");
    expect(model.onKey({ ...k0, mode: "ask" }, "Enter", set, 1).type).toBe("none");
    // Digits type into the Ask box instead of running actions.
    expect(model.onKey({ ...k0, mode: "ask" }, "1", set, 1).type).toBe("none");
  });

  test("Esc clears the filter first, then closes", () => {
    const c = model.onKey({ ...k0, query: "snap" }, "Escape", set, 1);
    expect(c.type === "state" && c.state.query).toBe("");
    expect(model.onKey(k0, "Escape", set, 1).type).toBe("close");
  });

  test("← → switch targets only with an empty filter", () => {
    const r = model.onKey(k0, "ArrowRight", set, 3);
    expect(r.type === "state" && r.state.target).toBe(1);
    const l = model.onKey(k0, "ArrowLeft", set, 3);
    expect(l.type === "state" && l.state.target).toBe(2);
    expect(model.onKey({ ...k0, query: "x" }, "ArrowRight", set, 3).type).toBe("none");
    expect(model.onKey(k0, "ArrowRight", set, 1).type).toBe("none");
  });

  test("filtering searches More too, and Enter with no match asks", () => {
    const f = model.visibleRows(set, { ...k0, query: "workspace" });
    expect(ids(f)).toEqual(["win:workspace"]);
    const none = model.onKey({ ...k0, query: "zzzz qqq" }, "Enter", set, 1);
    expect(none.type === "ask" && none.state.mode).toBe("ask");
  });
});

describe("requests", () => {
  test("context carries only what the chip shows", () => {
    const sel = model.contextFor(target("selection"));
    expect(sel.selection).toContain("beta channel");
    expect(sel.url).toBeUndefined();
    const link = model.contextFor(target("link"));
    expect(link.url).toBe("https://calmtech.com/");
    expect(link.files).toBeUndefined();
    const file = model.contextFor(target("file"));
    expect(file.files).toEqual(["C:\\Users\\you\\Documents\\budget-2027.xlsx"]);
    expect(model.attachedSummary(target("window"))).toEqual(["window title", "app name"]);
  });

  test("actions build fixed prompts without tools; questions may use tools", () => {
    const r = model.buildRequest(target("selection"), { actionId: "fix_grammar" });
    expect(r.prompt).toContain("Fix spelling");
    expect(r.allow_tools).toBe(false);
    expect(model.buildRequest(target("selection"), { actionId: "send_claude" }).provider).toBe("claude");
    const q = model.buildRequest(target("window"), { question: "minimise this" });
    expect(q.allow_tools).toBe(true);
    expect(q.provider).toBeUndefined();
  });

  test("local actions don't go through the AI", () => {
    const rows = [...model.rowsFor(target("link"), cfg).top, ...model.rowsFor(target("link"), cfg).more];
    const k = (id: string) => model.localKind(rows.find((r) => r.id === id)!);
    expect(k("copy_md")).toBe("copy");
    expect(k("shelf_add")).toBe("shelf");
    expect(k("summarize")).toBe("ai");
    expect(model.localKind({ id: "win:pin", label: "", icon: "", group: "window", risk: "low", windowAction: "pin" })).toBe("window");
    expect(model.markdownFor(target("link"))).toBe("[Calm technology — principles](https://calmtech.com/)");
    expect(model.markdownFor(target("file"))).toBe("`C:\\Users\\you\\Documents\\budget-2027.xlsx`");
  });

  test("inline result states follow the AI stream (approval → card, done → actions)", () => {
    let s: import("../ai/contract").AiRunState = { ...INITIAL_RUN, id: "q", status: "running" };
    s = reduceAiEvent(s, { kind: "delta", payload: { id: "q", text: "Hello" } } as never);
    expect(s.text).toBe("Hello");
    s = reduceAiEvent(s, {
      kind: "tool-proposal",
      payload: { id: "q", call_id: "c1", tool: "close_app", args: { app: "Word" }, summary: "Close Word", risk: "confirm" },
    } as never);
    expect(s.status).toBe("waiting");
    expect(pendingApprovals(s).map((x) => x.call_id)).toEqual(["c1"]);
    s = reduceAiEvent(s, { kind: "tool-result", payload: { id: "q", call_id: "c1", ok: true, message: "Closed." } } as never);
    expect(pendingApprovals(s)).toEqual([]);
    s = reduceAiEvent(s, { kind: "done", payload: { id: "q", provider: "local", model: "m" } } as never);
    expect(s.status).toBe("done");
  });

  test("tones, labels and latency", () => {
    expect(model.toneOf(target("selection"))).toBe("ok");
    expect(model.toneOf({ ...target("window"), detail: "admin" })).toBe("warn");
    expect(model.toneOf(target("desktop"))).toBe("quiet");
    expect(model.kindLabel("listItem")).toBe("Item");
    expect(model.openLatency(1000, 1047.4)).toBe(47);
    expect(model.openLatency(5000, 1000)).toBe(0);
    expect(model.appName(target("window"))).toBe("WINWORD");
  });
});

describe("desktop widgets on the desktop target", () => {
  test("Edit widgets… comes first on the desktop only while desktop widgets are on", () => {
    const desk = target("desktop");
    expect(ids(model.rowsFor(desk, cfg).top)).not.toContain("desk:widgets");
    const on = model.rowsFor(desk, cfg, DEFAULT_PREFS, {}, { ...model.NO_CAPS, desktopWidgets: true });
    expect(on.top[0]).toMatchObject({ id: "desk:widgets", windowAction: "desktop-widgets" });
    expect(model.localKind(on.top[0])).toBe("window");
    expect(ids(model.rowsFor(target("window"), cfg, DEFAULT_PREFS, {}, { ...model.NO_CAPS, desktopWidgets: true }).top)).not.toContain("desk:widgets");
  });
});
