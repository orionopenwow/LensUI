import React, { useCallback, useEffect, useRef, useState } from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useLensState } from "../hooks/useLensState";
import { accentFromElement } from "../themes/accentFromImage";
import type { WallpaperState } from "./wallpaperTypes";
import { FIT_TO_OBJECT_FIT } from "./wallpaperTypes";
import "./WallpaperSurface.css";

/**
 * The Lens wallpaper. Rust re-parents this window behind the desktop icons (win_wallpaper.rs);
 * this page only draws the chosen image / video / HTML file with blur, dim and saturation,
 * pauses on request, and reports the wallpaper's dominant colour for "Use wallpaper accent".
 */
export const WallpaperSurface: React.FC = () => {
  const { config, updateConfig } = useLensState();
  const [state, setState] = useState<WallpaperState | null>(null);
  const [paused, setPaused] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const configRef = useRef(config);
  configRef.current = config;
  const lastAccentRef = useRef<string>("");

  const refresh = useCallback(() => {
    invoke<WallpaperState>("get_wallpaper_state_cmd")
      .then((s) => {
        setState((prev) => {
          if (prev?.path !== s.path) setLoaded(false);
          return s;
        });
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    const un1 = listen("lens://wallpaper-changed", () => refresh());
    const un2 = listen<string | null>("lens://wallpaper-pause", (e) => setPaused(e.payload ?? null));
    return () => {
      un1.then((f) => f());
      un2.then((f) => f());
    };
  }, [refresh]);

  // Pause / resume video without reloading it.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (paused) v.pause();
    else v.play().catch(() => {});
  }, [paused, state?.path]);

  const reportAccent = useCallback(
    (el: HTMLImageElement | HTMLVideoElement) => {
      const res = accentFromElement(el);
      if (!res) return;
      if (res.accent !== lastAccentRef.current) {
        lastAccentRef.current = res.accent;
        invoke("set_wallpaper_accent_cmd", { hex: res.accent }).catch(() => {});
      }
      // "Follow wallpaper accent": only this surface applies it, and only when it changed.
      const cfg = configRef.current;
      if (
        state?.settings.followAccent &&
        cfg &&
        (cfg.theme.accentMode !== "custom" || cfg.theme.customAccent.toUpperCase() !== res.accent)
      ) {
        updateConfig({ ...cfg, theme: { ...cfg.theme, accentMode: "custom", customAccent: res.accent } });
      }
    },
    [state?.settings.followAccent, updateConfig]
  );

  if (!state) return <div className="wp-root" />;

  const s = state.settings;
  const src = state.path ? convertFileSrc(state.path) : null;
  const blur = Math.max(0, Math.min(40, s.blur));
  const filter = `blur(${blur}px) saturate(${Math.max(0, Math.min(200, s.saturation))}%)`;
  const mediaStyle: React.CSSProperties = {
    objectFit: (FIT_TO_OBJECT_FIT[s.fit] ?? "cover") as React.CSSProperties["objectFit"],
    filter,
    ["--wp-overscan" as string]: blur > 0 ? String(1 + (blur * 2.2) / 1000) : "1",
  };
  const cls = `wp-media ${loaded ? "" : "is-loading"}`;

  return (
    <div className="wp-root" aria-hidden="true">
      {!src || !state.kind ? (
        <div className="wp-fallback" />
      ) : state.kind === "image" ? (
        <img
          key={src}
          className={cls}
          style={mediaStyle}
          src={src}
          crossOrigin="anonymous"
          alt=""
          draggable={false}
          onLoad={(e) => {
            setLoaded(true);
            reportAccent(e.currentTarget);
          }}
          onError={() => setLoaded(true)}
        />
      ) : state.kind === "video" ? (
        <video
          key={src}
          ref={videoRef}
          className={cls}
          style={mediaStyle}
          src={src}
          crossOrigin="anonymous"
          muted
          loop
          playsInline
          autoPlay={!paused}
          preload="auto"
          disablePictureInPicture
          onLoadedData={(e) => {
            setLoaded(true);
            reportAccent(e.currentTarget);
          }}
          onError={() => setLoaded(true)}
        />
      ) : (
        // HTML wallpapers run sandboxed: scripts yes, but an opaque origin with no access to
        // Lens, Tauri commands, the parent page, forms, popups or top navigation.
        <iframe
          key={src}
          className={`${cls} ${paused ? "is-paused-html" : ""}`}
          style={{ filter }}
          src={src}
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
          title="Lens HTML wallpaper"
          tabIndex={-1}
          onLoad={() => setLoaded(true)}
        />
      )}
      <div className="wp-dim" style={{ opacity: Math.max(0, Math.min(80, s.dim)) / 100 }} />
    </div>
  );
};
