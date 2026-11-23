// Settings hub building blocks. Every page is made from these so spacing, labels, values and
// states line up everywhere: Hero → Sections (collapsible) → Rows.

import React, { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ChevronDown, ExternalLink, Loader2, AlertTriangle, Info } from "lucide-react";
import "./settings.css";

/** "Open in Windows Settings ↗" — only ms-settings URIs (the backend refuses anything else). */
export const WinLink: React.FC<{ uri: string; label?: string; compact?: boolean }> = ({ uri, label = "Open in Windows Settings", compact }) => {
  const [err, setErr] = useState<string | null>(null);
  return (
    <button
      type="button"
      className={`cc-chip sh-winlink ${compact ? "compact" : ""}`}
      onClick={() => {
        setErr(null);
        invoke("open_windows_setting_cmd", { uri }).catch((e) => setErr(String(e)));
      }}
      aria-label={`${label} (opens Windows Settings)`}
    >
      <span>{label}</span>
      <ExternalLink size={11} aria-hidden />
      {err && <span className="sh-inline-err">{err}</span>}
    </button>
  );
};

export type StateKind = "loading" | "error" | "unavailable" | "info";

/** One-line status: loading, an error with a way out, or why something isn't available here. */
export const StateNote: React.FC<{ kind: StateKind; children: React.ReactNode; action?: React.ReactNode }> = ({ kind, children, action }) => (
  <div className={`sh-state sh-state-${kind}`} role={kind === "error" ? "alert" : "status"}>
    {kind === "loading" ? (
      <Loader2 size={13} className="sh-spin" aria-hidden />
    ) : kind === "error" ? (
      <AlertTriangle size={13} aria-hidden />
    ) : (
      <Info size={13} aria-hidden />
    )}
    <span>{children}</span>
    {action}
  </div>
);

/** Hero row: the 2–4 things people come to this page for. */
export const Hero: React.FC<{ children: React.ReactNode }> = ({ children }) => <div className="sh-hero">{children}</div>;

export const HeroTile: React.FC<{
  icon?: React.ReactNode;
  label: string;
  value?: React.ReactNode;
  sub?: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children?: React.ReactNode;
}> = ({ icon, label, value, sub, active, disabled, onClick, children }) => {
  const body = (
    <>
      <div className="sh-hero-top">
        {icon && <span className="sh-hero-icon">{icon}</span>}
        <span className="sh-hero-label">{label}</span>
        {value !== undefined && <span className="sh-hero-value">{value}</span>}
      </div>
      {sub && <div className="sh-hero-sub">{sub}</div>}
      {children}
    </>
  );
  return onClick ? (
    <button
      type="button"
      className={`sh-hero-tile clickable ${active ? "active" : ""}`}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
    >
      {body}
    </button>
  ) : (
    <div className={`sh-hero-tile ${active ? "active" : ""} ${disabled ? "disabled" : ""}`}>{body}</div>
  );
};

/** Collapsible section with a one-line summary, the same pattern as Theme & Look › Customise. */
export const Section: React.FC<{
  id: string;
  title: string;
  summary?: React.ReactNode;
  defaultOpen?: boolean;
  /** Set by the hub when a deep link targets this section. */
  forceOpen?: boolean;
  actions?: React.ReactNode;
  children: React.ReactNode;
}> = ({ id, title, summary, defaultOpen = true, forceOpen, actions, children }) => {
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => {
    if (forceOpen) setOpen(true);
  }, [forceOpen]);
  return (
    <section className={`tux-section sh-section ${open ? "open" : ""}`} data-section={id} id={`sec-${id}`}>
      <div className="sh-section-headrow">
        <button
          type="button"
          className="tux-section-head"
          aria-expanded={open}
          aria-controls={`sh-sec-${id}`}
          onClick={() => setOpen((o) => !o)}
        >
          <span className="tux-section-title">{title}</span>
          {summary && <span className="tux-section-summary">{summary}</span>}
          <ChevronDown size={15} className="tux-chevron" aria-hidden />
        </button>
        {actions && <div className="sh-section-actions">{actions}</div>}
      </div>
      {open && (
        <div className="tux-section-body sh-section-body" id={`sh-sec-${id}`}>
          {children}
        </div>
      )}
    </section>
  );
};

