// Things the person does on the Dock (open an app, switch or close a window) say so when they
// fail (B-106). `dockFail("open Spotify")` is the catch handler: it writes the session log like
// every other Dock call, and shows "Couldn't open Spotify." in the Dock's notice (DockNotice.tsx),
// which reads the one toast bus. Background calls keep using `quiet` / `retryOnce`.
import { invoke } from "@tauri-apps/api/core";
import { logFail } from "../failsafe/calls";
import { failText } from "../ui/oops";
import { toast } from "../ui/toastBus";

export const dockFail =
  (what: string) =>
  (e?: unknown): void => {
    logFail("Dock", what)(e);
    toast.error(failText(what, e));
  };

/** Runs a Lens Core command the person asked for; a failure is logged and shown. Never rejects. */
export function dockDo(cmd: string, args: Record<string, unknown> | undefined, what: string): Promise<void> {
  return invoke(cmd, args).then(
    () => undefined,
    dockFail(what),
  );
}

/** A short app name for a notice: "Spotify", not "C:\…\Spotify.exe". */
export function appLabel(nameOrPath: string | undefined | null): string {
  const base = (nameOrPath ?? "").split(/[\\/]/).pop() ?? "";
  return base.replace(/\.(exe|lnk|url)$/i, "").trim() || "that app";
}
