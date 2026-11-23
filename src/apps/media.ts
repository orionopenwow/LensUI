// Official media for Lens Apps. In Lens, every image goes through `apps_media`, which downloads it
// once from the URL listed in the app's catalogue entry (https only, size caps, type checks) into
// %APPDATA%\LensUI\apps\media and returns a local file served by the asset protocol; the window's CSP
// never loads remote images directly. Outside Lens (site, tests) the official URL is used as is.
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";

const cache = new Map<string, Promise<string>>();

export function mediaSrc(appId: string, url: string): Promise<string> {
  const key = `${appId}\u0000${url}`;
  let p = cache.get(key);
  if (!p) {
    p = invoke<string>("apps_media", { appId, url }).then(
      (path) => (/^(https?:|data:|blob:|\/|\.{0,2}\/?media\/)/.test(path) ? path : convertFileSrc(path)),
      (e) => {
        // No backend (site / tests): fall back to the official URL. A real refusal stays an error.
        if (String(e).includes("isn't part of this app's entry")) throw e;
        return url;
      },
    );
    cache.set(key, p);
    p.catch(() => cache.delete(key));
  }
  return p;
}

export type MediaState = { src: string | null; status: "idle" | "loading" | "ready" | "error" };

/** Resolves one media URL to something an <img>/<video> can show. */
export function useMedia(appId: string, url: string | null | undefined, enabled = true): MediaState {
  const [state, setState] = useState<MediaState>({ src: null, status: url && enabled ? "loading" : "idle" });
  useEffect(() => {
    if (!url || !enabled) {
      setState({ src: null, status: "idle" });
      return;
    }
    let live = true;
    setState({ src: null, status: "loading" });
    mediaSrc(appId, url).then(
      (src) => live && setState({ src, status: "ready" }),
      () => live && setState({ src: null, status: "error" }),
    );
    return () => {
      live = false;
    };
  }, [appId, url, enabled]);
  return state;
}

const iconCache = new Map<string, Promise<string | null>>();

/** The installed app's own icon (from its program file), preferred over the catalogue icon. */
export function installedIcon(appId: string): Promise<string | null> {
  let p = iconCache.get(appId);
  if (!p) {
    p = invoke<string | null>("apps_installed_icon", { appId }).then(
      (v) => v ?? null,
      () => null,
    );
    iconCache.set(appId, p);
  }
  return p;
}

export function isVideo(url: string): boolean {
  return /\.(mp4|webm)(\?|#|$)/i.test(url);
}
