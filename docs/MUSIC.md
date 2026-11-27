# Lens Music

One now-playing layer for **every app that shows up in Windows' media controls** — Spotify, Apple Music, Edge/Chrome/Firefox tabs, VLC (with its SMTC plugin) and more — with synced lyrics, a matte artwork-tinted Now Playing window and its full-screen Immersive mode, an optional "theme follows the music" accent, a Playground scene, and optional connectors for Spotify's Web API and Last.fm. Research and the safety model: [MUSIC_RESEARCH.md](MUSIC_RESEARCH.md).

**Everything is off by default.** Settings → Music turns it on. Lyrics (network), lyric translation (AI), Spotify, Last.fm, Discord and the audio-reactive scene are separate opt-ins.

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
| Immersive, per-song lyric timing, translation cache, Discord Rich Presence, Lens Remote, Equalizer APO bridge | `music/immersive.rs`, `offsets.rs`, `translate.rs`, `discord.rs`, `remote.rs`, `eq.rs` |
| Commands (44) | `src-tauri/src/commands/music.rs` |
| UI | `src/music/NowPlaying.tsx`, `Immersive.tsx` (+ `immersiveModel.ts`, `immersive.css`), `tint.ts`, `translate.ts`, `useTranslation.ts`, `press.ts`, `command.ts`, `setup.ts`, `MusicSettingsExtras.tsx`, `MiniPlayer.tsx`, `music.css`, `themeFollow.ts`, `scene.ts`, `art.ts`, `model.ts`, `api.ts`, `src/components/MusicCard.tsx` |
| Tests | Rust tests in each `music/*.rs`; `src/__tests__/music.test.ts`; gallery `tools/parity/music/` |

Event: `lens://music/now` (payload `NowPlaying`, see `src/types/generated.ts`). The UI interpolates position from `positionMs` + `updatedMs`; no polling.

Data on disk (all under `%APPDATA%\LensUI`): `music.json` (settings), `music\history.json` (last 100 tracks, clearable), `music\lyrics\*.json` (cache, clearable), `music\translations\*.json` (lyric translations, cleared with the lyrics cache), `music\offsets.tsv` (per-song lyric timing, 500 songs), `music\spotify.bin` and `music\lastfm.bin` (DPAPI-sealed; deleted by Disconnect), `music\spicetify\Lens\` (exported theme).

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

## Immersive (learned from Cider)

Now Playing full screen on one monitor: the artwork large, a field of four soft gradients in its colours drifting slowly behind it, and the synced lyrics large with the current line bright. Open it with the Immersive button in Now Playing's player bar (or **F11** there), the ⤢ button on the Dock music card (while Lens Music is on), or by typing "immersive" (or `/immersive`) in Lens Command. **Esc**, **F11** or × leaves; the artwork returns to where it came from.

- `music_immersive_open(from)` puts the `nowplaying` window full screen on the monitor under the pointer, shows it and tells the page (`lens://music/immersive`, plus `music_immersive_pending` for a page that mounts later). It refuses with a sentence when the window in front is full screen and isn't Lens (`music::immersive::may_open`): Immersive never covers a game or a film. `music_immersive_close(keepWindow)` leaves full screen and hides the window unless Immersive came from Now Playing.
- Matte: the colour is the artwork's, as gradients; no blur layers, no glass. Only transform and opacity animate, on the motion tokens. Each layer loops on its own length (a multiple of `--lens-dur-slower`); with reduced motion, while paused, or while the window is hidden, they stay still and the 8 fps position tick stops (`document.hidden`).
- The cursor and the controls (seek, previous / play / next, lyric timing, Original / Translated / Both) hide after 3 s without the mouse moving (Settings › Music › Tweaks › Immersive, 1–10 s) and come back on any movement or key.
- Lyrics: only the lines around the current one are in the page (long songs cost the same as short ones); when the line changes, the lines glide to their new places (FLIP, move only).
- Optional sound glow along the bottom edge (Tweaks › Immersive, off by default): it reads the speakers' peak level through `music_glow_level` only while Immersive is on screen, playing and motion isn't reduced.
- Keys: Space play/pause, ←/→ seek 5 s, N/P next/previous, `[` / `]` lyric timing.
- Light themes get a paper field and dark text; accents are re-checked against Immersive's own field.

