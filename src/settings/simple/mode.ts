// Settings detail level (docs/SETTINGS_SIMPLE.md). Pure helpers, no React, so they are unit-tested.
//
// Simple: the sidebar shows the pages people use most; the Lens pages open on a few visual cards,
// and the rest of each page sits behind "More options" (it expands in place, concept B).
// Advanced: everything, as before.
import type { LensConfig } from "../../types/lens";
import { PAGES, type PageId } from "../registry";

export type SettingsMode = "simple" | "advanced";

/** The mode to show. Unset ("") means the person hasn't chosen: new users start Simple and anyone
 *  who already finished setup keeps Advanced, so nothing they knew disappears. */
export function effectiveMode(config: Pick<LensConfig, "settingsMode" | "onboardingCompleted">): SettingsMode {
  if (config.settingsMode === "simple" || config.settingsMode === "advanced") return config.settingsMode;
  return config.onboardingCompleted ? "advanced" : "simple";
}

/** True until the person picks a mode once (drives the one-time hint chip). */
export const modeUnchosen = (config: Pick<LensConfig, "settingsMode">) => !config.settingsMode;

/** Pages in the Simple sidebar, in order. Everything else folds under "More (N pages)". */
export const SIMPLE_NAV: PageId[] = ["quick", "appearance", "dock", "keys", "ai", "music", "display", "sound", "network", "power"];

/** Pages that open on core cards in Simple mode, with the full page behind "More options". The
 *  Windows pages and Music in SIMPLE_NAV are already essentials-only, so they show as they are. */
export const SIMPLE_CARD_PAGES: PageId[] = ["appearance", "dock", "keys", "ai"];

export const inSimpleNav = (id: PageId) => SIMPLE_NAV.includes(id);
export const hasSimpleCards = (id: PageId) => SIMPLE_CARD_PAGES.includes(id);

/** Pages folded under "More" in Simple mode. */
export const morePages = () => PAGES.filter((p) => !inSimpleNav(p.id));

/** A search hit is "Advanced" in Simple mode when its page is folded away, or when it points at a
 *  section that lives behind a page's "More options". */
export function isAdvancedHit(mode: SettingsMode, page: PageId, section?: string): boolean {
  if (mode === "advanced") return false;
  if (!inSimpleNav(page)) return true;
  return hasSimpleCards(page) && !!section;
}

/** Whether "More options" should start open for this visit (a deep link to a section opens it). */
export const moreStartsOpen = (mode: SettingsMode, page: PageId, section?: string) =>
  mode === "advanced" || !hasSimpleCards(page) || !!section;

/** Summary line under "More options": the page's section names, a few of them, then a count. */
export function moreSummary(page: PageId): { text: string; count: number } {
  const secs = PAGES.find((p) => p.id === page)?.sections ?? [];
  const names = secs.map((s) => s.label.toLowerCase());
  const shown = names.slice(0, 4).join(", ");
  const rest = names.length - 4;
  return { text: names.length ? (rest > 0 ? `${shown} · ${rest} more` : shown) : "Every option on this page", count: names.length };
}

/** Config keys the Simple cards on each page change; "Reset" puts these back to defaults. */
export const SIMPLE_RESETS: Partial<Record<PageId, (c: LensConfig) => LensConfig>> = {
  dock: (c) => ({ ...c, dock: { ...c.dock, iconSize: 40, autoHide: "never", position: "bottom" } }),
  keys: (c) => ({
    ...c,
    windowControls: { ...c.windowControls, enabled: true, order: "yellow-green-red" },
    hotCorners: c.hotCorners ? { ...c.hotCorners, enabled: false } : c.hotCorners,
    altDrag: c.altDrag ? { ...c.altDrag, enabled: false } : c.altDrag,
  }),
};
