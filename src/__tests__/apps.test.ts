import { describe, expect, test } from "bun:test";
import catalogJson from "../../catalog/apps/catalog.json";
import { validateCatalog, validateApp, isWingetId, isHttpsUrl } from "../apps/validate";
import { filterApps, resolveApp, categoryFor, recommend, homeSections, score } from "../apps/search";
import { parseAppsIntent, describeIntent } from "../apps/intents";
import { reduceJobs, overallPct, clearJob, type Jobs } from "../apps/jobs";
import { hueFor } from "../apps/placeholder";
import { reduceQueue, nextToStart, traySummary, emptyQueue, itemFor, type QueueState } from "../apps/queue";
import { pillFor } from "../apps/ActionPill";
import { defaultChosen } from "../apps/DownloadTray";
import { isMediaUrl } from "../apps/validate";
import type { Catalog, CatalogApp, ProgressEvent } from "../apps/types";

const catalog = catalogJson as unknown as Catalog;
const byId = (id: string) => catalog.apps.find((a) => a.id === id)!;

describe("catalogue", () => {
  test("every entry validates", () => {
    expect(validateCatalog(catalog)).toEqual([]);
  });

  test("has 30–60 apps across every category, with the user's three asks present", () => {
    expect(catalog.apps.length).toBeGreaterThanOrEqual(30);
    expect(catalog.apps.length).toBeLessThanOrEqual(60);
    for (const c of catalog.categories) expect(catalog.apps.some((a) => a.category === c.id)).toBe(true);
    expect(byId("artcraft").replaces.length).toBeGreaterThan(0);
    expect(byId("concat").install.method).toBe("githubRelease");
    expect(byId("degenview").replaces).toContain("TradingView");
    for (const id of ["wordcraft", "deckcraft", "gridcraft"]) expect(byId(id).install).toMatchObject({ method: "via", via: "craft-launcher" });
  });

  test("every app has a licence and https sources; non-open-source apps say so", () => {
    for (const a of catalog.apps) {
      expect(a.license.length).toBeGreaterThan(1);
      expect(a.sources.every(isHttpsUrl)).toBe(true);
      if (!a.openSource) expect(a.license.toLowerCase()).toMatch(/proprietary|freeware/);
    }
  });

  test("winget ids are well formed and can't carry flags or shell syntax", () => {
    for (const a of catalog.apps) if (a.install.method === "winget") expect(isWingetId(a.install.wingetId)).toBe(true);
    for (const bad of ["Ollama", "-x.y", "a..b", "a.b --override x", "a.b;calc", "a.b&&c", ".a.b", "a/b.c"]) expect(isWingetId(bad)).toBe(false);
  });

  test("the validator catches broken entries", () => {
    const ok = byId("krita");
    const ids = new Set(catalog.apps.map((a) => a.id));
    const cats = new Set(catalog.categories.map((c) => c.id));
    const cols = new Set(catalog.collections.map((c) => c.id));
    const bad = (patch: Partial<CatalogApp>) => validateApp({ ...ok, ...patch } as CatalogApp, ids, cats, cols);
    expect(bad({})).toEqual([]);
    expect(bad({ homepage: "http://krita.org" }).length).toBeGreaterThan(0);
    expect(bad({ install: { method: "winget", wingetId: "Krita", wingetVerified: true } }).length).toBeGreaterThan(0);
    expect(bad({ install: { method: "via", via: "nope" } }).length).toBeGreaterThan(0);
    expect(bad({ install: { method: "githubRelease", repo: "a/b/c", hints: [] } }).length).toBeGreaterThan(0);
    expect(bad({ recipe: [{ kind: "mcpServer", name: "x", command: "cmd & calc", args: [] }] }).length).toBeGreaterThan(0);
    const m = ok.media;
    expect(bad({ media: { ...m, icon: "javascript:alert(1)" } }).length).toBeGreaterThan(0);
    expect(bad({ media: { ...m, screenshots: ["http://insecure.example/a.png"] } }).length).toBeGreaterThan(0);
    expect(bad({ media: { ...m, icon: null, screenshots: [], noMedia: null } }).length).toBeGreaterThan(0);
    expect(bad({ license: "" }).length).toBeGreaterThan(0);
  });
});

