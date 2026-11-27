// The Dock's music pop-out (hover the Spotify icon): artwork, title and a live level meter;
// elapsed time, a seek bar and the length; Up next, previous, play/pause, next and Search; and a
// soft "sound glow" in the artwork's colours rising from the Dock edge, breathing with the music.
//
// Matte and opaque (no backdrop blur); the glow is two CSS gradients animated with transform and
// opacity only. The speaker level is read only while this card is open, something is playing,
// the glow or the meter is on and motion isn't reduced (soundGlow.ts › levelLoopActive).
import React, { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Expand, ListMusic, Music, Pause, Play, Search, SkipBack, SkipForward } from "lucide-react";
import type { MediaNowPlaying } from "../types/generated";
import { music } from "./api";
import { samplePalette } from "./art";
import { formatTime, type RGB } from "./model";
import { reducedMotion } from "../ui/motion/tokens";
import "./dockMusicCard.css";
import {
  LEVEL_ASK_MS, cssToHex, glowFrame, glowPlan, levelLoopActive, livePositionMs, meterBars, progressLabels, seekFromKey, seekFromPointer,
  smoothLevel, type GlowPlan,
} from "./soundGlow";

export type DockEdgeName = "bottom" | "top" | "left" | "right";

interface Props {
  edge: DockEdgeName;
  /** Shown until Windows reports a track (the Spotify window's title). */
  fallbackTitle: string;
}

const REFRESH_MS = 2000;

/** Glow colours with their alpha baked in, as CSS custom properties. */
function glowVars(plan: GlowPlan | null): React.CSSProperties {
  if (!plan) return {};
  const rgba = (hex: string) => {
    const v = parseInt(hex.slice(1), 16);
    return `rgb(${(v >> 16) & 255} ${(v >> 8) & 255} ${v & 255} / ${plan.alpha})`;
  };
  return { ["--dmc-g1" as string]: rgba(plan.colors[0]), ["--dmc-g2" as string]: rgba(plan.colors[1]) };
}

