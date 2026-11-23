// The Dock as the voice capture module. While Lens listens, the Dock pill keeps its exact
// width: the app icons compress to a strip, and the freed room shows a live waveform and the
// live transcript (bright = confirmed words, monospace = still changing). A recognised command
// shows as a chip with a short undo; confirm-risk commands open an approval card above the
// Dock. Mount snippet: docs/VOICE.md › Dock voice UI.

import React, { useEffect, useReducer, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { Check, Mic, ShieldAlert, Undo2 } from "lucide-react";
import {
  VOICE_EVENTS,
  voiceAnswer,
  voiceCancel,
  voicePtt,
  voiceSetDockUi,
  voiceUndo,
  type VoiceHeardEvent,
  type VoiceResultEvent,
  type VoiceStateEvent,
} from "../../voice/contract";
import { IDLE, reduceMorph, voiceDockLayout, type DockStyleId, type Edge, type MorphState } from "./dockMorph";
import { HOLD0, holdCancel, holdPress, holdRelease, type HoldEffect, type HoldState } from "./holdButton";
import "./VoiceDock.css";

export interface VoiceDockViewProps {
  style: DockStyleId;
  edge: Edge;
  /** The pill's current size (px); the voice UI fits inside it. */
  width: number;
  height: number;
  morph: MorphState;
  levels: number[];
  /** Compressed app icons (the Dock passes its own icons, rendered small). */
  icons?: React.ReactNode[];
  reducedMotion?: boolean;
  onUndo?: () => void;
  onAnswer?: (yes: boolean) => void;
}

function Wave({ levels, length, vertical }: { levels: number[]; length: number; vertical: boolean }) {
  const n = Math.max(6, Math.min(40, Math.floor(length / 5)));
  const pick = (i: number) => levels[Math.floor((i / n) * levels.length)] ?? 0;
  return (
    <span className={`vdk-wave ${vertical ? "v" : ""}`} style={vertical ? { height: length } : { width: length }} aria-hidden="true">
      {Array.from({ length: n }, (_, i) => {
        const v = 0.12 + 0.88 * Math.pow(Math.min(1, Math.max(0, pick(i))), 0.7);
        return <i key={i} style={vertical ? { width: `${Math.round(v * 100)}%` } : { height: `${Math.round(v * 100)}%` }} />;
      })}
    </span>
  );
}

/** Presentational: everything is derived from props (used by the parity gallery). */
export function VoiceDockView({ style, edge, width, height, morph, levels, icons = [], reducedMotion, onUndo, onAnswer }: VoiceDockViewProps) {
  const l = voiceDockLayout(style, edge, width, height, icons.length);
  const active = morph.stage !== "idle";
  const flyoutText = l.flyout && (morph.stage === "listening" || morph.stage === "partial");
  const iconEls = icons.slice(0, l.iconsShown);
  return (
    <div className={`vdk vdk-${style} vdk-edge-${edge} ${l.vertical ? "vertical" : ""} ${active ? "on" : ""} ${reducedMotion ? "still" : ""}`} data-stage={morph.stage} style={{ width, height }}>
      {active && (
        <div className="vdk-row" style={{ padding: l.pad, gap: l.gap, ...(l.vertical ? { bottom: l.mic + l.gap } : { right: l.mic + l.gap }) }}>
          {(morph.stage === "listening" || morph.stage === "partial") && (
            <>
              <Wave levels={levels} length={l.wave} vertical={l.vertical} />
              {!l.vertical && l.transcript > 0 && (
                <span className="vdk-text" style={{ width: l.transcript }} aria-live="polite">
                  {morph.confirmed || morph.partial ? (
                    <span className="vdk-text-in">
                      <b>{morph.confirmed}</b>
                      {morph.confirmed && morph.partial ? " " : ""}
                      <code>{morph.partial}</code>
                    </span>
                  ) : (
                    <span className="vdk-hint">Listening…</span>
                  )}
                </span>
              )}
            </>
          )}
          {morph.stage === "recognised" && (
            <span className="vdk-chip-row" style={l.vertical ? undefined : { width: l.wave + l.transcript + l.gap }}>
              <span className="vdk-chip">
                <Check size={13} strokeWidth={2.6} />
                <span className="vdk-chip-text">{morph.chip}</span>
              </span>
              {morph.undo && (
                <button type="button" className="vdk-undo" onClick={onUndo} aria-label={`Undo: ${morph.undo}`}>
                  <Undo2 size={12} strokeWidth={2.4} />
                  <kbd>Undo</kbd>
                  <i className="vdk-undo-timer" aria-hidden="true" />
                </button>
              )}
            </span>
          )}
          {morph.stage === "confirm" && (
            <span className="vdk-chip-row" style={l.vertical ? undefined : { width: l.wave + l.transcript + l.gap }}>
              <span className="vdk-chip ask">
                <ShieldAlert size={13} strokeWidth={2.4} />
                <span className="vdk-chip-text">Waiting for your OK</span>
              </span>
            </span>
          )}
          {morph.stage === "error" && (
            <span className="vdk-chip-row" style={l.vertical ? undefined : { width: l.wave + l.transcript + l.gap }}>
              <span className="vdk-chip err">
                <span className="vdk-chip-text">{morph.error || "Didn't catch that"}</span>
              </span>
            </span>
          )}
          {iconEls.length > 0 && (
            <span className="vdk-icons" style={{ ["--vdk-icon" as string]: `${l.iconSize}px` } as React.CSSProperties} aria-hidden="true">
              {iconEls.map((ic, i) => (
                <span key={i} className="vdk-icon">
                  {ic}
                </span>
              ))}
            </span>
          )}
        </div>
      )}
      {flyoutText && (
        <div className="vdk-flyout" aria-live="polite">
          {morph.confirmed || morph.partial ? (
            <>
              <b>{morph.confirmed}</b> <code>{morph.partial}</code>
            </>
          ) : (
            <span className="vdk-hint">Listening…</span>
          )}
        </div>
      )}
      {morph.stage === "confirm" && morph.confirm && (
        <div className="vdk-approve" role="alertdialog" aria-label={morph.confirm.label}>
          <div className="vdk-approve-title">{morph.confirm.label}</div>
          {morph.confirm.heard && <div className="vdk-approve-heard">Heard “{morph.confirm.heard}” · say yes or no</div>}
          <div className="vdk-approve-actions">
            <button type="button" className="vdk-btn yes" onClick={() => onAnswer?.(true)}>
              Yes
            </button>
            <button type="button" className="vdk-btn" onClick={() => onAnswer?.(false)}>
              No
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** The big hold-to-talk button at the Dock's end (every style). */
export function DockMicButton({ size = 36, live, onEffect }: { size?: number; live?: boolean; onEffect?: (e: HoldEffect) => void }) {
  const [hold, setHold] = useState<HoldState>(HOLD0);
  const ref = useRef(hold);
  ref.current = hold;
  const run = (fx: HoldEffect[]) => {
    for (const e of fx) {
      onEffect?.(e);
      if (e === "start") voicePtt(true).catch(() => {});
      else if (e === "send") voicePtt(false).catch(() => {});
      else if (e === "cancel") voiceCancel().catch(() => {});
    }
  };
  const apply = (f: (s: HoldState) => [HoldState, HoldEffect[]]) => {
    const [n, fx] = f(ref.current);
    ref.current = n;
    setHold(n);
    run(fx);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") apply((s) => holdCancel(s));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const held = hold.pressedAt !== null && !hold.stopping;
  return (
    <button
      type="button"
      className={`vdk-mic ${held ? "held" : ""} ${hold.latched ? "latched" : ""} ${live ? "live" : ""}`}
      style={{ width: size, height: size }}
      aria-label={hold.latched ? "Listening hands-free: tap to send" : "Hold to talk to Lens (double-tap for hands-free)"}
      aria-pressed={hold.active}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture?.(e.pointerId);
        apply((s) => holdPress(s, performance.now()));
      }}
      onPointerUp={() => apply((s) => holdRelease(s, performance.now()))}
      onPointerCancel={() => apply((s) => holdCancel(s))}
      onPointerMove={(e) => {
        // Slide off (more than 24 px outside the button) to cancel.
        if (ref.current.pressedAt === null || ref.current.latched) return;
        const r = e.currentTarget.getBoundingClientRect();
        const out = e.clientX < r.left - 24 || e.clientX > r.right + 24 || e.clientY < r.top - 24 || e.clientY > r.bottom + 24;
        if (out) apply((s) => holdCancel(s));
      }}
      onKeyDown={(e) => {
        if ((e.key === " " || e.key === "Enter") && !e.repeat) {
          e.preventDefault();
          apply((s) => holdPress(s, performance.now()));
        }
      }}
      onKeyUp={(e) => {
        if (e.key === " " || e.key === "Enter") apply((s) => holdRelease(s, performance.now()));
      }}
    >
      <span className="vdk-mic-fill" aria-hidden="true" />
      <Mic size={Math.round(size * 0.46)} strokeWidth={2.2} />
    </button>
  );
}

/** Live wiring for the Dock: voice events → morph state; tells Lens the Dock shows voice. */
export function useVoiceDock(visible: boolean) {
  const [morph, dispatch] = useReducer(reduceMorph, IDLE);
  const [levels, setLevels] = useState<number[]>(Array(32).fill(0));
  const [live, setLive] = useState(false);
  useEffect(() => {
    voiceSetDockUi(visible).catch(() => {});
    return () => {
      voiceSetDockUi(false).catch(() => {});
    };
  }, [visible]);
  useEffect(() => {
    const uns = [
      listen<VoiceStateEvent>(VOICE_EVENTS.state, (e) => {
        setLive(e.payload.listening && e.payload.phase === "listening" && !!e.payload.armed);
        dispatch({ kind: "state", payload: e.payload, now: Date.now() });
      }),
      listen<VoiceHeardEvent>(VOICE_EVENTS.heard, (e) => dispatch({ kind: "heard", payload: e.payload })),
      listen<VoiceResultEvent>(VOICE_EVENTS.result, (e) => dispatch({ kind: "result", payload: e.payload, now: Date.now() })),
      listen<{ level: number }>(VOICE_EVENTS.level, (e) => setLevels((l) => [...l.slice(1), Math.max(0, Math.min(1, e.payload.level || 0))])),
    ];
    const t = window.setInterval(() => dispatch({ kind: "tick", now: Date.now() }), 100);
    return () => {
      uns.forEach((u) => u.then((f) => f()).catch(() => {}));
      window.clearInterval(t);
    };
  }, []);
  return {
    morph,
    levels,
    live,
    undo: () => voiceUndo().catch(() => {}).finally(() => dispatch({ kind: "dismiss" })),
    answer: (yes: boolean) => voiceAnswer(yes).catch(() => {}),
  };
}

export { IDLE };
