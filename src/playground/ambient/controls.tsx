import React, { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { WallpaperState, WallpaperSettings } from "../../surfaces/wallpaperTypes";
export { ambientOptionsOf, isAmbientOn, withAmbient } from "./settings";
import type { Palette } from "../types";
import { packPalette } from "./packPalette";
export { packPalette } from "./packPalette";
import { AMBIENT_SCENES } from "./scenes";
import { bufferSize, coloursFrom, makeInk, motionTuning, withDefaults, type Motion } from "./core";
import { ambientFor } from "./packMap";
import { ambientSceneById } from "./scenes";
import { ambientOptionsOf, isAmbientOn, withAmbient } from "./settings";
import "./ambient.css";

/* ------------------------------------------------------------------------------------------ */
/* Settings: the backdrop lives in the wallpaper settings as the Playground scene "ambient".   */
/* ------------------------------------------------------------------------------------------ */

/** Wallpaper state plus setters for the backdrop. */
export function useAmbient() {
  const [state, setState] = useState<WallpaperState | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const load = () => invoke<WallpaperState>("get_wallpaper_state_cmd").then(setState).catch(() => {});
    load();
    const un = listen("lens://wallpaper-changed", load);
    return () => {
      un.then((f) => f());
    };
  }, []);
  const save = useCallback(
    async (next: WallpaperSettings) => {
      setError(null);
      try {
        setState(await invoke<WallpaperState>("set_wallpaper_settings_cmd", { settings: next }));
      } catch (e) {
        setError(String(e));
      }
    },
    []
  );
  const s = state?.settings;
  return {
    ready: !!s,
    on: isAmbientOn(s),
    options: ambientOptionsOf(s),
    error,
    setOn: (on: boolean) => s && save(withAmbient(s, on)),
    setMotion: (motion: Motion) => s && save(withAmbient(s, isAmbientOn(s), { motion })),
    setVariant: (variant: string) => s && save(withAmbient(s, isAmbientOn(s), { variant })),
  };
}

/** Turns the backdrop on (Setup Wizard): reads the current wallpaper settings first. */
export async function enableAmbientBackdrop(): Promise<void> {
  const st = await invoke<WallpaperState>("get_wallpaper_state_cmd");
  if (isAmbientOn(st.settings)) return;
  await invoke("set_wallpaper_settings_cmd", { settings: withAmbient(st.settings, true, { motion: "subtle", variant: "auto" }) });
}

/* ------------------------------------------------------------------------------------------ */
/* UI                                                                                          */
/* ------------------------------------------------------------------------------------------ */

/** One switch for the current-theme hero in Theme & Look. */
export const AnimatedBackdropSwitch: React.FC = () => {
  const a = useAmbient();
  if (!a.ready) return null;
  return (
    <label className="amb-switch-row">
      <span className="amb-switch-text">
        <span className="amb-switch-label">Animated backdrop</span>
        <span className="amb-switch-hint">A very slow, faint motion in this theme's colours</span>
      </span>
      <span className={`amb-switch ${a.on ? "on" : ""}`}>
        <input type="checkbox" role="switch" aria-label="Animated backdrop" aria-checked={a.on} checked={a.on} onChange={(e) => a.setOn(e.target.checked)} />
        <span className="amb-knob" />
      </span>
    </label>
  );
};

