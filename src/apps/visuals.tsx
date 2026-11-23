// App icon and thumbnail. Thumbnails show the project's official screenshots (crossfading on
// hover) or its demo loop (playing muted on hover). While loading there's a subtle shimmer; if a
// project has no screenshots, or one fails, the app's own icon sits on a backdrop tinted from it.
// Installed apps use the icon from their own program file.
import { ChartLine, CirclePlay, Code, FileText, NotebookPen, Palette, PenTool, Presentation, Sheet, Sparkles, Wrench, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { installedIcon, isVideo, useMedia } from "./media";
import { hueFor } from "./placeholder";
import type { CatalogApp } from "./types";

const CATEGORY_GLYPH: Record<string, LucideIcon> = {
  create: Palette,
  docs: FileText,
  slides: Presentation,
  sheets: Sheet,
  design: PenTool,
  notes: NotebookPen,
  dev: Code,
  markets: ChartLine,
  media: CirclePlay,
  utilities: Wrench,
  ai: Sparkles,
};

function reducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/** The app's icon: installed program icon → catalogue icon → category glyph (never letters). */
export function AppIcon({ app, size = 32, installed = false, live = true }: { app: CatalogApp; size?: number; installed?: boolean; live?: boolean }) {
  const [local, setLocal] = useState<string | null>(null);
  useEffect(() => {
    let on = true;
    if (installed) installedIcon(app.id).then((v) => on && setLocal(v));
    return () => {
      on = false;
    };
  }, [app.id, installed]);
  const remote = useMedia(app.id, app.media.icon, live && !local);
  const src = local ?? (remote.status === "ready" ? remote.src : null);
  const Glyph = CATEGORY_GLYPH[app.category] ?? Sparkles;
  const hue = hueFor(app.id);
  return (
    <span className={`la-icon${src ? (app.media.iconPlate && !local ? " la-icon-plate" : "") : " la-icon-glyph"}${remote.status === "loading" && !local ? " la-shimmer" : ""}`} style={{ width: size, height: size, ["--la-hue" as any]: hue }} aria-hidden="true">
      {src ? <img src={src} alt="" draggable={false} /> : remote.status !== "loading" && <Glyph size={Math.round(size * 0.55)} strokeWidth={1.75} />}
    </span>
  );
}

/** Thumbnail: screenshots / loop, or the icon on a tinted backdrop. */
export function AppThumb({ app, live = true, hover = false, large = false, installed = false }: { app: CatalogApp; live?: boolean; hover?: boolean; large?: boolean; installed?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState<Record<number, boolean>>({});
  const shots = app.media.screenshots;
  const loop = app.media.loop;
  const reduced = reducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return setVisible(true);
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && setVisible(true), { rootMargin: "240px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Crossfade through screenshots while hovered (or always on the large detail view).
  useEffect(() => {
    if (reduced || shots.length < 2 || !(hover || large)) {
      if (!hover && !large) setIndex(0);
      return;
    }
    const t = window.setInterval(() => setIndex((i) => (i + 1) % shots.length), large ? 3200 : 1300);
    return () => window.clearInterval(t);
  }, [hover, large, reduced, shots.length]);

  const first = useMedia(app.id, shots[0], live && visible);
  const current = useMedia(app.id, shots[index], live && visible && index > 0);
  const loopMedia = useMedia(app.id, loop, live && visible && hover && !reduced);
  const shotSrc = index > 0 && current.status === "ready" ? current.src : first.status === "ready" ? first.src : null;
  const showShot = !!shotSrc && !failed[index > 0 && current.status === "ready" ? index : 0];
  const loading = live && visible && shots.length > 0 && first.status === "loading";

  return (
    <div ref={ref} className={`la-thumb${large ? " la-thumb-large" : ""}`} style={{ ["--la-hue" as any]: hueFor(app.id) }} aria-hidden="true">
      <div className={`la-thumb-backdrop${loading ? " la-shimmer" : ""}`}>
        {!showShot && !loading && <AppIcon app={app} size={large ? 88 : 56} installed={installed} live={live} />}
      </div>
      {showShot && (
        <img
          key={shotSrc}
          className="la-thumb-media in"
          src={shotSrc!}
          alt=""
          draggable={false}
          onError={() => setFailed((f) => ({ ...f, [index]: true }))}
        />
      )}
      {loop && loopMedia.status === "ready" && hover && (
        isVideo(loop) ? (
          <video className="la-thumb-media in" src={loopMedia.src!} muted loop playsInline autoPlay />
        ) : (
          <img className="la-thumb-media in" src={loopMedia.src!} alt="" />
        )
      )}
      {shots.length > 1 && (hover || large) && (
        <div className="la-thumb-dots">
          {shots.map((_, i) => (
            <span key={i} className={i === index ? "on" : ""} />
          ))}
        </div>
      )}
    </div>
  );
}
