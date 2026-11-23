// The Top Bar search bubble as a small state machine, so rapid clicks, focus changes and events
// from the watcher can't leave it half open. closed → opening → open → closing → closed.
// `effect` says what the caller must do: tell the backend to open or close the palette.

export type SearchPhase = "closed" | "opening" | "open" | "closing";
export type SearchEvent =
  | "request-open" // click on the bubble, focus on its input
  | "opened" // the open animation finished
  | "request-close" // Esc, the ESC button, Enter (after submit)
  | "closed" // the close animation finished
  | "backend-open" // lens://topbar-search-open true
  | "backend-close"; // lens://topbar-search-open false (watcher closed it: click outside, focus elsewhere)

export type SearchEffect = "sync-open" | "sync-close" | null;

export function searchStep(phase: SearchPhase, ev: SearchEvent): { phase: SearchPhase; effect: SearchEffect } {
  switch (ev) {
    case "request-open":
      if (phase === "open" || phase === "opening") return { phase, effect: null };
      return { phase: "opening", effect: "sync-open" };
    case "opened":
      return { phase: phase === "opening" ? "open" : phase, effect: null };
    case "request-close":
      if (phase === "closed" || phase === "closing") return { phase, effect: null };
      return { phase: "closing", effect: "sync-close" };
    case "closed":
      return { phase: phase === "closing" ? "closed" : phase, effect: null };
    case "backend-open":
      return { phase: phase === "closed" || phase === "closing" ? "opening" : phase, effect: null };
    case "backend-close":
      // The backend already closed the palette: animate out without echoing a close back.
      return { phase: phase === "closed" ? "closed" : "closing", effect: null };
  }
}

/** True while the bubble should render expanded (it stays expanded through the close animation's start). */
export const isExpanded = (p: SearchPhase) => p === "opening" || p === "open";
