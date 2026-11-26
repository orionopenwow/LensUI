// Lens Studio v2 drafts (docs/plans/MAGIC_WAVES.md §4). Edits happen on a draft with undo and
// redo; nothing reaches the live config until Apply, and Apply goes through the single settings
// writer. Pure and generic so the Dock, Theme and Desktop workspaces share it.

export type Workspace = "dock" | "theme" | "desktop";

export interface Draft<T> {
  /** The value when the studio opened (or after the last Apply). */
  base: T;
  /** Past values, oldest first. */
  past: T[];
  present: T;
  /** Undone values, most recent first. */
  future: T[];
}

export const MAX_HISTORY = 100;

export function open<T>(value: T): Draft<T> {
  return { base: value, past: [], present: value, future: [] };
}

/** Records a change. A change equal to the present (by JSON) is ignored, so no empty undo steps. */
export function edit<T>(d: Draft<T>, next: T): Draft<T> {
  if (JSON.stringify(next) === JSON.stringify(d.present)) return d;
  const past = [...d.past, d.present].slice(-MAX_HISTORY);
  return { ...d, past, present: next, future: [] };
}

export function undo<T>(d: Draft<T>): Draft<T> {
  if (d.past.length === 0) return d;
  const prev = d.past[d.past.length - 1];
  return { ...d, past: d.past.slice(0, -1), present: prev, future: [d.present, ...d.future] };
}

export function redo<T>(d: Draft<T>): Draft<T> {
  if (d.future.length === 0) return d;
  const [next, ...rest] = d.future;
  return { ...d, past: [...d.past, d.present], present: next, future: rest };
}

export function canUndo<T>(d: Draft<T>): boolean {
  return d.past.length > 0;
}

export function canRedo<T>(d: Draft<T>): boolean {
  return d.future.length > 0;
}

/** True when the draft differs from where it started. */
export function dirty<T>(d: Draft<T>): boolean {
  return JSON.stringify(d.present) !== JSON.stringify(d.base);
}

/** Back to where the studio started; the discarded state can be redone. */
export function revert<T>(d: Draft<T>): Draft<T> {
  return dirty(d) ? edit(d, d.base) : d;
}

/** After a successful Apply the present becomes the new base; history is kept. */
export function applied<T>(d: Draft<T>): Draft<T> {
  return { ...d, base: d.present };
}
