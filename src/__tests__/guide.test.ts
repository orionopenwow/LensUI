// Lens Guide: index freshness and completeness, search accuracy on 40 golden questions, lessons,
// conditions, grounding (no invented settings), progress and tips.
import { describe, expect, mock, test } from "bun:test";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

mock.module("@tauri-apps/api/core", () => ({ invoke: async () => { throw new Error("no backend"); }, transformCallback: () => 0 }));
mock.module("@tauri-apps/api/event", () => ({ listen: async () => () => {}, emit: async () => {} }));

const ROOT = join(import.meta.dir, "../..");
// @ts-ignore plain JS build tool
const { buildIndex, extractMounts, extractTabs, pageFiles } = await import("../../tools/guide/extract.mjs");
// @ts-ignore plain JS build tool
const { parseLesson, parseTarget } = await import("../../tools/guide/lessons.mjs");
const { GuideSearch, normalizeQuestion, tokenize } = await import("../guide/search");
const { evaluate, safeEvaluate, validate } = await import("../guide/conditions");
const { answerOffline, buildGroundedPrompt, parseCitations, showMeTargets } = await import("../guide/answer");
const { markStep, skipStep, resetLesson, lessonPercent, currentStep, normalizeProgress } = await import("../guide/progress");
const { didYouKnow, tipOfTheDay, suggestedQuestions } = await import("../guide/tips");
const { GUIDE_ANCHORS } = await import("../guide/anchors");
const { GOLDEN } = await import("./guideGolden");
import type { GuideIndex, GuideProgress, GuideState, Lesson } from "../guide/types";
import { EMPTY_PROGRESS } from "../guide/types";

const committed: GuideIndex = JSON.parse(readFileSync(join(ROOT, "src/guide/index.json"), "utf8"));
const fresh: GuideIndex = buildIndex(ROOT);

describe("index", () => {
  test("committed index matches the sources (run node tools/guide/build-index.mjs)", () => {
    expect(JSON.stringify(committed)).toBe(JSON.stringify(fresh));
  });

  test("TS module carries the same data", () => {
    const ts = readFileSync(join(ROOT, "src/guide/indexData.ts"), "utf8");
    expect(ts).toContain(JSON.stringify(fresh));
  });

  test("ids are unique and every entry has a title, path and source", () => {
    const ids = new Set<string>();
    for (const e of fresh.entries) {
      expect(ids.has(e.id)).toBe(false);
      ids.add(e.id);
      expect(e.title.length).toBeGreaterThan(0);
      expect(e.path.length).toBeGreaterThan(0);
      expect(existsSync(join(ROOT, e.source))).toBe(true);
    }
  });

  test("every settings card mounted in a visible tab is indexed", () => {
    const tabs = new Set(extractTabs(ROOT).map((t: { id: string }) => t.id));
    const cards = new Set(fresh.entries.filter((e) => e.kind === "card").map((e) => `${e.target?.tab}:${e.target?.card}`));
    const mounts = extractMounts(ROOT) as { component: string; tabs: string[] }[];
    const expected: string[] = [];
    const visit = (m: { component: string; tabs: string[] }) => {
      const tab = m.tabs.find((t) => tabs.has(t));
      if (!tab || m.component === "PackCard") return;
      if (/Tab$/.test(m.component)) {
        const file = ["src/themeux", "src/components"].map((d) => `${d}/${m.component}.tsx`).find((f) => existsSync(join(ROOT, f)));
        if (file) for (const inner of extractMounts(ROOT, file, { tabs: m.tabs, section: null }) as typeof mounts) if (inner.component !== m.component) visit({ ...inner, tabs: m.tabs });
        return;
      }
      expected.push(`${tab}:${m.component}`);
    };
    mounts.forEach(visit);
    // Settings hub pages live in their own files.
    for (const p of pageFiles(ROOT) as { tab: string; file: string }[])
      for (const m of extractMounts(ROOT, p.file, { tabs: [p.tab], section: null }) as typeof mounts) visit({ ...m, tabs: [p.tab] });
    expect(expected.length).toBeGreaterThan(20);
    const missing = expected.filter((k) => !cards.has(k));
    expect(missing).toEqual([]);
  });

  test("covers every theme pack, dock style, Playground scene and lesson", () => {
    const kinds = (k: string) => fresh.entries.filter((e) => e.kind === k).length;
    expect(kinds("pack")).toBeGreaterThanOrEqual(18);
    expect(kinds("dock-style")).toBe(7);
    expect(kinds("scene")).toBeGreaterThanOrEqual(8);
    expect(kinds("command")).toBeGreaterThanOrEqual(20);
    expect(kinds("lesson")).toBe(fresh.lessons.length);
  });

  test("developer docs stay out of user help", () => {
    for (const e of fresh.entries.filter((x) => x.kind === "doc")) {
      expect(e.source).not.toMatch(/INTEGRATION_NOTES|FEATURE_RESEARCH|COMPETITIVE_STRATEGY|CORE_PATCH_PLAN/);
      expect(e.title).not.toMatch(/wiring|snippet/i);
    }
  });

  test("settings targets point at visible tabs", () => {
    const tabs = new Set(fresh.tabs.map((t) => t.id));
    for (const e of fresh.entries) if (e.target?.surface === "settings" && e.target.tab) expect(tabs.has(e.target.tab)).toBe(true);
  });
});

