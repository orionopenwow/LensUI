import React from "react";

/** A short line of local context, built when the Dashboard opens. */
export const ContextStrip: React.FC<{ items: string[] }> = ({ items }) =>
  items.length === 0 ? null : (
    <p className="mdb-strip" aria-label="Right now">
      {items.map((t, i) => (
        <span key={i} className="mdb-strip-item">
          {t}
        </span>
      ))}
    </p>
  );
