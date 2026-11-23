// The "presence" window: a transparent, click-through, topmost, capture-excluded overlay on the
// target's monitor (created lazily by src-tauri/src/presence/win.rs). Only the orb takes clicks:
// clicking it stops the run. Docs: docs/PRESENCE.md.
import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { useLensState } from "../hooks/useLensState";
import { PresenceView, orbPoint } from "./PresenceView";
import { sceneFor, type Pt, type Scene } from "./model";
import { last, stop } from "./api";
import { EVT_STEP, EVT_STOP, type PresenceEvent } from "./types";

export function PresenceSurface() {
  useLensState(); // theme tokens
  const [scene, setScene] = useState<Scene | null>(null);
  const [progress, setProgress] = useState(1);
  const orbAt = useRef<Pt | null>(null);
  const runRef = useRef<number | null>(null);
  const raf = useRef(0);

  useEffect(() => {
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    let alive = true;
    const play = (ev: PresenceEvent) => {
      if (runRef.current !== ev.run) orbAt.current = null; // new run: orb appears near the target
      runRef.current = ev.run;
      const s = sceneFor(ev, orbAt.current);
      cancelAnimationFrame(raf.current);
      setScene(s);
      const dur = s.durationMs;
      if (dur <= 0) {
        setProgress(1);
        orbAt.current = s.to;
        return;
      }
      const t0 = performance.now();
      const tick = (now: number) => {
        const p = Math.min(1, (now - t0) / dur);
        setProgress(p);
        orbAt.current = orbPoint(s, p);
        if (p < 1) raf.current = requestAnimationFrame(tick);
      };
      setProgress(0);
      raf.current = requestAnimationFrame(tick);
    };
    void last().then((ev) => alive && ev && play(ev));
    const un1 = listen<PresenceEvent>(EVT_STEP, (e) => play(e.payload));
    const un2 = listen<string[]>(EVT_STOP, () => {
      cancelAnimationFrame(raf.current);
      setScene(null);
      orbAt.current = null;
      runRef.current = null;
    });
    return () => {
      alive = false;
      cancelAnimationFrame(raf.current);
      void un1.then((u) => u());
      void un2.then((u) => u());
    };
  }, []);

  if (!scene) return null;
  return <PresenceView scene={scene} progress={progress} onOrbClick={() => void stop()} />;
}
