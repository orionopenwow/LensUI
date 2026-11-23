// The "conversation" window: conversation mode as a large panel or full screen.
// Window config and show/hide wiring: docs/VOICE.md › Conversation mode.

import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useLensState } from "../hooks/useLensState";
import { Conversation } from "../voice/Conversation";
import { useConversation } from "../voice/useConversation";

export function ConversationSurface() {
  useLensState(); // theme tokens
  const c = useConversation(() => {
    getCurrentWindow()
      .hide()
      .catch(() => {});
  });
  useEffect(() => {
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
  }, []);
  if (!c.state.open) return null;
  return (
    <Conversation
      state={c.state}
      view={c.view}
      levels={c.levels}
      elapsedMs={c.elapsedMs}
      reducedMotion={c.reducedMotion}
      onMute={c.toggleMute}
      onStop={c.stop}
      onClose={c.close}
    />
  );
}
