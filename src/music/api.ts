// Lens Music: typed IPC wrappers and the live now-playing hook.
import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  LastfmStatus, LyricsResult, MusicConfig, NowPlaying, Played, PlaylistItem, Queue, SpicetifyPreview, SpotifyStatus, TrackItem,
} from "../types/generated";
import { livePosition } from "./model";

export type { MusicConfig, NowPlaying, LyricsResult, Played, Queue, TrackItem, PlaylistItem, SpotifyStatus, LastfmStatus, SpicetifyPreview };

export const EVENT_NOW = "lens://music/now";

export const music = {
  config: () => invoke<MusicConfig>("music_config_get"),
  setConfig: (config: MusicConfig) => invoke<MusicConfig>("music_config_set", { config }),
  now: () => invoke<NowPlaying>("music_now"),
  control: (action: string, value: number | null = null) => invoke<boolean>("music_control", { action, value }),
  selectSession: (id: string) => invoke<void>("music_select_session", { id }),
  sleep: (minutes: number | null, endOfTrack = false) => invoke<{ atMs: number | null; endOfTrack: boolean }>("music_sleep", { minutes, endOfTrack }),
  lyrics: () => invoke<LyricsResult>("music_lyrics"),
  clearLyricsCache: () => invoke<void>("music_lyrics_clear_cache"),
  history: () => invoke<Played[]>("music_history"),
  clearHistory: () => invoke<void>("music_history_clear"),
  level: () => invoke<number>("music_level"),
  spicetifyPreview: (tokens: SpicetifyTokens) => invoke<SpicetifyPreview>("music_spicetify_preview", { tokens }),
  spicetifyExport: (tokens: SpicetifyTokens, install: boolean) => invoke<string[]>("music_spicetify_export", { tokens, install }),
  spotifyStatus: () => invoke<SpotifyStatus>("music_spotify_status"),
  spotifyBegin: (clientId: string) => invoke<string>("music_spotify_begin", { clientId }),
  spotifyFinish: () => invoke<void>("music_spotify_finish"),
  spotifyDisconnect: () => invoke<void>("music_spotify_disconnect"),
  spotifyQueue: () => invoke<Queue>("music_spotify_queue"),
  spotifyAdd: (uri: string) => invoke<void>("music_spotify_add", { uri }),
  spotifyPlaylists: () => invoke<PlaylistItem[]>("music_spotify_playlists"),
  spotifySave: (uri: string, saved: boolean) => invoke<void>("music_spotify_save", { uri, saved }),
  spotifyMore: (artistId: string) => invoke<TrackItem[]>("music_spotify_more", { artistId }),
  lastfmStatus: () => invoke<LastfmStatus>("music_lastfm_status"),
  lastfmBegin: (apiKey: string, secret: string) => invoke<string>("music_lastfm_begin", { apiKey, secret }),
  lastfmFinish: () => invoke<string>("music_lastfm_finish"),
  lastfmDisconnect: () => invoke<void>("music_lastfm_disconnect"),
};

export interface SpicetifyTokens {
  base: string;
  accent: string;
  light: boolean;
  radius: number;
}

/** Reads the live Lens tokens for the Spicetify export. */
export function currentTokens(): SpicetifyTokens {
  const cs = getComputedStyle(document.documentElement);
  const v = (k: string, d: string) => cs.getPropertyValue(k).trim() || d;
  const toHex = (c: string) => {
    if (c.startsWith("#")) return c;
    const m = c.match(/\d+(\.\d+)?/g);
    if (!m || m.length < 3) return "#09090b";
    return "#" + m.slice(0, 3).map((x) => Math.round(Number(x)).toString(16).padStart(2, "0")).join("");
  };
  return {
    base: toHex(v("--lens-pack-base", "#09090b")),
    accent: toHex(v("--lens-accent", "#fafafa")),
    light: document.documentElement.dataset.scheme === "light",
    radius: parseInt(v("--lens-radius", "8"), 10) || 8,
  };
}

/**
 * Subscribes to `lens://music/now` and re-renders at `fps` while playing, so scrubbers and
 * lyrics move smoothly without polling the backend.
 */
export function useNowPlaying(fps = 4): { now: NowPlaying | null; position: number } {
  const [now, setNow] = useState<NowPlaying | null>(null);
  const [, setTick] = useState(0);
  const ref = useRef<NowPlaying | null>(null);
  useEffect(() => {
    let alive = true;
    music.now().then((n) => alive && (ref.current = n, setNow(n))).catch(() => {});
    const un = listen<NowPlaying>(EVENT_NOW, (e) => {
      ref.current = e.payload;
      setNow(e.payload);
    });
    return () => {
      alive = false;
      un.then((f) => f()).catch(() => {});
    };
  }, []);
  useEffect(() => {
    if (now?.status !== "playing") return;
    const t = window.setInterval(() => setTick((x) => x + 1), 1000 / fps);
    return () => window.clearInterval(t);
  }, [now?.status, fps]);
  return { now, position: now ? livePosition(now, Date.now()) : 0 };
}
