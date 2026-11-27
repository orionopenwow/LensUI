// Which body the Dock hover card gets (src/dock/DockHoverCard.tsx). Pure, so the rule is tested
// without React (src/__tests__/dockQuickWins.test.ts).
//
// With live previews on, two or more windows get the window carousel; past MANY_WINDOWS the
// carousel's dots and one-at-a-time pictures stop being quick to scan, so by default the card
// lists the windows' titles instead (`dock.manyWindows`: "list", or "previews" to keep the
// carousel). Live previews off: always the titles list.
import type { DockCardMode } from "./DockHoverCard";

/** More windows than this and the card shows titles (unless the person chose previews). */
export const MANY_WINDOWS = 4;

export type ManyWindowsView = "list" | "previews";

export const MANY_WINDOWS_CHOICES: { id: ManyWindowsView; label: string }[] = [
  { id: "list", label: "Titles list" },
  { id: "previews", label: "Previews" },
];

/** Anything but "previews" is the default, the titles list. */
export const normalizeManyWindows = (raw: unknown): ManyWindowsView => (raw === "previews" ? "previews" : "list");

export interface CardModeInput {
  isSpotify: boolean;
  livePreviews: boolean;
  windows: number;
  manyWindows?: unknown;
}

export function pickCardMode(i: CardModeInput): DockCardMode {
  if (i.isSpotify) return "spotify";
  if (!i.livePreviews) return "list";
  if (i.windows > MANY_WINDOWS && normalizeManyWindows(i.manyWindows) === "list") return "list";
  return i.windows >= 2 ? "carousel" : "strip";
}
