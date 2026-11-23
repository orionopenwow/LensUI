// A small custom tooltip (Lens never uses native title tooltips — see AGENTS.md).
import React, { useState } from "react";

export const Tip: React.FC<{ text: string; below?: boolean; className?: string; children: React.ReactNode }> = ({ text, below, className, children }) => {
  const [open, setOpen] = useState(false);
  return (
    <span
      className={`snip-tip-wrap ${className ?? ""}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      {open && text ? (
        <span role="tooltip" className={`snip-tip ${below ? "below" : ""}`}>
          {text}
        </span>
      ) : null}
    </span>
  );
};
