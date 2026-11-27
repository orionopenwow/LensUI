// Lens Apps as the "Link" mode of the combinator: the Library (installed, updates, Update all),
// credits and licences in plain words, the screenshot gallery, and the fixes B-121 and B-122.
import { beforeEach, describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import catalogJson from "../../catalog/apps/catalog.json";
import { stepIndex } from "../apps/Gallery";
import { autoUpdateRows, viewParam, digitsOf, libraryModel, librarySummary, sourceOf, updatable, updateAllPreview, updateAllReference, updateAllText, versionLine } from "../apps/libraryModel";
import { creditFor, licenceFamily, licenceInfo, NOT_AFFILIATED } from "../apps/licence";
import { approvalText, appApprovalPreview } from "../apps/approval";
import { reduceQueue, emptyQueue, retryMode } from "../apps/queue";
import type { Catalog, CatalogApp, InstalledInfo } from "../apps/types";
import { DEFAULT_SETTINGS } from "../apps/types";
import { toastBus } from "../ui/toastBus";

const catalog = catalogJson as unknown as Catalog;
const byId = (id: string) => catalog.apps.find((a) => a.id === id)!;
const src = (f: string) => readFileSync(join(import.meta.dir, "..", "apps", f), "utf8");

describe("Library model", () => {
  const installed: Record<string, InstalledInfo> = {
    ollama: { version: "0.40.10", available: "0.40.16" },
    krita: { version: "5.3.4.1", available: null },
    blender: { version: "4.5.1", available: "4.5.3" },
    "not-in-catalogue": { version: "1", available: "2" },
    vlc: { version: "3.0.21", available: "  " },
  };
  const m = libraryModel(catalog.apps, installed);

  test("splits installed apps into updates and up to date, by name, and ignores unknown ids", () => {
    expect(m.updates.map((r) => r.app.id)).toEqual(["blender", "ollama"]);
    expect(m.current.map((r) => r.app.id)).toEqual(["krita", "vlc"]);
    expect(m.updateCount).toBe(2);
    expect(m.total).toBe(4);
    // A blank "available" from winget is not an update.
    expect(m.current.find((r) => r.app.id === "vlc")!.available).toBeNull();
  });

  test("the summary says what is true, with the right plurals", () => {
    expect(librarySummary(m)).toBe("4 apps on this PC · 2 updates");
    expect(librarySummary(libraryModel(catalog.apps, { krita: installed.krita }))).toBe("1 app on this PC · all up to date");
    expect(librarySummary(libraryModel(catalog.apps, { ollama: installed.ollama }))).toBe("1 app on this PC · 1 update");
    expect(librarySummary(libraryModel(catalog.apps, {}))).toBe("Nothing from the catalogue is on this PC yet");
  });

  test("version lines", () => {
    expect(versionLine({ version: "1.2.0", available: "1.3.0" })).toBe("1.2.0 → 1.3.0");
    expect(versionLine({ version: "1.2.0", available: null })).toBe("1.2.0");
    expect(versionLine({ version: " ", available: null })).toBe("installed");
  });

  test("Update all leaves out what is already queued, running or waiting to run", () => {
    let q = reduceQueue(emptyQueue, { type: "enqueue", appId: "blender", op: "upgrade" });
    expect(updatable(m, q).map((r) => r.app.id)).toEqual(["ollama"]);
    q = reduceQueue(q, { type: "finished", appId: "blender", ok: false, message: "x" });
    expect(updatable(m, q).map((r) => r.app.id)).toEqual(["blender", "ollama"]);
  });

  test("the one approval card lists every app, its version change and its source, and promises no undo", () => {
    const p = updateAllPreview(m.updates);
    expect(p.question).toBe("Update 2 apps?");
    expect(p.verb).toBe("Update 2");
    expect(p.details).toEqual([
      { label: "Blender", value: `4.5.1 → 4.5.3 · ${sourceOf(byId("blender"))}` },
      { label: "Ollama", value: "0.40.10 → 0.40.16 · winget · Ollama.Ollama" },
    ]);
    expect(p.reversible).toBe(false);
    expect(p.noUndoLine).toBe(true);
    expect(p.source?.label).toBe("Lens Apps");
    expect(updateAllText(m.updates.slice(0, 1))).toBe("Update Blender");
    expect(updateAllPreview(m.updates.slice(0, 1)).verb).toBe("Update");
    // The same set is the same request, whatever order it was built in.
    expect(updateAllReference(m.updates)).toBe(updateAllReference([...m.updates].reverse()));
    // Long lists are capped on the card and say how many more.
    const many = Array.from({ length: 11 }, () => m.updates[0]);
    const capped = updateAllPreview(many).details;
    expect(capped.length).toBe(9);
    expect(capped[8]).toEqual({ label: "And", value: "3 more" });
  });

  test("digits for the rolling count", () => {
    expect(digitsOf(0)).toEqual(["0"]);
    expect(digitsOf(12)).toEqual(["1", "2"]);
    expect(digitsOf(-3)).toEqual(["0"]);
  });
});

describe("licences in plain words", () => {
  test("every licence string in the catalogue lands in a family that has plain words", () => {
    for (const a of catalog.apps) {
      const l = licenceInfo(a);
      expect(l.plain.length).toBeGreaterThan(30);
      expect(l.label.length).toBeGreaterThan(0);
      // Closed tools are never called open source, and open ones are never called freeware.
      expect(l.family === "freeware").toBe(!a.openSource);
      // Never claims a check that wasn't done.
      expect(l.verified).toBe(a.licenseVerified);
      expect(l.caveat === null).toBe(a.licenseVerified);
    }
  });

  test("families", () => {
    expect(licenceFamily("MIT")).toBe("permissive");
    expect(licenceFamily("Apache-2.0")).toBe("permissive");
    expect(licenceFamily("GPL-3.0-only")).toBe("copyleft");
    expect(licenceFamily("GPL")).toBe("copyleft");
    expect(licenceFamily("AGPL-3.0-or-later")).toBe("networkCopyleft");
    expect(licenceFamily("LGPL-2.1 (+ unRAR restriction)")).toBe("weakCopyleft");
    expect(licenceFamily("MPL-2.0")).toBe("weakCopyleft");
    expect(licenceFamily("Permissive (see repo)")).toBe("permissive");
    expect(licenceFamily("Proprietary (free)", false)).toBe("freeware");
    expect(licenceFamily("Freeware", true)).toBe("freeware");
    expect(licenceFamily("Something new")).toBe("unknown");
    // A choice of licences: the person may take the gentler one.
    expect(licenceFamily("MIT OR Apache-2.0")).toBe("permissive");
    expect(licenceFamily("GPL-3.0 OR MIT")).toBe("permissive");
  });

  test("wording: copyleft names the share-alike rule, network copyleft names services, notes are kept", () => {
    expect(licenceInfo({ license: "GPL-3.0", licenseVerified: true, openSource: true }).plain).toContain("must share its source under the same licence");
    expect(licenceInfo({ license: "AGPL-3.0", licenseVerified: true, openSource: true }).plain).toContain("online service");
    const lgpl = licenceInfo({ license: "LGPL-2.1 (+ unRAR restriction)", licenseVerified: false, openSource: true });
    expect(lgpl.label).toBe("LGPL-2.1");
    expect(lgpl.plain).toContain("The catalogue notes: unRAR restriction.");
    const free = licenceInfo({ license: "Proprietary (free for personal use)", licenseVerified: false, openSource: false });
    expect(free.label).toBe("Free, not open source");
    expect(free.plain).toContain("free for personal use");
    expect(free.caveat).toBe("Lens hasn't read the publisher's terms yet.");
    expect(free.kind).toBe(free.label);
    const vague = licenceInfo({ license: "Permissive (see repo)", licenseVerified: false, openSource: true });
    expect(vague.label).toBe("Open source");
    expect(vague.plain).toContain("describes itself as permissively licensed");
    expect(vague.caveat).toBe("Lens hasn't read this licence in the project's repository yet.");
  });

  test("credits never invent a name and only link addresses from the app's own entry", () => {
    for (const a of catalog.apps) {
      const c = creditFor(a);
      expect(c.by.length).toBeGreaterThan(0);
      expect([a.repo, a.homepage]).toContain(c.sourceUrl);
      expect(c.source).not.toMatch(/^https?:/);
      expect(c.by === (a.author ?? a.publisher) || c.by === a.publisher).toBe(true);
    }
    expect(creditFor(byId("artcraft")).by).toBe("storytold");
    expect(NOT_AFFILIATED).toContain("isn't affiliated");
  });
});

describe("gallery stepping", () => {
  test("wraps at both ends and survives an empty list", () => {
    expect(stepIndex(0, 1, 3)).toBe(1);
    expect(stepIndex(2, 1, 3)).toBe(0);
    expect(stepIndex(0, -1, 3)).toBe(2);
    expect(stepIndex(7, 0, 3)).toBe(1);
    expect(stepIndex(0, 1, 0)).toBe(0);
  });
});

describe("B-121: apps Lens keeps itself can be removed from the store, and failures are said", () => {
  beforeEach(() => toastBus.clear());
  const portable = catalog.apps.find((a) => (a.install as { portable?: boolean }).portable) as CatalogApp | undefined;

  test("the catalogue has a portable app to remove (ThumbDesk)", () => {
    expect(portable?.id).toBe("thumbdesk");
  });

  test("the ⋯ menu offers Remove for portable apps, not only Uninstall for winget ones", () => {
    const pill = src("ActionPill.tsx");
    expect(pill).toContain('const removable = app.install.method === "winget" || !!(app.install as { portable?: boolean }).portable;');
    expect(pill).toContain("installed && onUninstall && removable");
    expect(pill).not.toContain('installed && onUninstall && app.install.method === "winget"');
  });

  test("the card says Remove and what it deletes", () => {
    expect(approvalText(portable!, "uninstall")).toBe("Remove ThumbDesk");
    const p = appApprovalPreview(portable!, "uninstall");
    expect(p.verb).toBe("Remove");
    expect(p.reason).toBe("Deletes the copy Lens keeps in its apps folder.");
    expect(p.tone).toBe("danger");
    expect(approvalText(byId("krita"), "uninstall")).toBe("Uninstall Krita");
  });

  test("no silent catch is left in Lens Apps, and its window shows the toast bus", () => {
    const dir = join(import.meta.dir, "..", "apps");
    const left = readdirSync(dir)
      .filter((f) => /\.tsx?$/.test(f))
      .flatMap((f) => (readFileSync(join(dir, f), "utf8").match(/\.catch\(\(\) => (\{\}|undefined)\)/g) ?? []).map(() => f));
    expect(left).toEqual([]);
    expect(src("AppsSurface.tsx")).toContain("<ToastHost />");
    // A failed portable removal and a failed "Undo Lens setup" both reach the person.
    const ctl = src("useAppsController.ts");
    expect(ctl).toContain("oops(`remove ${target.name}`)");
    expect(ctl).toContain("oops(`undo the Lens setup for ${app.name}`)");
  });

  test("Retry repeats what failed, not always an install", () => {
    expect(retryMode("upgrade")).toBe("update");
    expect(retryMode("uninstall")).toBe("uninstall");
    expect(retryMode("install")).toBe("get");
    expect(retryMode(undefined)).toBe("get");
  });
});

describe("B-122: updates are manual by default, automatic only when asked", () => {
  const card = readFileSync(join(import.meta.dir, "..", "components", "AppsCard.tsx"), "utf8");
  test("Settings › Apps has one clearly named switch, off by default; the never-read check schedule stays gone", () => {
    expect(card).toContain("Update apps automatically");
    expect(card).toContain("Off by default.");
    expect(card).toContain("update({ autoUpdate: e.target.checked })");
    expect(card).not.toContain("checkUpdates:");
    expect(DEFAULT_SETTINGS.autoUpdate).toBe(false);
  });

  test("an update shows as Update available, and Update is one click for winget apps", () => {
    expect(src("Library.tsx")).toContain("Update available");
    const ctl = src("useAppsController.ts");
    expect(ctl).toContain('dispatch({ type: "enqueue", appId: target.id, op: "upgrade" })');
    // Only the switch turns automatic updates on.
    expect(ctl).toContain("if (demo || !autoUpdate) return;");
  });

  test("automatic updates cover winget apps Lens installed, once per session, never a busy one", () => {
    const m = libraryModel(catalog.apps, { ollama: { version: "0.40.10", available: "0.40.16" }, blender: { version: "4.5.1", available: "4.5.3" } });
    // Blender was installed by the person, not Lens: it waits.
    expect(autoUpdateRows(m, emptyQueue, ["ollama"], new Set()).map((r) => r.app.id)).toEqual(["ollama"]);
    // Tried already this session (say it failed): not again until Lens Apps is opened anew.
    expect(autoUpdateRows(m, emptyQueue, ["ollama"], new Set(["ollama"]))).toEqual([]);
    // Already queued: not twice.
    const q = reduceQueue(emptyQueue, { type: "enqueue", appId: "ollama", op: "upgrade" });
    expect(autoUpdateRows(m, q, ["ollama", "blender"], new Set()).map((r) => r.app.id)).toEqual(["blender"]);
  });

  test("Rust still doesn't run updates on its own (the switch works through the Lens Apps check)", () => {
    const rust = readFileSync(join(import.meta.dir, "..", "..", "src-tauri", "src", "commands", "apps.rs"), "utf8");
    const uses = (name: string) => (rust.match(new RegExp(`\\b${name}\\b`, "g")) ?? []).length;
    expect(uses("auto_update")).toBeLessThanOrEqual(3);
    expect(uses("check_updates")).toBeLessThanOrEqual(5);
  });
});

describe("B-123: the detail page keeps the keyboard", () => {
  test("it takes focus when it opens, Esc is handled on the window, and focus returns to the card", () => {
    const detail = src("Detail.tsx");
    expect(detail).toContain("back.current?.focus({ preventScroll: true })");
    expect(detail).toContain('window.addEventListener("keydown", onKey)');
    const page = src("LensApps.tsx");
    expect(page).toContain("cameFrom.current = id");
    expect(page).toMatch(/querySelector<HTMLElement>\(`\[data-app-id="\$\{CSS\.escape\(id\)\}"\]`\)[\s\S]{0,40}el\?\.focus/);
    // The pill no longer swallows every key on its way up (Esc from a focused pill goes back).
    expect(src("ActionPill.tsx")).not.toContain("onKeyDown={(e) => e.stopPropagation()}");
  });

  test("view parameter for the standalone window", () => {
    expect(viewParam("library")).toBe("library");
    expect(viewParam("updates")).toBe("library");
    expect(viewParam(null)).toBeUndefined();
    expect(viewParam("nope")).toBeUndefined();
  });
});

describe("feel: Lens Apps controls declare a press weight", () => {
  test("every button in the Lens Apps views has data-weight", () => {
    for (const f of ["LensApps.tsx", "Library.tsx", "Detail.tsx", "Gallery.tsx", "ActionPill.tsx"]) {
      const text = src(f);
      const buttons = text.match(/<button\b[^>]*>/gs) ?? [];
      const bare = buttons.filter((b) => !b.includes("data-weight"));
      expect({ f, bare }).toEqual({ f, bare: [] });
    }
  });

  test("new styles use motion tokens only and never animate layout", () => {
    const css = src("library.css");
    expect(css.match(/\b\d+m?s\b/g)?.filter((d) => !/^0m?s$/.test(d)) ?? []).toEqual(["700ms"]); // one token's own fallback
    expect(css).not.toMatch(/transition:[^;]*\b(width|height|top|left|margin|padding)\b/);
    expect(css).not.toContain("backdrop-filter");
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
