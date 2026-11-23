/**
 * A miniature screen with the Dock drawn in a given style, used by the Theme & Look hero, the Dock
 * tab's style cards and the setup wizard. Pure CSS shapes, so it follows the active theme tokens.
 * (The compact 112×64 SVG used in option lists is `DockStylePreview` in ./DockStylePreview.)
 */
import React from "react";
import { normalizeDockStyle, type DockAlignment, type DockStyleId } from "./styles";

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
export const DockScenePreview: React.FC<PreviewProps> = ({ styleId, accent = "var(--lens-accent, #60a5fa)", alignment = "center", height = 64, showWindow = true }) => {
  const id: DockStyleId = normalizeDockStyle(styleId);
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
    case "islands":
      dock = h("div", { style: { position: "absolute", left: 5, right: 5, bottom: 5, display: "flex", alignItems: "center", justifyContent: "space-between" } },
        pill([h("span", { key: "g", style: { width: 6, height: 6, borderRadius: 2, border: `1.5px solid ${ink(0.6)}` } }), h("span", { key: "w", style: { width: 8, height: 3, borderRadius: 2, background: accent } }), h("span", { key: "w2", style: { width: 3, height: 3, borderRadius: 2, background: ink(0.4) } })], { padding: "3px 6px", borderRadius: 99 }),
        pill(icons.slice(0, 4).map((c, i) => icon(c, 7, i, i < 2)), { padding: "3px 6px", borderRadius: 99 }),
        pill(tray(), { padding: "4px 6px", borderRadius: 99 }));
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
