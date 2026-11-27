// The selection overlay: the frozen screen, a dimmed mask with the selection cut out, a loupe
// with pixel coordinates and colour, and snapping to windows and UI elements (UI Automation).
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppWindow, Camera, Clock, Crop, Lasso, Monitor as MonitorIcon, MousePointer2, ScrollText, Video, X } from "lucide-react";
import type { SessionInfo } from "./api";
import { snipElements } from "./api";
import { boundsOf, contains, cssToPhysical, normalize, physicalToCss, snapEdges, snapTarget, type Rect } from "./geom";
import { Tip } from "./Tip";

export type SelectMode = "region" | "window" | "monitor" | "all" | "freeform" | "scroll" | "record";

export interface Selection {
  kind: "region" | "window" | "monitor" | "all" | "freeform";
  rect: Rect;
  hwnd?: number;
  /** Freeform lasso in physical px. */
  points?: { x: number; y: number }[];
}

interface Props {
  session: SessionInfo;
  initialMode: SelectMode;
  delay: number;
  onDelay: (d: number) => void;
  cursor: boolean;
  onCursor: (on: boolean) => void;
  onDone: (sel: Selection, mode: SelectMode) => void;
  onCancel: () => void;
  /** Screenshots and tests: start with a selection already drawn. */
  demo?: { rect?: Rect; pointer?: { x: number; y: number } };
}

const MODES: { id: SelectMode; label: string; icon: React.ReactNode; hint: string }[] = [
  { id: "region", label: "Region", icon: <Crop size={15} />, hint: "Drag an area, or click to take what's under the pointer" },
  { id: "window", label: "Window", icon: <AppWindow size={15} />, hint: "Click a window — captured on its own, even if covered" },
  { id: "monitor", label: "Screen", icon: <MonitorIcon size={15} />, hint: "Click a screen" },
  { id: "all", label: "All screens", icon: <Camera size={15} />, hint: "Every screen in one image" },
  { id: "freeform", label: "Freeform", icon: <Lasso size={15} />, hint: "Draw around anything" },
  { id: "scroll", label: "Scrolling", icon: <ScrollText size={15} />, hint: "Experimental: click a window and Lens scrolls it for you" },
  { id: "record", label: "Record", icon: <Video size={15} />, hint: "Drag an area to record it as a video" },
];

const DELAYS = [0, 3, 5, 10];

