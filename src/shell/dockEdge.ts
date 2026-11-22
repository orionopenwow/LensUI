import "./dockEdge.css";

export type DockEdge = "bottom" | "top" | "left" | "right";

export function normalizeDockEdge(raw: string | undefined | null): DockEdge {
  const v = (raw ?? "").trim().toLowerCase();
  return v === "top" || v === "left" || v === "right" ? v : "bottom";
}

/**
 * Publishes the Dock's edge on <html data-dock-edge="…"> in every Lens window, so flyouts that
 * attach to the Dock (Control Center, the Dock search panel, Quick Settings' Dock anchor, the
 * palette's Dock anchor) round the right corners and glide from the right direction.
 * The backend positions those windows against the same edge (see win_monitors::flyout_beside_dock).
 */
export function applyDockEdge(raw: string | undefined | null): void {
  document.documentElement.dataset.dockEdge = normalizeDockEdge(raw);
}
