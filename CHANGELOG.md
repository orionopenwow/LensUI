# Changelog

All notable changes to Lens are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/). Pre-1.0 releases may change settings formats; Lens backs
up and migrates `%APPDATA%\LensUI` where it can.

## [Unreleased]

### Added
- **Lens Browser tab styles.** Make it yours › Tab position: Vertical (the sidebar) or Horizontal,
  with five styles drawn by Lens: Curved, Joined, Compact (one row, icon tabs), Dynamic (address
  bar, then tabs; the previous horizontal look) and Merged (the open tab is the address bar). Spaces,
  pinned tabs, folders (a dropdown chip), split view, the AI panel and the keyboard work in each.
- **A short Lens Browser setup on first open.** Bring your bookmarks and tabs (with a count first),
  pick how tabs look, choose ad blocking and a search engine (listed alphabetically, none
  recommended), and turn the AI panel on or off. Nothing changes until Done; Skip leaves
  everything as it was. Run it again from Settings › Lens Browser.
- **Lens Browser blocks ads and trackers inside pages.** Scripts, images and frames from ad and
  tracker hosts are filtered with EasyList and EasyPrivacy (downloaded weekly from easylist.to,
  credited in THIRD_PARTY_NOTICES) on top of Lens's own short list. A shield in the address bar
  shows how many requests were blocked on the page; click it to allow ads on that site. On by
  default; it only changes what Lens Browser's own tabs load. Not yet run on a real PC.
- **Split view in Lens Browser.** Drag a tab onto the page to open it beside the current one, or
  press Ctrl+Shift+S; Ctrl+Shift+X swaps sides; drag the divider (or use the arrow keys on it) to
  resize. Click into either page to work there. Not yet run on a real PC.
- **Real site icons in Lens Browser.** Lens fetches each site's icon once, from that site, and keeps
  it on this PC; the frame only ever sees a checked image. Letter icons when there is none, or
  with Settings › Lens Browser › Site icons off.
- **A fuller import from Arc and Zen.** Arc spaces keep their colour and emoji, nested folders, split
  views and the favourites row; Air Traffic Control rules are found and counted. Zen workspaces,
  essentials, folders and splits come over too. Still undoable in one step. (Ideas learned from
  Ardia; no code used.)
- **Immersive: Now Playing full screen (learned from Cider).** Big artwork, its colours drifting
  slowly behind it as soft gradients, and big synced lyrics with the line being sung bright. Open
  it from Now Playing (or F11 there), the Dock music card, or by typing "immersive" in Lens
  Command; Esc leaves. The cursor and controls hide after a few seconds without the mouse moving.
  It opens on the monitor you're using and never over a full-screen game or film, stays still
  when motion is reduced, and stops drawing while it's hidden. An optional sound glow is in
  Settings › Music › Tweaks.
- **Now Playing takes its colours from the artwork**, and only where they read: every accent is
  checked at 4.5:1 against the background it sits on, otherwise your theme accent is used. The
  window is matte now (no blurred copy of the cover, no glass panels).
- **Lyric timing per song.** −0.5 s / +0.5 s (or `[` / `]`) when a song's lyrics run early or
  late; Lens remembers it for that song.
- **Lyric translation (opt-in).** Settings › Music › Synced lyrics › Offer translations. Lens AI
  translates the lyric lines: your local model when one is running, otherwise the AI you chose,
  under its privacy mode ("Ask each time" asks first). It says who translated, keeps the result on
  this PC, and you can show the original, the translation or both.
- **Show what you're listening to on Discord (opt-in).** Through the Discord app on this PC only;
  Lens itself sends nothing over the internet. Needs your own Discord application ID; Private
  listening hides it.
- **Equalizer, the honest way.** Lens has no audio engine of its own, so Settings › Music ›
  Equalizer works with Equalizer APO (free, by Jonas Thedering): pick Flat, More bass, Clear
  voices, More treble or Late night and Lens switches its preset with one marked line; Off and
  Remove all Lens changes take it out again. Not installed? Get it from Lens Apps. Spatial sound
  opens Windows' Sound settings, because apps can't switch it.
- **Lens Remote (Tester mode preview).** Control the music from your phone on the same home
  network after scanning a one-time code. Off by default, home network only, stops by itself after
  10 minutes without use, with a "Remote on" pill in the Top Bar. It's plain HTTP on your network
  (no certificate is possible there), which is why it's a preview; Settings explains the limits.
- **Music setup and Tweaks.** A short three-step setup at the top of Settings › Music (skip it any
  time) and a Tweaks section that groups the advanced options.
