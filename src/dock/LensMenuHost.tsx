// The one place the Dock reaches Magic (docs/brain/MODULES.md §5.4): the "Lens ›" row and pan in
// an app's right-click menu, and Alt+right-click straight to the Magic window. An edition without
// Magic swaps this file for one that renders the rows as they are.
import React from "react";
import { magicOpenFor } from "../magic/contract";
import { LensMenuRow, LensPan } from "../magic/LensPan";

/** Wraps an app menu's rows so the Lens › row can pan into that app's Magic actions. */
export function DockLensPan({ id, label, path, onClose, children }: { id: string; label: string; path: string | null; onClose: () => void; children: React.ReactNode }) {
  return (
    <LensPan item={{ kind: "dockItem", id, label, path }} itemClassName="dock-ctx-item" onClose={onClose}>
      {children}
    </LensPan>
  );
}

/** The "Lens ›" row itself. */
export const DockLensRow = () => <LensMenuRow className="dock-ctx-item" />;

/** Alt+right-click a Dock app: its Magic window. */
export const openMagicForDockItem = (id: string, label: string, path: string | null) => magicOpenFor("dockItem", id, label, path);
