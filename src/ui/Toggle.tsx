import React, { useEffect, useState } from "react";
import { oops } from "./oops";
import "./ui.css";

/** "Animated backdrop" → "animated backdrop"; names that start with an acronym ("Wi-Fi", "HDR") stay. */
export const settingName = (label?: string): string =>
  !label ? "that setting" : /^[A-Z][a-z]+(\s|$)/.test(label) ? label[0].toLowerCase() + label.slice(1) : label;

/** A Toggle must be named: either a visible label's id (`labelledBy`) or a `label` string. */
type ToggleName = { label: string; labelledBy?: undefined } | { labelledBy: string; label?: undefined };

export type ToggleProps = ToggleName & {
  checked: boolean;
  disabled?: boolean;
  /** Extra class names (e.g. "cc-toggle" to keep a surface's own geometry). */
  className?: string;
  /**
   * Called with the new value. If it returns a promise, the switch flips immediately (optimistic)
   * and springs back if the promise rejects; `onError` gets the reason. Without one, the
   * window's toast says "Couldn't change <name>." (B-18: a refused change never looks like nothing).
   */
  onChange: (next: boolean) => unknown;
  onError?: (err: unknown) => void;
};

export const Toggle: React.FC<ToggleProps> = ({ checked, disabled, className, onChange, onError, ...name }) => {
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  useEffect(() => setOptimistic(null), [checked]);
  const shown = optimistic ?? checked;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={shown}
      aria-label={name.label}
      aria-labelledby={name.labelledBy}
      disabled={disabled}
      className={`lens-toggle ${className ?? ""} ${shown ? "on" : ""} ${optimistic !== null ? "is-pending" : ""}`}
      onClick={() => {
        const next = !shown;
        const r = onChange(next);
        if (r && typeof (r as Promise<unknown>).then === "function") {
          setOptimistic(next);
          (r as Promise<unknown>).then(
            () => setOptimistic(null),
            (e) => {
              setOptimistic(null);
              (onError ?? oops(`change ${settingName(name.label)}`))(e);
            }
          );
        }
      }}
    />
  );
};
