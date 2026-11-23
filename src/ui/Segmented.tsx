import React from "react";
import "./ui.css";

export type SegmentedOption<T extends string> = { id: T; label: React.ReactNode; ariaLabel?: string };

/** Single choice from 2–5 options. A radiogroup with arrow-key support. */
export function Segmented<T extends string>({
  value,
  options,
  label,
  disabled,
  className,
  buttonClassName,
  onChange,
}: {
  value: T;
  options: SegmentedOption<T>[];
  /** Accessible name for the group. */
  label: string;
  disabled?: boolean;
  className?: string;
  buttonClassName?: string;
  onChange: (v: T) => void;
}) {
  const move = (dir: 1 | -1) => {
    const i = options.findIndex((o) => o.id === value);
    const next = options[(i + dir + options.length) % options.length];
    if (next) onChange(next.id);
  };
  return (
    <div
      className={`lens-seg ${className ?? ""}`}
      role="radiogroup"
      aria-label={label}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === "ArrowRight" || e.key === "ArrowDown") {
          e.preventDefault();
          move(1);
        } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
          e.preventDefault();
          move(-1);
        }
      }}
    >
      {options.map((o) => {
        const on = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={o.ariaLabel}
            tabIndex={on ? 0 : -1}
            disabled={disabled}
            className={`lens-seg-btn ${buttonClassName ?? ""} ${on ? "active" : ""}`}
            onClick={() => onChange(o.id)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
