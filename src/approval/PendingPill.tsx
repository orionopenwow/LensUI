import React from "react";
import { pendingLabel } from "./model";
import "./ApprovalCard.css";

/** "Approve 1 action" — mount in the top bar and the Dock (docs/CLAUDE_CONTROL.md). Hidden at 0.
 *  Pass `shortcut` only once a global hotkey for the approval window is registered: Ctrl+Alt+J,
 *  which the docs suggested, is the tiling "snap bottom-left" shortcut (win_tiler.rs). */
export const PendingPill: React.FC<{ count: number; onOpen: () => void; shortcut?: string }> = ({ count, onOpen, shortcut }) => {
  if (count <= 0) return null;
  const label = pendingLabel(count);
  return (
    <button type="button" className="ap-pill" onClick={onOpen} aria-label={shortcut ? `${label}. ${shortcut}` : label}>
      <span className="ap-pill-dot" aria-hidden />
      {label}
      {shortcut && <kbd aria-hidden>{shortcut}</kbd>}
    </button>
  );
};

export default PendingPill;
