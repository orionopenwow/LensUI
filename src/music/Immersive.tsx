// Immersive: Now Playing full screen. Big artwork that grows from what opened it, an ambient field
// of soft gradients in the artwork's colours drifting slowly (transform and opacity only; still
// when motion is reduced), big synced lyrics with the current line bright, and controls that show
// on hover and hide with the cursor after a few idle seconds. Esc or × leaves, and the artwork
// returns to where it came from. Matte: no blur layers, no glass. View model: immersive.ts.
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Languages, Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { FlyoutClose } from "../ui/FlyoutClose";
import { captureFlip, glide, reducedMotion } from "../ui/motion";
import { music, type LyricsResult, type MusicConfig } from "./api";
import { formatTime, type NowPlaying as NP, type RGB } from "./model";
import { ambientField, controlsHidden, immersiveModel, originPose, type AmbientLayer, type LyricsView } from "./immersiveModel";
import { LEVEL_ASK_MS, glowFrame, glowPlan, smoothLevel } from "./soundGlow";
import "./immersive.css";

export type ImmersiveFrom = "nowplaying" | "dock" | "command";
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Props {
  now: NP;
  position: number;
  art: string;
  palette: { color: RGB; weight: number }[];
  lyrics: LyricsResult | null;
  cfg: MusicConfig | null;
  /** Global Timing + this song's nudge (ms). */
  offsetMs: number;
  /** This song's own nudge (ms), for the readout. */
  songOffsetMs: number;
  onNudge: (steps: number) => void;
  translated: string[] | null;
  view: LyricsView;
  onView: (v: LyricsView) => void;
  /** The tinted accent and its text colour (tint.ts). */
  accent: string;
  onAccent: string;
  light: boolean;
  from: ImmersiveFrom;
  /** Where the artwork was before (Now Playing's art), so it can grow from there. */
  trigger: Rect | null;
  onClose: () => void;
  /** Parity and tests: no clock, no entrance. */
  frozen?: boolean;
}

const VIEWS: { id: LyricsView; label: string }[] = [
  { id: "original", label: "Original" },
  { id: "translated", label: "Translated" },
  { id: "both", label: "Both" },
];

function layerStyle(l: AmbientLayer): React.CSSProperties {
  return {
    background: l.background,
    ["--x" as string]: `${l.x}%`,
    ["--y" as string]: `${l.y}%`,
    ["--dx" as string]: `${l.dx}vw`,
    ["--dy" as string]: `${l.dy}vh`,
    ["--s" as string]: String(l.scale),
    ["--beats" as string]: String(l.beats),
    ["--phase" as string]: String(l.phase),
    opacity: l.opacity,
  } as React.CSSProperties;
}

const opacityStyle = (opacity: number): React.CSSProperties => ({ opacity });

