// Draws one "Lens at work" scene: orb, accent ring, click ripple, typing/setting chip, window
// ghost and caption. Pure: the overlay animates `progress`; the parity gallery renders frames.
import type { CSSProperties } from "react";
import { ORB_URL } from "./orb";
import { ORB_SIZE, pathAt, type Pt, type Scene } from "./model";
import type { LRect } from "./types";
import "./presence.css";

export interface PresenceViewProps {
  scene: Scene;
  /** 0 → 1 through the step. */
  progress: number;
  /** Parity frames: no CSS animations. */
  still?: boolean;
  onOrbClick?: () => void;
}

const box = (r: LRect): CSSProperties => ({ left: r.x, top: r.y, width: r.w, height: r.h });

export function orbPoint(scene: Scene, progress: number): Pt {
  return scene.travel ? pathAt(scene.from, scene.to, progress) : scene.to;
}

export function PresenceView({ scene, progress, still, onOrbClick }: PresenceViewProps) {
  if (scene.visual === "none") return null;
  const p = Math.min(1, Math.max(0, progress));
  const orb = orbPoint(scene, p);
  // Rings/ghost/ripple land as the orb arrives (or straight away when it fades in place).
  const arrived = !scene.travel || p >= 0.82;
  const fade = scene.travel ? 1 : Math.min(1, p / 0.4 + 0.15);
  const anchor = scene.orb ? orb : scene.ring ? { x: scene.ring.x + scene.ring.w / 2, y: scene.ring.y + scene.ring.h } : null;
  const chipAt = scene.ring ? { x: scene.ring.x + scene.ring.w / 2, y: scene.ring.y + scene.ring.h + 10 } : anchor;
  // Without an orb the caption already sits under the ring: put the chip above it instead.
  const chipBelow = scene.orb || !scene.caption;
  return (
    <div className={`pr-root${still ? " is-still" : ""}${scene.error ? " is-error" : ""}`} aria-hidden={!scene.orb}>
      {scene.ghost ? (
        <>
          {scene.ghost.from ? <div className="pr-ghost is-from" style={box(scene.ghost.from)} /> : null}
          <div className={`pr-ghost${arrived ? " is-on" : ""}`} style={box(scene.ghost.to)} />
        </>
      ) : null}
      {scene.ring && arrived ? <div className="pr-ring" style={box(pad(scene.ring, 4))} /> : null}
      {scene.ripple && arrived ? (
        <div className="pr-ripple" style={{ left: scene.ripple.x, top: scene.ripple.y, ...(still ? { transform: "translate(-50%, -50%) scale(1.6)", opacity: 0.45 } : null) }} />
      ) : null}
      {scene.orb ? (
        <button
          type="button"
          className="pr-orb"
          aria-label="Stop Lens"
          onClick={onOrbClick}
          style={{ left: orb.x - ORB_SIZE / 2, top: orb.y - ORB_SIZE / 2, width: ORB_SIZE, height: ORB_SIZE, opacity: fade }}
        >
          <img src={ORB_URL} alt="" draggable={false} />
        </button>
      ) : null}
      {scene.chip && chipAt && arrived ? (
        <div className={`pr-chip is-${scene.chip.kind}`} style={{ left: chipAt.x, top: chipBelow || !scene.ring ? chipAt.y : scene.ring.y - 34 }}>
          {scene.chip.kind === "type" ? <span className="pr-caret-text">{scene.chip.text}</span> : scene.chip.text}
          {scene.chip.kind === "type" ? <span className="pr-caret" /> : null}
        </div>
      ) : null}
      {scene.caption && anchor ? (
        <div className="pr-caption" style={{ ...captionPos(scene, orb), opacity: fade }}>
          {scene.caption}
        </div>
      ) : null}
    </div>
  );
}

/** Beside the orb (left of it when parked by a card); without an orb, under the ring — or above
 *  it near the bottom of the screen (the Dock). */
function captionPos(scene: Scene, orb: Pt): CSSProperties {
  if (scene.orb) {
    return scene.parked
      ? { left: orb.x - ORB_SIZE / 2 - 8, top: orb.y - 11, transform: "translateX(-100%)" }
      : { left: orb.x + ORB_SIZE / 2 + 8, top: orb.y - 11 };
  }
  const r = scene.ring;
  if (!r) return { display: "none" };
  const h = typeof window === "undefined" ? 1080 : window.innerHeight;
  const below = r.y + r.h + 12;
  return { left: r.x + r.w / 2, top: below + 28 > h ? r.y - 36 : below, transform: "translateX(-50%)" };
}

function pad(r: LRect, n: number): LRect {
  return { x: r.x - n, y: r.y - n, w: r.w + n * 2, h: r.h + n * 2 };
}
