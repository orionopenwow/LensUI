// The Magic selection bar's view model (docs/plans/SELECTION_BAR.md): which buttons it shows and in
// what order, how labels and hotkey hints look, and the few rules the page itself applies. Pure (no
// React, no Tauri), so it is unit-tested. The backend decides when the bar appears and goes
// (src-tauri/src/clip/bar.rs); this decides what is on it.
import { CATALOG, allActions, recordUse, type ActionDef, type Catalog, type MenuPrefs, type UsageCounts, DEFAULT_PREFS } from "../../context/actions";
import type { BarShow, SelectionBarConfig, SmartDto } from "../../types/generated";
import type { LensConfig } from "../../types/lens";

export const DEFAULT_BAR: SelectionBarConfig = {
  enabled: false,
  labels: "hover",
  showCut: true,
  showCopy: true,
  showPaste: true,
  showSearch: true,
  actions: ["ask", "translate", "explain", "shelf_add"],
  maxActions: 4,
  hotkeys: {},
  searchHotkey: "",
  triggerDrag: true,
  triggerDoubleClick: true,
  triggerTripleClick: true,
  delayMs: 120,
  minChars: 2,
  placement: "below",
  autoHideMs: 4000,
  hideDistancePx: 120,
  smart: true,
  smartOff: [],
  learn: false,
  perApp: {},
  providers: {},
  webResults: true,
  localResults: true,
};

export const MAX_ACTIONS = 9;
export type LabelMode = "off" | "hover" | "always";

/** The bar settings from the config, defaults filled in and values clamped like the backend does. */
export function barSettings(c: Partial<LensConfig> | null | undefined): SelectionBarConfig {
  const raw = ((c as { selectionBar?: Partial<SelectionBarConfig> } | null | undefined)?.selectionBar ?? {}) as Partial<SelectionBarConfig>;
  const s: SelectionBarConfig = { ...DEFAULT_BAR, ...raw };
  const clamp = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : d);
  return {
    ...s,
    labels: ["off", "hover", "always"].includes(s.labels) ? s.labels : "hover",
    placement: ["below", "above", "pointer"].includes(s.placement) ? s.placement : "below",
    actions: Array.isArray(s.actions) ? [...new Set(s.actions.filter((a) => typeof a === "string" && a))].slice(0, MAX_ACTIONS) : DEFAULT_BAR.actions,
    maxActions: clamp(s.maxActions, 3, MAX_ACTIONS, DEFAULT_BAR.maxActions),
    delayMs: clamp(s.delayMs, 0, 600, DEFAULT_BAR.delayMs),
    minChars: clamp(s.minChars, 1, 50, DEFAULT_BAR.minChars),
    autoHideMs: s.autoHideMs === 0 ? 0 : clamp(s.autoHideMs, 1500, 30000, DEFAULT_BAR.autoHideMs),
    hideDistancePx: clamp(s.hideDistancePx, 40, 600, DEFAULT_BAR.hideDistancePx),
    hotkeys: s.hotkeys && typeof s.hotkeys === "object" ? s.hotkeys : {},
    perApp: s.perApp && typeof s.perApp === "object" ? s.perApp : {},
    providers: s.providers && typeof s.providers === "object" ? s.providers : {},
    smartOff: Array.isArray(s.smartOff) ? s.smartOff : [],
  };
}

/** The config with the bar settings patched (only `selectionBar` changes). */
export function withBar(c: LensConfig, patch: Partial<SelectionBarConfig>): LensConfig {
  const cur = ((c as { selectionBar?: SelectionBarConfig }).selectionBar ?? DEFAULT_BAR) as SelectionBarConfig;
  return { ...c, selectionBar: { ...cur, ...patch } } as LensConfig;
}

export type ButtonKind = "clip" | "search" | "smart" | "action" | "more";

export interface BarButton {
  id: string;
  kind: ButtonKind;
  label: string;
  icon: string;
  /** Its own global hotkey, shown as a small hint ("" = none). */
  hotkey: string;
  /** Runs in the backend (keys, Shelf, local smart actions) or in the page. */
  backend: boolean;
  /** AI provider for AI actions ("local" | "default" | "claude"), "" for the rest. */
  provider: string;
}

export interface BarView {
  clipboard: BarButton[];
  search: BarButton | null;
  /** The smart action (first) and your actions, up to the limit. */
  actions: BarButton[];
  /** Everything else for More (the full Magic action list for a selection). */
  more: BarButton[];
  preview: SmartDto | null;
  labels: LabelMode;
}

const CLIP: Record<"cut" | "copy" | "paste", { label: string; icon: string }> = {
  cut: { label: "Cut", icon: "scissors" },
  copy: { label: "Copy", icon: "copy" },
  paste: { label: "Paste", icon: "clipboard-paste" },
};

