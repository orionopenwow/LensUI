import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { MAGIC_DEFAULTS, MAGIC_FLAGS, anyOn, isOn, magicFlags, withFlag } from "../magicwaves/flags";
import { DEFAULT_GESTURE, run } from "../magic/mouse/gesture";
import { WATCHDOG_MS, initial, step as startStep, type KeyEvent, type StartAction } from "../magic/start/startButton";
import { exportNote, fileNameFor, noteToText, shelfToNote } from "../shelf/toNote";
import { applied, canRedo, canUndo, dirty, edit, open, redo, revert, undo } from "../studio/v2/draft";
import { LAYOUTS, contextStrip, initialState, laneCards, reduce, visibleLanes, type Card } from "../dashboard/store";
import { bindTemplate, validateManifest } from "../widgets/format";

describe("Magic flags", () => {
  test("every flag defaults to off, including for an old config without the key", () => {
    for (const f of MAGIC_FLAGS) expect(MAGIC_DEFAULTS[f]).toBe(false);
    expect(anyOn({})).toBe(false);
    expect(anyOn(null)).toBe(false);
    expect(magicFlags({}).mouseHoldMs).toBe(400);
  });

  test("withFlag changes one flag and nothing else", () => {
    const base = { theme: { preset: "obsidian" }, magicWaves: { ...MAGIC_DEFAULTS, widgets: true } };
    const next = withFlag(base, "dashboard", true);
    expect(isOn(next, "dashboard")).toBe(true);
    expect(isOn(next, "widgets")).toBe(true);
    expect(next.theme).toBe(base.theme);
    expect(isOn(withFlag(next, "dashboard", false), "dashboard")).toBe(false);
  });

  test("hold time is clamped and junk values are ignored", () => {
    expect(magicFlags({ magicWaves: { mouseHoldMs: 5 } as never }).mouseHoldMs).toBe(200);
    expect(magicFlags({ magicWaves: { mouseHoldMs: 9999 } as never }).mouseHoldMs).toBe(1200);
    expect(magicFlags({ magicWaves: { dashboard: "yes" } as never }).dashboard).toBe(false);
  });

  test("Rust and TypeScript agree on the defaults", () => {
    const rs = readFileSync(join(import.meta.dir, "../../src-tauri/src/config.rs"), "utf8");
    const block = rs.slice(rs.indexOf("impl Default for MagicWavesConfig"), rs.indexOf("impl MagicWavesConfig"));
    for (const f of MAGIC_FLAGS) {
      const snake = f.replace(/[A-Z0-9]/g, (c) => `_${c.toLowerCase()}`).replace("v_2", "v2");
      expect(block).toContain(`${snake}: false`);
    }
    expect(block).toContain("mouse_hold_ms: 400");
  });

  test("nothing outside the preview mounts Magic UI, and the Dashboard window only opens with its flag on", () => {
    // With every flag off nothing new may appear: the entry points are the Tester-only preview
    // section, the Top Bar button (renders nothing while its flag is off), Command's /dashboard
    // (offered only when Rust says the flag is on) and the Dashboard surface route, whose window is
    // built only by open_dashboard, which refuses while the flag is off.
    const src = join(import.meta.dir, "..");
    const users: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) {
          if (!["__tests__", "magicwaves", "dashboard", "studio", "magic", "shelf", "widgets"].includes(name)) walk(p);
          continue;
        }
        if (!/\.(tsx?|mjs)$/.test(name)) continue;
        const t = readFileSync(p, "utf8");
        if (/from "(\.\.\/)+(magicwaves|dashboard)\//.test(t) || /studio\/v2\//.test(t)) users.push(p.slice(src.length + 1));
      }
    };
    walk(src);
    const allowed = new Set(["settings/pages/AboutPage.tsx", "surfaces/TopBarSurface.tsx", "types/lens.ts", "command/CommandSurface.tsx"]);
    expect(users.filter((u) => !allowed.has(u.replace(/\\/g, "/")))).toEqual([]);
    const lib = readFileSync(join(import.meta.dir, "../../src-tauri/src/lib.rs"), "utf8");
    expect(lib).not.toMatch(/magic_waves::\w+::\w+\s*,/); // no commands registered from the scaffold
    // The Dashboard window: built only by show_dashboard (reached only from open_dashboard, after the
    // flag check) or by on_flag_changed when the flag has just been turned on; nothing at start-up
    // (setup, watcher, tray) creates or opens it.
    const dash = readFileSync(join(import.meta.dir, "../../src-tauri/src/commands/dashboard.rs"), "utf8");
    const open = dash.slice(dash.indexOf("pub(crate) fn open_dashboard"), dash.indexOf("fn show_dashboard"));
    expect(open.indexOf("if !enabled(")).toBeGreaterThan(-1);
    expect(open.indexOf("if !enabled(")).toBeLessThan(open.indexOf("show_dashboard("));
    expect(dash.match(/show_dashboard\(/g)?.length).toBe(2); // the definition and open_dashboard's call
    const calls = [...dash.matchAll(/ensure_window\((app|&a)\)/g)];
    expect(calls.length).toBe(2);
    const flagOn = dash.slice(dash.indexOf("pub(crate) fn on_flag_changed"));
    expect(flagOn.indexOf("if now && !was")).toBeGreaterThan(-1);
    expect(flagOn.indexOf("if now && !was")).toBeLessThan(flagOn.indexOf("ensure_window(&a)"));
    for (const f of ["app/setup.rs", "app/watcher.rs", "app/tray.rs", "app/integration.rs"]) {
      const t = readFileSync(join(import.meta.dir, "../../src-tauri/src", f), "utf8");
      expect(t).not.toMatch(/dashboard::(open_dashboard|toggle_dashboard|ensure_window)/);
    }
  });
});

