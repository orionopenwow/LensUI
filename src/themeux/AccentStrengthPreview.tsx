// What each Accent strength would do, shown before it is chosen (IDENTITY §4, "Show, then ask"):
// three small samples (a switch that is on, a selected chip, a running mark and a selected row),
// each painted with the tokens that strength would give this accent on this theme. Decorative: the
// choice itself is the segmented control above, so this is hidden from assistive technology.
import React from "react";
import { ACCENT_STRENGTHS, ACCENT_VARIABLES, accentCssVariables, accentTokens, type AccentInput, type AccentStrength } from "../themes/accentTokens";

/** The monochrome defaults (tokens.css), for a sample whose strength shows no colour. */
const PLAIN: Record<string, string> = {
  "--lens-accent-ui": "var(--cc-accent)",
  "--lens-on-accent-ui": "var(--lens-on-fg)",
  "--lens-accent-fill": "var(--cc-accent)",
  "--lens-on-accent-fill": "var(--lens-on-fg)",
  "--lens-accent-wash": "0%",
  "--lens-accent-edge": "0%",
  "--lens-accent-hover": "0%",
};

/** Every accent token for one sample, so nothing leaks in from the window's own strength. */
export function sampleVariables(input: Omit<AccentInput, "strength">, strength: AccentStrength): Record<string, string> {
  const t = accentTokens({ ...input, strength });
  const vars = { ...PLAIN, ...(t ? accentCssVariables(t) : {}) };
  delete vars["--lens-focus-ring"];
  return Object.fromEntries(ACCENT_VARIABLES.filter((k) => k in vars).map((k) => [k, vars[k]]));
}

export function AccentStrengthPreview({ input, value }: { input: Omit<AccentInput, "strength">; value: AccentStrength }) {
  return (
    <div className="tux-accent-demo" aria-hidden="true">
      {ACCENT_STRENGTHS.map((s) => (
        <div key={s.id} className={`tux-accent-sample ${s.id === value ? "is-current" : ""}`} data-strength={s.id} style={sampleVariables(input, s.id) as React.CSSProperties}>
          <span className="tux-accent-sample-row">
            <span className="tux-accent-sample-switch" />
            <span className="tux-accent-sample-chip">On</span>
          </span>
          <span className="tux-accent-sample-item">
            <span className="tux-accent-sample-line" />
          </span>
          <span className="tux-accent-sample-mark" />
        </div>
      ))}
    </div>
  );
}
