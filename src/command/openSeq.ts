/**
 * Lens Command "open" events carry a sequence number from the backend (show_command). A window
 * built on first use gets its opening event replayed once it is ready; the replay has the same
 * seq, so it must not be applied again (it would reset what the user has typed since).
 */
export function isNewOpen(lastApplied: number | null, seq: number): boolean {
  return lastApplied === null || seq > lastApplied;
}

/**
 * The ready handshake (docs/brain/BUGS.md B-12): once its listeners are registered the page asks
 * the backend for the open it still has to apply. Only a real open (an object with a numeric
 * `seq`) counts; anything else means there is nothing waiting.
 */
export function pendingOpen<T extends { seq?: number }>(value: T | null | undefined): value is T & { seq: number } {
  return !!value && typeof value === "object" && typeof value.seq === "number" && Number.isFinite(value.seq);
}
