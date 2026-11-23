/**
 * The Lab's live canvas: the real engine at the window's size, on-canvas handles, A/B compare
 * with a draggable divider, and an optional "in context" mock of the Top Bar, a window and the
 * Dock with a readability check.
 */
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { BackdropRenderer, LoopClock, modeById, relLuminance, rgbToHex, type BackdropState, type Handle } from "../engine";

export type HandlesMode = "hover" | "always" | "off";

export interface Readability {
  /** Contrast of light text over the top bar / dock areas. */
  top: number;
  bottom: number;
}

interface Props {
  state: BackdropState;
  compare?: BackdropState | null;
  divider?: number;
  onDivider?: (x: number) => void;
  paused?: boolean;
  handles?: HandlesMode;
  onHandles?: (h: Handle[], softness?: number) => void;
  onHandlesEnd?: () => void;
  context?: boolean;
  onReadability?: (r: Readability) => void;
  image?: TexImageSource | null;
  className?: string;
  /** Max device pixel ratio for the preview (keeps the Lab light). */
  dprCap?: number;
  label?: string;
  onFailed?: () => void;
}

const HINT_KEY = "lens.backdrop.handleHint";

export const LiveCanvas: React.FC<Props> = ({
  state,
  compare,
  divider = 0.5,
  onDivider,
  paused,
  handles = "hover",
  onHandles,
  onHandlesEnd,
  context,
  onReadability,
  image,
  className,
  dprCap = 1.25,
  label = "Backdrop preview",
  onFailed,
}) => {
  const host = useRef<HTMLDivElement>(null);
  const cA = useRef<HTMLCanvasElement>(null);
  const cB = useRef<HTMLCanvasElement>(null);
  const rA = useRef<BackdropRenderer | null>(null);
  const rB = useRef<BackdropRenderer | null>(null);
  const clock = useRef(new LoopClock(state.loop));
  const stateRef = useRef(state);
  const readRef = useRef(onReadability);
  readRef.current = onReadability;
  const [size, setSize] = useState({ w: 1, h: 1 });
  const [failed, setFailed] = useState(false);
  const [hover, setHover] = useState(false);
  const [hint, setHint] = useState(() => {
    try {
      return !localStorage.getItem(HINT_KEY);
    } catch {
      return false;
    }
  });
  const prevMode = useRef(state.mode);

  // Renderers live as long as the canvas.
  useEffect(() => {
    try {
      rA.current = new BackdropRenderer(cA.current!, { preserve: true });
      rA.current.replace(stateRef.current);
    } catch {
      setFailed(true);
      onFailed?.();
    }
    return () => {
      rA.current?.dispose();
      rA.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!compare || !cB.current) {
      rB.current?.dispose();
      rB.current = null;
      return;
    }
    try {
      if (!rB.current) rB.current = new BackdropRenderer(cB.current, { preserve: true });
      rB.current.replace(compare);
    } catch {
      rB.current = null;
    }
  }, [compare]);

  // State changes: tweaks apply at once; a new look crossfades once its shader is ready.
  useEffect(() => {
    stateRef.current = state;
    clock.current.loop = state.loop;
    const r = rA.current;
    if (!r) return;
    try {
      if (prevMode.current !== state.mode || (state.layer?.look.mode ?? "") !== (r.current?.layer?.look.mode ?? "")) r.setState(state, { fadeMs: 320 });
      else r.replace(state);
    } catch {
      /* a broken shader keeps the previous look on screen */
    }
    prevMode.current = state.mode;
  }, [state]);

  useEffect(() => {
    rA.current?.setImage(image ?? null);
    rB.current?.setImage(image ?? null);
  }, [image]);

  useLayoutEffect(() => {
    const el = host.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: Math.max(1, el.clientWidth), h: Math.max(1, el.clientHeight) }));
    ro.observe(el);
    setSize({ w: Math.max(1, el.clientWidth), h: Math.max(1, el.clientHeight) });
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const dpr = Math.min(dprCap, window.devicePixelRatio || 1);
    for (const c of [cA.current, cB.current]) {
      if (!c) continue;
      c.width = Math.round(size.w * dpr);
      c.height = Math.round(size.h * dpr);
    }
  }, [size, dprCap, compare]);

  useEffect(() => {
    clock.current.setPaused(!!paused);
  }, [paused]);

  // Frame loop (60 fps cap, idle when the window is hidden).
  useEffect(() => {
    let raf = 0;
    let last = 0;
    let lastRead = 0;
    const probe = document.createElement("canvas");
    probe.width = 32;
    probe.height = 18;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (document.hidden || now - last < 15) return;
      last = now;
      const t = clock.current.tick();
      rA.current?.render(t);
      rB.current?.render(t);
      if (readRef.current && now - lastRead > 900 && cA.current) {
        lastRead = now;
        const g = probe.getContext("2d", { willReadFrequently: true });
        if (g) {
          g.drawImage(cA.current, 0, 0, 32, 18);
          const px = g.getImageData(0, 0, 32, 18).data;
          const band = (y0: number, y1: number) => {
            let r = 0, gg = 0, b = 0, n = 0;
            for (let y = y0; y < y1; y++)
              for (let x = 0; x < 32; x++) {
                const i = (y * 32 + x) * 4;
                r += px[i];
                gg += px[i + 1];
                b += px[i + 2];
                n++;
              }
            const hex = rgbToHex([r / n / 255, gg / n / 255, b / n / 255]);
            return (Math.max(relLuminance(hex), 0.9) + 0.05) / (Math.min(relLuminance(hex), 0.9) + 0.05);
          };
          readRef.current({ top: band(0, 2), bottom: band(15, 18) });
        }
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // ── handles ──
  const mode = modeById(state.mode);
  const defs = mode?.handles ?? [];
  const showHandles = !!onHandles && defs.length > 0 && (handles === "always" || (handles === "hover" && hover));
  const drag = useRef<{ kind: "h" | "ring"; i: number } | null>(null);
  const toLocal = (e: React.PointerEvent) => {
    const r = host.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };
  const snapTo = (v: number, on: boolean) => (on ? Math.round(v / 0.05) * 0.05 : v);
  const ringR = (s: BackdropState) => (0.05 + s.softness * 0.3) * size.h;
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || !onHandles) return;
    const p = toLocal(e);
    if (d.kind === "h") {
      const next = state.handles.map((h, i) => (i === d.i ? { x: snapTo(p.x, e.shiftKey), y: snapTo(p.y, e.shiftKey) } : h));
      onHandles(next);
    } else {
      const h0 = state.handles[0];
      const dist = Math.hypot((p.x - h0.x) * size.w, (p.y - h0.y) * size.h) / size.h;
      onHandles(state.handles, Math.max(0, Math.min(1, (dist - 0.05) / 0.3)));
    }
  };
  const endDrag = () => {
    if (drag.current) onHandlesEnd?.();
    drag.current = null;
  };
  const startDrag = (kind: "h" | "ring", i: number) => (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    drag.current = { kind, i };
    if (hint) {
      setHint(false);
      try {
        localStorage.setItem(HINT_KEY, "1");
      } catch {
        /* ignore */
      }
    }
  };
  const nudge = (i: number) => (e: React.KeyboardEvent) => {
    if (!onHandles) return;
    const step = e.shiftKey ? 0.05 : 0.01;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const d = moves[e.key];
    if (!d) return;
    e.preventDefault();
    onHandles(state.handles.map((h, k) => (k === i ? { x: h.x + d[0], y: h.y + d[1] } : h)));
    onHandlesEnd?.();
  };

  const h0 = state.handles[0];
  const h1 = state.handles[1];

  return (
    <div
      ref={host}
      className={`bd-canvas ${className ?? ""}`}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      onPointerMove={onMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      role="img"
      aria-label={`${label}: ${mode?.name ?? ""}`}
    >
      <canvas ref={cA} className="bd-canvas-gl" />
      {compare && <canvas ref={cB} className="bd-canvas-gl" style={{ clipPath: `inset(0 0 0 ${divider * 100}%)` }} />}
      {context && (
        <div className="bd-context" aria-hidden="true">
          <div className="bd-ctx-bar">
            <span className="bd-ctx-logo" />
            <span>Lens</span>
            <span className="bd-ctx-sp" />
            <span>Mon 9:41</span>
          </div>
          <div className="bd-ctx-window">
            <div className="bd-ctx-dots">
              <i />
              <i />
              <i />
            </div>
            <div className="bd-ctx-lines">
              <b />
              <b />
              <b className="short" />
            </div>
          </div>
          <div className="bd-ctx-dock">
            {Array.from({ length: 7 }, (_, i) => (
              <i key={i} />
            ))}
          </div>
        </div>
      )}
      {compare && (
        <>
          <div
            className="bd-divider"
            style={{ left: `${divider * 100}%` }}
            role="slider"
            tabIndex={0}
            aria-label="Compare divider"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(divider * 100)}
            onPointerDown={(e) => {
              (e.target as Element).setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (!(e.buttons & 1) || !onDivider) return;
              const r = host.current!.getBoundingClientRect();
              onDivider(Math.max(0.02, Math.min(0.98, (e.clientX - r.left) / r.width)));
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft") onDivider?.(Math.max(0.02, divider - 0.05));
              if (e.key === "ArrowRight") onDivider?.(Math.min(0.98, divider + 0.05));
            }}
          >
            <span className="bd-divider-tag left">A · now</span>
            <span className="bd-divider-tag right">B · saved</span>
          </div>
        </>
      )}
      {failed && (
        <div className="bd-canvas-fallback" style={{ background: `linear-gradient(160deg, ${state.stops.map((s) => s.color).join(", ")})` }}>
          <span>Live preview needs WebGL 2. Exports and the wallpaper fall back to a still gradient.</span>
        </div>
      )}
      {showHandles && h0 && (
        <svg className="bd-handles" width={size.w} height={size.h} aria-hidden={false}>
          {mode?.ring && h1 && (
            <>
              <line x1={h0.x * size.w} y1={h0.y * size.h} x2={h1.x * size.w} y2={h1.y * size.h} className="bd-h-line" />
              <circle cx={h0.x * size.w} cy={h0.y * size.h} r={ringR(state)} className="bd-h-ring" onPointerDown={startDrag("ring", 0)} />
              <text x={h0.x * size.w + ringR(state) + 8} y={h0.y * size.h} className="bd-h-label">
                Softness {state.softness.toFixed(2)}
              </text>
            </>
          )}
          {defs.map((d, i) => {
            const h = state.handles[i];
            if (!h) return null;
            return (
              <g key={d.id}>
                <circle
                  cx={h.x * size.w}
                  cy={h.y * size.h}
                  r={9}
                  className="bd-h-dot"
                  tabIndex={0}
                  role="button"
                  aria-label={`${d.label}: drag, or use the arrow keys`}
                  onPointerDown={startDrag("h", i)}
                  onKeyDown={nudge(i)}
                />
                {hint && i === 0 && (
                  <text x={h.x * size.w + 16} y={h.y * size.h - 12} className="bd-h-hint">
                    ← drag {d.label.toLowerCase()} · Shift snaps
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
};
