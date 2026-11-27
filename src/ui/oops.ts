// Failures on things you asked for say so (B-18). `oops("load history")` is a catch handler that
// shows "Couldn't load history." on the window's toast; `quiet` marks the few background calls
// (layout reports, polls, refreshes) where the next one simply tries again.
import { toast } from "./toastBus";

/** "Couldn't <what>." plus the reason when Lens Core gave a short, plain one. */
export function failText(what: string, e?: unknown): string {
  const base = `Couldn't ${what}.`;
  const why = String(e ?? "").replace(/^Error:\s*/, "").trim();
  // Only sentences meant for people: no codes, paths, stack traces or long dumps.
  const plain = why.length > 0 && why.length <= 90 && /^[A-Z]/.test(why) && !/[{}<>\\]|\bat \w+\.|0x[0-9a-f]+|undefined|null|\bError\b/i.test(why);
  return plain ? `${base} ${why.replace(/[.!]*$/, ".")}` : base;
}

/** A failure that has already been shown once. It reads like the original (`String(e)`). */
export class ReportedError extends Error {
  constructor(readonly original: unknown) {
    super(String(original ?? "").replace(/^Error:\s*/, ""));
    this.name = "ReportedError";
  }
  toString(): string {
    return this.message;
  }
}

/** Marks a failure as shown, so a caller further up that also catches it doesn't say it twice. */
export const markReported = (e: unknown): ReportedError => (e instanceof ReportedError ? e : new ReportedError(e));
export const isReported = (e: unknown): boolean => e instanceof ReportedError;

/** Catch handler for a user action: `void bookmarkRemove(id).then(onView).catch(oops("remove the bookmark"))`. */
export const oops = (what: string) => (e?: unknown): void => {
  if (isReported(e)) return;
  toast.error(failText(what, e));
};

/** Catch handler for background work that retries by itself. Not for anything the person clicked. */
export const quiet = (): void => {};
