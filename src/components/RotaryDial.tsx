import React, { useEffect, useRef, useState } from "react";

interface RotaryDialProps {
  label: string;
  description?: string;
  layout?: "knob" | "row";
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  format?: (val: number) => string;
  defaultValue?: number;
  onChange: (val: number) => void;
}

export const RotaryDial: React.FC<RotaryDialProps> = ({
  label,
  description,
  layout = "row",
  value,
  min,
  max,
  step = 1,
  unit = "",
  format,
  defaultValue,
  onChange,
}) => {
  const [localVal, setLocalVal] = useState(value);
  const [active, setActive] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startY: number; startVal: number } | null>(null);
  const localValRef = useRef(value);
  const lastInteractAtRef = useRef(0);
  const lastWheelAtRef = useRef(0);
  const flushTimerRef = useRef<number | null>(null);
  const pendingEmitRef = useRef<number | null>(null);
  const latestPropsRef = useRef({ min, max, step, onChange });
  latestPropsRef.current = { min, max, step, onChange };

  // Sync external prop updates only when the user isn't mid-spin/mid-drag (prevents stale IPC snap-back!)
  useEffect(() => {
    const now = performance.now();
    if (!dragRef.current && now - lastInteractAtRef.current > 200) {
      localValRef.current = value;
      setLocalVal(value);
    }
  }, [value]);

  useEffect(() => {
    return () => {
      if (flushTimerRef.current !== null) {
        window.clearTimeout(flushTimerRef.current);
      }
    };
  }, []);

  const clampStep = (raw: number, lo: number, hi: number, st: number) => {
    const clamped = Math.min(hi, Math.max(lo, raw));
    const stepped = Math.round((clamped - lo) / st) * st + lo;
    return Number(Math.min(hi, Math.max(lo, stepped)).toFixed(4));
  };

  // Instant 120fps visual update + 35ms coalesced backend commit so fast spins never feel heavy
  const commitValue = (next: number, immediate = false) => {
    if (!immediate && next === localValRef.current) return;
    localValRef.current = next;
    lastInteractAtRef.current = performance.now();
    setLocalVal(next);

    if (immediate) {
      if (flushTimerRef.current !== null) {
        window.clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      pendingEmitRef.current = null;
      latestPropsRef.current.onChange(next);
      return;
    }

    pendingEmitRef.current = next;
    if (flushTimerRef.current === null) {
      // Leading edge fires immediately so single clicks feel instant
      latestPropsRef.current.onChange(next);
      pendingEmitRef.current = null;
      flushTimerRef.current = window.setTimeout(() => {
        flushTimerRef.current = null;
        if (pendingEmitRef.current !== null) {
          const toSend = pendingEmitRef.current;
          pendingEmitRef.current = null;
          latestPropsRef.current.onChange(toSend);
        }
      }, 36);
    }
  };

  // Native non-passive wheel listener on the ENTIRE dial area with velocity-aware smooth stepping
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const { min: lo, max: hi, step: st } = latestPropsRef.current;
      const range = hi - lo || 1;
      const now = performance.now();
      const dt = now - lastWheelAtRef.current;
      lastWheelAtRef.current = now;

      // Support both vertical wheel and horizontal trackpad flick
      const rawDelta = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? -e.deltaY : e.deltaX;
      if (rawDelta === 0) return;
      const dir = rawDelta > 0 ? 1 : -1;

      // Smooth proportional base increment (~18-22 notches full sweep), Shift = fine 1-step precision,
      // and rapid spin (< 55ms between ticks) accelerates cleanly so dials feel effortless!
      const baseNotch = e.shiftKey
        ? st
        : Math.max(st, Math.round((range / 20) / st) * st);
      const accel = !e.shiftKey && dt < 55 ? 1.8 : !e.shiftKey && dt < 110 ? 1.25 : 1.0;
      const delta = dir * Math.max(st, Math.round((baseNotch * accel) / st) * st);

      const next = clampStep(localValRef.current + delta, lo, hi, st);
      commitValue(next);
    };

    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, []);

  const ratio = Math.min(1, Math.max(0, (localVal - min) / (max - min || 1)));
  const angleDeg = -135 + ratio * 270;

  const isBigKnob = layout === "knob";
  const size = isBigKnob ? 84 : 54;
  const cx = size / 2;
  const cy = size / 2;
  const r = isBigKnob ? 33 : 21;
  const capSize = isBigKnob ? 54 : 33;
  const circumference = 2 * Math.PI * r;
  const arcSpan = circumference * 0.75;
  const dashOffset = arcSpan * (1 - ratio);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setActive(true);
    dragRef.current = { startY: e.clientY, startVal: localValRef.current };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const dy = dragRef.current.startY - e.clientY;
    const sensitivity = (max - min) / 110;
    const next = clampStep(dragRef.current.startVal + dy * sensitivity, min, max, step);
    commitValue(next);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current) {
      if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      dragRef.current = null;
      setActive(false);
      // Guarantee final resting value is flushed immediately
      if (pendingEmitRef.current !== null) {
        const toSend = pendingEmitRef.current;
        pendingEmitRef.current = null;
        commitValue(toSend, true);
      }
    }
  };

  const display = format ? format(localVal) : `${localVal}${unit}`;

  const knobElement = (
    <div
      className="lens-rotary-knob"
      role="slider"
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={localVal}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={() => {
        if (defaultValue !== undefined) commitValue(defaultValue, true);
      }}
      style={{
        width: size,
        height: size,
        position: "relative",
        cursor: active ? "grabbing" : "grab",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        userSelect: "none",
      }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {isBigKnob && (
          <circle
            cx={cx}
            cy={cy}
            r={r + 5}
            fill="none"
            stroke="rgb(var(--lens-ink) / 0.14)"
            strokeWidth={2}
            strokeDasharray="1.5 6.5"
            transform={`rotate(135 ${cx} ${cy})`}
          />
        )}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="rgb(var(--lens-ink) / 0.1)"
          strokeWidth={isBigKnob ? 4 : 3}
          strokeLinecap="round"
          strokeDasharray={`${arcSpan} ${circumference}`}
          transform={`rotate(135 ${cx} ${cy})`}
        />
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="var(--cc-accent, #fafafa)"
          strokeWidth={isBigKnob ? 4 : 3}
          strokeLinecap="round"
          strokeDasharray={`${arcSpan} ${circumference}`}
          strokeDashoffset={dashOffset}
          transform={`rotate(135 ${cx} ${cy})`}
        />
      </svg>

      {/* Brushed dark metallic knob cap */}
      <div
        style={{
          position: "absolute",
          width: capSize,
          height: capSize,
          borderRadius: "50%",
          background:
            "conic-gradient(from 0deg, var(--lens-knob-a, #1b1c22), var(--lens-knob-b, #2b2d36), var(--lens-knob-c, #16171c), var(--lens-knob-d, #272932), var(--lens-knob-a, #1b1c22))",
          border: active
            ? "1px solid rgb(var(--lens-ink) / 0.34)"
            : "1px solid rgb(var(--lens-ink) / 0.14)",
          boxShadow: active
            ? "0 6px 16px rgb(0 0 0 / calc(0.65 * var(--lens-shade-k, 1))), 0 0 12px rgb(var(--lens-ink) / 0.12), inset 0 1px 1px rgb(var(--lens-ink) / 0.2)"
            : "0 6px 14px rgb(0 0 0 / calc(0.55 * var(--lens-shade-k, 1))), inset 0 1px 1px rgb(var(--lens-ink) / 0.14)",
          transform: `rotate(${angleDeg}deg)`,
          display: "flex",
          justifyContent: "center",
          paddingTop: isBigKnob ? 6 : 4,
          pointerEvents: "none",
          willChange: "transform",
        }}
      >
        <span
          style={{
            width: isBigKnob ? 3 : 2,
            height: isBigKnob ? 11 : 7,
            borderRadius: 999,
            background: "var(--cc-accent, #fafafa)",
          }}
        />
      </div>
    </div>
  );

  if (isBigKnob) {
    return (
      <div
        ref={containerRef}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 5,
          textAlign: "center",
          cursor: active ? "grabbing" : "grab",
        }}
      >
        {knobElement}
        <div style={{ fontSize: 12, fontWeight: 500, color: "var(--lens-fg-secondary)" }}>
          {label}
        </div>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 13.5,
            fontWeight: 600,
            color: "var(--lens-fg)",
            lineHeight: 1.1,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {display}
        </div>
        {description && (
          <div style={{ fontSize: 10.5, color: "var(--lens-fg-muted)", maxWidth: 118, lineHeight: 1.3 }}>
            {description}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        padding: "8px 0",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontWeight: 500, fontSize: 13, color: "var(--lens-fg)" }}>
            {label}
          </span>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              fontWeight: 600,
              color: "var(--lens-fg-secondary)",
              background: "rgb(var(--lens-ink) / 0.06)",
              border: "1px solid var(--lens-border)",
              padding: "1px 7px",
              borderRadius: 6,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {display}
          </span>
        </div>
        {description && (
          <span style={{ fontSize: 11.5, color: "var(--lens-fg-muted)", lineHeight: 1.35 }}>
            {description}
          </span>
        )}
      </div>

      {knobElement}
    </div>
  );
};
