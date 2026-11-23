// Live thumbnail: the project's official demo video (muted loop) or screenshots in a gentle
// crossfade, lazy-loaded when the card scrolls into view. While loading, or when a project has no
// official media, a dithered placeholder with a monogram is shown. Reduced motion: first image only.
import { useEffect, useRef, useState } from "react";
import { monogram, placeholderDataUri } from "./placeholder";
import type { CatalogApp } from "./types";

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

function isLight(): boolean {
  try {
    return document.documentElement.dataset.scheme === "light";
  } catch {
    return false;
  }
}

export function LiveThumb({ app, live = true, large = false }: { app: CatalogApp; live?: boolean; large?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [index, setIndex] = useState(0);
  const [loaded, setLoaded] = useState<Record<string, boolean>>({});
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  const images = live ? app.media.images.filter((u) => !failed[u]) : [];
  const video = live && app.media.video && !failed[app.media.video] ? app.media.video : null;
  const reduced = prefersReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setVisible(true), { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || reduced || video || images.length < 2) return;
    const t = window.setInterval(() => setIndex((i) => (i + 1) % images.length), 3200);
    return () => window.clearInterval(t);
  }, [visible, reduced, video, images.length]);

  const placeholder = placeholderDataUri(app.id, !isLight());
  const showMedia = visible && (video || images.length > 0);
  const anyLoaded = video ? loaded[video] : images.some((u) => loaded[u]);

  return (
    <div ref={ref} className={`la-thumb${large ? " la-thumb-large" : ""}`} aria-hidden="true">
      <div
        className="la-thumb-ph"
        style={{ backgroundImage: `radial-gradient(120% 90% at 20% 15%, transparent 0%, rgb(0 0 0 / ${isLight() ? 0 : 0.55}) 100%), url("${placeholder}")` }}
      >
        {!anyLoaded && <span className="la-thumb-mono">{monogram(app.name)}</span>}
      </div>
      {showMedia && video && (
        <video
          className={`la-thumb-media${loaded[video] ? " in" : ""}`}
          src={video}
          muted
          loop
          playsInline
          autoPlay={!reduced}
          preload="metadata"
          onLoadedData={() => setLoaded((l) => ({ ...l, [video]: true }))}
          onError={() => setFailed((f) => ({ ...f, [video]: true }))}
        />
      )}
      {showMedia &&
        !video &&
        images.map((u, i) => (
          <img
            key={u}
            className={`la-thumb-media${loaded[u] && i === index % images.length ? " in" : ""}`}
            src={u}
            alt=""
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onLoad={() => setLoaded((l) => ({ ...l, [u]: true }))}
            onError={() => setFailed((f) => ({ ...f, [u]: true }))}
          />
        ))}
    </div>
  );
}
