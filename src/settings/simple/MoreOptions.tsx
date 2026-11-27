// "More options" (concept B): the rest of a page, folded under one row that expands in place.
// The expanding content fades and slides in from just under the row (transform + opacity only);
// nothing above it moves, so there is no layout jump. A page in Advanced mode renders its content
// without the row.
import React, { useEffect, useRef } from "react";
import { ChevronDown, RotateCcw } from "lucide-react";
import { reducedMotion, usePresence } from "../../ui/motion";
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
  const rowRef = useRef<HTMLDivElement>(null);
  // Glides in from just under the row when opened and out before it is removed; a page that loads
  // already open shows it without playing the reveal.
  const { mounted, ref: bodyRef } = usePresence<HTMLDivElement>(open && enabled, {
    initial: false,
    enter: { y: -8, opacity: 0 },
    exit: { y: -6, opacity: 0 },
    enterOptions: { duration: "slow" },
  });
  const wasOpen = useRef(open);
  useEffect(() => {
    if (open && !wasOpen.current) rowRef.current?.scrollIntoView({ block: "start", behavior: reducedMotion() ? "auto" : "smooth" });
    wasOpen.current = open;
  }, [open]);

  if (!enabled) return <>{children}</>;
  return (
    <>
      <div ref={rowRef} className={`ss-more ${open ? "open" : ""}`}>
        <div className="ss-more-text">
          <div className="ss-more-title">More options</div>
          <div className="ss-more-sub">{summary}</div>
        </div>
        {open && onReset && (
          <button data-weight="medium" type="button" className="ss-more-reset" onClick={onReset}>
            <RotateCcw size={12} aria-hidden /> Reset
          </button>
        )}
        <button data-weight="medium" type="button" className="ss-more-btn" aria-expanded={open} aria-controls="ss-more-body" onClick={() => onToggle(!open)}>
          {open ? "Hide" : "Show"} <ChevronDown size={14} aria-hidden className="ss-more-chev" />
        </button>
      </div>
      {mounted && (
        <div id="ss-more-body" ref={bodyRef} className="ss-more-body" inert={!open}>
          {children}
        </div>
      )}
    </>
  );
};
