// Settings / Themes quick wins left from the Fable pass (#143):
//   "Recently changed" with Undo (src/settings/history.ts, src-tauri/src/settings_history.rs),
//   palette chips that copy their colour (src/wallpapers/model.ts, WallpaperPicker.tsx; B-145),
//   focus on the page heading after sidebar navigation (src/settings/navKeys.ts),
//   the Dock menu's "Next wallpaper" and "Don't style this app" (src/dock/styleMenu.ts).
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SHOWN, agoText, entryText, settingName, valueText, words } from "../settings/history";
import { stepIndex, stepSidebarFromHeading } from "../settings/navKeys";
import { copyablePalette, hexText } from "../wallpapers/model";
import { leftAlone, processKey, styleRow, stylingOn, withLeftAlone } from "../dock/styleMenu";
import type { WindowRule } from "../types/generated";

const ROOT = join(import.meta.dir, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

describe("Recently changed: how an entry reads", () => {
  test("named settings, values and the arrow", () => {
    expect(entryText({ changes: [{ path: "theme.glassOpacity", before: 0.96, after: 0.8 }] })).toEqual({
      name: "Opacity",
      detail: "0.96 → 0.8",
      undoLabel: "Undo the change to Opacity",
    });
    expect(entryText({ changes: [{ path: "func.hideNativeTaskbar", before: false, after: true }] }).detail).toBe("Off → On");
    expect(entryText({ changes: [{ path: "dock.style", before: "floating", after: "slim" }] }).detail).toBe("Floating → Slim");
    expect(entryText({ changes: [{ path: "theme.customAccent", before: "#60a5fa", after: "#f472b6" }] }).detail).toBe("#60A5FA → #F472B6");
  });

  test("a theme switch is named by its preset, not by the derived surface colour", () => {
    const t = entryText({
      changes: [
        { path: "theme.preset", before: "obsidian", after: "alabaster-daylight" },
        { path: "theme.surfaceHex", before: "#09090b", after: "#fafafa" },
      ],
    });
    expect(t.name).toBe("Theme");
    expect(t.detail).toBe("Obsidian → Alabaster daylight");
  });

  test("several settings: the first and a count; one setting from two paths is one", () => {
    expect(
      entryText({
        changes: [
          { path: "dock.style", before: "a", after: "b" },
          { path: "dock.iconSize", before: 40, after: 48 },
          { path: "dock.position", before: "bottom", after: "left" },
        ],
      }).name,
    ).toBe("Dock style and 2 more");
    const accent = entryText({
      changes: [
        { path: "theme.accentMode", before: "windows", after: "custom" },
        { path: "theme.customAccent", before: "#000000", after: "#60A5FA" },
      ],
    });
    expect(accent.name).toBe("Accent colour");
  });

  test("unknown settings get plain words; long or structured values show no detail", () => {
    expect(words("hide_native_taskbar")).toBe("Hide native taskbar");
    expect(settingName("cursorFx.shakeToFind")).toBe("Shake to find");
    expect(settingName("themeSchedule.enabled")).toBe("Day and night");
    expect(valueText([1, 2])).toBeNull();
    expect(valueText("a very long value that does not fit")).toBeNull();
    expect(entryText({ changes: [{ path: "dock.pinnedApps", before: [], after: [{}] }] }).detail).toBe("");
  });

  test("times", () => {
    const now = 10_000_000;
    expect(agoText(now - 5_000, now)).toBe("Just now");
    expect(agoText(now - 4 * 60_000, now)).toBe("4 min ago");
    expect(agoText(now - 2 * 3_600_000, now)).toBe("2 h ago");
    expect(agoText(now - 26 * 3_600_000, now)).toBe("Yesterday");
    expect(agoText(now - 3 * 86_400_000, now)).toBe("3 days ago");
    expect(agoText(now + 5_000, now)).toBe("Just now");
  });

  test("the strip: on Quick settings, five rows, weighted Undo, nothing sent anywhere", () => {
    expect(SHOWN).toBe(5);
    const cc = read("src/surfaces/ControlCenterSurface.tsx");
    expect(cc).toContain('{tab === "quick" && <RecentlyChanged />}');
    const strip = read("src/settings/RecentlyChanged.tsx");
    expect(strip).toContain('invoke<SettingsHistoryEntry[]>("settings_undo_cmd", { id: entry.id })');
    expect(strip).toContain('pressProps({ weight: "medium", pending: busy === entry.id })');
    expect(strip).not.toMatch(/fetch\(|https?:\/\//);
    expect(read("tools/polish/feel-migrated.txt")).toContain("src/settings/RecentlyChanged.tsx");
  });

  test("the writer records, housekeeping saves don't, and Undo goes through the normal save", () => {
    const cfg = read("src-tauri/src/config.rs");
    expect(cfg).toContain("crate::settings_history::record(old_bytes.as_deref(), &new_doc);");
    expect(cfg.match(/settings_history::quietly\(\|\| save_config\(/g)?.length).toBe(3);
    const theme = read("src-tauri/src/commands/theme.rs");
    expect(theme).toContain("history::quietly(|| save_config_cmd(app, state, reverted))?;");
    expect(theme).toContain("crate::settings_history::quietly(|| save_config(&guard))");
    const hist = read("src-tauri/src/settings_history.rs");
    for (const w of ["apikey", "token", "secret", "password"]) expect(hist).toContain(`"${w}"`);
  });
});

describe("focus on the page heading after sidebar navigation", () => {
  test("stepIndex wraps and knows Home/End", () => {
    expect(stepIndex(0, 4, "ArrowDown")).toBe(1);
    expect(stepIndex(3, 4, "ArrowDown")).toBe(0);
    expect(stepIndex(0, 4, "ArrowUp")).toBe(3);
    expect(stepIndex(-1, 4, "ArrowDown")).toBe(0);
    expect(stepIndex(-1, 4, "ArrowUp")).toBe(3);
    expect(stepIndex(2, 4, "Home")).toBe(0);
    expect(stepIndex(2, 4, "End")).toBe(3);
    expect(stepIndex(2, 4, "Tab")).toBeNull();
    expect(stepIndex(0, 0, "ArrowDown")).toBeNull();
  });

  test("↑/↓ on the heading move the sidebar from the open page; other keys stay with the page", () => {
    const focused: string[] = [];
    const btn = (id: string, current = false) => ({
      id,
      getAttribute: (n: string) => (n === "aria-current" && current ? "page" : null),
      focus: () => focused.push(id),
    });
    const root = { querySelectorAll: () => [btn("quick"), btn("theme", true), btn("dock"), btn("desktop")] } as unknown as ParentNode;
    expect(stepSidebarFromHeading("ArrowDown", root)).toBe(true);
    expect(stepSidebarFromHeading("ArrowUp", root)).toBe(true);
    expect(focused).toEqual(["dock", "quick"]);
    for (const k of ["Home", "End", "PageDown", " ", "Enter", "Tab"]) expect(stepSidebarFromHeading(k, root)).toBe(false);
    // Search results showing (no list): nothing to move to.
    expect(stepSidebarFromHeading("ArrowDown", { querySelectorAll: () => [] } as unknown as ParentNode)).toBe(false);
  });

  test("wired: sidebar clicks ask for the heading, the heading takes focus without scrolling", () => {
    const nav = read("src/settings/SettingsNav.tsx");
    expect(nav).toContain("onClick={() => onNavigate(p.id, undefined, true)}");
    // Search results don't move focus (they scroll to a section instead).
    expect(nav).toContain("onNavigate(r.page, r.section);");
    const cc = read("src/surfaces/ControlCenterSurface.tsx");
    expect(cc).toContain("tabIndex={-1}");
    expect(cc).toContain("headingRef.current?.focus({ preventScroll: true });");
    expect(cc).toContain("stepSidebarFromHeading(e.key)");
  });
});

describe("palette chips copy their colour", () => {
  test("hexText", () => {
    expect(hexText("#abc")).toBe("#AABBCC");
    expect(hexText("4a6b8c")).toBe("#4A6B8C");
    expect(hexText(" #4A6B8C ")).toBe("#4A6B8C");
    expect(hexText("rgb(1,2,3)")).toBeNull();
    expect(hexText("#12345")).toBeNull();
  });

  test("only real colours are offered, never the grey stand-in, at most five", () => {
    const meta = { palette: [] as string[] };
    expect(copyablePalette({ palette: ["#111111", "#222222"], item: {} as never, meta: meta as never })).toEqual([]);
    expect(copyablePalette({ palette: ["#aaa", "nope", "#bbbbbb", "#1", "#c0c0c0", "#d0d0d0", "#e0e0e0", "#f0f0f0"], item: undefined, meta: meta as never })).toEqual([
      "#AAAAAA",
      "#BBBBBB",
      "#C0C0C0",
      "#D0D0D0",
      "#E0E0E0",
    ]);
  });

  test("no nested buttons: the card's chips are pictures; the keyboard gets real buttons under the fan", () => {
    const src = read("src/wallpapers/WallpaperPicker.tsx");
    const card = src.slice(src.indexOf("const FanCard"), src.indexOf("const Key:"));
    expect(card.match(/<button/g)?.length).toBe(1);
    expect(card).toContain('<i key={`${hex}-${i}`} className="wsw-chip"');
    expect(src).toContain('className="wsw-swatches" role="group" aria-label="Colours in this wallpaper"');
    expect(src).toContain("aria-label={done ? `${hex} copied` : `Copy ${hex}`}");
    expect(src).toContain("toast(`Copied ${hex}`)");
  });

  test("B-145: Enter on a focused picker button is only that button's click", () => {
    const src = read("src/wallpapers/WallpaperPicker.tsx");
    const onKey = src.slice(src.indexOf("const onKey = "), src.indexOf("const act: Record<string"));
    expect(onKey).toContain('if (e.key === "Enter" && (e.target as HTMLElement).closest("button")) return;');
  });
});

describe("Dock menu: Next wallpaper and Don't style this app", () => {
  const rule = (match: string, extra: Partial<WindowRule> = {}): WindowRule => ({
    match,
    opacity: null,
    frame: "default",
    corners: "default",
    exclude: false,
    inactiveOpacity: null,
    ...extra,
  });
  const on = { windowControls: { enabled: true, style: "", order: "", position: "", frameBorderEnabled: true, excludedProcesses: [] } } as never;
  const off = { windowControls: { enabled: false, style: "", order: "", position: "", frameBorderEnabled: false, excludedProcesses: [] } } as never;

  test("process names compare like win_rules", () => {
    expect(processKey("C:\\Apps\\Code.EXE")).toBe("code");
    expect(processKey("notepad")).toBe("notepad");
    expect(leftAlone([rule("Code.exe", { exclude: true })], "code.exe")).toBe(true);
  });

  test("the row only where Lens styles windows, after Lens Core answered, never for protected apps", () => {
    expect(stylingOn(on)).toBe(true);
    expect(stylingOn(off)).toBe(false);
    expect(styleRow(on, "Code.exe", [], false)).toEqual({ label: "Don't style this app", alone: true });
    expect(styleRow(off, "Code.exe", [], false)).toBeNull();
    expect(styleRow(on, "Code.exe", null, false)).toBeNull();
    expect(styleRow(on, "Code.exe", [], null)).toBeNull();
    expect(styleRow(on, "Code.exe", [], true)).toBeNull();
    expect(styleRow(on, undefined, [], false)).toBeNull();
    // Left alone: the way back is always offered.
    expect(styleRow(off, "Code.exe", [rule("code", { exclude: true })], false)).toEqual({ label: "Style this app again", alone: false });
  });

  test("withLeftAlone adds, keeps and removes only what it should", () => {
    const keep = rule("terminal", { opacity: 90 });
    const added = withLeftAlone([keep], "Code.exe", true);
    expect(added).toEqual([keep, rule("code", { exclude: true })]);
    // Back again: the rule that only excluded goes away; other rules are untouched.
    expect(withLeftAlone(added, "code", false)).toEqual([keep]);
    // An existing rule with its own settings keeps them.
    const own = [rule("Code.exe", { opacity: 80 })];
    const alone = withLeftAlone(own, "code", true);
    expect(alone).toEqual([rule("Code.exe", { opacity: 80, exclude: true })]);
    expect(withLeftAlone(alone, "code", false)).toEqual(own);
  });

  test("wired into the menus, failures shown, Undo on the toast", () => {
    const src = read("src/dock/DockContextMenu.tsx");
    expect(src).toContain('label="Next wallpaper"');
    expect(src).toContain('dockDo("wallpapers_step_cmd", { direction: "next", hour: new Date().getHours() }, "change the wallpaper")');
    expect(src).toContain('invoke("set_window_rules_cmd", { rules: withLeftAlone(rules, process, alone) })');
    expect(src).toContain('action: { label: "Undo"');
    expect(src).toContain("dockFail(alone ? `stop styling ${name}` : `style ${name} again`)");
  });
});
