# Lens UI — Where It Stands and Where It Can Go

_Last updated: 2026-11-21_

## What Lens UI is today

Lens UI is a **shell overlay**, not yet a shell replacement. Windows Explorer (`explorer.exe`) is still
running underneath: Lens hides the native taskbar and desktop icons, then draws its own Dock, Top Bar,
Quick Settings, Command Palette, Widgets and notifications as eight transparent Tauri (WebView2) windows.
A Rust/Win32 backend handles the parts a web view cannot: DWM titlebar colors, traffic-light caption
buttons, tiling, audio sessions, media, folder icons and taskbar restore.

That is a sound base. The overlay approach is why quitting Lens returns you to stock Windows instantly.

## Changed in this pass

| Area | Change |
| :--- | :--- |
| Themes | One registry (`src/themes/packs.ts`) now defines all 16 dark packs. Control Center, Quick Settings, the Setup Wizard and the natural-language router all apply packs through it, so a pack sets surface, accent, radius, icons, folders and window frame together. Previously the Linux-suite packs were only an accent tint, and three files each kept their own preset list. |
| Window styles | App-window titlebars now take the active pack's surface color instead of always `#0C0C0F`. The `frameStyle` setting, which was stored but never used, now drives the DWM border: Hairline, Accent, Neon or Borderless. New "Window Frame" row in Control Center. |
| Folder styles | Three new folder icons (Violet, Frost, Ember); one shared list of 11 styles. |
| Folder safety | Styling a folder used to overwrite its `desktop.ini`, and reverting deleted it. For Documents, Downloads, Pictures etc. that destroyed Windows' own settings. Lens now backs the original up to `%APPDATA%\LensUI\folder-backups`, changes only the icon line, and restores the original on revert. |
| Glitches | The `notifications` and `desktopfolder` windows were missing from `capabilities/default.json`, so they had no event or window permissions. Added. |
| Weight | Each window now loads only its own surface code (lazy imports in `main.tsx`). The running-windows poll skips hidden windows and no longer re-renders the Dock every 900 ms when nothing changed. |
| Standalone | `Build-Lens-UI.bat` builds a release exe/installer so Lens runs without Bun, Vite or a terminal. `.gitignore` no longer excludes the Windhawk mod source the build needs. |

**Not verified here:** the Rust changes were syntax-checked and their logic unit-tested, and the TypeScript
type-checks, but nothing was compiled or run on Windows. Run `bun run tauri dev` and try a theme pack,
a frame style, and a folder apply/revert before relying on them.

## Second pass — direction A, part 1

| Area | Change |
| :--- | :--- |
| Window tracking | New `win_events.rs`: WinEvent hooks push `lens://windows-changed` to every surface the moment a window opens, closes, is renamed, focused or minimized. `useRunningWindows` listens for it; polling stays only as a safety net (normal rate until the first push arrives, then one check every 5 s). |
| No more injection by default | New windows are now styled from outside their process by the same event tracker. `lens_dwm_hook.dll` is no longer loaded into other apps unless "Legacy In-App Window Styling" is switched on in Control Center (`func.injectedHook`). |
| `.lenstheme` | Save the current look, apply and remove saved looks, and open the themes folder, from a "Saved Themes" card in Theme & Look. Files are JSON in `%APPDATA%\LensUI\themes`. Import validates and clamps every field; custom CSS is not part of the format. |
| Color tokens | Every translucent white in CSS and TSX now goes through `--lens-ink`; hard-coded `#fafafa` / `#09090b` / grays go through `--lens-fg`, `--lens-on-fg`, `--lens-fg-secondary`, `--lens-fg-muted`. Dark packs render exactly as before. |
| Light packs | Alabaster Daylight and Paper Minimal (`data-scheme="light"`). Native titlebars switch to dark text and light chrome automatically when the titlebar color is light. First cut: see gap 1. |
| Tray access | A chevron in the Top Bar shows the native taskbar for 8 seconds so tray-only apps are reachable. This is a stopgap until Lens hosts tray icons itself. |

**Not verified:** as before, nothing here was compiled or run on Windows. The new Rust follows the exact
Win32 call patterns already used in `win_caption_engine.rs`, file-name sanitizing and theme import were
unit-tested, and TypeScript type-checks. The light packs have never been looked at on screen.

