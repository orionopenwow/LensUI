// The detail page's screenshots: every official image the project publishes, one at a time, with
// previous / next, dots and the arrow keys. It moves on by itself until you take over, never while
// the window is hidden, and not at all with reduced motion. Each image says where it came from.
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { isVideo, useMedia } from "./media";
import { hueFor } from "./placeholder";
import type { CatalogApp } from "./types";
import { AppIcon } from "./visuals";

const ADVANCE_MS = 4200;

function reducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.motion === "reduce";
  } catch {
    return false;
  }
}

/** The next index when stepping through `count` items, wrapping at both ends. */
export function stepIndex(index: number, by: number, count: number): number {
  if (count <= 0) return 0;
  return (((index + by) % count) + count) % count;
}

export function Gallery({ app, live = true, start = 0 }: { app: CatalogApp; live?: boolean; start?: number }) {
  const items = app.media.loop ? [...app.media.screenshots, app.media.loop] : app.media.screenshots;
  const count = items.length;
  const [index, setIndex] = useState(stepIndex(start, 0, count));
  // +1 forward, -1 back: the new image arrives from that side.
  const [dir, setDir] = useState(1);
  const [taken, setTaken] = useState(start > 0);
  const [failed, setFailed] = useState<Record<number, boolean>>({});
  const box = useRef<HTMLDivElement>(null);
  const url = items[index] ?? null;
  const media = useMedia(app.id, url, live);

  useEffect(() => {
    setIndex(stepIndex(start, 0, count));
    setTaken(start > 0);
    setFailed({});
  }, [app.id, start, count]);

  // Move on by itself: only while visible, only until the person takes over.
  useEffect(() => {
    if (taken || count < 2 || reducedMotion()) return;
    const t = window.setInterval(() => {
      if (document.hidden) return;
      setDir(1);
      setIndex((i) => stepIndex(i, 1, count));
    }, ADVANCE_MS);
    return () => window.clearInterval(t);
  }, [taken, count]);

  if (!count) return null;
  const go = (to: number, by: number) => {
    setTaken(true);
    setDir(by);
    setIndex(stepIndex(to, 0, count));
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === "Home") go(0, -1);
    else if (e.key === "End") go(count - 1, 1);
    else go(index + (e.key === "ArrowRight" ? 1 : -1), e.key === "ArrowRight" ? 1 : -1);
  };
  const ready = media.status === "ready" && !failed[index];
  const loading = live && media.status === "loading";
  const what = url && isVideo(url) ? "Demo" : "Screenshot";
  // The backdrop behind a missing or loading image is tinted from the app's id.
  const tint = { ["--la-hue"]: hueFor(app.id) } as CSSProperties;
  return (
    <div
      ref={box}
      className="la-gallery la-shots"
      role="group"
      aria-roledescription="carousel"
      aria-label={`${app.name} screenshots`}
      tabIndex={0}
      onKeyDown={onKey}
      style={tint}
    >
      <div className={`la-shots-stage${loading ? " la-shimmer" : ""}`}>
        {!ready && !loading && <AppIcon app={app} size={88} live={live} />}
        {ready &&
          (isVideo(url!) ? (
            <video key={media.src} className={`la-shot ${dir > 0 ? "from-right" : "from-left"}`} src={media.src!} muted loop playsInline autoPlay aria-label={`${app.name} demo`} />
          ) : (
            <img
              key={media.src}
              className={`la-shot ${dir > 0 ? "from-right" : "from-left"}`}
              src={media.src!}
              alt={`${app.name}, screenshot ${index + 1} of ${count}`}
              draggable={false}
              onError={() => setFailed((f) => ({ ...f, [index]: true }))}
            />
          ))}
      </div>
      {count > 1 && (
        <>
          <button className="la-shots-nav prev" data-weight="medium" aria-label="Previous screenshot" onClick={() => go(index - 1, -1)}>
            <ChevronLeft size={16} strokeWidth={2.4} />
          </button>
          <button className="la-shots-nav next" data-weight="medium" aria-label="Next screenshot" onClick={() => go(index + 1, 1)}>
            <ChevronRight size={16} strokeWidth={2.4} />
          </button>
        </>
      )}
      <div className="la-shots-foot">
        <span className="la-shots-credit la-mono">
          {what} from {app.media.credit}
        </span>
        {count > 1 && (
          <span className="la-shots-dots">
            {items.map((_, i) => (
              <button
                key={i}
                className={`la-shots-dot${i === index ? " on" : ""}`}
                data-weight="light"
                aria-label={`${what} ${i + 1} of ${count}`}
                aria-current={i === index ? "true" : undefined}
                onClick={() => go(i, i >= index ? 1 : -1)}
              />
            ))}
          </span>
        )}
        {count > 1 && (
          <span className="la-mono la-shots-count" aria-hidden="true">
            {index + 1}/{count}
          </span>
        )}
      </div>
    </div>
  );
}