## Artwork tint

Now Playing's accents (active buttons, the seek fill, chips) come from the artwork when one of its colours can be lifted to **4.5:1** against every background it sits on: the hero gradient's top, middle and base (`tint.ts › pickTint`, `heroBackgrounds`). Greys, rare specks and colours that would have to be washed out to white or black are skipped; then the theme accent is used, lifted the same way. Text on an accent fill is near-black or near-white, whichever reads better. Settings › Music › Immersive › **Artwork colours in Now Playing** (on by default; local only).

The window is matte: the artwork's colours as a gradient, solid panels, no blurred copy of the art and no `backdrop-filter`.

## Lyric timing per song

LRCLIB timings drift on live versions and radio edits. The lyrics header (and Immersive) has **−0.5 s / +0.5 s / Reset**, and `[` / `]` do the same. The nudge is saved for that song (`music_lyrics_offset`, `music_lyrics_nudge(steps)`, `music_lyrics_offset_reset`) in `music\offsets.tsv`, keyed by title and artist so it follows the song from Spotify to a browser tab, at most 500 songs, ±10 s, and is added to the global Timing in Settings.

## Lyric translation (opt-in)

Settings › Music › Synced lyrics › **Offer translations** adds Translate to the lyrics header. Translating:

1. Looks for a saved translation of these lines into this language first (`music_translation_get(key)`; the key is made from the lines and the language, `translate.ts › translationKey`, 32 hex characters).
2. Otherwise asks Lens AI (`ai_ask`, tools off): the local model when one is running on this PC, else the provider chosen in Settings › AI. The privacy mode applies unchanged: Local only refuses cloud providers; Ask each time shows the shared Send / Don't send card in Now Playing; the usage log records it. Only the numbered lyric lines are sent.
3. Saves the answer (`music_translation_put`) with the provider's name, which is shown under the lyrics ("Translated by Ollama · llama3.2, on this PC · saved on this PC").

"Translate into" defaults to the Windows display language. Original / Translated / Both switches what the lyrics show (saved as `lyricsView`). The built-in script assistant can't translate and says so.

## Discord Rich Presence (opt-in)

Settings › Music › **Show on Discord**: "Listening to …" on your Discord profile with the song, the artist and the time left.

- Lens talks only to the Discord app on this PC, through its local named pipe (`\\.\pipe\discord-ipc-0` … `-9`), with Discord's RPC framing (`opcode u32 LE`, `length u32 LE`, JSON): handshake with the application ID, then `SET_ACTIVITY` with Lens's process id. A small hand-written client (`music/discord.rs`, standard library only): no crate, and **Lens itself makes no network call** for this. The Discord app shares it with whoever can see your profile.
- Discord needs an application ID to show an activity. Lens has none of its own, so you create one (discord.com/developers/applications, any name; Discord shows "Listening to <name>") and paste its ID, like Spotify's client ID.
- **Private listening** clears the activity until you turn it off. Paused or stopped clears it too. "Show time left" turns the progress bar off.
- Artwork: Discord can only show web images. With Spotify connected, Lens passes Spotify's https cover address (Discord loads it); otherwise no picture. Windows' thumbnail is never uploaded.
- Retries every 5 s, doubling to a minute, while Discord isn't running; status text in Settings. Closing Lens closes the pipe and Discord clears the activity.

## Music setup and Tweaks

Until finished or skipped, Settings › Music opens with a three-step **Set up Lens Music**: where your music comes from (Windows media = Lens Music itself, Spotify, your .lrc folder), lyrics and scrobbling (LRCLIB, Last.fm), share and control (Discord; a phone remote is planned and nothing listens on the network today). Every choice is a normal switch; nothing is turned on for you. The advanced options sit in a collapsible **Tweaks** section grouped as Look, Sources, Lyrics, Immersive and Playground.

## Lens Remote (Tester mode preview)

