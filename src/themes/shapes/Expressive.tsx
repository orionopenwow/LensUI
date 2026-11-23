import React, { useMemo } from "react";
import { shapePath, type ShapeId, type ShapeOptions } from "./shapes";
import "./expressive.css";

/** A shape filled with currentColor (inline SVG, so it works without mask support). */
export const ShapeGlyph: React.FC<{
  shape: ShapeId;
  size?: number;
  options?: ShapeOptions;
  className?: string;
  label?: string;
}> = ({ shape, size = 16, options, className, label }) => {
  const d = useMemo(() => shapePath(shape, options), [shape, options]);
  const w = shape === "pill" ? Math.round(size * (options?.aspect ?? 2.4)) : size;
  const vbW = shape === "pill" ? 100 * (options?.aspect ?? 2.4) : 100;
  return (
    <svg
      className={className}
      width={w}
      height={size}
      viewBox={`0 0 ${vbW} 100`}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <path d={d} fill="currentColor" />
    </svg>
  );
};

/** Clock hand angles (degrees, 0 = 12 o'clock) for a time. */
export function clockAngles(date: Date): { hour: number; minute: number } {
  const m = date.getMinutes() + date.getSeconds() / 60;
  const h = (date.getHours() % 12) + m / 60;
  return { hour: h * 30, minute: m * 6 };
}

/** Scalloped "cookie" analogue clock: accent face, rounded on-accent hands, a dot for the minute tip. */
export const CookieClock: React.FC<{ date: Date; size?: number; dayLabel?: string }> = ({ date, size = 168, dayLabel }) => {
  const face = useMemo(() => shapePath("cookie", { lobes: 12, depth: 0.09 }), []);
  const { hour, minute } = clockAngles(date);
  const label = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return (
    <div className="lx-clock lx-morph" style={{ width: size, height: size }} role="img" aria-label={`Clock, ${label}`}>
      <svg viewBox="0 0 100 100" aria-hidden>
        <path d={face} fill="currentColor" />
        <g style={{ color: "var(--lens-x-on-active, var(--lens-on-fg))" }}>
          <line x1="50" y1="50" x2="50" y2="28" stroke="currentColor" strokeWidth="9" strokeLinecap="round" transform={`rotate(${hour} 50 50)`} />
          <line x1="50" y1="50" x2="50" y2="20" stroke="currentColor" strokeWidth="5" strokeLinecap="round" opacity="0.55" transform={`rotate(${minute} 50 50)`} />
          <circle cx="50" cy="50" r="4.5" fill="currentColor" />
        </g>
        {dayLabel && (
          <text x="50" y="86" fontSize="7" fontWeight="700" textAnchor="middle" fill="var(--lens-x-on-active, var(--lens-on-fg))" opacity="0.7">
            {dayLabel}
          </text>
        )}
      </svg>
    </div>
  );
};

/** Big temperature numerals on a soft burst blob. */
export const WeatherBlob: React.FC<{ temp: number; unit?: "C" | "F"; condition?: string; size?: number }> = ({
  temp,
  unit = "C",
  condition,
  size = 150,
}) => {
  const blob = useMemo(() => shapePath("burst"), []);
  return (
    <div className="lx-weather" style={{ width: size, height: size }} role="img" aria-label={`${Math.round(temp)}°${unit}${condition ? `, ${condition}` : ""}`}>
      <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden>
        <path d={blob} fill="currentColor" />
      </svg>
      <span className="lx-weather-temp" aria-hidden>
        {Math.round(temp)}°
      </span>
      {condition && (
        <span className="lx-weather-cond" aria-hidden>
          {condition}
        </span>
      )}
    </div>
  );
};

/** ISO-8601 week number (Monday-based), e.g. 2026-11-19 → 47. */
export function isoWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export const WeekBadge: React.FC<{ date: Date }> = ({ date }) => (
  <span className="lx-week-badge" aria-label={`Week ${isoWeek(date)}`}>
    W{isoWeek(date)}
  </span>
);

export const Fab: React.FC<{ label: string; onClick?: () => void; children?: React.ReactNode }> = ({ label, onClick, children }) => (
  <button type="button" className="lx-fab" aria-label={label} onClick={onClick}>
    {children ?? "+"}
  </button>
);

export const CheckRing: React.FC<{ checked: boolean; label: string; onChange?: (v: boolean) => void }> = ({ checked, label, onChange }) => (
  <button
    type="button"
    role="checkbox"
    aria-checked={checked}
    aria-label={label}
    className="lx-check"
    onClick={() => onChange?.(!checked)}
  />
);
