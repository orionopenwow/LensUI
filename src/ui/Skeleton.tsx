import React, { useEffect, useState } from "react";
import "./ui.css";

/** Show nothing for loads faster than this (no skeleton flash). AAA_RESEARCH §1. */
export const SKELETON_DELAY_MS = 200;

/** Returns false until `delayMs` has passed since mount. */
export function useDelayed(delayMs = SKELETON_DELAY_MS): boolean {
  const [shown, setShown] = useState(delayMs <= 0);
  useEffect(() => {
    if (delayMs <= 0) return;
    const t = window.setTimeout(() => setShown(true), delayMs);
    return () => window.clearTimeout(t);
  }, [delayMs]);
  return shown;
}

export type SkeletonShape = "rows" | "page" | "grid" | "lines";

/**
 * Content-shaped placeholder. `label` is announced to screen readers (role=status) straight away,
 * even while the visual is still in its 200ms grace period.
 */
export const Skeleton: React.FC<{
  label: string;
  shape?: SkeletonShape;
  rows?: number;
  delayMs?: number;
  className?: string;
}> = ({ label, shape = "rows", rows = 3, delayMs = SKELETON_DELAY_MS, className }) => {
  const shown = useDelayed(delayMs);
  const n = Math.max(1, Math.min(rows, 8));
  return (
    <div className={`lens-skeleton is-${shape} ${className ?? ""}`} role="status" aria-busy="true" data-skeleton={shape}>
      <span className="lens-sr-only">{label}</span>
      {shown && shape === "page" && (
        <>
          <div className="lens-skeleton-line is-title" aria-hidden />
          <div className="lens-skeleton-block" aria-hidden />
        </>
      )}
      {shown && shape === "grid" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 10 }} aria-hidden>
          {Array.from({ length: n * 2 }, (_, i) => (
            <div key={i} className="lens-skeleton-block" />
          ))}
        </div>
      )}
      {shown &&
        (shape === "rows" || shape === "page") &&
        Array.from({ length: n }, (_, i) => (
          <div key={i} className="lens-skeleton-row" aria-hidden>
            <div className="lens-skeleton-line" style={{ width: `${72 - ((i * 17) % 30)}%` }} />
            <div className="lens-skeleton-pill" />
          </div>
        ))}
      {shown &&
        shape === "lines" &&
        Array.from({ length: n }, (_, i) => (
          <div key={i} className="lens-skeleton-line" style={{ width: `${92 - ((i * 23) % 40)}%` }} aria-hidden />
        ))}
    </div>
  );
};
