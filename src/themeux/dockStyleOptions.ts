/**
 * Local stand-in for the dock-style contract owned by `feature/dock-styles` (src/dock/styles.ts).
 *
 * Same shape as that module: `DOCK_STYLES` ({ id, label, description, recommendedIconSize }) and a
 * `DockStylePreview` component. Once both branches are merged, every
 * `from "../themeux/dockStyleOptions"` import switches to `from "../dock/styles"` and this file is deleted.
 *
 * The config fields (`dock.style`, `dock.alignment`, `dock.systemArea`) are typed here locally so this
 * branch does not touch src/types/lens.ts, which the dock-styles branch also edits.
 */
import React from "react";
import type { LensConfig } from "../types/lens";

export type DockStyleId = "floating" | "slim" | "taskbar" | "studio" | "minimal" | "split";
export type DockAlignment = "center" | "left";
export type DockSystemArea = "auto" | "dock" | "topbar";

export interface DockStyleOption {
  id: DockStyleId;
  label: string;
  description: string;
  recommendedIconSize: number;
}

export const DOCK_STYLES: DockStyleOption[] = [
  { id: "floating", label: "Floating", description: "Rounded glass dock that floats just above the bottom edge.", recommendedIconSize: 44 },
  { id: "slim", label: "Slim", description: "A thinner centred dock with smaller icons, so you get more screen.", recommendedIconSize: 34 },
  { id: "taskbar", label: "Taskbar", description: "Full-width bar like the Windows taskbar, with the system area on the right.", recommendedIconSize: 36 },
  { id: "studio", label: "Studio", description: "Wide dock that shows names under running apps and a status section.", recommendedIconSize: 40 },
  { id: "minimal", label: "Minimal", description: "Icons only, with no backdrop. Stays out of the way.", recommendedIconSize: 38 },
  { id: "split", label: "Split", description: "Apps in the centre, folders and the system area in their own pills.", recommendedIconSize: 40 },
];

type DockExtras = { style?: string; alignment?: string; systemArea?: string };

export function dockStyleOf(config: LensConfig): DockStyleId {
  const s = (config.dock as unknown as DockExtras).style;
  return (DOCK_STYLES.some((d) => d.id === s) ? s : "floating") as DockStyleId;
}
export function dockAlignmentOf(config: LensConfig): DockAlignment {
  return (config.dock as unknown as DockExtras).alignment === "left" ? "left" : "center";
}
export function dockSystemAreaOf(config: LensConfig): DockSystemArea {
  const v = (config.dock as unknown as DockExtras).systemArea;
  return v === "dock" || v === "topbar" ? v : "auto";
}

/** Returns a new config with the given dock fields set (only the three contract fields). */
export function withDock(config: LensConfig, patch: DockExtras): LensConfig {
  return { ...config, dock: { ...config.dock, ...patch } };
}

export function dockStyleLabel(id: string | undefined): string {
  return DOCK_STYLES.find((d) => d.id === id)?.label ?? "Floating";
}

const h = React.createElement;

interface PreviewProps {
  /** Dock style id to draw. Unknown ids draw "floating". */
  styleId: string;
  /** Accent used for the first icon and the running dot. */
  accent?: string;
  alignment?: DockAlignment;
  height?: number;
  /** Draw a faint app window behind the dock. Off when the caller draws its own window on top. */
  showWindow?: boolean;
}

/**
 * A miniature screen with the dock drawn in the given style. Pure CSS shapes, so it follows the active
 * theme tokens (ink, border, elevated surface) automatically.
 */
