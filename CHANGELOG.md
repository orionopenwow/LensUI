# Changelog

All notable changes to Lens UI are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/). Pre-1.0 releases may change settings formats; Lens backs
up and migrates `%APPDATA%\LensUI` where it can.

## [Unreleased]

## [0.2.0-beta] - Unreleased

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
- Crash reporting, the updater and the plugin-frame command are not wired into `lib.rs` in this
  change (see `docs/RELEASING.md` → "Wiring pending"). Until they are, the new cards show empty or
  "unavailable" states, and **plugins will not run** because the stricter CSP blocks the old inline
  fallback. Wire them in the same release.
- The CSP was proven in a headless Chromium harness with mocked Tauri APIs (0 violations across all
  11 surfaces and the 4 example plugins), not inside WebView2.
- Grant signing and verification are unit-tested (HMAC test vectors, tamper cases); creating and
  reading the DPAPI-protected key on a real profile has no automated test.
- The release workflow has not been run against a real tag; no signing key exists for the
  repository yet.
- Installers are not Authenticode-signed, so SmartScreen will warn on first run.

## [0.1.0]

- Initial import of Lens UI.

[Unreleased]: https://github.com/orionopenwow/lensui/compare/v0.2.0...HEAD
[0.2.0-beta]: https://github.com/orionopenwow/lensui/releases/tag/v0.2.0
[0.1.0]: https://github.com/orionopenwow/lensui/commit/ad52a44
