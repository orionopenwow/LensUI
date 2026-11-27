// Lens Magic Search's view model (docs/plans/SELECTION_BAR.md §3.4).
import { describe, expect, mock, test } from "bun:test";

mock.module("@tauri-apps/api/core", () => ({ invoke: async () => null, transformCallback: () => 0 }));
mock.module("@tauri-apps/api/event", () => ({ listen: async () => () => {}, emit: async () => {} }));

const m = await import("../magic/search/model");
const cmd = await import("../magic/search/command");

const r = (n: number, sources = ["duckduckgo"]) => ({ title: `Result ${n}`, url: `https://site${n}.com/p`, snippet: `Snippet ${n}`, site: `site${n}.com`, favicon: "", sources });
const prov = (o: Record<string, unknown>) => ({ id: "local", kind: "local", label: "Ollama", available: true, model: "llama3.2", is_local: true, needs_key: false, has_key: false, ...o }) as any;
const status = (providers: any[], active = "local", privacy = "ask_each_time") => ({ providers, active, privacy }) as any;

describe("who answers", () => {
  const local = prov({});
  const claude = prov({ id: "claude", kind: "claude", label: "Claude", is_local: false, needs_key: true, has_key: true, model: "claude-sonnet" });

  test("local when it's there, else the configured AI", () => {
    expect(m.pickProvider(status([local, claude], "claude"))?.id).toBe("local");
    expect(m.pickProvider(status([claude], "claude"))?.id).toBe("claude");
    expect(m.pickProvider(status([local, claude], "claude"), "claude")?.id).toBe("claude");
    expect(m.pickProvider(status([claude], "claude"), "local")).toBeNull();
    expect(m.pickProvider(status([local], "off"))).toBeNull();
    expect(m.pickProvider(null)).toBeNull();
  });

  test("the panel says who answered and whether the selection leaves the PC", () => {
    const l = m.answerGate(status([local]), "default", false);
    expect(l.gate).toBe("ok");
    expect(l.line).toContain("on this PC");
    const c = m.answerGate(status([claude], "claude", "ask_each_time"), "default", false);
    expect(c.gate).toBe("consent");
    const ok = m.answerGate(status([claude], "claude", "ask_each_time"), "default", true);
    expect(ok.gate).toBe("ok");
    expect(ok.cloud).toBe(true);
    expect(ok.line).toContain("(cloud)");
    expect(m.answerGate(status([claude], "claude", "local_only"), "default", true).gate).toBe("blocked");
    expect(m.answerGate(null, "default", false).gate).toBe("no-provider");
  });
});

describe("the prompt", () => {
  test("numbered web sources, never local results; the selection is the context", () => {
    const req = m.buildRequest({ query: "calm technology", results: [r(1), r(2)] });
    expect(req.prompt).toContain("[1] Result 1 — https://site1.com/p");
    expect(req.prompt).toContain("cite them like [1]");
    expect(req.context).toEqual({ selection: "calm technology" });
    expect(req.allow_tools).toBe(false);
    expect(m.buildRequest({ query: "x" }).prompt).not.toContain("Sources:");
  });

  test("actions use the catalogue prompt; follow-ups carry the thread", () => {
    expect(m.buildRequest({ query: "bonjour", action: "translate" }).prompt).toContain("Translate");
    const f = m.buildRequest({ query: "q", thread: [{ q: "q", a: "first answer" }], followUp: "and why?" });
    expect(f.prompt).toContain("A: first answer");
    expect(f.prompt).toContain("Follow-up question: and why?");
    expect(m.buildRequest({ query: "q", provider: { id: "claude" } as any }).provider).toBe("claude");
    expect(m.buildRequest({ query: "q", provider: { id: "script" } as any }).provider).toBeUndefined();
  });
});

describe("citations and copying", () => {
  const results = [r(1), r(2), r(3)];
  test("cited numbers in order, only real ones", () => {
    expect(m.citedNumbers("A [2] and B [1, 3] and [9].", 3)).toEqual([2, 1, 3]);
    expect(m.citedNumbers("none", 3)).toEqual([]);
  });

  test("copy with or without sources", () => {
    const a = "Calm tech stays in the periphery [2]. It informs [1].";
    expect(m.copyText(a, results, false)).toBe("Calm tech stays in the periphery. It informs.");
    const w = m.copyText(a, results, true);
    expect(w).toContain("Sources:\n[2] Result 2 — https://site2.com/p\n[1] Result 1");
    expect(m.copyText("plain", [], true)).toBe("plain");
  });

  test("answer parts turn markers into chips", () => {
    expect(m.answerParts("x [1] y [7]", 2)).toEqual([{ t: "text", v: "x " }, { t: "cite", n: 1 }, { t: "text", v: " y [7]" }]);
  });
});