describe("Magic Mouse gesture (hold, then drag)", () => {
  const o = DEFAULT_GESTURE;
  test("a short click is a click", () => {
    expect(run([{ type: "down", x: 10, y: 10, t: 0 }, { type: "up", x: 10, y: 10, t: 120 }])).toEqual([{ kind: "click" }]);
  });
  test("moving before the hold time hands the drag back to Windows", () => {
    const r = run([
      { type: "down", x: 10, y: 10, t: 0 },
      { type: "move", x: 60, y: 10, t: 100 },
      { type: "move", x: 120, y: 40, t: 600 },
      { type: "up", x: 120, y: 40, t: 700 },
    ]);
    expect(r).toEqual([{ kind: "passthrough" }]);
  });
  test("holding then dragging grabs the rectangle", () => {
    const r = run([
      { type: "down", x: 100, y: 100, t: 0 },
      { type: "tick", t: o.holdMs },
      { type: "move", x: 40, y: 180, t: o.holdMs + 50 },
      { type: "up", x: 40, y: 180, t: o.holdMs + 90 },
    ]);
    expect(r).toEqual([{ kind: "armed" }, { kind: "grab", rect: { x: 40, y: 100, w: 60, h: 80 } }]);
  });
  test("holding without dragging opens Magic at the press point; a tiny grab is ignored", () => {
    expect(run([{ type: "down", x: 3, y: 4, t: 0 }, { type: "tick", t: 500 }, { type: "up", x: 3, y: 4, t: 600 }])).toEqual([{ kind: "armed" }, { kind: "hold", x: 3, y: 4 }]);
    expect(run([{ type: "down", x: 0, y: 0, t: 0 }, { type: "tick", t: 500 }, { type: "move", x: 20, y: 3, t: 520 }, { type: "up", x: 20, y: 3, t: 540 }])).toEqual([{ kind: "armed" }]);
  });
  test("right and middle buttons are never grabbed; cancel resets", () => {
    expect(run([{ type: "down", x: 0, y: 0, t: 0, button: "right" }, { type: "tick", t: 900 }, { type: "up", x: 0, y: 0, t: 950 }])).toEqual([]);
    expect(run([{ type: "down", x: 0, y: 0, t: 0 }, { type: "cancel" }, { type: "up", x: 0, y: 0, t: 50 }])).toEqual([]);
  });
  test("the hold time is respected", () => {
    const slow = { ...o, holdMs: 800 };
    expect(run([{ type: "down", x: 0, y: 0, t: 0 }, { type: "move", x: 50, y: 50, t: 500 }], slow)).toEqual([{ kind: "passthrough" }]);
  });
});

