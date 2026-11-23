/**
 * Settings › Appearance › Creator: a compact Backdrop Lab. Live preview, a few presets, Inspire,
 * "Set as live wallpaper", "Make a theme" and the way into the full Lab window.
 */
import React, { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ExternalLink, Monitor, Sparkles } from "lucide-react";
import type { LensConfig } from "../../../types/lens";
import { DEFAULT_MOOD, HERO_PRESET_ID, PRESETS, ThumbnailService, inspire, presetById, type BackdropState } from "../engine";
import { loadCurrent, saveCurrent } from "../store";
import { makeTheme, restoreWallpaper, setLiveWallpaper } from "../apply";
import { LiveCanvas } from "./LiveCanvas";
import "./lab.css";

const PICKS = ["lens-nebula", "soft-lagoon", "light-gallery-beam", "nature-polar-curtain", "nature-moon-sea", "nature-afternoon-wall", "pattern-midnight-tiles", "glass-night-drive"];

const Tile: React.FC<{ svc: ThumbnailService | null; state: BackdropState; name: string; on: boolean; onClick: () => void }> = ({ svc, state, name, on, onClick }) => {
  const ref = React.useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || !svc) return;
    svc.add(c, state);
    return () => svc.remove(c);
  }, [svc, state]);
  return (
    <button type="button" className={`bd-tile ${on ? "on" : ""}`} aria-pressed={on} onClick={onClick}>
      <canvas ref={ref} className="bd-thumb" aria-hidden="true" onPointerEnter={() => ref.current && svc?.setHot(ref.current, true)} onPointerLeave={() => ref.current && svc?.setHot(ref.current, false)} />
      <span>{name}</span>
    </button>
  );
};

export const CreatorCard: React.FC<{ config: LensConfig | null; updateConfig: (c: LensConfig) => void }> = ({ config, updateConfig }) => {
  const [s, setS] = useState<BackdropState>(() => loadCurrent() ?? presetById(HERO_PRESET_ID)!.state);
  const [note, setNote] = useState<{ text: string; undo?: () => void } | null>(null);
  const svc = useMemo(() => new ThumbnailService(128, 72), []);
  useEffect(() => () => svc.dispose(), [svc]);
  const pick = (st: BackdropState) => {
    setS(st);
    saveCurrent(st);
  };
  return (
    <div className="cc-card bd-creator">
      <div className="bd-creator-grid">
        <div className="bd-creator-preview">
          <LiveCanvas state={s} dprCap={1} label="Backdrop preview" />
        </div>
        <div className="bd-creator-side">
          <div className="cc-label">Backdrop Lab</div>
          <div className="cc-desc">Animated gradients, light and glass for your desktop. Make one, play it as a live wallpaper, or turn it into a theme.</div>
          <div className="bd-row wrap">
            <button type="button" className="bd-btn" onClick={() => pick(inspire(s, DEFAULT_MOOD, new Set(), Date.now()))}>
              <Sparkles size={13} aria-hidden /> Inspire
            </button>
            <button
              type="button"
              className="bd-btn primary"
              onClick={() =>
                setLiveWallpaper(s)
                  .then((prev) => setNote({ text: "Playing on your desktop", undo: () => restoreWallpaper(prev).catch(() => {}) }))
                  .catch((e) => setNote({ text: String(e) }))
              }
            >
              <Monitor size={13} aria-hidden /> Set as live wallpaper
            </button>
            <button
              type="button"
              className="bd-btn"
              disabled={!config}
              onClick={() =>
                config &&
                makeTheme(s, s.name || "My backdrop", config, updateConfig)
                  .then((r) => setNote({ text: "Theme applied", undo: () => updateConfig(r.prevConfig) }))
                  .catch((e) => setNote({ text: String(e) }))
              }
            >
              Make a theme
            </button>
            <button type="button" className="bd-btn ghost" onClick={() => invoke("toggle_surface", { label: "studio" }).catch(() => {})}>
              <ExternalLink size={13} aria-hidden /> Open Backdrop Lab
            </button>
          </div>
          {note && (
            <div className="bd-inline-note" role="status">
              {note.text}
              {note.undo && (
                <button
                  type="button"
                  className="bd-btn"
                  onClick={() => {
                    note.undo?.();
                    setNote(null);
                  }}
                >
                  Undo
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="bd-grid compact">
        {PICKS.map((id) => {
          const p = presetById(id) ?? PRESETS[0];
          return <Tile key={id} svc={svc} state={p.state} name={p.name} on={s.name === p.name} onClick={() => pick(p.state)} />;
        })}
      </div>
    </div>
  );
};