/** Labels and icons of the smart actions (ids come from src-tauri/src/clip/smart.rs). */
export const SMART: Record<string, { label: string; icon: string; backend: boolean }> = {
  "smart:open_url": { label: "Open in Lens Browser", icon: "globe", backend: false },
  "smart:email": { label: "New e-mail", icon: "mail", backend: true },
  "smart:copy_colour": { label: "Copy colour", icon: "palette", backend: true },
  "smart:show_in_explorer": { label: "Show in Explorer", icon: "folder-open", backend: true },
  "smart:copy_result": { label: "Copy result", icon: "equal", backend: true },
  "smart:convert": { label: "Convert", icon: "arrow-left-right", backend: false },
  "smart:explain_code": { label: "Explain code", icon: "code", backend: false },
};

/** Actions the backend runs itself (src-tauri/src/commands/selection_bar.rs, backend_action). */
export const BACKEND_ACTIONS = new Set(["cut", "copy", "paste", "copy_md", "shelf_add", "micro_save", "clip", "smart:email", "smart:show_in_explorer", "smart:copy_result", "smart:copy_colour"]);

/** Catalogue actions that can go on the bar (surface "selectionBar", plus custom prompt actions). */
export function barCatalogue(prefs: MenuPrefs = DEFAULT_PREFS, catalog: Catalog = CATALOG): ActionDef[] {
  return allActions(prefs, catalog).filter((a) => a.surfaces.includes("selectionBar") && a.contexts.some((c) => c === "selection"));
}

const exeName = (p: string) => (p.split(/[\\/]/).pop() ?? "").toLowerCase();

/** The person's actions for this app: a per-app set when there is one, else the main list. */
export function actionsForApp(s: SelectionBarConfig, app: string): string[] {
  const name = exeName(app);
  const own = Object.entries(s.perApp).find(([k]) => exeName(k) === name)?.[1];
  return own && own.length ? own : s.actions;
}

/**
 * Orders the person's actions: their order, with "learn from use" (off by default) floating
 * frequent ones up, as the right-click menus do. Unknown ids are dropped.
 */
export function orderBarActions(ids: string[], learn: boolean, usage: UsageCounts, byId: Map<string, ActionDef>): ActionDef[] {
  const list = ids.map((id) => byId.get(id)).filter((a): a is ActionDef => !!a);
  if (!learn) return list;
  const idx = new Map(list.map((a, i) => [a.id, i]));
  return [...list].sort((x, y) => (usage[y.id] ?? 0) - (usage[x.id] ?? 0) || idx.get(x.id)! - idx.get(y.id)!);
}

function fromAction(a: ActionDef, s: SelectionBarConfig): BarButton {
  return {
    id: a.id,
    kind: "action",
    label: a.label,
    icon: a.icon,
    hotkey: s.hotkeys[a.id] ?? "",
    backend: BACKEND_ACTIONS.has(a.id),
    provider: a.provider === "none" ? "" : s.providers[a.id] ?? a.provider,
  };
}

/** Everything the bar shows for one selection. */
export function barView(show: BarShow, s: SelectionBarConfig, prefs: MenuPrefs = DEFAULT_PREFS, usage: UsageCounts = {}, catalog: Catalog = CATALOG): BarView {
  const clipboard: BarButton[] = (["cut", "copy", "paste"] as const)
    .filter((k) => show[k])
    .map((k) => ({ id: k, kind: "clip" as const, label: CLIP[k].label, icon: CLIP[k].icon, hotkey: "", backend: true, provider: "" }));
  const search: BarButton | null = s.showSearch
    ? { id: "magic_search", kind: "search", label: "Magic Search", icon: "search", hotkey: s.searchHotkey, backend: false, provider: s.providers.magic_search ?? "default" }
    : null;
  const all = barCatalogue(prefs, catalog);
  const byId = new Map(all.map((a) => [a.id, a]));
  const mine = orderBarActions(actionsForApp(s, show.app), s.learn, usage, byId);
  const smartDef = show.smart && s.smart ? SMART[show.smart.action] : undefined;
  const smart: BarButton[] = [];
  if (show.smart && s.smart) {
    if (smartDef) smart.push({ id: show.smart.action, kind: "smart", label: smartDef.label, icon: smartDef.icon, hotkey: "", backend: smartDef.backend, provider: "" });
    else {
      // A smart kind that maps to a catalogue action (one word → Define).
      const a = byId.get(show.smart.action);
      if (a) smart.push({ ...fromAction(a, s), kind: "smart" });
    }
  }
  const smartIds = new Set(smart.map((b) => b.id));
  const shown = [...smart, ...mine.filter((a) => !smartIds.has(a.id)).map((a) => fromAction(a, s))];
  const top = shown.slice(0, s.maxActions + smart.length);
  const topIds = new Set(top.map((b) => b.id));
  const more = [...shown.slice(top.length), ...all.filter((a) => !topIds.has(a.id) && !shown.some((b) => b.id === a.id)).map((a) => fromAction(a, s))];
  return { clipboard, search, actions: top, more, preview: s.smart ? show.smart ?? null : null, labels: (s.labels as LabelMode) ?? "hover" };
}

