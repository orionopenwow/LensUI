// Calls from the Dock and the pop-outs that must not fail silently (B-18, Dock and surfaces share).
//
// `.catch(() => {})` used to hide every failure. Three kinds of call are told apart here:
//   * a call that keeps a window and Lens Core in step (close a pop-out, tell the watcher a menu
//     closed): tried once more after a moment, then logged, so one refused call can't leave a
//     pop-out open or the Dock held up (`retryOnce`, `hideSurface`);
//   * something the person asked for (open an app, play/pause): logged with what was being done
//     (`logFail`), so the session log says why the click did nothing;
//   * background reports the next tick repeats (layout rects, polls): `quiet`, on purpose.
// Everything is logged through the failsafe reporter (session log and lens.log on this PC).
import { invoke } from "@tauri-apps/api/core";
import { describeError } from "./policy";
import { reportProblem } from "./report";

type Report = (level: "error" | "warn", error: unknown) => void;
let report: Report = reportProblem;

/** Tests swap the reporter; returns the previous one. */
export function setCallReporter(next: Report): Report {
  const prev = report;
  report = next;
  return prev;
}

/** "Dock: couldn't open the app (it was closed)." */
export function failLine(where: string, what: string, e?: unknown): string {
  const why = e === undefined || e === null ? "" : describeError(e).message.trim();
  return `${where}: couldn't ${what}${why ? ` (${why})` : ""}.`;
}

/** Catch handler for something the person asked for: logged with what was being done. */
export const logFail =
  (where: string, what: string) =>
  (e?: unknown): void => {
    report("warn", failLine(where, what, e));
  };

/** Catch handler for background work that the next tick repeats. Not for anything clicked. */
export const quiet = (): void => {};

/** Default pause before the one retry, in ms. */
export const RETRY_AFTER_MS = 120;

/**
 * Runs `call`; if it fails, waits `delayMs` and runs it once more. Logs when the retry was needed
 * and when it failed too. Resolves to whether the call worked in the end; never rejects.
 */
export async function retryOnce(call: () => Promise<unknown>, where: string, what: string, delayMs = RETRY_AFTER_MS): Promise<boolean> {
  try {
    await call();
    return true;
  } catch (first) {
    await new Promise((r) => setTimeout(r, delayMs));
    try {
      await call();
      report("warn", `${failLine(where, what, first)} It worked on the second try.`);
      return true;
    } catch (again) {
      report("error", `${failLine(where, what, again)} Tried twice.`);
      return false;
    }
  }
}

/** Closes a Lens window (pop-out, flyout), retrying once so a refused hide can't leave it open. */
export function hideSurface(label: string, where = label): Promise<boolean> {
  return retryOnce(() => invoke("hide_surface", { label }), where, `close ${label}`);
}

/** Tells the watcher whether a Dock menu is open; retried, since a lost "closed" holds the Dock up. */
export function setDockMenuOpen(open: boolean): Promise<boolean> {
  return retryOnce(() => invoke("set_dock_menu_open", { open }), "Dock", open ? "report an open menu" : "report a closed menu");
}