- **Controls you can feel.** Buttons, tiles, chips, switches and rows in Settings, setup, Quick
  settings and Search now press like a well-made key: they sink the moment you press (mouse, touch
  or Space/Enter), stay visibly pressed for at least 90 ms even on the fastest click, and spring
  back with a small, damped settle. Three weights: rows and tabs only darken a step, buttons sink a
  little, primary and destructive actions sink deeper. A button that starts work stays pressed
  until it's done and shows a small spinner after 300 ms, without changing size. Switch knobs
  squash slightly as you press and travel with the spring; segmented choices slide their
  highlight to the new option; sliders grow a pixel while you hold them. With reduced motion,
  presses show only the colour step.
- **Things come from somewhere.** Quick settings and Search grow out of the Top Bar button that
  opened them and shrink back into it when they close; Settings pages and setup steps slide in the
  direction you're going. The windows themselves never move or resize during the motion.
- **Magic selection bar and Magic Search (off by default).** Turn it on in Settings › AI &
  Command › Selection bar. Select text anywhere and a small matte bar appears just below it:
  Cut, Copy and Paste (only when they'd work, sent to the app you're in, which keeps the focus),
  Magic Search, and up to nine of your own actions from the right-click catalogue, each with an
  optional hotkey (none by default, checked against Windows, Lens and app keys). It recognises
  links, e-mail addresses, sums, units, colours, paths and code and shows a one-line preview,
  worked out on this PC. **Magic Search** opens a pop-out by the selection with a short cited
  answer (your local model first; a cloud AI only as your AI settings allow, and it says which
  answered), web results from your Lens Browser search engine and Wikipedia, and matches from your
  Shelf, clipboard history, notes and recent files (found on this PC, never sent). Follow-ups,
  copy with or without sources, save to the Shelf or as a note, and replace the selection (asks
  first). Also from Command ("magic search …") and the Magic window. It works everywhere except
  terminals, consoles, remote-desktop and VM windows, password managers, password fields,
  elevated apps and games, and you can change the list. It replaces the selection bubble; if the
  bubble was on, the bar is on. Not yet confirmed on a real PC.
- **Lens Apps has a Library.** A second view next to Discover lists everything from the catalogue
  that's on this PC, with the installed version, what an update would bring ("4.5.1 → 4.5.3"), who
  made each app and its licence. **Update all** asks once, on the same approval card as everything
  else, and shows every app, its version change and its source; updates then run one at a time and
  any that hasn't started can be cancelled. Nothing updates by itself. If winget can't be asked,
  the Library says so instead of showing an empty list.
- **Credits and licences in plain words.** Every app page now has a "Credits and licence" section:
  who made it, where the source is, and what the licence means for you in one or two sentences
  (permissive, copyleft, network copyleft, weak copyleft, or free but not open source). When Lens
  hasn't read the licence in the project's own repository yet, it says that too. Cards and Library
  rows carry the same licence chip, and each page ends with "Names belong to each project. Lens
  isn't affiliated with them."
- **A real screenshot gallery on app pages.** Previous / next, dots and the arrow keys, with a line
  saying which project each image comes from. It moves on by itself only until you take over, never
  while the window is hidden, and not at all with reduced motion.
- **Remind me, on any to-do in Lens Notes.** A small bell at the end of an unticked to-do offers
  "In an hour", "This evening" and "Tomorrow morning" and sets a Lens Timer reminder named after the
  to-do. It rings whether or not Notes or Timer is open.
- **"Make stickies clickable" is a button in Lens Notes**, not only Ctrl+Shift+U, so a click-through
  sticky always has a visible way back.
- **Live text in Lens Snip.** In the studio, press L (or the new Select text tool) and the words
  Windows OCR found become selectable on the image: drag across them, double-click a line, or use
  the arrow keys with Shift. Copy just those words, highlight them, or hide them, each snapped to
  the text. Links, email addresses, phone numbers and sign-in codes in the snip get a one-press
  copy. Everything is read on this PC and nothing is sent. Not yet confirmed on a real PC (OCR word
  boxes come from Windows).
- **Undo when you remove a snip from history or an item from the Shelf.** A snip is really deleted
  five seconds after Remove; a Shelf item can be put back for six.
- **The Menu key and Shift+F10 open a Shelf item's menu** with "Lens ›" focused, and focus returns
  to the item when the menu closes.
- **Dock keys: the Dock works from the keyboard.** With a Dock icon focused (Tab from search, or
  after a click) the arrow keys along the Dock move between icons, Home and End jump to the ends,
  and typing finds an app by name: the others step back and a small chip shows what you typed
  (the same letter again steps through apps that start with it). The arrow that points into the
  screen opens the app's window list and moves into it: Up and Down between windows, Enter to
  switch, Delete to close one, Esc back to the icon. The titles list now shows every window (it
  stopped at seven). No setting and nothing changed in Windows. Not yet confirmed on a real PC.
