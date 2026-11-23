// Conversation mode view: "Lens is speaking · 1:01", the question, the answer revealed word by
// word in sync with speech, a monospace source line, and an audio-reactive aurora with
// mute / stop / close. Presentational; state comes from conversation.ts.

import React, { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Square, X } from "lucide-react";
import { auroraBars, formatElapsed, isSpoken, statusLabel, words, type ConvState } from "./convoState";
import "./Conversation.css";

export interface ConversationProps {
  state: ConvState;
  view: "panel" | "fullscreen";
  /** Mic levels, oldest first (0..1). */
  levels: number[];
  /** ms since the conversation opened (passed in so tests and screenshots are stable). */
  elapsedMs: number;
  reducedMotion: boolean;
  onMute: () => void;
  onStop: () => void;
  onClose: () => void;
  /** Freeze the aurora at this time (seconds) for screenshots. */
  frozenT?: number;
}

const BARS = 56;

export function Aurora({ status, levels, reducedMotion, frozenT }: { status: ConvState["status"]; levels: number[]; reducedMotion: boolean; frozenT?: number }) {
  const [t, setT] = useState(frozenT ?? 0);
  const raf = useRef(0);
  useEffect(() => {
    if (reducedMotion || frozenT !== undefined) return;
    const start = performance.now();
    let last = 0;
    const tick = (now: number) => {
      if (now - last > 33) {
        last = now;
        setT((now - start) / 1000);
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [reducedMotion, frozenT]);
  const bars = auroraBars(BARS, status, levels, frozenT ?? t, reducedMotion);
  return (
    <div className={`lc-aurora ${reducedMotion ? "still" : ""}`} aria-hidden="true">
      <div className="lc-aurora-glow" />
      <div className="lc-aurora-bars">
        {bars.map((v, i) => (
          <i key={i} style={{ height: `${Math.round(6 + v * 94)}%`, ["--i" as string]: i / (BARS - 1) } as React.CSSProperties} />
        ))}
      </div>
    </div>
  );
}

export function Conversation({ state, view, levels, elapsedMs, reducedMotion, onMute, onStop, onClose, frozenT }: ConversationProps) {
  const ws = words(state.answer);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
  }, []);
  return (
    <div className={`lc lc-${view}`} data-status={state.status} role="dialog" aria-label="Conversation with Lens" aria-modal={view === "fullscreen"}>
      <div className="lc-inner">
        <div className="lc-status" role="status">
          <span className="lc-dot" aria-hidden="true" />
          <span>{statusLabel(state)}</span>
          <span className="lc-time">{formatElapsed(elapsedMs)}</span>
        </div>

        <div className="lc-main">
          {state.question && <p className="lc-question">{state.question}</p>}
          {state.answer ? (
            <p className={`lc-answer ${reducedMotion ? "still" : ""}`} aria-live="polite">
              {ws.map((w, i) => (
                <React.Fragment key={i}>
                  <span className={isSpoken(i, state.spokenWord, reducedMotion) ? "lc-w said" : "lc-w"}>{w.text}</span>
                  {w.space ? " " : ""}
                </React.Fragment>
              ))}
            </p>
          ) : state.status === "thinking" ? (
            <p className="lc-answer lc-placeholder">Thinking…</p>
          ) : state.status === "listening" && !state.question ? (
            <p className="lc-answer lc-placeholder">{state.muted ? "Your mic is muted." : "Go ahead, I'm listening."}</p>
          ) : null}
          {state.caption && <p className="lc-caption">{state.caption}</p>}
        </div>
      </div>

      <Aurora status={state.status} levels={levels} reducedMotion={reducedMotion} frozenT={frozenT} />

      <div className="lc-controls">
        <button type="button" className={`lc-btn ${state.muted ? "on" : ""}`} aria-pressed={state.muted} aria-label={state.muted ? "Unmute mic" : "Mute mic"} onClick={onMute}>
          {state.muted ? <MicOff size={20} strokeWidth={2} /> : <Mic size={20} strokeWidth={2} />}
        </button>
        <button type="button" className="lc-btn" aria-label="Stop" onClick={onStop} disabled={state.status !== "speaking" && state.status !== "thinking"}>
          <Square size={16} strokeWidth={2.4} />
        </button>
        <button ref={closeRef} type="button" className="lc-btn lc-close" aria-label="Close conversation (Esc)" onClick={onClose}>
          <X size={22} strokeWidth={2.2} />
        </button>
      </div>
    </div>
  );
}