describe("search", () => {
  const s = new GuideSearch(fresh);
  test("40 golden how-do-I questions put the right answer first", () => {
    const misses: string[] = [];
    for (const [q, want] of GOLDEN) {
      const wants = Array.isArray(want) ? want : [want];
      for (const w of wants) expect(fresh.entries.some((e) => e.id === w)).toBe(true);
      const top = s.search(q, { limit: 1 })[0]?.entry.id;
      if (!wants.includes(top ?? "")) misses.push(`${q} → ${top} (want ${wants.join(" | ")})`);
    }
    expect(GOLDEN.length).toBe(40);
    expect(misses).toEqual([]);
  });

  test("question wrappers and stop words are stripped", () => {
    expect(normalizeQuestion("Hey Lens, how do I make the dock thinner?")).toBe("make the dock thinner");
    expect(tokenize("the Mouse cursors")).toEqual(["pointer", "pointer"]);
  });

  test("kind filter and empty query", () => {
    expect(s.search("", {})).toEqual([]);
    expect(s.search("dock", { kinds: ["dock-style"] }).every((h) => h.entry.kind === "dock-style")).toBe(true);
  });
});

describe("lessons", () => {
  test("ships the 11 lessons, each parseable, unique and with real steps", () => {
    expect(fresh.lessons.length).toBe(11);
    const ids = new Set(fresh.lessons.map((l) => l.id));
    expect(ids.size).toBe(11);
    for (const id of ["first-five-minutes", "make-it-yours", "windows-like-a-pro", "living-desktop", "command-and-shelf", "right-click-everything", "voice-control", "browser-and-approvals", "ai-privacy", "undo-anything", "keyboard-map"]) expect(ids.has(id)).toBe(true);
    for (const l of fresh.lessons) {
      expect(l.steps.length).toBeGreaterThanOrEqual(3);
      for (const st of l.steps) expect(st.text.length).toBeGreaterThan(20);
    }
  });

  test("every check and requires condition parses", () => {
    for (const l of fresh.lessons) {
      if (l.requires) validate(l.requires);
      for (const st of l.steps) if (st.check) validate(st.check);
    }
  });

  test("every Show me in a lesson points at something in the index", () => {
    const byTab = new Map<string, Set<string>>();
    for (const e of fresh.entries) if (e.target?.surface === "settings" && e.target.tab) {
      if (!byTab.has(e.target.tab)) byTab.set(e.target.tab, new Set());
      byTab.get(e.target.tab)!.add(e.title.toLowerCase());
    }
    const bad: string[] = [];
    for (const l of fresh.lessons) {
      if (l.requires) continue; // gated lessons may name features from a later build
      for (const st of l.steps) {
        const t = st.target;
        if (!t) continue;
        if (t.surface === "settings") {
          if (t.tab && !byTab.has(t.tab)) bad.push(`${l.id}: tab ${t.tab}`);
          if (t.label && !byTab.get(t.tab!)?.has(t.label.toLowerCase())) bad.push(`${l.id}: ${t.tab}:${t.label}`);
        } else if (t.anchor && !GUIDE_ANCHORS[t.anchor]) bad.push(`${l.id}: anchor ${t.anchor}`);
      }
    }
    expect(bad).toEqual([]);
  });

  test("step anchors are declared", () => {
    for (const l of fresh.lessons) for (const st of l.steps) if (st.anchor) expect(GUIDE_ANCHORS[st.anchor]).toBeTruthy();
  });

  test("anchors exist in the components once the anchors snippet is applied", () => {
    const files: string[] = [];
    const walk = (d: string) => {
      for (const f of readdirSync(join(ROOT, d), { withFileTypes: true })) {
        if (f.isDirectory()) walk(`${d}/${f.name}`);
        else if (/\.tsx$/.test(f.name)) files.push(`${d}/${f.name}`);
      }
    };
    walk("src");
    // The drawer root is the one anchor that lives in src/guide.
    const src = files.filter((f) => !f.startsWith("src/guide/") || f.endsWith("GuideDrawer.tsx")).map((f) => readFileSync(join(ROOT, f), "utf8")).join("\n");
    const present = new Set([...src.matchAll(/data-guide-id="([a-z0-9.-]+)"/g)].map((m) => m[1]));
    if (present.size === 0) return; // snippet not applied yet: label matching covers Settings
    for (const a of Object.keys(GUIDE_ANCHORS)) expect(present.has(a)).toBe(true);
  });

  test("parser: front-matter, step keys and errors", () => {
    const l = parseLesson(`---\nid: demo\ntitle: Demo\nsummary: S\n---\n\n## One\nshow: settings:dock:Dock style\ncheck: config.dock.style == slim\nsuccess: Yes\n\nDo the thing.\n\n## Two\nNo keys here.\n`, "demo.md");
    expect(l.steps.length).toBe(2);
    expect(l.steps[0].target).toEqual({ surface: "settings", tab: "dock", label: "Dock style" });
    expect(l.steps[0].check).toBe("config.dock.style == slim");
    expect(l.steps[0].text).toBe("Do the thing.");
    expect(l.steps[1].check).toBeUndefined();
    expect(() => parseLesson("no front matter", "x")).toThrow();
    expect(() => parseLesson("---\nid: Bad Id\ntitle: t\nsummary: s\n---\n## a\nx", "x")).toThrow();
    expect(() => parseTarget("nowhere:x")).toThrow();
    expect(parseTarget("dock:dock.search")).toEqual({ surface: "dock", anchor: "dock.search" });
  });
});