export const Select: React.FC<Props> = ({ session, initialMode, delay, onDelay, cursor, onCursor, onDone, onCancel, demo }) => {
  const [mode, setMode] = useState<SelectMode>(initialMode);
  const [drag, setDrag] = useState<{ ax: number; ay: number; bx: number; by: number } | null>(null);
  const [fixed, setFixed] = useState<Rect | null>(demo?.rect ?? null);
  const [lasso, setLasso] = useState<{ x: number; y: number }[]>([]);
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(demo?.pointer ?? null);
  const [elements, setElements] = useState<Rect[]>([]);
  const [frameImg, setFrameImg] = useState<HTMLImageElement | null>(null);
  const loupeRef = useRef<HTMLCanvasElement | null>(null);
  const dwell = useRef<number | undefined>(undefined);
  const origin = { x: session.origin.x, y: session.origin.y };
  const dpr = window.devicePixelRatio || 1;
  const toPhys = useCallback((cx: number, cy: number) => ({ x: Math.round(origin.x + cx * dpr), y: Math.round(origin.y + cy * dpr) }), [origin.x, origin.y, dpr]);

  useEffect(() => {
    const img = new Image();
    img.onload = () => setFrameImg(img);
    img.src = session.frame;
  }, [session.frame]);

  // Windows under the pointer (top-most first), and UI elements inside the top one after a short dwell.
  const windowAt = useCallback((p: { x: number; y: number }) => session.windows.find((w) => contains(w.rect, p.x, p.y)) ?? null, [session.windows]);
  useEffect(() => {
    if (!pointer || drag || mode !== "region") return;
    window.clearTimeout(dwell.current);
    const w = windowAt(pointer);
    if (!w) {
      setElements([]);
      return;
    }
    dwell.current = window.setTimeout(() => {
      snipElements(w.hwnd, pointer.x, pointer.y).then(setElements).catch(() => setElements([]));
    }, 220);
    return () => window.clearTimeout(dwell.current);
  }, [pointer, drag, mode, windowAt]);

  const hoverTarget = useMemo<Rect | null>(() => {
    if (!pointer || drag || fixed) return null;
    if (mode === "monitor") return session.monitors.find((m) => contains(m.rect, pointer.x, pointer.y))?.rect ?? null;
    if (mode === "window" || mode === "scroll") return windowAt(pointer)?.rect ?? null;
    if (mode === "region") {
      const w = windowAt(pointer);
      const cands = [...(w ? [w.rect] : []), ...elements];
      return snapTarget(cands, pointer.x, pointer.y, 8);
    }
    return null;
  }, [pointer, drag, fixed, mode, session.monitors, windowAt, elements]);

  const snapCands = useMemo(() => [...session.windows.map((w) => w.rect), ...elements, ...session.monitors.map((m) => m.rect)], [session.windows, session.monitors, elements]);
  const selection: Rect | null = drag
    ? snapEdges(normalize(drag.ax, drag.ay, drag.bx, drag.by), snapCands, Math.round(6 * dpr))
    : fixed ?? hoverTarget;

  // Loupe: 16×16 physical pixels around the pointer, magnified 8×.
  useEffect(() => {
    const c = loupeRef.current;
    if (!c || !frameImg || !pointer) return;
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, 144, 144);
    const sx = pointer.x - origin.x - 9;
    const sy = pointer.y - origin.y - 9;
    ctx.drawImage(frameImg, sx, sy, 18, 18, 0, 0, 144, 144);
    ctx.strokeStyle = "rgba(127,127,127,0.25)";
    for (let i = 8; i < 144; i += 8) {
      ctx.beginPath();
      ctx.moveTo(i + 0.5, 0);
      ctx.lineTo(i + 0.5, 144);
      ctx.moveTo(0, i + 0.5);
      ctx.lineTo(144, i + 0.5);
      ctx.stroke();
    }
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "#000";
    ctx.strokeRect(71.5, 71.5, 9, 9);
    ctx.strokeStyle = "#fff";
    ctx.strokeRect(72.5, 72.5, 7, 7);
  }, [pointer, frameImg, origin.x, origin.y]);

  const colour = useMemo(() => {
    if (!frameImg || !pointer) return "#000000";
    const c = document.createElement("canvas");
    c.width = c.height = 1;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(frameImg, pointer.x - origin.x, pointer.y - origin.y, 1, 1, 0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
  }, [frameImg, pointer, origin.x, origin.y]);

  const finish = useCallback(
    (sel: Selection) => {
      onDone(sel, mode);
    },
    [onDone, mode]
  );

  const onDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const p = toPhys(e.clientX, e.clientY);
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setFixed(null);
    if (mode === "freeform") {
      setLasso([p]);
      return;
    }
    if (mode === "region" || mode === "record") setDrag({ ax: p.x, ay: p.y, bx: p.x, by: p.y });
  };
  const onMove = (e: React.PointerEvent) => {
    const p = toPhys(e.clientX, e.clientY);
    setPointer(p);
    if (mode === "freeform" && lasso.length) setLasso((l) => [...l, p]);
    else if (drag) setDrag((d) => (d ? { ...d, bx: p.x, by: p.y } : d));
  };
  const onUp = (e: React.PointerEvent) => {
    const p = toPhys(e.clientX, e.clientY);
    if (mode === "freeform") {
      const b = boundsOf(lasso);
      setLasso([]);
      if (b && b.w > 4 && b.h > 4) finish({ kind: "freeform", rect: b, points: lasso });
      return;
    }
    if (drag) {
      const r = snapEdges(normalize(drag.ax, drag.ay, p.x, p.y), snapCands, Math.round(6 * dpr));
      setDrag(null);
      // A click (no real drag) takes the snapped window or element under the pointer.
      if (r.w <= 3 && r.h <= 3) {
        if (hoverTarget) finish({ kind: "region", rect: hoverTarget });
        return;
      }
      if (mode === "record") setFixed(r);
      else finish({ kind: "region", rect: r });
      return;
    }
    if (mode === "window" || mode === "scroll") {
      const w = windowAt(p);
      if (w) finish({ kind: "window", rect: w.rect, hwnd: w.hwnd });
    } else if (mode === "monitor") {
      const m = session.monitors.find((m) => contains(m.rect, p.x, p.y));
      if (m) finish({ kind: "monitor", rect: m.rect });
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (fixed || drag) {
          setFixed(null);
          setDrag(null);
        } else onCancel();
        return;
      }
      if (e.key === "Enter" && selection) {
        e.preventDefault();
        finish({ kind: "region", rect: selection });
        return;
      }
      if (e.key === "Tab") {
        e.preventDefault();
        const i = MODES.findIndex((m) => m.id === mode);
        const next = MODES[(i + (e.shiftKey ? MODES.length - 1 : 1)) % MODES.length].id;
        pick(next);
        return;
      }
      if (fixed && e.key.startsWith("Arrow")) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key] ?? [0, 0];
        setFixed((f) => (f ? (e.altKey ? { ...f, w: Math.max(4, f.w + d[0]), h: Math.max(4, f.h + d[1]) } : { ...f, x: f.x + d[0], y: f.y + d[1] }) : f));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const pick = (m: SelectMode) => {
    setMode(m);
    setFixed(null);
    setDrag(null);
    if (m === "all") finish({ kind: "all", rect: session.origin });
  };

  const css = selection ? physicalToCss(selection, origin, dpr) : null;
  const vw = session.origin.w / dpr;
  const vh = session.origin.h / dpr;
  const lassoCss = lasso.map((p) => `${(p.x - origin.x) / dpr},${(p.y - origin.y) / dpr}`).join(" ");
  const pCss = pointer ? physicalToCss({ x: pointer.x, y: pointer.y, w: 0, h: 0 }, origin, dpr) : null;
  const loupeLeft = pCss ? (pCss.x + 168 > vw ? pCss.x - 168 : pCss.x + 24) : 0;
  const loupeTop = pCss ? (pCss.y + 192 > vh ? pCss.y - 192 : pCss.y + 24) : 0;
  const label = selection ? `${selection.w} × ${selection.h}` : "";
  const scale = selection ? session.monitors.find((m) => contains(m.rect, selection.x + 1, selection.y + 1))?.scale ?? 1 : 1;

  return (
    <div className="snip-root" aria-label="Lens Snip — choose what to capture">
      <img className="snip-frame" src={session.frame} alt="" draggable={false} />
      <svg className="snip-dim" width="100%" height="100%" viewBox={`0 0 ${vw} ${vh}`} preserveAspectRatio="none" aria-hidden>
        <defs>
          <mask id="snip-cut">
            <rect x="0" y="0" width={vw} height={vh} fill="#fff" />
            {css ? <rect x={css.x} y={css.y} width={css.w} height={css.h} fill="#000" /> : null}
            {lassoCss ? <polygon points={lassoCss} fill="#000" /> : null}
          </mask>
        </defs>
        <rect x="0" y="0" width={vw} height={vh} fill="rgba(0,0,0,0.45)" mask="url(#snip-cut)" />
        {lassoCss ? <polyline points={lassoCss} fill="none" stroke="var(--lens-accent-ui)" strokeWidth={1.5} /> : null}
      </svg>
      <div
        className={`snip-select mode-${mode}`}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={() => setPointer(null)}
        role="application"
        aria-roledescription="screen selection"
      />
      {css ? (
        <div className={`snip-sel-box ${!drag && !fixed ? "snapped" : ""}`} style={{ left: css.x, top: css.y, width: css.w, height: css.h }}>
          {fixed
            ? [[-4, -4], [css.w - 4, -4], [-4, css.h - 4], [css.w - 4, css.h - 4]].map(([l, t], i) => <span key={i} className="snip-handle" style={{ left: l, top: t }} />)
            : null}
        </div>
      ) : null}
      {css ? (
        <div className="snip-size" style={{ left: css.x, top: css.y > 28 ? css.y - 28 : css.y + css.h + 8 }}>
          {label}
          {scale !== 1 ? ` · ${Math.round(scale * 100)}%` : ""}
        </div>
      ) : null}
      {pCss && mode !== "all" ? (
        <div className="snip-loupe" style={{ left: loupeLeft, top: loupeTop }}>
          <canvas ref={loupeRef} width={144} height={144} />
          <div className="snip-loupe-meta">
            <span className="snip-swatch" style={{ background: colour }} />
            <span>{colour}</span>
            <span style={{ marginLeft: "auto" }}>
              {pointer!.x},{pointer!.y}
            </span>
          </div>
        </div>
      ) : null}

      <div className="snip-modebar" role="toolbar" aria-label="Capture mode" onPointerDown={(e) => e.stopPropagation()}>
        {MODES.map((m) => (
          <Tip key={m.id} text={m.hint} below>
            <button type="button" data-weight="medium" className={`snip-btn ${mode === m.id ? "on" : ""}`} aria-pressed={mode === m.id} onClick={() => pick(m.id)}>
              {m.icon}
              {m.label}
            </button>
          </Tip>
        ))}
        <span className="sep" />
        <Tip text={delay ? `Captures ${delay} s after you start` : "Capture right away"} below>
          <button type="button" data-weight="medium" className="snip-btn" onClick={() => onDelay(DELAYS[(DELAYS.indexOf(delay) + 1) % DELAYS.length])} aria-label={`Delay ${delay} seconds`}>
            <Clock size={15} />
            {delay ? `${delay}s` : "Now"}
          </button>
        </Tip>
        <Tip text={cursor ? "The pointer is included" : "The pointer is left out"} below>
          <button type="button" data-weight="medium" className={`snip-btn icon ${cursor ? "on" : ""}`} aria-pressed={cursor} aria-label="Include pointer" onClick={() => onCursor(!cursor)}>
            <MousePointer2 size={15} />
          </button>
        </Tip>
        {mode === "record" && fixed ? (
          <button type="button" data-weight="heavy" className="snip-btn primary" onClick={() => finish({ kind: "region", rect: fixed })}>
            <Video size={15} /> Start recording
          </button>
        ) : null}
        <span className="sep" />
        <Tip text="Cancel (Esc)" below>
          <button type="button" data-weight="medium" className="snip-btn icon" aria-label="Cancel" onClick={onCancel}>
            <X size={15} />
          </button>
        </Tip>
      </div>
      <div className="snip-hint">
        {mode === "record" ? (
          <>Drag the area to record · <kbd>Esc</kbd> cancel</>
        ) : mode === "freeform" ? (
          <>Draw around what you want · <kbd>Esc</kbd> cancel</>
        ) : (
          <>Drag or click · <kbd>Enter</kbd> take · arrows nudge · <kbd>Tab</kbd> mode · <kbd>Esc</kbd> cancel</>
        )}
      </div>
    </div>
  );
};

/** For the studio: physical selection → overlay CSS rect (used to place the studio). */
export function selectionCss(r: Rect, session: { origin: Rect }) {
  return physicalToCss(r, { x: session.origin.x, y: session.origin.y }, window.devicePixelRatio || 1);
}
export { cssToPhysical };
