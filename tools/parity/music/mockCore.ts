// Parity mock for Lens Music: the base harness mock plus music commands with sample data.
// Placeholder artwork and original placeholder lyrics only — no real songs or covers.
import { invoke as baseInvoke } from "../mock/core";
import { placeholderArt } from "../../../src/music/art";
export { convertFileSrc, isTauri } from "../mock/core";

const p = new URLSearchParams(location.search);
const scene = p.get("scene") || "";
const spotify = scene.includes("spotify");
const empty = scene === "np-empty";

const T0 = Date.now();
export const SAMPLE = {
  hasSession: !empty,
  sessionId: "Spotify.exe",
  sourceLabel: "Spotify",
  title: "Harbour Lights [From Lens: Original Score]",
  artist: "The Placeholders, Mira Vale & North Arcade",
  album: "Lens Sessions, Vol. 1",
  artwork: placeholderArt("harbour-lights"),
  trackKey: "k-harbour",
  status: "playing",
  positionMs: 64_000,
  updatedMs: T0,
  durationMs: 224_000,
  rate: 1,
  controls: { play: true, pause: true, next: true, prev: true, seek: true, shuffle: true, repeat: true },
  shuffle: false,
  repeat: "list",
  sessions: [
    { id: "Spotify.exe", label: "Spotify", title: "Harbour Lights", playing: true, active: true },
    { id: "msedge.exe", label: "Microsoft Edge", title: "Lecture 4 — Signals", playing: false, active: false },
  ],
  sleepAtMs: scene.includes("queue") ? T0 + 45 * 60_000 : null,
  sleepEndOfTrack: false,
};

const LYRICS = [
  "Neon rain across the harbour",
  "Every window holds a light",
  "I keep the radio on low",
  "So I can hear the city breathe",
  "Turn the corner, find the morning",
  "Paper boats along the tide",
  "Every echo calls me home",
  "Harbour lights, harbour lights",
].map((text, i) => ({ startMs: 48_000 + i * 6_500, text }));

const track = (n: number, title: string, artists: string, album: string, ms: number, explicit = false) => ({
  uri: `spotify:track:t${n}`, title, artists, album, durationMs: ms, explicit, image: placeholderArt(`q-${n}`, 96),
});

const handlers: Record<string, (a: any) => any> = {
  music_config_get: () => ({
    enabled: true, priority: ["spotify", "applemusic"], deny: ["teams"], allowOnly: [], miniPlayer: "dock", themeFollows: true, themeIntensity: 0.6,
    restoreDelayS: 20, lyrics: true, lyricsLrclib: true, lyricsFolder: null, lyricsOffsetMs: 0, windowStyle: "expanded", dither: true,
    sceneReactive: false, history: true, lastfm: false,
  }),
  music_config_set: (a) => a.config,
  music_now: () => SAMPLE,
  music_control: () => true,
  music_lyrics: () => ({ found: true, synced: true, instrumental: false, lines: LYRICS, source: "lrclib", sourceUrl: "https://lrclib.net/api/get/1", note: null }),
  music_history: () => [
    { title: "Harbour Lights [From Lens: Original Score]", artist: "The Placeholders", album: "Lens Sessions, Vol. 1", sourceLabel: "Spotify", durationMs: 224_000, atMs: T0 },
    { title: "Glass Canyon", artist: "Mira Vale", album: "Echo Field", sourceLabel: "Spotify", durationMs: 201_000, atMs: T0 - 4e5 },
    { title: "Lecture 4 — Signals", artist: "Open Course", album: "", sourceLabel: "Microsoft Edge", durationMs: 2_700_000, atMs: T0 - 9e5 },
    { title: "Slow Static", artist: "North Arcade", album: "Low Orbit", sourceLabel: "Spotify", durationMs: 188_000, atMs: T0 - 1.2e6 },
    { title: "Paper Tides", artist: "The Placeholders", album: "Lens Sessions, Vol. 1", sourceLabel: "Spotify", durationMs: 236_000, atMs: T0 - 1.5e6 },
  ],
  music_spotify_status: () => ({ connected: spotify, clientId: spotify ? "0123456789abcdef0123456789abcdef" : null, redirectUri: "http://127.0.0.1:43117/callback",
    scopes: [["user-read-playback-state", "See what's playing and your queue"], ["user-modify-playback-state", "Play, pause, skip and add to your queue"], ["playlist-read-private", "List your playlists in the sidebar"], ["user-library-modify", "Save (like) a track when you ask"]] }),
  music_spotify_queue: () => ({
    current: track(0, "Harbour Lights", "The Placeholders", "Lens Sessions, Vol. 1", 224_000),
    items: [
      track(1, "Glass Canyon", "Mira Vale", "Echo Field", 201_000),
      track(2, "Slow Static", "North Arcade", "Low Orbit", 188_000, true),
      track(3, "Paper Tides", "The Placeholders", "Lens Sessions, Vol. 1", 236_000),
      track(4, "Copper Skyline", "Mira Vale & North Arcade", "Copper Skyline – Single", 175_000),
      track(5, "Night Ferry", "Harbour Choir", "Crossings (Deluxe)", 262_000, true),
      track(6, "Lantern", "North Arcade", "Low Orbit", 214_000),
    ],
  }),
  music_spotify_playlists: () => [
    { uri: "spotify:playlist:p1", name: "Favourite Songs", owner: "You", count: 312, image: placeholderArt("pl-1", 64) },
    { uri: "spotify:playlist:p2", name: "Late Night Focus", owner: "You", count: 48, image: placeholderArt("pl-2", 64) },
    { uri: "spotify:playlist:p3", name: "Heavyweight D&B", owner: "You", count: 91, image: placeholderArt("pl-3", 64) },
  ],
  music_lastfm_status: () => ({ connected: false, pending: false, username: null }),
  music_level: () => 0.4,
  get_quick_state_cmd: () => ({ volume: 62, muted: false, brightness: 80, nightLightEnabled: false, nightLightWarmth: 40 }),
};

export async function invoke<T = any>(cmd: string, args?: any): Promise<T> {
  if (cmd in handlers) return handlers[cmd](args) as T;
  return baseInvoke<T>(cmd, args);
}
