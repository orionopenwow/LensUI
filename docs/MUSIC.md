# Lens Music

One now-playing layer for **every app that shows up in Windows' media controls** — Spotify, Apple Music, Edge/Chrome/Firefox tabs, VLC (with its SMTC plugin) and more — with synced lyrics, a frosted Now Playing window, an optional "theme follows the music" accent, a Playground scene, and optional connectors for Spotify's Web API and Last.fm. Research and the safety model: [MUSIC_RESEARCH.md](MUSIC_RESEARCH.md).

**Everything is off by default.** Settings → Music turns it on. Lyrics (network), Spotify, Last.fm and the audio-reactive scene are separate opt-ins.

## What works with which app

| | Any media-session app | Spotify + "Connect Spotify" | Apple Music (Store app) |
|---|---|---|---|
| Title, artist, album, artwork | ✓ (what the app shares) | ✓ | ✓ |
| Play/pause, next, previous | ✓ | ✓ | ✓ |
| Seek, shuffle, repeat | when the app enables them | ✓ | when enabled |
| Synced lyrics (LRCLIB / your .lrc files) | ✓ | ✓ | ✓ |
| Real queue, add to queue | — (Windows never shares a queue) | ✓ `GET/POST /me/player/queue` | — |
| Playlists in the sidebar | — | ✓ `GET /me/playlists` | — |
| Save / like | — | ✓ `PUT/DELETE /me/library` | — |
| "More by" artist | — | ✓ `GET /artists/{id}/albums` | — |
| Queue panel shows | "Recently played in Lens" (local) | Spotify's queue | "Recently played in Lens" |

Apple Music has no public Windows API for Lens to use, so it's "now playing via Windows" only; users who want Apple Music itself themed can use Cider (a third-party client with its own themes).

## Pieces

