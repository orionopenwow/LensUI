// Real site icons: the core fetches them (src-tauri/src/browser/icons.rs) and hands the frame
// data URLs. The frame never loads a remote image; anything that isn't a data:image URL is ignored.
import { useSyncExternalStore } from "react";
import { listen } from "@tauri-apps/api/event";
import { EVT_BROWSER_ICONS, favicons } from "./api";
import { quiet } from "./oops";

let icons: Record<string, string> = {};
const subs = new Set<() => void>();
let started = false;

const safe = (v: unknown): v is string => typeof v === "string" && /^data:image\/(png|x-icon|gif|jpeg|webp|svg\+xml);base64,[a-z0-9+/=]+$/i.test(v) && v.length < 100_000;

/** Merges icons from the core (only data:image URLs survive). */
export function addIcons(map: Record<string, unknown>) {
  let changed = false;
  const next = { ...icons };
  for (const [host, data] of Object.entries(map ?? {})) {
    if (safe(data) && next[host.toLowerCase()] !== data) {
      next[host.toLowerCase()] = data;
      changed = true;
    }
  }
  if (changed) {
    icons = next;
    subs.forEach((f) => f());
  }
}

export function clearIcons() {
  icons = {};
  subs.forEach((f) => f());
}

/** The full host of an http(s) URL, lower-cased ("www." kept). */
export function rawHost(url: string): string {
  const m = /^https?:\/\/(?:[^@/?#]*@)?([^/:?#]+)/i.exec(url.trim());
  return m ? m[1].toLowerCase() : "";
}

/** The icon for a page, trying the host with and without "www.". */
export function iconFor(url: string, map: Record<string, string> = icons): string | null {
  const h = rawHost(url);
  if (!h) return null;
  return map[h] ?? map[h.startsWith("www.") ? h.slice(4) : `www.${h}`] ?? null;
}

function start() {
  if (started) return;
  started = true;
  favicons().then(addIcons).catch(quiet);
  void listen<Record<string, string>>(EVT_BROWSER_ICONS, (e) => addIcons(e.payload)).catch(quiet);
}

export function useIcon(url: string): string | null {
  const snap = useSyncExternalStore(
    (f) => {
      start();
      subs.add(f);
      return () => subs.delete(f);
    },
    () => icons,
    () => icons,
  );
  return iconFor(url, snap);
}