describe("conditions", () => {
  const st = (config: unknown, ui: GuideState["ui"] = {}, events: string[] = []): GuideState => ({ config, ui, events: new Set(events) });
  test("comparisons, exists, events, && and ||", () => {
    const s = st({ dock: { style: "slim", iconSize: 40 }, ai: { enabled: true } }, { tab: "theme" }, ["palette-opened"]);
    expect(evaluate("config.dock.style == slim", s)).toBe(true);
    expect(evaluate("config.dock.style == SLIM", s)).toBe(true);
    expect(evaluate("config.dock.style != floating", s)).toBe(true);
    expect(evaluate("config.dock.iconSize >= 40", s)).toBe(true);
    expect(evaluate("config.dock.iconSize < 40", s)).toBe(false);
    expect(evaluate("config.ai.enabled == true && ui.tab == theme", s)).toBe(true);
    expect(evaluate("config.voice exists || event:palette-opened", s)).toBe(true);
    expect(evaluate("config.voice exists", s)).toBe(false);
    expect(evaluate('config.dock.style == "slim"', s)).toBe(true);
    expect(evaluate("true", s)).toBe(true);
  });
  test("missing paths are false, bad input throws, safeEvaluate never throws", () => {
    const s = st({});
    expect(evaluate("config.a.b.c == 1", s)).toBe(false);
    expect(() => evaluate("window.alert == 1", s)).toThrow();
    expect(() => evaluate("config.x ~ 1", s)).toThrow();
    expect(safeEvaluate("config.x ~ 1", s)).toBe(false);
    expect(safeEvaluate(null, s)).toBe(false);
  });
});

