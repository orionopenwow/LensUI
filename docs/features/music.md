# Lens Music — feature dossier

Status date: 2026-11-26 (main at `6e7abb0`). Sources: `docs/MUSIC.md`, `docs/MUSIC_RESEARCH.md`,
`docs/brain/BUGS.md`, code below.

## 1. Rundown

**What it is.** A now-playing layer for any app that shares Windows' media session (Spotify,
Apple Music, browsers, Firefox ≥ 125…): a Now Playing window, a mini player on the Dock and Top
Bar, synced lyrics, local history, a sleep timer, optional Spotify connection (queue, playlists,
like), optional Last.fm scrobbling, a speaker level meter, theme-follows-the-art, and an exported
Spicetify theme for people who want Spotify itself to match.

**Who it's for.** Anyone who listens while working and wants controls and lyrics where they
already look, without a new player.

**Where it lives.**

| Part | Paths |
|---|---|
| Media session | `src-tauri/src/music/service.rs` (GSMTC, event-driven; 1 s tick only while playing) |
| Model | `music/session.rs`, `timeline.rs`, `history.rs`, `mod.rs` |
| Lyrics | `music/lrc.rs`, `lyrics.rs` (LRCLIB client, cache, 429 Retry-After + jitter, local `.lrc`) |
| Spotify | `music/spotify.rs` (OAuth PKCE, user's own client ID, loopback 127.0.0.1:43117, DPAPI tokens) |
| Last.fm | `music/lastfm.rs`, `scrobble.rs` |
| Level | `music/levels.rs` (one peak number, no audio) |
| Spicetify export | `music/spicetify.rs`, `color.rs` |
| Commands (26) | `src-tauri/src/commands/music.rs` |
| UI | `src/music/NowPlaying.tsx`, `NowPlayingSurface.tsx`, `MiniPlayer.tsx`, `themeFollow.ts`, `scene.ts`, `art.ts`, `useMiniPlacement.ts`, `src/components/MusicCard.tsx` |
| Tests | Rust tests per module; `src/__tests__/music.test.ts`; parity `tools/parity/music/` |
| Data | `%APPDATA%\LensUI\music.json`, `music\history.json` (100), `music\lyrics\*.json`, `music\spotify.bin`, `music\lastfm.bin` (DPAPI), `music\spicetify\Lens\` |

## 2. Feature tree
- **Now playing from any media-session app** — works (title, artist, album, art as shared).
  - Play/pause, next, previous — works.
  - Seek, shuffle, repeat — partly: only when the app enables them.
  - Two apps playing → session choice — works (`session.rs`); real-PC switching unverified.
  - Position interpolated from `positionMs + updatedMs`, no polling — works.
- **Now Playing window** — works: big art, lyrics, queue panel, controls.
- **Mini player** on Dock and Top Bar — works (`MiniPlayer.tsx`, `useMiniPlacement.ts`); now-playing
  row in Lens Browser sidebar only while playing (#86).
- **Synced lyrics** (LRCLIB or your `.lrc` folder) — works; cache clearable; big bright current line.
- **Queue panel** — partly: Spotify's real queue when connected; otherwise "Recently played in
  Lens" (Windows never shares a queue).
- **History** (last 100, clearable) — works.
- **Sleep timer** — works (ticks only while playing).
- **Spotify connect** (own client ID, PKCE, Premium for queue control; Development-Mode
  allow-listing) — works in tests; real OAuth loopback unverified.
  - Playlists in sidebar, add to queue, like/save, "More by" — works when connected.
- **Last.fm** (own key/secret, desktop auth, scrobble rules) — works in tests; timing unverified.
- **Speaker level meter** (`IAudioMeterInformation`, one number) — works; device changes unverified.
- **Theme follows the music** (art colours → surface tokens) — works (`themeFollow.ts`).
- **Playground scene** — works (`scene.ts`).
- **Voice / Command intents** ("pause", "next", "what's playing") — works.
- **Spicetify theme export** — works: writes `color.ini` + `user.css`; copies to Spicetify's
  Themes folder only if ticked; Lens never patches or runs Spicetify; removed by Remove all (B-02).
- **Apple Music** — now-playing via Windows only (no public API); Cider suggested for theming.

## 3. Quick wins (≤ 1 day, ranked)
1. **Queue panel empty state** that explains "Windows doesn't share queues — connect Spotify to see
   yours" with the Connect button inline (today the panel silently shows recent tracks).
2. **Lyrics offset nudge** (±0.5 s keys) saved per track — LRCLIB timings drift for live versions.
3. **Art fallback**: when an app sends no or tiny art, use a Lens cloud gradient seeded by the
   album name instead of a blank square.
4. **Toasts instead of swallowed errors** in `src/music/*` (Spotify/Last.fm failures look like
   nothing happened).
5. **Mini player hover scrubber** on the Dock with the same timeline maths.

## 4. Polish assessment
- **Motion:** lyrics scroll and art crossfade should be transform/opacity only — verify the
  current-line emphasis isn't animating font-size (check `music.css`).
- **Copy:** Spotify connect asks the user to create their own client ID — needs a 3-step guide
  with screenshots in the card; Spicetify card states ToS caveat clearly (good).
- **Visual parity:** parity gallery exists; add mini player on every dock style (post #95 sizes).
- **A11y:** controls named; lyrics should be `aria-live="off"` with a "Read current line" button
  (live lyrics announcements are noisy).
- **Perf:** event-driven, 1 s tick only while playing — good. Theme-follow recolouring every track
  change should batch into one style write (theme-switch rig rules).
- **Consistency:** mini player in the Top Bar vs Dock vs browser sidebar — three components;
  share one.

## 5. Bug assessment
| Id | Severity | Where | Issue |
|---|---|---|---|
| B-02 (fixed) | — | `spicetify.rs`, `win_uninstall.rs` | Spicetify theme now removed by Remove all |
| Suspected S1 | Medium | `music/spotify.rs` loopback 43117 | if the port is taken, OAuth fails; needs a fallback port or a clear error |
| Suspected S2 | Low | `levels.rs` | output device change (Bluetooth connect) may leave the meter on the old endpoint until restart |
| Suspected S3 | Low | `themeFollow.ts` | theme-follow + a user theme switch can race (last write wins); respect an explicit theme pick for the session |
| Suspected S4 | Low | `session.rs` | two sessions with identical metadata (browser tab + Spotify) may flip the chosen session |
| B-18 share | Low | `src/music/*` | swallowed errors |

## 6. One idea to push to main
**Lyrics on the desktop**: an optional, click-through "now singing" line under the Top Bar (or
above the Dock) showing the current lyric with the art colour, fading between lines; off by
default, hidden in fullscreen. High delight, all data already present.

## 7. Test plan
**Unit:** LRC parsing (offsets, multiple timestamps per line, malformed), timeline interpolation,
session choice rules, scrobble rules (half/4 min), history cap and clear, themeFollow contrast.
**Rust:** LRCLIB 429 + jitter; Spotify PKCE flow with mock server incl. refresh failures; DPAPI
seal/unseal; Spicetify export contrast ≥ 7:1 / 4.5:1 / 3:1 on every pack; port-in-use path.
**Parity:** Now Playing (lyrics on/off, no art, tiny art, long titles), mini player on all dock
styles/edges, light/dark.
**Windows E2E:** play a local file in Windows Media Player / a browser tab → Lens shows it within
1 s; pause/next from the mini player; lyrics fetched from a mocked LRCLIB; history updated;
Remove all removes the Spicetify copy.
**Hyper rows:** every `music.*` setting set/verify/restore.
**Manual:** Spotify desktop + Connect Spotify on a Premium account; Apple Music Store app; Edge
YouTube tab; Bluetooth headphones connect/disconnect while the meter runs; Last.fm scrobble.

## 8. Suggested overhaul
- **Phase 1:** one shared mini player component; queue/connect empty state; art fallback.
- **Phase 2:** lyrics on the desktop (opt-in); lyrics offset nudge; translation of lyrics via the
  AI (local-first, opt-in).
- **Phase 3:** Dashboard "Now playing" lane parity with the mini player; per-app volume in the
  Now Playing window (Windows audio session API).
- **Risks:** Spotify API policy changes (Development Mode limits), GSMTC differences per app.

## 9. Fable pass brief
```
Feature: Lens Music. Code: src-tauri/src/music/*, commands/music.rs, src/music/*.
Do:
1. One shared mini player component (Dock, Top Bar, browser sidebar).
2. Queue panel empty state with inline Connect Spotify + 3-step guide.
3. Art fallback gradient; lyrics offset nudge per track.
4. Spotify loopback port fallback + clear error; meter follows default device changes.
5. Theme-follow respects an explicit theme pick for the session; one style write per change.
6. Toasts for swallowed errors in src/music.
Check: bun test src; cargo music tests; parity music; motion lint.
Manual: Spotify Premium connect, Apple Music, Bluetooth device switch.
Don't: patch Spotify or run Spicetify; capture audio.
```
