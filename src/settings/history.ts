// Settings › Quick settings › Recently changed: how one entry of the settings history reads.
// The history itself is kept by the settings writer (src-tauri/src/settings_history.rs); this file
// only turns its paths and values into short plain words. Pure; tested in settingsQuickWins.test.ts.
import type { SettingsHistoryEntry, SettingChange } from "../types/generated";

/** How many entries the strip shows. */
export const SHOWN = 5;

/** Names for the settings people change most. Anything else gets its last path segment in words. */
const NAMES: Record<string, string> = {
  "theme.preset": "Theme",
  "theme.mode": "Dark or light",
  "theme.accentMode": "Accent colour",
  "theme.customAccent": "Accent colour",
  "theme.accentStrength": "Accent strength",
  "theme.glassOpacity": "Opacity",
  "theme.borderRadius": "Roundness",
  "theme.blur": "Blur",
  "theme.accentTintStrength": "Tint",
  "theme.writeWindowsAccent": "Accent in Windows",
  "dock.style": "Dock style",
  "dock.iconSize": "Dock icon size",
  "dock.position": "Dock position",
  "dock.alignment": "Dock alignment",
  "dock.autoHide": "Dock auto-hide",
  "dock.pinnedApps": "Dock apps",
  "dock.locked": "Dock lock",
  "dock.livePreviews": "Window previews",
  "topBar.enabled": "Top Bar",
  "topBar.autoHide": "Top Bar auto-hide",
  "func.hideNativeTaskbar": "Hide Windows taskbar",
  "func.runOnStartup": "Start with Windows",
  "func.clipboardHistory": "Clipboard history",
  "windowControls.enabled": "Window buttons",
  "windowControls.style": "Window button style",
  "windowControls.order": "Window button order",
  "windowControls.position": "Window button side",
  "windowControls.excludedProcesses": "Apps without window buttons",
  "windowControls.frameStyle": "Window border",
  "windowControls.frameBorderEnabled": "Window border",
  "iconStyle.theme": "Icon style",
  "iconStyle.shape": "Icon shape",
  "folderStyle.theme": "Folder colour",
  themeSchedule: "Day and night",
  "hotCorners.enabled": "Hot corners",
  "altDrag.enabled": "Alt+drag",
  "tiling.enabled": "Window tiling",
  "mcp.enabled": "Agent connections",
  "ai.enabled": "AI",
};

/** Set along with another setting, never chosen on their own: not used to name an entry. */
const DERIVED = new Set(["theme.surfaceHex"]);

/** "glassOpacity" → "Glass opacity"; "hide_native_taskbar" → "Hide native taskbar". */
export function words(segment: string): string {
  const s = segment
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim()
    .toLowerCase();
  return s ? s[0].toUpperCase() + s.slice(1) : "Setting";
}

export function settingName(path: string): string {
  if (NAMES[path]) return NAMES[path];
  // A value inside a named group ("themeSchedule.enabled") belongs to it.
  const parent = Object.keys(NAMES).find((k) => path.startsWith(`${k}.`));
  if (parent) return NAMES[parent];
  return words(path.split(".").pop() ?? path);
}

/** A value short enough to show, or null. */
export function valueText(v: unknown): string | null {
  if (typeof v === "boolean") return v ? "On" : "Off";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);
  if (typeof v === "string") {
    const t = v.trim();
    if (!t || t.length > 22) return null;
    if (/^#[0-9a-f]{3,8}$/i.test(t)) return t.toUpperCase();
    return words(t);
  }
  return null;
}

export interface EntryText {
  /** "Theme", or "Theme and 2 more". */
  name: string;
  /** "Obsidian → Alabaster", "On → Off", or "" when the values don't fit in words. */
  detail: string;
  /** What Undo says to a screen reader. */
  undoLabel: string;
}

export function entryText(entry: Pick<SettingsHistoryEntry, "changes">): EntryText {
  const changes: SettingChange[] = entry.changes ?? [];
  const named = changes.filter((c) => !DERIVED.has(c.path));
  const shown = named.length ? named : changes;
  // Two paths with the same name ("Accent colour" from mode and colour) are one setting.
  const names = [...new Set(shown.map((c) => settingName(c.path)))];
  const first = names[0] ?? "A setting";
  const name = names.length > 1 ? `${first} and ${names.length - 1} more` : first;
  let detail = "";
  if (names.length === 1) {
    const c = shown[shown.length - 1];
    const a = valueText(c?.before);
    const b = valueText(c?.after);
    if (a && b) detail = `${a} → ${b}`;
  }
  return { name, detail, undoLabel: `Undo ${name.toLowerCase().startsWith("a setting") ? "this change" : `the change to ${name}`}` };
}

/** "Just now", "4 min ago", "2 h ago", "Yesterday", "3 days ago". */
export function agoText(atMs: number, nowMs: number): string {
  const s = Math.max(0, Math.round((nowMs - atMs) / 1000));
  if (s < 45) return "Just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "Yesterday" : `${d} days ago`;
}
