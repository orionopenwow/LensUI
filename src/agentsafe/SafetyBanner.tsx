// Page banner shown by Lens Browser (and the extension side panel) when the domain guard or the
// injection detector finds something. It is drawn in Lens chrome, never inside page content, so
// a page can't fake it.
import React from "react";
import { ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react";
import { worstSeverity, type SafetyReason } from "./contract";
import { ReasonChips } from "./ReasonChips";
import "./agentsafe.css";

export interface SafetyBannerProps {
  /** The site as people read it (punycode decoded). */
  site: string;
  reasons: SafetyReason[];
  /** Number of spans set aside from what the AI reads on this page. */
  setAside?: number;
  onLeave?: () => void;
  onContinue?: () => void;
  onShowSetAside?: () => void;
}

export const SafetyBanner: React.FC<SafetyBannerProps> = ({ site, reasons, setAside = 0, onLeave, onContinue, onShowSetAside }) => {
  const sev = worstSeverity(reasons);
  const serious = sev === "high" || sev === "critical";
  const Icon = serious ? ShieldAlert : reasons.length ? ShieldQuestion : ShieldCheck;
  const title = serious ? "This site may not be what it seems" : setAside > 0 ? "Lens set aside text the AI shouldn't follow" : "Take a second look at this site";
  return (
    <section className={`as-banner as-sev-${sev}`} role={serious ? "alert" : "status"} aria-live="polite">
      <Icon className="as-banner-icon" size={18} strokeWidth={2.2} aria-hidden="true" />
      <div>
        <div className="as-banner-title">{title}</div>
        <div className="as-banner-meta">
          <span className="as-dot" aria-hidden="true" />
          <span className="as-mono">{site}</span>
          {setAside > 0 ? <span className="as-mono">· {setAside} set aside</span> : null}
        </div>
        <ReasonChips reasons={reasons} />
      </div>
      <div className="as-banner-actions">
        {setAside > 0 && onShowSetAside ? (
          <button type="button" className="as-btn" onClick={onShowSetAside}>Show what was set aside</button>
        ) : null}
        {onContinue ? (
          <button type="button" className="as-btn" onClick={onContinue}>{serious ? "Continue anyway" : "Continue"}</button>
        ) : null}
        {onLeave ? (
          <button type="button" className="as-btn primary" onClick={onLeave}>
            Leave site <span className="as-key" aria-hidden="true">⏎</span>
          </button>
        ) : null}
      </div>
    </section>
  );
};
