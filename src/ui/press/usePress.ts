// usePress(): the React face of the press primitive. It returns attributes, not state: the press
// itself runs in the window's delegate (delegate.ts), so pressing never re-renders.
//
//   const press = usePress({ weight: "heavy", pending: installing });
//   <button {...press.props} onClick={install}>Install</button>
//
// `pending` keeps the control sunk until the work answers (CSS [data-pending]); when it ends the
// control springs back like a release.
import { useLayoutEffect, useRef } from "react";
import type { PressWeight } from "../motion/tokens";
import { installPress, machineFor } from "./delegate";

export interface PressOptions {
  weight?: PressWeight;
  pending?: boolean;
  disabled?: boolean;
}

export interface PressProps {
  "data-weight": PressWeight;
  "data-pending"?: "true";
  "aria-busy"?: true;
  "aria-disabled"?: true;
}

/** The attributes for a pressable element; also usable without the hook (no effects). */
export function pressProps({ weight = "medium", pending, disabled }: PressOptions = {}): PressProps {
  const p: PressProps = { "data-weight": weight };
  if (pending) {
    p["data-pending"] = "true";
    p["aria-busy"] = true;
  }
  if (disabled) p["aria-disabled"] = true;
  return p;
}

export function usePress<T extends Element = HTMLElement>(opts: PressOptions = {}) {
  const ref = useRef<T | null>(null);
  const wasPending = useRef(!!opts.pending);
  useLayoutEffect(() => {
    installPress();
  }, []);
  useLayoutEffect(() => {
    const el = ref.current;
    // Work answered: spring back from the sunk pose instead of snapping.
    if (wasPending.current && !opts.pending && el) machineFor(el).release();
    wasPending.current = !!opts.pending;
  }, [opts.pending]);
  return { ref, props: pressProps(opts) };
}
