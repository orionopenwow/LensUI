// Hover timing and window switching for Dock icons and their hover card (docs/DOCK_SMOOTHNESS.md).
// Pure, so the rules that keep the card usable are tested without a Dock.
import type { RunningWindow } from "../types/lens";

/** A card opens when the pointer rests on an icon this long, not on every icon it crosses. */
export const HOVER_INTENT_MS = 90;
/** Once a card is showing, or closed this recently, the next icon's card opens at once. */
export const HOVER_WARM_MS = 350;
/**
 * How long the card stays after the pointer leaves the icon or the card. Long enough to cross the
 * gap to the card on a slow or diagonal path (and the same grace the native previews get,
 * PREVIEW_LEAVE_GRACE_MS in src-tauri/src/win_previews.rs), short enough to feel immediate.
 */
export const HOVER_CLOSE_MS = 260;

/**
 * Which window a click on an app's Dock icon goes to.
 *
 * - One window, or none of the app's windows in front: its main window (the backend focuses it,
 *   restoring it if minimized, or minimizes it when it is already in front).
 * - Several windows and one of them in front: the next one, so repeated clicks walk through them
 *   (the same as Alt+number). Minimizing only the front one used to leave the others in the way.
 */
export function activationTarget(wins: readonly RunningWindow[], primary: RunningWindow | undefined): number | null {
  if (!primary) return null;
  const focused = wins.findIndex((w) => w.isFocused);
  if (wins.length > 1 && focused >= 0) return wins[(focused + 1) % wins.length].hwnd;
  return primary.hwnd;
}
