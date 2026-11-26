# Changelog

All notable changes to Lens are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/). Pre-1.0 releases may change settings formats; Lens backs
up and migrates `%APPDATA%\LensUI` where it can.

## [Unreleased]

### Fixed
- **The hot-corner picker couldn't be clicked while Hot corners was off.** It's dimmed now, not
  dead, so you can set corners up first; only "Try it" needs the feature on.
- **Some Settings switches vanished or stopped responding after one click** (Animated backdrop,
  startup apps, Animation effects). They now stay put, keep keyboard focus, and say why when
  Windows refuses.
- **Failures in Settings no longer pass silently.** A refused save, a page action or a Windows
  setting that didn't change now says so in the toast or next to the control.
- **Contrast in every theme pack.** All 87 packs now keep body text at 4.5:1 and hints, icons and
  the accent at 3:1 on surfaces and cards. Lighter dark packs (Catppuccin, One Dark, Monokai and
  others) get brighter secondary text, and two light packs' accents are a shade darker. The full
  table is in docs/THEMES_AUDIT.md.
- **The Dock could fail to show on another monitor.** Moving a window onto a monitor with other
  scaling makes Windows resize it on the way, so the Dock (and the extra Top Bars) could end up the
  wrong size, with the Dock pushed off the screen. Every placement is now checked and done again
  when it didn't land, and an idle Dock goes back to its place about every two seconds, also while
  it is auto-hidden.
- **Pop-outs from a Dock on the left or right edge** now open on the Dock's own monitor with
  "Follow the pointer", never over the Dock, and use the top of the screen when there is no Top Bar.
- **Settings and Search could cover the Dock on small, highly scaled screens** (1280×720 at 150 %).
- **After Explorer restarts, apps asking for attention still show on the Dock.**
- **A refused window call no longer leaves the Dock or a pop-out stuck.** Closing a pop-out, the
  Dock's click-through and its "menu closed" report are tried again, and what failed is logged.
- **Lens's window buttons could be drawn over anti-cheat games.** The engine that draws them kept
  its own list of four names; the shared list has 42. It now uses the shared list, as do tiling,
  Alt+drag, the keyboard hook and pointer effects, and a test fails the build if any of them names
  a process itself again. Fullscreen windows are skipped even when they keep a title-bar style.
- **Apps on the window-button exclusion list still got buttons.** The list is now honoured, and
  has a home: Settings › Windows & Keys › Window styling › Apps and window buttons, where
  protected apps show a locked "Protected" badge.
- **Window button styles did nothing outside Lens's own windows.** Soft, Small dots and Pills are
  now drawn over other apps too.

### Changed
- **Sentence case** for the Top Bar's button names ("Previous desktop", "Wi-Fi and network") and
  the remaining Title Case labels in Settings; Settings controls also got consistent hover,
  pressed and disabled states.
- **Top Bar buttons are named in sentence case** for screen readers ("Previous track", "Volume and
  audio mixer"). Lens Command's results and Magic's "what to act on" changes are announced.
- **Snip's shortcut is Ctrl+Alt+X** (was Ctrl+Shift+S, which is Save As in most apps). If you never
  changed it, it moves once; a shortcut you chose is kept. Snip's settings warn when a shortcut
  would break a common app shortcut, and the shortcuts sheet shows the one Snip really has.
- **The Updates card says so when updates can't run.** A build without an update key (releases
  aren't signed yet, or a development build) shows why and a button to the Releases page instead
  of a "Check now" that could never find anything.
- **Lens no longer changes Windows' accent colour on its own.** Picking a Lens accent used to
  write it into Windows' accent (title bars, Start, the taskbar) as well. That's now a separate
  "Also use this accent in Windows" option under Appearance, off by default; turning it off puts
  Windows' own accent back.

### Added
- **Pointer halo switch** (Settings › Dock & Bar › Top Bar). The see-through ring that shows where
  clicks pass through the Top Bar can be turned off, and it is never drawn while Windows'
  transparency effects are off.
- **How long pop-outs wait before closing** (Settings › Dock & Bar › Advanced › Close after): Short,
  Normal (the old 1.5 s / 1.8 s) or Long, for Quick Settings and Settings on the Dock.
- **Safety card** (Settings › About & Testing › Safety net): what Lens changes on this PC, from
  the same list Remove all walks; what it never touches; the keys that always reach Windows; Safe
  Mode; holding Shift at sign-in to skip Lens; and buttons to Report a problem and Remove all.
- **Window buttons on the left** (Apps and window buttons › Buttons on the): used where a window's
  title bar is free on the left; apps with tabs or tools there keep their buttons on the right.
- **Command teaches where settings live.** After Command changes a setting, the card says where to
  find it ("Settings › Dock & Bar › Dock style") with a "Show me" link.
- **Magic Start and Shelf to Notes (M4, off by default):** with the Magic button on, a Windows-key
  tap opens Lens Magic Start (search, pinned apps, Magic actions, recent files and Shelf items, Lock
  and Windows Start). Ctrl+Esc always opens Windows Start, Win+key shortcuts are untouched, and if
  Lens doesn't answer within 300 ms Windows Start opens instead. With Shelf to Notes on, "Make a
  note" in the Shelf saves a note to Lens Notes, exports it as Markdown, text or PDF, or sends it to
  a Matrix room after you approve the exact text. See docs/MAGIC.md and docs/SHELF.md.
- **Dashboard widgets and X (M2, off by default):** with Magic Dashboard and Widgets on, the
  Dashboard's Widgets lane takes widgets from a small gallery (weather, a news feed, a GitHub
  release, crypto prices, world clocks, this PC). Each one shows the sites it will fetch from and
  asks before it's added; Sources lists every approved site with Remove and a switch that stops all
  widget fetching. Lens does the fetching (https only, never this PC or the local network). The X
  lane shows X's own timeline embed with your OK, plus an Open X button. Every card has "Ask about
  this", which puts only that card's words into Ask. Empty Inbox, Feeds and Today lanes open the
  place that fills them. See docs/DASHBOARD.md.
