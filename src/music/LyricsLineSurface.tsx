// Lyrics on the desktop (docs/MUSIC.md): the `lyricsline` window. One line, the one being sung,
// in the artwork's colour. The window is click-through and never focused (Rust:
// music/desktop_lyrics.rs), so nothing here is interactive; it is only shown while something
// plays and is hidden over fullscreen apps. Off by default.
import React, { useEffect, useRef, useState } from "react";
import { music, useNowPlaying, type LyricsResult, type MusicConfig } from "./api";
import { desktopLine, desktopLineColor } from "./model";
import { samplePalette } from "./art";
import { useLensState } from "../hooks/useLensState";
import "./music.css";

export const LyricsLineSurface: React.FC = () => {
  useLensState(); // theme tokens and the reduced-motion flag
  const { now, position } = useNowPlaying(4);
  const [cfg, setCfg] = useState<MusicConfig | null>(null);
  const [lyrics, setLyrics] = useState<LyricsResult | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const trackKey = now?.trackKey ?? "";
  const artwork = now?.artwork ?? "";

  useEffect(() => {
    document.documentElement.classList.add("lm-desk-page");
  }, []);
  useEffect(() => {
    setLyrics(null);
    if (!trackKey) return;
    let alive = true;
    // Read with every song, so a timing nudge made in Settings applies from the next one.
    music.config().then((c) => alive && setCfg(c)).catch(() => {});
    music.lyrics().then((l) => alive && setLyrics(l)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [trackKey]);
  useEffect(() => {
    let alive = true;
    samplePalette(artwork).then((p) => alive && root.current?.style.setProperty("--lm-desk-ink", desktopLineColor(p)));
    return () => {
      alive = false;
    };
  }, [artwork]);

  const line = desktopLine(lyrics, now?.status ?? "none", position, cfg?.lyricsOffsetMs ?? 0, now?.durationMs ?? 0);
  return (
    <div ref={root} className="lm-desk" aria-hidden="true">
      {line && (
        <span key={line.key} className="lm-desk-line">
          {line.text}
        </span>
      )}
    </div>
  );
};

export default LyricsLineSurface;
