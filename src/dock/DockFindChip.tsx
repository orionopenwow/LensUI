// The small chip that shows what is being typed to find an app on the Dock (Dock keys).
import React from "react";
import { Search } from "lucide-react";
import { useLingering } from "../ui/motion";
import "./DockFindChip.css";

export function DockFindChip({ find }: { find: { query: string; found: boolean } | null }) {
  const linger = useLingering(find, { enter: { y: 4, opacity: 0 }, exit: { opacity: 0 } });
  const shown = linger.value;
  return (
    <div className="dock-find-anchor" role="status" aria-live="polite">
      {shown && linger.mounted && (
        <div ref={linger.ref} className={`dock-find-chip ${shown.found ? "" : "is-empty"}`}>
          <Search size={12} strokeWidth={2.6} aria-hidden="true" />
          <span className="dock-find-text">{shown.query}</span>
          {!shown.found && <span className="dock-find-none">No app on the Dock starts like that</span>}
        </div>
      )}
    </div>
  );
}
