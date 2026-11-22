// Desktop groups ("fences") are a pure view: these tests pin down validation and placement.
import { describe, expect, test } from "bun:test";
import {
  DEFAULT_DESKTOP_GROUPS, UNSORTED_ID, arrangeDesktop, placeItem, readDesktopGroups, ruleMatches, setAllCollapsed, setCollapsed,
  type DesktopItemLike,
} from "../utils/desktopGroups";

const item = (name: string, o: Partial<DesktopItemLike> = {}): DesktopItemLike => ({
  name, path: `C:\\Users\\u\\Desktop\\${name}`, isDir: false, ext: name.includes(".") ? name.split(".").pop()! : "", isShortcut: false, ...o,
});

describe("rules", () => {
  test("type rules", () => {
    expect(ruleMatches("folders", item("Projects", { isDir: true }))).toBe(true);
    expect(ruleMatches("shortcuts", item("Chrome.lnk", { isShortcut: true }))).toBe(true);
    expect(ruleMatches("images", item("Shot.PNG", { ext: "PNG" }))).toBe(true);
    expect(ruleMatches("images", item("photos.png", { isDir: true }))).toBe(false);
    expect(ruleMatches("installers", item("setup.msi"))).toBe(true);
    expect(ruleMatches("code", item("notes.docx"))).toBe(false);
  });
});

describe("readDesktopGroups", () => {
  test("missing or malformed config falls back to a copy of the defaults", () => {
    const a = readDesktopGroups(undefined);
    expect(a).toEqual(DEFAULT_DESKTOP_GROUPS);
    a.groups[0].name = "changed";
    expect(DEFAULT_DESKTOP_GROUPS.groups[0].name).toBe("Apps");
    expect(readDesktopGroups({ groups: "nope" })).toEqual(DEFAULT_DESKTOP_GROUPS);
  });
  test("hand-edited groups are cleaned up", () => {
    const cfg = readDesktopGroups({
      autoSort: false,
      groups: [
        { id: "work", name: "  Work  ", color: "red", rules: ["documents", "bogus"], paths: ["C:\\a", 5] },
        { id: "work", name: "", color: "#112233" },
        { id: UNSORTED_ID, name: "sneaky" },
        null,
      ],
    });
    expect(cfg.autoSort).toBe(false);
    expect(cfg.showUnsorted).toBe(true);
    expect(cfg.groups).toHaveLength(3);
    expect(cfg.groups[0]).toMatchObject({ id: "work", name: "Work", color: "#60A5FA", rules: ["documents"], paths: ["C:\\a"] });
    expect(cfg.groups[1].id).not.toBe("work");
    expect(cfg.groups[1].name).toBe("Group");
    expect(cfg.groups[2].id).not.toBe(UNSORTED_ID);
    expect(readDesktopGroups({ groups: Array.from({ length: 40 }, (_, i) => ({ id: `g${i}` })) }).groups).toHaveLength(24);
  });
});

describe("arrangeDesktop", () => {
  const items = [
    item("Chrome.lnk", { isShortcut: true }),
    item("Projects", { isDir: true }),
    item("report.pdf"),
    item("song.mp3"),
    item("mystery.xyz"),
  ];
  test("every item lands in exactly one section", () => {
    const out = arrangeDesktop(items, DEFAULT_DESKTOP_GROUPS);
    const names = (id: string) => out.find((g) => g.group.id === id)!.items.map((i) => i.name);
    expect(names("g-apps")).toEqual(["Chrome.lnk"]);
    expect(names("g-folders")).toEqual(["Projects"]);
    expect(names("g-docs")).toEqual(["report.pdf"]);
    expect(names("g-media")).toEqual(["song.mp3"]);
    expect(names(UNSORTED_ID)).toEqual(["mystery.xyz"]);
    expect(out.reduce((n, g) => n + g.items.length, 0)).toBe(items.length);
  });
  test("hand placement beats rules and is case-insensitive", () => {
    const cfg = placeItem(DEFAULT_DESKTOP_GROUPS, "c:\\users\\u\\desktop\\REPORT.PDF", "g-media");
    const out = arrangeDesktop(items, cfg);
    expect(out.find((g) => g.group.id === "g-media")!.items.map((i) => i.name)).toContain("report.pdf");
    expect(out.find((g) => g.group.id === "g-docs")!.items).toHaveLength(0);
    const back = placeItem(cfg, items[2].path, null);
    expect(back.groups.every((g) => g.paths.length === 0)).toBe(true);
  });
  test("autoSort off and showUnsorted off", () => {
    const out = arrangeDesktop(items, { ...DEFAULT_DESKTOP_GROUPS, autoSort: false, showUnsorted: false });
    expect(out.every((g) => g.items.length === 0)).toBe(true);
    expect(out.some((g) => g.group.id === UNSORTED_ID)).toBe(false);
  });
  test("collapse helpers do not mutate", () => {
    const c = setCollapsed(DEFAULT_DESKTOP_GROUPS, "g-apps", true);
    expect(c.groups[0].collapsed).toBe(true);
    expect(DEFAULT_DESKTOP_GROUPS.groups[0].collapsed).toBe(false);
    expect(setAllCollapsed(c, false).groups.every((g) => !g.collapsed)).toBe(true);
  });
});
