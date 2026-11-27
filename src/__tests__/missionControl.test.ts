// Lens Mission Control view models (docs/MISSION_CONTROL.md) and its dev-only gating.
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { decide, fromCatalog, fromIdeas, fromLeft, fromQuickWins, mergeSuggestions, queueMarkdown, rankSuggestions, slug, type Decisions } from "../missioncontrol/model/suggestions";
import { buildChecklist, commentFor, dossierPatch, setResult, summarize } from "../missioncontrol/model/checks";
import { filterInbox, fromBrain, fromCrashes, fromIssues, mergeInbox, openBySeverity, severityOf } from "../missioncontrol/model/inbox";
import { addTrendPoint, ago, board, buildBrief, ciHealth, devFolderLine, trendDelta } from "../missioncontrol/model/pulse";
import { inline, searchDocs, toBlocks } from "../missioncontrol/model/brain";
import { bumps, releaseChecklist, validTag } from "../missioncontrol/model/release";
import { ALL_PAGES, NAV, pageForDigit, stepPage } from "../missioncontrol/nav";
import { isMissionControlPhrase } from "../command/missionPhrase";
import type { IdeaRow, Pr } from "../missioncontrol/model/types";

const ROOT = join(import.meta.dir, "..", "..");
const idea = (rank: number, text: string, score: number, effort = "S", status = "Missing", seen = ["2026-11-26"]): IdeaRow => ({ rank, idea: text, area: "Dock", score, status, effort, risk: "low", seen, files: "" });
const pr = (n: number, verdict: Pr["status"]["verdict"], extra: Partial<Pr> = {}): Pr => ({
  number: n, title: `PR ${n}`, headRef: `feature/${n}`, baseRef: "main", headSha: "a".repeat(40), draft: false, mergeableState: "clean", realPc: [], checks: [], updatedAt: `2026-11-2${n % 10}`,
  status: { number: n, verdict, running: 0, e2eOk: 1, failing: [], reasons: verdict === "BLOCKED" ? ["Windows build failed"] : [] }, ...extra,
});

describe("suggestions: merge and rank", () => {
  test("sources become one list, duplicates merge and gain rank", () => {
    const a = fromIdeas([idea(1, "Split `DockSurface.tsx`", 14), idea(2, "Already there", 20, "S", "Have")]);
    expect(a.map((s) => s.title)).toEqual(["Split `DockSurface.tsx`"]);
    const q = fromQuickWins([{ feature: "Dock", file: "dock.md", status: "works", quickWin: "Split DockSurface.tsx", topBug: "", idea: "" }]);
    const merged = mergeSuggestions([a, q]);
    expect(merged.length).toBe(1);
    expect(merged[0].sources).toEqual(["research", "quick-win"]);
    expect(merged[0].rank).toBe(Math.min(100, Math.max(70, 60) + 5));
    expect(slug("Split `DockSurface.tsx` (context menu first)")).toBe("split-docksurface-tsx");
  });

  test("effort, deferral and rejection change the order", () => {
    const list = mergeSuggestions([fromIdeas([idea(1, "Big one", 12, "L"), idea(2, "Small one", 12, "S"), idea(3, "Third", 10, "M")])]);
    expect(rankSuggestions(list, {}).map((s) => s.title)).toEqual(["Small one", "Big one", "Third"]);
    let d: Decisions = decide({}, list[1], "deferred", undefined, new Date("2026-11-26"));
    expect(rankSuggestions(list, d)[2].title).toBe("Small one");
    expect(() => decide(d, list[0], "rejected", "  ")).toThrow();
    d = decide(d, list[0], "rejected", "Not before 1.0", new Date("2026-11-26"));
    expect(rankSuggestions(list, d).map((s) => s.title)).not.toContain("Big one");
    expect(rankSuggestions(list, d, true).find((s) => s.title === "Big one")?.decision?.reason).toBe("Not before 1.0");
  });

  test("combinator and left lists", () => {
    const c = fromCatalog([
      { project: "Ollama", repo: "ollama/ollama", licence: "MIT", mode: "Bridge", score: 88, status: "Catalogued", hooks: "", lastSeen: "" },
      { project: "Done", repo: "x", licence: "MIT", mode: "Link", score: 90, status: "Built", hooks: "", lastSeen: "" },
      { project: "Low", repo: "x", licence: "MIT", mode: "Link", score: 40, status: "Catalogued", hooks: "", lastSeen: "" },
    ]);
    expect(c.map((s) => s.title)).toEqual(["Bridge: Ollama"]);
    const l = fromLeft([{ section: "Left", text: "Wallpaper: folder picker dialog.", done: false }, { section: "Left", text: "Done", done: true }], "dossier");
    expect(l.map((s) => s.title)).toEqual(["Wallpaper"]);
  });

  test("QUEUE.md lists queued and rejected with reasons", () => {
    const list = fromIdeas([idea(1, "Weekly canary | run", 12)]);
    const d = decide(decide({}, list[0], "accepted", undefined, new Date("2026-11-26")), { ...list[0], id: "research:other" }, "rejected", "Covered by #74", new Date("2026-11-26"));
    const md = queueMarkdown(d, list, "2026-11-26");
    expect(md).toContain("## Queued");
    expect(md).toContain("Weekly canary \\| run");
    expect(md).toContain("## Rejected (don't re-suggest)");
    expect(md).toContain("Covered by #74");
  });
});

