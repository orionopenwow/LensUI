import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { WindowRule } from "../types/generated";
import { appKey, buildRows, protectionQueries, summaryLine, withButtons } from "../windowapps/model";

const rule = (match: string, exclude: boolean): WindowRule => ({ match, opacity: null, inactiveOpacity: null, frame: "default", corners: "default", exclude });
const running = [
  { processName: "Notepad.exe", exePath: "C:\\Windows\\notepad.exe" },
  { processName: "notepad.exe", exePath: "C:\\Windows\\notepad.exe" },
  { processName: "chrome.exe", exePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" },
  { processName: "Game-Win64-Shipping.exe", exePath: "D:\\Games\\Fortnite\\Game-Win64-Shipping.exe" },
  { processName: "Code.exe", exePath: "C:\\Code\\Code.exe" },
];

describe("apps and window buttons", () => {
  test("names compare the way the engine compares them", () => {
    expect(appKey("C:\\Windows\\NOTEPAD.EXE")).toBe("notepad");
    expect(appKey(" obs64 ")).toBe("obs64");
    expect(appKey("a/b/Code.exe")).toBe("code");
    expect(appKey("")).toBe("");
    // The same rule as win_rules::normalize_process_name.
    const rust = readFileSync(join(import.meta.dir, "../../src-tauri/src/win_rules.rs"), "utf8");
    expect(rust).toContain("pub fn normalize_process_name");
    expect(rust).toContain('strip_suffix(".exe")');
  });

  test("asks about running apps by full path and about excluded names once each", () => {
    const q = protectionQueries(running, ["SearchHost.exe", "notepad.exe"]);
    expect(q.map((x) => x.key)).toEqual(["notepad", "chrome", "game-win64-shipping", "code", "searchhost"]);
    // By path, so a game is recognised by its folder.
    expect(q.find((x) => x.key === "game-win64-shipping")?.query).toContain("Fortnite");
  });

  test("protected apps get a lock and no switch; excluded and left-alone apps have no buttons", () => {
    const rows = buildRows(running, ["Notepad.exe", "SearchHost.exe"], [rule("code", true), rule("chrome", false)], new Set(["game-win64-shipping", "searchhost"]));
    const by = Object.fromEntries(rows.map((r) => [r.key, r]));
    expect(by.chrome).toMatchObject({ running: true, protected: false, buttons: true, leftAlone: false });
    expect(by.notepad).toMatchObject({ running: true, buttons: false, protected: false });
    expect(by.code).toMatchObject({ leftAlone: true, buttons: false });
    expect(by["game-win64-shipping"]).toMatchObject({ protected: true, buttons: false, leftAlone: false });
    expect(by.searchhost).toMatchObject({ protected: true, running: false });
    // One row per app; switchable running apps first, protected ones last.
    expect(rows.map((r) => r.key)).toEqual(["chrome", "code", "notepad", "game-win64-shipping", "searchhost"]);
    expect(summaryLine(rows)).toBe("5 apps · 2 without Lens buttons · 2 protected");
    expect(summaryLine([])).toBe("0 apps");
  });

  test("a protected app stays protected even if a rule or the list names it", () => {
    const rows = buildRows(running, ["Game-Win64-Shipping.exe"], [rule("game-win64-shipping", true)], new Set(["game-win64-shipping"]));
    expect(rows.find((r) => r.key === "game-win64-shipping")).toMatchObject({ protected: true, leftAlone: false, buttons: false });
  });

  test("switching buttons off adds the app once; on removes every spelling and nothing else", () => {
    const base = ["SearchHost.exe", "lens-ui.exe"];
    const off = withButtons(base, "C:\\Windows\\Notepad.exe", false);
    expect(off).toEqual(["SearchHost.exe", "lens-ui.exe", "notepad.exe"]);
    expect(withButtons(off, "NOTEPAD", false)).toBe(off);
    expect(withButtons([...off, "Notepad"], "notepad.exe", true)).toEqual(base);
    expect(withButtons(base, "notepad.exe", true)).toBe(base);
    expect(withButtons(base, "  ", false)).toBe(base);
  });

  test("the card is mounted with the window rules and writes through the one settings writer", () => {
    const cc = readFileSync(join(import.meta.dir, "../surfaces/ControlCenterSurface.tsx"), "utf8");
    expect(cc).toContain("<WindowAppsCard config={config} onUpdateConfig={updateConfig} />");
    const card = readFileSync(join(import.meta.dir, "../components/WindowAppsCard.tsx"), "utf8");
    expect(card).toContain("onUpdateConfig(");
    expect(card).not.toContain("save_config_cmd");
    expect(card).not.toMatch(/\stitle=/);
  });
});
