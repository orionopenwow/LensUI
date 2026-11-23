import React from "react";
import { pendingLabel } from "./model";
import "./ApprovalCard.css";

/** "Approve 1 action" — mount in the top bar and the Dock (docs/CLAUDE_CONTROL.md). Hidden at 0. */
export const PendingPill: React.FC<{ count: number; onOpen: () => void; shortcut?: string }> = ({ count, onOpen, shortcut = "Ctrl+Alt+J" }) => {
  if (count <= 0) return null;
  const label = pendingLabel(count);
  return (
    <button type="button" className="ap-pill" onClick={onOpen} aria-label={`${label}. ${shortcut}`}>
      <span className="ap-pill-dot" aria-hidden />
      {label}
      <kbd aria-hidden>{shortcut}</kbd>
    </button>
  );
};

export default PendingPill;
