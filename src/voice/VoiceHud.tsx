// The voice HUD: a small card above the Dock (or under the Top Bar) that shows the live
// waveform, what Lens heard, the recognised command, confirmations, undo and errors.
// Presentational: state comes from hudState.ts.

import React from "react";
import { Check, CircleHelp, Mic, MicOff, ShieldAlert, Undo2, X } from "lucide-react";
import { hudView, waveHeights, type HudButton, type HudState } from "./hudState";
import { VOICE_GROUPS, type VoiceCommandInfo } from "./contract";
import "./VoiceHud.css";
import { fillStyle } from "../ui/motion";

export interface VoiceHudProps {
  state: HudState;
  commands?: VoiceCommandInfo[];
  onButton: (b: HudButton) => void;
  onCloseHelp?: () => void;
}

const LABELS: Record<HudButton, string> = { yes: "Yes", no: "No", undo: "Undo", cancel: "Cancel", help: "Commands", unmute: "Unmute" };

function Icon({ tone }: { tone: string }) {
  if (tone === "ok") return <Check size={15} strokeWidth={2.4} />;
  if (tone === "warn") return <ShieldAlert size={15} strokeWidth={2.2} />;
  if (tone === "error") return <CircleHelp size={15} strokeWidth={2.2} />;
  if (tone === "muted") return <MicOff size={15} strokeWidth={2.2} />;
  return <Mic size={15} strokeWidth={2.2} />;
}

export function VoiceHelp({ commands, onClose }: { commands: VoiceCommandInfo[]; onClose?: () => void }) {
  return (
    <div className="lv-help" role="dialog" aria-label="Voice commands">
      <div className="lv-help-head">
        <span>Say “Lens,” then…</span>
        {onClose && (
          <button type="button" className="lv-icon-btn" aria-label="Close" onClick={onClose}>
            <X size={14} />
          </button>
        )}
      </div>
      <div className="lv-help-grid">
        {VOICE_GROUPS.map((g) => {
          const items = commands.filter((c) => c.group === g);
          if (!items.length) return null;
          return (
            <section key={g} className="lv-help-group">
              <h4>{g}</h4>
              <ul>
                {items.slice(0, 6).map((c) => (
                  <li key={c.id}>“{c.examples[0]}”</li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

export function VoiceHud({ state, commands = [], onButton, onCloseHelp }: VoiceHudProps) {
  const v = hudView(state);
  const heights = waveHeights(state.levels);
  const showHelp = state.help && commands.length > 0;
  if (!v.visible && !showHelp) return null;
  return (
    <div className={`lv-hud lv-pos-${state.position}`} data-tone={v.tone}>
      {showHelp && <VoiceHelp commands={commands} onClose={onCloseHelp} />}
      {v.visible && (
        <div className="lv-card" role="status" aria-live="polite">
          <div className="lv-badge" aria-hidden="true">
            <Icon tone={v.tone} />
          </div>
          <div className="lv-body">
            <div className="lv-title">{v.title}</div>
            {(v.detail || v.showWave) && (
              <div className="lv-detail">
                {v.showWave ? (
                  <span className="lv-wave" aria-hidden="true">
                    {heights.map((h, i) => (
                      <i key={i} style={fillStyle(h / 24)} />
                    ))}
                  </span>
                ) : null}
                {v.detail && <span className={`lv-text ${state.partial ? "partial" : ""}`}>{v.detail}</span>}
              </div>
            )}
            {v.hint && <div className="lv-hint">{v.hint}</div>}
          </div>
          {v.buttons.length > 0 && (
            <div className="lv-actions">
              {v.buttons.map((b) => (
                <button key={b} type="button" className={`lv-btn lv-btn-${b}`} onClick={() => onButton(b)}>
                  {b === "undo" && <Undo2 size={13} strokeWidth={2.2} />}
                  {LABELS[b]}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Small always-visible indicator for the Top Bar / Dock: shows when the mic is open. */
export function MicIndicator({ state, onClick }: { state: Pick<HudState, "enabled" | "listening" | "muted" | "pausedReason">; onClick?: () => void }) {
  if (!state.enabled) return null;
  const label = state.muted
    ? "Voice muted"
    : state.listening
      ? "Microphone on: Lens is listening"
      : state.pausedReason
        ? `Voice paused: ${state.pausedReason}`
        : "Voice ready";
  return (
    <button
      type="button"
      className={`lv-mic ${state.listening ? "live" : ""} ${state.muted ? "muted" : ""} ${state.pausedReason ? "paused" : ""}`}
      aria-label={label}
      aria-pressed={state.listening}
      onClick={onClick}
    >
      {state.muted ? <MicOff size={13} strokeWidth={2.2} /> : <Mic size={13} strokeWidth={2.2} />}
      {state.listening && <span className="lv-mic-dot" aria-hidden="true" />}
    </button>
  );
}

/** Press-and-hold mic button for the Dock and Lens Mini. Space/Enter work too. */
export function MicButton({ size = 32, onPress, onRelease, live }: { size?: number; onPress: () => void; onRelease: () => void; live?: boolean }) {
  const held = React.useRef(false);
  const down = () => {
    if (held.current) return;
    held.current = true;
    onPress();
  };
  const up = () => {
    if (!held.current) return;
    held.current = false;
    onRelease();
  };
  return (
    <button
      type="button"
      className={`lv-mic-btn ${live ? "live" : ""}`}
      style={{ width: size, height: size }}
      aria-label="Hold to talk to Lens"
      onPointerDown={(e) => {
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
        down();
      }}
      onPointerUp={up}
      onPointerCancel={up}
      onKeyDown={(e) => {
        if ((e.key === " " || e.key === "Enter") && !e.repeat) {
          e.preventDefault();
          down();
        }
      }}
      onKeyUp={(e) => {
        if (e.key === " " || e.key === "Enter") up();
      }}
    >
      <Mic size={Math.round(size * 0.47)} strokeWidth={2.2} />
    </button>
  );
}