/** Motion + scene override, for Customise › Wallpaper (and the settings hub's Appearance page). */
export const AmbientWallpaperOptions: React.FC = () => {
  const a = useAmbient();
  if (!a.ready) return null;
  return (
    <div className="amb-options">
      <div className="amb-row">
        <span className="amb-row-label">Animated backdrop</span>
        <span className={`amb-switch ${a.on ? "on" : ""}`}>
          <input type="checkbox" role="switch" aria-label="Animated backdrop" checked={a.on} onChange={(e) => a.setOn(e.target.checked)} />
          <span className="amb-knob" />
        </span>
      </div>
      <div className="amb-row">
        <span className="amb-row-label">Motion</span>
        <div className="tux-seg" role="radiogroup" aria-label="Backdrop motion">
          {(["still", "subtle", "lively"] as Motion[]).map((m) => (
            <button key={m} type="button" role="radio" aria-checked={a.options.motion === m} className={a.options.motion === m ? "active" : ""} disabled={!a.on} onClick={() => a.setMotion(m)}>
              {m === "still" ? "Still" : m === "subtle" ? "Subtle" : "Lively"}
            </button>
          ))}
        </div>
      </div>
      <div className="amb-row">
        <label className="amb-row-label" htmlFor="amb-scene">Scene</label>
        <select id="amb-scene" className="amb-select" value={a.options.variant} disabled={!a.on} onChange={(e) => a.setVariant(e.target.value)}>
          <option value="auto">Match my theme</option>
          {AMBIENT_SCENES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      {a.error && <div className="amb-error">Couldn't change the backdrop: {a.error}</div>}
      <div className="amb-note">Pauses when a window covers the desktop, in full-screen apps and games, and on battery saver. Reduced motion shows a still frame.</div>
    </div>
  );
};

/* ------------------------------------------------------------------------------------------ */
/* Previews (theme cards, gallery): low frame rate, paused off-screen                          */
/* ------------------------------------------------------------------------------------------ */

function reducedMotion(): boolean {
  if (typeof document === "undefined") return false;
  const lens = document.documentElement.dataset.motion;
  if (lens === "reduce") return true;
  if (lens === "full") return false;
  return typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * A small live preview of a pack's backdrop. Draws at ~8 fps while on screen, stops when
 * scrolled away or the window is hidden, and shows one still frame with reduced motion.
 */
export const AmbientPreview: React.FC<{
  packId: string;
  palette: Palette;
  className?: string;
  style?: React.CSSProperties;
  fps?: number;
}> = ({ packId, palette, className, style, fps = 8 }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const key = `${packId}|${palette.base.r},${palette.base.g},${palette.base.b}|${palette.accent.r},${palette.accent.g},${palette.accent.b}|${palette.dark}`;
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const choice = ambientFor(packId, palette.dark);
    const scene = ambientSceneById(choice.scene);
    const g = canvas.getContext("2d", { alpha: false });
    if (!scene || !g) return;
    const rect = canvas.getBoundingClientRect();
    const size = bufferSize(Math.max(40, rect.width || 160), Math.max(24, rect.height || 90), Math.max(2, scene.scale * 0.75));
    canvas.width = size.w;
    canvas.height = size.h;
    canvas.style.imageRendering = scene.pixelated ? "pixelated" : "auto";
    const params = withDefaults(choice.params);
    const ink = makeInk(coloursFrom(palette, params), motionTuning("subtle", palette.dark).strength);
    const state = scene.painter.init(size.w, size.h, 7, palette.dark);
    const img = g.createImageData(size.w, size.h);
    // Previews run a little faster than the real backdrop so the motion is visible in a thumbnail.
    let t = scene.cycle * 0.37;
    const draw = () => {
      scene.painter.paint({ buf: img.data, w: size.w, h: size.h, t, ink, params, dark: palette.dark }, state);
      g.putImageData(img, 0, 0);
    };
    draw();
    if (reducedMotion()) return;
    let visible = false;
    let timer = 0;
    const tick = () => {
      t += 3 / fps;
      draw();
    };
    const sync = () => {
      const run = visible && !document.hidden;
      if (run && !timer) timer = window.setInterval(tick, 1000 / fps);
      if (!run && timer) {
        clearInterval(timer);
        timer = 0;
      }
    };
    const io =
      typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver((es) => {
            visible = es.some((e) => e.isIntersecting);
            sync();
          })
        : null;
    if (io) io.observe(canvas);
    else {
      visible = true;
      sync();
    }
    document.addEventListener("visibilitychange", sync);
    return () => {
      io?.disconnect();
      document.removeEventListener("visibilitychange", sync);
      if (timer) clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, fps]);
  return <canvas ref={ref} className={`amb-preview ${className ?? ""}`} style={style} aria-hidden="true" />;
};
