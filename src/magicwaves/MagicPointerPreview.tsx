// Magic Mouse card body (docs/plans/MAGIC_WAVES.md §4.2, wave M3): the Lens Magic pointer as
// Windows will draw it (frames rendered by Rust, `magic_mouse_preview`), the busy ring, and a
// picture of a grab: the accent rectangle and the actions a grab offers. Nothing here captures
// the screen or changes the pointer; the frames animate only when motion is allowed.
import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { CursorPreview } from "../cursors/types";
import { prefersReducedMotion } from "../cursors/api";

/** What a grab offers (the Snip studio's actions). Ask Claude asks before anything leaves the PC. */
export const GRAB_ACTIONS = ["Copy", "Copy text", "Save", "Add to Shelf", "Ask Claude"] as const;

export function useMagicPointerFrames(highContrast: boolean): CursorPreview[] {
  const [frames, setFrames] = useState<CursorPreview[]>([]);
  useEffect(() => {
    let live = true;
    invoke<CursorPreview[]>("magic_mouse_preview", { size: 64, highContrast })
      .then((p) => live && setFrames(Array.isArray(p) ? p : []))
      .catch(() => live && setFrames([]));
    return () => {
      live = false;
    };
  }, [highContrast]);
  return frames;
}

const Sprite: React.FC<{ p: CursorPreview; frame: number }> = ({ p, frame }) => {
  const src = p.frames.length ? p.frames[frame % p.frames.length] : "";
  return (
    <figure className="mmp-sprite">
      {src ? <img src={src} width={48} height={48} alt={p.label} draggable={false} /> : <span className="mmp-blank" />}
      <figcaption>{p.label}</figcaption>
    </figure>
  );
};

export const MagicPointerPreview: React.FC = () => {
  const [hc, setHc] = useState(false);
  const previews = useMagicPointerFrames(hc);
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const id = window.setInterval(() => setFrame((f) => f + 1), 167);
    return () => window.clearInterval(id);
  }, []);
  return (
    <div className="mmp" data-testid="magic-pointer-preview">
      <div className="mmp-row">
        {previews.map((p) => (
          <Sprite key={p.role} p={p} frame={frame} />
        ))}
        <label className="mmp-hc">
          <input type="checkbox" checked={hc} onChange={(e) => setHc(e.target.checked)} />
          High contrast
        </label>
      </div>
      <div className="mmp-grab" aria-label="What a grab looks like">
        <div className="mmp-rect" />
        <div className="mmp-actions" role="list">
          {GRAB_ACTIONS.map((a) => (
            <span key={a} role="listitem" className="mmp-chip">
              {a}
            </span>
          ))}
        </div>
      </div>
      <p className="mmp-note">
        Hold the left button, then drag to grab part of the screen. Hold and let go to open Magic. A quick click is
        just a click. Text and resize pointers stay the ones you know. Magic Mouse steps aside in games and fullscreen
        apps, and nothing leaves your PC unless you approve it.
      </p>
    </div>
  );
};
