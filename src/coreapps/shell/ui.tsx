// Building blocks for the core apps. They use the Lens tokens directly and the settings
// primitives where one fits; they move to src/ui once the AAA primitives land (docs/CORE_APPS.md).
import React, { useEffect, useId, useMemo, useRef } from "react";
import { DotText } from "../../themes/dotmatrix/DotMatrix";
import { AmbientPreview, packPalette } from "../../playground/ambient/controls";
import { packById } from "../../themes/packs";
import type { LensConfig } from "../../types/generated";
import { useShape } from "./hooks";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/** The big headline number with a plain-English line under it. Dot Matrix packs draw it in dots. */
export const Hero: React.FC<{
  value: React.ReactNode;
  /** Plain text of `value` for screen readers and the dot-matrix renderer. */
  valueText?: string;
  unit?: string;
  title?: string;
  subtitle?: React.ReactNode;
  tone?: "ok" | "warn" | "bad";
  aside?: React.ReactNode;
}> = ({ value, valueText, unit, title, subtitle, tone, aside }) => {
  const shape = useShape();
  const dots = shape === "dotmatrix" && valueText && /^[0-9:.%° A-Z/-]+$/i.test(valueText);
  return (
    <section className={cx("ca-hero", tone && `tone-${tone}`)} aria-label={title}>
      <div className="ca-hero-main">
        {title && <div className="ca-eyebrow">{title}</div>}
        <div className="ca-hero-value" aria-label={valueText ? `${valueText}${unit ? ` ${unit}` : ""}` : undefined}>
          {dots ? <DotText text={valueText!.toUpperCase()} pitch={7} ghost label={valueText} /> : <span aria-hidden={!!valueText}>{value}</span>}
          {unit && <span className="ca-hero-unit" aria-hidden>{unit}</span>}
        </div>
        {subtitle && <p className="ca-hero-sub">{subtitle}</p>}
      </div>
      {aside && <div className="ca-hero-aside">{aside}</div>}
    </section>
  );
};

