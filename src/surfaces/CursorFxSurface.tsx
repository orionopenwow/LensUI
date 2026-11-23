import React, { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { cursorApi, currentAccentHex, prefersReducedMotion } from "../cursors/api";
import { FxEngine, resolveFxColor } from "../cursors/effects";
import { DEFAULT_FX, type FxFrame, type FxSettings } from "../cursors/types";
import { useLensState } from "../hooks/useLensState";
import "./CursorFxSurface.css";

/**
 * The "cursorfx" overlay. The window itself is made click-through, non-activating and kept off
 * Alt+Tab by win_cursor_fx.rs; this surface only draws. Frames arrive from the WH_MOUSE_LL
 * worker in physical pixels relative to this window's monitor, so the canvas is sized in
 * physical pixels too.
 */
export const CursorFxSurface: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<FxEngine | null>(null);
  const settingsRef = useRef<FxSettings>(DEFAULT_FX);
  // Keeps the theme tokens (and so the accent) live in this window.
  const { config } = useLensState();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const size = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(window.innerWidth * dpr);
      canvas.height = Math.round(window.innerHeight * dpr);
      engineRef.current?.setOptions({ scale: dpr });
    };
    const engine = new FxEngine(canvas, settingsRef.current, {
      color: resolveFxColor(settingsRef.current.color, currentAccentHex()),
      scale: window.devicePixelRatio || 1,
      reducedMotion: prefersReducedMotion(),
    });
    engineRef.current = engine;
    size();
    window.addEventListener("resize", size);

    const applySettings = (s: FxSettings) => {
      settingsRef.current = s;
      engine.setSettings(s);
      engine.setOptions({ color: resolveFxColor(s.color, currentAccentHex()) });
    };
    cursorApi.fxGet().then((st) => applySettings(st.settings)).catch(() => {});

    const unFrame = listen<FxFrame>("cursorfx://frame", (e) => {
      const f = e.payload;
      if (f.paused && f.paused !== "none") {
        engine.clear();
        return;
      }
      if (f.paused === "none") return;
      engine.pointer(f.x, f.y);
      for (const c of f.clicks) engine.click(c.button, c.x, c.y);
      for (const k of f.keys) engine.key(k);
      if (f.shake) engine.locate();
      if (f.spotlightToggle) engine.toggleSpotlight();
    });
    const unSettings = listen<FxSettings>("cursorfx://settings", (e) => applySettings(e.payload));

    return () => {
      window.removeEventListener("resize", size);
      unFrame.then((f) => f());
      unSettings.then((f) => f());
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  // Accent / motion changes from the theme.
  useEffect(() => {
    engineRef.current?.setOptions({
      color: resolveFxColor(settingsRef.current.color, currentAccentHex()),
      reducedMotion: prefersReducedMotion(),
    });
  }, [config?.theme]);

  return (
    <div className="cfx-root" aria-hidden="true">
      <canvas ref={canvasRef} className="cfx-canvas" />
    </div>
  );
};
