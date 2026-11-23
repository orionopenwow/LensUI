import React, { useCallback, useEffect, useRef, useState } from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import type { Runner } from "../playground/runner";
import { useLensState } from "../hooks/useLensState";
import { accentFromElement } from "../themes/accentFromImage";
import type { WallpaperState } from "./wallpaperTypes";
import { FIT_TO_OBJECT_FIT } from "./wallpaperTypes";
import "./WallpaperSurface.css";
import { PlaygroundView } from "../playground/PlaygroundView";
import { DEFAULT_IDLE_SCENE, sceneById } from "../playground/registry";
import { setSkyLocation } from "../playground/scenes/skyclock";
import { readSchedule } from "../themes/schedule";

interface WorkspaceStatusLite {
  enabled: boolean;
  active: number;
  workspaces: { index: number; id: string }[];
}

/** Active Lens workspace id, or null when Lens workspaces are off. */
function useActiveWorkspace(): string | null {
  const [status, setStatus] = useState<WorkspaceStatusLite | null>(null);
  useEffect(() => {
    invoke<WorkspaceStatusLite>("get_workspaces_status_cmd").then(setStatus).catch(() => {});
    const un = listen<WorkspaceStatusLite>("lens://workspaces-changed", (e) => setStatus(e.payload));
    return () => {
      un.then((f) => f());
    };
  }, []);
  if (!status?.enabled) return null;
  return status.workspaces.find((w) => w.index === status.active)?.id ?? null;
}

const IDLE_MODE = typeof location !== "undefined" && new URLSearchParams(location.search).get("idle") === "1";

/** Which Playground scene this window shows ("" = none, use the image/video/HTML file). */
export function effectiveScene(
  s: WallpaperState["settings"],
  workspaceId: string | null,
  idle: boolean
): string {
  const pick = (id: string | undefined | null) => (id && sceneById(id) ? id : "");
  if (idle) return pick(s.idleScene) || pick(s.scene) || DEFAULT_IDLE_SCENE;
  if (workspaceId && s.workspaceScenes) {
    const ws = pick(s.workspaceScenes[workspaceId]);
    if (ws) return ws;
  }
  return pick(s.scene);
}

/** Idle mode: a quiet clock over the scene; any input dismisses the window. */
const IdleClock: React.FC = () => {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 10_000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="wp-idle-clock">
      <div className="wp-idle-time">{now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</div>
      <div className="wp-idle-date">{now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}</div>
    </div>
  );
};

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

  const workspaceId = useActiveWorkspace();
  const sceneRunner = useRef<Runner | null>(null);
  useEffect(() => {
    // "Clear canvas" in the Playground card.
    const un = listen<string>("lens://playground-reset", () => sceneRunner.current?.reset());
    return () => {
      un.then((f) => f());
    };
  }, []);
  useEffect(() => {
    const sch = readSchedule(config);
    setSkyLocation(sch.latitude, sch.longitude);
  }, [config]);

  // Idle mode: dismiss on any input (Rust also hides the window when input resumes).
  useEffect(() => {
    if (!IDLE_MODE) return;
    let start: { x: number; y: number } | null = null;
    const dismiss = () => invoke("dismiss_playground_idle_cmd").catch(() => {});
    const onMove = (e: PointerEvent) => {
      if (!start) start = { x: e.clientX, y: e.clientY };
      else if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 4) dismiss();
    };
    const evs: [string, EventListener][] = [
      ["pointermove", onMove as EventListener],
      ["pointerdown", dismiss],
      ["keydown", dismiss],
      ["wheel", dismiss],
      ["touchstart", dismiss],
    ];
    evs.forEach(([n, h]) => window.addEventListener(n, h, { passive: true }));
    return () => evs.forEach(([n, h]) => window.removeEventListener(n, h));
  }, []);

  if (!state) return <div className="wp-root" />;

  const s = state.settings;
  const sceneId = effectiveScene(s, workspaceId, IDLE_MODE);
  if (sceneId) {
    return (
      <div className={`wp-root ${IDLE_MODE ? "wp-idle" : ""}`} aria-hidden="true">
        <PlaygroundView
          key={sceneId}
          sceneId={sceneId}
          options={s.sceneOptions?.[sceneId]}
          fps={s.fps}
          paused={!IDLE_MODE && !!paused}
          still={s.calm && !IDLE_MODE}
          ripples={s.ripples && !IDLE_MODE}
          desktopInput={!IDLE_MODE}
          persist={!IDLE_MODE}
          onRunner={(r) => (sceneRunner.current = r)}
          onStats={(st) => {
            if (!IDLE_MODE) emit("lens://playground-stats", { ...st, scene: sceneId, fpsCap: s.fps }).catch(() => {});
          }}
        />
        {IDLE_MODE && <IdleClock />}
      </div>
    );
  }
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
    <div className="wp-root" aria-hidden="true" data-guide-id="wallpaper">
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