export const Card: React.FC<{ title?: string; meta?: React.ReactNode; actions?: React.ReactNode; className?: string; children: React.ReactNode; guide?: string }> = ({
  title,
  meta,
  actions,
  className,
  children,
  guide,
}) => {
  const id = useId();
  return (
    <section className={cx("ca-card", className)} aria-labelledby={title ? id : undefined} data-guide-id={guide}>
      {(title || actions || meta) && (
        <header className="ca-card-head">
          {title && (
            <h2 id={id} className="ca-card-title">
              {title}
            </h2>
          )}
          {meta && <span className="ca-mono ca-card-meta">{meta}</span>}
          {actions && <div className="ca-card-actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
};

/** A small line chart. Values are drawn against `max` (or their own max). */
export const Sparkline: React.FC<{ values: number[]; min?: number; max?: number; label: string; height?: number; tone?: string; fill?: boolean }> = ({
  values,
  min = 0,
  max,
  label,
  height = 36,
  tone,
  fill = true,
}) => {
  const w = 120;
  const pts = values.length ? values : [0];
  const top = Math.max(max ?? 0, ...pts, min + 1e-9);
  const step = pts.length > 1 ? w / (pts.length - 1) : w;
  const xy = pts.map((v, i) => [i * step, height - 2 - (Math.max(0, v - min) / (top - min)) * (height - 4)] as const);
  const line = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  return (
    <svg className="ca-spark" viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" role="img" aria-label={label} style={tone ? ({ "--spark": tone } as React.CSSProperties) : undefined}>
      {fill && <path d={`${line} L${w} ${height} L0 ${height} Z`} className="ca-spark-fill" />}
      <path d={line} className="ca-spark-line" vectorEffect="non-scaling-stroke" />
    </svg>
  );
};

export const Meter: React.FC<{ value: number; max?: number; label: string; tone?: "ok" | "warn" | "bad" }> = ({ value, max = 100, label, tone }) => {
  const p = Math.max(0, Math.min(100, (value / (max || 1)) * 100));
  return (
    <div className={cx("ca-meter", tone && `tone-${tone}`)} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.round(value)}>
      <span style={{ width: `${p}%` }} />
    </div>
  );
};

export const Button: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" | "quiet"; small?: boolean; icon?: React.ReactNode }
> = ({ variant = "ghost", small, icon, className, children, type = "button", ...rest }) => (
  <button type={type} className={cx("ca-btn", `ca-btn-${variant}`, small && "small", className)} {...rest}>
    {icon}
    {children}
  </button>
);

export const Pill: React.FC<{ tone?: "ok" | "warn" | "bad" | "info"; children: React.ReactNode }> = ({ tone, children }) => (
  <span className={cx("ca-pill", tone && `tone-${tone}`)}>{children}</span>
);

export const Mono: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => <span className={cx("ca-mono", className)}>{children}</span>;

/** Tabs with arrow-key navigation (roving focus). */
export function Tabs<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: string; count?: number }[]; onChange: (v: T) => void; label: string }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const n = (i + d + options.length) % options.length;
    onChange(options[n].id);
    refs.current[n]?.focus();
  };
  return (
    <div className="ca-tabs" role="tablist" aria-label={label}>
      {options.map((o, i) => (
        <button
          key={o.id}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="tab"
          aria-selected={o.id === value}
          tabIndex={o.id === value ? 0 : -1}
          className={cx("ca-tab", o.id === value && "on")}
          onClick={() => onChange(o.id)}
          onKeyDown={(e) => onKey(e, i)}
        >
          {o.label}
          {o.count != null && <span className="ca-tab-count">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export const Search: React.FC<{ value: string; onChange: (v: string) => void; placeholder: string; label?: string; inputRef?: React.Ref<HTMLInputElement> }> = ({
  value,
  onChange,
  placeholder,
  label,
  inputRef,
}) => (
  <label className="ca-search">
    <svg viewBox="0 0 24 24" aria-hidden width="14" height="14">
      <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="m20 20-4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
    <input ref={inputRef} type="search" value={value} placeholder={placeholder} aria-label={label ?? placeholder} onChange={(e) => onChange(e.target.value)} />
  </label>
);

/** The subtle moving backdrop of the current pack, for empty and done states (still with reduced motion). */
export const Ambient: React.FC<{ config: LensConfig | null }> = ({ config }) => {
  const pack = config ? packById(config.theme.preset) : undefined;
  const palette = useMemo(() => (pack ? packPalette(pack, config?.theme.accentMode === "custom" ? config.theme.customAccent : undefined) : null), [pack, config?.theme.accentMode, config?.theme.customAccent]);
  if (!pack || !palette) return null;
  return <AmbientPreview packId={pack.id} palette={palette} className="ca-ambient" fps={6} />;
};

export const Skeleton: React.FC<{ rows?: number }> = ({ rows = 4 }) => (
  <div className="ca-skeleton" aria-busy="true" aria-label="Loading">
    {Array.from({ length: rows }, (_, i) => (
      <span key={i} style={{ width: `${88 - ((i * 17) % 40)}%` }} />
    ))}
  </div>
);

export const Empty: React.FC<{ title: string; children?: React.ReactNode; action?: React.ReactNode; config?: LensConfig | null }> = ({ title, children, action, config }) => (
  <div className="ca-empty" role="status">
    {config !== undefined && <Ambient config={config} />}
    <div className="ca-empty-body">
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  </div>
);

export const ErrorNote: React.FC<{ children: React.ReactNode; onRetry?: () => void }> = ({ children, onRetry }) => (
  <div className="ca-error" role="alert">
    <span>{children}</span>
    {onRetry && (
      <Button small onClick={onRetry}>
        Try again
      </Button>
    )}
  </div>
);

/** A modal confirm. Focus starts on Cancel; Esc cancels; Enter on the danger button confirms. */
export const Confirm: React.FC<{
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ title, body, confirmLabel, danger, busy, onConfirm, onCancel }) => {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCancel();
      }
      if (e.key === "Tab" && boxRef.current) {
        const f = Array.from(boxRef.current.querySelectorAll<HTMLElement>("button:not([disabled])"));
        if (!f.length) return;
        const i = f.indexOf(document.activeElement as HTMLElement);
        if (e.shiftKey && i <= 0) {
          e.preventDefault();
          f[f.length - 1].focus();
        } else if (!e.shiftKey && i === f.length - 1) {
          e.preventDefault();
          f[0].focus();
        }
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      prev?.focus?.();
    };
  }, [onCancel]);
  return (
    <div className="ca-scrim" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="ca-dialog" role="alertdialog" aria-modal="true" aria-labelledby={`${id}-t`} aria-describedby={`${id}-b`} ref={boxRef}>
        <h3 id={`${id}-t`}>{title}</h3>
        <div id={`${id}-b`} className="ca-dialog-body">
          {body}
        </div>
        <div className="ca-dialog-actions">
          <button type="button" ref={cancelRef} className="ca-btn ca-btn-ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} disabled={busy}>
            {busy ? "Working…" : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
};

/** A one-line status that announces itself to screen readers and fades after a while. */
export const Toast: React.FC<{ text: string | null; tone?: "ok" | "bad"; onDone: () => void }> = ({ text, tone = "ok", onDone }) => {
  useEffect(() => {
    if (!text) return;
    const t = window.setTimeout(onDone, 4200);
    return () => window.clearTimeout(t);
  }, [text, onDone]);
  return (
    <div className={cx("ca-toast", text && "show", `tone-${tone}`)} role="status" aria-live="polite">
      {text}
    </div>
  );
};

/** An on/off switch (role="switch"). */
export const Switch: React.FC<{ checked: boolean; label: string; disabled?: boolean; onChange: (v: boolean) => void }> = ({ checked, label, disabled, onChange }) => (
  <button type="button" role="switch" aria-label={label} aria-checked={checked} disabled={disabled} className={cx("ca-switch", checked && "on")} onClick={() => onChange(!checked)}>
    <span />
  </button>
);

/** Keeps a crash in one app from leaving a blank window. */
export class AppErrorBoundary extends React.Component<{ label: string; children: React.ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.warn(`[coreapps] ${this.props.label} failed to render:`, error.message);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="ca-root ca-crash" role="alert">
        <div className="ca-empty-body">
          <h3>{this.props.label} hit a problem</h3>
          <p>{this.state.error.message || "Something went wrong."}</p>
          <button type="button" className="ca-btn ca-btn-primary" onClick={() => this.setState({ error: null })}>
            Try again
          </button>
        </div>
      </div>
    );
  }
}
