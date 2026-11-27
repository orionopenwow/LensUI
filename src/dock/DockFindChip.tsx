// The small chip that shows what is being typed to find an app on the Dock (Dock keys), and the
// one-line key hint when "Focus the Dock" lands on an icon.
import React from "react";
import { Keyboard, Search } from "lucide-react";
import { useLingering } from "../ui/motion";
import "./DockFindChip.css";

type Shown = { query: string; found: boolean } | { hint: string };

export function DockFindChip({ find, hint = null }: { find: { query: string; found: boolean } | null; hint?: string | null }) {
  const value: Shown | null = find ?? (hint ? { hint } : null);
  const linger = useLingering(value, { enter: { y: 4, opacity: 0 }, exit: { opacity: 0 } });
  const shown = linger.value;
  return (
    <div className="dock-find-anchor" role="status" aria-live="polite">
      {shown && linger.mounted && ("hint" in shown ? (
        <div ref={linger.ref} className="dock-find-chip is-hint">
          <Keyboard size={12} strokeWidth={2.6} aria-hidden="true" />
          <span className="dock-find-none">{shown.hint}</span>
        </div>
      ) : (
        <div ref={linger.ref} className={`dock-find-chip ${shown.found ? "" : "is-empty"}`}>
          <Search size={12} strokeWidth={2.6} aria-hidden="true" />
          <span className="dock-find-text">{shown.query}</span>
          {!shown.found && <span className="dock-find-none">No app on the Dock starts like that</span>}
        </div>
      ))}
    </div>
  );
}
