// Every keyboard shortcut Lens uses, in one place, with plain names. The cheat sheet in
// Settings › Windows & Keys reads this list; rebinding checks a combination against Windows'
// own keys, the other Lens shortcuts and the shortcuts most apps rely on. Pure (tested).
import type { LensConfig } from "../types/lens";

export type ShortcutId = "palette" | "command" | "widgets" | "magic" | "snip" | "pause" | "dock-n" | "tiling";

export interface Shortcut {
  id: ShortcutId;
  /** What it does, in plain words. */
  name: string;
  /** The keys now (from the config where it can be changed here). */
  keys: string;
  /** The simple default. */
  simple: string;
  /** Changeable from the cheat sheet (stored in the main config). */
  editable: boolean;
  /** Where else it is set, for the ones changed elsewhere. */
  where?: string;
  /** Only active when this feature is on. */
  when?: string;
}

const cmdHotkey = (c: LensConfig): string => {
  const v = (c.command as { hotkey?: unknown } | null | undefined)?.hotkey;
  return typeof v === "string" && v.trim() ? v : SIMPLE.command;
};

/** The simple defaults: one family (Ctrl+Alt + a letter) for Lens, plus Alt+Space for the
 *  launcher people know from PowerToys Run. None of them is a Windows key or an everyday app key. */
export const SIMPLE = {
  palette: "Alt+Space",
  command: "Ctrl+Alt+Space",
  widgets: "Ctrl+Alt+W",
  magic: "Ctrl+Alt+Q",
} as const;

export function shortcutsFor(c: LensConfig): Shortcut[] {
  return [
    { id: "palette", name: "Open the launcher", keys: c.func.paletteHotkey || SIMPLE.palette, simple: SIMPLE.palette, editable: true },
    { id: "command", name: "Ask Lens (Command)", keys: cmdHotkey(c), simple: SIMPLE.command, editable: true, when: "Lens Command is on" },
    { id: "widgets", name: "Open the widgets", keys: c.func.widgetsHotkey || SIMPLE.widgets, simple: SIMPLE.widgets, editable: true },
    { id: "magic", name: "Magic menu for what's under the pointer", keys: SIMPLE.magic, simple: SIMPLE.magic, editable: false, where: "Settings › Magic" },
    { id: "snip", name: "Snip part of the screen", keys: "Ctrl+Shift+S", simple: "Ctrl+Shift+S", editable: false, where: "Snip settings", when: "Snip is on" },
    { id: "pause", name: "Pause Lens's AI", keys: "Ctrl+Alt+Pause", simple: "Ctrl+Alt+Pause", editable: false, where: "Settings › AI › Presence" },
    { id: "dock-n", name: "Open Dock app 1–9", keys: "Alt+1 … Alt+9", simple: "Alt+1 … Alt+9", editable: false, when: "Dock number keys are on" },
    { id: "tiling", name: "Snap and tile windows", keys: "Ctrl+Alt+Arrows", simple: "Ctrl+Alt+Arrows", editable: false, when: "Tiling keys are on" },
  ];
}

/** "alt + SPACE" → "Alt+Space"; "ctrl+alt+w" → "Ctrl+Alt+W". */
export function normalizeCombo(s: string): string {
  const parts = s.split("+").map((p) => p.trim()).filter(Boolean);
  const mods = new Set<string>();
  let key = "";
  for (const p of parts) {
    const l = p.toLowerCase();
    if (l === "ctrl" || l === "control") mods.add("Ctrl");
    else if (l === "alt" || l === "option") mods.add("Alt");
    else if (l === "shift") mods.add("Shift");
    else if (l === "win" || l === "super" || l === "meta" || l === "cmd") mods.add("Win");
    else key = l.length === 1 ? l.toUpperCase() : l[0].toUpperCase() + l.slice(1);
  }
  return [...["Ctrl", "Alt", "Shift", "Win"].filter((m) => mods.has(m)), key].filter(Boolean).join("+");
}

