// "More options" (concept B): the rest of a page, folded under one row that expands in place.
// The expanding content fades and slides in from just under the row (transform + opacity only);
// nothing above it moves, so there is no layout jump. A page in Advanced mode renders its content
// without the row.
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronDown, RotateCcw } from "lucide-react";
import "./simple.css";

export const MoreOptions: React.FC<{
  /** False in Advanced mode, or on pages without Simple cards: content shows as it is. */
  enabled: boolean;
  open: boolean;
  onToggle: (open: boolean) => void;
  summary: string;
  /** Puts the Simple cards' settings back to their defaults (shown when expanded, if given). */
  onReset?: () => void;
  children: React.ReactNode;
}> = ({ enabled, open, onToggle, summary, onReset, children }) => {
  const bodyRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const [entering, setEntering] = useState(false);
  const firstRender = useRef(true);

  // Play the reveal only when the person opens it, not when a page loads already open.
  useLayoutEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (open) setEntering(true);
  }, [open]);
  useEffect(() => {
    if (!entering) return;
    const t = window.setTimeout(() => setEntering(false), 420);
    rowRef.current?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    return () => window.clearTimeout(t);
  }, [entering]);

  if (!enabled) return <>{children}</>;
  return (
    <>
      <div ref={rowRef} className={`ss-more ${open ? "open" : ""}`}>
        <div className="ss-more-text">
          <div className="ss-more-title">More options</div>
          <div className="ss-more-sub">{summary}</div>
        </div>
        {open && onReset && (
          <button type="button" className="ss-more-reset" onClick={onReset}>
            <RotateCcw size={12} aria-hidden /> Reset
          </button>
        )}
        <button type="button" className="ss-more-btn" aria-expanded={open} aria-controls="ss-more-body" onClick={() => onToggle(!open)}>
          {open ? "Hide" : "Show"} <ChevronDown size={14} aria-hidden className="ss-more-chev" />
        </button>
      </div>
      {open && (
        <div id="ss-more-body" ref={bodyRef} className={`ss-more-body ${entering ? "entering" : ""}`}>
          {children}
        </div>
      )}
    </>
  );
};
