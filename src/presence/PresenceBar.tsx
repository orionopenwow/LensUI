// "<Client> is controlling Lens · Stop" — shown whenever an outside app drives Lens (never
// hidden by the "Show Lens at work" setting). Window: "presencebar" (src-tauri/src/presence/win.rs).
import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { useLensState } from "../hooks/useLensState";
import { ORB_URL } from "./orb";
import { status, stop } from "./api";
import { EVT_BANNER, type BannerEvent } from "./types";
import "./presence.css";

export interface PresenceBarProps {
  label: string;
  step?: string;
  hotkey?: string;
  onStop: () => void;
}

/** Pure banner (also used by the parity gallery). */
export function PresenceBar({ label, step, hotkey, onStop }: PresenceBarProps) {
  return (
    <div className="pr-bar" role="status" aria-live="polite">
      <img className="pr-bar-orb" src={ORB_URL} alt="" draggable={false} />
      <span className="pr-bar-text">
        <b>{label}</b> is controlling Lens{step ? <span className="pr-bar-step"> · {step}</span> : null}
      </span>
      {hotkey ? <span className="pr-key" aria-label={`Pause key ${hotkey}`}>{hotkey}</span> : null}
      <button type="button" className="pr-stop" onClick={onStop}>
        Stop
      </button>
    </div>
  );
}

/** "Claude Desktop · Clicking ‘Book’ · 3/7" → "Clicking ‘Book’ · 3/7" */
export function stepFromCaption(caption: string | undefined, label: string): string | undefined {
  if (!caption) return undefined;
  const prefix = `${label} · `;
  return caption.startsWith(prefix) ? caption.slice(prefix.length) : caption;
}

export function PresenceBarSurface() {
  useLensState();
  const [ev, setEv] = useState<BannerEvent | null>(null);
  const [hotkey, setHotkey] = useState<string>();
  useEffect(() => {
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    void status().then((s) => setHotkey(s.hotkeyOk ? s.config.pauseHotkey : undefined));
    const un = listen<BannerEvent>(EVT_BANNER, (e) => setEv(e.payload.active ? e.payload : null));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") void stop();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      void un.then((u) => u());
    };
  }, []);
  if (!ev?.actor) return null;
  const label = ev.actor.label;
  return <PresenceBar label={label} step={stepFromCaption(ev.caption, label)} hotkey={hotkey} onStop={() => void stop()} />;
}
