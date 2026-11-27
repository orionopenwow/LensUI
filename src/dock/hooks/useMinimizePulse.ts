// Minimise/restore feedback: pulse an icon when one of its windows changes minimised state.
import { useEffect, useRef, useState } from "react";
import type { RunningWindow } from "../../types/lens";
import { prefersReducedMotion } from "../model";

/** Windows that were just minimised or restored, by hwnd. */
export function useMinimizePulse(runningWindows: RunningWindow[], on: boolean): Set<number> {
  const [pulseHwnds, setPulseHwnds] = useState<Set<number>>(() => new Set());
  const minimizedRef = useRef<Map<number, boolean>>(new Map());
  useEffect(() => {
    const prev = minimizedRef.current;
    const changed: number[] = [];
    const next = new Map<number, boolean>();
    for (const w of runningWindows) {
      next.set(w.hwnd, w.isMinimized);
      const before = prev.get(w.hwnd);
      if (before !== undefined && before !== w.isMinimized) changed.push(w.hwnd);
    }
    minimizedRef.current = next;
    if (!on || changed.length === 0 || prefersReducedMotion()) return;
    setPulseHwnds((cur) => new Set([...cur, ...changed]));
    const t = window.setTimeout(() => {
      setPulseHwnds((cur) => {
        const n = new Set(cur);
        changed.forEach((h) => n.delete(h));
        return n;
      });
    }, 460);
    return () => window.clearTimeout(t);
  }, [runningWindows, on]);
  return pulseHwnds;
}
