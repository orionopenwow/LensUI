/**
 * Smooth Dock reflow (FLIP): when apps are pinned, unpinned, reordered, opened or closed, icons
 * that moved glide from where they were along the Dock's axis and new ones grow in. Transform
 * only (the row's layout changes once, in one frame); reduced motion makes it instant.
 *
 * Positions are read twice per change and never per frame: once before React commits (the old
 * layout, still on screen during render) and once in a layout effect after it.
 */
import { useLayoutEffect, useRef } from "react";
import { glide, reducedMotion, type GlideHandle } from "../ui/motion";

export type Axis = "x" | "y";

export interface ReflowPlan {
  /** key → how far (px) to start back along the axis. */
  moves: Map<string, number>;
  /** Keys that were not there before. */
  entered: string[];
}

/** Pure: what to animate between two snapshots (key → position along the axis). */
export function planReflow(before: ReadonlyMap<string, number>, after: ReadonlyMap<string, number>, minPx = 0.5): ReflowPlan {
  const moves = new Map<string, number>();
  const entered: string[] = [];
  for (const [k, pos] of after) {
    const was = before.get(k);
    if (was === undefined) entered.push(k);
    else if (Math.abs(was - pos) >= minPx) moves.set(k, was - pos);
  }
  // Nothing was on screen before (first paint, Dock was empty): no grow-in for everything.
  if (before.size === 0) entered.length = 0;
  return { moves, entered };
}

export type ReflowEdge = "bottom" | "top" | "left" | "right";

/**
 * Where a new icon starts from. A pin drops onto the Dock from the screen side and settles with
 * the spring (it has weight: you put it there); an app that simply opened grows in, as before.
 */
export function enterPose(key: string, edge: ReflowEdge): { from: { x?: number; y?: number; scale: number; opacity: number }; spring: boolean } {
  if (!key.startsWith("pin-")) return { from: { scale: 0.6, opacity: 0 }, spring: false };
  const d = 12;
  const offset = edge === "top" ? { y: d } : edge === "left" ? { x: d } : edge === "right" ? { x: -d } : { y: -d };
  return { from: { ...offset, scale: 0.86, opacity: 0 }, spring: true };
}

const keyOf = (el: Element) => (el as HTMLElement).dataset?.dockDragKey || (el as HTMLElement).dataset?.reflowKey || "";

/** Positions of the row's keyed children along the axis (centre, viewport px). */
export function snapshotRow(row: Element | null | undefined, axis: Axis): Map<string, number> {
  const out = new Map<string, number>();
  if (!row) return out;
  for (const el of Array.from(row.children)) {
    const k = keyOf(el);
    if (!k) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    out.set(k, axis === "x" ? r.left + r.width / 2 : r.top + r.height / 2);
  }
  return out;
}

export interface DockReflow {
  /**
   * Call during render once the row's contents are known, with a signature of what is in it (keys
   * in order). When it changed, the old layout (still on screen) is read once. `enabled` false
   * (dragging, searching, hidden) skips the animation but keeps tracking.
   */
  render(signature: string, getRow: () => Element | null | undefined, axis: Axis, enabled: boolean, edge?: ReflowEdge): void;
}

/**
 * Hook: returns the controller; its layout effect plays the glides after each commit that changed
 * the signature. Call it unconditionally (before any early return); call `.render()` later.
 */
export function useDockReflow(): DockReflow {
  const state = useRef<{
    sig: string | null;
    before: Map<string, number> | null;
    getRow: () => Element | null | undefined;
    axis: Axis;
    edge: ReflowEdge;
    pending: boolean;
    running: GlideHandle[];
  }>({ sig: null, before: null, getRow: () => null, axis: "x", edge: "bottom", pending: false, running: [] });
  const api = useRef<DockReflow>({
    render(signature, getRow, axis, enabled, edge = axis === "x" ? "bottom" : "left") {
      const st = state.current;
      st.getRow = getRow;
      st.axis = axis;
      st.edge = edge;
      if (st.sig === null) {
        st.sig = signature; // first render: nothing to animate from
        return;
      }
      if (signature === st.sig) return;
      st.sig = signature;
      st.pending = true;
      st.before = enabled && !reducedMotion() ? snapshotRow(getRow(), axis) : null;
    },
  });
  useLayoutEffect(() => {
    const st = state.current;
    if (!st.pending) return;
    st.pending = false;
    const first = st.before;
    st.before = null;
    if (!first || first.size === 0) return;
    const row = st.getRow();
    if (!row) return;
    // Settle any glide still running, so "after" is the real layout.
    for (const h of st.running) h.cancel();
    st.running = [];
    const plan = planReflow(first, snapshotRow(row, st.axis));
    if (plan.moves.size === 0 && plan.entered.length === 0) return;
    for (const el of Array.from(row.children)) {
      const k = keyOf(el);
      if (!k) continue;
      const d = plan.moves.get(k);
      if (d !== undefined) {
        st.running.push(glide(el, st.axis === "x" ? { x: d } : { y: d }, {}, { duration: "base", ease: "out" }));
      } else if (plan.entered.includes(k)) {
        const pose = enterPose(k, st.edge);
        st.running.push(glide(el, pose.from, { x: 0, y: 0, scale: 1, opacity: 1 }, pose.spring ? { duration: "slow", ease: "spring" } : { duration: "base", ease: "out" }));
      }
    }
  });
  return api.current;
}
