// When a focus loss closes the Magic Dashboard (kept pure so it can be tested without Tauri).

/** How long after opening a focus loss is ignored. While the window is shown and its page is
 *  still painting, Windows can report it unfocused, and the window that opened it (Command) can
 *  take the focus back as it hides; neither is the person clicking away. */
export const OPEN_GRACE_MS = 500;

/** Whether a focus loss should close the Dashboard right away: not during the grace after opening,
 *  and not before the first paint. A loss inside the grace is decided when the grace ends: if the
 *  focus hasn't come back by then, the Dashboard closes. */
export function blurCloses(now: number, openedAt: number, painted: boolean): boolean {
  return painted && now - openedAt >= OPEN_GRACE_MS;
}
