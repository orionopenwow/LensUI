import React, { useEffect, useRef, useState } from "react";

interface PillFillBarProps {
  label: string;
  value: number; // 0..100
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  fillColor: string;
  icon: React.ReactNode;
  disabled?: boolean;
  onIconClick?: () => void;
  onChange: (val: number) => void;
}

export const PillFillBar: React.FC<PillFillBarProps> = ({
  label,
  value,
  min = 0,
  max = 100,
  step = 2,
  unit = "%",
  fillColor,
  icon,
  disabled = false,
  onIconClick,
  onChange,
}) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const [isDragging, setIsDragging] = useState(false);
  const latestRef = useRef({ value, min, max, step, onChange });
  latestRef.current = { value, min, max, step, onChange };

  const clampStep = (raw: number, lo = min, hi = max, st = step) => {
    const c = Math.min(hi, Math.max(lo, raw));
    return Math.round((c - lo) / st) * st + lo;
  };

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const { value: cur, min: lo, max: hi, step: st, onChange: cb } = latestRef.current;
      const dir = e.deltaY < 0 ? 1 : -1;
      const next = clampStep(cur + dir * st, lo, hi, st);
      if (next !== cur) cb(next);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const updateFromClientX = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const next = clampStep(min + ratio * (max - min));
    if (next !== value) onChange(next);
  };

  const pct = Math.min(100, Math.max(0, ((value - min) / (max - min || 1)) * 100));

  return (
    <div
      ref={trackRef}
      className={`lens-pill-bar ${isDragging ? "is-dragging" : ""}`}
      role="slider"
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        draggingRef.current = true;
        setIsDragging(true);
        updateFromClientX(e.clientX);
      }}
      onPointerMove={(e) => {
        if (draggingRef.current) updateFromClientX(e.clientX);
      }}
      onPointerUp={(e) => {
        draggingRef.current = false;
        setIsDragging(false);
        e.currentTarget.releasePointerCapture(e.pointerId);
      }}
      style={{
        position: "relative",
        height: 42,
        borderRadius: 11,
        background: "rgb(var(--lens-ink) / 0.05)",
        border: "1px solid rgb(var(--lens-ink) / 0.09)",
        overflow: "hidden",
        cursor: isDragging ? "grabbing" : "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 12px",
        opacity: disabled ? 0.55 : 1,
        userSelect: "none",
      }}
    >
      {/* Rounded rectangle fill bar with sleek thick theme handle */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          width: `${pct}%`,
          background: `color-mix(in oklch, ${fillColor} 32%, rgb(var(--lens-ink) / 0.08))`,
          transition: isDragging ? "none" : "width 70ms linear",
          pointerEvents: "none",
        }}
      >
        {pct > 2 && pct < 99 && (
          <span
            style={{
              position: "absolute",
              right: 0,
              top: 0,
              bottom: 0,
              width: 1.5,
              background: fillColor,
              opacity: isDragging ? 0.75 : 0.4,
            }}
          />
        )}
      </div>

      <div
        style={{
          position: "relative",
          zIndex: 2,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            if (onIconClick) onIconClick();
          }}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            color: fillColor,
            padding: 2,
            borderRadius: 6,
          }}
          aria-label={onIconClick ? `Toggle ${label}` : label}
        >
          {icon}
        </button>
        <span style={{ fontSize: 12.5, fontWeight: 500, color: "var(--lens-fg)" }}>{label}</span>
      </div>

      <span
        style={{
          position: "relative",
          zIndex: 2,
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          fontWeight: 600,
          color: "var(--lens-fg-3, #d4d4d8)",
        }}
      >
        {value}{unit}
      </span>
    </div>
  );
};
