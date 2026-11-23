// Renders the agent-safety UI for screenshots: ?scene=card|card-open|banner-scam|banner-setaside|approval&preset=…
import React from "react";
import ReactDOM from "react-dom/client";
import "../../../src/styles/tokens.css";
import "../../../src/styles/global.css";
import "../../../src/surfaces/ControlCenterSurface.css";
import { useLensState } from "../../../src/hooks/useLensState";
import { AgentSafetyCard } from "../../../src/agentsafe/AgentSafetyCard";
import { SafetyBanner } from "../../../src/agentsafe/SafetyBanner";
import { ReasonChips } from "../../../src/agentsafe/ReasonChips";
import { safetyNow } from "./mockCore";

const p = new URLSearchParams(location.search);
const scene = p.get("scene") || "card";

const scamReasons = [
  { code: "domain.homoglyph", severity: "critical", detail: "pаypal.com imitates paypal.com with look-alike letters" },
  { code: "domain.new_sensitive", severity: "medium", detail: "First visit to pаypal.com, and it's asking for a sign-in" },
];
const setAsideReasons = [
  { code: "inject.hidden_instructions", severity: "high", detail: "This content contains instructions aimed at the AI. They were set aside and not followed." },
  { code: "inject.hidden_text", severity: "medium", detail: "It has text you can't see on screen" },
];
const approvalReasons = [
  { code: "risk.send", severity: "high", detail: "Nothing is sent in your name without your OK" },
  { code: "domain.brand_combo", severity: "high", detail: "paypal-login-verify.com pairs paypal with \"login\" but isn't paypal.com" },
  { code: "inject.step_ask", severity: "medium", detail: "The content this step came from tells the AI what to do" },
];

function App() {
  useLensState();
  React.useEffect(() => {
    if (scene !== "card-open") return;
    const t = window.setInterval(() => {
      const b = document.querySelector('[aria-expanded="false"]') as HTMLButtonElement | null;
      if (b) {
        b.click();
        window.clearInterval(t);
      }
    }, 100);
    return () => window.clearInterval(t);
  }, []);
  if (scene === "banner-scam") {
    return (
      <div style={{ padding: 16 }}>
        <SafetyBanner site="xn--pypal-4ve.com → pаypal.com" reasons={scamReasons as any} onLeave={() => {}} onContinue={() => {}} />
      </div>
    );
  }
  if (scene === "banner-setaside") {
    return (
      <div style={{ padding: 16 }}>
        <SafetyBanner site="shop.example" reasons={setAsideReasons as any} setAside={2} onShowSetAside={() => {}} onContinue={() => {}} />
      </div>
    );
  }
  if (scene === "approval") {
    // Reason chips as they appear inside the shared "Needs your OK" card (feature/claude-control).
    return (
      <div style={{ padding: 16 }}>
        <div className="as-banner" style={{ gridTemplateColumns: "1fr" }}>
          <div className="as-banner-meta" style={{ justifyContent: "space-between", margin: 0 }}>
            <span className="as-banner-title">Needs your OK</span>
            <span className="as-mono"><span className="as-dot" style={{ display: "inline-block", marginRight: 6, background: "var(--lens-danger)" }} />paypal-login-verify.com</span>
          </div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Send your order number to this site?</div>
          <ReasonChips reasons={approvalReasons as any} showCodes />
          <div className="as-banner-actions" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="as-btn">Deny <span className="as-key">Esc</span></button>
            <button type="button" className="as-btn primary">Hold to send <span className="as-key">⏎</span></button>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="lens-glass cc-content" style={{ minHeight: "100%", boxSizing: "border-box", borderRadius: 0 }}>
      <AgentSafetyCard nowSec={safetyNow} />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
