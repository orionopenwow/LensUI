// Failures on things you asked for say so (B-18). `oops("load history")` is a catch handler that
// shows "Couldn't load history." in the browser's toast; `quiet` marks the few background calls
// (layout reports, polls, refreshes) where the next one simply tries again.
import { toast } from "../ui/toastBus";

/** "Couldn't <what>." plus the reason when Lens Core gave a short, plain one. */
export function failText(what: string, e?: unknown): string {
  const base = `Couldn't ${what}.`;
  const why = String(e ?? "").replace(/^Error:\s*/, "").trim();
  // Only sentences meant for people: no codes, paths, stack traces or long dumps.
  const plain = why.length > 0 && why.length <= 90 && /^[A-Z]/.test(why) && !/[{}<>\\]|\bat \w+\.|0x[0-9a-f]+|undefined|null|\bError\b/i.test(why);
  return plain ? `${base} ${why.replace(/[.!]*$/, ".")}` : base;
}

/** Catch handler for a user action: `void bookmarkRemove(id).then(onView).catch(oops("remove the bookmark"))`. */
export const oops = (what: string) => (e?: unknown): void => {
  toast.error(failText(what, e));
};

/** Catch handler for background work that retries by itself. Not for anything the person clicked. */
export const quiet = (): void => {};