export const DockStylePreview: React.FC<PreviewProps> = ({ styleId, accent = "var(--lens-accent, #60a5fa)", alignment = "center", height = 64, showWindow = true }) => {
  const id = (DOCK_STYLES.some((d) => d.id === styleId) ? styleId : "floating") as DockStyleId;
  const ink = (a: number) => `rgb(var(--lens-ink) / ${a})`;
  const icons = [accent, "#60a5fa", "#34d399", "#fbbf24", "#f472b6"];
  const icon = (c: string, size: number, i: number, running = false) =>
    h(
      "span",
      { key: i, style: { position: "relative", width: size, height: size, borderRadius: Math.max(2, size * 0.3), background: c, flexShrink: 0 } },
      running
        ? h("span", { style: { position: "absolute", left: "50%", bottom: -3, width: 3, height: 2, marginLeft: -1.5, borderRadius: 1, background: ink(0.75) } })
        : null,
    );
  const pill = (children: React.ReactNode[], extra: React.CSSProperties = {}) =>
    h(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "center",
          gap: 3,
          padding: "3px 5px",
          borderRadius: 6,
          background: "var(--lens-pack-elevated, #18181b)",
          border: `1px solid ${ink(0.14)}`,
          boxShadow: `0 2px 6px rgb(0 0 0 / 0.25)`,
          ...extra,
        },
      },
      ...children,
    );
  const tray = () => [
    h("span", { key: "t1", style: { width: 10, height: 3, borderRadius: 2, background: ink(0.35) } }),
    h("span", { key: "t2", style: { width: 4, height: 4, borderRadius: 2, background: ink(0.55) } }),
  ];

  let dock: React.ReactNode;
  switch (id) {
    case "slim":
      dock = h("div", { style: { position: "absolute", left: "50%", bottom: 5, transform: "translateX(-50%)" } },
        pill(icons.slice(0, 5).map((c, i) => icon(c, 6, i, i < 2)), { padding: "2px 4px", gap: 2, borderRadius: 5 }));
      break;
    case "taskbar":
      dock = h(
        "div",
        {
          style: {
            position: "absolute", left: 0, right: 0, bottom: 0, height: 13,
            display: "flex", alignItems: "center", gap: 3, padding: "0 5px",
            justifyContent: alignment === "left" ? "flex-start" : "center",
            background: "var(--lens-pack-elevated, #18181b)", borderTop: `1px solid ${ink(0.14)}`,
          },
        },
        h("span", { key: "start", style: { width: 7, height: 7, borderRadius: 2, border: `1.5px solid ${accent}` } }),
        ...icons.slice(0, 4).map((c, i) => icon(c, 7, i, i < 2)),
        h("span", { key: "sp", style: { position: "absolute", right: 5, display: "flex", gap: 3, alignItems: "center" } }, ...tray()),
      );
      break;
    case "studio":
      dock = h("div", { style: { position: "absolute", left: "50%", bottom: 4, transform: "translateX(-50%)" } },
        pill([
          ...icons.slice(0, 3).map((c, i) =>
            h("span", { key: i, style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 2 } },
              icon(c, 8, i), h("span", { style: { width: 9, height: 2, borderRadius: 1, background: ink(0.4) } }))),
          h("span", { key: "div", style: { width: 1, height: 12, background: ink(0.18), margin: "0 2px" } }),
          h("span", { key: "stat", style: { display: "flex", flexDirection: "column", gap: 2 } },
            h("span", { style: { width: 14, height: 2, borderRadius: 1, background: ink(0.5) } }),
            h("span", { style: { width: 10, height: 2, borderRadius: 1, background: accent } })),
        ], { padding: "4px 7px", gap: 4 }));
      break;
    case "minimal":
      dock = h("div", { style: { position: "absolute", left: "50%", bottom: 6, transform: "translateX(-50%)", display: "flex", gap: 4 } },
        ...icons.slice(0, 5).map((c, i) => icon(c, 8, i, i === 0)));
      break;
    case "split":
      dock = h("div", { style: { position: "absolute", left: 6, right: 6, bottom: 5, display: "flex", alignItems: "center", justifyContent: "space-between" } },
        pill([icon("#fbbf24", 6, 0), icon("#a78bfa", 6, 1)], { padding: "3px 4px" }),
        pill(icons.slice(0, 4).map((c, i) => icon(c, 8, i, i < 2))),
        pill(tray(), { padding: "4px 5px" }));
      break;
    default:
      dock = h("div", { style: { position: "absolute", left: "50%", bottom: 6, transform: "translateX(-50%)" } },
        pill(icons.slice(0, 5).map((c, i) => icon(c, 9, i, i < 2)), { borderRadius: 8, padding: "4px 6px" }));
  }

  return h(
    "div",
    {
      "aria-hidden": true,
      style: {
        position: "relative", width: "100%", height, borderRadius: 8, overflow: "hidden",
        background: `linear-gradient(160deg, ${ink(0.07)}, ${ink(0.02)})`,
        border: `1px solid ${ink(0.1)}`,
      },
    },
    // a background window so the dock reads as "over the desktop"
    !showWindow ? null : h("div", { style: { position: "absolute", left: "14%", right: "22%", top: 8, height: height - 36, minHeight: 12, borderRadius: 4, background: ink(0.06), border: `1px solid ${ink(0.08)}` } }),
    dock,
  );
};
