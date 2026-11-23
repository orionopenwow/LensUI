// One toast for all of Lens. Call toast("Saved") from anywhere in a window; <ToastHost /> (mounted
// once per surface window) renders them. Replaces the per-surface toasts over Wave B.
import React, { useEffect, useRef, useState } from "react";
import { Check, AlertTriangle, Info } from "lucide-react";
import { Button } from "./Button";
import { toastBus, TOAST_MS, type ToastItem } from "./toastBus";
import "./ui.css";

export { toast, toastBus, TOAST_MS } from "./toastBus";
export type { ToastItem, ToastKind } from "./toastBus";

const ICON = { info: Info, success: Check, error: AlertTriangle } as const;

const ToastView: React.FC<{ t: ToastItem; onDone: (id: number) => void }> = ({ t, onDone }) => {
  const [leaving, setLeaving] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const remaining = useRef(t.durationMs ?? TOAST_MS[t.kind]);
  const started = useRef(Date.now());
  const leave = () => {
    setLeaving(true);
    window.setTimeout(() => onDone(t.id), 130);
  };
  const arm = () => {
    started.current = Date.now();
    timer.current = window.setTimeout(leave, remaining.current);
  };
  useEffect(() => {
    arm();
    return () => window.clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const Icon = ICON[t.kind];
  return (
    <div
      className={`lens-toast is-${t.kind} ${leaving ? "is-leaving" : ""}`}
      role={t.kind === "error" ? "alert" : "status"}
      aria-live={t.kind === "error" ? "assertive" : "polite"}
      // Hover pauses the timer (C6).
      onMouseEnter={() => {
        window.clearTimeout(timer.current);
        remaining.current = Math.max(800, remaining.current - (Date.now() - started.current));
      }}
      onMouseLeave={arm}
    >
      <span className="lens-toast-icon" aria-hidden>
        <Icon size={14} />
      </span>
      <span className="lens-toast-text">{t.text}</span>
      {t.action && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            t.action?.onClick();
            leave();
          }}
        >
          {t.action.label}
        </Button>
      )}
    </div>
  );
};

/** Mount once per window. Shows at most 3 toasts, newest at the bottom. */
export const ToastHost: React.FC = () => {
  const [items, setItems] = useState<ToastItem[]>([]);
  useEffect(() => toastBus.subscribe(setItems), []);
  if (!items.length) return null;
  return (
    <div className="lens-toasts">
      {items.slice(-3).map((t) => (
        <ToastView key={t.id} t={t} onDone={(id) => toastBus.dismiss(id)} />
      ))}
    </div>
  );
};