Control the music from a phone on the same home network. **Tester mode only for now** (Settings › About & Testing › Tester mode), and off until you turn it on in Settings › Music › Lens Remote. Why a preview: it serves plain HTTP on the LAN and hasn't been tried on real networks yet.

- `music/remote.rs`: a tiny HTTP server on this PC's private LAN address (`lan_address()` picks the route Windows would use; nothing is sent), port 43120 or a free one. Standard library only. The page (`/`, `/remote.css`, `/remote.js`) loads nothing from the web.
- **Pairing**: Settings shows a QR code (`src/music/qr.ts`, generated on this PC) for `http://<address>/pair?t=<one-time code>` (32 random bytes from the OS). Opening it swaps the code for an HttpOnly, SameSite=Strict session cookie tied to the phone's address; the code is then gone ("Pair another phone" makes a new one). At most 3 phones.
- **Who may connect**: private IPv4 addresses on the same /24 as this PC, never this PC itself; the `Host` header must be this PC's address (no DNS rebinding); `POST /api/control` needs the `X-Lens-Remote: 1` header, which other websites' forms can't send.
- **Limits**: 40 requests per 10 s per device; 5 wrong codes or sessions block the device for 5 minutes; headers ≤ 8 KB, bodies ≤ 1 KB.
- **What it can do**: play/pause, next, previous, seek, volume, and read the title, artist, position and artwork. Nothing else in Lens is reachable.
- **Stops by itself** after 10 minutes without a request (5–60 in Settings), and when Lens exits. While on, a **Remote on** pill shows in the Top Bar (next to the TEST BUILD badge) and Settings shows the address and the number of phones.
- **Threat model, honestly**: there is no certificate a home network can offer, so traffic isn't encrypted. Someone who can read your Wi-Fi traffic could copy a phone's session cookie and control playback until the Remote stops. They can't reach anything else, and the Remote stops on its own.
- **Firewall**: Lens never adds a firewall rule, so nothing goes in the change registry. Windows may ask once whether Lens may use the network: allow Private networks only. If you refuse, phones can't reach it.

Commands: `music_remote_start` (refuses unless Tester mode and Music are on), `music_remote_stop`, `music_remote_status`, `music_remote_pair`; event `lens://music/remote`.

## Equalizer (Equalizer APO bridge)

Lens has no audio engine and never processes sound, so it doesn't offer an equalizer of its own. Settings › Music › **Equalizer** works with [Equalizer APO](https://sourceforge.net/projects/equalizerapo/) (GPL-2.0, by Jonas Thedering), a separate program you install:

- Detected by its `config\config.txt` under Program Files. If it isn't installed: **Get it in Lens Apps** (a link to its official page; Lens doesn't bundle or run it).
- Presets (10 bands, 32 Hz – 16 kHz, a negative preamp equal to the biggest boost so nothing clips): Flat, More bass, Clear voices, More treble, Late night. Choosing one writes `lens-music.txt` beside `config.txt` and adds one marked `Include: lens-music.txt` line at the end of `config.txt` (once). The first time, a copy of `config.txt` is kept in `%APPDATA%\LensUI\music\eqapo-config.before-lens.txt` for reference.
- **Off** removes exactly the marked line and Lens's file; anything you changed in `config.txt` meanwhile stays. **Remove all Lens changes** does the same (change registry row `equalizer-apo-preset`).
- **Open Equalizer APO** starts its own Configuration Editor for anything more.
- If Windows won't let Lens write there, Lens says so (open the Editor once, or give your account write access to that folder).
- **Spatial sound** (Windows Sonic and others) is set per device by Windows and apps can't switch it, so Lens opens Sound settings instead of pretending.

Commands: `music_eq_status`, `music_eq_set(preset | "off")`, `music_eq_open_editor`.

## Credits

Equalizer presets run on **Equalizer APO** by Jonas Thedering (GPL-2.0), which Lens bridges to and never bundles.

Immersive, the artwork-tinted pages, lyric translation, Discord presence and the setup/Tweaks pages were **learned from Cider** (cider.sh), a community Apple Music client, from its public site and behaviour only (clean-room; no code, assets or copy). See docs/features/music.md › 10.
