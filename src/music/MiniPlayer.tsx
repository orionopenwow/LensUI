// Mini player for the Dock or the Top Bar (mount snippet in docs/MUSIC.md): artwork chip,
// scrolling title, play/pause/next, a hover scrubber and the source app. Click opens Now Playing.
import React from "react";
import { Pause, Play, SkipForward } from "lucide-react";
import { music, useNowPlaying } from "./api";
import { formatTime, miniState, type NowPlaying as NP } from "./model";
import { placeholderArt } from "./art";
import "./music.css";

interface Props {
  /** "dock" draws a compact pill; "topbar" a slimmer single line. */
  variant?: "dock" | "topbar";
  onOpen?: () => void;
  fixed?: { now: NP; position: number };
}

export const MiniPlayer: React.FC<Props> = ({ variant = "dock", onOpen, fixed }) => {
  const live = useNowPlaying(2);
  const now = fixed?.now ?? live.now;
  const position = fixed?.position ?? live.position;
  // `position` is already live; freeze it so miniState doesn't extrapolate twice.
  const s = miniState(now ? { ...now, positionMs: position, updatedMs: 0 } : null, Date.now());
  if (!now || !s.visible) return null;
  const art = now.artwork || placeholderArt(now.trackKey || now.title, 96);
  return (
    <div className={`lm-mini lm-mini-${variant}`} role="group" aria-label={`Now playing: ${s.label}`}>
      <button type="button" data-weight="medium" className="lm-mini-open" onClick={onOpen} aria-label="Open Now Playing">
        <img className="lm-mini-art" src={art} alt="" />
        <span className={`lm-mini-label ${s.marquee ? "lm-marquee" : ""}`}>
          <span>{s.label}</span>
          {s.marquee && <span aria-hidden>{s.label}</span>}
        </span>
      </button>
      {variant === "dock" && <span className="lm-mini-source lm-mono">{s.source}</span>}
      <button type="button" data-weight="medium" className="lm-icon-btn" aria-label={s.icon === "pause" ? "Pause" : "Play"} disabled={!s.canToggle} onClick={() => music.control("play_pause")}>
        {s.icon === "pause" ? <Pause size={14} /> : <Play size={14} />}
      </button>
      <button type="button" data-weight="medium" className="lm-icon-btn" aria-label="Next" disabled={!now.controls.next} onClick={() => music.control("next")}>
        <SkipForward size={14} />
      </button>
      <div className="lm-mini-scrub" aria-hidden={!now.controls.seek}>
        <input type="range" min={0} max={Math.max(1, now.durationMs)} value={Math.min(position, now.durationMs)} disabled={!now.controls.seek}
          aria-label={`Seek, ${formatTime(position)} of ${formatTime(now.durationMs)}`} style={{ ["--lm-pct" as string]: `${s.progress * 100}%` }}
          onChange={(e) => music.control("seek", Number(e.target.value))} />
      </div>
    </div>
  );
};

export default MiniPlayer;
