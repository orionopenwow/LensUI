// Top Bar click-through (app/topbar_hit.rs): only the bar's controls take clicks; anywhere else a
// click goes to the app behind it. The page reports where its controls are; Lens decides from the
// real cursor (a window that ignores the mouse gets no pointer events to decide with), and tells
// the page where to draw a soft see-through halo while clicks pass through.
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { logFail } from "../failsafe/calls";

/** Everything on the bar that should keep its clicks. */
export const HIT_SELECTOR =
  'button, a[href], input, select, textarea, [role="button"], [role="switch"], [role="menuitem"], [role="tab"], [data-tb-hit], .topbar-media-pill';

export type HitRect = [number, number, number, number];

/** Rects (CSS px, rounded) of the visible controls inside `root`; nested hits are merged away. */
export function collectHitRects(root: ParentNode, selector = HIT_SELECTOR): HitRect[] {
  const out: HitRect[] = [];
  for (const el of Array.from(root.querySelectorAll<HTMLElement>(selector))) {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    out.push([Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]);
  }
  return dropContained(out);
}

/** Removes rects that sit entirely inside another (a button inside the media pill). */
export function dropContained(rects: HitRect[]): HitRect[] {
  return rects.filter(
    (a, i) =>
      !rects.some(
        (b, j) => j !== i && b[0] <= a[0] && b[1] <= a[1] && b[0] + b[2] >= a[0] + a[2] && b[1] + b[3] >= a[1] + a[3] && (j < i || b[2] * b[3] > a[2] * a[3]),
      ),
  );
}

/**
 * Whether the bar may draw the pointer halo at all: the person's switch (`topBar.pointerHalo`, on
 * unless turned off) and Windows' "Transparency effects" (off means no see-through ring). Lens
 * Core applies the same rule before it sends a halo; this keeps the page right the moment either
 * changes.
 */
export function haloAllowed(
  topBar: { pointerHalo?: boolean } | undefined | null,
  winTheme: { transparencyEnabled?: boolean } | undefined | null
): boolean {
  return topBar?.pointerHalo !== false && winTheme?.transparencyEnabled !== false;
}

export function sameRects(a: HitRect[], b: HitRect[]): boolean {
  return a.length === b.length && a.every((r, i) => r.every((v, k) => v === b[i][k]));
}

/**
 * Sends the bar's hit rects to Lens Core, once per change. A report only counts as sent when Lens
 * Core took it (B-108): a refused one used to be remembered as sent, so the next identical layout
 * was never reported and the bar's buttons stayed click-through until something moved. The first
 * report always goes out, even an empty one, so a reloaded page never inherits old rects.
 */
export function createHitReporter(send: (rects: HitRect[]) => Promise<unknown>, onFail: (e: unknown) => void = () => {}) {
  let sent: HitRect[] | null = null;
  let pending: HitRect[] | null = null;
  let seq = 0;
  return (rects: HitRect[]): boolean => {
    const same = (other: HitRect[] | null) => other !== null && sameRects(rects, other);
    if (same(pending) || (pending === null && same(sent))) return false;
    const mine = ++seq;
    pending = rects;
    send(rects).then(
      () => {
        if (mine !== seq) return;
        sent = rects;
        pending = null;
      },
      (e) => {
        if (mine !== seq) return;
        // Nothing is remembered: the next look at the layout sends it again.
        pending = null;
        onFail(e);
      },
    );
    return true;
  };
}

/** Reports the bar's controls whenever its layout changes; returns the halo the watcher asks for. */
export function useTopbarClickThrough(barRef: React.RefObject<HTMLElement | null>) {
  const [halo, setHalo] = useState<{ x: number; y: number; on: boolean }>({ x: 0, y: 0, on: false });

  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    let frame = 0;
    let failures = 0;
    const push = createHitReporter(
      (rects) => invoke("set_topbar_hit_rects_cmd", { rects }).then(() => { failures = 0; }),
      // Retried by the settle tick below; logged once per run of failures, not once per tick.
      (e) => { if (failures++ === 0) logFail("Top Bar", "report where its buttons are")(e); },
    );
    const report = () => {
      frame = 0;
      push(collectHitRects(bar));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(report);
    };
    const ro = new ResizeObserver(schedule);
    ro.observe(bar);
    const mo = new MutationObserver(schedule);
    mo.observe(bar, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "hidden", "style"] });
    window.addEventListener("resize", schedule);
    // Late layout (fonts, a pill that appears after a fetch) settles within a second or two.
    const settle = window.setInterval(schedule, 1500);
    schedule();
    const unlisten = listen<{ x: number; y: number; on: boolean }>("lens://topbar-halo", (e) => setHalo(e.payload));
    return () => {
      if (frame) cancelAnimationFrame(frame);
      ro.disconnect();
      mo.disconnect();
      window.removeEventListener("resize", schedule);
      window.clearInterval(settle);
      unlisten.then((fn) => fn());
    };
  }, [barRef]);

  return halo;
}