describe("Magic button contract", () => {
  const go = (on: boolean, evs: KeyEvent[]): StartAction[] => {
    let s = initial(on);
    const out: StartAction[] = [];
    for (const e of evs) {
      const [n, a] = startStep(s, e);
      s = n;
      out.push(a);
    }
    return out;
  };
  test("off: every key goes to Windows", () => {
    expect(go(false, [{ type: "winDown", t: 0 }, { type: "winUp", t: 50 }])).toEqual(["passToWindows", "passToWindows"]);
  });
  test("on: a tap opens Magic Start; Win+key combinations go to Windows", () => {
    expect(go(true, [{ type: "winDown", t: 0 }, { type: "winUp", t: 50 }, { type: "ack", t: 60 }])).toEqual(["none", "openMagic", "none"]);
    expect(go(true, [{ type: "winDown", t: 0 }, { type: "otherKey", t: 10 }, { type: "winUp", t: 50 }])).toEqual(["none", "passToWindows", "passToWindows"]);
  });
  test("Ctrl+Esc always opens Windows Start", () => {
    expect(go(true, [{ type: "ctrlEsc", t: 0 }])).toEqual(["openWindowsStart"]);
    expect(go(false, [{ type: "ctrlEsc", t: 0 }])).toEqual(["openWindowsStart"]);
  });
  test("no answer within the watchdog opens Windows Start and stands down until Lens answers", () => {
    const r = go(true, [
      { type: "winDown", t: 0 },
      { type: "winUp", t: 10 },
      { type: "tick", t: 10 + WATCHDOG_MS },
      { type: "winDown", t: 1000 },
      { type: "winUp", t: 1010 },
      { type: "ack", t: 1020 },
      { type: "winDown", t: 2000 },
      { type: "winUp", t: 2010 },
    ]);
    expect(r).toEqual(["none", "openMagic", "openWindowsStart", "none", "openWindowsStart", "none", "none", "openMagic"]);
  });
});

describe("Shelf → Notes", () => {
  const items = [
    { kind: "page" as const, title: "A page", text: "Line one\nLine two", url: "https://example.com/a", source_app: "Lens Browser" },
    { kind: "image" as const, title: "", text: "", path: "C:\\pic.png" },
  ];
  test("builds a Markdown note with headings, sources and quotes", () => {
    const n = shelfToNote(items, { date: new Date("2026-11-25T10:00:00Z") });
    expect(n.title).toBe("Shelf notes · 2026-11-25");
    expect(n.count).toBe(2);
    expect(n.body).toContain("## A page");
    expect(n.body).toContain("_Page · from Lens Browser_");
    expect(n.body).toContain("> Line one\n> Line two");
    expect(n.body).toContain("## C:\\pic.png");
  });
  test("an empty Shelf says so", () => {
    expect(shelfToNote([], { title: "x" }).body).toContain("_The Shelf is empty._");
  });
  test("exports md and txt; pdf is a later update", () => {
    const n = shelfToNote(items, { title: 'My: "notes"' });
    expect(exportNote(n, "md")).toMatchObject({ name: "My- -notes-.md", mime: "text/markdown" });
    const txt = exportNote(n, "txt");
    expect(txt.name.endsWith(".txt")).toBe(true);
    expect(txt.contents).not.toContain("## ");
    expect(() => exportNote(n, "pdf")).toThrow();
    expect(noteToText("# T\n> q")).toBe("T\n  q");
    expect(fileNameFor("   ", "md")).toBe("Note.md");
  });
});