describe("search", () => {
  const f = { query: "", category: null, openSourceOnly: false, showNonOpenSource: true };
  test("finds by name, by what it replaces and by category words", () => {
    expect(filterApps(catalog.apps, { ...f, query: "concat" })[0].id).toBe("concat");
    expect(filterApps(catalog.apps, { ...f, query: "capcut" })[0].id).toBe("concat");
    expect(filterApps(catalog.apps, { ...f, query: "tradingview" }).map((a) => a.id)).toContain("degenview");
    expect(filterApps(catalog.apps, { ...f, query: "slides" }).some((a) => a.category === "slides")).toBe(true);
    expect(filterApps(catalog.apps, { ...f, query: "zzzz qqqq" })).toEqual([]);
  });
  test("open-source filter hides free-but-closed tools", () => {
    const os = filterApps(catalog.apps, { ...f, openSourceOnly: true });
    expect(os.every((a) => a.openSource)).toBe(true);
    expect(os.some((a) => a.id === "obsidian")).toBe(false);
  });
  test("resolveApp picks a clear winner or returns candidates", () => {
    expect(resolveApp(catalog.apps, "ArtCraft").app?.id).toBe("artcraft");
    expect(resolveApp(catalog.apps, "the obs studio").app?.id).toBe("obs-studio");
    expect(resolveApp(catalog.apps, "nothing like this").app).toBeNull();
  });
  test("category questions and recommendations", () => {
    expect(categoryFor("making a presentation")).toBe("slides");
    expect(categoryFor("a spreadsheet")).toBe("sheets");
    expect(categoryFor("stock charts")).toBe("markets");
    const rec = recommend(catalog, "slides");
    expect(rec.length).toBeGreaterThan(0);
    expect(rec[rec.length - 1].status === "alpha" || rec.every((a) => a.status !== "alpha")).toBe(true);
  });
  test("home shows every app at most once, suite as one compact row", () => {
    const h = homeSections(catalog, true);
    const ids = [...h.hero, ...(h.suite.launcher ? [h.suite.launcher] : []), ...h.suite.apps, ...h.ai, ...h.essentials].map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(h.hero.some((a) => a.id === "artcraft")).toBe(true);
    expect(h.hero.every((a) => a.install.method !== "via" && a.id !== "craft-launcher")).toBe(true);
    expect(h.suite.launcher?.id).toBe("craft-launcher");
    expect(h.suite.apps.map((a) => a.id)).toContain("wordcraft");
    expect(h.ai.some((a) => a.id === "artcraft" || a.id === "concat")).toBe(false);
    expect(h.categories.reduce((n, c) => n + c.count, 0)).toBe(catalog.apps.length);
    expect(h.categories.every((c) => c.preview.length > 0)).toBe(true);
    expect(score(byId("ollama"), "")).toBe(1);
  });
});

describe("voice and command intents", () => {
  const p = (s: string, installed?: Set<string>) => parseAppsIntent(s, catalog, installed);
  test("install is confirm-risk and resolves the app", () => {
    const i = p("Lens, install ArtCraft");
    expect(i).toMatchObject({ kind: "install", risk: "confirm" });
    expect(i && "app" in i && i.app?.id).toBe("artcraft");
    expect(p("hey lens please install concat for me")).toMatchObject({ kind: "install" });
    expect((p("/install concat") as any).app.id).toBe("concat");
  });
  test("open by name and by nickname", () => {
    expect((p("open krita") as any).app.id).toBe("krita");
    const chart = p("Lens, open the charting app", new Set(["degenview"])) as any;
    expect(chart.kind).toBe("open");
    expect(chart.app.id).toBe("degenview");
    expect((p("open the charting app") as any).app.category).toBe("markets");
  });
  test("update all, uninstall, describe, recommend, /apps", () => {
    expect(p("update all my apps")).toMatchObject({ kind: "updateAll", risk: "confirm" });
    expect(p("uninstall vlc")).toMatchObject({ kind: "uninstall", risk: "confirm" });
    const d = p("what does Concat do")!;
    expect(d.kind).toBe("describe");
    expect(describeIntent(d)).toContain("Concat");
    const r = p("what should I use for slides")!;
    expect(r.kind).toBe("recommend");
    expect(describeIntent(r)).toMatch(/^Try /);
    expect(p("/apps video")).toEqual({ kind: "openApps", query: "video" });
    expect(p("open the apps section")).toEqual({ kind: "openApps", query: "" });
  });
  test("unrelated phrases are left for other parsers", () => {
    expect(p("dark mode")).toBeNull();
    expect(p("open the pod bay doors")).toBeNull();
  });
});

describe("jobs", () => {
  const ev = (stage: ProgressEvent["stage"], pct: number | null, jobId = "j1"): ProgressEvent => ({ jobId, appId: "ollama", op: "install", stage, pct, message: stage });
  test("overall progress never goes backwards and finishes at 100", () => {
    let j: Jobs = {};
    const seq: [ProgressEvent["stage"], number | null][] = [["resolving", null], ["downloading", 0], ["downloading", 50], ["downloading", 100], ["verifying", 100], ["installing", null], ["installing", 40], ["done", 100]];
    let last = -1;
    for (const [s, p] of seq) {
      j = reduceJobs(j, ev(s, p));
      expect(j.ollama.overall).toBeGreaterThanOrEqual(last);
      last = j.ollama.overall;
    }
    expect(j.ollama).toMatchObject({ overall: 100, finished: true, ok: true });
    expect(clearJob(j, "ollama")).toEqual({});
  });
  test("failure keeps the bar where it was; a new job resets", () => {
    let j = reduceJobs({}, ev("downloading", 50));
    j = reduceJobs(j, ev("failed", null));
    expect(j.ollama).toMatchObject({ finished: true, ok: false });
    expect(j.ollama.overall).toBe(overallPct("downloading", 50));
    j = reduceJobs(j, ev("resolving", null, "j2"));
    expect(j.ollama.overall).toBe(0);
  });
});

