import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createFillController, valueAt } from "./fillModel";

/**
 * Tall rounded "fill bar" slider in the theme's own ink (near-white on dark packs, near-black on light).
 * Icon + label sit inside on the left, the value on the right; both flip colour where the fill passes
 * under them. Drag anywhere, scroll, or use the keyboard (arrows 1, PageUp/PageDown 10).
 */
export const FillSlider: React.FC<{
  label: string;
  value: number;
  min?: number;
  max?: number;
  unit?: string;
  icon?: React.ReactNode;
  /** Shown instead of the number, e.g. "Muted". */
  valueText?: string;
  size?: "lg" | "md";
  /** Dim the fill (e.g. muted) without disabling. */
  muted?: boolean;
  disabled?: boolean;
  /** Trailing controls (mute button, level dot) — kept outside the drag area. */
  trailing?: React.ReactNode;
  onCommit: (v: number) => void;
}> = ({ label, value, min = 0, max = 100, unit = "%", icon, valueText, size = "md", muted, disabled, trailing, onCommit }) => {
  const [shown, setShown] = useState(value);
  const [dragging, setDragging] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;
  const ctl = useRef<ReturnType<typeof createFillController> | null>(null);
  if (!ctl.current) ctl.current = createFillController(value, setShown, (v) => commitRef.current(v), { min, max });

  useEffect(() => {
    ctl.current?.sync(value);
  }, [value]);
  useEffect(() => () => ctl.current?.dispose(), []);

  // Wheel needs a non-passive listener to stop the page scrolling.
  useLayoutEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (disabled) return;
      e.preventDefault();
      ctl.current?.wheel(e.deltaY);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [disabled]);

  const at = (clientX: number) => {
    const r = barRef.current?.getBoundingClientRect();
    return r ? valueAt(clientX, r.left, r.width, min, max) : shown;
  };
  const pct = ((shown - min) / (max - min || 1)) * 100;
  const content = (
    <>
      <span className="sh-fill-start">
        {icon && <span className="sh-fill-icon">{icon}</span>}
        <span className="sh-fill-label">{label}</span>
      </span>
      <span className="sh-fill-value">{valueText ?? `${Math.round(shown)}${unit}`}</span>
    </>
  );

  return (
    <div className={`sh-fill sh-fill-${size} ${muted ? "is-muted" : ""} ${disabled ? "is-disabled" : ""}`}>
      <div
        ref={barRef}
        className={`sh-fill-bar ${dragging ? "is-dragging" : ""}`}
        data-grab="y"
        data-grabbed={dragging || undefined}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={Math.round(shown)}
        aria-valuetext={valueText ?? `${Math.round(shown)}${unit}`}
        aria-disabled={disabled || undefined}
        onPointerDown={(e) => {
          if (disabled || e.button !== 0) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          setDragging(true);
          ctl.current?.press(at(e.clientX));
        }}
        onPointerMove={(e) => ctl.current?.dragging && ctl.current.move(at(e.clientX))}
        onPointerUp={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
          setDragging(false);
          ctl.current?.release();
        }}
        onPointerCancel={() => {
          setDragging(false);
          ctl.current?.cancel();
        }}
        onKeyDown={(e) => {
          if (!disabled && ctl.current?.key(e.key)) e.preventDefault();
        }}
      >
        <div className="sh-fill-content">{content}</div>
        {/* Same content in the inverse colour, clipped to the filled part: text flips exactly at the edge. */}
        <div className="sh-fill-fill" style={{ clipPath: `inset(0 ${100 - pct}% 0 0)` }} aria-hidden>
          <div className="sh-fill-content">{content}</div>
        </div>
      </div>
      {trailing && <div className="sh-fill-trailing">{trailing}</div>}
    </div>
  );
};

/** Small round icon button that lives next to a fill bar (mute etc.). */
export const BarButton: React.FC<{ label: string; active?: boolean; onClick: () => void; children: React.ReactNode }> = ({
  label,
  active,
  onClick,
  children,
}) => (
  <button data-weight="medium" type="button" className={`sh-barbtn ${active ? "active" : ""}`} aria-label={label} aria-pressed={active} onClick={onClick}>
    {children}
  </button>
);

/** Live level dot: grows/brightens with the peak (0–100). */
export const LevelDot: React.FC<{ level: number; label: string }> = ({ level, label }) => (
  <span className="sh-level" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={level}>
    <span style={{ transform: `scaleY(${Math.max(0.12, Math.min(1, level / 100))})` }} />
  </span>
);
