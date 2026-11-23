/**
 * Backdrop Lab controls. Matched to Lens tokens; the AAA wave's src/ui primitives will replace
 * these once they land on main (see docs/BACKDROP_LAB.md §Next).
 *
 * Every slider: drag, arrow keys (Shift = ×10), scroll to fine-tune, double-click to reset, and a
 * typeable value. All have screen-reader labels and a visible focus ring.
 */
import React, { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, RotateCcw } from "lucide-react";

const decimals = (step: number) => (step >= 1 ? 0 : Math.min(3, Math.ceil(-Math.log10(step))));
const snap = (v: number, min: number, max: number, step: number) => {
  const n = Math.round((v - min) / step) * step + min;
  return Math.min(max, Math.max(min, Number(n.toFixed(decimals(step) + 1))));
};

export const LabSlider: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  unit?: string;
  hint?: string;
  onChange: (v: number) => void;
  /** Called once when a drag ends (undo checkpoints). */
  onCommit?: () => void;
}> = ({ label, value, min, max, step, defaultValue, unit = "", hint, onChange, onCommit }) => {
  const track = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const id = useId();
  const dp = decimals(step);
  const pct = ((value - min) / (max - min)) * 100;
  const fromX = (clientX: number) => {
    const r = track.current!.getBoundingClientRect();
    return snap(min + ((clientX - r.left) / Math.max(1, r.width)) * (max - min), min, max, step);
  };
  // Wheel needs a non-passive listener so the panel doesn't scroll while fine-tuning.
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const dir = e.deltaY < 0 ? 1 : -1;
      onChangeRef.current(snap(valueRef.current + dir * step * (e.shiftKey ? 10 : 1), min, max, step));
      onCommitRef.current?.();
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [min, max, step]);
  const valueRef = useRef(value);
  valueRef.current = value;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;

  return (
    <div className="bd-slider">
      <label className="bd-slider-label" htmlFor={id}>
        {label}
        {hint && <span className="bd-hint">{hint}</span>}
      </label>
      <div
        ref={track}
        id={id}
        className="bd-track"
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={Number(value.toFixed(dp))}
        aria-valuetext={`${value.toFixed(dp)}${unit}`}
        onPointerDown={(e) => {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          onChange(fromX(e.clientX));
        }}
        onPointerMove={(e) => {
          if (e.buttons & 1) onChange(fromX(e.clientX));
        }}
        onPointerUp={() => onCommit?.()}
        onDoubleClick={() => {
          onChange(defaultValue);
          onCommit?.();
        }}
        onKeyDown={(e) => {
          const big = e.shiftKey ? 10 : 1;
          let v: number | null = null;
          if (e.key === "ArrowRight" || e.key === "ArrowUp") v = value + step * big;
          else if (e.key === "ArrowLeft" || e.key === "ArrowDown") v = value - step * big;
          else if (e.key === "PageUp") v = value + (max - min) / 10;
          else if (e.key === "PageDown") v = value - (max - min) / 10;
          else if (e.key === "Home") v = min;
          else if (e.key === "End") v = max;
          else if (e.key === "Delete" || e.key === "Backspace") v = defaultValue;
          if (v !== null) {
            e.preventDefault();
            onChange(snap(v, min, max, step));
            onCommit?.();
          }
        }}
      >
        <div className="bd-track-fill" style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
        <div className="bd-track-knob" style={{ left: `${Math.max(0, Math.min(100, pct))}%` }} />
      </div>
      {editing ? (
        <input
          className="bd-num"
          autoFocus
          value={text}
          aria-label={`${label} value`}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => {
            const n = parseFloat(text);
            if (Number.isFinite(n)) {
              onChange(snap(n, min, max, step));
              onCommit?.();
            }
            setEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") setEditing(false);
          }}
        />
      ) : (
        <button
          type="button"
          className="bd-num"
          aria-label={`Type a value for ${label}`}
          onClick={() => {
            setText(value.toFixed(dp));
            setEditing(true);
          }}
        >
          {value.toFixed(dp)}
          {unit}
        </button>
      )}
    </div>
  );
};

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  small,
}: {
  label: string;
  value: T;
  options: { id: T; label: string }[];
  onChange: (v: T) => void;
  small?: boolean;
}) {
  return (
    <div className={`bd-seg ${small ? "small" : ""}`} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          className={value === o.id ? "on" : ""}
          onClick={() => onChange(o.id)}
          onKeyDown={(e) => {
            const i = options.findIndex((x) => x.id === value);
            if (e.key === "ArrowRight") onChange(options[(i + 1) % options.length].id);
            if (e.key === "ArrowLeft") onChange(options[(i - 1 + options.length) % options.length].id);
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const Toggle: React.FC<{ label: string; checked: boolean; hint?: string; onChange: (v: boolean) => void }> = ({ label, checked, hint, onChange }) => (
  <label className="bd-toggle">
    <span>
      {label}
      {hint && <span className="bd-hint block">{hint}</span>}
    </span>
    <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    <span className="bd-switch" aria-hidden="true" />
  </label>
);

export const Section: React.FC<{
  id: string;
  title: string;
  open: boolean;
  onToggle: () => void;
  onReset?: () => void;
  children: React.ReactNode;
  extra?: React.ReactNode;
}> = ({ id, title, open, onToggle, onReset, children, extra }) => (
  <section className={`bd-sec ${open ? "open" : ""}`} aria-labelledby={`bd-sec-${id}`}>
    <div className="bd-sec-head">
      <button type="button" id={`bd-sec-${id}`} className="bd-sec-title" aria-expanded={open} onClick={onToggle}>
        <ChevronDown size={14} className="bd-chev" aria-hidden />
        {title}
      </button>
      {extra}
      {onReset && (
        <button type="button" className="bd-icon-btn small" aria-label={`Reset ${title}`} onClick={onReset}>
          <RotateCcw size={12} aria-hidden />
        </button>
      )}
    </div>
    <div className="bd-sec-body" hidden={!open}>
      {children}
    </div>
  </section>
);

/** Small labelled tooltip that is not the native title attribute (AGENTS.md §1). */
export const Tip: React.FC<{ text: string; children: React.ReactElement }> = ({ text, children }) => (
  <span className="bd-tip-wrap">
    {children}
    <span className="bd-tip" role="tooltip">
      {text}
    </span>
  </span>
);
