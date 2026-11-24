// One reporter for everything a page can get wrong (docs/FAILSAFE.md §1): crashes caught by the
// surface boundary, uncaught errors and unhandled promise rejections. Everything lands in the
// session log and lens.log on this PC; nothing is uploaded.
import { invoke } from "@tauri-apps/api/core";
import { createRateLimit, describeError, parseRecord, type FailureRecord } from "./policy";

const allow = createRateLimit(12, 10_000);

const key = (surface: string) => `lens.failsafe.${surface}`;

export function readRecord(surface: string): FailureRecord | null {
  try {
    return parseRecord(window.sessionStorage.getItem(key(surface)));
  } catch {
    return null;
  }
}

export function writeRecord(surface: string, record: FailureRecord | null): void {
  try {
    if (record) window.sessionStorage.setItem(key(surface), JSON.stringify(record));
    else window.sessionStorage.removeItem(key(surface));
  } catch {
    /* storage can be unavailable; the boundary still works, it just cannot count across reloads */
  }
}

/** The surface crashed and its boundary caught it. */
export function reportCrash(surface: string, error: unknown, disabled: boolean): void {
  const { message, stack } = describeError(error);
  invoke("failsafe_ui_crash", { surface, message, stack, disabled }).catch(() => {});
}

/** Something went wrong that did not take the surface down. */
export function reportProblem(level: "error" | "warn", error: unknown): void {
  if (!allow(Date.now())) return;
  const { message } = describeError(error);
  invoke("tester_log_push", { level, area: "ui", message }).catch(() => {});
}

/** Routes uncaught errors and unhandled rejections to the reporter. Call once per window. */
export function installGlobalHandlers(): void {
  window.addEventListener("error", (e) => reportProblem("error", e.error ?? e.message));
  window.addEventListener("unhandledrejection", (e) => reportProblem("warn", e.reason));
}
