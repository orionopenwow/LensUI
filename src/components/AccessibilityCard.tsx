import React from "react";
import type { LensConfig } from "../types/lens";
import { LOCALES } from "../i18n";

interface Props {
  config: LensConfig;
  onUpdateConfig: (next: LensConfig) => Promise<void> | void;
}

type ThemeWithA11y = LensConfig["theme"] & { motion?: string; contrast?: string; locale?: string };

/** Control Center card: motion, contrast and language. Applied by applyThemeToDocument (data-motion,
 *  data-contrast on <html>) and by the i18n module. */
export const AccessibilityCard: React.FC<Props> = ({ config, onUpdateConfig }) => {
  const theme = config.theme as ThemeWithA11y;
  const set = (patch: Partial<ThemeWithA11y>) =>
    onUpdateConfig({ ...config, theme: { ...config.theme, ...patch } as LensConfig["theme"] });

  const chipRow = (
    label: string,
    desc: string,
    value: string,
    options: { id: string; label: string }[],
    onPick: (id: string) => void
  ) => (
    <div className="cc-row">
      <div>
        <div className="cc-label">{label}</div>
        <div className="cc-desc">{desc}</div>
      </div>
      <div className="cc-chip-grid" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button data-weight="light"
            key={o.id}
            type="button"
            role="radio"
            aria-checked={value === o.id}
            className={`cc-chip ${value === o.id ? "active" : ""}`}
            onClick={() => onPick(o.id)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="cc-card">
      <div className="cc-label">Accessibility &amp; language</div>
      {chipRow(
        "Motion",
        "\"Follow Windows\" uses Settings > Accessibility > Visual effects > Animation effects.",
        theme.motion ?? "system",
        [
          { id: "system", label: "Follow Windows" },
          { id: "reduce", label: "Reduce" },
          { id: "full", label: "Full" },
        ],
        (id) => set({ motion: id })
      )}
      {chipRow(
        "Contrast",
        "High makes panels opaque and every edge and label stronger. Windows contrast themes are always followed.",
        theme.contrast ?? "system",
        [
          { id: "system", label: "Standard" },
          { id: "high", label: "High" },
        ],
        (id) => set({ contrast: id })
      )}
      {chipRow(
        "Language",
        "Draft translations are machine-quality and not yet reviewed.",
        theme.locale ?? "auto",
        [{ id: "auto", label: "Follow Windows" }, ...LOCALES.map((l) => ({ id: l.code, label: l.label }))],
        (id) => set({ locale: id })
      )}
    </div>
  );
};
