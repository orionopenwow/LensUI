/**
 * Apps asking for attention (Windows `FlashWindowEx` / taskbar flash) — the Dock's side of the
 * contract. The backend emits one event per change; this module keeps the current set and tells
 * Dock and Top Bar renderers which app keys are urgent.
 *
 * Contract (docs/DOCK_SMOOTHNESS.md › Attention):
 *   event   "dock:attention"
 *   payload { appId: string; active: boolean; count?: number; hwnd?: number }
 *     appId   lower-case executable name ("discord.exe") or full exe path; either matches.
 *     active  true when the app starts asking, false when it stops (or its window is activated).
 *     count   optional number of pending requests (shown as a badge when > 1).
 *     hwnd    optional window handle that asked.
 * The renderers also clear an app as soon as one of its windows is focused, so a missing
 * "active: false" from the backend can never leave a Dock icon urgent forever.
 */
import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";

export const ATTENTION_EVENT = "dock:attention";

export interface AttentionPayload {
  appId: string;
  active: boolean;
  count?: number;
  hwnd?: number;
}

export interface AttentionEntry {
  /** Pending requests (at least 1). */
  count: number;
  /** performance.now() when it started: a renderer bounces once per start. */
  since: number;
  hwnds: number[];
}

export type AttentionMap = ReadonlyMap<string, AttentionEntry>;

/** "C:\\Apps\\Discord\\Discord.exe" and "discord.exe" both become "discord.exe"; "Discord" → "discord.exe". */
export function attentionKey(idOrPath: string | undefined | null): string {
  if (!idOrPath) return "";
  const base = idOrPath.trim().split(/[\\/]/).pop() ?? "";
  const lower = base.toLowerCase();
  if (!lower) return "";
  return lower.endsWith(".exe") ? lower : `${lower}.exe`;
}

/** Pure reducer (unit-tested): applies one event to the current map. */
export function applyAttention(map: AttentionMap, p: AttentionPayload, now: number): Map<string, AttentionEntry> {
  const next = new Map(map);
  const key = attentionKey(p?.appId);
  if (!key) return next;
  if (!p.active) {
    next.delete(key);
    return next;
  }
  const prev = next.get(key);
  const hwnds = prev ? [...prev.hwnds] : [];
  if (typeof p.hwnd === "number" && !hwnds.includes(p.hwnd)) hwnds.push(p.hwnd);
  next.set(key, {
    count: Math.max(1, Math.floor(p.count ?? (prev ? prev.count : 1))),
    since: prev ? prev.since : now,
    hwnds,
  });
  return next;
}

/** Clears every app whose window is now focused (activation ends the request, as on Windows). */
export function clearFocused(map: AttentionMap, focused: { processName?: string; exePath?: string; hwnd?: number }[]): Map<string, AttentionEntry> {
  if (!map.size || !focused.length) return map as Map<string, AttentionEntry>;
  let next: Map<string, AttentionEntry> | null = null;
  for (const w of focused) {
    for (const k of [attentionKey(w.exePath), attentionKey(w.processName)]) {
      if (k && (next ?? map).has(k)) {
        next = next ?? new Map(map);
        next.delete(k);
      }
    }
    if (typeof w.hwnd === "number") {
      for (const [k, e] of next ?? map) {
        if (e.hwnds.includes(w.hwnd)) {
          next = next ?? new Map(map);
          next.delete(k);
        }
      }
    }
  }
  return next ?? (map as Map<string, AttentionEntry>);
}

/** The entry for an app, matched by any of its names (exe path, process name, pinned name). */
export function attentionFor(map: AttentionMap, ...names: (string | undefined | null)[]): AttentionEntry | undefined {
  if (!map.size) return undefined;
  for (const n of names) {
    const e = map.get(attentionKey(n));
    if (e) return e;
  }
  return undefined;
}

/** Listens for the backend's attention events. `focusedWindows` clears apps as they are activated. */
export function useAttention(focusedWindows: { processName?: string; exePath?: string; hwnd?: number; isFocused?: boolean }[]): AttentionMap {
  const [map, setMap] = useState<Map<string, AttentionEntry>>(() => new Map());
  useEffect(() => {
    let off: (() => void) | undefined;
    let alive = true;
    listen<AttentionPayload>(ATTENTION_EVENT, (e) => setMap((m) => applyAttention(m, e.payload, performance.now())))
      .then((fn) => {
        if (alive) off = fn;
        else fn();
      })
      .catch(() => {});
    return () => {
      alive = false;
      off?.();
    };
  }, []);
  const focusSig = focusedWindows.filter((w) => w.isFocused).map((w) => `${w.hwnd}:${w.processName}`).join("|");
  useEffect(() => {
    const focused = focusedWindows.filter((w) => w.isFocused);
    if (focused.length) setMap((m) => clearFocused(m, focused));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusSig]);
  return map;
}
