import { describe, expect, test } from "bun:test";
import catalogJson from "../../catalog/apps/catalog.json";
import { validateCatalog, validateApp, isWingetId, isHttpsUrl } from "../apps/validate";
import { filterApps, resolveApp, categoryFor, recommend, rails, heroApps, score } from "../apps/search";
import { parseAppsIntent, describeIntent } from "../apps/intents";
import { reduceJobs, overallPct, clearJob, type Jobs } from "../apps/jobs";
import { placeholderDataUri, hueFor, monogram } from "../apps/placeholder";
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
    expect(bad({ media: { images: ["javascript:alert(1)"], video: null, credit: "x" } }).length).toBeGreaterThan(0);
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
  test("rails and hero", () => {
    const r = rails(catalog, true);
    expect(r.some((x) => x.id === "collection:ai")).toBe(true);
    expect(r.every((x) => x.apps.length > 0)).toBe(true);
    const hero = heroApps(catalog);
    expect(hero.length).toBeGreaterThan(3);
    expect(hero.every((a) => a.collections.includes("rewrites"))).toBe(true);
    expect(hero[0].install.method).not.toBe("via");
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

describe("placeholders", () => {
  test("deterministic, tinted per app, data-URI SVG", () => {
    expect(placeholderDataUri("concat")).toBe(placeholderDataUri("concat"));
    expect(placeholderDataUri("concat")).not.toBe(placeholderDataUri("krita"));
    expect(placeholderDataUri("concat").startsWith("data:image/svg+xml,")).toBe(true);
    expect(placeholderDataUri("concat", false)).not.toBe(placeholderDataUri("concat", true));
    for (const a of catalog.apps) {
      const h = hueFor(a.id);
      expect(h >= 0 && h < 360 && !(h >= 60 && h < 120)).toBe(true);
    }
    expect(monogram("OBS Studio")).toBe("OS");
    expect(monogram("7-Zip")).toBe("7Z");
    expect(monogram("Concat")).toBe("Co");
  });
});