| Area | Files |
|---|---|
| Media-session watcher (GSMTC, event-driven; 1 s tick only while playing for the sleep timer and scrobbling) | `src-tauri/src/music/service.rs` (Windows) |
| Session choice, timeline maths, history, sleep timer, config | `music/session.rs`, `timeline.rs`, `history.rs`, `mod.rs` |
| Lyrics: LRC parser, LRCLIB client (User-Agent, cache, `429 Retry-After` + jitter), local `.lrc` folder | `music/lrc.rs`, `lyrics.rs` |
| Spotify Web API (OAuth PKCE, user's own client ID, loopback `http://127.0.0.1:43117/callback` with fallbacks on 43118 and 43119, DPAPI tokens) | `music/spotify.rs` |
| Last.fm (user's own API key/secret, desktop auth, scrobble rules) | `music/lastfm.rs`, `scrobble.rs` |
| Speaker peak level (one number; no audio) | `music/levels.rs` |
| Spicetify theme generator (export only) | `music/spicetify.rs`, `color.rs` |
| MD5 / SHA-256 / base64url (std-only) | `music/hash.rs` |
| Commands (26) | `src-tauri/src/commands/music.rs` |
| UI | `src/music/NowPlaying.tsx`, `MiniPlayer.tsx`, `music.css`, `themeFollow.ts`, `scene.ts`, `art.ts`, `model.ts`, `api.ts`, `src/components/MusicCard.tsx` |
| Tests | Rust tests in each `music/*.rs`; `src/__tests__/music.test.ts`; gallery `tools/parity/music/` |

Event: `lens://music/now` (payload `NowPlaying`, see `src/types/generated.ts`). The UI interpolates position from `positionMs` + `updatedMs`; no polling.

Data on disk (all under `%APPDATA%\LensUI`): `music.json` (settings), `music\history.json` (last 100 tracks, clearable), `music\lyrics\*.json` (cache, clearable), `music\spotify.bin` and `music\lastfm.bin` (DPAPI-sealed; deleted by Disconnect), `music\spicetify\Lens\` (exported theme).

## Spotify reskin via Spicetify — the honest route

Lens **never** patches Spotify and **never** runs Spicetify. Settings → Music → "Spotify theme for Spicetify" writes a `Lens` theme (`color.ini` + `user.css`) generated from the current Lens tokens to `%APPDATA%\LensUI\music\spicetify\Lens`, and — only if the user ticks "Also copy it into Spicetify's Themes folder" — into `%APPDATA%\spicetify\Themes\Lens` (that one folder). The user then runs:

```
spicetify config current_theme Lens color_scheme Lens
spicetify apply
```

and `spicetify restore` to undo. Caveats shown in the card: Spotify updates undo Spicetify (re-run `spicetify backup apply`), and modifying the Spotify client may conflict with Spotify's Terms of Use ("in any manner not expressly permitted"); it's the user's choice. The theme is cosmetic only: slim rail + library, artwork-tinted headers, a frosted floating player bar, monospace metadata, big bright current lyric line. Generated colours are tested for contrast (text ≥ 7:1, subtext ≥ 4.5:1, accent ≥ 3:1) on the packs; Spotify's class names change between versions, so rules may stop applying after updates — nothing hides controls.

## Connect Spotify

1. The user creates an app at developer.spotify.com/dashboard, adds the redirect URI `http://127.0.0.1:43117/callback` (and, optionally, the same address on ports 43118 and 43119, used only when 43117 is busy), ticks Web API, and pastes the client ID. Lens binds the port before the browser opens: if 43117 is taken it uses the next free one and says so; if all three are taken, Connect fails straight away with a message naming the ports.
2. Lens opens Spotify's consent page (PKCE S256, `state` checked), waits up to 3 minutes for the loopback redirect (127.0.0.1 only), exchanges the code without a client secret, and seals the tokens with DPAPI. Refresh is automatic.
3. Scopes, each explained in the card: `user-read-playback-state`, `user-read-currently-playing`, `user-modify-playback-state`, `user-read-recently-played`, `playlist-read-private`, `user-library-read`, `user-library-modify`.

Spotify's February 2026 Development Mode rules apply and are stated in the card: the app owner needs Premium, a new app allows 5 allow-listed users, artist top-tracks and batch metadata were removed (Lens uses artist albums for "More by"), library save/remove moved to `/me/library`, playlist `tracks` became `items`. That fits personal use.

## Snippets for shared files and other packages

The integrator applies these; nothing here is wired into existing surfaces yet.

### 1. Control Center — mount the card (ControlCenterSurface.tsx)

```tsx
import { MusicCard } from "../components/MusicCard";
// In the "Desktops & Widgets" (or a new "Music") tab, after the Playground card:
<MusicCard />
```

### 2. Now Playing window (tauri.conf.json, capabilities/default.json, main.tsx)

```jsonc
// tauri.conf.json → app.windows
{ "label": "nowplaying", "url": "index.html?surface=nowplaying", "title": "Now Playing", "width": 1280, "height": 800,
  "minWidth": 560, "minHeight": 360, "visible": false, "decorations": false, "transparent": false, "resizable": true, "skipTaskbar": false }
```
Add `"nowplaying"` to `capabilities/default.json` → `windows`. In `main.tsx`:

```tsx
import { NowPlayingView } from "./music/NowPlaying";
// …
case "nowplaying": root.render(<NowPlayingView onClose={() => getCurrentWindow().hide()} onMode={(m) => m === "fullscreen" ? getCurrentWindow().setFullscreen(true) : getCurrentWindow().setFullscreen(false)} />); break;
```
Open it with `invoke("open_surface", { label: "nowplaying" })`.

### 3. Mini player — Dock (DockSurface.tsx) and Top Bar (TopBarSurface.tsx)

```tsx
import { MiniPlayer } from "../music/MiniPlayer";
// Dock, after the pinned apps and before the system area, when musicConfig.miniPlayer === "dock":
<MiniPlayer variant="dock" onOpen={() => invoke("open_surface", { label: "nowplaying" })} />
// Top Bar, in the centre/left utility group, when musicConfig.miniPlayer === "topbar":
<MiniPlayer variant="topbar" onOpen={() => invoke("open_surface", { label: "nowplaying" })} />
```
Read `musicConfig` once with `music.config()` and refresh it on `lens://music/now` or when Settings saves. The existing Top Bar media controls (`win_media.rs`, `topBar.showMediaControls`) can stay as they are; when Lens Music is enabled the Top Bar should hide its old media controls to avoid showing two.

### 4. Theme follows the music (every surface root: Dock, Top Bar, Control Center, Command…)

```tsx
import { MusicAccentBridge } from "./music/themeFollow";
import { useNowPlaying } from "./music/api";
const { now } = useNowPlaying(1);
// cfg = music.config(); suppressed = the existing fullscreen/game pause flag (win_desktop_input / gamingPause)
<MusicAccentBridge now={now} enabled={cfg.enabled && cfg.themeFollows} intensity={cfg.themeIntensity} restoreDelayS={cfg.restoreDelayS} suppressed={fullscreenOrGame} />
```
It only sets an inline `--lens-accent` on that window's root and removes it on unmount; config is never written.

### 5. Playground scene (src/playground/registry.ts)

```ts
import { nowPlayingScene } from "../music/scene";
// add to SCENES:
nowPlayingScene,
```
The scene's "Move to the music" toggle only polls `music_level` while the scene is running, and the backend returns 0 unless Settings → Music → audio-reactive is on.

The Dock's music pop-out (hover Spotify; `src/music/DockMusicCard.tsx`) reads the same peak through `music_glow_level` for its sound glow and level meter. It asks at most ~30 times a second, only while the pop-out is open, something is playing, one of the two is on (Settings → Music → Sound glow / Level meter, both on by default) and motion isn't reduced; the command returns 0 when both are off. It works with Music off, using Windows' media session directly (`get_media_now_playing_cmd`, which now carries position, length and whether seeking works; `media_control_cmd` takes `seek` with a position in ms).

### 6. Voice and Command intents

Script intents → `music_control`:

| Phrase | Call |
|---|---|
| "Lens, pause" / "play" / "resume" | `music_control("pause" / "play")` |
| "next song" / "skip" / "previous song" | `music_control("next" / "prev")` |
| "shuffle on/off", "repeat one/all/off" | `music_control("shuffle", 1/0)`, `music_control("repeat", 1/2/0)` |
| "what's playing" | `music_now()` → speak "{title} by {artist} on {sourceLabel}" |
| "show lyrics" / "open now playing" | `open_surface("nowplaying")` |
| "like this song" | only when Spotify is connected: `music_spotify_save(uri, true)` (risk: confirm) |
| "add this song to Shelf" | `shelf_add({ kind: "text", title: "{title} — {artist}", text, tags: ["music"] })` |
| "sleep timer 30 minutes" / "stop after this song" | `music_sleep(30, false)` / `music_sleep(null, true)` |

Add these to `src-tauri/src/ai/intent.rs` (owned by the voice/AI packages) with risk `low`, except "like" (`confirm`, needs Spotify). Lens Command: a `/music` command that opens Now Playing, and the Mini tile "Now playing".

### 7. Backup / uninstall

`win_backup.rs`: include `music.json` and `music\history.json` (not the sealed `.bin` files — they're bound to the Windows account). `win_uninstall.rs` ("Remove all Lens changes"): delete `%APPDATA%\LensUI\music\` and, if it exists and was written by Lens, `%APPDATA%\spicetify\Themes\Lens` — after telling the user to run `spicetify restore` first if they applied it.

### 8. Guide

Anchor ids for coach marks: `data-guide-id="music.card"`, `music.lyrics`, `music.spotify`, `music.spicetify`, `nowplaying.queue`, `nowplaying.sleep`.

## Needs real hardware

- GSMTC events firing for Spotify, Apple Music (Store), Edge/Chrome tabs and Firefox ≥ 125; players that send sparse timeline updates; session switching when two apps play.
- Album-art thumbnails from each app (some send none or tiny ones).
- Seek/shuffle/repeat on apps that report them enabled.
- `IAudioMeterInformation` level while Bluetooth/USB output devices change.
- Spotify OAuth loopback (port 43117 free, browser redirect), queue/playlists on a Premium account, and Development-Mode allow-listing.
- Last.fm desktop auth and scrobble timing.
- The exported Spicetify theme on the current Spotify desktop build.

## Lyrics on the desktop (opt-in)

Settings › Music › Synced lyrics › **Lyrics on the desktop** (off by default) shows the line being sung under the Top Bar, in the artwork's colour, fading from line to line.

- Window `lyricsline` (`src-tauri/src/music/desktop_lyrics.rs`, `src/music/LyricsLineSurface.tsx`): transparent, always on top, never focused (`WS_EX_NOACTIVATE`), every click passes through (`set_ignore_cursor_events`). It is created only while the switch, Music and lyrics are all on, and closed when any goes off or Lens exits.
- On screen only while something is playing, and hidden whenever the window in front is fullscreen (a game, a film). Nothing is hooked or injected into other apps.
- Shows nothing when there are no synced lyrics, before the first line and in instrumental gaps. Motion is opacity and transform only, and none with reduced motion.
- Not yet confirmed on a real PC (focus, multi-monitor placement, fullscreen games); the rules (`wanted`, `should_show`, `place`, `desktopLine`) are unit-tested.