describe("answers are grounded", () => {
  test("offline answers return up to 3 cards with real targets", () => {
    const a = answerOffline(fresh, "how do I change my mouse pointer");
    expect(a.coverage).toBe("good");
    expect(a.cards.length).toBeGreaterThan(0);
    expect(a.cards.length).toBeLessThanOrEqual(3);
    const ids = new Set(fresh.entries.map((e) => e.id));
    for (const c of a.cards) expect(ids.has(c.entry.id)).toBe(true);
  });

  test("questions the index doesn't cover say so", () => {
    const a = answerOffline(fresh, "qwzxv plorf");
    expect(a.coverage).toBe("none");
    expect(a.cards).toEqual([]);
  });

  test("citations to snippets that don't exist are dropped, and Show me only uses index targets", () => {
    const hits = answerOffline(fresh, "dim inactive windows").passages;
    const g = buildGroundedPrompt("dim inactive windows", hits);
    expect(g.prompt).toContain("ONLY");
    expect(g.contextText).toContain("[1]");
    const parsed = parseCitations("Turn on Dim inactive windows [1]. Also the Hyper Mode switch [9] and [42].", g.sources.slice(0, 3));
    expect(parsed.citations.length).toBe(1);
    expect(parsed.dropped).toEqual([9, 42]);
    expect(parsed.text).not.toContain("[9]");
    const targets = showMeTargets(fresh, parsed);
    const known = new Set(fresh.entries.map((e) => JSON.stringify(e.target)));
    for (const t of targets) expect(known.has(JSON.stringify(t))).toBe(true);
  });

  test("every golden answer's Show me resolves to an index entry", () => {
    const known = new Set(fresh.entries.filter((e) => e.target).map((e) => JSON.stringify(e.target)));
    for (const [q] of GOLDEN) for (const c of answerOffline(fresh, q).cards) if (c.target) expect(known.has(JSON.stringify(c.target))).toBe(true);
  });

  test("grounded prompt stays under the context budget", () => {
    const g = buildGroundedPrompt("x", fresh.entries.slice(0, 200));
    expect(g.contextText.length).toBeLessThanOrEqual(6000);
  });
});

describe("progress", () => {
  const lesson = fresh.lessons.find((l) => l.id === "make-it-yours") as Lesson;
  test("marking steps advances and completes", () => {
    let p: GuideProgress = { ...EMPTY_PROGRESS };
    expect(currentStep(p, lesson)).toBe(1);
    p = markStep(p, lesson, 1);
    expect(currentStep(p, lesson)).toBe(2);
    expect(lessonPercent(p, lesson)).toBe(Math.round(100 / lesson.steps.length));
    for (const s of lesson.steps) p = markStep(p, lesson, s.n);
    expect(p.completed).toContain(lesson.id);
    expect(lessonPercent(p, lesson)).toBe(100);
    p = resetLesson(p, lesson.id);
    expect(lessonPercent(p, lesson)).toBe(0);
  });
  test("skipping moves on and finishes at the end", () => {
    let p: GuideProgress = { ...EMPTY_PROGRESS };
    for (const s of lesson.steps) p = skipStep(p, lesson, s.n);
    expect(p.completed).toContain(lesson.id);
  });
  test("normalize drops junk and defaults the Guide off", () => {
    const p = normalizeProgress({ steps: { a: [1, 1, "x", 0, 2] }, completed: ["a", 5], current: { a: -1 }, tipOfTheDay: "yes" });
    expect(p.enabled).toBe(false);
    expect(p.steps.a).toEqual([1, 2]);
    expect(p.completed).toEqual(["a"]);
    expect(p.current).toEqual({});
    expect(p.tipOfTheDay).toBe(false);
    expect(normalizeProgress(null)).toEqual(EMPTY_PROGRESS);
  });
});

describe("tips and suggestions", () => {
  test("Did you know only suggests unused features with real entries", () => {
    const tips = didYouKnow({ altDrag: { enabled: true } }, EMPTY_PROGRESS, fresh, 99);
    expect(tips.find((t) => t.id === "alt-drag")).toBeUndefined();
    const ids = new Set(fresh.entries.map((e) => e.id));
    for (const t of tips) expect(ids.has(t.entry)).toBe(true);
    const dismissed = didYouKnow({}, { ...EMPTY_PROGRESS, dismissedTips: ["hot-corners"] }, fresh, 99);
    expect(dismissed.find((t) => t.id === "hot-corners")).toBeUndefined();
  });
  test("tip of the day is off by default and stable for a day", () => {
    expect(tipOfTheDay({}, EMPTY_PROGRESS, fresh)).toBeNull();
    const on = { ...EMPTY_PROGRESS, tipOfTheDay: true };
    const d = new Date("2026-11-22T10:00:00Z");
    expect(tipOfTheDay({}, on, fresh, d)?.id).toBe(tipOfTheDay({}, on, fresh, new Date("2026-11-22T20:00:00Z"))?.id);
  });
  test("suggested questions fit the context and are answerable", () => {
    for (const ctx of [{}, { tab: "theme" }, { tab: "dock" }, { tab: "ai" }, { tab: "system" }, { tab: "sessions" }, { surface: "command" }]) {
      const qs = suggestedQuestions(ctx);
      expect(qs.length).toBe(3);
      for (const q of qs) expect(answerOffline(fresh, q).coverage).not.toBe("none");
    }
  });
});
