// Draws the "Show me" highlight: a calm ring around the target plus a short tooltip. Mount one in
// every surface that can be shown (Settings, dock, top bar, Command); each layer only reacts when
// the target is actually in its window.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { findTarget, GUIDE_EVENTS, openSection, type HighlightRequest } from "./coach";
import "./guide.css";

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PAD = 6;
const FIND_TRIES = 24;
const FIND_EVERY_MS = 80;
const SHOW_MS = 7000;

const reducedMotion = () => {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
};

export interface CoachMarkLayerProps {
  /** Parity/testing: start with this highlight already requested. */
  initial?: HighlightRequest;
  /** Keep the mark up (screenshots). */
  sticky?: boolean;
}

export const CoachMarkLayer: React.FC<CoachMarkLayerProps> = ({ initial, sticky }) => {
  const [req, setReq] = useState<HighlightRequest | null>(initial ?? null);
  const [box, setBox] = useState<Box | null>(null);
  const [missing, setMissing] = useState(false);
  const elRef = useRef<HTMLElement | null>(null);

  const dismiss = useCallback(() => {
    setReq(null);
    setBox(null);
    setMissing(false);
    elRef.current = null;
  }, []);

  // Listen in this window and across windows.
  useEffect(() => {
    const onLocal = (e: Event) => setReq((e as CustomEvent<HighlightRequest>).detail);
    window.addEventListener(GUIDE_EVENTS.highlight, onLocal);
    let un: (() => void) | null = null;
    let alive = true;
    listen<HighlightRequest>(GUIDE_EVENTS.highlight, (e) => setReq(e.payload))
      .then((u) => (alive ? (un = u) : u()))
      .catch(() => {});
    return () => {
      alive = false;
      window.removeEventListener(GUIDE_EVENTS.highlight, onLocal);
      un?.();
    };
  }, []);

  // Find the element (retrying while a tab switch renders), then follow it.
  useEffect(() => {
    if (!req) return;
    setMissing(false);
    let tries = 0;
    let timer = 0;
    let raf = 0;
    let stop = false;
    const follow = () => {
      if (stop) return;
      const el = elRef.current;
      if (el && el.isConnected) {
        const r = el.getBoundingClientRect();
        setBox((b) =>
          b && Math.abs(b.top - r.top) < 0.5 && Math.abs(b.left - r.left) < 0.5 && b.width === r.width && b.height === r.height
            ? b
            : { top: r.top, left: r.left, width: r.width, height: r.height }
        );
      }
      raf = requestAnimationFrame(follow);
    };
    const attempt = () => {
      if (stop) return;
      if (tries === 0) openSection(document, req.target.section);
      const el = findTarget(document, req.target);
      if (el) {
        elRef.current = el;
        el.scrollIntoView({ block: "center", behavior: reducedMotion() ? "auto" : "smooth" });
        follow();
        return;
      }
      if (++tries >= FIND_TRIES) {
        // Not in this window. Only Settings reports "couldn't find" (it owns settings targets).
        if (req.target.surface === "settings" && document.querySelector(".cc-nav-btn")) setMissing(true);
        else setReq(null);
        return;
      }
      timer = window.setTimeout(attempt, FIND_EVERY_MS);
    };
    attempt();
    const hide = sticky ? 0 : window.setTimeout(dismiss, SHOW_MS);
    return () => {
      stop = true;
      clearTimeout(timer);
      clearTimeout(hide);
      cancelAnimationFrame(raf);
    };
  }, [req, sticky, dismiss]);

  useEffect(() => {
    if (!req) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && dismiss();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [req, dismiss]);

  if (!req) return null;

  if (missing) {
    return (
      <div className="guide-coach-missing" role="status">
        <span>
          Couldn't find <b>{req.target.label ?? req.title ?? "that setting"}</b> on this page.
        </span>
        <button type="button" className="cc-btn-ghost" onClick={dismiss}>
          OK
        </button>
      </div>
    );
  }
  if (!box) return null;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const ring = { top: box.top - PAD, left: box.left - PAD, width: box.width + PAD * 2, height: box.height + PAD * 2 };
  // Moved by transform, sized directly (docs/SMOOTHNESS.md, G-13).
  const ringStyle = { width: ring.width, height: ring.height, transform: `translate3d(${ring.left}px, ${ring.top}px, 0)` };
  const tipW = Math.min(300, vw - 24);
  const below = ring.top + ring.height + 10 + 84 < vh;
  const tipTop = below ? ring.top + ring.height + 10 : Math.max(12, ring.top - 10 - 84);
  const tipLeft = Math.min(Math.max(12, ring.left), vw - tipW - 12);

  return (
    <div className="guide-coach" aria-live="polite">
      <div className="guide-coach-ring" style={ringStyle} aria-hidden="true" />
      <div className="guide-coach-tip" role="dialog" aria-label="Guide" style={{ top: tipTop, left: tipLeft, width: tipW }}>
        {req.title && <div className="guide-coach-title">{req.title}</div>}
        {req.note && <div className="guide-coach-note">{req.note}</div>}
        <div className="guide-coach-actions">
          <button type="button" className="cc-btn-ghost" onClick={dismiss}>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
};

export default CoachMarkLayer;
