import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { loadReducer, type Load } from "../models/load";
import { quiet } from "../../ui/oops";

/** True while the window is visible. Every poll in the core apps stops while it's false. */
export function useVisible(): boolean {
  const [v, setV] = useState(() => typeof document === "undefined" || document.visibilityState !== "hidden");
  useEffect(() => {
    const on = () => setV(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);
  return v;
}

/** Calls `fn` now and every `ms` while the window is visible; never while hidden. */
export function useVisiblePoll(fn: () => void, ms: number, enabled = true) {
  const visible = useVisible();
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!visible || !enabled || ms <= 0) return;
    ref.current();
    const t = window.setInterval(() => ref.current(), ms);
    return () => window.clearInterval(t);
  }, [visible, enabled, ms]);
}

/**
 * Loads a backend command into a loading / ready / empty / error state. `isEmpty` decides the
 * empty state. Reloads on `events` and when the window becomes visible again.
 */
export function useLoad<T>(
  command: string,
  args: Record<string, unknown> = {},
  opts: { isEmpty?: (d: T) => boolean; events?: string[]; pollMs?: number; enabled?: boolean } = {}
): Load<T> & { reload: () => void; set: (d: T) => void } {
  const [state, setState] = useState<Load<T>>({ status: opts.enabled === false ? "ready" : "loading", data: null, error: null });
  const key = JSON.stringify(args);
  const isEmpty = useRef(opts.isEmpty);
  isEmpty.current = opts.isEmpty;
  const reload = useCallback(() => {
    if (opts.enabled === false) return;
    setState((s) => loadReducer(s, { type: "start" }));
    invoke<T>(command, JSON.parse(key))
      .then((d) => setState((s) => loadReducer(s, { type: "ok", data: d, empty: isEmpty.current ? isEmpty.current(d) : false })))
      .catch((e) => setState((s) => loadReducer(s, { type: "fail", error: String(e) })));
  }, [command, key, opts.enabled]);
  const visible = useVisible();
  useEffect(() => {
    if (visible && !opts.pollMs) reload();
  }, [reload, visible, opts.pollMs]);
  useVisiblePoll(reload, opts.pollMs ?? 0, !!opts.pollMs);
  const events = (opts.events ?? []).join(",");
  useEffect(() => {
    if (!events) return;
    const un = events.split(",").map((e) => listen(e, () => reload()));
    // Unsubscribing while the window closes: nothing to tell anyone.
    return () => un.forEach((p) => p.then((f) => f()).catch(quiet));
  }, [events, reload]);
  const set = useCallback((d: T) => setState((s) => loadReducer(s, { type: "ok", data: d, empty: isEmpty.current ? isEmpty.current(d) : false })), []);
  return { ...state, reload, set };
}

/** The document's shape style ("classic" | "expressive" | "dotmatrix"), live. */
export function useShape(): string {
  const read = () => (typeof document === "undefined" ? "classic" : document.documentElement.dataset.shape || "classic");
  const [shape, setShape] = useState(read);
  useEffect(() => {
    const mo = new MutationObserver(() => setShape(read()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-shape"] });
    return () => mo.disconnect();
  }, []);
  return shape;
}

/** Local persisted value (per window), with a safe fallback when storage is unavailable. */
export function useStored<T>(key: string, initial: T): [T, (v: T | ((p: T) => T)) => void] {
  const [v, setV] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(`lens.coreapps.${key}`);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  const set = useCallback(
    (next: T | ((p: T) => T)) =>
      setV((prev) => {
        const val = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
        try {
          localStorage.setItem(`lens.coreapps.${key}`, JSON.stringify(val));
        } catch {
          /* storage full or blocked: keep it in memory */
        }
        return val;
      }),
    [key]
  );
  return [v, set];
}
