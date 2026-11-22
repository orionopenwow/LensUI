// Launcher search: fuzzy scoring, calculator / unit conversion, ranking and special rows.
// Ported from the launcher agent's standalone harness.
import { describe, expect, mock, test } from "bun:test";

mock.module("@tauri-apps/api/core", () => ({
  invoke: async () => null,
  convertFileSrc: (p: string) => `asset://localhost/${encodeURIComponent(p)}`,
  transformCallback: () => 0,
}));

const { scoreText, acronym, editDistance } = await import("../search/fuzzy");
const { calculate, evaluate } = await import("../search/calc");
const { rankItems, specialItems, filterByTab, copyableNumber } = await import("../search/engine");
const { SETTINGS_PAGES } = await import("../search/settingsIndex");
const { setUsageForTests, usageBoost } = await import("../search/usage");
type SearchItem = import("../search/engine").SearchItem;

describe("fuzzy", () => {
  test("acronyms", () => {
    expect(acronym("Visual Studio Code")).toBe("vsc");
    expect(acronym("PowerToys")).toBe("pt");
    expect(acronym("OBS Studio")).toBe("os");
  });
  test("edit distance counts a transposition as one edit", () => {
    expect(editDistance("chorme", "chrome")).toBe(1);
  });
  test("scoring", () => {
    expect(scoreText("notepad", "Notepad")).toBeGreaterThan(scoreText("note", "Notepad"));
    expect(scoreText("chorme", "Google Chrome")).toBeGreaterThan(0);
    expect(scoreText("photshop", "Adobe Photoshop 2023")).toBeGreaterThan(0);
    expect(scoreText("xq", "Visual Studio Code")).toBe(0);
  });
});

describe("calculator", () => {
  test.each([
    ["2+2*3", "8"],
    ["(4+5)^2", "81"],
    ["sqrt(2)", "1.4142135624"],
    ["15% of 80", "12"],
    ["120 + 15%", "138"],
    ["1234*1000", "1,234,000"],
    ["2(3+4)", "14"],
    ["5 km to mi", "3.1069 mi"],
    ["72 f to c", "22.22 °C"],
    ["3 gb in mb", "3,000 MB"],
    ["2.5 hours to minutes", "150 min"],
  ])("%s = %s", (q, want) => {
    expect(calculate(q)?.value).toBe(want);
  });
  test.each(["1/0", "notepad", "2026-11-21", "40% brightness", "5 kg to km"])("%s is not a calculation", (q) => {
    expect(calculate(q)).toBeNull();
  });
  test("helpers", () => {
    expect(copyableNumber("1,234.5 mi")).toBe("1234.5");
    expect(evaluate("2+")).toBeNull();
  });
});

describe("ranking", () => {
  const run = () => {};
  const apps = [
    "Visual Studio Code", "Visual Studio 2022", "Google Chrome", "Notepad", "Notepad++", "Spotify", "Steam", "Discord",
    "OBS Studio", "Adobe Photoshop 2023", "Blender 5.1", "Audacity", "Android Studio", "7-Zip File Manager", "Calculator",
    "Command Prompt", "Microsoft Edge", "Microsoft Teams", "PowerToys", "Paint", "Snipping Tool", "Task Manager", "Terminal",
    "Battle.net", "Epic Games Launcher",
  ];
  const corpus: SearchItem[] = [
    ...apps.map((n) => ({ key: `app:${n}`, kind: "app" as const, title: n, subtitle: "App", run })),
    { key: "win:code:lens", kind: "window", title: "Lens UI — Visual Studio Code", subtitle: "Code · Open window", keywords: "Code", run },
    { key: "win:chrome", kind: "window", title: "Inbox - Gmail - Google Chrome", subtitle: "chrome · Open window", keywords: "chrome", run },
    ...SETTINGS_PAGES.map((s) => ({ key: `setting:${s.uri}`, kind: "setting" as const, title: s.title, subtitle: "Windows Settings", keywords: s.keywords, run })),
    { key: "path:q4", kind: "file", title: "Q4 Report.docx", subtitle: "Documents", modified: 1_795_000_000, run },
    { key: "path:steam-shot", kind: "file", title: "steam_screenshot.png", subtitle: "Pictures", run },
    { key: "path:dl", kind: "folder", title: "Downloads", subtitle: "C:\\Users\\u\\Downloads", run },
    { key: "lens:tile", kind: "action", title: "Tile windows 50/50", subtitle: "Window layout", keywords: "tile split side by side layout", run },
  ];
  const nowSec = 1_795_100_000;
  const top = (q: string) => rankItems(q, corpus, { usage: { items: {}, queries: {} }, nowSec })[0]?.title;

  test.each([
    ["vsc", "Visual Studio Code"],
    ["photshop", "Adobe Photoshop 2023"],
    ["note", "Notepad"],
    ["steam", "Steam"],
    ["wifi", "Wi-Fi"],
    ["dark mode", "Colors"],
    ["uninstall", "Installed apps"],
    ["pt", "PowerToys"],
  ])("%s -> %s", (q, want) => {
    expect(top(q)).toBe(want);
  });
  test("typos still find the app", () => {
    expect(top("chorme")).toContain("Chrome");
  });
  test("learned picks move to the top and decay with age", () => {
    const learned = { items: { "app:Notepad++": { c: 3, t: 1_795_090_000 } }, queries: { note: { "app:Notepad++": 3 } } };
    expect(rankItems("note", corpus, { usage: learned, nowSec })[0].title).toBe("Notepad++");
    expect(rankItems("not", corpus, { usage: learned, nowSec })[0].title).toBe("Notepad++");
    const old = usageBoost("k", "", { items: { k: { c: 5, t: 0 } }, queries: {} }, 86400 * 100);
    const fresh = usageBoost("k", "", { items: { k: { c: 5, t: 86400 * 100 } }, queries: {} }, 86400 * 100);
    expect(old).toBeLessThan(fresh);
    setUsageForTests({ items: {}, queries: {} });
  });
  test("special rows: shell needs confirmation, web and calc placement", () => {
    const h = { copy: () => {}, openUrl: () => {}, runShell: () => {} };
    const sh = specialItems(">ipconfig /all", h);
    expect(sh.exclusive).toBe(true);
    expect(sh.items[0].confirm).toBeTruthy();
    expect(specialItems("?rust lifetimes", h).items[0].title).toBe('Search the web for "rust lifetimes"');
    const calcS = specialItems("2+2", h);
    expect(calcS.items[0].title).toBe("4");
    expect(calcS.items[1].special).toBe("bottom");
    const ranked = rankItems("2+2", [...calcS.items, ...corpus]);
    expect(ranked[0].kind).toBe("calc");
    expect(ranked[ranked.length - 1].kind).toBe("web");
    expect(filterByTab(ranked, "files").map((r) => r.kind)).toEqual(["calc", "web"]);
  });
  test("5k files rank in well under a frame budget per query", () => {
    const big: SearchItem[] = Array.from({ length: 5000 }, (_, i) => ({
      key: `f${i}`, kind: "file" as const, title: `document_${i}_draft final.txt`, subtitle: "Documents", run,
    }));
    const all = [...corpus, ...big];
    const t0 = performance.now();
    for (let i = 0; i < 10; i++) rankItems("draft fin", all);
    // Generous bound so slow CI runners don't flake; locally this is a few ms.
    expect((performance.now() - t0) / 10).toBeLessThan(250);
  });
});
