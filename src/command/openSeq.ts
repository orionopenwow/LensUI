/**
 * Lens Command "open" events carry a sequence number from the backend (show_command). A window
 * built on first use gets its opening event replayed once it is ready; the replay has the same
 * seq, so it must not be applied again (it would reset what the user has typed since).
 */
export function isNewOpen(lastApplied: number | null, seq: number): boolean {
  return lastApplied === null || seq > lastApplied;
}
