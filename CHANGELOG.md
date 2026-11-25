# Changelog

All notable changes to Lens are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/). Pre-1.0 releases may change settings formats; Lens backs
up and migrates `%APPDATA%\LensUI` where it can.

## [Unreleased]

### Added
- **ThumbDesk in Lens:** the controller companion from the makers of Lens (use the whole PC from an
  Xbox or PlayStation controller) is in Lens Apps under "From the makers of Lens", with a "Use a
  controller" card in Settings › Gaming and Accessibility, `/thumbdesk` in Command, and a small
  "Voice"/"Paused" badge on its Dock icon. Lens keeps it as a verified portable program in its own
  apps folder and only reads its status.
- Lens Apps supports portable apps (`"portable": true`): kept in Lens's apps folder, removed by
  deleting that folder.

## [0.3.0] - 2026-11-24

First release built by the release workflow. It includes everything listed under 0.2.0-beta,
which was never released on its own. Parts that need a real Windows PC to confirm are listed at
the end.

### Added
- **Lens Browser, rebuilt:** one box for tabs, bookmarks, history and search; a new tab page;
  item-by-item import from your old browser that you can undo; tabs that come back after a
  restart; the AI beside the page with every step shown; video transcripts you can search.
- **Site permissions in Lens Browser:** a bar under the address bar for camera, microphone,
  location, notifications, clipboard and multiple downloads (Block / Allow once / Allow on this
  site), remembered per site and removable from the site button or Settings. No answer means no.
- **Failsafe:** a window that crashes says so and reloads itself, and gives up politely after three
  failures in a row; a dead browser engine process is detected and its window reloaded; a Lens
  that crashes twice at start offers Safe Mode; damaged settings lose only the damaged values.
- **Agent safety wired everywhere:** Command plans, voice, MCP tools, the browser agent, Snip and
  the AI runner all pass through one check for risky links, hidden instructions and data leaks.
- **Themes:** 12 featured looks and the Wallpaper Switcher in the customizer.
- **Backdrop Lab, Living Skies, Lens Cleaner, core apps** (Monitor, Timer, Notes and more), and
  **Lens Feeds and Lens Messages**, now reachable from Command, the Launcher and the dock.
- **Settings Simple / Advanced** with grouped Quick settings.
- **Magic right-click menu** from dock apps (Alt+right-click or "Magic menu"), Shelf items and
  notifications.
- **In-page Lens buttons** next to videos, posts and media in the browser extension.

### Changed
- The product and its AI are now called **Lens** everywhere you see a name. The install folder,
  `%APPDATA%\LensUI` and the app ID are unchanged, so settings carry over.
- Window buttons default to Yellow · Green · Red.
- The Taskbar dock matches Windows 11: 48 px bar, 24 px icons, flat hover and focus plates, and
  pinned apps in the same order as the Windows taskbar.
- Smoother motion: windows, flyouts, meters and bars move on the compositor instead of resizing;
  Settings switches tabs with fewer stalls.
- One clipboard history and one place that writes your settings (safely, refusing settings Lens
  could not load back).
- Command takes keyboard focus as soon as it opens, so the first Enter runs.
- **Start with Windows is now off for new installs** (existing settings are kept).
- The Windhawk window-styling mod is only installed when you click "Install in Windhawk", and it
  now skips every game on Lens's anti-cheat list (42 names, kept in sync by a test).
- "Remove all Lens changes" with "delete data" keeps the Lens data folder when any undo step
  failed, so the backups needed to retry aren't lost.

### Fixed
- Docks that forgot to hide; clicking outside an open dock area now closes it.
- Themes that froze the desktop; buttons that stayed lit after a press.
- A development build that could start at sign-in and cover the desktop.
- "Remove all Lens changes" now also removes the presence pause hotkey (Ctrl+Alt+Pause), the Claude
  Desktop entry and the Spicetify theme, and never deletes folder contents it cannot restore.
