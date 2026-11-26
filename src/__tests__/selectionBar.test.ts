// The Magic selection bar's view model (docs/plans/SELECTION_BAR.md): settings, what the bar shows
// and in which order, smart actions, hotkeys, presses, and the page-side rules.
import { describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

mock.module("@tauri-apps/api/core", () => ({ invoke: async () => null, transformCallback: () => 0 }));
mock.module("@tauri-apps/api/event", () => ({ listen: async () => () => {}, emit: async () => {} }));

const m = await import("../magic/selection/model");
const { holdLeft, PRESS_MIN_MS, press } = await import("../magic/selection/press");
const { CATALOG, DEFAULT_PREFS } = await import("../context/actions");
const { comboProblem, shortcutsFor } = await import("../keys/shortcuts");
const { sampleConfig } = await import("./fixtures");

const show = (o: Record<string, unknown> = {}) => ({ seq: 1, chars: 42, app: "C:\\Windows\\notepad.exe", category: "notes", cut: true, copy: true, paste: true, pastePreview: true, editable: true, smart: null, ...o }) as any;
const on = (o: Partial<typeof m.DEFAULT_BAR> = {}) => ({ ...m.DEFAULT_BAR, enabled: true, ...o });
const ROOT = join(import.meta.dir, "..", "..");

describe("selection bar settings", () => {
  test("off by default, with sensible defaults that match the backend", () => {
    const s = m.barSettings(sampleConfig());
    expect(s.enabled).toBe(false);
    expect(s.delayMs).toBe(120);
    expect(s.autoHideMs).toBe(4000);
    expect(s.hideDistancePx).toBe(120);
    expect(s.searchHotkey).toBe("");
    expect(s.hotkeys).toEqual({});
    // Same defaults as SelectionBarConfig::default() in src-tauri/src/config.rs.
    const rs = readFileSync(join(ROOT, "src-tauri/src/config.rs"), "utf8");
    const block = rs.slice(rs.indexOf("impl Default for SelectionBarConfig"));
    expect(block).toContain(`delay_ms: ${m.DEFAULT_BAR.delayMs},`);
    expect(block).toContain(`max_actions: ${m.DEFAULT_BAR.maxActions},`);
    for (const a of m.DEFAULT_BAR.actions) expect(block).toContain(`"${a}".into()`);
  });

  test("clamps values like the backend", () => {
    const s = m.barSettings({ selectionBar: { delayMs: 9000, maxActions: 50, minChars: 0, autoHideMs: 10, hideDistancePx: 1, labels: "loud", placement: "sideways" } } as any);
    expect([s.delayMs, s.maxActions, s.minChars, s.autoHideMs, s.hideDistancePx]).toEqual([600, 9, 1, 1500, 40]);
    expect([s.labels, s.placement]).toEqual(["hover", "below"]);
    expect(m.barSettings({ selectionBar: { autoHideMs: 0 } } as any).autoHideMs).toBe(0);
  });

  test("withBar changes only selectionBar", () => {
    const c = sampleConfig();
    const next = m.withBar(c, { enabled: true });
    expect((next as any).selectionBar.enabled).toBe(true);
    expect(next.dock).toBe(c.dock);
  });
});

describe("what the bar shows", () => {
  test("clipboard buttons follow what would work", () => {
    expect(m.barView(show(), on()).clipboard.map((b) => b.id)).toEqual(["cut", "copy", "paste"]);
    expect(m.barView(show({ cut: false, paste: false }), on()).clipboard.map((b) => b.id)).toEqual(["copy"]);
    expect(m.barView(show(), on()).clipboard.every((b) => b.backend)).toBe(true);
  });

  test("Magic Search is the one primary, labelled button", () => {
    const v = m.barView(show(), on());
    expect(v.search?.id).toBe("magic_search");
    expect(m.weightOf(v.search!)).toBe("heavy");
    expect(m.weightOf(v.clipboard[0])).toBe("medium");
    expect(m.barView(show(), on({ showSearch: false })).search).toBeNull();
  });

  test("your actions keep your order, respect the limit, and the rest go under More", () => {
    const v = m.barView(show(), on({ actions: ["translate", "ask", "shelf_add", "explain", "rewrite"], maxActions: 3 }));
    expect(v.actions.map((b) => b.id)).toEqual(["translate", "ask", "shelf_add"]);
    expect(v.more.map((b) => b.id).slice(0, 2)).toEqual(["explain", "rewrite"]);
    expect(v.more.some((b) => b.id === "ask")).toBe(false);
    // More holds the full selection list from the one catalogue.
    const all = m.barCatalogue().map((a) => a.id);
    expect(new Set([...v.actions, ...v.more].map((b) => b.id))).toEqual(new Set(all));
  });

  test("only catalogue actions marked for the bar (and custom prompt actions)", () => {
    const ids = m.barCatalogue().map((a) => a.id);
    for (const id of ids) expect(CATALOG.actions.find((a) => a.id === id)?.surfaces).toContain("selectionBar");
    expect(ids).not.toContain("magic_search");
    expect(ids).not.toContain("archive_save");
    const prefs = { ...DEFAULT_PREFS, custom: [{ id: "custom:tone", label: "Make it friendlier", prompt: "Rewrite {selection} warmly", contexts: ["selection"], provider: "local" as const }] };
    expect(m.barCatalogue(prefs).map((a) => a.id)).toContain("custom:tone");
    const v = m.barView(show(), on({ actions: ["custom:tone", "nope"] }), prefs);
    expect(v.actions.map((b) => b.id)).toEqual(["custom:tone"]);
  });

  test("learn from use floats frequent ones up (off by default)", () => {
    const usage = { shelf_add: 9, translate: 1 };
    expect(m.barView(show(), on({ actions: ["ask", "translate", "shelf_add"] }), DEFAULT_PREFS, usage).actions.map((b) => b.id)).toEqual(["ask", "translate", "shelf_add"]);
    expect(m.barView(show(), on({ actions: ["ask", "translate", "shelf_add"], learn: true }), DEFAULT_PREFS, usage).actions.map((b) => b.id)).toEqual(["shelf_add", "translate", "ask"]);
    expect(m.noteUse({}, "ask", on())).toEqual({});
    expect(m.noteUse({}, "ask", on({ learn: true }))).toEqual({ ask: 1 });
  });

  test("per-app action sets", () => {
    const s = on({ perApp: { "Code.exe": ["explain", "copy_md"] } });
    expect(m.barView(show({ app: "C:\\x\\code.exe" }), s).actions.map((b) => b.id)).toEqual(["explain", "copy_md"]);
    expect(m.barView(show(), s).actions.map((b) => b.id)).toEqual(m.DEFAULT_BAR.actions);
  });

  test("a smart action goes first, with the inline preview", () => {
    const smart = { kind: "url", preview: "example.com", value: "https://example.com", action: "smart:open_url" };
    const v = m.barView(show({ smart }), on());
    expect(v.actions[0].id).toBe("smart:open_url");
    expect(v.preview?.preview).toBe("example.com");
    expect(m.runFor(v.actions[0], v.preview)).toEqual({ type: "browser", url: "https://example.com" });
    const word = m.barView(show({ smart: { kind: "word", preview: "", value: "serendipity", action: "define" } }), on());
    expect(word.actions[0]).toMatchObject({ id: "define", kind: "smart" });
    expect(m.barView(show({ smart }), on({ smart: false })).preview).toBeNull();
    const maths = m.barView(show({ smart: { kind: "maths", preview: "= 42", value: "42", action: "smart:copy_result" } }), on());
    expect(m.runFor(maths.actions[0], maths.preview)).toEqual({ type: "backend", action: "smart:copy_result" });
  });

  test("what each press does", () => {
    const v = m.barView(show(), on({ actions: ["ask", "shelf_add", "command_open"] }));
    expect(m.runFor(v.clipboard[1], null)).toEqual({ type: "backend", action: "copy" });
    expect(m.runFor(v.search!, null)).toEqual({ type: "search" });
    expect(m.runFor(v.actions[0], null)).toEqual({ type: "answer", action: "ask" });
    expect(m.runFor(v.actions[1], null)).toEqual({ type: "backend", action: "shelf_add" });
    expect(m.runFor(v.actions[2], null)).toEqual({ type: "command", text: "" });
  });

  test("the backend's actions match selection_bar.rs", () => {
    const rs = readFileSync(join(ROOT, "src-tauri/src/commands/selection_bar.rs"), "utf8");
    for (const id of m.BACKEND_ACTIONS) if (!["cut", "copy", "paste"].includes(id)) expect(rs).toContain(`"${id}"`);
  });
});

describe("hotkeys, presses and motion", () => {
  test("hints and conflicts", () => {
    expect(m.hotkeyHint("Ctrl+Alt+T")).toBe("⌃⌥T");
    expect(m.hotkeyHint("")).toBe("");
    const s = on({ hotkeys: { translate: "Ctrl+Alt+T" } });
    const sheet = (c: string) => comboProblem(c, "bar:x", shortcutsFor(sampleConfig()));
    expect(m.barHotkeyProblem("Ctrl+Alt+S", "ask", s, sheet)?.level).toBe("block"); // tiling
    expect(m.barHotkeyProblem("Ctrl+Alt+Space", "ask", s, sheet)?.level).toBe("block"); // Command
    expect(m.barHotkeyProblem("ctrl+alt+t", "ask", s, sheet)?.message).toContain("translate");
    expect(m.barHotkeyProblem("Ctrl+Alt+T", "translate", s, sheet)).toBeNull();
    expect(m.barHotkeyProblem("Win+L", "ask", s, sheet)?.level).toBe("block");
    expect(m.barHotkeyProblem("Ctrl+C", "ask", s, sheet)?.level).toBe("note");
    expect(m.barHotkeyProblem("", "ask", s, sheet)).toBeNull();
  });

  test("bar hotkeys show on the shortcuts sheet (none by default)", () => {
    const c = sampleConfig();
    expect(shortcutsFor(c).some((x) => x.id.startsWith("bar:") || x.id === "magic-search")).toBe(false);
    const withKeys = m.withBar(c, { searchHotkey: "Ctrl+Alt+G", hotkeys: { translate: "Ctrl+Alt+T" } });
    const all = shortcutsFor(withKeys);
    expect(all.find((x) => x.id === "magic-search")?.keys).toBe("Ctrl+Alt+G");
    expect(all.find((x) => x.id === "bar:translate")?.keys).toBe("Ctrl+Alt+T");
    // Another Lens shortcut can't take them.
    expect(comboProblem("Ctrl+Alt+G", "widgets", all)?.level).toBe("block");
  });

  test("the conflict list mirrors magic/conflicts.rs", () => {
    const rs = readFileSync(join(ROOT, "src-tauri/src/magic/conflicts.rs"), "utf8");
    const block = rs.slice(rs.indexOf("pub const LENS_HOTKEYS"), rs.indexOf("];", rs.indexOf("pub const LENS_HOTKEYS")));
    const keys = [...block.matchAll(/"([a-z+]+)"/g)].map((x) => x[1]);
    expect(keys.length).toBe(m.LENS_HOTKEYS.length);
    for (const k of keys) expect(m.LENS_HOTKEYS.map((x) => x.toLowerCase())).toContain(k);
  });

  test("a press is held long enough to be seen", () => {
    expect(PRESS_MIN_MS).toBeGreaterThanOrEqual(90);
    expect(holdLeft(1000, 1010)).toBe(80);
    expect(holdLeft(1000, 1200)).toBe(0);
    expect(holdLeft(1000, 990)).toBe(90);
    expect(press("heavy")["data-weight"]).toBe("heavy");
    expect(press()["data-weight"]).toBe("medium");
  });

  test("rises 4 px from the selection end; Esc hides from the page", () => {
    expect(m.riseFrom(false)).toBe(4);
    expect(m.riseFrom(true)).toBe(-4);
    expect(m.pageKey("Escape")).toBe("hide");
    expect(m.pageKey("a")).toBe("none");
  });

  test("editing your list", () => {
    expect(m.moveAction(["a", "b", "c"], "b", -1)).toEqual(["b", "a", "c"]);
    expect(m.moveAction(["a", "b"], "a", -1)).toEqual(["a", "b"]);
    expect(m.addAction(["a"], "a")).toEqual(["a"]);
    expect(m.addAction(Array.from({ length: 9 }, (_, i) => `x${i}`), "y").length).toBe(9);
  });

  test("bar files use tokens and matte surfaces only", () => {
    for (const f of ["src/magic/selection/selectionBar.css", "src/magic/search/magicSearch.css"]) {
      const css = readFileSync(join(ROOT, f), "utf8");
      expect(css).not.toMatch(/backdrop-filter|filter:\s*blur/);
      expect(css).not.toMatch(/transition:\s*all/);
    }
    for (const f of ["src/magic/selection/SelectionBar.tsx", "src/magic/search/MagicSearch.tsx", "src/magic/selection/SelectionBarCard.tsx"]) {
      expect(readFileSync(join(ROOT, f), "utf8")).not.toMatch(/\stitle=/);
    }
  });
});