describe("media", () => {
  test("every entry has an https icon and a screenshot, or says why not", () => {
    for (const a of catalog.apps) {
      const m = a.media;
      const complete = !!m.icon && m.screenshots.length > 0;
      expect(complete || (m.noMedia ?? "").length > 10).toBe(true);
      for (const u of [m.icon, ...m.screenshots, m.loop].filter(Boolean)) expect(isMediaUrl(u)).toBe(true);
      expect(isHttpsUrl(m.sourceUrl)).toBe(true);
    }
  });
  test("media is pinned to a commit in the project's own repo", () => {
    let n = 0;
    for (const a of catalog.apps) {
      for (const u of [a.media.icon, ...a.media.screenshots].filter(Boolean) as string[]) {
        const m = u.match(/^https:\/\/raw\.githubusercontent\.com\/([^/]+\/[^/]+)\/([0-9a-f]{40})\//);
        expect(m).not.toBeNull();
        n++;
      }
    }
    expect(n).toBeGreaterThan(80);
    expect(catalog.apps.filter((a) => a.media.icon).length).toBeGreaterThanOrEqual(40);
  });
  test("tints are stable and avoid muddy hues", () => {
    for (const a of catalog.apps) {
      const h = hueFor(a.id);
      expect(h >= 0 && h < 360 && !(h >= 60 && h < 120)).toBe(true);
    }
    expect(hueFor("concat")).toBe(hueFor("concat"));
  });
});

describe("Get queue and pill", () => {
  test("gets line up and run one at a time; releases wait for Run without blocking", () => {
    let q: QueueState = emptyQueue;
    q = reduceQueue(q, { type: "enqueue", appId: "ollama", op: "install" });
    q = reduceQueue(q, { type: "enqueue", appId: "concat", op: "install" });
    q = reduceQueue(q, { type: "enqueue", appId: "krita", op: "install" });
    q = reduceQueue(q, { type: "enqueue", appId: "ollama", op: "install" });
    expect(q.items.length).toBe(3);
    expect(nextToStart(q)?.appId).toBe("ollama");
    q = reduceQueue(q, { type: "started", appId: "ollama", jobId: "j1" });
    expect(nextToStart(q)).toBeNull();
    q = reduceQueue(q, { type: "finished", appId: "ollama", ok: true });
    expect(itemFor(q, "ollama")?.setupPending).toBe(true);
    expect(nextToStart(q)?.appId).toBe("concat");
    q = reduceQueue(q, { type: "started", appId: "concat" });
    q = reduceQueue(q, { type: "verified", appId: "concat", token: "t" });
    expect(nextToStart(q)?.appId).toBe("krita");
    expect(traySummary(q)).toContain("1 queued");
    expect(traySummary(q)).toContain("1 ready to run");
    q = reduceQueue(q, { type: "cancel", appId: "krita" });
    expect(itemFor(q, "krita")?.status).toBe("cancelled");
    q = reduceQueue(q, { type: "setupDone", appId: "ollama" });
    q = reduceQueue(q, { type: "clearFinished" });
    expect(q.items.map((i) => i.appId)).toEqual(["concat"]);
  });
  test("pill states", () => {
    const k = byId("krita");
    expect(pillFor(k, undefined, undefined)).toBe("get");
    expect(pillFor(k, { version: "1", available: null }, undefined)).toBe("open");
    expect(pillFor(k, { version: "1", available: "2" }, undefined)).toBe("update");
    expect(pillFor(k, undefined, { appId: "krita", op: "install", status: "queued" })).toBe("queued");
    expect(pillFor(k, undefined, { appId: "krita", op: "install", status: "running" })).toBe("running");
    expect(pillFor(byId("concat"), undefined, { appId: "concat", op: "install", status: "verified", token: "t" })).toBe("run");
    expect(pillFor(k, undefined, { appId: "krita", op: "install", status: "failed" })).toBe("retry");
    expect(pillFor(byId("excalidraw"), undefined, undefined)).toBe("open");
    expect(pillFor(byId("slidev"), undefined, undefined)).toBe("getExternal");
  });
  test("setup checklist pre-ticks everything except switching the AI model", () => {
    const steps = [
      { index: 0, kind: "addToDock" as const, description: "" },
      { index: 1, kind: "localModelProvider" as const, description: "" },
      { index: 2, kind: "voiceVerbs" as const, description: "" },
    ];
    expect(defaultChosen(steps)).toEqual([0, 2]);
  });
});
