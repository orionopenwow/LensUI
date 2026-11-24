// Small building blocks for Lens Cleaner: count-ups, fill bars, checkboxes, badges, key chips,
// the ambient backdrop and the icon map. All motion respects reduced motion.

import React, { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Box,
  Clock,
  Copy,
  Cpu,
  Download,
  Gamepad2,
  Globe,
  History,
  Image as ImageIcon,
  Package,
  RefreshCw,
  Share2,
  Trash2,
  Check,
  Minus,
  type LucideIcon,
} from "lucide-react";
import { countAt, fmtSize } from "./model";
import { fillStyle } from "../ui/motion";

export function prefersReducedMotion(): boolean {
  if (typeof document === "undefined") return true;
  const m = document.documentElement.dataset.motion;
  if (m === "reduce") return true;
  if (m === "full") return false;
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/** Animates from the last shown value to `value` (never from 0 on re-render). */
export function useCountUp(value: number, duration = 900): number {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  const shownRef = useRef(value);
  shownRef.current = shown;
  useEffect(() => {
    if (prefersReducedMotion() || value === shownRef.current) {
      from.current = value;
      setShown(value);
      return;
    }
    from.current = shownRef.current;
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const v = countAt(from.current, value, t - start, duration);
      setShown(v);
      if (t - start < duration) raf = requestAnimationFrame(tick);
      else setShown(value);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return shown;
}

/** A size that counts up. The text is announced politely once it settles. */
export const CountSize: React.FC<{ bytes: number; className?: string; duration?: number }> = ({ bytes, className, duration }) => {
  const v = useCountUp(bytes, duration);
  return (
    <span className={`cl-num ${className ?? ""}`} aria-label={fmtSize(bytes)}>
      {fmtSize(v)}
    </span>
  );
};

/** FillSlider-style bar: a tall rounded track with the theme's ink as the fill. */
export const FillBar: React.FC<{ value: number; max: number; tone?: "ink" | "danger" | "warn" | "ok"; size?: "lg" | "md" | "sm"; label?: string }> = ({ value, max, tone = "ink", size = "md", label }) => {
  const p = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className={`cl-bar cl-bar-${size} is-${tone}`} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p)} aria-label={label}>
      <div className="cl-bar-fill" style={fillStyle(p / 100)} />
    </div>
  );
};

export const Check3: React.FC<{ state: "checked" | "mixed" | "unchecked"; onToggle: () => void; label: string; disabled?: boolean }> = ({ state, onToggle, label, disabled }) => (
  <button
    type="button"
    role="checkbox"
    aria-checked={state === "mixed" ? "mixed" : state === "checked"}
    aria-label={label}
    disabled={disabled}
    className={`cl-check is-${state}`}
    onClick={(e) => {
      e.stopPropagation();
      onToggle();
    }}
  >
    {state === "checked" ? <Check size={13} strokeWidth={3} aria-hidden /> : state === "mixed" ? <Minus size={13} strokeWidth={3} aria-hidden /> : null}
  </button>
);

export const SafetyBadge: React.FC<{ safety: "SAFE" | "REVIEW" | "ADMIN" }> = ({ safety }) => (
  <span className={`cl-badge is-${safety.toLowerCase()}`}>{safety === "REVIEW" ? "YOUR CALL" : safety}</span>
);

export const Key: React.FC<{ children: React.ReactNode }> = ({ children }) => <kbd className="cl-key">{children}</kbd>;

const ICONS: Record<string, LucideIcon> = {
  trash: Trash2,
  clock: Clock,
  globe: Globe,
  box: Box,
  alert: AlertTriangle,
  image: ImageIcon,
  cpu: Cpu,
  refresh: RefreshCw,
  share: Share2,
  history: History,
  download: Download,
  package: Package,
  copy: Copy,
  gamepad: Gamepad2,
};

export const CatIcon: React.FC<{ name: string; size?: number }> = ({ name, size = 16 }) => {
  const I = ICONS[name] ?? Box;
  return (
    <span className="cl-caticon" aria-hidden>
      <I size={size} strokeWidth={2.2} />
    </span>
  );
};

/** Subtle ambient backdrop behind Home and Done: two slow light pools and a faint dot field. */
export const Ambient: React.FC<{ mood?: "calm" | "warn" | "good" }> = ({ mood = "calm" }) => (
  <div className={`cl-ambient is-${mood}`} aria-hidden>
    <span className="cl-pool a" />
    <span className="cl-pool b" />
    <span className="cl-dots" />
  </div>
);

export const Spinner: React.FC<{ size?: number }> = ({ size = 14 }) => (
  <svg className="cl-spin" width={size} height={size} viewBox="0 0 24 24" aria-hidden>
    <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity=".2" strokeWidth="3" />
    <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
  </svg>
);

/** Circular progress (move tray, undo countdown). */
export const Ring: React.FC<{ value: number; size?: number; stroke?: number; label?: string }> = ({ value, size = 28, stroke = 3, label }) => {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg className="cl-ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeOpacity=".18" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - Math.max(0, Math.min(1, value)))}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
};