/** Keys Windows keeps for itself or that people use constantly; Lens never takes these. */
export const WINDOWS_KEYS = [
  "Win+L", "Ctrl+Alt+Delete", "Ctrl+Shift+Escape", "Alt+Tab", "Alt+Shift+Tab", "Win+Tab", "Alt+F4", "Alt+Escape",
  "Win+D", "Win+E", "Win+R", "Win+I", "Win+A", "Win+N", "Win+S", "Win+V", "Win+X", "Win+Space", "Win+Shift+S",
  "Win+Period", "Win+Up", "Win+Down", "Win+Left", "Win+Right", "Win+Z", "Win+K", "Win+P", "Win+H", "Win+G", "Win+M",
  "Ctrl+Escape", "Ctrl+Win+Left", "Ctrl+Win+Right", "Ctrl+Win+D", "Ctrl+Win+F4",
].map(normalizeCombo);

/** Shortcuts most apps use; taking one globally breaks it everywhere. */
export const APP_KEYS = [
  "Ctrl+C", "Ctrl+V", "Ctrl+X", "Ctrl+Z", "Ctrl+Y", "Ctrl+A", "Ctrl+S", "Ctrl+Shift+S", "Ctrl+F", "Ctrl+P", "Ctrl+N",
  "Ctrl+O", "Ctrl+W", "Ctrl+T", "Ctrl+Shift+T", "Ctrl+R", "Ctrl+L", "Ctrl+Space", "Alt+W", "Alt+F", "Alt+E",
].map(normalizeCombo);

export interface ComboProblem {
  /** "block": can't be used; "note": works, but worth knowing. */
  level: "block" | "note";
  message: string;
}

/** Why `combo` can't (or shouldn't) be used for shortcut `id`; null when it's fine. */
export function comboProblem(combo: string, id: ShortcutId, all: Shortcut[]): ComboProblem | null {
  const c = normalizeCombo(combo);
  const parts = c.split("+");
  const mods = parts.slice(0, -1);
  const key = parts[parts.length - 1] ?? "";
  if (!key || !mods.length) return { level: "block", message: "Use Ctrl, Alt or Win together with one key." };
  if (mods.length === 1 && mods[0] === "Shift") return { level: "block", message: "Shift alone would type a capital letter. Add Ctrl, Alt or Win." };
  if (WINDOWS_KEYS.includes(c)) return { level: "block", message: `${c} belongs to Windows.` };
  const other = all.find((s) => s.id !== id && normalizeCombo(s.keys) === c);
  if (other) return { level: "block", message: `Already used for "${other.name}".` };
  if (APP_KEYS.includes(c)) return { level: "note", message: `${c} is a shortcut in many apps; it would stop working there.` };
  if (c === "Alt+Space") return { level: "note", message: "Alt+Space also opens a window's own menu in Windows." };
  return null;
}

/** The config with every changeable shortcut back on the simple defaults (nothing else touched). */
export function withSimpleShortcuts(c: LensConfig): LensConfig {
  const command = { ...((c.command as Record<string, unknown> | null) ?? {}), hotkey: SIMPLE.command };
  return { ...c, func: { ...c.func, paletteHotkey: SIMPLE.palette, widgetsHotkey: SIMPLE.widgets }, command };
}

/** The config with one shortcut changed. */
export function withShortcut(c: LensConfig, id: ShortcutId, combo: string): LensConfig {
  const keys = normalizeCombo(combo);
  if (id === "palette") return { ...c, func: { ...c.func, paletteHotkey: keys } };
  if (id === "widgets") return { ...c, func: { ...c.func, widgetsHotkey: keys } };
  if (id === "command") return { ...c, command: { ...((c.command as Record<string, unknown> | null) ?? {}), hotkey: keys } };
  return c;
}

/** Reads a key press as a combination ("" while only modifiers are held). */
export function comboFromEvent(e: { ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean; key: string; code: string }): string {
  const mods = [e.ctrlKey && "Ctrl", e.altKey && "Alt", e.shiftKey && "Shift", e.metaKey && "Win"].filter(Boolean) as string[];
  if (["Control", "Alt", "Shift", "Meta", "OS"].includes(e.key)) return "";
  let key = e.code.startsWith("Key") ? e.code.slice(3) : e.code.startsWith("Digit") ? e.code.slice(5) : e.key;
  if (key === " ") key = "Space";
  if (key.length === 1) key = key.toUpperCase();
  return [...mods, key].join("+");
}
