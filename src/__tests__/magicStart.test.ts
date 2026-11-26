// Magic Start (wave M4): the panel's pure parts and the Win-tap contract.
import { describe, expect, test } from "bun:test";
import {
  MAX_PINNED, MAX_RECENT, magicActions, moveSelection, navOrder, pinnedEntries, recentEntries, searchApps, shelfLabel,
} from "../magic/start/model";
import { WATCHDOG_MS, initial, step, type StartState } from "../magic/start/startButton";

const apps = [
  { name: "Notepad", path: "C:\\np.exe" },
  { name: "Microsoft Teams", path: "C:\\teams.exe" },
  { name: "Steam", path: "C:\\steam.exe" },
  { name: "Notepad", path: "c:\\NP.exe" }, // same app found twice
  { name: "Café Notes", path: "C:\\cafe.exe" },
];

describe("searchApps", () => {
  test("empty query finds nothing", () => {
    expect(searchApps(apps, "   ")).toEqual([]);
  });
  test("name start beats word start beats anywhere, duplicates by path dropped", () => {
    expect(searchApps(apps, "ea").map((a) => a.name)).toEqual(["Steam", "Microsoft Teams"]);
    expect(searchApps(apps, "tea").map((a) => a.name)).toEqual(["Microsoft Teams", "Steam"]);
    expect(searchApps(apps, "note").map((a) => a.name)).toEqual(["Notepad", "Café Notes"]);
  });
  test("accents and case are ignored", () => {
    expect(searchApps(apps, "CAFE").map((a) => a.path)).toEqual(["C:\\cafe.exe"]);
  });
  test("limit applies", () => {
    expect(searchApps(apps, "e", 2)).toHaveLength(2);
  });
});

describe("magicActions", () => {
  test("only the waves that are on add their actions", () => {
    expect(magicActions({ dashboard: false, shelfNotes: false }).map((a) => a.key)).toEqual(["act:magic", "act:snip", "act:shelf"]);
    expect(magicActions({ dashboard: true, shelfNotes: true }).map((a) => a.key)).toEqual([
      "act:magic", "act:snip", "act:dashboard", "act:shelfNote", "act:shelf",
    ]);
  });
});

describe("pinned and recent", () => {
  test("pins are capped", () => {
    const pins = Array.from({ length: 20 }, (_, i) => ({ name: `A${i}`, path: `p${i}` }));
    expect(pinnedEntries(pins)).toHaveLength(MAX_PINNED);
  });
  test("files fill every row when the Shelf is empty", () => {
    const files = Array.from({ length: 9 }, (_, i) => ({ name: `f${i}`, path: `f${i}` }));
    expect(recentEntries(files, []).map((e) => e.kind)).toEqual(Array(MAX_RECENT).fill("file"));
  });
  test("files and Shelf items share the rows", () => {
    const files = Array.from({ length: 9 }, (_, i) => ({ name: `f${i}`, path: `f${i}` }));
    const shelf = Array.from({ length: 9 }, () => ({ kind: "text", title: "t", text: null, url: null, path: null }));
    const kinds = recentEntries(files, shelf).map((e) => e.kind);
    expect(kinds).toHaveLength(MAX_RECENT);
    expect(kinds.filter((k) => k === "file")).toHaveLength(MAX_RECENT / 2);
  });
  test("shelf labels use the first line and are clipped", () => {
    expect(shelfLabel({ kind: "text", title: null, text: "first\nsecond", url: null, path: null })).toBe("first");
    expect(shelfLabel({ kind: "page", title: "x".repeat(80), text: null, url: null, path: null })).toHaveLength(60);
    expect(shelfLabel({ kind: "image", title: null, text: null, url: null, path: null })).toBe("image");
  });
});

describe("keyboard order", () => {
  const e = (key: string) => ({ kind: "shelf" as const, key, label: key });
  test("search shows results only; otherwise pinned, actions, recent", () => {
    expect(navOrder("x", [e("r")], [e("p")], [e("a")], [e("c")]).map((x) => x.key)).toEqual(["r"]);
    expect(navOrder("", [e("r")], [e("p")], [e("a")], [e("c")]).map((x) => x.key)).toEqual(["p", "a", "c"]);
  });
  test("moving clamps at both ends", () => {
    expect(moveSelection(0, -1, 5)).toBe(0);
    expect(moveSelection(4, 1, 5)).toBe(4);
    expect(moveSelection(2, 1, 5)).toBe(3);
    expect(moveSelection(3, 0, 0)).toBe(0);
  });
});

describe("Win-tap contract (startButton)", () => {
  const run = (s: StartState, evs: Parameters<typeof step>[1][]) => {
    const acts: string[] = [];
    for (const ev of evs) {
      const [n, a] = step(s, ev);
      s = n;
      acts.push(a);
    }
    return { s, acts };
  };
  test("off: everything goes to Windows", () => {
    const { acts } = run(initial(false), [{ type: "winDown", t: 0 }, { type: "winUp", t: 50 }]);
    expect(acts).toEqual(["passToWindows", "passToWindows"]);
  });
  test("on: a clean tap opens Magic Start; an ack in time keeps Windows Start shut", () => {
    const { acts, s } = run(initial(true), [
      { type: "winDown", t: 0 }, { type: "winUp", t: 60 }, { type: "ack", t: 120 }, { type: "tick", t: 60 + WATCHDOG_MS + 10 },
    ]);
    expect(acts).toEqual(["none", "openMagic", "none", "none"]);
    expect(s.stoodDown).toBe(false);
  });
  test("Win+L and other combinations are never taken", () => {
    const { acts } = run(initial(true), [{ type: "winDown", t: 0 }, { type: "otherKey", t: 10 }, { type: "winUp", t: 30 }]);
    expect(acts).toEqual(["none", "passToWindows", "passToWindows"]);
  });
  test("Ctrl+Esc always opens Windows Start, on or off", () => {
    expect(step(initial(true), { type: "ctrlEsc", t: 0 })[1]).toBe("openWindowsStart");
    expect(step(initial(false), { type: "ctrlEsc", t: 0 })[1]).toBe("openWindowsStart");
  });
  test("no ack within the watchdog opens Windows Start, then taps go to Windows until Lens answers", () => {
    const r = run(initial(true), [{ type: "winDown", t: 0 }, { type: "winUp", t: 10 }, { type: "tick", t: 10 + WATCHDOG_MS }]);
    expect(r.acts.at(-1)).toBe("openWindowsStart");
    const again = run(r.s, [{ type: "winDown", t: 1000 }, { type: "winUp", t: 1010 }]);
    expect(again.acts.at(-1)).toBe("openWindowsStart");
    const back = run(again.s, [{ type: "ack", t: 1100 }, { type: "winDown", t: 1200 }, { type: "winUp", t: 1210 }]);
    expect(back.acts.at(-1)).toBe("openMagic");
  });
});