describe("Studio v2 draft", () => {
  test("edit, undo, redo, revert and apply", () => {
    let d = open({ size: 40 });
    expect(canUndo(d)).toBe(false);
    d = edit(d, { size: 40 });
    expect(canUndo(d)).toBe(false); // no empty steps
    d = edit(d, { size: 48 });
    d = edit(d, { size: 56 });
    expect(dirty(d)).toBe(true);
    d = undo(d);
    expect(d.present).toEqual({ size: 48 });
    expect(canRedo(d)).toBe(true);
    d = redo(d);
    expect(d.present).toEqual({ size: 56 });
    d = edit(undo(d), { size: 50 });
    expect(canRedo(d)).toBe(false); // a new edit drops the redo branch
    d = revert(d);
    expect(d.present).toEqual({ size: 40 });
    expect(dirty(d)).toBe(false);
    d = applied(edit(d, { size: 64 }));
    expect(dirty(d)).toBe(false);
    expect(canUndo(d)).toBe(true);
  });
});

describe("Dashboard store", () => {
  const now = 1_000_000;
  const cards: Card[] = [
    { id: "a", lane: "inbox", title: "A", source: "x", at: now - 1000 },
    { id: "b", lane: "inbox", title: "B", source: "x", at: now - 5000 },
    { id: "c", lane: "today", title: "C", source: "x", at: now },
  ];
  test("layouts list known lanes; widgets lane needs its flag", () => {
    for (const l of LAYOUTS) expect(l.lanes.length).toBeGreaterThan(0);
    expect(visibleLanes("board", { widgets: false }).map((l) => l.id)).not.toContain("widgets");
    expect(visibleLanes("board", { widgets: true }).map((l) => l.id)).toContain("widgets");
  });
  test("newest first, no reasons while learning is off", () => {
    let s = reduce(initialState(), { type: "cards", cards });
    s = reduce(s, { type: "opened", id: "b" });
    expect(s.opens).toEqual({}); // nothing recorded while off
    expect(laneCards(s, "inbox").map((c) => c.id)).toEqual(["a", "b"]);
  });
  test("learning reorders by use and says why; turning it off forgets", () => {
    let s = reduce(initialState({ learn: true }), { type: "cards", cards });
    s = reduce(reduce(s, { type: "opened", id: "b" }), { type: "opened", id: "b" });
    const lane = laneCards(s, "inbox");
    expect(lane.map((c) => c.id)).toEqual(["b", "a"]);
    expect(lane[0].why).toBe("You opened this 2 times recently");
    expect(lane[1].why).toBeUndefined();
    s = reduce(s, { type: "learn", on: false });
    expect(s.opens).toEqual({});
    expect(laneCards(s, "inbox").map((c) => c.id)).toEqual(["a", "b"]);
  });
  test("dismissed cards disappear", () => {
    const s = reduce(reduce(initialState(), { type: "cards", cards }), { type: "dismiss", id: "a" });
    expect(laneCards(s, "inbox").map((c) => c.id)).toEqual(["b"]);
  });
  test("context strip is short and local", () => {
    const strip = contextStrip({ now: new Date(2026, 10, 25, 9, 0), unread: 3, nextEvent: { title: "Review", at: new Date(2026, 10, 25, 9, 30) }, shelfCount: 0 });
    expect(strip).toEqual(["Good morning", "3 unread", "Review in 30 min"]);
  });
});

describe("Widget manifests", () => {
  test("valid feed widget lists the host to approve", () => {
    const r = validateManifest({ id: "hn.top", name: "Hacker News", kind: "feed", version: "1.0.0", source: { url: "https://news.ycombinator.com/rss" } });
    expect(r).toEqual({ ok: true, errors: [], hosts: ["news.ycombinator.com"] });
  });
  test("rejects http, local addresses and bad fields", () => {
    expect(validateManifest({ id: "a1", name: "x", kind: "feed", version: "1.0.0", source: { url: "http://x.com" } }).ok).toBe(false);
    expect(validateManifest({ id: "a1", name: "x", kind: "feed", version: "1.0.0", source: { url: "https://localhost/x" } }).ok).toBe(false);
    expect(validateManifest({ id: "A!", name: "", kind: "nope", version: "1" }).errors.length).toBeGreaterThanOrEqual(4);
    expect(validateManifest(null).ok).toBe(false);
  });
  test("templates bind data without running anything", () => {
    expect(bindTemplate({ type: "TextBlock", text: "Hi ${user.name} ${missing}" }, { user: { name: "Sam" } })).toEqual({ type: "TextBlock", text: "Hi Sam " });
  });
});
