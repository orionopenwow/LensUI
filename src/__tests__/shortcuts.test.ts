import { describe, expect, it } from "bun:test";
import { comboFromEvent, comboProblem, normalizeCombo, shortcutsFor, SIMPLE, WINDOWS_KEYS, withShortcut, withSimpleShortcuts } from "../keys/shortcuts";
import { sampleConfig } from "./fixtures";

describe("keyboard shortcuts", () => {
  it("normalises combinations", () => {
    expect(normalizeCombo("alt + space")).toBe("Alt+Space");
    expect(normalizeCombo("w+alt+ctrl")).toBe("Ctrl+Alt+W");
    expect(normalizeCombo("super+L")).toBe("Win+L");
  });

  it("the simple defaults never clash with Windows, apps or each other", () => {
    const all = shortcutsFor(withSimpleShortcuts(sampleConfig()));
    for (const s of all.filter((x) => x.editable)) {
      const p = comboProblem(s.keys, s.id, all);
      expect(p?.level === "block").toBe(false);
    }
    const editable = all.filter((s) => s.editable).map((s) => normalizeCombo(s.keys));
    expect(new Set(editable).size).toBe(editable.length);
  });

  it("refuses Windows' own keys and another Lens shortcut, warns about everyday app keys", () => {
    const all = shortcutsFor(sampleConfig());
    for (const k of ["Win+L", "Ctrl+Alt+Delete", "Alt+Tab", "Alt+F4"]) {
      expect(WINDOWS_KEYS).toContain(normalizeCombo(k));
      expect(comboProblem(k, "widgets", all)?.level).toBe("block");
    }
    expect(comboProblem(all.find((s) => s.id === "palette")!.keys, "widgets", all)?.level).toBe("block");
    expect(comboProblem("Ctrl+S", "widgets", all)?.level).toBe("note");
    expect(comboProblem("W", "widgets", all)?.level).toBe("block");
    expect(comboProblem("Shift+W", "widgets", all)?.level).toBe("block");
    expect(comboProblem("Ctrl+Alt+B", "widgets", all)).toBeNull();
  });

  it("changing one shortcut touches only that key; reset touches only shortcuts", () => {
    const c = sampleConfig();
    const next = withShortcut(c, "widgets", "ctrl+alt+b");
    expect(next.func.widgetsHotkey).toBe("Ctrl+Alt+B");
    expect({ ...next, func: { ...next.func, widgetsHotkey: c.func.widgetsHotkey } }).toEqual(c);
    const reset = withSimpleShortcuts(next);
    expect(reset.func.widgetsHotkey).toBe(SIMPLE.widgets);
    expect(reset.func.paletteHotkey).toBe(SIMPLE.palette);
    expect(reset.theme).toEqual(c.theme);
    expect(reset.dock).toEqual(c.dock);
  });

  it("reads a key press", () => {
    const ev = (o: Partial<Parameters<typeof comboFromEvent>[0]>) => comboFromEvent({ ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, key: "", code: "", ...o });
    expect(ev({ ctrlKey: true, altKey: true, key: "w", code: "KeyW" })).toBe("Ctrl+Alt+W");
    expect(ev({ altKey: true, key: " ", code: "Space" })).toBe("Alt+Space");
    expect(ev({ ctrlKey: true, key: "Control", code: "ControlLeft" })).toBe("");
  });
});
