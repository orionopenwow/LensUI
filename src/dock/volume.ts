// Scroll on a Dock icon to change that app's volume (dock.scrollVolume, off by default: it
// changes the app's level in Windows' volume mixer). Pure rules, tested in
// src/__tests__/dockQuickWins.test.ts; hooks/useWheelVolume.ts applies them.
import type { AudioAppSession } from "../types/generated";
import type { RunningWindow } from "../types/lens";
import { normName } from "./model";

/** One wheel notch moves the volume this many points. */
export const VOLUME_STEP = 5;
/** At most one step per this many ms (a precision touchpad sends a stream of small deltas). */
export const VOLUME_STEP_MS = 45;
/** How long the level readout stays after the last step. */
export const VOLUME_READOUT_MS = 1100;
/** Audio sessions are read again after this long without scrolling. */
export const VOLUME_SESSIONS_TTL_MS = 2000;

export type WheelIntent = "volume" | "windows" | null;

/**
 * What a wheel turn over an app does. Volume alone: every turn. Both on: the plain wheel switches
 * windows (it was there first) and Shift+wheel changes the volume.
 */
export function wheelIntent(o: { scrollCycles: boolean; scrollVolume: boolean; shift: boolean }): WheelIntent {
  if (o.scrollVolume && (o.shift || !o.scrollCycles)) return "volume";
  if (o.scrollCycles) return "windows";
  return null;
}

/** One wheel event → -1, 0 or +1 for the volume: up (away from you) is louder. Shift+wheel comes
 *  as a horizontal delta in Chromium, so the larger axis wins. */
export function volumeStepDir(deltaX: number, deltaY: number, lastAt: number, now: number): number {
  if (now - lastAt < VOLUME_STEP_MS) return 0;
  const d = Math.abs(deltaX) > Math.abs(deltaY) ? deltaX : deltaY;
  if (!Number.isFinite(d) || Math.abs(d) < 1) return 0;
  return d < 0 ? 1 : -1;
}

/** The level after one step, kept within 0–100 and on the step grid. */
export function nextVolume(level: number, dir: number): number {
  const base = Number.isFinite(level) ? level : 0;
  if (!dir) return Math.max(0, Math.min(100, Math.round(base)));
  const snapped = dir > 0 ? Math.floor(base / VOLUME_STEP) * VOLUME_STEP + VOLUME_STEP : Math.ceil(base / VOLUME_STEP) * VOLUME_STEP - VOLUME_STEP;
  return Math.max(0, Math.min(100, snapped));
}

/**
 * The audio sessions that belong to an app's Dock icon. Sessions carry a process id and the
 * program's name (Windows' mixer groups by process); windows carry the program file. A browser
 * plays sound from a child process, so the match is by program name, never by window.
 */
export function sessionsForApp(sessions: readonly AudioAppSession[], wins: readonly RunningWindow[], appPath?: string): AudioAppSession[] {
  const names = new Set<string>();
  for (const w of wins) {
    const n = normName(w.processName || "");
    if (n) names.add(n);
  }
  const file = (appPath ?? "").split(/[\\/]/).pop() ?? "";
  if (/\.exe$/i.test(file)) names.add(normName(file));
  if (!names.size) return [];
  return sessions.filter((s) => s.pid !== 0 && names.has(normName(s.name)));
}

/** The level to start from: the loudest of the app's sessions (what you hear). */
export function currentLevel(sessions: readonly AudioAppSession[]): number | null {
  if (!sessions.length) return null;
  return sessions.reduce((m, s) => Math.max(m, s.muted ? 0 : s.volume), 0);
}

/** Spoken and shown text for the readout. */
export function volumeReadout(level: number | null): string {
  return level === null ? "No sound" : `${level}%`;
}