export const ImmersiveView: React.FC<Props> = (p) => {
  const { now, position, cfg } = p;
  const root = useRef<HTMLDivElement>(null);
  const artRef = useRef<HTMLImageElement>(null);
  const linesRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const reduced = useMemo(() => reducedMotion(), []);
  const [hidden, setHidden] = useState(() => typeof document !== "undefined" && document.hidden);
  const [lastActivity, setLastActivity] = useState(() => Date.now());
  const [overControls, setOverControls] = useState(false);
  const [clock, setClock] = useState(() => Date.now());
  const [leaving, setLeaving] = useState(false);

  // Rendering pauses while the window is hidden or minimised.
  useEffect(() => {
    const v = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", v);
    return () => document.removeEventListener("visibilitychange", v);
  }, []);

  const model = immersiveModel(
    {
      hasSession: now.hasSession,
      title: now.title,
      artist: now.artist,
      album: now.album,
      status: now.status,
      positionMs: position,
      durationMs: now.durationMs,
      lyrics: p.lyrics,
      lyricsEnabled: !!cfg?.lyrics && cfg?.immersiveLyrics !== false,
      offsetMs: p.offsetMs,
      translated: p.translated,
      view: p.view,
      hidden,
    },
    reduced
  );
  const field = useMemo(() => ambientField(p.palette, p.light ? "#eeeef0" : "#09090b", reduced, p.light), [p.palette, reduced, p.light]);
  const still = field.still || hidden || !model.playing || !!p.frozen;

  // Idle: a coarse 500 ms clock (text and visibility only, not an animation) while visible.
  const idleMs = (cfg?.immersiveIdleS ?? 3) * 1000;
  useEffect(() => {
    if (hidden || p.frozen) return;
    const t = window.setInterval(() => setClock(Date.now()), 500);
    return () => window.clearInterval(t);
  }, [hidden, p.frozen]);
  const idle = !p.frozen && controlsHidden({ lastActivityMs: lastActivity, nowMs: clock, idleMs, overControls, empty: model.layout === "empty" });
  const wake = () => setLastActivity(Date.now());

  // Entrance: the artwork grows from what opened Immersive; the field fades in.
  useLayoutEffect(() => {
    if (p.frozen) return;
    const el = artRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const o = originPose(p.from, p.trigger, { x: r.left, y: r.top, w: r.width, h: r.height });
    glide(el, { x: o.x, y: o.y, scale: o.scale, opacity: p.from === "nowplaying" ? 1 : 0 }, { x: 0, y: 0, scale: 1, opacity: 1 }, { duration: "slower", ease: "spring" });
    glide(root.current?.querySelector(".lm-imm-field"), { opacity: 0 }, { opacity: 1 }, { duration: "slower", ease: "out" });
    glide(root.current?.querySelector(".lm-imm-text"), { y: 6, opacity: 0 }, { y: 0, opacity: 1 }, { duration: "slow", ease: "out", delay: 60 });
    // Only on open.
  }, []);

  // Leaving: the artwork returns to where it came from (quicker than it arrived), then the window
  // leaves full screen. A second Esc while leaving closes at once.
  const leave = () => {
    if (leaving || p.frozen) return p.onClose();
    setLeaving(true);
    const el = artRef.current;
    if (!el || reduced) return p.onClose();
    const r = el.getBoundingClientRect();
    const o = originPose(p.from, p.trigger, { x: r.left, y: r.top, w: r.width, h: r.height });
    glide(root.current, { opacity: 1 }, { opacity: 0 }, { duration: "exit", ease: "exit", hold: true });
    glide(el, { x: 0, y: 0, scale: 1 }, { x: o.x, y: o.y, scale: o.scale }, { duration: "exit", ease: "exit", hold: true }).finished.then(() => p.onClose());
  };

  // Keys: Esc / F11 leave, Space play/pause, ←/→ seek 5 s, N/P next/prev, [ / ] lyric timing.
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      wake();
      if ((e.target as HTMLElement)?.closest?.("input, textarea, select")) return;
      if (e.key === "Escape" || e.key === "F11") {
        e.preventDefault();
        leave();
      } else if (e.key === " ") {
        e.preventDefault();
        void music.control("play_pause");
      } else if (e.key === "ArrowRight" && now.controls.seek) void music.control("seek", position + 5000);
      else if (e.key === "ArrowLeft" && now.controls.seek) void music.control("seek", Math.max(0, position - 5000));
      else if (e.key.toLowerCase() === "n") void music.control("next");
      else if (e.key.toLowerCase() === "p") void music.control("prev");
      else if (e.key === "]") p.onNudge(1);
      else if (e.key === "[") p.onNudge(-1);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });

  // Lyrics: when the current line changes, every line glides from where it was (FLIP, move only).
  const current = model.lyric?.current ?? -1;
  const flip = useRef<ReturnType<typeof captureFlip> | null>(null);
  const lastCurrent = useRef(current);
  if (lastCurrent.current !== current && linesRef.current) {
    flip.current = captureFlip(linesRef.current.children);
  }
  useLayoutEffect(() => {
    if (lastCurrent.current === current) return;
    lastCurrent.current = current;
    flip.current?.play({ mode: "move", duration: "slow", ease: "out" });
    flip.current = null;
  }, [current]);

  // Optional sound glow along the bottom edge: reads the speaker level only while on screen, playing,
  // switched on and motion isn't reduced.
  const glowOn = !!cfg?.immersiveGlow;
  const plan = useMemo(() => (glowOn ? glowPlan(p.palette, p.accent, p.light ? "#eeeef0" : "#09090b", [p.light ? "#09090b" : "#fafafa"]) : null), [glowOn, p.palette, p.accent, p.light]);
  const glowActive = glowOn && model.animate && !p.frozen;
  useEffect(() => {
    if (!glowActive) {
      const g = glowRef.current;
      if (g) {
        const f = glowFrame(0, { playing: model.playing, reduced });
        g.style.opacity = String(f.opacity);
        g.style.transform = `scaleY(${f.scale})`;
      }
      return;
    }
    let raf = 0;
    let raw = 0;
    let level = 0;
    let last = performance.now();
    let asked = 0;
    let inflight = false;
    const frame = (t: number) => {
      if (!inflight && t - asked >= LEVEL_ASK_MS) {
        inflight = true;
        asked = t;
        invoke<number>("music_glow_level")
          .then((v) => (raw = typeof v === "number" ? v : 0))
          .catch(() => (raw = 0))
          .finally(() => (inflight = false));
      }
      level = smoothLevel(level, raw, t - last);
      last = t;
      const g = glowRef.current;
      if (g) {
        const f = glowFrame(level, { playing: true, reduced: false });
        g.style.opacity = String(f.opacity);
        g.style.transform = `scaleY(${f.scale})`;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [glowActive, model.playing, reduced]);

  const dur = now.durationMs;
  const canSeek = now.controls.seek && dur > 0;
  const pct = Math.round(model.progress * 1000) / 10;
  const vars = {
    ["--imm-accent" as string]: p.accent,
    ["--imm-on-accent" as string]: p.onAccent,
    ["--imm-base" as string]: field.base,
    ...(plan ? { ["--imm-g1" as string]: plan.colors[0], ["--imm-g2" as string]: plan.colors[1] } : {}),
  } as React.CSSProperties;
  const seekStyle = { ["--imm-pct" as string]: `${pct}%` } as React.CSSProperties;
  const hasTranslation = !!p.translated?.some((l) => l);

  return (
    <div
      ref={root}
      className={`lm-imm ${p.light ? "is-light" : "is-dark"} lm-imm-${model.layout} ${idle ? "is-idle" : ""} ${still ? "is-still" : ""}`}
      style={vars}
      role="dialog"
      aria-label="Immersive now playing"
      onPointerMove={wake}
      onPointerDown={wake}
    >
      <div className="lm-imm-field" aria-hidden="true">
        {field.layers.map((l, i) => (
          <span
            key={i}
            className="lm-imm-layer"
            style={layerStyle(l)}
          />
        ))}
        <span className="lm-imm-scrim" />
      </div>
      {glowOn && <div ref={glowRef} className="lm-imm-glow" aria-hidden="true" />}

      <div className="lm-imm-stage">
        <div className="lm-imm-left">
          <img ref={artRef} className="lm-imm-art" src={p.art} alt={now.hasSession ? `Artwork for ${now.title}` : ""} />
          <div className="lm-imm-text">
            <h1 className="lm-imm-title">{model.title}</h1>
            {model.subtitle && <div className="lm-imm-sub">{model.subtitle}</div>}
          </div>
        </div>
        {model.lyric && (
          <section className="lm-imm-lyrics" aria-label="Lyrics" aria-live="off">
            <div className="lm-imm-lines" ref={linesRef}>
              {model.lyric.lines.map((l) => (
                <div key={l.index} className="lm-imm-line" data-role={l.role} style={opacityStyle(l.opacity)}>
                  <span className="lm-imm-line-text">{l.text}</span>
                  {l.sub && <span className="lm-imm-line-sub">{l.sub}</span>}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      <FlyoutClose onClose={leave} pinned className="lm-imm-close" label="Leave Immersive" />

      <div
        className="lm-imm-controls"
        role="region"
        aria-label="Player"
        onPointerEnter={() => setOverControls(true)}
        onPointerLeave={() => setOverControls(false)}
        onFocus={() => setOverControls(true)}
        onBlur={() => setOverControls(false)}
      >
        <div className="lm-imm-seek">
          <span className="lm-imm-time" data-live>{formatTime(position)}</span>
          <input
            type="range"
            min={0}
            max={Math.max(1, dur)}
            value={Math.min(position, dur)}
            disabled={!canSeek}
            aria-label="Seek"
            style={seekStyle}
            onChange={(e) => void music.control("seek", Number(e.target.value))}
          />
          <span className="lm-imm-time" data-live>-{formatTime(Math.max(0, dur - position))}</span>
        </div>
        <div className="lm-imm-row">
          <div className="lm-imm-side">
            {model.lyric && (
              <span className="lm-imm-nudge" role="group" aria-label="Lyric timing for this song">
                <button type="button" data-weight="medium" className="lm-imm-chip" aria-label="Lyrics later by half a second" onClick={() => p.onNudge(-1)}>−0.5 s</button>
                <span className="lm-imm-nudge-val" aria-live="polite">{p.songOffsetMs === 0 ? "In time" : `${p.songOffsetMs > 0 ? "+" : "−"}${(Math.abs(p.songOffsetMs) / 1000).toFixed(1)} s`}</span>
                <button type="button" data-weight="medium" className="lm-imm-chip" aria-label="Lyrics earlier by half a second" onClick={() => p.onNudge(1)}>+0.5 s</button>
              </span>
            )}
          </div>
          <div className="lm-imm-transport">
            <button type="button" data-weight="medium" className="lm-imm-btn" aria-label="Previous" disabled={!now.controls.prev} onClick={() => void music.control("prev")}><SkipBack size={22} fill="currentColor" /></button>
            <button type="button" data-weight="heavy" className="lm-imm-btn lm-imm-play" aria-label={model.playing ? "Pause" : "Play"} disabled={!(model.playing ? now.controls.pause : now.controls.play)} onClick={() => void music.control("play_pause")}>
              {model.playing ? <Pause size={26} fill="currentColor" /> : <Play size={26} fill="currentColor" />}
            </button>
            <button type="button" data-weight="medium" className="lm-imm-btn" aria-label="Next" disabled={!now.controls.next} onClick={() => void music.control("next")}><SkipForward size={22} fill="currentColor" /></button>
          </div>
          <div className="lm-imm-side lm-imm-side-end">
            {model.lyric && hasTranslation && (
              <span className="lm-imm-views" role="radiogroup" aria-label="Lyrics shown">
                <Languages size={15} aria-hidden="true" />
                {VIEWS.map((v) => (
                  <button key={v.id} type="button" role="radio" aria-checked={p.view === v.id} data-weight="medium" className={`lm-imm-chip ${p.view === v.id ? "is-on" : ""}`} onClick={() => p.onView(v.id)}>{v.label}</button>
                ))}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ImmersiveView;
