// The Simple / Advanced pill: a two-option radiogroup with a sliding thumb, once, at the top of the
// Settings sidebar. (A second copy at the bottom read as a duplicate setting and was removed.)
import React from "react";
import type { SettingsMode } from "./mode";
import "./simple.css";

export const ModePill: React.FC<{ mode: SettingsMode; onChange: (m: SettingsMode) => void }> = ({ mode, onChange }) => {
  const opts: { id: SettingsMode; label: string }[] = [
    { id: "simple", label: "Simple" },
    { id: "advanced", label: "Advanced" },
  ];
  return (
    <div
      className={`ss-pill ss-pill-top ${mode === "advanced" ? "is-adv" : ""}`}
      role="radiogroup"
      aria-label="Settings detail"
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowDown") {
          e.preventDefault();
          onChange(mode === "simple" ? "advanced" : "simple");
        }
      }}
    >
      <span className="ss-pill-thumb" aria-hidden />
      {opts.map((o) => (
        <button data-weight="light"
          key={o.id}
          type="button"
          role="radio"
          aria-checked={mode === o.id}
          tabIndex={mode === o.id ? 0 : -1}
          className={`ss-pill-btn ${mode === o.id ? "on" : ""}`}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
};

/** One-time hint, shown until a mode is chosen. */
export const ModeHint: React.FC<{ mode: SettingsMode; onChoose: (m: SettingsMode) => void }> = ({ mode, onChoose }) => (
  <div className="ss-hint" role="status">
    {mode === "simple" ? (
      <>
        <span>New here? Simple shows the essentials.</span>
        <button data-weight="medium" type="button" className="ss-hint-btn" onClick={() => onChoose("advanced")}>
          Show everything
        </button>
      </>
    ) : (
      <>
        <span>Too much? Simple shows just the essentials, with previews.</span>
        <button data-weight="medium" type="button" className="ss-hint-btn" onClick={() => onChoose("simple")}>
          Try Simple
        </button>
      </>
    )}
    <button data-weight="medium" type="button" className="ss-hint-x" aria-label="Dismiss" onClick={() => onChoose(mode)}>
      ×
    </button>
  </div>
);
