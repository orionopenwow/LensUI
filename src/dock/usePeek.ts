import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";

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
      .catch(() => {});
    return () => {
      alive = false;
      if (peekTimer.current) window.clearTimeout(peekTimer.current);
      invoke("end_peek_cmd").catch(() => {});
    };
  }, []);
  const startPeek = (hwnd: number) => {
    if (peekDelay.current === null) return;
    if (peekTimer.current) window.clearTimeout(peekTimer.current);
    peekTimer.current = window.setTimeout(
      () => invoke("peek_window_cmd", { hwnd, durationMs: 4000 }).catch(() => {}),
      peekDelay.current
    );
  };
  const endPeek = () => {
    if (peekTimer.current) window.clearTimeout(peekTimer.current);
    peekTimer.current = null;
    if (peekDelay.current !== null) invoke("end_peek_cmd").catch(() => {});
  };
  return { startPeek, endPeek };
}
