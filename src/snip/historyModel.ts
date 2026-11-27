// The snip library's small pure parts: answers that arrive out of order, and deleting with a
// few seconds to change your mind.

/** Hands out a ticket per request; only the newest ticket's answer may be shown (B-119). */
export function latestOnly() {
  let seq = 0;
  return {
    next: () => ++seq,
    isCurrent: (ticket: number) => ticket === seq,
  };
}

/** How long a removed snip can be brought back before it is really deleted. */
export const UNDO_MS = 5000;

export interface PendingDeletes {
  /** Ids hidden from the grid and waiting to be deleted. */
  ids: string[];
}

export const NO_PENDING: PendingDeletes = { ids: [] };

export function queueDelete(p: PendingDeletes, id: string): PendingDeletes {
  return p.ids.includes(id) ? p : { ids: [...p.ids, id] };
}

/** Undo brings back everything that is still waiting. */
export function undoDeletes(_p: PendingDeletes): PendingDeletes {
  return NO_PENDING;
}

export function withoutPending<T extends { id: string }>(items: readonly T[], p: PendingDeletes): T[] {
  return p.ids.length ? items.filter((i) => !p.ids.includes(i.id)) : [...items];
}

/** "Removed 2 snips from history." */
export function removedLine(n: number): string {
  return n === 1 ? "Removed from history." : `Removed ${n} snips from history.`;
}
