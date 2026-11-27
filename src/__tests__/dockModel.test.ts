// The Dock's pure rules (src/dock/model.ts, placement.ts, advanced.ts, act.ts): which window sits
// on which pin (B-107), the one badge an icon shows, where the right-click menu goes (B-110), what
// the menu's size buttons do (B-109) and that failed actions are said out loud (B-106).
import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { LensConfig, PinnedApp, RunningWindow } from "../types/lens";
import { appLabel, dockFail } from "../dock/act";
import { MENU_ICON_SIZES, menuIconSize, pickMenuIconSize } from "../dock/advanced";
import { assignWindows, countNotifications, dockBadgeLabel, matchesPinnedApp, notifBadgeFor, orderGroups, pickBadge, processKnown } from "../dock/model";
import { cardBox, placeDockMenu } from "../dock/placement";
import { browseResults, homeRows, inTab } from "../dock/searchItems";
import { setCallReporter } from "../failsafe/calls";
import { toastBus } from "../ui/toastBus";

const pin = (id: string, name: string, path: string): PinnedApp => ({ id, name, path, iconHint: null });
let hwnd = 100;
const win = (processName: string, exePath = `C:\\Apps\\${processName}`, more: Partial<RunningWindow> = {}): RunningWindow => ({
  hwnd: ++hwnd,
  title: processName,
  processName,
  exePath,
  isFocused: false,
  isMinimized: false,
  isMaximized: false,
  ...more,
});
/** What Lens Core reports for a window whose process Windows won't name (win_windows.rs). */
const unnamed = (title: string) => win("app.exe", "", { title });

describe("B-107: which window sits on which pin", () => {
  test("a window Lens can't name never lands on a pin because its placeholder is inside the pin's name", () => {
    const pins = [pin("wa", "WhatsApp", "C:\\Apps\\WhatsApp.exe"), pin("apps", "Lens Apps", "C:\\Lens\\lens-apps.lnk")];
    const taskManager = unnamed("Task Manager");
    expect(processKnown(taskManager)).toBe(false);
    expect(matchesPinnedApp(pins[0], taskManager)).toBe(false);
    const { pinnedRows, extraGroups } = assignWindows(pins, [taskManager]);
    expect(pinnedRows.map((r) => r.wins.length)).toEqual([0, 0]);
    expect(extraGroups.map((g) => g.wins[0].title)).toEqual(["Task Manager"]);
  });

  test("a window sits on one pin only, and the pin that is exactly its program wins", () => {
    // Listed first, Notepad++ used to take Notepad's windows too ("notepad++" contains "notepad").
    const pins = [pin("npp", "Notepad++", "C:\\Apps\\notepad++.exe"), pin("np", "Notepad", "C:\\Windows\\notepad.exe")];
    const note = win("notepad.exe", "C:\\Windows\\notepad.exe");
    const plus = win("notepad++.exe", "C:\\Apps\\notepad++.exe");
    const { pinnedRows, extraGroups } = assignWindows(pins, [note, plus]);
    expect(pinnedRows[0].wins).toEqual([plus]);
    expect(pinnedRows[1].wins).toEqual([note]);
    expect(extraGroups).toEqual([]);
    const all = pinnedRows.flatMap((r) => r.wins.map((w) => w.hwnd));
    expect(new Set(all).size).toBe(all.length);
  });

  test("loose names still work for shortcuts and known other names", () => {
    const spotify = win("Spotify.exe");
    const code = win("Code.exe");
    const terminal = win("WindowsTerminal.exe");
    const pins = [pin("s", "Spotify", "C:\\Users\\me\\Spotify.lnk"), pin("c", "Visual Studio Code", "C:\\Users\\me\\vscode.lnk"), pin("t", "Terminal", "C:\\wt.exe")];
    const { pinnedRows } = assignWindows(pins, [spotify, code, terminal]);
    expect(pinnedRows.map((r) => r.wins)).toEqual([[spotify], [code], [terminal]]);
  });

  test("two-letter program names never match by containment", () => {
    expect(matchesPinnedApp(pin("n", "Newton", "C:\\Apps\\newton.exe"), win("wt.exe"))).toBe(false);
  });

  test("the focused window leads its pin, and unpinned apps group by program in dragged order", () => {
    const a = win("a-app.exe");
    const b1 = win("b-app.exe");
    const b2 = win("b-app.exe", undefined, { isFocused: true });
    const { extraGroups } = assignWindows([], [a, b1, b2]);
    expect(extraGroups.map((g) => [g.key, g.wins.length, g.primaryWin.hwnd])).toEqual([["a-app.exe", 1, a.hwnd], ["b-app.exe", 2, b2.hwnd]]);
    expect(orderGroups(extraGroups, ["b-app.exe"]).map((g) => g.key)).toEqual(["b-app.exe", "a-app.exe"]);
    const row = assignWindows([pin("b", "B", b1.exePath)], [b1, b2]).pinnedRows[0];
    expect(row.primaryWin).toBe(b2);
  });
});