export const DockMusicCard: React.FC<Props> = ({ edge, fallbackTitle }) => {
  const [media, setMedia] = useState<MediaNowPlaying | null>(null);
  const [prefs, setPrefs] = useState({ glow: true, meter: true, musicOn: false });
  const [palette, setPalette] = useState<{ color: RGB; weight: number }[]>([]);
  const [plan, setPlan] = useState<GlowPlan | null>(null);
  const [, setTick] = useState(0);
  const [drag, setDrag] = useState<number | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const reduced = useMemo(() => reducedMotion(), []);
  const cardRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const meterRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);

  const refresh = () =>
    invoke<MediaNowPlaying>("get_media_now_playing_cmd")
      .then((m) => setMedia(m && m.hasSession ? m : null))
      .catch(() => {});

  // Track info while open: once now, then every 2 s (cheap: art is cached in Rust per track).
  useEffect(() => {
    refresh();
    music
      .config()
      .then((c) => c && setPrefs({ glow: c.soundGlow !== false, meter: c.levelMeter !== false, musicOn: !!c.enabled }))
      .catch(() => {});
    const t = window.setInterval(refresh, REFRESH_MS);
    return () => window.clearInterval(t);
  }, []);

  const playing = !!media?.isPlaying;
  const duration = media?.durationMs ?? 0;

  // The progress row moves twice a second while playing (text, not animation).
  useEffect(() => {
    if (!playing || !(duration > 0)) return;
    const t = window.setInterval(() => setTick((x) => x + 1), 500);
    return () => window.clearInterval(t);
  }, [playing, duration]);

  // Artwork palette, once per track.
  const art = media?.thumbnailDataUrl ?? null;
  useEffect(() => {
    let alive = true;
    if (!art) {
      setPalette([]);
      return;
    }
    samplePalette(art).then((p) => alive && setPalette(p));
    return () => {
      alive = false;
    };
  }, [art]);

  // Glow colours and strength for this surface (theme base, text colour, accent fallback).
  useEffect(() => {
    if (!prefs.glow) return setPlan(null);
    const el = cardRef.current;
    if (!el) return;
    const cs = getComputedStyle(el);
    const root = getComputedStyle(document.documentElement);
    const base = cssToHex(cs.backgroundColor) ?? cssToHex(root.getPropertyValue("--lens-pack-base")) ?? "#09090b";
    const fg = cssToHex(cs.color) ?? "#fafafa";
    const accent = cssToHex(root.getPropertyValue("--lens-accent")) ?? fg;
    setPlan(glowPlan(palette, accent, base, [fg]));
  }, [palette, prefs.glow]);

  // Level loop: rAF reads a cached level (asked for at most ~30×/s) and writes transform/opacity
  // straight to the glow and the bars. Stops entirely when closed, paused, off or reduced.
  const active = levelLoopActive({ open: true, playing, glow: prefs.glow, meter: prefs.meter, reduced });
  useEffect(() => {
    const paint = (level: number, t: number) => {
      const g = glowRef.current;
      if (g) {
        const f = glowFrame(level, { playing, reduced });
        g.style.opacity = String(f.opacity);
        g.style.transform = edge === "left" || edge === "right" ? `scaleX(${f.scale})` : `scaleY(${f.scale})`;
      }
      const m = meterRef.current;
      if (m) {
        const bars = meterBars(level, t, { playing, reduced });
        Array.from(m.children).forEach((b, i) => ((b as HTMLElement).style.transform = `scaleY(${bars[i]})`));
      }
    };
    if (!active) {
      paint(0, 0);
      return;
    }
    let raf = 0;
    let raw = 0;
    let level = 0;
    let last = performance.now();
    let asked = 0;
    let inflight = false;
    const frame = (t: number) => {
      if (!document.hidden && !inflight && t - asked >= LEVEL_ASK_MS) {
        inflight = true;
        asked = t;
        invoke<number>("music_glow_level")
          .then((v) => (raw = typeof v === "number" ? v : 0))
          .catch(() => (raw = 0))
          .finally(() => (inflight = false));
      }
      level = smoothLevel(level, raw, t - last);
      last = t;
      paint(level, t);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [active, playing, reduced, edge, prefs.glow, prefs.meter]);

  const control = (action: string, value: number | null = null) => {
    invoke("media_control_cmd", { action, value }).catch(() => {});
    if (action === "play_pause") setMedia((m) => (m ? { ...m, isPlaying: !m.isPlaying, positionMs: livePositionMs(m, Date.now()), updatedMs: Date.now() } : m));
    else if (action === "seek" && value !== null) setMedia((m) => (m ? { ...m, positionMs: value, updatedMs: Date.now() } : m));
    else window.setTimeout(refresh, 260);
  };

  const position = drag ?? (media ? livePositionMs(media, Date.now()) : 0);
  const labels = progressLabels(position, duration, formatTime);
  const canSeek = !!media?.canSeek && duration > 0;
  const pct = duration > 0 ? Math.min(100, (position / duration) * 100) : 0;
  const barVars = { ["--dmc-pct" as string]: String(pct / 100) } as React.CSSProperties;

  const pointerSeek = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return seekFromPointer(e.clientX, r.left, r.width, duration);
  };

  const title = media?.title || fallbackTitle || "Spotify";
  const artist = media?.artist || "Ready to play";
  const placement = plan?.placement ?? "below";
  // Only a bottom Dock lets the glow sit behind the controls; other edges keep it in its own strip.
  const glowWhere = edge === "bottom" ? placement : "below";

  return (
    <div
      ref={cardRef}
      className={`dmc dmc-edge-${edge} ${prefs.glow ? `has-glow dmc-glow-${glowWhere}` : ""} ${playing ? "is-playing" : ""}`}
      style={glowVars(plan)}
      data-glow-source={plan ? (plan.fromArt ? "art" : "accent") : undefined}
    >
      {prefs.glow && <div ref={glowRef} className="dmc-glow" aria-hidden="true" />}
      <div className="dmc-head">
        {art ? (
          <img src={art} alt="" className="dmc-art" />
        ) : (
          <div className="dmc-art dmc-art-fallback" aria-hidden="true">
            <Music size={22} strokeWidth={2.2} />
          </div>
        )}
        <div className="dmc-meta">
          <div className="dmc-title">{title}</div>
          <div className="dmc-artist">{artist}</div>
        </div>
        {prefs.musicOn && (
          <button
            type="button"
            data-weight="medium"
            className="dmc-btn dmc-imm"
            aria-label="Immersive"
            onClick={() => music.immersiveOpen("dock").then(() => setNote(null)).catch((e) => setNote(String(e)))}
          >
            <Expand size={14} strokeWidth={2.4} />
          </button>
        )}
        {prefs.meter && (
          <div ref={meterRef} className="dmc-meter" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
        )}
      </div>

      {note && <div className="dmc-note" role="status">{note}</div>}
      <div className="dmc-progress">
        <span className="dmc-time">{labels.elapsed}</span>
        <div
          ref={barRef}
          style={barVars}
          className={`dmc-bar ${canSeek ? "can-seek" : ""} ${drag !== null ? "is-dragging" : ""}`}
          role="slider"
          tabIndex={canSeek ? 0 : -1}
          aria-label="Seek"
          aria-disabled={!canSeek}
          aria-valuemin={0}
          aria-valuemax={Math.round(duration / 1000)}
          aria-valuenow={Math.round(position / 1000)}
          aria-valuetext={`${labels.elapsed} of ${labels.total}`}
          onPointerDown={(e) => {
            if (!canSeek || e.button !== 0) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            setDrag(pointerSeek(e));
          }}
          onPointerMove={(e) => {
            if (drag !== null) setDrag(pointerSeek(e));
          }}
          onPointerUp={(e) => {
            if (drag === null) return;
            const v = pointerSeek(e);
            setDrag(null);
            control("seek", v);
          }}
          onPointerCancel={() => setDrag(null)}
          onKeyDown={(e) => {
            if (!canSeek) return;
            const v = seekFromKey(e.key, position, duration);
            if (v === null) return;
            e.preventDefault();
            control("seek", v);
          }}
        >
          <div className="dmc-bar-track">
            <div className="dmc-bar-fill" />
          </div>
          <div className="dmc-bar-thumb" />
        </div>
        <span className="dmc-time">{labels.total}</span>
      </div>

      <div className="dmc-controls">
        {prefs.musicOn ? (
          <button type="button" data-weight="medium" className="dmc-btn dmc-side" aria-label="Up next" onClick={() => invoke("open_surface", { label: "nowplaying" }).catch(() => {})}>
            <ListMusic size={16} strokeWidth={2.4} />
          </button>
        ) : (
          <span className="dmc-side" aria-hidden="true" />
        )}
        <div className="dmc-transport">
          <button type="button" data-weight="medium" className="dmc-btn" aria-label="Previous" onClick={() => control("prev")}>
            <SkipBack size={16} fill="currentColor" strokeWidth={2} />
          </button>
          <button type="button" data-weight="heavy" className="dmc-btn dmc-play" aria-label={playing ? "Pause" : "Play"} onClick={() => control("play_pause")}>
            {playing ? <Pause size={18} fill="currentColor" strokeWidth={2} /> : <Play size={18} fill="currentColor" strokeWidth={2} />}
          </button>
          <button type="button" data-weight="medium" className="dmc-btn" aria-label="Next" onClick={() => control("next")}>
            <SkipForward size={16} fill="currentColor" strokeWidth={2} />
          </button>
        </div>
        <button type="button" data-weight="medium" className="dmc-btn dmc-side" aria-label="Search Spotify" onClick={() => invoke("music_open_search").catch(() => {})}>
          <Search size={16} strokeWidth={2.4} />
        </button>
      </div>
    </div>
  );
};

export default DockMusicCard;
