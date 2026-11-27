import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { logFail, quiet, retryOnce } from "../failsafe/calls";

/** Ends a peek. Retried: a lost "end" would leave the screen dimmed until the peek times out. */
const endPeekNow = () => void retryOnce(() => invoke("end_peek_cmd"), "Dock", "end the window peek");

/**
 * Hover peek (window styling, docs/WINDOW_STYLING.md §1): after resting on a window preview, show
 * that window over a dimmed screen; ends on leave. Previews themselves are opt-in, and peek needs
 * the overlay support that only Windows has. Shared by the preview strip and the window carousel.
 */
export function useWindowPeek() {
  const peekDelay = useRef<number | null>(null);
  const peekTimer = useRef<number | null>(null);
  useEffect(() => {
    let alive = true;
    invoke<{ settings?: { peekDelayMs?: number }; caps?: { overlays?: boolean } }>("get_window_styling_cmd")
      .then((st) => {
        if (alive && st?.caps?.overlays) peekDelay.current = Math.max(200, st.settings?.peekDelayMs ?? 600);
      })
      // No answer means no peek (the capability is asked again on the next mount).
      .catch(quiet);
    return () => {
      alive = false;
      if (peekTimer.current) window.clearTimeout(peekTimer.current);
      endPeekNow();
    };
  }, []);
  const startPeek = (hwnd: number) => {
    if (peekDelay.current === null) return;
    if (peekTimer.current) window.clearTimeout(peekTimer.current);
    peekTimer.current = window.setTimeout(
      () => invoke("peek_window_cmd", { hwnd, durationMs: 4000 }).catch(logFail("Dock", "peek at the window")),
      peekDelay.current
    );
  };
  const endPeek = () => {
    if (peekTimer.current) window.clearTimeout(peekTimer.current);
    peekTimer.current = null;
    if (peekDelay.current !== null) endPeekNow();
  };
  return { startPeek, endPeek };
}