## Third pass — everything else, built by seven parallel agents and wired in

Every item below is **written and wired but has never been compiled or run on Windows.**
Anything that could break the working shell is behind a switch that is **off by default**.

| Feature | Where | Default | How it was checked |
| :--- | :--- | :--- | :--- |
| System tray host | `win_tray.rs`, `TrayStrip.tsx` (Top Bar) | off — Control Center > "System Tray in Top Bar" | Whole module type-checked; message parser and icon encoder unit-tested. Payload offsets are from memory. |
| Notification center | `win_notifications.rs`, `NotificationCenterPane.tsx` (bell in Top Bar) | on | History/Do-Not-Disturb logic unit-tested. Reading other apps' toasts probably needs a packaged install; the pane says so when unavailable. |
| Shell replacement | `win_shell.rs`, `ShellModeCard.tsx`, `Restore-Windows-Shell.bat`, `docs/SHELL_MODE.md` | off — typed confirmation to enable | Boot-loop guard and startup-command parsing unit-tested. **Try in a VM first.** |
| Clipboard history | `win_clipboard.rs`, `ClipboardPane.tsx` (Widget Drawer) | off | Ring buffer unit-tested; text only, memory only. |
| Window rules | `win_rules.rs`, `WindowRulesCard.tsx` | no rules | Matching/sanitizing unit-tested. |
| Keyboard tiling | `win_tiler.rs` | off — restart to apply | Geometry unit-tested. |
| Session save/restore | `sessions.ts`, `SessionRestoreCard.tsx` | — | Pure parts run in node. |
| Launcher | `LauncherSurface.tsx` (Alt+A, grid button in Top Bar) | on | Type-checked only. |
| Overview | `OverviewSurface.tsx` (Alt+`, layers button in Top Bar) | on | Type-checked only. |
| Theme gallery, day/night schedule, custom packs in `.lenstheme`, light-scheme CSS pass | `ThemeGallery.tsx`, `schedule.ts`, `customPacks.ts`, tokens | schedule off | Sunrise maths, contrast ratios and custom-pack validation unit-tested. |
| Multi-monitor | `win_monitors.rs`; `func.targetMonitor` | "primary" (unchanged behaviour) | Rectangle maths proven identical to the old code for the primary monitor. No picker UI yet. |

**Deliberately not applied** (see `docs/CORE_PATCH_PLAN.md`; apply with `docs/core_patches.py`):
on-demand window creation (L0–L8), the slower idle watcher loop (W2), DWM acrylic on flyouts (G1),
and the monitor picker UI. They rest on Tauri API details nobody could verify here.

**Not built:** accent colour from the wallpaper (needs an image decoder), an uninstaller step that
clears shell mode, per-monitor bars.

## Waves 1 and 2 — feature build-out, polish, performance (all wired, none compiled yet)

| Area | Where | Default |
| :--- | :--- | :--- |
| Automatic tiling + named workspaces | Control Center > Desktops & Widgets; Top Bar workspace strip | off |
| Dock on any edge, live previews, unread badges, separators, lock, Alt+1–9 | Dock right-click menu; Control Center toggles | bottom; previews and Alt+1–9 off |
| Real Wi-Fi, Bluetooth, battery/power mode, keyboard layout, account, audio devices | Quick Settings; Top Bar battery + layout chips | on |
| Unified fuzzy search (Launcher, Palette, Dock), file index, calculator, `>` commands, `?` web, scripts | everywhere you search | on; commands always confirm |
| Live wallpaper (image / video / HTML) + accent from wallpaper; desktop groups | Theme & Look; Desktops & Widgets | wallpaper off |
| Sandboxed plugins (4 examples) + theme sharing | Desktops & Widgets; Theme & Look | examples installed, all off |
| Accessibility (reduced motion, high contrast, focus rings), i18n framework, backup/restore, remove-all-changes, `Uninstall-Lens-UI.bat` | Theme & Look; Windows & Quick | follow Windows |
| MCP server for AI apps (`lens-ui.exe --mcp-stdio`) | Control Center > Agents & MCP | off; free-form actions need approval in Lens |
| Performance: ~3× fewer window scans, no periodic taskbar re-hide, cached telemetry, reused media manager, on-demand windows | Control Center toggle for on-demand windows | on-demand off |
| Crash safety: config kept on parse failure + atomic saves; non-ASCII colour crash fixed; no lock panics in lib.rs | — | — |
| Self-test report | Control Center > Windows & Quick | — |
| CI: Windows build/clippy/tests + parity screenshots of all 11 surfaces | `.github/workflows/build.yml`, `tools/parity/` (`bun run parity`) | needs the folder on GitHub |
| Competitive strategy + 12-month plan | `docs/COMPETITIVE_STRATEGY.md` | — |

Known open items: UI Scale setting has no effect yet (needs Rust-side window sizing); Dock close "×" and unread badge
sit close together; most agents' Rust unit tests still live outside the repo (list in the MCP/CI agent notes);
side/top Dock positions leave Control Center, Dock search and Quick Settings anchored to the bottom.

## First build checklist

1. `Build-Lens-UI.bat` (or `bun run tauri dev`). Expect compiler errors; the most likely spots are listed
   per module in the agents' notes: `tauri::window::Monitor` path in `lens_monitor` (try `tauri::Monitor`),
   WinRT method names in `win_notifications.rs` `mod toasts`, `Code::` / `Modifiers::` names in the hotkey
   block, the `for attr in [DWMWA_…]` loop in `win_dwm_engine.rs`, `REG_OPTION_VOLATILE` in `win_shell.rs`.
2. With everything at defaults, confirm the shell behaves as before (dark-theme shadows included).
3. Then switch on one opt-in feature at a time.

## Known gaps

1. **Light packs still need a human look**, as do the Launcher, Overview, gallery and every new card.
2. **Blur is not real**, and all windows are still created at startup (patches exist, not applied).
3. **No tests in the repo, no CI, `csp: null`**, and an 11 MB `windhawk_setup.exe` in the folder.
4. Global shortcuts Alt+A and Alt+` are taken away from other apps while Lens runs.

## Directions

### A. Make the overlay excellent (recommended next)
Lowest risk, biggest daily-use gain.
- System tray host and a real notification center (`UserNotificationListener`).
- Done: event-driven window list; injected hook off by default.
- Create rarely used windows (Control Center, Widgets, Palette) on demand rather than at startup;
  every idle WebView costs memory.
- Multi-monitor bars, and real acrylic/mica behind surfaces.
- Done: color tokens, `.lenstheme`. Light packs need a visual pass.

### B. True shell replacement
Lens becomes the shell: `HKCU\Software\Microsoft\Windows NT\CurrentVersion\Winlogon\Shell` points at
`lens-ui.exe` and Explorer never starts as the desktop. Lens then owns everything Explorer did:
- wallpaper and desktop icons, tray host, Start/launcher, startup apps (Run keys and the Startup folder);
- Win-key shortcuts and the task switcher that Explorer normally provides;
- UWP/Store app activation, which leans on Explorer more than classic apps do.

It needs a recovery path before anything else: a watchdog that relaunches Explorer if Lens crashes,
a hotkey that restores the stock shell, and a per-user (never machine-wide) registry change.
Do this only after direction A, because A builds most of the pieces B requires.
Prior art worth reading: Seelen UI (Tauri, overlay model) and Cairo Shell with its ManagedShell library
(tray hosting and shell replacement).

### C. Theme platform
Treat packs as data: `.lenstheme` files (JSON plus optional CSS and wallpaper), a gallery in Control Center,
per-app window rules ("terminal is always 85% opaque, borderless"), wallpaper-derived accent,
time-of-day pack switching, and icon packs.

### D. Workflow and local AI
Already the most distinctive part (action router, workflow recorder, tiling).
Keyboard-driven tiling with layouts saved per virtual desktop, session restore ("Coding" reopens and
re-tiles its apps), window rules, clipboard history, and an action router that can explain and undo what it did.

## Suggested order

1. Build and run both passes on Windows; fix anything the compiler finds. **(next)**
2. ~~WinEvent-driven window tracking; injected hook off by default.~~ Done, unverified.
3. System tray host, then notification center.
4. ~~Color tokenization, light packs, `.lenstheme`.~~ Done; light packs need a visual pass.
5. Multi-monitor and on-demand windows; retire the 65 ms watcher loop.
6. Signed release builds and CI.
7. Opt-in shell-replacement mode with watchdog.
