// Tells Lens Core where the Dock is inside its window, so clicks, the reveal strip and pop-outs
// are hit-tested against the real pill on every style and edge.
import { useEffect, type RefObject } from "react";
import { invoke } from "@tauri-apps/api/core";
import { quiet, retryOnce } from "../../failsafe/calls";
import { normalizeEdge, type DockExtras } from "../model";
import { DOCK_MAGNIFICATION, normalizeMagnification } from "../styles";

export function usePillReport(
  pillRef: RefObject<HTMLElement | null>,
  splitPillRef: RefObject<HTMLElement | null>,
  /** True while search is open: the pill is wider than at rest, so nothing is reported. */
  searchOpenRef: RefObject<boolean>,
  dock: (DockExtras & { iconSize?: number }) | undefined,
  /** Anything else that changes the pill's size (visible, pin count, window count). */
  deps: unknown[]
) {
  useEffect(() => {
    const el = pillRef.current;
    if (!el) return;
    const report = () => {
      if (searchOpenRef.current) return;
      // A hidden Dock is slid off its edge: keep the last resting rect. The backend hit-tests
      // every style against this rect, so it must never be the off-screen one.
      if (el.classList.contains("is-hidden")) return;
      const rect = el.getBoundingClientRect();
      if (rect.width > 0) {
        // Split: the backend hit-tests one rect, so report the union of both pills. On the bottom
        // edge it uses a width centred on the screen, so report a width symmetric about the centre.
        const extra = splitPillRef.current?.getBoundingClientRect();
        let left = rect.left;
        let top = rect.top;
        let right = rect.right;
        let bottom = rect.bottom;
        if (extra && extra.width > 0) {
          left = Math.min(left, extra.left);
          top = Math.min(top, extra.top);
          right = Math.max(right, extra.right);
          bottom = Math.max(bottom, extra.bottom);
        }
        // Magnified icons grow past the Dock's edge: include that headroom in the hit-test rect.
        const magId = normalizeMagnification(dock?.magnification);
        if (magId !== "off") {
          const scale = DOCK_MAGNIFICATION.find((m) => m.id === magId)?.scale ?? 1;
          const iconPx = el.querySelector(".dock-item")?.getBoundingClientRect().width ?? 40;
          const head = Math.ceil((scale - 1) * iconPx);
          const e = normalizeEdge(dock?.position);
          if (e === "bottom") top -= head;
          else if (e === "top") bottom += head;
          else if (e === "left") right += head;
          else left -= head;
        }
        const mid = window.innerWidth / 2;
        const symmetricW = 2 * Math.max(mid - left, right - mid);
        invoke("set_dock_pill_width", { width: extra ? symmetricW : rect.width }).catch(quiet);
        // Full rect (CSS px within this window) lets the backend hit-test Docks on any edge.
        void retryOnce(() => invoke("set_dock_pill_rect_cmd", {
          x: left,
          y: top,
          w: right - left,
          h: bottom - top,
        }), "Dock", "report where it is");
      }
    };
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    if (splitPillRef.current) ro.observe(splitPillRef.current);
    // The backend sizes this window from the reported pill (plus flyout room) once the Dock is
    // idle. The pill keeps its place on screen but moves inside the window, so report again.
    window.addEventListener("resize", report);
    // After the Dock has slid back in, report where it came to rest.
    const onSettled = (e: TransitionEvent) => {
      if (e.target === el) report();
    };
    el.addEventListener("transitionend", onSettled);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", report);
      el.removeEventListener("transitionend", onSettled);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, dock?.iconSize, dock?.style, dock?.systemArea, dock?.position, dock?.magnification, dock?.showLabels]);
}
