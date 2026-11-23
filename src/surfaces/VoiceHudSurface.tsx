// The "voicehud" window: a transparent, always-on-top strip above the Dock (or under the Top
// Bar) that hosts the voice HUD. Window config and show/hide wiring: docs/VOICE.md.

import { useEffect } from "react";
import { useLensState } from "../hooks/useLensState";
import { VoiceHud } from "../voice/VoiceHud";
import { useVoiceHud } from "../voice/useVoiceHud";

export function VoiceHudSurface() {
  useLensState(); // theme tokens
  const { state, commands, onButton, closeHelp } = useVoiceHud();
  useEffect(() => {
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeHelp();
        onButton("cancel");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <VoiceHud state={state} commands={commands} onButton={onButton} onCloseHelp={closeHelp} />;
}