/** Records a use for "learn from use" (local counts only). */
export function noteUse(usage: UsageCounts, id: string, s: SelectionBarConfig): UsageCounts {
  return s.learn ? recordUse(usage, id) : usage;
}

/** "Ctrl+Alt+T" → "⌃⌥T" for the small mono hint on a button. */
export function hotkeyHint(combo: string): string {
  if (!combo.trim()) return "";
  const parts = combo.split("+").map((p) => p.trim()).filter(Boolean);
  const map: Record<string, string> = { ctrl: "⌃", control: "⌃", alt: "⌥", shift: "⇧", win: "⊞", super: "⊞", meta: "⊞" };
  return parts.map((p) => map[p.toLowerCase()] ?? (p.length === 1 ? p.toUpperCase() : p)).join("");
}

/** The pressed weight of a bar button (DESIGN.md §5.2): Magic Search is the primary action. */
export function weightOf(b: Pick<BarButton, "kind">): "medium" | "heavy" {
  return b.kind === "search" ? "heavy" : "medium";
}

/** The rise when the bar appears: 4 px from the selection end (up when below it, down when above). */
export function riseFrom(above: boolean): number {
  return above ? -4 : 4;
}

/** Keys the page handles while it has focus (it rarely does: the window never activates). */
export function pageKey(key: string): "hide" | "none" {
  return key === "Escape" ? "hide" : "none";
}

/** What a button press does on the page side. */
export type Run =
  | { type: "backend"; action: string }
  | { type: "search" }
  | { type: "answer"; action: string }
  | { type: "browser"; url: string }
  | { type: "command"; text: string }
  | { type: "more" };

export function runFor(b: BarButton, smart: SmartDto | null): Run {
  if (b.kind === "more") return { type: "more" };
  if (b.kind === "search") return { type: "search" };
  if (b.backend) return { type: "backend", action: b.id };
  if (b.id === "smart:open_url" && smart) return { type: "browser", url: smart.value };
  if (b.id === "smart:convert" && smart) return { type: "command", text: smart.value };
  if (b.id === "command_open") return { type: "command", text: "" };
  if (b.id === "smart:explain_code") return { type: "answer", action: "explain" };
  return { type: "answer", action: b.id };
}

// ---- settings helpers ------------------------------------------------------------------------------

/** Lens keys the backend never lets an action take (src-tauri/src/magic/conflicts.rs LENS_HOTKEYS). */
export const LENS_HOTKEYS = ["Ctrl+Alt+S", "Ctrl+Alt+Space", "Alt+Shift+S", "Alt+Shift+L", "Ctrl+Alt+Shift+S", "Ctrl+Alt+M", "Alt+Space"];

const norm = (k: string) => {
  const parts = k.split("+").map((p) => p.trim().toLowerCase()).filter(Boolean);
  const order = ["ctrl", "alt", "shift", "win"];
  const mods = order.filter((m) => parts.includes(m) || (m === "ctrl" && parts.includes("control")));
  const key = parts.filter((p) => !["ctrl", "control", "alt", "shift", "win", "super", "meta"].includes(p)).join("");
  return [...mods, key].join("+");
};

/**
 * Why a direct hotkey can't (or shouldn't) be used for a bar action; null when fine. Same rules as
 * the shortcuts sheet (Windows keys, other Lens shortcuts, everyday app keys), plus the bar's own
 * other hotkeys and Lens's fixed keys.
 */
export function barHotkeyProblem(
  combo: string,
  actionId: string,
  s: SelectionBarConfig,
  sheet: (combo: string) => { level: "block" | "note"; message: string } | null,
): { level: "block" | "note"; message: string } | null {
  if (!combo.trim()) return null;
  const c = norm(combo);
  if (LENS_HOTKEYS.some((k) => norm(k) === c)) return { level: "block", message: "Lens already uses this shortcut." };
  const mine = Object.entries({ ...s.hotkeys, magic_search: s.searchHotkey }).find(([id, k]) => id !== actionId && k && norm(k) === c);
  if (mine) return { level: "block", message: `Already used for ${mine[0] === "magic_search" ? "Magic Search" : mine[0].replace(/_/g, " ")}.` };
  return sheet(combo);
}

/** Moves an action one step up or down in the person's list. */
export function moveAction(list: string[], id: string, delta: -1 | 1): string[] {
  const i = list.indexOf(id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= list.length) return list;
  const out = [...list];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

export function addAction(list: string[], id: string): string[] {
  return list.includes(id) || list.length >= MAX_ACTIONS ? list : [...list, id];
}