describe("Dock badges", () => {
  test("an icon shows one badge at a time: text, then unread, then attention, then windows", () => {
    expect(pickBadge({ coreBadge: "12:04", unread: 3, urgentCount: 4, windows: 2 })).toEqual({ kind: "text", text: "12:04" });
    expect(pickBadge({ unread: 120, urgentCount: 4, windows: 2 })).toEqual({ kind: "unread", text: "99+" });
    expect(pickBadge({ unread: 0, urgentCount: 4, windows: 2 })).toEqual({ kind: "attention", text: "4" });
    expect(pickBadge({ unread: 0, urgentCount: 1, windows: 2 })).toEqual({ kind: "windows", text: "2" });
    expect(pickBadge({ unread: 0, urgentCount: 0, windows: 1 })).toBeNull();
  });

  test("notifications are counted once per id and matched loosely by app name", () => {
    const counts = countNotifications([[{ id: "1", appName: "Slack" }, { id: "2", appName: "Slack" }], [{ id: "2", appName: "Slack" }, { appName: "Lens UI" }, { id: "9", appName: "Microsoft Teams" }]]);
    expect(counts).toEqual({ slack: 2, microsoftteams: 1 });
    expect(notifBadgeFor(counts, "Slack", "slack.exe")).toBe(2);
    expect(notifBadgeFor(counts, "Teams")).toBe(1);
    expect(notifBadgeFor(counts, "ab", undefined)).toBe(0);
    expect(dockBadgeLabel(3, 2)).toBe(", 3 notifications");
    expect(dockBadgeLabel(0, 2)).toBe(", 2 windows");
    expect(dockBadgeLabel(0, 1)).toBe("");
  });
});

describe("B-110: the right-click menu stays on screen", () => {
  const view = { viewW: 1920, viewH: 1080 };
  const pill = { left: 8, right: 72 };
  const onScreen = (edge: "left" | "right" | "top" | "bottom", pos: { left: number; top: number }, w: number, h: number, topInset = 0) => {
    const box = cardBox(edge, pos, w, h);
    expect(box.top).toBeGreaterThanOrEqual(topInset);
    expect(box.bottom).toBeLessThanOrEqual(view.viewH);
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(view.viewW);
  };

  test("a tall Dock menu on a left Dock, opened near the top, is not cut off (it assumed 340 px)", () => {
    const h = 452; // the Dock's own menu
    const pos = placeDockMenu({ edge: "left", x: 40, y: 20, pill, icon: 44, w: 212, h, ...view, topInset: 34 });
    onScreen("left", pos, 212, h, 34);
    // The old rule: top = max(170, …) with the menu centred on it.
    expect(170 - h / 2).toBeLessThan(0);
  });

  test("every edge, every corner, with and without a Top Bar", () => {
    for (const edge of ["left", "right", "top", "bottom"] as const) {
      for (const [x, y] of [[0, 0], [1919, 0], [0, 1079], [1919, 1079], [960, 540]]) {
        for (const topInset of [0, 34]) {
          const p = { left: edge === "right" ? 1848 : 8, right: edge === "right" ? 1912 : 72 };
          const pos = placeDockMenu({ edge, x, y, pill: p, icon: 44, w: 212, h: 452, ...view, topInset });
          onScreen(edge, pos, 212, 452, topInset);
        }
      }
    }
  });

  test("away from the screen's sides it opens exactly where it always did", () => {
    expect(placeDockMenu({ edge: "bottom", x: 900, y: 1010, pill, icon: 44, w: 212, h: 300, ...view })).toEqual({ left: 900, top: 998 });
    expect(placeDockMenu({ edge: "top", x: 900, y: 8, pill, icon: 44, w: 212, h: 300, ...view })).toEqual({ left: 900, top: 70 });
    expect(placeDockMenu({ edge: "left", x: 40, y: 500, pill, icon: 44, w: 212, h: 300, ...view })).toEqual({ left: 84, top: 522 });
    expect(placeDockMenu({ edge: "right", x: 1880, y: 500, pill: { left: 1848, right: 1912 }, icon: 44, w: 212, h: 300, ...view })).toEqual({ left: 1836, top: 522 });
  });
});

describe("B-109: the menu's icon sizes do what they say", () => {
  const cfg = (dock: Partial<LensConfig["dock"]>) => ({ dock: { style: "floating", iconSize: 44, pinnedApps: [], ...dock }, func: {} }) as unknown as LensConfig;

  test("a style that follows the shared size changes the shared size", () => {
    const next = pickMenuIconSize(cfg({}), 52);
    expect(next.dock.iconSize).toBe(52);
    expect(next.dock.iconSizes ?? {}).toEqual({});
    expect(menuIconSize(next)).toBe(52);
  });

  test("a style with a size of its own gets the pick (the shared size used to change, unseen)", () => {
    const before = cfg({ iconSizes: { floating: 30 } });
    expect(menuIconSize(before)).toBe(30);
    const next = pickMenuIconSize(before, 46);
    expect(next.dock.iconSize).toBe(44);
    expect(menuIconSize(next)).toBe(46);
  });

  test("a style that caps the shared size gets the pick as its own size", () => {
    for (const style of ["slim", "taskbar", "studio", "islands", "unified"]) {
      for (const size of MENU_ICON_SIZES) {
        const next = pickMenuIconSize(cfg({ style }), size);
        expect({ style, size, shown: menuIconSize(next) }).toEqual({ style, size, shown: size });
      }
    }
  });
});

