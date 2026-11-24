// Settings hub: page registry completeness, deep links, the Windows Settings catalogue and search ranking.
import { describe, expect, test, mock } from "bun:test";

mock.module("@tauri-apps/api/core", () => ({
  invoke: async () => null,
  convertFileSrc: (p: string) => p,
  transformCallback: () => 0,
}));
mock.module("@tauri-apps/api/event", () => ({ listen: async () => () => {}, emit: async () => {} }));

import { GROUPS, LEGACY_TABS, PAGES, WINDOWS_SETTINGS, getPage, resolveTarget, type PageId } from "../settings/registry";
import { buildIndex, search } from "../settings/search";

describe("page registry", () => {
  test("every page has a title, a description, hero controls, keywords and a group", () => {
    for (const p of PAGES) {
      expect(p.label.length).toBeGreaterThan(2);
      expect(p.description.length).toBeGreaterThan(10);
      expect(p.description.endsWith(".")).toBe(true);
      expect(p.controls.length).toBeGreaterThanOrEqual(1);
      expect(p.controls.length).toBeLessThanOrEqual(4);
      expect(p.keywords.length).toBeGreaterThan(0);
      expect(GROUPS.some((g) => g.id === p.group)).toBe(true);
    }
  });

  test("page ids and section ids are unique", () => {
    const ids = PAGES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of PAGES) {
      const s = p.sections.map((x) => x.id);
      expect(new Set(s).size).toBe(s.length);
    }
  });

  test("groups are Lens, Windows, Status and each has pages", () => {
    expect(GROUPS.map((g) => g.id)).toEqual(["quick", "lens", "windows", "status"]);
    for (const g of GROUPS) expect(PAGES.filter((p) => p.group === g.id).length).toBeGreaterThan(0);
    // Agents and Folder Icons are sections now, not pages.
    expect(PAGES.some((p) => (p.id as string) === "agents" || (p.id as string) === "folders")).toBe(false);
  });

  test("every Windows page links to its Windows Settings page", () => {
    for (const p of PAGES.filter((x) => x.group === "windows")) expect(p.winUri?.startsWith("ms-settings:")).toBe(true);
  });
});

describe("deep links", () => {
  test("page ids, legacy tab ids and lens://settings links resolve", () => {
    expect(resolveTarget("sound")).toEqual({ page: "sound" });
    expect(resolveTarget("sound#mixer")).toEqual({ page: "sound", section: "mixer" });
    expect(resolveTarget("lens://settings/network#bluetooth")).toEqual({ page: "network", section: "bluetooth" });
    expect(resolveTarget("LENS://SETTINGS/Display")).toEqual({ page: "display" });
    expect(resolveTarget("theme")).toEqual({ page: "appearance" });
    expect(resolveTarget("monitor")).toEqual({ page: "tasks" });
    expect(resolveTarget("messages")).toEqual({ page: "notifications" });
    expect(resolveTarget("agents")).toEqual({ page: "ai", section: "agents" });
    expect(resolveTarget("folders")).toEqual({ page: "desktop", section: "folders" });
    expect(resolveTarget("topbar")).toEqual({ page: "dock", section: "topbar" });
  });

  test("unknown targets are ignored; unknown sections fall back to the page", () => {
    expect(resolveTarget("nope")).toBeNull();
    expect(resolveTarget("")).toBeNull();
    expect(resolveTarget(null)).toBeNull();
    expect(resolveTarget("sound#nope")).toEqual({ page: "sound" });
  });

  test("every legacy tab id maps to a real page", () => {
    for (const id of Object.values(LEGACY_TABS)) expect(PAGES.some((p) => p.id === id)).toBe(true);
  });
});

