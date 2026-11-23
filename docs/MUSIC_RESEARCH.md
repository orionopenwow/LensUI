# Lens Music — research notes

Scope: what makes now-playing, lyrics and music-client reskins loved on Windows (and elsewhere), what Windows actually exposes, and how Lens can offer the same feel **without** patching other apps or scraping protected lyrics. About 20 lookups, November 2026. Quotes are short; everything else is paraphrased. Where a fact could not be confirmed it says so.

## 1. What exists

### Spotify reskins: Spicetify
- **How it works.** Spicetify is a command-line tool that rewrites Spotify's own local UI bundle (`xpui`) on disk and injects a theme (`color.ini` + `user.css`, optional `theme.js`) and extensions. Settings live in `config-xpui.ini`; themes live in `%APPDATA%\spicetify\Themes\<Name>\` (the home folder wins over the install folder) ([Spicetify themes docs](https://spicetify.app/docs/development/themes)).
- **color.ini.** Sections are colour schemes; each scheme has keys such as `text`, `subtext`, `main`, `sidebar`, `player`, `card`, `shadow`, `main-secondary`, `button`, `button-secondary`, `button-active`, `button-disabled`, `nav-active`, `nav-active-text`, `play-button`, `tab-active`, `notification`, `notification-error`, `playback-bar`, `misc` (read from the community `Sleek` theme's `color.ini` in spicetify-themes). Values may be hex, decimal `r,g,b` or `${ENV}`; Spicetify turns them into CSS variables (`--spice-text`, `--spice-rgb-text`, …).
- **Updates break it.** Spotify updates replace the patched files. The FAQ tells users to re-run `spicetify backup apply` after each update, notes that a not-yet-supported Spotify version can break, and offers `spicetify auto` as a launcher ([Spicetify FAQ](https://www.spicetify.app/docs/faq)). Coverage in the press repeats the same pattern ([Windows Central](https://www.windowscentral.com/software-apps/customize-spotify-windows-spicetify), [gHacks](https://www.ghacks.net/2019/10/25/how-to-customize-spotify-with-spicetify-cli-themes/)).
- **Terms risk.** Spotify's Terms grant a limited, revocable licence for personal use and bar using the service "in any manner not expressly permitted" ([Spotify Terms of Use](https://www.spotify.com/us/legal/end-user-agreement/?nd=1)). The page we read does not mention Spicetify or client modification by name, and we found no official Spotify statement either way. **Conclusion: modifying the client is at the user's own risk; Lens must never do it on the user's behalf.**
- **Popular themes/extensions** (from the Spicetify marketplace and community repos; feature lists not individually verified): Comfy and Lucid (soft glass themes, artwork-tinted backgrounds), lyrics-plus (multi-provider lyrics page), full-app-display (full-screen artwork + track), **Beautiful Lyrics** — karaoke, line and static synced lyrics, background vocals, artwork-coloured backgrounds, and Cinema/Fullscreen views ([surfbryce/beautiful-lyrics](https://www.GitHub.com/surfbryce/beautiful-lyrics)).

### Apple Music: Cider
- Cider 2.5 finalised themes (built-in ThemeKit with hot reload), rewrote lyrics for smoother line transitions, added Immersive-view styles from plugins, a plugin API and marketplace; its Windows client moved to .NET 8 + WebView2 + WPF with taskbar controls and playback notifications ([Cider devlog](https://cidercollective.itch.io/cider/devlog/782809/cider-v250-the-biggest-update-yet)). The user's reference screenshot (library rail, artwork-tinted album page, a separate now-playing window with big synced lyrics) is this style of client.

### Windows' system media sessions (GSMTC)
- `GlobalSystemMediaTransportControlsSessionManager` lists every app that registered media playback (`GetSessions`), the one media keys control (`GetCurrentSession`), and per session the media properties (title, artist, album, thumbnail), playback info (status, rate, which controls are enabled) and timeline; it's meant for companion apps that show and control playback ([The Old New Thing](https://devblogs.microsoft.com/oldnewthing/20231108-00/?p=108980)). The data is whatever the player chooses to publish.
- **Timeline.** `Position` is only current "as of `LastUpdatedTime`" (UTC); there are also `StartTime`, `EndTime`, `MinSeekTime`, `MaxSeekTime` ([Microsoft Learn](https://learn.microsoft.com/en-us/uwp/api/windows.media.control.globalsystemmediatransportcontrolssessiontimelineproperties)). So a now-playing UI must **interpolate**: position + (now − LastUpdatedTime) while playing, clamped to the end.
- **Who publishes sessions.** Spotify and the Store Apple Music app do; Chromium browsers do for sites using the Media Session API; Firefox added timeline and seek support to SMTC in Firefox 125 ([Mozilla bug 1689538](https://bugzilla.mozilla.org/show_bug.cgi?id=1689538)). Desktop players often need a plugin: foobar2000 (foo_mediacontrol), VLC (vlc-win10smtc), MusicBee (mb_MediaControl), AIMP, Winamp; some apps report incomplete metadata (Amazon Music no art, TIDAL no album) ([Music Presence setup notes](https://docs.musicpresence.app/setup/media-player/)).

### Synced lyrics
- **LRCLIB** is a free, open, crowd-sourced synced-lyrics database with a key-less API: `GET /api/get?track_name&artist_name&album_name&duration` (duration must match within ±2 s, else 404) and `GET /api/search`; responses carry `plainLyrics`, `syncedLyrics` (LRC), `instrumental`, `duration`. Clients should send an identifying `User-Agent` (app, version, homepage); rough limits ~45/min anonymous, ~90/min identified; on `429` clients **must** honour `Retry-After` ([LRCLIB API docs](https://lrclib.net/docs.txt)). The server code is MIT ([tranxuanthang/lrclib](https://github.com/tranxuanthang/lrclib)). We could not find a stated licence for the lyrics data itself — Lens shows "Lyrics from LRCLIB" with a link and caches only locally.
- **Musixmatch / Spotify lyrics.** Spotify's in-app lyrics come from Musixmatch under licence. Musixmatch's API is a commercial product with its own terms; the "unofficial" libraries that call Spotify's or Musixmatch's private endpoints are scraping. **Lens will not use them.**

### Now-playing widgets and skins
- **Sleeve 2 (macOS)**: configurable track/artist/album text and fonts, artwork size and corner rounding, placement (floating, pinned to the desktop, or floating briefly on track change), playback hotkeys and controls, Last.fm scrobbling; works with Music and Spotify ([Six Colors](https://sixcolors.com/post/2024/01/now-playing-customizable-mac-music-status-via-sleeve-2/)).
- **Rainmeter** players read SMTC or the WebNowPlaying companion for browsers; visualiser skins (Monstercat-style) are popular ([RainmeterMediaPlayer](https://github.com/i2002/RainmeterMediaPlayer)). **Wallpaper Engine** exposes media info and audio levels to wallpapers.
- **Last.fm**: a track counts once it is longer than 30 s and has played for half its length or 4 minutes, whichever comes first; `track.updateNowPlaying` is optional and shouldn't be retried; requests are authenticated with a session key ([Last.fm scrobbling docs](https://www.last.fm/api/scrobbling)).

## 2. Ranked features for Lens

| # | Feature | Who does it best | Lens plan | Status |
|---|---|---|---|---|
| 1 | One now-playing source for **any** app (Spotify, Apple Music, browsers, VLC…) | Windows flyout, Rainmeter | GSMTC watcher, event-driven, per-app allow/deny + priority | Built (`music/service.rs`) |
| 2 | Accurate scrubber without polling | Cider, Spotify | Interpolate `Position` from `LastUpdatedTime` | Built (`music/timeline.rs`) |
| 3 | Big synced lyrics, current line bright, next lines faded, click to seek | Beautiful Lyrics, Cider, Apple Music | LRCLIB + local `.lrc`, offset ±, auto-scroll | Built |
| 4 | Artwork-tinted, frosted now-playing view | Beautiful Lyrics, Cider Immersive | Blurred art + palette gradient + optional dither | Built (`NowPlaying.tsx`) |
| 5 | Theme follows the music | Beautiful Lyrics (per page), Wallpaper Engine | Palette → contrast-safe accent, crossfade, auto-restore | Built (opt-in) |
| 6 | Mini player in the dock / bar | Sleeve, Windows 11 flyout | `MiniPlayer.tsx` (snippet mount) | Built |
| 7 | Hotkeys and voice | Sleeve | Voice/Command intents (snippet) | Snippets |
| 8 | Ambient "now playing" wallpaper | Wallpaper Engine | Playground scene, optional level metering | Built |
| 9 | Scrobbling | Sleeve, web-scrobbler | Last.fm, user's own key, DPAPI | Built (off) |
| 10 | Reskin the music client itself | Spicetify themes | **Export** a "Lens" Spicetify theme; the user applies it | Built (export only) |
| 11 | Word/syllable karaoke | Beautiful Lyrics | LRCLIB `hasWordSync` / enhanced LRC | Parser keeps words; view is line-level for now |
| 12 | Upcoming-release countdown chip | Reference screenshot | Needs a catalogue API we don't use | Not planned |

## 3. Safe integration model

1. **Read, don't inject.** Everything Lens knows comes from the documented GSMTC API. No DLL injection, no window scraping, no memory reading of players.
2. **Control through the same API.** Play/pause/next/previous/seek/shuffle/repeat use the session's own `Try…Async` calls and only when the session says the control is enabled. "Like" is hidden: GSMTC has no like/heart API.
3. **Network only when the user turns it on.** Lyrics (LRCLIB) and Last.fm are separate opt-ins. Lyrics requests send title/artist/album/duration only, with an identifying User-Agent, cached locally; `429 Retry-After` is honoured. Nothing else leaves the PC.
4. **Levels, never audio.** The audio-reactive scene reads the default output's peak meter (`IAudioMeterInformation`) — a number, no samples, no recording, no storage — and only while that scene is visible.
5. **Reversible theming.** "Theme follows music" changes only Lens's own accent, at most once every few seconds, never in fullscreen or games, and returns to the user's accent after the music stops.
6. **Spicetify is the user's choice.** Lens writes theme files to its own folder; copying them into `%APPDATA%\spicetify\Themes\Lens` happens only after the user confirms, and only that one folder is touched. Lens never runs `spicetify apply`; it shows the commands.

## 4. Don't do

- Patch Spotify (or any client) ourselves, or run Spicetify for the user.
- Scrape or call private Spotify/Musixmatch lyrics endpoints.
- Inject into other processes or read their memory to get "better" metadata.
- Record or store system audio, even "just for the visualiser".
- Upload listening history anywhere except the user's own Last.fm account, when they connect it.
- Ship real album artwork or copyrighted lyrics in the repo or screenshots.
- Poll GSMTC in a tight loop; use events.