describe("B-106: Dock actions that fail say so", () => {
  afterEach(() => toastBus.clear());

  test("a failed action is logged and shown as one plain line", () => {
    const logged: string[] = [];
    const prev = setCallReporter((_level, e) => logged.push(String(e)));
    dockFail("open Spotify")("The file was moved.");
    setCallReporter(prev);
    expect(logged).toEqual(["Dock: couldn't open Spotify (The file was moved.)."]);
    expect(toastBus.items.map((t) => [t.kind, t.text])).toEqual([["error", "Couldn't open Spotify. The file was moved."]]);
  });

  test("names in notices are the app, not its path", () => {
    expect(appLabel("C:\\Program Files\\Spotify\\Spotify.exe")).toBe("Spotify");
    expect(appLabel("C:/Users/me/Desktop/Notes.lnk")).toBe("Notes");
    expect(appLabel("")).toBe("that app");
  });

  test("no Dock file calls Lens Core without saying what happens when it fails", () => {
    const root = join(import.meta.dir, "..");
    const files = ["surfaces/DockSurface.tsx", ...readdirSync(join(root, "dock")).filter((f) => /\.tsx?$/.test(f)).map((f) => `dock/${f}`), ...readdirSync(join(root, "dock", "hooks")).map((f) => `dock/hooks/${f}`)];
    /** Index just past the bracket that closes the one opening at `open`. */
    const close = (text: string, open: number) => {
      let depth = 0;
      for (let i = open; i < text.length; i++) {
        if ("([{".includes(text[i])) depth++;
        else if (")]}".includes(text[i]) && --depth === 0) return i + 1;
      }
      return text.length;
    };
    const bare: string[] = [];
    for (const f of files) {
      const text = readFileSync(join(root, f), "utf8");
      for (const m of text.matchAll(/\binvoke(?:<[^(]*>)?\(/g)) {
        const before = text.slice(Math.max(0, m.index - 48), m.index);
        // Wrapped: the retrying helper, a helper that hands the promise to its own handler, or a
        // step inside a chain that is checked from its first call.
        if (/retryOnce\(\(\) => $|return $|\.then\(\([^)]*\) => $/.test(before)) continue;
        // Otherwise the call's own chain must end in a catch, or a then with a failure handler.
        let i = close(text, m.index + m[0].length - 1);
        let handled = false;
        for (;;) {
          const next = /^\s*(?:\/\/[^\n]*\n\s*)*\.(then|catch|finally)\(/.exec(text.slice(i));
          if (!next) break;
          const open = i + next[0].length - 1;
          const end = close(text, open);
          if (next[1] === "catch" || (next[1] === "then" && /,\s*(dockFail|logFail|quiet)\b/.test(text.slice(open, end)))) handled = true;
          i = end;
        }
        if (!handled) bare.push(`${f}: ${text.slice(m.index, m.index + 80).split("\n")[0]}`);
      }
    }
    expect(bare).toEqual([]);
  });
});

describe("Dock search rows", () => {
  const sources = (opened: string[]) => ({
    windows: [win("Spotify.exe", undefined, { title: "Song", isFocused: true }), win("Code.exe", undefined, { title: "" })],
    home: { recentFiles: [{ name: "plan.md", path: "C:\\plan.md", ext: "md", ageLabel: "2 h" }, { name: "Photos", path: "C:\\Photos", ext: "", ageLabel: "1 d", isDir: true }], folders: [{ name: "Downloads", path: "C:\\Downloads", color: "cobalt", itemCount: 3 }] },
    installedApps: [{ name: "Paint", path: "C:\\paint.exe" }] as never,
    focus: (h: number) => opened.push(`focus ${h}`),
    open: (p: string) => opened.push(`open ${p}`),
  });

  test("the home grid lists windows first, then recent files, and each row opens its own thing", () => {
    const opened: string[] = [];
    const rows = homeRows(sources(opened));
    expect(rows.map((r) => [r.title, r.badge, r.isDir])).toEqual([["Song", "Active", false], ["Code", "Open", false], ["plan.md", "2 h", false], ["Photos", "1 d", true]]);
    rows[2].run();
    expect(opened).toEqual(["open C:\\plan.md"]);
  });

  test("each filter pill lists its own kind (Running also lists recent files)", () => {
    const s = sources([]);
    expect(browseResults(s, "apps").map((r) => r.title)).toEqual(["Paint"]);
    expect(browseResults(s, "folders").map((r) => r.title)).toEqual(["Downloads", "Photos"]);
    expect(browseResults(s, "files").map((r) => r.title)).toEqual(["plan.md"]);
    expect(browseResults(s, "recent").map((r) => r.kind)).toEqual(["recent", "recent", "files"]);
    expect(browseResults(s, "all")).toHaveLength(6);
    expect(inTab("action", "apps")).toBe(false);
  });
});