describe("local results and smart cards", () => {
  test("local matches: word overlap, best first, a few per kind", () => {
    const items = [
      { kind: "shelf", id: "1", title: "Calm technology notes", detail: "periphery" },
      { kind: "clip", id: "2", title: "Shopping list", detail: "milk" },
      { kind: "file", id: "3", title: "calm-technology.pdf", detail: "C:\\docs\\calm-technology.pdf", target: "C:\\docs\\calm-technology.pdf" },
      { kind: "shelf", id: "4", title: "Technology radar", detail: "" },
    ] as any;
    const got = m.localMatches("calm technology principles", items);
    expect(got.map((x) => x.id)).toEqual(["1", "3"]);
    expect(m.localMatches("calm technology", items, 1).filter((x) => x.kind === "shelf").length).toBe(1);
    expect(m.localMatches("a an", items)).toEqual([]);
  });

  test("cheap cards", () => {
    expect(m.smartCards("12 * 3.5")).toEqual([{ type: "maths", expr: "12 * 3.5", result: "42" }]);
    expect(m.evalMaths("(1 + 2) ^ 3")).toBe(27);
    expect(m.evalMaths("2 ^ 3 ^ 2")).toBe(512);
    expect(m.evalMaths("1 / 0")).toBeNull();
    expect(m.evalMaths("12,480")).toBeNull();
    expect(m.evalMaths("alert(1)")).toBeNull();
    expect(m.smartCards("5 km")[0]).toEqual({ type: "convert", from: "5 km", to: "3.1069 mi" });
    expect(m.smartCards("serendipity")[0]).toEqual({ type: "define", word: "serendipity" });
    expect(m.smartCards("Привет, как дела")[0]).toEqual({ type: "translate", script: "Cyrillic" });
    expect(m.smartCards("const add = (a, b) => a + b;").some((c) => c.type === "code")).toBe(true);
    expect(m.smartCards("The quarterly numbers were fine")).toEqual([]);
  });

  test("sections, fast first; only my files", () => {
    const web = { results: [], sources: [], engineUrl: "", engineName: "", stub: false };
    expect(m.sections({ answerable: true, cards: 1, web, webOn: true, local: 2, onlyMine: false })).toEqual(["answer", "cards", "web", "local"]);
    expect(m.sections({ answerable: true, cards: 1, web, webOn: true, local: 0, onlyMine: true })).toEqual(["local"]);
    expect(m.sections({ answerable: false, cards: 0, web: null, webOn: false, local: 0, onlyMine: false })).toEqual([]);
  });

  test("small helpers", () => {
    expect(m.refine("calm tech", "  history ")).toBe("calm tech history");
    expect(m.monogram("www.example.com")).toBe("E");
    expect(m.sourceLine(r(1, ["duckduckgo", "wikipedia"]))).toBe("site1.com · DuckDuckGo, Wikipedia");
    expect(m.STAGGER_FIRST).toBe(6);
  });
});

describe("Command: magic search …", () => {
  test("phrases", () => {
    expect(cmd.magicSearchQuery("magic search calm technology")).toBe("calm technology");
    expect(cmd.magicSearchQuery("Magic Search for “ICE trains”")).toBe("ICE trains");
    expect(cmd.magicSearchQuery("/magicsearch rust lifetimes")).toBe("rust lifetimes");
    expect(cmd.magicSearchQuery("lens search weather")).toBe("weather");
    expect(cmd.magicSearchQuery("magic search")).toBeNull();
    expect(cmd.magicSearchQuery("search my files for tax")).toBeNull();
    expect(cmd.isSearchThat("search that")).toBe(true);
    expect(cmd.isSearchThat("magic search the selection.")).toBe(true);
    expect(cmd.isSearchThat("search the web")).toBe(false);
  });
});
