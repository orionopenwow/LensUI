// Binds the voice events to the HUD reducer (used by the HUD surface and anything that shows
// the mic indicator).

import { useEffect, useReducer, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  VOICE_EVENTS,
  voiceAnswer,
  voiceCancel,
  voiceCommands,
  voiceMute,
  voiceSpeak,
  voiceUndo,
  type VoiceApplyEvent,
  type VoiceCommandInfo,
  type VoiceHeardEvent,
  type VoiceResultEvent,
  type VoiceStateEvent,
} from "./contract";
import { INITIAL_HUD, reduceHud, type HudButton } from "./hudState";
import { earconFor, playEarcon } from "./sounds";

export function useVoiceHud() {
  const [state, dispatch] = useReducer(reduceHud, INITIAL_HUD);
  const [commands, setCommands] = useState<VoiceCommandInfo[]>([]);
  const phase = useRef(state.phase);
  const sounds = useRef(state.sounds);
  sounds.current = state.sounds;

  useEffect(() => {
    const uns = [
      listen<VoiceStateEvent>(VOICE_EVENTS.state, (e) => {
        const ear = earconFor(phase.current, e.payload.phase);
        phase.current = e.payload.phase;
        if (ear && e.payload.sounds) playEarcon(ear);
        dispatch({ kind: "state", payload: e.payload });
      }),
      listen<{ level: number }>(VOICE_EVENTS.level, (e) => dispatch({ kind: "level", level: e.payload.level })),
      listen<VoiceHeardEvent>(VOICE_EVENTS.heard, (e) => dispatch({ kind: "heard", payload: e.payload })),
      listen<VoiceResultEvent>(VOICE_EVENTS.result, (e) => dispatch({ kind: "result", payload: e.payload })),
      listen<VoiceApplyEvent>(VOICE_EVENTS.apply, (e) => {
        if (e.payload.action === "help") dispatch({ kind: "help", open: true });
      }),
    ];
    voiceCommands()
      .then((c) => setCommands(Array.isArray(c) ? c : []))
      .catch(() => {});
    return () => {
      uns.forEach((u) => u.then((f) => f()).catch(() => {}));
    };
  }, []);

  // Results fade on their own; confirmations stay until answered.
  useEffect(() => {
    const r = state.result;
    if (!r || r.status === "confirm" || r.status === "suggest" || state.phase === "listening" || state.phase === "thinking") return;
    const t = window.setTimeout(() => dispatch({ kind: "dismiss" }), r.undo ? 6000 : r.status === "done" ? 2200 : 4000);
    return () => window.clearTimeout(t);
  }, [state.result, state.phase]);

  const onButton = (b: HudButton) => {
    if (b === "yes" || b === "no") voiceAnswer(b === "yes").catch(() => {});
    else if (b === "cancel") voiceCancel().catch(() => {});
    else if (b === "undo") voiceUndo().catch(() => {}).finally(() => dispatch({ kind: "dismiss" }));
    else if (b === "help") dispatch({ kind: "help", open: true });
    else if (b === "unmute") voiceMute(false).catch(() => {});
  };

  return { state, commands, onButton, closeHelp: () => dispatch({ kind: "help", open: false }), speak: voiceSpeak };
}
