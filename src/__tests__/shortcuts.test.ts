import { describe, expect, it } from "bun:test";
import { APP_KEYS, comboFromEvent, comboProblem, normalizeCombo, shortcutsFor, SIMPLE, snipComboNote, WINDOWS_KEYS, withShortcut, withSimpleShortcuts } from "../keys/shortcuts";
import { DEFAULT_SNIP_SETTINGS } from "../snip/api";
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

  it("no Lens shortcut on the sheet is a Windows key, an everyday app key or a duplicate", () => {
    // Every row, changeable here or not: Snip's old default (Ctrl+Shift+S, Save As) failed this.
    const all = shortcutsFor(withSimpleShortcuts(sampleConfig()));
    const single = all.filter((s) => !s.keys.includes("…") && !s.keys.includes("Arrows"));
    for (const s of single) {
      const c = normalizeCombo(s.keys);
      expect(WINDOWS_KEYS).not.toContain(c);
      // Alt+Space is the one known exception (the launcher, as in PowerToys Run); it gets a note.
      if (s.id !== "palette") expect(comboProblem(s.keys, s.id, all)).toBeNull();
      expect(APP_KEYS).not.toContain(c);
    }
    const keys = single.map((s) => normalizeCombo(s.keys));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("Snip's default is off Save As, and the sheet shows the shortcut Snip really has", () => {
    expect(SIMPLE.snip).toBe("Ctrl+Alt+X");
    expect(DEFAULT_SNIP_SETTINGS.hotkey).toBe(SIMPLE.snip);
    expect(APP_KEYS).toContain("Ctrl+Shift+S");
    const row = (other?: { snip?: string }) => shortcutsFor(sampleConfig(), other).find((s) => s.id === "snip")!;
    expect(row().keys).toBe("Ctrl+Alt+X");
    expect(row({ snip: "Ctrl+Alt+Shift+4" }).keys).toBe("Ctrl+Alt+Shift+4");
    expect(row({ snip: "  " }).keys).toBe("Ctrl+Alt+X");
  });

  it("Snip's shortcut field says what a clashing choice would break", () => {
    expect(snipComboNote("Ctrl+Alt+X", sampleConfig())).toBeNull();
    expect(snipComboNote("")).toBeNull();
    const saveAs = snipComboNote("ctrl+shift+s");
    expect(saveAs?.level).toBe("note");
    expect(saveAs?.message).toContain("Save As");
    expect(snipComboNote("Win+Shift+S")?.level).toBe("block");
    // Another Lens shortcut (needs the config to know them).
    expect(snipComboNote(SIMPLE.command, withSimpleShortcuts(sampleConfig()))?.message).toContain("Ask Lens");
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