- **The Dock says when something didn't work.** Opening an app, switching or closing a window, or
  opening Settings from the Dock used to fail without a word; a short line now appears beside the
  Dock ("Couldn't open Spotify.") and goes by itself.
- **Small touches on the Dock:** a newly pinned app drops into place and settles; badge counts roll
  when they change; the search panel's rows arrive in order. All still with reduced motion.
- **Desktop widgets (preview, off by default).** Widgets pinned on the desktop in a snapping grid,
  above the wallpaper and below every app window: an analog clock and a world clock, today's list
  from the Lens calendar (tick items off in place), your latest Lens Notes, Now playing with
  play/pause and skip, this PC's battery, and the Dashboard widgets you already approved (weather, a
  feed…). Right-click a widget for Small, Medium or Large, Edit and Remove; Edit Widgets… dims the
  desktop and opens a gallery with search, kinds and size previews to click or drag onto the
  desktop. Neighbours glide out of the way (transform only; still with reduced motion). The widgets
  never take the focus, stay out of Alt+Tab and the taskbar, let clicks through between them, hide
  for fullscreen apps and anti-cheat games, and stop their one shared clock while hidden or covered.
  Turn it on in Settings › About & Testing › Magic (preview) or the Dashboard's Widgets lane; Command
  "edit widgets" opens the gallery. Uses only data on this PC; layouts are kept per monitor in
  `%APPDATA%\LensUI\desktop-widgets.json`.
- **The Dock's music pop-out, redone (hover Spotify in the Dock).** Bigger artwork with the title,
  artist and a small live level meter; elapsed time, a seek bar you can click, drag or move with
  the arrow keys, and the length; Up next, previous, play/pause, next and a Search button that
  opens Spotify's search. A soft "sound glow" in the artwork's colours (or your accent, with no
  artwork) rises from the Dock edge and breathes with the music. It stays matte and opaque (no
  blur), is still when motion is reduced, and keeps text at 4.5:1 or moves below the controls.
  Both are on by default and can be turned off in Settings › Music › Dock music pop-out; they read
  the speakers' level (one number, no sound) only while the pop-out is open and music plays.
  "Media controls in the Top Bar" moved from the pop-out to the same page.

### Fixed
- **The Top Bar no longer stays up after Lens was briefly busy.** If Lens's window watcher was held up
  for a couple of seconds (most often right after start-up), an auto-hidden Top Bar could stay on
  screen until the pointer touched the top edge; it now hides as soon as the watcher runs again.
- **A click outside the Launcher closes it even when Windows didn't give it the focus.** It used to
  stay open behind your apps until you opened and closed it again.
- **Alarms keep their time when the clocks change.** A Lens Timer alarm set for 07:00 rang at 06:00
  or 08:00 after daylight saving started or ended, or after a move to another time zone. Alarms now
  follow the PC's local time. A timer or alarm that comes due while the PC is asleep says it is
  late when it rings. Not yet confirmed on a real PC.
- **An alarm that is only waiting no longer wakes Lens every second.** The timer thread used to
  tick and notify every Lens window once a second for as long as any alarm was switched on.
- **Apps Lens keeps itself can be removed from Lens Apps.** ThumbDesk and other portable releases
  had no Remove in the ⋯ menu. Failed removals, "Undo Lens setup", Open and Show in folder now say
  when they didn't work, and Retry on a failed update retries the update.
- **Two Lens Apps settings that did nothing are gone.** "Update apps Lens installed automatically"
  and "Check for updates" were saved but never read. The card now says how updates really work.
- **Lens Apps keeps the keyboard.** Opening an app's page moves focus to it, Esc goes back from
  anywhere on the page, and focus returns to the card you came from.
- **Failures in the Lens apps no longer pass silently.** Core apps (Monitor, Startup & Uninstall,
  Timer, Calculator, Color, Notes, Power, Network, Clipboard), Lens Cleaner, Feeds, Messages and
  their Settings cards now say when something you asked for didn't happen. A Stop that didn't reach
  a scan says the scan is still running; a reply that couldn't be sent stays on screen until you
  close it.
- **Text you cropped out of a snip no longer goes with it.** Copy text, Shelf, Paste to Claude, Ask
  and Translate now use only the words still inside the crop (and inside a freeform outline).
- **Cropping in the Snip studio no longer stretches the picture or misplaces new marks.** The crop
  is an outline while you edit and is applied when you copy, save or share.
- **Enter on a focused Snip studio button no longer also runs Copy**, and typing in the language
  list no longer triggers shortcuts.
- **Snip history shows the newest search** when answers arrive out of order, and says so when
  Keep, Remove or opening a snip fails.
- **Voice conversation no longer leaves a listener behind when interrupted**, and its hidden
  window no longer redraws every second.
- **Failures in Snip, voice, Magic Start and the Shelf no longer pass silently.** They are said
  where you are, or written to the log with what was being done.