describe("real-PC checklist", () => {
  const items = () =>
    buildChecklist(
      [{ number: 118, url: "u", realPc: [{ section: "Needs a real PC", text: "Halo goes away with transparency off", done: false }] }],
      [{ number: 120, title: "x", mergedAt: "2026-11-26", realPc: [{ section: "s", text: "Glow breathes", done: true }] }],
      [{ source: "docs/features/dock.md", item: { section: "s", text: "Needs a real-PC check with two monitors", done: false } }],
      {}
    );
  test("collects every source once with stable ids", () => {
    const a = items();
    expect(a.map((i) => i.kind)).toEqual(["pr", "merged", "dossier"]);
    expect(a[0].id).toBe(items()[0].id);
    expect(summarize(a)).toEqual({ todo: 2, pass: 1, fail: 0, skip: 0, total: 3 });
  });
  test("results, comment and dossier patch", () => {
    const a = items();
    let r = setResult({}, a[0].id, { state: "fail", notes: "halo stays" }, new Date("2026-11-26"));
    r = setResult(r, a[2].id, { state: "pass" }, new Date("2026-11-26"));
    const b = buildChecklist([{ number: 118, url: "u", realPc: [{ section: "s", text: "Halo goes away with transparency off", done: false }] }], [], [{ source: "docs/features/dock.md", item: { section: "s", text: "Needs a real-PC check with two monitors", done: false } }], r);
    const c = commentFor(b.filter((i) => i.kind === "pr"));
    expect(c).toContain("**Fail**: halo stays");
    expect(c).toContain("1 failed");
    const md = "# Dock\n\nNeeds a real-PC check with two monitors at different scaling.\n";
    const patched = dossierPatch(md, b, "2026-11-26");
    expect(patched).toContain("**Confirmed on a real PC (2026-11-26).**");
    expect(dossierPatch(patched, b, "2026-11-26")).toBe(patched);
  });
});

describe("bugs inbox", () => {
  test("merges issues, BUGS.md and crashes; open and severe first", () => {
    const items = mergeInbox(
      fromIssues([
        { number: 1, title: "PR", state: "open", labels: [{ name: "bug" }], pull_request: {} },
        { number: 2, title: "Low bug", state: "open", labels: [{ name: "bug" }, { name: "low" }] },
        { number: 3, title: "Old report", state: "closed", labels: [{ name: "tester-report" }] },
        { number: 4, title: "Unlabelled", state: "open", labels: [] },
      ]),
      fromBrain([{ id: "B-31", severity: "Medium", status: "open", title: "Reloading", location: "x", note: "" }, { id: "B-04", severity: "Critical", status: "fixed", title: "Fixed", location: "", note: "" }]),
      fromCrashes([{ name: "crash-1.txt", createdMs: Date.parse("2026-11-25"), summary: "panicked" }])
    );
    expect(items.map((i) => i.ref)).toEqual(["crash-1.txt", "B-31", "#2", "B-04", "#3"]);
    expect(openBySeverity(items)).toEqual({ Critical: 0, High: 1, Medium: 1, Low: 1, "?": 0 });
    expect(filterInbox(items, { kind: "brain", open: true }).map((i) => i.ref)).toEqual(["B-31"]);
    expect(filterInbox(items, { q: "panic" }).length).toBe(1);
    expect(severityOf("sev:1")).toBe("High");
  });
});

describe("pulse", () => {
  test("CI health, board, trend, dev folder line and the brief", () => {
    expect(ciHealth([]).health).toBe("unknown");
    expect(ciHealth([{ id: 1, name: "a", status: "completed", conclusion: "success" }, { id: 2, name: "b", status: "in_progress", conclusion: null }]).health).toBe("running");
    expect(ciHealth([{ id: 1, name: "a", status: "completed", conclusion: "failure" }]).failing).toEqual(["a"]);
    const b = board([pr(1, "READY"), pr(2, "BLOCKED"), pr(3, "WAIT")]);
    expect([b.READY.length, b.WAIT.length, b.BLOCKED.length]).toEqual([1, 1, 1]);
    let t = addTrendPoint([], { date: "2026-11-20", stars: 10, issues: 5 });
    t = addTrendPoint(t, { date: "2026-11-26", stars: 15, issues: 4 });
    t = addTrendPoint(t, { date: "2026-11-26", stars: 16, issues: 4 });
    expect(t.length).toBe(2);
    expect(trendDelta(t)).toEqual({ stars: 6, issues: -1 });
    expect(ago(Date.now() - 3 * 3600_000)).toBe("3 h ago");
    expect(devFolderLine(null)).toBe("No dev folder found");
    const brief = buildBrief({ today: "2026-11-26", main: { health: "green", failing: [] }, prs: [pr(1, "READY"), pr(2, "BLOCKED")], bugs: [], suggestions: [], researchTop: ["A", "B", "C", "D"] });
    expect(brief).toContain("#2 BLOCKED** PR 2 — Windows build failed");
    expect(brief).toContain("- C");
    expect(brief).not.toContain("- D");
    expect(brief).not.toMatch(/gh[po]_|github_pat_/);
  });
});

