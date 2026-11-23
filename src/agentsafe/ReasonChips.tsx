// Reason chips for approval cards and banners: a status dot, the plain-language reason, and
// (optionally) the stable reason code in monospace.
import React from "react";
import type { SafetyReason } from "./contract";
import "./agentsafe.css";

export const ReasonChips: React.FC<{ reasons: SafetyReason[]; showCodes?: boolean; max?: number }> = ({ reasons, showCodes = false, max = 6 }) => {
  if (!reasons.length) return null;
  const shown = reasons.slice(0, max);
  const more = reasons.length - shown.length;
  return (
    <ul className="as-chips" aria-label="Why Lens is asking">
      {shown.map((r) => (
        <li key={r.code + r.detail} className={`as-chip as-sev-${r.severity}`}>
          <span className="as-dot" aria-hidden="true" />
          <span>{r.detail}</span>
          {showCodes ? <span className="as-mono">{r.code}</span> : null}
          <span className="sr-only">{`(${r.severity})`}</span>
        </li>
      ))}
      {more > 0 ? <li className="as-chip"><span className="as-mono">+{more} more</span></li> : null}
    </ul>
  );
};