- **Magic Start keeps the selected row in view and announces it** to screen readers.
- **"Snip this window" and "Open in Lens Browser" now appear in the Magic window** (Snip while
  Lens Snip is on; Lens Browser for browser windows). Snip opens in window mode with that window
  under the pointer, so one click takes it.
- **Windows on the wrong Dock icon.** A window Lens couldn't name (an app running as
  administrator) could sit on any pinned app with "app" in its name, such as WhatsApp, and one
  window could show on two pins (Notepad on both Notepad and Notepad++). A window now sits on one
  pin: the one that is exactly its program, and only otherwise the closest name.
- **The Dock's right-click menu could open partly off the screen** on a Dock at the left or right
  edge, and under the Top Bar. It is placed from its real size now.
- **Icon sizes in the Dock's right-click menu did nothing on some styles** (Slim, Taskbar, Studio,
  Islands, Unified, or any style given its own size) and marked the wrong size. They change the
  size you see, on every style.
- **Top Bar buttons could stay click-through after a refused report.** The bar tells Lens where
  its buttons are; a report Lens refused was remembered as sent and never tried again.
- **The Launcher closed before it could say an app didn't open.** It now closes once the app has
  been asked to open, and stays with the reason when that fails.
- **The Top Bar redrew itself every second** to show a clock that changes once a minute. It and the
  Dock's clock now wake on the minute, and not while hidden.
- **Plainer names on the Dock.** Menu rows are in sentence case and say what they do ("Run as
  administrator", "Open file location", "Add divider after", "Close all 3 windows"), the menu is a
  real menu for screen readers, and its icons follow the theme.
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
- **Lens's own app icons are simpler and bolder.** Monitor, Timer, Notes, Calculator, Color, Power,
  Network, Clipboard, Startup, Feeds and Messages (in the Dock, Search, Command and their title
  bars), and Lens's apps on the website, now share one set: a thick white glyph on a plain dark
  tile, with no colours, gradients or glow, so they stay readable at small sizes. Lens Browser keeps
  the Lens logo, redrawn flat so it is crisp in the Dock. Other apps' icons are unchanged.
- **Lens Apps, the core apps, Cleaner, Feeds and Messages feel like the rest of Lens.** Every button
  declares a press weight for the new press system, small controls have 32 px targets, Lens Cleaner
  uses the shared motion timings, and Lens Apps draws only with theme colours (the danger button's
  white text and two fixed ambers are gone).
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
- **Magic Mouse (M3, off by default):** turning it on (Settings asks first) gives you the Lens
  Magic pointer, the Lens cloud in a ring, at every Windows pointer size, with a high-contrast
  variant. Hold the left button, then drag, to grab part of the screen and copy it, copy its
  text, save it, put it on the Shelf or ask Claude about it (Claude asks before anything leaves
  your PC). Hold and let go to open Magic. A quick click is still a click. Your own pointers come
  back when it's off, on exit, after a crash, with Remove all, and while a game or fullscreen app
  is in front. See docs/CURSORS.md.
- **Unified Dock style.** One floating pill: the Launcher first, your apps, then the tray, a
  notification bell with a count and a two-line clock (the time, and "Thu 26 Nov" below it). Pick
  it in Settings › Dock & Bar or in the setup wizard. Settings and Search open above it at the same
  width as on Floating.
- **Window carousel.** Pointing at an app with two or more windows shows them as a carousel: the
  current window large in the middle with its title and a close button, its neighbours peeking in,
  and dots below. Scroll, use ‹ ›, the arrow keys or the dots to move; click to switch to it.
- **Window-count marks on every Dock style.** A short dash under an app with one window, three
  small dots under one with several.
- **The Dock reflows smoothly** when apps are pinned, unpinned, reordered, opened or closed
  (instant with reduced motion).
- **Pin glyphs in the Launcher.** Apps pinned to the Dock show a small pin; right-click to pin or
  unpin.
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

### Developer
- **Lens Mission Control** (dev builds only, docs/MISSION_CONTROL.md): the maintainer's admin
  window for running the project. Pulse (main CI, Pages, PRs, release, dev folder, bugs, research
  top 3, trends), a PR board with READY / WAIT / BLOCKED and known-flake detection, one bugs
  inbox, ranked suggestions from research, the combinator and Fable notes, real-PC checklists,
  roadmap, quality (tests, flaky-test leaderboard, perf budgets, goldens), releases, dev folder,
  the local Lens, schedules and agents with "Copy brief", and the project brain. Read-only by
  default; every write is shown exactly and confirmed, and goes to a local audit log. The GitHub
  token stays in Windows Credential Manager. It is compiled only with the `admin` feature that
  Launch-Lens-UI.bat's dev build turns on; release builds can't include it, and CI checks that.

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
