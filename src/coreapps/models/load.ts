// The loading / empty / error / ready state every core app screen goes through. Pure.

export type LoadStatus = "loading" | "ready" | "empty" | "error";

export interface Load<T> {
  status: LoadStatus;
  data: T | null;
  error: string | null;
}

export type LoadEvent<T> = { type: "start" } | { type: "ok"; data: T; empty?: boolean } | { type: "fail"; error: string };

/**
 * A reload keeps the data on screen (no flash back to the skeleton); a failed reload keeps the
 * last good data and shows the error beside it.
 */
export function loadReducer<T>(s: Load<T>, e: LoadEvent<T>): Load<T> {
  switch (e.type) {
    case "start":
      return s.data == null && s.status !== "empty" ? { status: "loading", data: null, error: null } : s;
    case "ok":
      return { status: e.empty ? "empty" : "ready", data: e.data, error: null };
    case "fail":
      return { status: s.data == null ? "error" : s.status, data: s.data, error: friendlyError(e.error) };
  }
}

/** Backend errors arrive as strings, sometimes wrapped; show the sentence, not the plumbing. */
export function friendlyError(raw: string): string {
  const s = String(raw ?? "").replace(/^Error:\s*/i, "").trim();
  if (!s) return "Something went wrong.";
  if (/command .* not found|not allowed|ipc/i.test(s)) return "This needs the Lens desktop app.";
  return s.length > 220 ? `${s.slice(0, 217)}…` : s;
}
