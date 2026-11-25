// Lens updates as every window sees them (backend: src-tauri/src/win_update.rs). Pure, so the
// state rules are unit-tested (src/__tests__/update.test.ts).
import type { UpdateStatus } from "../types/generated";

export type { UpdateStatus };

export type UpdateState =
  | "idle"
  | "not-configured"
  | "up-to-date"
  | "available"
  | "downloading"
  | "ready"
  | "installing"
  | "error";

export const IDLE: UpdateStatus = { state: "idle", currentVersion: "", newVersion: null, notes: null, message: "" };

/** Same rule as `win_update::may_replace`: a ready update is never hidden by a later check. */
export function mayReplace(prev: string, next: string): boolean {
  if (prev === "ready") return next === "ready" || next === "installing" || next === "error";
  if (prev === "installing") return next === "error";
  return true;
}

/** Applies an incoming status (event or command result) to the one a window holds. */
export function applyStatus(prev: UpdateStatus, next: UpdateStatus): UpdateStatus {
  return mayReplace(prev.state, next.state) ? next : prev;
}

export interface UpdateView {
  /** Top Bar pill text, or null when there is nothing to say. */
  pill: string | null;
  /** What clicking the pill (or Enter on `/update`) does. */
  action: "restart" | "download" | "open" | "none";
  busy: boolean;
}

export function viewOf(s: UpdateStatus): UpdateView {
  const v = s.newVersion ? ` ${s.newVersion}` : "";
  switch (s.state) {
    case "ready":
      return { pill: "Restart to update", action: "restart", busy: false };
    case "available":
      return { pill: `Lens${v} available`, action: "open", busy: false };
    case "downloading":
      return { pill: `Downloading${v}…`, action: "open", busy: true };
    case "installing":
      return { pill: "Updating…", action: "none", busy: true };
    default:
      return { pill: null, action: "open", busy: false };
  }
}

/** The release notes as short paragraphs and bullet lines for the "What's new" sheet. */
export function notesLines(notes: string | null | undefined, max = 40): string[] {
  if (!notes) return [];
  return notes
    .split(/\r?\n/)
    .map((l) => l.replace(/^#+\s*/, "").replace(/\*\*/g, "").trimEnd())
    .filter((l, i, all) => l.trim() !== "" || (i > 0 && all[i - 1].trim() !== ""))
    .slice(0, max);
}
