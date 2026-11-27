// What a surface does after it crashes (docs/FAILSAFE.md §1). Pure, so it is unit-tested.
//
//   1st failure            reload by itself after a short wait
//   2nd failure in a row   a window offers "Reload"; an overlay (nothing to click) waits longer
//                          and reloads once more
//   3rd failure in a row   the surface is off until Lens restarts, and the person is told once

/** Failures closer together than this are "in a row". */
export const ROW_WINDOW_MS = 60_000;
/** A surface that has run this long without failing starts from a clean slate. */
export const HEALTHY_AFTER_MS = 30_000;
export const MAX_IN_A_ROW = 3;
export const FIRST_RELOAD_MS = 800;
export const SECOND_RELOAD_MS = 4000;

export interface FailureRecord {
  count: number;
  lastAt: number;
}

export type Step = { kind: "reload"; afterMs: number } | { kind: "offer" } | { kind: "disabled" };

/**
 * Surfaces with no chrome of their own: click-through or full-screen see-through windows. A
 * crashed one shows nothing (a card in the middle of the screen would be worse than the fault)
 * and its window is hidden so it can never sit on top of the desktop catching clicks.
 */
export const OVERLAY_SURFACES: ReadonlySet<string> = new Set([
  "wallpaper",
  "cursorfx",
  "focusdim",
  "presence",
  "presencebar",
  "voicehud",
  "bubble",
  "magicsearch",
  "edgeshelf",
  "notifications",
  "snip",
  "magic",
  "desktopfolder",
]);

export function isOverlay(surface: string): boolean {
  return OVERLAY_SURFACES.has(surface);
}

export function nextRecord(prev: FailureRecord | null, now: number): FailureRecord {
  if (!prev || !Number.isFinite(prev.count) || !Number.isFinite(prev.lastAt) || now - prev.lastAt > ROW_WINDOW_MS || now < prev.lastAt) {
    return { count: 1, lastAt: now };
  }
  return { count: Math.max(1, Math.floor(prev.count)) + 1, lastAt: now };
}

export function stepFor(count: number, overlay: boolean): Step {
  if (count >= MAX_IN_A_ROW) return { kind: "disabled" };
  if (count <= 1) return { kind: "reload", afterMs: FIRST_RELOAD_MS };
  return overlay ? { kind: "reload", afterMs: SECOND_RELOAD_MS } : { kind: "offer" };
}

/** True when a stored record says the surface already gave up in this session. */
export function isDisabled(record: FailureRecord | null): boolean {
  return !!record && record.count >= MAX_IN_A_ROW;
}

export function parseRecord(raw: string | null): FailureRecord | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<FailureRecord> | null;
    if (v && typeof v.count === "number" && typeof v.lastAt === "number" && v.count > 0) return { count: v.count, lastAt: v.lastAt };
  } catch {
    /* a damaged record is no record */
  }
  return null;
}

/** What the card says for each step. */
export function problemText(step: Step): string {
  if (step.kind === "reload") return "This part of Lens hit a problem. Reloading…";
  if (step.kind === "offer") return "This part of Lens hit a problem.";
  return "This part of Lens keeps hitting a problem. It is off until Lens restarts.";
}

/** Error text safe to send on: a short message and the top of the stack, never more. */
export function describeError(error: unknown): { message: string; stack: string } {
  if (error instanceof Error) {
    return { message: (error.message || error.name || "Error").slice(0, 400), stack: (error.stack || "").split("\n").slice(0, 12).join("\n") };
  }
  let text = String(error);
  if (typeof error !== "string") {
    try {
      const json: unknown = JSON.stringify(error);
      if (typeof json === "string") text = json;
    } catch {
      /* not serialisable: String(error) is what we have */
    }
  }
  return { message: text.slice(0, 400), stack: "" };
}

/** At most `limit` reports per `windowMs`; a page stuck in an error loop must not flood the log. */
export function createRateLimit(limit: number, windowMs: number): (now: number) => boolean {
  let stamps: number[] = [];
  return (now: number) => {
    stamps = stamps.filter((t) => now - t < windowMs);
    if (stamps.length >= limit) return false;
    stamps.push(now);
    return true;
  };
}