describe("brain, release, nav", () => {
  test("search ranks headings and reader blocks are plain", () => {
    const hits = searchDocs([{ path: "DESIGN.md", text: "# Motion\nPress weights are medium by default\n## Press weights\n" }], "press weights");
    expect(hits[0].line).toBe(3);
    expect(searchDocs([], "x")).toEqual([]);
    const blocks = toBlocks("# T\n\ntext\nmore\n- item\n\n| a | b |\n|---|---|\n| 1 | 2 |\n```\ncode\n```\n");
    expect(blocks.map((b) => b.kind)).toEqual(["h", "p", "li", "table", "code"]);
    expect(blocks[3].rows).toEqual([["a", "b"], ["1", "2"]]);
    expect(inline("a **b** `c` [d](e)")).toEqual([{ t: "a " }, { t: "b", b: true }, { t: " " }, { t: "c", c: true }, { t: " " }, { t: "d" }]);
  });
  test("release checklist and tags", () => {
    expect(bumps("0.3.0")).toEqual({ patch: "0.3.1", minor: "0.4.0", major: "1.0.0" });
    expect(validTag("v0.4.0-beta.1")).toBe(true);
    expect(validTag("v0.4")).toBe(false);
    const c = releaseChecklist({ secretNames: ["TAURI_SIGNING_PRIVATE_KEY"], secretsReadable: true, variables: [{ name: "TAURI_UPDATER_PUBKEY", set: false }], variablesReadable: true }, { unreleasedCount: 3, mainGreen: true, versionMatches: null, openBlocked: 0 });
    const by = Object.fromEntries(c.map((x) => [x.id, x.ok]));
    expect(by).toMatchObject({ ci: true, changelog: true, version: null, TAURI_SIGNING_PRIVATE_KEY: true, TAURI_SIGNING_PRIVATE_KEY_PASSWORD: false, TAURI_UPDATER_PUBKEY: false });
    expect(releaseChecklist(null, { unreleasedCount: 0, mainGreen: null, versionMatches: null, openBlocked: 1 }).find((x) => x.id === "TAURI_SIGNING_PRIVATE_KEY")?.ok).toBeNull();
  });
  test("every page is in the sidebar and keyboard helpers wrap", () => {
    expect(ALL_PAGES.length).toBe(13);
    expect(new Set(ALL_PAGES).size).toBe(13);
    expect(NAV.length).toBe(4);
    expect(pageForDigit(1)).toBe("pulse");
    expect(pageForDigit(10)).toBeNull();
    expect(stepPage("pulse", -1)).toBe("setup");
    expect(stepPage("setup", 1)).toBe("pulse");
  });
  test("Command phrase", () => {
    for (const t of ["mission control", "Open Mission Control", "  lens mission   control ", "/mission"]) expect(isMissionControlPhrase(t)).toBe(true);
    for (const t of ["mission", "control the mission", "mc"]) expect(isMissionControlPhrase(t)).toBe(false);
  });
});

describe("dev-only gating", () => {
  test("the surface is compiled in only behind __LENS_ADMIN__", () => {
    const main = readFileSync(join(ROOT, "src/main.tsx"), "utf8");
    const i = main.indexOf("missioncontrol:");
    expect(i).toBeGreaterThan(0);
    expect(main.slice(Math.max(0, i - 300), i)).toContain('typeof __LENS_ADMIN__ !== "undefined" && __LENS_ADMIN__');
    const cmd = readFileSync(join(ROOT, "src/command/CommandSurface.tsx"), "utf8");
    expect(cmd).toMatch(/__LENS_ADMIN__ && !template && isMissionControlPhrase/);
    const vite = readFileSync(join(ROOT, "vite.config.ts"), "utf8");
    expect(vite).toContain('command === "serve" && process.env.LENS_ADMIN === "1"');
  });
  test("nothing else imports Mission Control", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const n of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, n.name);
        if (n.isDirectory()) {
          if (!["missioncontrol", "__tests__", "node_modules"].includes(n.name)) walk(p);
        } else if (/\.(tsx?|css)$/.test(n.name) && /from ["'][^"']*missioncontrol\//.test(readFileSync(p, "utf8"))) offenders.push(p);
      }
    };
    walk(join(ROOT, "src"));
    expect(offenders).toEqual([]);
  });
});
