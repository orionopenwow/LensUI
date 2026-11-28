import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AppWindow, ChevronLeft, ChevronRight, X } from "lucide-react";
import type { RunningWindow } from "../types/lens";
import { carouselTiles, counterText, initialIndex, type Rect, jumps, reconcileIndex, slideOffset, stepIndex, wheelStep, wrapIndex } from "./carousel";
import { useWindowPeek } from "./usePeek";
import { logFail, quiet } from "../failsafe/calls";
import "./DockWindowCarousel.css";

interface Props {
  /** App name for the header. */
  title: string;
  windows: RunningWindow[];
  iconUrl?: string | null;
  onFocus: (hwnd: number) => void;
  onClose: (hwnd: number) => void;
  /** False while the hover card is leaving: the native thumbnail goes at once. */
  active?: boolean;
}

function rectOf(el: Element): Rect {
  const b = el.getBoundingClientRect();
  return { x: b.left, y: b.top, w: b.width, h: b.height };
}

/** Running animations that will end (a looping one would hold the picture back forever). */
function finiteAnimations(el: Element | null | undefined): Animation[] {
  if (!el || typeof (el as HTMLElement).getAnimations !== "function") return [];
  return (el as HTMLElement).getAnimations({ subtree: true }).filter((a) => {
    const end = a.effect?.getComputedTiming().endTime;
    return typeof end === "number" && Number.isFinite(end) && a.playState === "running";
  });
}

/**
 * The Dock hover card for an app with two or more windows: a carousel. The current window is large
 * and centred (title and a close button under it), its neighbours peek in at the sides, a dot row
 * shows where you are. Wheel, ‹ ›, Left/Right and the dots switch; a click on the current window
 * focuses it, a click on a neighbour brings it to the centre.
 *
 * The live picture is the existing native DWM thumbnail (src-tauri/src/win_previews.rs), placed
 * over the centre tile only. It is hidden the moment a slide starts and shown again at the new
 * centre once every animation on the card has finished, so it never lags behind the slide or is
 * left over an empty spot. Neighbours show the app icon.
 */