- Accessibility: named switches and icon buttons, keyboard focus in the dock menu.

### Not yet confirmed on a real PC
- Site permission prompts in Lens Browser, the Magic menu over dock items, and keyboard focus in
  the dock menu were tested in CI's Windows runner and headless harness, not by hand.
- A first keypress in Command right after it opens may still be lost in rare cases (B-12c).
- One-click transcription setup stays off until its download checksums are pinned (B-07).
- Installers are not Authenticode-signed, so SmartScreen warns on first run.

## [0.2.0-beta] - Not released

Never published on its own; everything below ships in 0.3.0.

The version number in `package.json`, `src-tauri/Cargo.toml` and `src-tauri/tauri.conf.json` is
`0.2.0`; this entry is labelled beta because parts of it have not yet been run on a real Windows
machine (see the last section).

### Added
- Full Windows icon set: `icon.ico` with 16, 20, 24, 32, 40, 48, 64, 96, 128 and 256 px frames (the
  three smallest are drawn separately so they stay sharp), the PNG sizes Tauri bundles, and the
  Microsoft Store tile logos.
- Content Security Policy for every Lens window (previously `null`). Scripts load only from the app
  bundle; plugins, wallpapers and the messaging/AI panes are allowed by name. See
  `docs/RELEASING.md` → "Content Security Policy".
- Plugin grant integrity: approved plugin permissions in `plugins.json` are now signed with a
  per-user key protected by Windows DPAPI. A grant whose signature is missing or wrong is ignored,
  so a plugin cannot give itself permissions by editing the file.
- Plugins now load from their own file (`%APPDATA%\LensUI\plugin-frames\<id>.html`) through the asset
  protocol, so each plugin keeps its own sandbox policy under the stricter app CSP.
- Local crash reports in `%APPDATA%\LensUI\crashes` (newest 10): version, Windows build, panic
  message and backtrace, the last 200 log lines and which features were on. User names and profile
  paths are replaced with placeholders; window titles, clipboard text and notification text are
  left out. Nothing is uploaded. New Control Center card: list, "Copy report", "Open Folder".
- Opt-in updates from GitHub Releases, checked against a signing key before installing. Modes: Off,
  Tell me (default) and Install. New Control Center card with "Check now".
- Release workflow (`.github/workflows/release.yml`): a `v*` tag builds NSIS and MSI installers,
  signs updater artifacts, writes `latest.json` and `SHA256SUMS.txt`, and opens a draft release.
- `docs/RELEASING.md`: secrets, release steps, rollback, Authenticode, winget and Microsoft Store.

### Changed
- Version bumped from 0.1.0 to 0.2.0.
- Installer targets limited to NSIS and MSI.

### Security
- Grants from a `plugins.json` written before this version are trusted once, on the first run that
  creates the signing key, and signed then. After that, unsigned grants are dropped and the plugin
  asks again.
- If the signing key cannot be read (for example the profile was copied to another PC), all plugin
  grants are dropped rather than trusted.

### Experimental / not yet verified at runtime
These parts are compile-checked and unit-tested where possible, but have not been exercised in a running
Lens build on Windows yet:
- Crash reporting, the updater and the plugin-frame command were wired into `lib.rs` before
  0.3.0.
- The CSP was proven in a headless Chromium harness with mocked Tauri APIs (0 violations across all
  11 surfaces and the 4 example plugins), not inside WebView2.
- Grant signing and verification are unit-tested (HMAC test vectors, tamper cases); creating and
  reading the DPAPI-protected key on a real profile has no automated test.
- v0.3.0 is the first tag the release workflow runs against.
- Installers are not Authenticode-signed, so SmartScreen will warn on first run.

## [0.1.0]

- Initial import of Lens UI.

[Unreleased]: https://github.com/orionopenwow/LensUI/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/orionopenwow/LensUI/releases/tag/v0.3.0
[0.1.0]: https://github.com/orionopenwow/LensUI/commit/ad52a44
