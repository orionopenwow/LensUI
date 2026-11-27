// Tab position and tab styles for Lens Browser (Make it yours › Tabs).
//
// Vertical: the sidebar. Horizontal: one of five styles, each Lens's own drawing in the matte
// Obsidian look:
//   curved   — a top strip; the active tab flows into the toolbar with curved feet.
//   joined   — a top strip; the active tab and the toolbar are one shape, flat, no seam.
//   compact  — one row: address box, then icon-only tabs (the active one shows its title), +.
//   dynamic  — the toolbar on top, the tabs on a row under it.
//   merged   — one row: the active tab is the address box; other tabs sit beside it.
//
// The heights here are the single source for the top chrome: BrowserSurface writes them to CSS
// variables, so the page's rectangle (reported to host.rs) follows from this maths, per mode,
// and is snapped to whole device pixels so a native page never lands on half a pixel.
// Tested in src/__tests__/browserTabModes.test.ts.

export type TabPosition = "vertical" | "horizontal";
export type TabStyle = "curved" | "joined" | "compact" | "dynamic" | "merged";
export type Density = "compact" | "comfortable";

export const TAB_STYLES: { id: TabStyle; label: string; line: string }[] = [
  { id: "curved", label: "Curved", line: "Classic strip on top; the open tab flows into the toolbar." },
  { id: "joined", label: "Joined", line: "Tabs on top, the open tab one shape with the toolbar." },
  { id: "compact", label: "Compact", line: "One row: address, then tab icons. The open tab shows its title." },
  { id: "dynamic", label: "Dynamic", line: "Address bar on top, tabs on a row under it." },
  { id: "merged", label: "Merged", line: "The open tab is the address bar. Click it to edit the address." },
];

export const DEFAULT_TAB_STYLE: TabStyle = "dynamic";

export function validStyle(s: unknown): TabStyle {
  return TAB_STYLES.some((x) => x.id === s) ? (s as TabStyle) : DEFAULT_TAB_STYLE;
}

/** Which rows the top chrome has, top to bottom. */
export type Row = "strip" | "toolbar";

export interface Geometry {
  /** "vertical" or the horizontal style in use. */
  mode: "vertical" | TabStyle;
  rows: Row[];
  /** Toolbar row height (address bar and buttons), logical px. */
  toolbarH: number;
  /** Tab strip row height, 0 when the tabs share the toolbar row or live in the sidebar. */
  stripH: number;
  /** Total height above the page. */
  chromeH: number;
  /** Tabs sit inside the toolbar row (compact, merged). */
  inline: boolean;
  /** The active tab replaces the address box (merged). */
  merged: boolean;
  /** Tabs show icons only, except the active one (compact). */
  iconTabs: boolean;
}

const TOOLBAR = { comfortable: 48, compact: 40 } as const;
const STRIP = { comfortable: 36, compact: 32 } as const;
/** Curved tabs need a little more room for their feet. */
const CURVED_EXTRA = 4;

export function geometry(position: TabPosition, style: TabStyle, density: Density = "comfortable"): Geometry {
  const toolbarH = TOOLBAR[density] ?? TOOLBAR.comfortable;
  const strip = STRIP[density] ?? STRIP.comfortable;
  const base = { toolbarH, inline: false, merged: false, iconTabs: false };
  if (position !== "horizontal") return { ...base, mode: "vertical", rows: ["toolbar"], stripH: 0, chromeH: toolbarH };
  switch (validStyle(style)) {
    case "curved":
      return { ...base, mode: "curved", rows: ["strip", "toolbar"], stripH: strip + CURVED_EXTRA, chromeH: strip + CURVED_EXTRA + toolbarH };
    case "joined":
      return { ...base, mode: "joined", rows: ["strip", "toolbar"], stripH: strip, chromeH: strip + toolbarH };
    case "compact":
      return { ...base, mode: "compact", rows: ["toolbar"], stripH: 0, chromeH: toolbarH, inline: true, iconTabs: true };
    case "merged":
      return { ...base, mode: "merged", rows: ["toolbar"], stripH: 0, chromeH: toolbarH, inline: true, merged: true };
    case "dynamic":
    default:
      return { ...base, mode: "dynamic", rows: ["toolbar", "strip"], stripH: strip, chromeH: toolbarH + strip };
  }
}

export interface Box { x: number; y: number; w: number; h: number }

/** Snaps a logical length to whole device pixels at this scale. */
export function snap(v: number, dpi: number): number {
  const s = dpi > 0 && Number.isFinite(dpi) ? dpi : 1;
  return Math.round(v * s) / s;
}

/**
 * Where the page goes in a window of `win` logical px: below the chrome, beside the sidebar
 * (vertical only) and the side panel. Edges are snapped to device pixels.
 */
export function contentRect(win: { w: number; h: number }, g: Geometry, o: { side?: number; sideRight?: boolean; panel?: number; extraTop?: number; dpi?: number } = {}): Box {
  const dpi = o.dpi ?? 1;
  const side = g.mode === "vertical" ? Math.max(0, o.side ?? 0) : 0;
  const panel = Math.max(0, o.panel ?? 0);
  const left = o.sideRight ? 0 : side;
  const right = o.sideRight ? side + panel : panel;
  const top = snap(g.chromeH + Math.max(0, o.extraTop ?? 0), dpi);
  const x = snap(left, dpi);
  const w = Math.max(1, snap(win.w - right, dpi) - x);
  const h = Math.max(1, snap(win.h, dpi) - top);
  return { x, y: top, w, h };
}

/** CSS variables for the chrome rows (written on the browser root). */
export function cssVars(g: Geometry): Record<string, string> {
  return { "--lb-top": `${g.toolbarH}px`, "--lb-strip": `${g.stripH}px` };
}

/** Roving focus in a tab strip: the next tab index for a key, or null. */
export function stripKey(key: string, index: number, count: number): number | null {
  if (count <= 0) return null;
  switch (key) {
    case "ArrowRight": return (index + 1) % count;
    case "ArrowLeft": return (index - 1 + count) % count;
    case "Home": return 0;
    case "End": return count - 1;
    default: return null;
  }
}