export const DockWindowCarousel: React.FC<Props> = ({ title, windows, iconUrl, onFocus, onClose, active = true }) => {
  const n = windows.length;
  const rootRef = useRef<HTMLDivElement>(null);
  const shotRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const sideShots = useRef<Map<number, { el: HTMLDivElement; offset: number }>>(new Map());
  const [index, setIndex] = useState(() => initialIndex(windows));
  const [failed, setFailed] = useState<Set<number>>(new Set());
  const { startPeek, endPeek } = useWindowPeek();
  const wheelAt = useRef(0);

  // A window closed (or opened): stay on the same window when it is still there.
  const hwnds = windows.map((w) => w.hwnd);
  const hwndKey = hwnds.join(",");
  const prevHwnds = useRef<number[]>(hwnds);
  if (prevHwnds.current.join(",") !== hwndKey) {
    const next = reconcileIndex(prevHwnds.current, index, hwnds);
    prevHwnds.current = hwnds;
    if (next !== index) setIndex(next);
  }
  const cur = wrapIndex(index, n);
  const current = windows[cur];

  // Slides that jump past the centre in one step (the wrap) move without animating.
  const prevOffsets = useRef<Map<number, number>>(new Map());
  const offsets = windows.map((w, i) => slideOffset(i, cur, n));
  useLayoutEffect(() => {
    prevOffsets.current = new Map(windows.map((w, i) => [w.hwnd, offsets[i]]));
  });

  // The picture leaves before the slide starts (the effect below brings it back at rest).
  const hidePicture = () => invoke("dock_preview_hide_cmd").catch(quiet);
  const go = (delta: number) => {
    if (n < 2 || !delta) return;
    endPeek();
    hidePicture();
    setIndex((i) => stepIndex(i, n, delta));
  };
  const goTo = (i: number) => {
    if (wrapIndex(i, n) === cur) return;
    endPeek();
    hidePicture();
    setIndex(wrapIndex(i, n));
  };

  // Left/Right switch, Enter focuses, while the card is up (never while typing somewhere).
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyRef.current = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    if (e.key === "ArrowLeft") go(-1);
    else if (e.key === "ArrowRight") go(1);
    else if (e.key === "Enter" && current) onFocus(current.hwnd);
    else return;
    e.preventDefault();
  };
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);

  // The native thumbnail: hide on every change, show again at rest over the centre tile.
  const currentHwnd = current?.hwnd ?? 0;
  useEffect(() => {
    // (The previous run's cleanup, or go(), already took the old picture away.)
    if (!active || !currentHwnd) return;
    let cancelled = false;
    let sent = "";
    const send = () => {
      if (cancelled) return;
      // Something started moving again (a resize, the card's own placement): wait for it.
      const moving = finiteAnimations(rootRef.current?.closest(".dock-hover-card") ?? rootRef.current);
      if (moving.length) {
        Promise.all(moving.map((a) => a.finished.catch(() => undefined))).then(() => requestAnimationFrame(send));
        return;
      }
      const el = shotRef.current;
      const stage = stageRef.current;
      if (!el || !stage) return;
      const shot = rectOf(el);
      if (shot.w <= 0 || shot.h <= 0) return;
      const sides = Array.from(sideShots.current.entries()).map(([hwnd, s]) => ({ hwnd, offset: s.offset, shot: rectOf(s.el) }));
      const tiles = carouselTiles(rectOf(stage), { hwnd: currentHwnd, shot }, sides);
      const sig = JSON.stringify(tiles);
      if (sig === sent) return;
      sent = sig;
      const asked = tiles.map((t) => t.hwnd);
      const background = getComputedStyle(document.documentElement).getPropertyValue("--lens-pack-base").trim() || "#141418";
      invoke<number[]>("dock_preview_show_cmd", { tiles, background, surface: "dock" })
        .then((bad) => {
          if (cancelled) return;
          setFailed((prev) => {
            const next = new Set(prev);
            for (const h of asked) {
              if ((bad ?? []).includes(h)) next.add(h);
              else next.delete(h);
            }
            return next;
          });
        })
        .catch((e) => {
          logFail("Dock", "show the window previews")(e);
          if (!cancelled) setFailed((prev) => new Set([...prev, ...asked]));
        });
    };
    // After this commit's transitions have started (next frame), wait for them to end.
    const raf = requestAnimationFrame(() => requestAnimationFrame(send));
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => requestAnimationFrame(send)) : null;
    if (ro && rootRef.current) ro.observe(rootRef.current);
    window.addEventListener("resize", send);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      ro?.disconnect();
      window.removeEventListener("resize", send);
      invoke("dock_preview_hide_cmd").catch(quiet);
    };
  }, [currentHwnd, active, n]);

  if (!current) return null;
  const icon = (w: RunningWindow) => w.iconDataUrl || iconUrl;
  const name = (w: RunningWindow) => w.title || w.processName.replace(/\.exe$/i, "");
  const headIcon = iconUrl || current.iconDataUrl;

  return (
    <div className="dwc" ref={rootRef} role="group" aria-roledescription="carousel" aria-label={`${title} windows`}>
      <div className="dwc-head">
        {headIcon ? <img src={headIcon} alt="" className="dwc-head-icon" /> : <AppWindow size={14} className="dwc-head-icon" />}
        <span className="dwc-head-name">{title}</span>
        <span className="dwc-count" aria-live="polite">{counterText(cur, n)}</span>
        <button type="button" data-weight="medium" className="dwc-nav" aria-label="Previous window" onClick={() => go(-1)}>
          <ChevronLeft size={14} strokeWidth={2.6} />
        </button>
        <button type="button" data-weight="medium" className="dwc-nav" aria-label="Next window" onClick={() => go(1)}>
          <ChevronRight size={14} strokeWidth={2.6} />
        </button>
      </div>
      <div
        className="dwc-stage"
        ref={stageRef}
        onWheel={(e) => {
          const step = wheelStep(e.deltaX, e.deltaY, wheelAt.current, e.timeStamp);
          if (!step) return;
          wheelAt.current = e.timeStamp;
          go(step);
        }}
      >
        {windows.map((w, i) => {
          const d = offsets[i];
          const prev = prevOffsets.current.get(w.hwnd);
          const instant = prev !== undefined && jumps(prev, d);
          const place = d === 0 ? "is-current" : Math.abs(d) === 1 ? "is-side" : "is-away";
          // Current and neighbours are live pictures; windows further away, or ones Windows
          // won't preview (minimized), show the icon.
          const showIcon = Math.abs(d) > 1 || failed.has(w.hwnd);
          const ic = icon(w);
          return (
            <div
              key={w.hwnd}
              className={`dwc-slide dwc-at-${d < 0 ? "m" : ""}${Math.min(2, Math.abs(d))} ${place} ${instant ? "no-anim" : ""} ${w.isFocused ? "focused" : ""}`}
              aria-hidden={d !== 0}
              onClick={() => (d === 0 ? (endPeek(), onFocus(w.hwnd)) : go(d))}
              onMouseEnter={d === 0 ? () => startPeek(w.hwnd) : undefined}
              onMouseLeave={d === 0 ? endPeek : undefined}
            >
              <div
                className={`dwc-shot ${showIcon ? "is-fallback" : ""}`}
                ref={(el) => {
                  if (d === 0) shotRef.current = el;
                  if (el && Math.abs(d) === 1) sideShots.current.set(w.hwnd, { el, offset: d });
                  else sideShots.current.delete(w.hwnd);
                }}
              >
                {showIcon && (ic ? <img src={ic} alt="" className="dwc-fallback-icon" /> : <AppWindow size={30} strokeWidth={1.6} />)}
              </div>
              <div className="dwc-caption">
                <span className="dwc-title">{name(w)}</span>
                {d === 0 && (
                  <button
                    type="button"
                    data-weight="medium"
                    className="dwc-close"
                    aria-label={`Close ${name(w)}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      endPeek();
                      onClose(w.hwnd);
                    }}
                  >
                    <X size={11} strokeWidth={2.8} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="dwc-dots" role="tablist" aria-label="Windows">
        {windows.map((w, i) => (
          <button
            key={w.hwnd}
            type="button"
            data-weight="medium"
            role="tab"
            aria-selected={i === cur}
            aria-label={`Window ${i + 1} of ${n}: ${name(w)}`}
            className={`dwc-dot ${i === cur ? "is-on" : ""}`}
            onClick={() => goTo(i)}
          />
        ))}
      </div>
    </div>
  );
};
