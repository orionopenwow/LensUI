# Lens Music — feature dossier

Status date: 2026-11-26 (main at `0db5515`). **Learned from Cider (branch `feature/music-cider-lessons`):** Immersive mode (Now Playing full screen on one monitor: big art, a drifting field of the art's colours as gradients, big synced lyrics, controls that hide with the cursor, optional sound glow; from Now Playing / F11, the Dock music card or Command "immersive"; refuses over a fullscreen app; still when hidden or reduced), Now Playing tinted by the artwork with every accent checked at 4.5:1 (theme accent otherwise) and made matte (blurred art and glass panels removed), a per-song lyric nudge (±0.5 s, saved), opt-in lyric translation through Lens AI under its privacy mode (local model first, cached on this PC, Original / Translated / Both), opt-in Discord Rich Presence over the local pipe with your own application ID and Private listening, a grouped Tweaks section and a three-step Music setup in Settings. Rendered headless (parity `imm*`, `np-*`; visual `nowplaying`, `nowplaying-immersive`); Rust and bun tests; one E2E scenario (`music-immersive`). Not yet confirmed on a real PC. **Follow-up (branch `feature/music-remote-eq`):** Lens Remote phase 1 behind Tester mode (LAN-only web remote, one-time QR pairing, same-/24 + Host + header checks, rate limit, auto-stop, Top Bar pill) and an honest Equalizer card bridging to Equalizer APO (presets via one marked `Include:` line, undone by Off and Remove all) with a Sound settings link for spatial sound. The site has no music section, so its tile was left alone (section 10). **Dock music pop-out (branch `feature/music-sound-glow`):** the Spotify hover card in the Dock (`src/music/DockMusicCard.tsx`, maths in `soundGlow.ts`) now has a 56 px art header with a five-bar level meter, a seekable progress row, Up next / prev / play / next / Search, and a "sound glow" from the Dock edge in the art's colours (theme accent without art) that breathes with `levels.rs` — polled only while the card is open and playing, rAF + transform/opacity, no blur. Settings › Music › Sound glow / Level meter (on by default). `MediaNowPlaying` gained position/duration/seek and `media_control_cmd` a `seek`. Rendered headless (parity + visual `dock-music`); not yet seen on a real PC. **Fable pass (PR #112, 26 November 2026):** Spotify sign-in binds its port first and falls back to 43118/43119 with a clear message (S1 fixed), the queue panel explains itself with an inline Connect Spotify (quick win 1), failed Liked Songs saves are shown, and opt-in lyrics on the desktop exist (the idea in section 6). Compiled and tested by CI only; not confirmed on a real PC or against a real Spotify account. Sources: `docs/MUSIC.md`, `docs/MUSIC_RESEARCH.md`,
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
| Commands (37) | `src-tauri/src/commands/music.rs` |
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
- **Dock music pop-out** (hover Spotify) — built: art + level meter, seek bar, Up next (when Music is on), Search (opens Spotify search), sound glow; works with Music off. Unverified on hardware: seek on real Spotify, the level with real audio, glow smoothness at 30 polls/s.
- **Mini player** on Dock and Top Bar — works (`MiniPlayer.tsx`, `useMiniPlacement.ts`); now-playing
  row in Lens Browser sidebar only while playing (#86).
- **Synced lyrics** (LRCLIB or your `.lrc` folder) — works; cache clearable; big bright current line.
- **Lyrics on the desktop** (opt-in, click-through line under the Top Bar; hidden when paused or a fullscreen app is in front) — built in the Fable pass, unverified on hardware.
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
- **Immersive** (learned from Cider) — built: full screen on the monitor under the pointer, art grows from where it was opened, ambient gradients in the art's colours (transform/opacity, paused when hidden, still with reduced motion), big synced lyrics with FLIP line moves, controls + seek on hover, cursor hides after 3 s (1–10 s in Tweaks), optional sound glow, Esc/F11/× leave and the art returns. Never over a fullscreen app (`music::immersive::may_open`). Unverified on hardware: multi-monitor placement, DPI, F11 inside WebView2, fullscreen detection against games.
- **Artwork tint** — built: `tint.ts` picks a vivid, common palette colour lifted to ≥ 4.5:1 on the hero's top, middle and base (and on Immersive's own field), text on accent fills checked too; the theme accent otherwise. Switch: Settings › Music › Immersive › Artwork colours.
- **Lyric timing per song** — built: −0.5 s / +0.5 s / Reset in the lyrics header and Immersive, `[` / `]` keys; saved in `music\offsets.tsv` (500 songs, keyed by title + artist so it follows the song across apps), added to the global Timing.
- **Lyric translation** (opt-in) — built: Translate in the lyrics header; Lens AI's local model when one runs, otherwise the AI picked in Settings › AI under its privacy mode (Local only refuses cloud; Ask each time shows the shared Send / Don't send card); only the lyric lines are sent; the provider is named under the lyrics; cached in `music\translations\` (cleared with the lyrics cache); Original / Translated / Both.
- **Discord Rich Presence** (opt-in) — built: hand-written client for Discord's local IPC (`\\.\pipe\discord-ipc-0..9`, opcode + length + JSON), your own application ID, "Listening to" with title, artist and time left, Private listening clears it; album art only when Spotify is connected (Discord loads Spotify's https image). Lens makes no network call for it. Unverified against a real Discord client.
- **Lens Remote** (Tester mode, opt-in) — built: `music/remote.rs` (std-only HTTP, pure `handle` with a `Host` trait), QR in `src/music/qr.ts` (byte mode, level M, v1–10; a rendered code was decoded with OpenCV), Settings rows with the risks spelled out, Top Bar "Remote on" pill. Unverified on hardware: Windows Firewall prompt, phones on real Wi-Fi, mesh/guest networks.
- **Equalizer** — built: `music/eq.rs` presets → `lens-music.txt` + one marked include line in Equalizer APO's `config.txt`; Off / Remove all take exactly those out (change registry `equalizer-apo-preset`); Lens Apps entry `equalizer-apo` (official site link). Unverified: write permission on a real Equalizer APO install, and the preset sounding right.
- **Music setup and Tweaks** — built: a three-step setup at the top of Settings › Music until Done or Skip (sources, lyrics + Last.fm, Discord + "remote later"), and a collapsible Tweaks section grouping Look, Sources, Lyrics, Immersive and Playground options.

## 3. Quick wins (≤ 1 day, ranked)
1. **Done (Fable pass).** **Queue panel empty state** that explains "Windows doesn't share queues — connect Spotify to see
   yours" with the Connect button inline (today the panel silently shows recent tracks).
2. **Done (Cider lessons).** **Lyrics offset nudge** (±0.5 s keys) saved per track — LRCLIB timings drift for live versions.
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
| S1 | — fixed (Fable pass) | `music/spotify.rs`, `commands/music.rs` | the port was bound only after the browser had opened, so a busy 43117 surfaced late or not at all. Now bound in `music_spotify_begin`, with fallbacks 43118/43119 (listed as optional redirect URIs), a notice when a fallback is used and an immediate error naming the ports when none is free. Tests: `a_busy_port_falls_back…`, `every_port_busy…`, `the_sign_in_reply_arrives_on_the_fallback_port` |
| Suspected S2 | Low | `levels.rs` | output device change (Bluetooth connect) may leave the meter on the old endpoint until restart |
| Suspected S3 | Low | `themeFollow.ts` | theme-follow + a user theme switch can race (last write wins); respect an explicit theme pick for the session |
| Suspected S4 | Low | `session.rs` | two sessions with identical metadata (browser tab + Spotify) may flip the chosen session |
| B-18 share | Low | `src/music/*` | swallowed errors |
| B-92 (fixed) | — | `src/music/api.ts` | `useNowPlaying` re-rendered Now Playing 8×/s while its window was hidden or minimised; ticks now skip while `document.hidden` (Immersive pauses with it) |
| B-93 (fixed) | — | `src/music/music.css`, `NowPlaying.tsx` | Now Playing used a 64 px blurred copy of the artwork and three `backdrop-filter` glass panels (paint cost on a see-through-capable WebView2 window, and against the matte rule); now matte gradients from the art and solid panels |
| B-94 (fixed) | — | `src/music/music.css` | the lyric auto-scroll measured `offsetTop` against the page instead of the lyrics box once anything sat above it; `.lm-lyrics` is now the offset parent |

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

## 10. Learned from Cider (clean-room)

Cider (cider.sh) is a community Apple Music client people love for its focus. Its licence for this
purpose is unclear, so per COMBINATOR §5 this was **learn only**: built from its public site,
descriptions and observed behaviour; no Cider code, assets or copy were read into or copied into
Lens, and no feature is named after it.

| What makes Cider loved | Lens now | Status |
|---|---|---|
| Immersive mode: full-screen art + synced lyrics as the emotional centrepiece | Immersive (section 2) | Built, headless-tested |
| Pages tinted by the artwork | Artwork tint with 4.5:1 checks | Built |
| Lyric translations | Opt-in, local-first through Lens AI, cached | Built |
| Discord presence and Last.fm out of the box | Discord over the local pipe (opt-in); Last.fm already existed | Built |
| A redesigned first run and a Tweaks page | Music setup + grouped Tweaks in Settings | Built |
| Cider Remote (control from your phone) | **Lens Remote**, LAN only, one-time QR pairing | Built behind **Tester mode** (plain HTTP on the LAN; threat model below) |
| Audio craft: 10-band EQ, spatialisation, credited engineer | **Equalizer APO bridge** (credit: Equalizer APO by Jonas Thedering); spatial sound opens Windows' Sound settings, since apps can't switch it | Built; Lens ships no fake EQ |
| Plugin marketplace | Lens Plugins already exist | No music-specific work |
| A site showing real app states | The site has no music section; the small-apps tile stays as is while the home page is reworked | Not changed |

Lens Remote threat model: no HTTPS on a LAN without a certificate, so a one-time pairing token in
a QR code, then an HttpOnly SameSite=Strict cookie tied to the phone's address; same-/24 private
addresses only, Host header pinned (no DNS rebinding), a custom header on POST (no cross-site
forms), rate limit and a 5-minute block after 5 bad tokens, play/pause/next/previous/seek/volume
only, off by default, a Top Bar pill while on, and an automatic stop after 10 minutes idle.
Someone who can sniff the Wi-Fi could copy a session and control playback until it stops; that
honest limit is why it ships behind Tester mode. Lens adds no firewall rule (Windows may ask once).

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
