// Recording: the pure parts.

/** Trim bounds in seconds from what was typed: inside the recording, start before end. */
export function trimRange(start: string, end: string, lengthMs: number): { start: number; end: number } | null {
  const len = Math.max(0, lengthMs / 1000);
  const s = Math.max(0, Number(start) || 0);
  const e = Math.min(len || Infinity, Number(end) || len);
  return Number.isFinite(e) && e - s >= 0.1 ? { start: s, end: e } : null;
}
