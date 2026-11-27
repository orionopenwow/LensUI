// Pure logic for the "Lens ›" row in Lens's own right-click menus (docs/RIGHTCLICK.md, "Lens in
// every menu"). The row pans the menu sideways into the Magic actions for the same item; picking
// one opens the Magic window for that item and runs it there. No React and no Tauri here.
import { DEFAULT_PREFS, type MenuPrefs, type UsageCounts } from "../context/actions";
import { NO_CAPS, rowsFor, type Caps, type Row } from "./model";
import type { LensTargetInput, MagicConfig, MagicTarget } from "./contract";

/** Lens items a surface may hand to the Magic window (the backend refuses anything else). */
export type LensItemKind = "dockItem" | "shelfItem" | "notification";

export interface LensItem {
  kind: LensItemKind;
  id: string;
  label: string;
  path?: string | null;
}

/** Hover this long on the "Lens ›" row before it pans (a pointer passing over it doesn't). */
export const PAN_INTENT_MS = 160;
/** Rows shown in the panel; the rest are one "More in Lens…" away (the Magic window). */
export const PANEL_ROWS = 6;
/** A pre-chosen row older than this is ignored (a window that missed the open event and asks
 *  `magic_last` much later must not run something the person picked minutes ago). */
export const RUN_FRESH_MS = 5000;

/** Mirrors `magic::target::resolve` for a Lens item, so the panel lists the same rows the Magic
 *  window will (and a pre-chosen row id is found there). */
export function targetFor(item: LensItem): MagicTarget {
  return {
    kind: item.kind,
    label: item.label.slice(0, 200),
    app: "",
    window: null,
    text: null,
    url: null,
    path: item.path ?? null,
    bounds: null,
    detail: "lens",
    id: item.id,
  };
}

export function inputFor(item: LensItem, run: string | null = null): LensTargetInput {
  return { kind: item.kind, id: item.id, label: item.label, path: item.path ?? null, run };
}

/** The rows in the panel: the Magic window's top rows for this item, capped. */
export function panelRows(
  item: LensItem,
  cfg: Pick<MagicConfig, "ai" | "windowActions" | "maxRows" | "learn">,
  prefs: MenuPrefs = DEFAULT_PREFS,
  usage: UsageCounts = {},
  caps: Caps = NO_CAPS,
): { rows: Row[]; more: number } {
  const set = rowsFor(targetFor(item), cfg, prefs, usage, caps);
  const all = [...set.top, ...set.more];
  return { rows: all.slice(0, PANEL_ROWS), more: Math.max(0, all.length - PANEL_ROWS) };
}

/** Row ids the backend accepts as a pre-chosen row (`LensTargetInput::run_id`). */
export function isRunId(id: string): boolean {
  return id.length > 0 && id.length <= 64 && /^[A-Za-z0-9_:-]+$/.test(id);
}

/** Should the Magic window run this open's pre-chosen row? Only fresh, from a Lens menu, and only
 *  for the item it was chosen for. */
export function shouldRun(open: { run?: string | null; via: string; atMs: number; targets: MagicTarget[] }, now: number): string | null {
  const run = open.run ?? null;
  if (!run || !isRunId(run) || open.via !== "lens") return null;
  if (!(now - open.atMs >= -1000 && now - open.atMs <= RUN_FRESH_MS)) return null;
  const t = open.targets[0];
  if (!t || (t.kind !== "dockItem" && t.kind !== "shelfItem" && t.kind !== "notification")) return null;
  return run;
}

export type PanKey = "pan" | "back" | "none";

/** Keys on the "Lens ›" row pan in; keys inside the panel pan back. */
export function panKey(key: string, inPanel: boolean, rtl = false): PanKey {
  const forward = rtl ? "ArrowLeft" : "ArrowRight";
  const backward = rtl ? "ArrowRight" : "ArrowLeft";
  if (!inPanel) return key === forward || key === "Enter" || key === " " ? "pan" : "none";
  return key === backward || key === "Escape" || key === "Backspace" ? "back" : "none";
}

export interface MenuAt {
  x: number;
  y: number;
}

/**
 * Where a context menu opens and how it was asked for. A right-click opens at the pointer. The
 * Menu key and Shift+F10 also arrive as a `contextmenu` event, but with no pointer behind them:
 * the menu then opens on the item itself and is marked as keyboard-opened, so focus lands on
 * "Lens ›" with a visible ring (docs/features/magic.md, "Magic everywhere via the keyboard").
 */
export function contextOrigin(e: { button: number; clientX: number; clientY: number }, rect: { left: number; top: number; bottom: number; width: number }): { at: MenuAt; byKeyboard: boolean } {
  const byKeyboard = e.button !== 2;
  return byKeyboard
    ? { at: { x: Math.round(rect.left + Math.min(28, rect.width / 2)), y: Math.round(rect.bottom - 4) }, byKeyboard }
    : { at: { x: e.clientX, y: e.clientY }, byKeyboard };
}
