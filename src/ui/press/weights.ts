// Default weights for the shared classes that predate the kit (DESIGN.md §5.2): a control with one
// of these classes and no data-weight gets this weight on its first press, so every surface built
// from the shared classes inherits the feel. The kit components (src/ui) and migrated surfaces
// declare data-weight themselves. The Dock and Lens Browser are not listed: they adopt the press
// in their own Fable pass (DESIGN.md §5.5, "Adopting the feel").
import type { PressWeight } from "../motion/tokens";

export const CLASS_WEIGHTS: readonly (readonly [string, PressWeight])[] = [
  // heavy: primary actions, cards that open something
  [".cc-btn-primary", "heavy"],
  [".lens-btn.is-primary", "heavy"],
  // medium: buttons, icon buttons, segmented options, Quick settings tiles
  [".lens-btn", "medium"],
  [".cc-btn", "medium"],
  [".cc-btn-ghost", "medium"],
  [".cc-theme-card", "medium"],
  [".pal-folder-card", "medium"],
  [".qs-tile", "medium"],
  [".qs-expand-btn", "medium"],
  [".qs-popout-btn", "medium"],
  [".qs-seg-btn", "medium"],
  [".qs-preset-card", "medium"],
  [".lens-seg-btn", "medium"],
  [".traffic-btn", "medium"],
  [".topbar-clock", "medium"],
  [".lens-rotary-knob", "medium"],
  // light: rows, menu items, tabs, sidebar entries, chips in lists
  [".cc-nav-btn", "light"],
  [".cc-chip", "light"],
  [".lens-chip", "light"],
  [".pal-filter-pill", "light"],
  [".pal-recent-row", "light"],
  [".pal-result-row", "light"],
  [".qs-win-item", "light"],
  [".lens-toggle", "light"],
  [".cc-toggle", "light"],
  [".qs-switch", "light"],
];

export const CLASS_SELECTOR = CLASS_WEIGHTS.map(([s]) => s).join(", ");

/** Weight for an element that has no data-weight yet, from its classes. */
export function classWeight(matches: (selector: string) => boolean): PressWeight | null {
  for (const [sel, w] of CLASS_WEIGHTS) if (matches(sel)) return w;
  return null;
}
