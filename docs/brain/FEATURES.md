# Features: everything Lens does, and everything it could

The complete catalogue: every capability on `main`, every one in an open pull request, and every suggestion from reviews and research, de-duplicated, each with a one-line why. Brand and mission rules are in [IDENTITY.md](IDENTITY.md).

| | |
|---|---|
| Last reviewed | 24 November 2026: `main` after 0.3.0 (#78), #79 pending, open PRs #79 and #82–#89 |
| How to update | Change a row in the PR that changes the feature. When a PR merges, move its rows from **In PR** to **Shipped**. New ideas go to [Suggested](#suggested-all-time-backlog) with a source and a one-line why; never delete an idea, mark it **Dropped** with the reason. |

**Status:** **Shipped** = on `main`. **In PR #n** = open pull request. **Planned** = scoped in a plan doc (MASTERPLAN, a feature doc's "Deferred"). **Idea** = suggested, not scoped. **Dropped** = decided against (reason given). **R** marks a modern-rewrite foundation (see [IDENTITY §6](IDENTITY.md#6-the-modern-rewrite-what-built-right-means-now)).

Bug ids (B-xx) are in [BUGS.md](BUGS.md). Per-feature design docs remain the source of truth for each package.

---

## Foundations (the modern rewrite)

| Foundation | Status | Where | Why it matters |
|---|---|---|---|
| **R** Motion system: glide, usePresence, FLIP, duration/easing tokens, motion lint with a ratchet | Shipped (#61, #75) | `src/ui/motion`, `tools/polish/motion-lint.mjs`, `docs/SMOOTHNESS.md` | Transform-only motion by construction; layout animations can't creep back |
| **R** Failsafe: error boundary per surface, auto-reload, crash-loop guard + Safe Mode, circuit breakers, config validation, guarded native callbacks | Shipped (#66, #70) | `src-tauri/src/failsafe/*`, `src/failsafe/*`, `docs/FAILSAFE.md` | One fault never breaks the desktop |
| **R** Renderer watchdog (WebView2 ProcessFailed per webview, reload) | Shipped (#73, hardened in #74) | `app/renderer.rs`, `app/loadguard.rs` | A dead page comes back; B-31 |
| **R** One build per window label (no duplicate lazy windows) | Shipped (#74) | `app/setup.rs` | Removed a startup race that built Settings twice |
| **R** Single input service | Shipped (#62) | `src-tauri/src/input.rs` | One keyboard/mouse hook owner |
| **R** Change registry + Remove all | Shipped (#62, #76) | `src-tauri/src/changes.rs`, `tools/changes/check.mjs` | Every OS change has an undo, checked in CI |
| **R** Single settings writer (atomic, validated) | Shipped (#70) | `config::write_config_file` | Settings can't be half-written or written with values Lens can't read back |
| **R** One clipboard history | Shipped (#70) | `clip/` | No duplicate stores or privacy rules |
| **R** One approval card and `agentsafe::gate` on every agent path | Shipped (#63) | `agentsafe/`, `src/approval/*` | B-04 closed |
| **R** Window placement and surface state | Shipped (#61, #62) | `app/place.rs`, `app/surface_state.rs` | Windows land in the right place, at the right DPI |
| **R** Generated IPC types, Guide index, brain inventories | Shipped | `tools/gen-types`, `tools/guide`, `tools/brain` | Drift fails CI |
| **R** Quality rigs: visual parity + goldens, perf budgets, a11y (axe), chaos, soak, real-Windows E2E, failsafe E2E, Smoothness probe | Shipped | `tools/parity`, `tools/perf`, `tools/robust`, `tests/e2e`, `src/smooth` | Regressions caught before people see them |
| **R** Caption parity rig (8,806 window-button cases, zero diff) | Shipped (#80) | `tools/parity/caption` | Window buttons blend on every title bar |
| **R** Theme-switch rig (sizes, flashes, function after switch) | In PR #88 | `tools/robust` | Theme switches can't grow or glitch things again |

## Desktop shell and docks

| Feature | Status | Entry points | Key files | Notes |
|---|---|---|---|---|
| Dock (pins, running apps, magnification, auto-hide, reorder, stacks) | Shipped | Always on; Alt+1…9 | `src/surfaces/DockSurface.tsx`, `src/dock/*`, `commands/dock.rs` | 9 styles |
| Dock styles (Floating default, Taskbar at Windows 11 proportions, Rail, Minimal, Split…) | Shipped (#68, #72) | Settings › Dock & Bar | `src/dock/styles/*`, `docs/DOCK_STYLES.md` | Consistent Settings/search placement in every style: In PR #83 |
| Taskbar-style hover and focus plates | Shipped (#72) | Taskbar style | `DockSurface.css` | Flat Windows 11 plates, no lift or glow |
| Window previews on hover, anchored to the icon, close on leave | In PR #79 | Hover a running app | `win_previews.rs` | Fixes previews stuck bottom-right |
| Auto-hide that always re-hides; quick slide instead of snap | In PR #79 (native), In PR #83 (slide) | Settings › Dock & Bar | `app/watcher.rs` | Top dock no longer sticks |
| App attention (flash → orange, one bounce, highlight until activated) | In PR #79 (native) + #83 (render) | Automatic | `attention.rs` | Same as Windows taskbar flashing |
| Seamless Settings/Search join with the Dock (one shape) | In PR #83 | Settings gear, search | `DockSurface`, `place.rs` | No seam, no white bar |
| Small × on every dock pop-out | In PR #83 | Every flyout | shared component | Plus Esc and click-outside |
| Top Bar (clock, modules, Quick Settings, notifications) | Shipped | Always on | `TopBarSurface.tsx`, `win_system_modules.rs` | |
| Quick Settings (Wi-Fi, Bluetooth, volume, brightness per monitor, night light, open windows) | Shipped (#60) | Top bar | `QuickSettingsSurface.tsx`, `commands/system.rs` | Richer tile icons: In PR #89 |
| Notifications and DND | Shipped | Top bar › bell | `win_notifications.rs` | |
| Launcher (Win key) and Overview (Alt+Tab) | Shipped, opt-in | Win, Alt+Tab | `win_keyhook.rs`, `docs/KEYHOOK.md` | |
| Shell replacement mode | Shipped, opt-in | Settings › Advanced | `win_shell.rs`, `docs/SHELL_MODE.md` | Restore scripts are the escape hatch |
| System tray host | Shipped, opt-in | Top bar | `win_tray.rs` | |
| Desktop folder, desktop groups | Shipped | Desktop | `DesktopFolderSurface.tsx` | |
| Tiling, snap, workspaces, virtual desktops | Shipped, opt-in | Hotkeys; Command | `win_tiler.rs`, `win_workspaces.rs` | |
| Alt+drag, hot corners, summon any app | Shipped, opt-in | Settings › Productivity | `win_altdrag.rs`, `win_hotcorners.rs`, `win_summon.rs` | |
| Settings hub: Simple/Advanced, search, deep links, Windows pages | Shipped (#56) | Dock gear; tray | `ControlCenterSurface.tsx`, `src/settings/*` | Gear always opens Quick settings: In PR #89 |
| Setup on first launch and after each update (changes nothing until Apply; floating dock default) | In PR #85 | First run; Settings › About; Command "setup" | setup flow, `Launch-Lens-UI.bat` | Fully skippable |

## Themes and looks

| Feature | Status | Notes |
|---|---|---|
| Theme packs (21) and featured looks (12) | Shipped (#65) | `src/themes/*`, `src/themes/featured.ts` |
| Light/dark/auto, accent, glass, roundness, blur, tint | Shipped | Appearance |
| Day & Night schedule, accent from wallpaper | Shipped | |
| Clean, instant theme switches (no growing, no flash) | In PR #88 | Theme-switch rig |
| Saved and shared `.lenstheme` files | Shipped | |
| Wallpaper, Playground scenes, living skies, ambient | Shipped | `win_wallpaper.rs`, `src/playground/*` |
| Wallpaper Switcher (picker, library, auto-change) | Shipped (first cut) | `docs/WALLPAPER_SWITCHER.md` (deferred list below) |
| Backdrop Lab (animated gradients as wallpaper and themes) | Shipped (#45) | `docs/BACKDROP_LAB.md` |
| Cursors and pointer effects | Shipped | `win_cursors.rs`, `docs/CURSORS.md` |
| Folder icons | Shipped | `win_folders.rs` |

## Windows and styling

| Feature | Status | Notes |
|---|---|---|
| Window buttons on other apps' title bars (Yellow · Green · Red default) | Shipped; blending fixed (#80) | `win_caption_engine.rs`; manual checks in `docs/WINDOW_STYLING.md` |
| DWM styling from Lens's own process (caption, border, text colour, corners, dark mode) | Shipped | `win_dwm_engine.rs` |
| In-process styling hook (experimental, off by default, anti-cheat excluded) | Shipped, opt-in | `lens-dwm-hook/`; replace per [WINDHAWK_REPLACEMENT.md](../WINDHAWK_REPLACEMENT.md) |
| Windhawk mod (opt-in install, 42 anti-cheat excludes) | Shipped (#76) | `windhawk/`, `win_windhawk.rs` |
| Focus dim, active border, peek, pin | Shipped | `win_focus_dim.rs` |
| Per-app window rules | Shipped | `win_rules.rs` |

## Command, AI, agents and approvals

| Feature | Status | Notes |
|---|---|---|
| Lens Command (ask / do), offline intents | Shipped | Ctrl+Alt+Space; first-Enter fix #73 (B-12c open) |
| AI core: providers, local first, tool runner, secrets vault | Shipped | `ai/` |
| Bring your own agent: Claude Desktop / Claude Code over MCP, Desktop State API, grants | Shipped | `win_mcp.rs`, `control/` |
| One approval card, Lens at work (presence), Esc stops anywhere | Shipped | `src/approval`, `presence/` |
| Agent safety: links, hidden text, injection, data leaks; articles that only discuss injection aren't blocked | Shipped (#63, #74) | `agentsafe/` |
| Shelf and context packs, clipboard history | Shipped | |
| Magic right-click (desktop, files, text; from dock, Shelf, notifications) | Shipped (#72) | `magic/` |
| "Lens ›" row in every Lens right-click menu that slides into Magic; Explorer "Lens" menu (opt-in) | In PR #84 | Win 11: under "Show more options" |
| Snip (capture, mark up, OCR, send) | Shipped | |
| Voice (push-to-talk, conversation) | Shipped | One-click setup waits on pinned checksums (B-07) |
| Transcription | Shipped | B-07 |
| The Guide and Ask the Guide | Shipped | |
| In-page Lens buttons (extension) | Shipped (#57) | `extensions/browser`, `docs/IN_PAGE_LENS.md` |

## Lens Browser

| Feature | Status | Notes |
|---|---|---|
| One box, new tab page, tabs that come back, import you can undo, transcripts, AI beside the page | Shipped (#67) | `docs/BROWSER_AAA.md` |
| Site permissions (camera, mic, location, notifications, clipboard, downloads) | Shipped (#74) | Not yet confirmed on a real PC |
| Lens glow new tab (no dither) | Shipped (#81) | |
| Simpler sidebar: tabs first, folders quiet at the bottom, Lens row for tab actions, compact mode | In PR #86 | |

## Apps

| Feature | Status | Notes |
|---|---|---|
| Lens Music (now playing, lyrics, Spotify reskin, visualiser) | Shipped | |
| Lens Cleaner (preview-first, Recycle Bin by default, undo) | Shipped (#43) | |
| Core apps: Monitor, Timer, Calculator, Color, Notes, Power, Network, Clipboard, Startup | Shipped (#41) | |
| Lens Feeds and Lens Messages (now reachable) | Shipped (#71) | |
| Lens Apps catalogue (winget, recipes, ArtCraft suite) | Shipped | Recipe revert (B-08) |
| Tester Hub, Smoothness probe | Shipped | |

## Updates, reporting and release

| Feature | Status | Notes |
|---|---|---|
| Signed updates from GitHub Releases | Shipped | `win_update.rs` |
| Restart to update (Top Bar pill, one notification, What's new, tray, `/update`) | In PR #82 | Download in background, install on restart |
| Report a problem (redacted preview, opens a GitHub issue, copy or save) | In PR #82 | Nothing uploaded automatically |
| Crash reports (local), self-test, backups | Shipped | |
| Release workflow (installers, signed updater files, draft release) | Shipped; first run needs the signing key | `.github/workflows/release.yml`, `docs/RELEASING.md` |

## Site

| Feature | Status | Notes |
|---|---|---|
| Site on real surfaces (demo desk, exhibits) | Shipped (#68) | |
| Docks-first demo, Lens Browser featured, right-click spotlight, tighter sections, simpler bring-your-own-agent | In PR #87 | `docs/BROWSER_RESEARCH.md` in that PR |

---

## Suggested (all-time backlog)

De-duplicated from: the reviews (`docs/reviews/2026-11-23*.md`), `docs/FEATURE_RESEARCH.md`, `docs/APPS_RESEARCH.md`, `docs/COMMAND_RESEARCH.md`, `docs/brain/LANDSCAPE.md`, `docs/MASTERPLAN.md` §3, `docs/COMPETITIVE_STRATEGY.md`, the launch plan, the browser and dock research in open PRs (#83, #87). Status is **Planned** if a plan doc scopes it, otherwise **Idea**.

### Dock and bar

| Idea | Status | Why |
|---|---|---|
| Dock and bar on every monitor, per-monitor contents; "only this monitor's / workspace's apps" | Planned (W5-B) | Top multi-monitor request in every dock project |
| Drop a file on a dock icon to open it with that app | Idea | 3,100 Feedback Hub votes |
| Smart hide modes: dodge active, dodge maximised, edge pressure, reveal hotkey | Planned (W5-A) | Plank-style hide modes are expected |
| Parabolic magnification with neighbour falloff and springs | Planned (W5-A) | The macOS feel people ask for |
| Click-action matrix (Shift/middle/scroll per action) | Planned (W5-A) | Power users map these |
| Per-window dots, unread badges, taskbar progress | Idea | Read state at a glance |
| Dynamic opacity: solid when a window touches the dock | Planned (W5-A) | Called the top feature in the Latte thread |
| Dock profiles (work, gaming, presentation) separate from theme | Planned (W5-F) | Switch layouts without changing the look |
| Live icons (clock, calendar date, trash, battery) | Idea | Plank docklets; delight |
| Jump lists and recent files per app | Idea | Expected from Windows |
| "End task" and the classic window menu on app icons | Idea | 7,580 Feedback Hub votes |
| Aura: hover tinted by the icon's own colour | Idea | StartAllBack 3.9 |
| Reuse preview windows between hovers | Idea (#79 notes) | Lower hover latency |
| Predictive preview prefetch on hover intent | Idea (#83) | Feels instant |

### Windows and desktop

| Idea | Status | Why |
|---|---|---|
| Save and restore window layouts per monitor setup | Idea | Hyprland/Pop Shell top requests |
| Stacked or tabbed windows | Idea | GlazeWM top requests |
| Natural-language layouts ("coding setup") | Planned (MASTERPLAN 3.3) | Uses the Desktop State API |
| Wallpaper per workspace; wallpaper of the day; per-monitor and span; video thumbnails | Planned (W5-D, Wallpaper Switcher deferred) | Common asks |
| Panel presets by window state (desktop / maximised / fullscreen) | Planned (W5-D) | Calm when focused |
| Auto-DND in fullscreen and while presenting; DND schedule | Idea | Avoid interruptions |
| Calendar events in the clock flyout; week starts Monday | Idea | Daily use |
| Same-app window cycler | Idea (LANDSCAPE) | Cheap and loved |
| UI scale for native windows | Planned | Accessibility |
| Lens-owned window styling without Windhawk | Planned | See [WINDHAWK_REPLACEMENT.md](../WINDHAWK_REPLACEMENT.md) |

### Themes and ecosystem

| Idea | Status | Why |
|---|---|---|
| Theme gallery with one-click "Open in Lens" | Planned (ECO-1) | Community growth |
| Live theme editor | Planned (ECO-2) | Make a theme in 5 minutes |
| Rice in 60 s: theme, dock, pointers and border from the wallpaper | Planned (ECO-3) | The "wow" moment |
| One `.lenspack` (theme + overlays + settings), overlay marketplace | Idea (launch plan) | Shareable setups |
| Screenshot-to-theme | Planned (MASTERPLAN 3.3) | From any picture to a palette |
| Theme packs carrying a wallpaper collection | Planned | Complete looks |

### Command, AI and agents

| Idea | Status | Why |
|---|---|---|
| Shelf file drag-out and Explorer selection | Planned | Context in and out |
| Shelf pack one click to attach in any AI surface | Idea (LANDSCAPE) | Context across apps |
| Windows agent workspace interop | Planned | Align with Windows' agent model |
| Beeper integration for a real unified inbox | Idea (LANDSCAPE) | Without storing credentials |
| Managed mode (admin-pinned settings JSON) | Idea (LANDSCAPE) | Enterprise "locked" desktops |
| Local meeting recorder (off by default, visible indicator) | Planned (MASTERPLAN 3.3) | Summaries without the cloud |
| Snip follow-ons: live OCR translate, step recorder, video snips with captions, "explain this screen" locally | Planned | High-value capture |
| Adaptive desktop that proposes calm layouts (asks, learns on device) | Planned (moonshot) | The long-term bet |
| One-time approval token tied to each browser-agent step | Idea (Redline review) | Defence in depth |

### Lens Browser

| Idea | Status | Why |
|---|---|---|
| Split view, workspaces tied to Lens Spaces, tab search everywhere, reader mode | Idea (#87 research) | Modern browser asks |
| Low memory: sleeping tabs by default, per-tab memory readout | Idea | Most common browser complaint |
| Summarise open tabs, close duplicates, group by task (always preview + ask) | In PR #86 | Agentic but safe |
| Import tested from Chrome/Edge/Firefox/Arc | Planned | Switching cost |

### Apps and tools

| Idea | Status | Why |
|---|---|---|
| Redline: narrated screen recordings → review packs for Claude | Planned (launch plan, wave 6) | Fastest feedback loop; standalone product |
| Standalone tools that work without Lens (Cleaner, Backdrop Lab, Snip, Monitor) | Idea (launch plan) | Each one a door into Lens |
| Lens Music with other players (Apple Music, YouTube Music) | Planned | Not just Spotify |
| "Lens Trade" (TradingView rewrite) in the family | Open question | Owner decides |
| Phone companion | Planned (vision/roadmap) | Approvals on the go |

### Platform, distribution and community

| Idea | Status | Why |
|---|---|---|
| Authenticode signing, winget, Scoop, Microsoft Store, portable .zip | Planned (DIST-1) | SmartScreen-clean installs |
| Linux (Wayland layer-shell) and macOS companion | Planned (MASTERPLAN 3.3) | Same themes and Shelf everywhere |
| Sync between PCs (end-to-end encrypted, own storage option) | Planned (MASTERPLAN 3.3) | Possibly Lens Cloud |
| Metrics page (crash-free sessions, tester reports) | Planned (MASTERPLAN §6) | Visible health |
| Self-hosted Windows runner with a real GPU | Planned (R5) | Headless CI hides animation glitches |

### Dropped

| Idea | Why dropped |
|---|---|
| Centred custom title-bar text, aero glass on every app | Needs injection into every app; out of scope (FEATURE_RESEARCH §5) |
| Executable wallpapers | Security: wallpapers stay sandboxed data (LANDSCAPE) |
| "Share your whole setup as one file" on the site (for now) | Owner asked to remove it until the pack format exists (review T13) |
| Ambient capture / "remember everything" | Breaks the privacy promise (VISION principle 7) |
