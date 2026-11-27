// The Dock's notice: one short line beside the Dock when something the person asked for couldn't
// be done ("Couldn't open Spotify."). It shows the newest message on the one toast bus and goes
// by itself; it never takes clicks (the Dock window passes clicks through outside the Dock).
import React, { useEffect, useState } from "react";
import { AlertTriangle, Check, Info } from "lucide-react";
import { useLingering } from "../ui/motion";
import { TOAST_MS, toastBus, type ToastItem } from "../ui/toastBus";
import "./DockNotice.css";

const ICON = { info: Info, success: Check, error: AlertTriangle } as const;

export function DockNotice() {
  const [item, setItem] = useState<ToastItem | null>(null);
  useEffect(() => toastBus.subscribe((items) => setItem(items[items.length - 1] ?? null)), []);
  useEffect(() => {
    if (!item) return;
    const t = window.setTimeout(() => toastBus.dismiss(item.id), item.durationMs ?? TOAST_MS[item.kind]);
    return () => window.clearTimeout(t);
  }, [item]);
  const linger = useLingering(item, { enter: { y: 6, opacity: 0 }, exit: { y: 4, opacity: 0 } });
  const shown = linger.value;
  const Icon = shown ? ICON[shown.kind] : Info;
  return (
    // The live region is always in the page, so a message that appears in it is announced.
    <div className="dock-notice-anchor" role="status" aria-live="polite">
      {shown && linger.mounted && (
        <div ref={linger.ref} className={`dock-notice is-${shown.kind}`}>
          <Icon size={13} strokeWidth={2.4} aria-hidden="true" />
          <span>{shown.text}</span>
        </div>
      )}
    </div>
  );
}
