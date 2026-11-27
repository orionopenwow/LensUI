import React from "react";
import { X } from "lucide-react";
import "./flyoutClose.css";

/**
 * The small × every pop-out opened from the Dock carries (Quick Settings, Widgets, Launcher, the
 * Desktop drawer, Now Playing, the Dock's search panel). Same place and look everywhere: top-right
 * of the panel it sits in, 24 px hit area, icon only, accessible name "Close". It shows while the
 * pointer is over the panel or anything in it has focus, and always on touch screens. `onClose`
 * must be the panel's normal hide path (the same one Esc uses), so the Dock's auto-hide and
 * click-region state stay right.
 *
 * Put it as a direct child of the panel; the panel needs `position: relative` (or any positioned
 * value) — `.lens-flyout-host` provides it.
 */
export const FlyoutClose: React.FC<{
  onClose: () => void;
  className?: string;
  label?: string;
  /** Always visible (not only on hover). Settings and Search use it. */
  pinned?: boolean;
  /** Sits in the normal flow (a header row) instead of the panel's top-right corner. */
  inline?: boolean;
}> = ({ onClose, className, label = "Close", pinned, inline }) => (
  <button
    type="button"
    className={`lens-flyout-close${pinned ? " is-pinned" : ""}${inline ? " is-inline" : ""} ${className ?? ""}`}
    aria-label={label}
    data-flyout-close=""
    data-weight="medium"
    onPointerDown={(e) => e.stopPropagation()}
    onClick={(e) => {
      e.stopPropagation();
      onClose();
    }}
  >
    <X size={13} strokeWidth={2.6} aria-hidden="true" />
  </button>
);