- **Magic Dashboard (M1, off by default):** with Magic Dashboard on, "dashboard" in Command or the
  Top Bar button opens a slim panel with Inbox, Feeds, Today, Shelf and Now playing lanes filled
  from Lens's own data, in Glance, Focus or Board. Nothing is fetched from the network. Learned
  ordering stays off unless you turn it on, and can be forgotten. See docs/DASHBOARD.md.
- **Magic previews (off by default):** the groundwork for the Magic Dashboard, Magic Mouse, the
  Magic button, Shelf to Notes and Lens Studio v2. Nothing changes unless you turn one on in
  Settings › About & Testing › Magic (preview), which only appears in Tester mode. See
  docs/plans/MAGIC_WAVES.md.
- **ThumbDesk in Lens:** the controller companion from the makers of Lens (use the whole PC from an
  Xbox or PlayStation controller) is in Lens Apps under "From the makers of Lens", with a "Use a
  controller" card in Settings › Gaming and Accessibility, `/thumbdesk` in Command, and a small
  "Voice"/"Paused" badge on its Dock icon. Lens keeps it as a verified portable program in its own
  apps folder and only reads its status.
- Lens Apps supports portable apps (`"portable": true`): kept in Lens's apps folder, removed by
  deleting that folder.
### Changed
- **Themes change colours only.** Applying a theme or featured look no longer changes the Dock's
  style, size, motion or position; the look's font and shape style come along only when "Also use
  the look's font and shape" is ticked. Theme descriptions no longer promise a Dock layout.
- **Settings and the Dock search keep their own size** on every Dock style (Slim and Minimal no
  longer squeeze them, Taskbar no longer stretches them across the screen). With the Taskbar
  style they open like the Windows 11 Start menu and Search: above the bar with Windows' gap,
  centred or at the start side, not fused to the bar.
- Picking Dock styles quickly restyles the Dock once, when the clicks stop.

- **Lens Browser sidebar, simpler:** open tabs come first in quiet Today / Earlier sections (or by
  site, or one list); pinned tabs and favourite bookmarks are icon tiles; folders sit at the bottom,
  one line each; chats fold away; sleep, audio and pin show on hover. Find a tab with Ctrl+Shift+A.
- **Make it yours › Sidebar:** full or icons only, left or right, width, grouping, and whether
  chats, now playing and spaces show.
- **Lens row in the sidebar:** Tidy (also Ctrl+Shift+K), Close duplicates and Group by site now
  show what they will change and wait for Apply; Summarise asks about your open tabs.
### Added
- **Lens setup on the first launch and after every new version:** pick a Dock (floating is the
  default), colours and optional extras, or read what's new after an update. Nothing changes
  until Finish, and Skip keeps everything as it is. Run it again from Settings › About & Testing
  or by typing "setup" in Command (docs/SETUP.md).
- **Launch-Lens-UI.bat** says "Lens", installs dependencies only when `bun.lock` changed, offers
  the dev build or your last built Lens, and opens the setup once after the folder was updated.
- **Lens › in right-click menus.** Dock app and Shelf item menus end with a "Lens ›" row with the
  Lens logo. Hover it, click it or press → to pan the menu into the Magic actions for that item;
  ← or Esc pans back. Picking one runs it in the Magic window. Alt+right-click still opens the
  Magic window directly.
- Shelf items have a right-click menu: Use as context, Copy, Pin, Remove, and Lens ›.
- The File Explorer "Lens ›" menu (off until you add it in Settings › Connections) now also
  appears inside folders and on drives. Existing installs see **Update…** to add the new places.
- **Restart to update:** when a Lens update is available or downloaded, the Top Bar shows a pill
  and you get one notification. "Get it ready" mode downloads (and verifies) in the background;
  nothing installs until you choose Restart to update, which puts the desktop back, installs and
  starts Lens again. What's new is shown in Settings › About & Testing › Updates. Also `/update`
  in Command and "Check for updates…" in the tray menu.
- **Report a problem:** Settings › About & Testing, the tray menu, `/report` in Command and the
  card a crashed window shows. Choose what to attach (versions, recent log, latest crash report,
  self-test, which features are on), see exactly what will be shared with user names, e-mail
  addresses and keys removed, then open a prefilled GitHub issue, copy it, or save it. Lens
  uploads nothing itself.

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