/** Label (fixed column) · description · control (right-aligned). */
export const Row: React.FC<{
  label: React.ReactNode;
  desc?: React.ReactNode;
  children?: React.ReactNode;
  state?: React.ReactNode;
}> = ({ label, desc, children, state }) => (
  <div className="sh-row">
    <div className="sh-row-text">
      <div className="sh-row-label">{label}</div>
      {desc && <div className="sh-row-desc">{desc}</div>}
      {state}
    </div>
    {children !== undefined && <div className="sh-row-control">{children}</div>}
  </div>
);

export const Toggle: React.FC<{ checked: boolean; label: string; disabled?: boolean; onChange: (v: boolean) => void }> = ({
  checked,
  label,
  disabled,
  onChange,
}) => (
  <button
    type="button"
    role="switch"
    aria-label={label}
    aria-checked={checked}
    disabled={disabled}
    className={`cc-toggle ${checked ? "on" : ""}`}
    onClick={() => onChange(!checked)}
  />
);

export function Segmented<T extends string>({
  value,
  options,
  label,
  disabled,
  onChange,
}: {
  value: T;
  options: { id: T; label: string }[];
  label: string;
  disabled?: boolean;
  onChange: (v: T) => void;
}) {
  return (
    <div className="sh-seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          disabled={disabled}
          className={`sh-seg-btn ${value === o.id ? "active" : ""}`}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const Select: React.FC<{
  value: string;
  label: string;
  options: { id: string; label: string }[];
  disabled?: boolean;
  onChange: (v: string) => void;
}> = ({ value, label, options, disabled, onChange }) => (
  <select className="cc-input sh-select" aria-label={label} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
    {options.map((o) => (
      <option key={o.id} value={o.id}>
        {o.label}
      </option>
    ))}
  </select>
);

/**
 * Slider that moves instantly but only commits after the hand stops (debounced), so a drag
 * sends a handful of calls instead of hundreds.
 */
export const Slider: React.FC<{
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  disabled?: boolean;
  delay?: number;
  onCommit: (v: number) => void;
}> = ({ label, value, min = 0, max = 100, step = 1, unit = "%", disabled, delay = 140, onCommit }) => {
  const [local, setLocal] = useState(value);
  const timer = useRef<number | undefined>(undefined);
  const dragging = useRef(false);
  useEffect(() => {
    if (!dragging.current) setLocal(value);
  }, [value]);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const id = `sh-${label.replace(/\W+/g, "-").toLowerCase()}`;
  const pct = ((local - min) / (max - min || 1)) * 100;
  return (
    <div className="tux-slider sh-slider">
      <label htmlFor={id} className="tux-slider-label">
        {label}
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={local}
        disabled={disabled}
        onPointerDown={() => (dragging.current = true)}
        onPointerUp={() => (dragging.current = false)}
        onChange={(e) => {
          const v = Number(e.target.value);
          setLocal(v);
          window.clearTimeout(timer.current);
          timer.current = window.setTimeout(() => onCommit(v), delay);
        }}
        style={{ "--tux-fill": `${pct}%` } as React.CSSProperties}
      />
      <output htmlFor={id} className="tux-value">
        {Math.round(local)}
        {unit}
      </output>
    </div>
  );
};

/** Horizontal usage bar (drives, memory). */
export const Meter: React.FC<{ value: number; max: number; label: string; tone?: "ok" | "warn" | "bad" }> = ({ value, max, label, tone }) => {
  const pct = Math.max(0, Math.min(100, (value / (max || 1)) * 100));
  const t = tone ?? (pct > 90 ? "bad" : pct > 75 ? "warn" : "ok");
  return (
    <div className={`sh-meter sh-meter-${t}`} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
};

/** Chip row of deep links at the bottom of a page. */
export const LinkRow: React.FC<{ children: React.ReactNode }> = ({ children }) => <div className="sh-linkrow">{children}</div>;
