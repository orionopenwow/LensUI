/**
 * Settings › Appearance › Creator slot. Appearance opens often and themes switch fast, so nothing of
 * Backdrop Lab (code, GPU contexts, shader compiles) loads until the card is scrolled into view and
 * the window is idle. Until then a same-size placeholder holds the space.
 */
import React, { Suspense, lazy, useEffect, useRef, useState } from "react";
import type { LensConfig } from "../../../types/lens";

const CreatorCard = lazy(() => import("./CreatorCard").then((m) => ({ default: m.CreatorCard })));

type Props = { config: LensConfig | null; updateConfig: (c: LensConfig) => void };

const Placeholder = React.forwardRef<HTMLDivElement>((_, ref) => (
  <div ref={ref} className="cc-card" aria-busy="true" style={{ minHeight: 248 }}>
    <div className="cc-label">Backdrop Lab</div>
    <div className="cc-desc">Animated gradients, light and glass for your desktop.</div>
  </div>
));
Placeholder.displayName = "CreatorPlaceholder";

export const CreatorSlot: React.FC<Props> = (props) => {
  const ref = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || show) return;
    type IdleWin = { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (h: number) => void };
    const w = window as unknown as IdleWin;
    let handle = 0;
    const go = () => {
      handle = w.requestIdleCallback ? w.requestIdleCallback(() => setShow(true), { timeout: 800 }) : window.setTimeout(() => setShow(true), 200);
    };
    if (typeof IntersectionObserver === "undefined") {
      go();
      return;
    }
    const io = new IntersectionObserver(
      (es) => {
        if (es.some((e) => e.isIntersecting)) {
          io.disconnect();
          go();
        }
      },
      { rootMargin: "120px" }
    );
    io.observe(el);
    return () => {
      io.disconnect();
      if (w.cancelIdleCallback) w.cancelIdleCallback(handle);
      else window.clearTimeout(handle);
    };
  }, [show]);
  if (!show) return <Placeholder ref={ref} />;
  return (
    <Suspense fallback={<Placeholder />}>
      <CreatorCard {...props} />
    </Suspense>
  );
};
