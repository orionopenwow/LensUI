import React, { useEffect, useRef, useState } from "react";

export const HOLD_MS = 900;

/** Press-and-hold confirm (pointer, or Enter/Space held) — the same gesture as Lens's other
 *  approval cards, so nothing is ever sent by a stray click. */
export function HoldButton({ label, onDone, disabled, className = "" }: { label: string; onDone(): void; disabled?: boolean; className?: string }) {
  const [downAt, setDownAt] = useState<number | null>(null);
  const [p, setP] = useState(0);
  const fired = useRef(false);
  useEffect(() => {
    if (downAt === null) {
      setP(0);
      return;
    }
    let raf = 0;
    const loop = () => {
      const v = Math.min(1, (Date.now() - downAt) / HOLD_MS);
      setP(v);
      if (v >= 1) {
        if (!fired.current) {
          fired.current = true;
          setDownAt(null);
          onDone();
        }
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [downAt, onDone]);
  const start = () => {
    if (disabled) return;
    fired.current = false;
    setDownAt(Date.now());
  };
  const stop = () => setDownAt(null);
  return (
    <button data-weight="heavy"
      type="button"
      className={`lf-hold ${className}`}
      disabled={disabled}
      aria-label={`${label} (press and hold)`}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && !e.repeat) start();
      }}
      onKeyUp={(e) => {
        if (e.key === "Enter" || e.key === " ") stop();
      }}
    >
      <span className="lf-hold-fill" style={{ transform: `scaleX(${p})` }} aria-hidden />
      <span className="lf-hold-label">{label}</span>
    </button>
  );
}
