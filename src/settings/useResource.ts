import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { quiet } from "../ui/oops";

export interface Resource<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
  /** Optimistic local update. */
  set: (next: T) => void;
  /**
   * Takes a backend reply as the new state only when it is one (B-40). A command that answers
   * with nothing, or with a different shape, keeps what is shown, so the rows (and the switch
   * that has keyboard focus) stay mounted instead of vanishing until the next reload.
   */
  adopt: (reply: unknown) => void;
}

/** Pure: the state to show after a backend reply. Replies that aren't a state keep the current one. */
export function adoptReply<T>(current: T | null, reply: unknown): T | null {
  if (reply === null || reply === undefined) return current;
  if (current === null) return reply as T;
  if (Array.isArray(current) !== Array.isArray(reply)) return current;
  if (typeof current !== typeof reply) return current;
  return reply as T;
}

/**
 * Loads a backend command, reloads on the given events (no polling unless `pollMs` is set),
 * and exposes loading / error states.
 */
export function useResource<T>(
  command: string,
  args: Record<string, unknown> = {},
  opts: { events?: string[]; pollMs?: number; enabled?: boolean } = {}
): Resource<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const argsKey = JSON.stringify(args);
  const alive = useRef(true);

  const reload = useCallback(() => {
    if (opts.enabled === false) return;
    setLoading(true);
    invoke<T>(command, JSON.parse(argsKey))
      .then((d) => {
        if (!alive.current) return;
        setData(d);
        setError(null);
      })
      .catch((e) => alive.current && setError(String(e)))
      .finally(() => alive.current && setLoading(false));
  }, [command, argsKey, opts.enabled]);

  useEffect(() => {
    alive.current = true;
    reload();
    const unlisten = (opts.events ?? []).map((ev) => listen(ev, () => reload()));
    // Settings is a popout: refresh whenever it's shown again instead of polling in the background.
    const onFocus = () => document.visibilityState === "visible" && reload();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    const t = opts.pollMs ? window.setInterval(() => document.visibilityState === "visible" && reload(), opts.pollMs) : undefined;
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      alive.current = false;
      unlisten.forEach((p) => p.then((fn) => fn()).catch(quiet));
      if (t) window.clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload, (opts.events ?? []).join(","), opts.pollMs]);

  const adopt = useCallback((reply: unknown) => setData((cur) => adoptReply<T>(cur, reply)), []);
  return { data, error, loading, reload, set: setData, adopt };
}

/**
 * Optimistic change: show `next` immediately, call the backend, and roll back with a readable
 * error if Windows refuses.
 */
export async function optimistic<T>(
  current: T,
  next: T,
  apply: (v: T) => void,
  action: () => Promise<unknown>,
  onError: (msg: string) => void,
  what: string
): Promise<boolean> {
  apply(next);
  try {
    await action();
    return true;
  } catch (e) {
    apply(current);
    onError(`Couldn't change ${what}: ${String(e).replace(/^Error:\s*/, "")}`);
    return false;
  }
}

export const fmtBytes = (n: number) => {
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  const u = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  const v = n / 1024 ** i;
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${u[i]}`;
};
