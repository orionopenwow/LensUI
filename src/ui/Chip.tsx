import React from "react";
import "./ui.css";

/** Static label chip, or a pressable one when `onClick` is set. Icon-only chips need `label`. */
export const Chip: React.FC<{
  children?: React.ReactNode;
  icon?: React.ReactNode;
  selected?: boolean;
  /** Accessible name; required when the chip shows only an icon or a swatch. */
  label?: string;
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
}> = ({ children, icon, selected, label, className, style, onClick }) =>
  onClick ? (
    <button
      type="button"
      className={`lens-chip ${selected ? "is-selected" : ""} ${className ?? ""}`}
      aria-label={label}
      aria-pressed={selected}
      style={style}
      onClick={onClick}
    >
      {icon}
      {children}
    </button>
  ) : (
    <span className={`lens-chip ${selected ? "is-selected" : ""} ${className ?? ""}`} style={style}>
      {icon}
      {children}
    </span>
  );

/**
 * Keyboard shortcut, e.g. <KeyChip keys="Ctrl+Shift+P" />. Keys render as separate caps; `+` is the
 * separator. Screen readers get the shortcut read as words ("Ctrl plus Shift plus P").
 */
export const KeyChip: React.FC<{ keys: string; className?: string }> = ({ keys, className }) => {
  const parts = keys.split("+").map((k) => k.trim()).filter(Boolean);
  return (
    <span className={`lens-keys ${className ?? ""}`} aria-label={parts.join(" plus ")} role="img">
      {parts.map((k, i) => (
        <kbd key={`${k}-${i}`} className="lens-keychip" aria-hidden>
          {k}
        </kbd>
      ))}
    </span>
  );
};