describe("Windows Settings catalogue", () => {
  test("only ms-settings URIs (the backend refuses anything else), all unique, all on real pages", () => {
    const uris = WINDOWS_SETTINGS.map((w) => w.uri);
    expect(new Set(uris).size).toBe(uris.length);
    for (const w of WINDOWS_SETTINGS) {
      expect(w.uri).toMatch(/^ms-settings:[a-z0-9-]+$/);
      expect(PAGES.some((p) => p.id === w.page)).toBe(true);
    }
    expect(WINDOWS_SETTINGS.length).toBeGreaterThanOrEqual(40);
  });
});

describe("search", () => {
  const index = buildIndex();
  const top = (q: string) => search(q, index, 3);

  // query → page the first result must be on (and optional section / windows URI)
  const GOLDEN: [string, PageId, string?][] = [
    ["bluetooth", "network"],
    ["wifi", "network"],
    ["wi-fi", "network"],
    ["night light", "display"],
    ["brightness", "display"],
    ["refresh rate", "display"],
    ["volume", "sound"],
    ["microphone", "sound"],
    ["app volume", "sound"],
    ["startup apps", "apps"],
    ["default apps", "apps"],
    ["uninstall", "apps"],
    ["battery", "power"],
    ["power mode", "power"],
    ["sleep", "power"],
    ["disk space", "storage"],
    ["storage", "storage"],
    ["do not disturb", "focus"],
    ["camera", "privacy"],
    ["windows update", "update"],
    ["time zone", "time"],
    ["keyboard layout", "time"],
    ["text size", "accessibility"],
    ["animations", "accessibility"],
    ["game mode", "gaming"],
    ["dock style", "dock"],
    ["top bar", "dock"],
    ["theme", "appearance"],
    ["accent colour", "appearance"],
    ["cursor", "appearance"],
    ["playground", "desktop"],
    ["folder icons", "desktop"],
    ["hot corners", "keys"],
    ["alt tab", "keys"],
    ["claude", "ai"],
    ["agents", "ai"],
    ["task manager", "tasks"],
    ["self test", "about"],
    ["remove all lens changes", "about"],
    ["btooth", "network"],
  ];

  test.each(GOLDEN)("%p → %p", (q, page) => {
    const r = top(q);
    expect(r.length).toBeGreaterThan(0);
    expect(r[0].page).toBe(page);
  });

  test("results carry breadcrumbs; Windows entries carry their URI", () => {
    const r = search("airplane", index, 5);
    const win = r.find((x) => x.kind === "windows");
    expect(win?.uri).toBe("ms-settings:network-airplanemode");
    expect(win?.breadcrumb.startsWith("Windows Settings ›")).toBe(true);
    const page = search("sound", index, 1)[0];
    expect(page.breadcrumb).toBe("Windows › Sound");
  });

  test("empty and nonsense queries return nothing", () => {
    expect(search("", index)).toEqual([]);
    expect(search("   ", index)).toEqual([]);
    expect(search("zzqxqz", index)).toEqual([]);
  });

  test("getPage falls back to the first page", () => {
    expect(getPage("display").label).toBe("Display");
    expect(getPage("x" as PageId).id).toBe(PAGES[0].id);
  });
});

describe("page error boundary", () => {
  test("renders a Retry button instead of a blank page", async () => {
    const React = await import("react");
    const { PageErrorBoundary } = await import("../settings/ui/ErrorBoundary");
    const b = new PageErrorBoundary({ pageLabel: "Sound", children: null });
    b.state = PageErrorBoundary.getDerivedStateFromError(new Error("boom"));
    const out = b.render() as React.ReactElement;
    const text = JSON.stringify(out, (_k, v) => (typeof v === "function" ? undefined : v));
    expect(text).toContain("Retry");
    expect(text).toContain("Sound");
    expect(text).toContain("boom");
  });

  test("renders children when nothing failed", async () => {
    const { PageErrorBoundary } = await import("../settings/ui/ErrorBoundary");
    const b = new PageErrorBoundary({ pageLabel: "Sound", children: "ok" });
    expect(b.render()).toBe("ok");
  });
});
