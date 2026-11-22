# Feature research: what people keep asking docks, window styling, themes and desktops to do

Status: research note for planning Wave 5. It contains no code.
Date: November 2026. Baseline: `main` at `ad52a44`, plus the open branches listed in §1.3.

This note answers one question: **across twenty years of docks, taskbars, tilers and themers, which features do people ask for again and again, and which of them is Lens missing?** It ranks the requests by evidence, picks the 15 best ideas from Linux docks and panels, and turns the gaps into a Wave 5 build plan with strict file ownership.

---

## 1. Method and sources

### 1.1 How requests were measured

The strongest signals are counted votes:

- **Feedback Hub vote counts**, as reported by Neowin and BleepingComputer.
- **GitHub issue 👍 counts.** These come from the GitHub search API (`sort=reactions-+1`), queried on 22 Nov 2026 for these repositories:
  - Windows tools: PowerToys, Seelen UI, ExplorerPatcher, TranslucentTB, windhawk-mods, Mica For Everyone, Rainmeter, GlazeWM, komorebi, Windows Terminal.
  - Linux docks and shells: Dash to Panel, Waybar, nwg-dock-hyprland, HyprPanel, Hyprland, Blur my Shell, Pop Shell, elementary Dock.
  - macOS tools: DockDoor, AltTab, Amethyst, Ice, Rectangle.
- **Bug-tracker decisions**, such as KDE refusing parabolic zoom.

The weaker signal is feature lists. A feature that ships in many products (for example Plank, Dash to Dock, Cairo-Dock, StartAllBack, Fences, Lively, Wallpaper Engine or DockDoor) shows sustained demand, even where nobody votes on it.

Ranking rule:

1. Counted demand on the Windows platform comes first, because that is where Lens runs today.
2. Breadth across products comes second.
3. Fit with Lens's guardrails comes third: reversible, never injected into games, out-of-process by default.

### 1.2 What could not be verified

- **Hyprland decoration options.** The Hyprland wiki returned binary pages to the fetcher. Its decoration options (`dim_inactive`, `active_opacity` / `inactive_opacity`, gradient `col.active_border`) are cited from prior knowledge and were not re-read this session.
- **Plank and Latte vote counts.** Plank lives on Launchpad and Latte is archived, so neither has vote counts. They are cited for their feature sets and for the requests users still make after they died.
- **Dash to Dock, RoundedTB and Lively.** These repositories rejected the search API (HTTP 422), so their issues have no 👍 counts here. Dash to Dock is cited from its feature set; Lively from its Performance wiki.
- **Feedback Hub counts.** These come second-hand from news coverage (2021–2023) and are older than the GitHub counts. Treat them as orders of magnitude.

### 1.3 What "Lens status" means

| Status | Meaning |
|---|---|
| **Have** | On `main` and reachable from Control Center. |
| **Partial** | Exists but misses the part people actually ask for. |
| **Open PR** | Exists on one of these unmerged branches:<br>• `foundation/green-ci` (#4: lib.rs split, CI)<br>• `feature/shell-keys-monitors` (#2: Win-tap launcher, Alt+Tab overview, monitor picker, side-Dock flyouts)<br>• `ship/release-security` (#3)<br>• `feature/windows-10-and-11` (#5)<br>• `site/pages-readme` (#1) |
| **In-flight** | Assigned to a running agent and not pushed yet: dock styles (floating / slim / taskbar / studio / minimal / split), the theme area and setup wizard, Playground living wallpapers (falling sand and similar), and the cursor suite. None of these branches existed on the remote when this was written. |
| **Missing** | Nothing yet. |

Effort scale: **S** is under a day, **M** is 1–3 days, **L** is more than 3 days or needs research.
Risk measures how likely the feature is to break something on the user's PC or to break with Windows updates.

---

## 2. Ranked tables

### 2.1 Dock and taskbar

| # | Feature | Evidence of demand | Who has it | Lens status | Effort | Risk |
|---|---|---|---|---|---|---|
| 1 | **Dock or taskbar on any edge** | Most-requested Windows 11 Feedback Hub item, 20k+ votes ([Neowin](https://www.neowin.net/news/ability-to-move-the-windows-11-taskbar-is-the-most-requested-feature-on-feedback-hub/)). Dash to Panel vertical panel 👍58 ([#3](https://github.com/home-sweet-gnome/dash-to-panel/issues/3)). elementary Dock on left/right 👍13 ([#230](https://github.com/elementary/dock/issues/230)). Windhawk ships "Vertical Taskbar" and "Taskbar on top" mods. | Win10, StartAllBack, ExplorerPatcher, Plank, Latte, Dash to Dock, nwg-dock | **Have**: `dock.position` covers bottom, top, left and right. Side-Dock flyouts are in PR #2. | — | Low |
| 2 | **Dock and panel on every monitor**, optionally per-monitor contents | Dash to Panel "Show panel in all monitors" 👍157 ([#35](https://github.com/home-sweet-gnome/dash-to-panel/issues/35)), its top issue ever. windhawk-mods "System Tray on all monitors" 👍25 ([#1761](https://github.com/ramensoftware/windhawk-mods/issues/1761)). nwg-dock "show the dock on all monitors" ([#70](https://github.com/nwg-piotr/nwg-dock-hyprland/issues/70)). | Win10/11 taskbar, Dash to Panel, Latte, DisplayFusion | **Partial**: `func.targetMonitor` puts surfaces on one monitor, and PR #2 adds a monitor picker. There is still one Dock in total. | M | Medium (window lifecycle on hot-plug) |
| 3 | **Never combine, with labels** | 3,790 Feedback Hub votes ([BleepingComputer](https://www.bleepingcomputer.com/news/microsoft/windows-11-is-coming-soon-but-users-want-these-features-back/)). Windhawk "Taskbar Labels" and "Disable grouping" mods. | Win10, StartAllBack, ExplorerPatcher, uBar, Dash to Panel | **In-flight**: the taskbar dock style should carry labels. Needs an explicit "combine: always / when full / never" setting. | S–M | Low |
| 4 | **Drop a file on a dock icon to open it with that app** | 3,100 Feedback Hub votes ([BleepingComputer](https://www.bleepingcomputer.com/news/microsoft/windows-11-is-coming-soon-but-users-want-these-features-back/)). | Win10, macOS Dock, Plank, Cairo-Dock | **Missing**: DockSurface drag-over handles reordering only. | S | Low |
| 5 | **Hover window previews, with "peek" that dims everything else** | Dash to Panel built previews and peek in v14 ([Linux Uprising](https://linuxuprising.com/2018/05/gnome-shell-dash-to-panel-v14-brings.html)). DockDoor's core feature is previews you can act on ([features](https://pro.dockdoor.net/features/)). Windhawk "Aero Peek" mod idea ([#854](https://github.com/ramensoftware/windhawk-mods/issues/854)). | Win7–11, Dash to Panel, DockDoor, Latte | **Partial**: the hover card exists and `dock.livePreviews` is off by default. There is no peek and no close or minimise buttons on the thumbnails. | M | Low (DWM thumbnails are read-only) |
| 6 | **Smart hide modes**: intellihide, dodge active, dodge maximised, plus edge pressure | Plank offers five hide modes ([guide](https://linuxuprising.com/2019/12/a-guide-to-using-plank-dock-on-linux.html)). Dash to Panel intellihide has a fullscreen reveal. windhawk-mods "Center-Screen Trigger for Auto-Hide" ([#2012](https://github.com/ramensoftware/windhawk-mods/issues/2012)). | Plank, Dash to Dock, Dash to Panel, Latte, macOS | **Partial**: `autoHide` is never / smart / always. There is no "dodge active only", no edge-pressure threshold and no reveal hotkey. | S–M | Low |
| 7 | **Parabolic magnification** | elementary Dock 👍6 ([#179](https://github.com/elementary/dock/issues/179)). windhawk-mods magnification request ([#904](https://github.com/ramensoftware/windhawk-mods/issues/904)). The Latte feature thread calls escalating icons the thing people miss ([KDE Discuss](https://discuss.kde.org/t/some-latte-dock-features-for-kde-plasma-6-1-my-thoughts/12959)). KDE closed it as "not something we intend to add" ([bug 495100](https://bugs.kde.org/show_bug.cgi?id=495100)), which leaves the gap open. | macOS, Latte, Cairo-Dock, Plank, DockDoor, Dash2Dock Animated | **Partial**: `hoverScale` and `hoverLift` act on one icon only. There are no neighbour falloff and no spring. | S | Low (hit-testing must stay stable) |
| 8 | **A click-action matrix**: click, Shift+click, middle-click and scroll each mappable | Dash to Dock click and scroll actions ([It's FOSS](https://itsfoss.com/dash-to-dock-tips.md)). Windhawk ships "Cycle windows on click", "Middle click to close", "Minimize/restore on scroll" and "Cycle with wheel" ([list](https://ramensoftware.com/windhawk-mods-for-the-windows-11-taskbar)). DockDoor: click to minimise 👍5 ([#464](https://github.com/ejbills/DockDoor/issues/464)). | Dash to Dock, Windhawk, DockDoor | **Partial**: cycling on re-click and middle-click for a new instance exist. Scroll and Shift actions are not mappable. | S | Low |
| 9 | **Running state you can read**: per-window dots, attention flash, launch bounce | The Latte thread asks for icon reaction on click and a launch jump. Dash2Dock Animated ships bounce ([changelog](https://www.github.com/icedman/dash2dock-lite/blob/main/CHANGELOG.md)). | macOS, Latte, Plank, Win11 (flash) | **Partial**: running dots and the `launchingId` pulse exist. There is no `HSHELL_FLASH` attention state and no per-window dot count. | S | Low |
| 10 | **Unread badges and taskbar progress** | Dash to Panel badge issues ([#2589](https://github.com/home-sweet-gnome/dash-to-panel/issues/2589), [#2593](https://github.com/home-sweet-gnome/dash-to-panel/issues/2593)). Dash to Dock "Show icons emblem". | macOS, Win11 (overlay and progress), Dash to Dock | **Partial**: notification-count badges are on the Dock. Progress from `ITaskbarList3` is **missing** and can only be read when Lens is the shell. | M (badges) / L (progress) | Medium |
| 11 | **Only show apps from this monitor or this workspace** | Seelen "Dock displaying only the active windows for each virtual desktop and monitor" ([#192](https://github.com/eythaann/Seelen-UI/issues/192)). nwg-dock "running on current workspace" ([#6](https://github.com/nwg-piotr/nwg-dock-hyprland/issues/6)). | Win10/11 multi-display setting, Dash to Panel, nwg-dock | **Missing** | S (after #2) | Low |
| 12 | **Easy transparency or dynamic opacity**: solid when a window touches it, clear otherwise | Called more important than every other feature in the Latte thread. Dash to Dock dynamic opacity (min/max). KDE "Adaptive" panel opacity. TranslucentTB's whole product. | KDE, Dash to Dock, TranslucentTB, StartAllBack | **Partial**: `theme.glassOpacity` is static. | S | Low |
| 13 | **Dock layouts and profiles separate from the theme** (work, gaming, presentation) | Latte thread: switch dock layouts without changing the global theme. DockDoor profiles with auto-switch on the focused app. | Latte, DockDoor, Cairo-Dock (multiple docks) | **Missing**: sessions save apps, not dock layout. | M | Low |
| 14 | **Live and dynamic icons**: clock, calendar date, trash full or empty, battery | Plank docklets (clock, trash, battery, Clippy). Dash2Dock Animated dynamic trash and clock icons. | Plank, Cairo-Dock, macOS (Calendar, Trash) | **Missing** | S–M | Low |
| 15 | **Stacks: a folder opens as a fan or grid from the Dock** | macOS Stacks; Cairo-Dock sub-docks. | macOS, Cairo-Dock, Winstep Nexus | **Have**: pinned folders with `viewMode` grid, list or fan. | — | — |
| 16 | **Tray: pin or hide icons, reveal on hover** | Seelen "Where is the system tray?" 👍17 ([#1037](https://github.com/eythaann/Seelen-UI/issues/1037)) and pin tray apps 👍6 ([#422](https://github.com/eythaann/Seelen-UI/issues/422)). Dash to Panel hide tray icons 👍23 ([#438](https://github.com/home-sweet-gnome/dash-to-panel/issues/438)). Ice show-on-trigger 👍68 ([#62](https://github.com/jordanbaird/Ice/issues/62)). | Win11, Ice, Bartender, Waybar | **Partial**: the tray host exists (`func.trayHost`). Pin and hide are only partly there. | S | Low |
| 17 | **Task Manager and classic window menu in right-click menus** | 7,580 Feedback Hub votes for Task Manager on the taskbar menu ([BleepingComputer](https://www.bleepingcomputer.com/news/microsoft/windows-11-is-coming-soon-but-users-want-these-features-back/)). elementary "Force quit" 👍10 ([#278](https://github.com/elementary/dock/issues/278)). | Win10, ExplorerPatcher, Windhawk | **Partial**: a "System Stats & Task Manager" Dock item exists. App icons have no "End task" entry. | S | Low |
| 18 | **Jump lists and recent files per app** | Seelen "[FEAT] Jump List" ([#1990](https://github.com/eythaann/Seelen-UI/issues/1990)). | Win7–11, macOS | **Missing** | M | Low |
| 19 | **Aura: highlight tinted by the icon's own colour** | New in StartAllBack 3.9 ([Neowin](https://www.neowin.net/news/startallback-39-is-out-with-new-taskbar-options-and-file-explorer-grouping-improvements/)). | StartAllBack, Win7 | **Missing** (the icon pipeline already samples colour) | S | Low |

### 2.2 Window styling

| # | Feature | Evidence of demand | Who has it | Lens status | Effort | Risk |
|---|---|---|---|---|---|---|
| 1 | **Titlebar colour and dark titlebars everywhere** | Mica For Everyone "Dark theme for menu bar" ([#57](https://github.com/MicaForEveryone/MicaForEveryone/issues/57)). TranslucentTB text colour 👍13 ([#41](https://github.com/TranslucentTB/TranslucentTB/issues/41)). | Mica For Everyone, WindowBlinds, Windhawk stylers | **Have**: DWM engine, with Windows 10 handling in PR #5. | — | — |
| 2 | **Rounded or square corners, per app** | Dash to Panel border radius 👍23 ([#1586](https://github.com/home-sweet-gnome/dash-to-panel/issues/1586)). RoundedTB's whole product. | Win11, Hyprland, RoundedTB | **Have**: `WindowRule.corners`. | — | — |
| 3 | **Active-window highlight**: border or glow, ideally a gradient | Amethyst "Highlight active window" 👍40 ([#127](https://github.com/ianyh/Amethyst/issues/127)). komorebi border size ([#232](https://github.com/LGUG2Z/komorebi/issues/232)). | Hyprland, komorebi, GlazeWM, PowerToys Always on Top | **Partial**: `frameStyle` accent-glow, hairline or neon. There is no gradient and no thickness setting. | S | Low |
| 4 | **Turn borders and effects off for fullscreen windows** | GlazeWM 👍24 ([#778](https://github.com/glzr-io/glazewm/issues/778)). Mica For Everyone border on fullscreen 👍5 ([#454](https://github.com/MicaForEveryone/MicaForEveryone/issues/454)). | GlazeWM, komorebi | **Partial**: `gamingPause` exists; the per-window fullscreen check needs auditing. | S | Low |
| 5 | **Focus dimming and inactive opacity** | Hyprland `dim_inactive` and `inactive_opacity` (§1.2 caveat). Windows Terminal opacity 👍236 ([#603](https://github.com/microsoft/terminal/issues/603)). | Hyprland, KWin, Picom | **Missing**: there is per-app opacity (`WindowRule.opacity`) but no focus-driven dimming. | M | Medium (layered windows can break some apps, so it needs an exclusion list) |
| 6 | **Per-app rules with "pick a window" targeting** | GlazeWM/komorebi rules; Hyprland window rules; Windhawk Taskbar Labels exclusion 👍7 ([#203](https://github.com/ramensoftware/windhawk-mods/issues/203)). | Hyprland, KWin, komorebi | **Have / Partial**: `WindowRulesCard` matches by process name. There is no eyedropper picker. | S | Low |
| 7 | **Alt+drag to move and resize windows** | PowerToys 👍382 ([#269](https://github.com/microsoft/PowerToys/issues/269)), its second-highest request ever. komorebi Easy Window Drag ([#34](https://github.com/LGUG2Z/komorebi/issues/34)). | Every X11/Wayland WM, AltSnap | **Missing** | M | Medium (low-level mouse hook, must yield to games) |
| 8 | **Auto-tiling and layouts** | PowerToys auto-tile 👍248 ([#2694](https://github.com/microsoft/PowerToys/issues/2694)) and full WM 👍293 ([#4](https://github.com/microsoft/PowerToys/issues/4)). Pop Shell tiling per workspace 👍96 ([#380](https://github.com/pop-os/shell/issues/380)). | GlazeWM, komorebi, Pop Shell, Hyprland | **Have**: `win_tiler` with layouts per workspace. | — | — |
| 9 | **Save and restore window layouts** | Hyprland 👍107 ([#1426](https://github.com/hyprwm/Hyprland/issues/1426)). Pop Shell 👍76 ([#735](https://github.com/pop-os/shell/issues/735)). Rectangle per display ([#127](https://github.com/rxhanson/Rectangle/issues/127)). komorebi monitor changes ([#989](https://github.com/LGUG2Z/komorebi/issues/989)). | FancyZones, DisplayFusion, Hyprland | **Partial**: `SavedSession` stores apps and an optional layout, but not window rectangles per monitor configuration. | M | Low |
| 10 | **Stacked or tabbed windows** | GlazeWM 👍93 ([#301](https://github.com/glzr-io/glazewm/issues/301)) and 👍56 ([#1005](https://github.com/glzr-io/glazewm/issues/1005)). | i3, Hyprland groups, Groupy | **Missing** | L | High (reparenting foreign windows; see §5) |
| 11 | **Pin a window on all workspaces / always on top** | PowerToys 👍178 ([#13](https://github.com/microsoft/PowerToys/issues/13)). GlazeWM "Pinning" 👍17 ([#974](https://github.com/glzr-io/glazewm/issues/974)). | PowerToys, macOS, Hyprland | **Partial**: needs checking in workspaces; there is no visible toggle. | S | Low |
| 12 | **Centred or custom titlebar text, aero glass** | Mica For Everyone 👍5 ([#355](https://github.com/MicaForEveryone/MicaForEveryone/issues/355)). | WindowBlinds | **Missing**, and deliberately out of scope (§5). | — | High |

### 2.3 Desktop themes and wallpapers

| # | Feature | Evidence of demand | Who has it | Lens status | Effort | Risk |
|---|---|---|---|---|---|---|
| 1 | **Auto light/dark by time or sun** | TranslucentTB 👍11 ([#520](https://github.com/TranslucentTB/TranslucentTB/issues/520)). | macOS, KDE, Auto Dark Mode | **Have**: `ThemeScheduleConfig` (fixed or sun). | — | — |
| 2 | **Accent colour from the wallpaper** | Material You and KDE accent-from-wallpaper. | Android, KDE, GNOME 47 | **Have**: `follow_accent` and `accentFromImage`. | — | — |
| 3 | **Animated wallpaper that pauses for games, fullscreen apps and battery** | Wallpaper Engine's store page leads with this ([Steam](https://store.steampowered.com/app/431960/)). Lively pause algorithms and battery rule ([wiki](https://github.com/rocksdanister/lively/wiki/Performance)). Rainmeter "Game mode automatically" 👍8 ([#365](https://github.com/rainmeter/rainmeter/issues/365)). | Wallpaper Engine, Lively, Rainmeter | **Have**: `pause_when_covered` and `pause_on_battery`. Playground scenes are in-flight. | — | — |
| 4 | **Different wallpaper per workspace or virtual desktop** | Windows 10/11 per-desktop wallpaper; Hyprland users script it. | Win11, KDE, Hyprland (scripts) | **Missing**: `WorkspaceDef` has a colour but no wallpaper. | S | Low |
| 5 | **Wallpaper playlist / slideshow** | Wallpaper Engine and Lively playlists; the Windows slideshow. | Win, Lively, Wallpaper Engine | **Missing** (verify; `win_wallpaper` has a single file) | S | Low |
| 6 | **Interactive wallpaper that reacts to the mouse** | Wallpaper Engine store page. | Wallpaper Engine, Lively | **In-flight**: Playground (falling sand etc.). | — | — |
| 7 | **Panel presets that switch automatically on window state** (maximised gives solid, desktop gives glass) | Panel Colorizer's flagship feature ([repo](https://github.com/luisbocanegra/plasma-panel-colorizer)). | Panel Colorizer, KDE Adaptive | **Missing** | S | Low |
| 8 | **Widget islands**: segmented bar with separate pills | Panel Colorizer islands; KDE "split panel into segments" proposal ([Discuss](https://discuss.kde.org/t/proposal-split-plasma-panel-into-independent-segments-with-dynamic-backgrounds/46327)); Dash to Panel split-mode request ([#2597](https://github.com/home-sweet-gnome/dash-to-panel/issues/2597)). | Panel Colorizer, Waybar, HyprPanel | **In-flight / Partial**: the split dock style is in-flight; the Top Bar could get an islands mode. | S | Low |
| 9 | **Shareable theme files, hot-reloaded on save** | Waybar "restart after config change" 👍47 ([#961](https://github.com/Alexays/Waybar/issues/961)). HyprPanel theming breakage ([#886](https://github.com/Jas-SinghFSU/HyprPanel/issues/886)). | Waybar, Windhawk styler presets | **Have / Partial**: packs plus `customCss`. The config watcher exists; theme files are not watched. | S | Low |
| 10 | **Desktop icon groups, folder portals and double-click quick-hide** | Fences' headline features ([Stardock](https://www.stardock.com/products/Fences)). | Fences, Seelen (none), macOS Stacks on desktop | **Partial**: Desktop Groups and Desktop Folder exist; quick-hide and portal search are missing. | S | Low |
| 11 | **Custom SVG / tray icon packs** | Waybar SVG icons 👍49 ([#1330](https://github.com/Alexays/Waybar/issues/1330)) and custom tray icons 👍53 ([#1400](https://github.com/Alexays/Waybar/issues/1400)). Seelen icon packs ([#1994](https://github.com/eythaann/Seelen-UI/issues/1994)). | Seelen, Waybar, Plank themes | **Partial**: `iconStyle` themes and shapes. There are no user icon packs. | M | Low |
| 12 | **Cursor themes and effects** | Covered by the in-flight cursor suite. PowerToys mouse utilities are active ([#52276](https://github.com/microsoft/PowerToys/issues/52276)). | PowerToys, CursorFX | **In-flight** | — | — |

### 2.4 Desktop UX and productivity

| # | Feature | Evidence of demand | Who has it | Lens status | Effort | Risk |
|---|---|---|---|---|---|---|
| 1 | **Workspace overview with drag between desktops** | Hyprland 👍120 ([#1902](https://github.com/hyprwm/Hyprland/issues/1902)). Rectangle move-to-next-desktop 👍22 ([#85](https://github.com/rxhanson/Rectangle/issues/85)). | GNOME, macOS Mission Control, KDE | **Partial**: the Overview surface (Alt+Tab in PR #2) has minimal drag. | M | Low |
| 2 | **Independent workspaces per monitor** | PowerToys 👍339 ([#58](https://github.com/microsoft/PowerToys/issues/58)). Pop Shell 👍85 ([#823](https://github.com/pop-os/shell/issues/823)). | komorebi, GlazeWM, Hyprland | **Partial**: Lens workspaces are emulated, so per-monitor is feasible without the Windows virtual-desktop API (§5). | M | Medium |
| 3 | **Super+number for apps and workspaces** | Pop Shell 👍63 ([#142](https://github.com/pop-os/shell/issues/142)). Dash to Dock Super+0–9. | Win11, GNOME, KDE | **Have**: `dockNumberHotkeys` and tiling hotkeys. | — | — |
| 4 | **Fuzzy window and app switcher** | AltTab macOS fuzzy search 👍37 ([#590](https://github.com/lwouis/alt-tab-macos/issues/590)). Zed telescope box 👍889 ([#8279](https://github.com/zed-industries/zed/issues/8279)). DockDoor switcher. | Raycast, AltTab, PowerToys Command Palette | **Have / Open PR**: the palette and unified search have this; Alt+Tab goes to the Overview in PR #2. | — | — |
| 5 | **Clipboard history, pinning, paste as plain text** | PowerToys plain text 👍175 ([#1684](https://github.com/microsoft/PowerToys/issues/1684)). Windhawk Win+V tweaks ([#7835](https://github.com/ramensoftware/windhawk-mods/issues/7835)). | Win11, Ditto, Raycast | **Have / Partial**: `win_clipboard` and ClipboardPane. "Paste as plain text" is barely present. | S | Low |
| 6 | **Hot corners** | Long-running niche: WinXCorners, HotCornersWin ([repo](https://github.com/flexits/HotCornersWin)). | macOS, GNOME, KDE | **Missing** | S | Low (must be off in fullscreen and games) |
| 7 | **Summon any app with a hotkey (Quake-style)** | Windows Terminal 👍805 ([#653](https://github.com/microsoft/terminal/issues/653)), its top request ever. | Guake, Terminal (now built in), Yakuake | **Missing**, as "toggle app" hotkey | S–M | Low |
| 8 | **Do Not Disturb on a schedule, plus notification grouping** | macOS and Windows Focus; HyprPanel notification sound ([#103](https://github.com/Jas-SinghFSU/HyprPanel/issues/103)). | Win11, macOS, GNOME | **Partial**: DND toggle exists; there is no schedule and no auto-DND in fullscreen or while presenting. | S | Low |
| 9 | **Calendar events in the clock flyout; week starts Monday** | 1,463 Feedback Hub votes ([BleepingComputer](https://www.bleepingcomputer.com/news/microsoft/windows-11-is-coming-soon-but-users-want-these-features-back/)). Seelen Monday start 👍6+4 ([#857](https://github.com/eythaann/Seelen-UI/issues/857), [#1210](https://github.com/eythaann/Seelen-UI/issues/1210)). | Win10, macOS, GNOME | **Partial**: CalendarClockPane exists; needs a first-day-of-week setting and an ICS or Outlook event source. | S (week) / M (events) | Low |
| 10 | **Settings export and backup** | DockDoor 👍14 ([#688](https://github.com/ejbills/DockDoor/issues/688)). Amethyst export to YAML 👍33 ([#1283](https://github.com/ianyh/Amethyst/issues/1283)). | Most tools | **Have**: `win_backup` and BackupRestoreCard. | — | — |
| 11 | **Trustworthy distribution: signing, no false-positive AV hits** | TranslucentTB malware allegations 👍124 ([#350](https://github.com/TranslucentTB/TranslucentTB/issues/350)), its top issue. ExplorerPatcher flagged as HackTool 👍22 ([#3228](https://github.com/valinet/ExplorerPatcher/issues/3228)). Rainmeter false positive ([#435](https://github.com/rainmeter/rainmeter/issues/435)). | — | **Open PR** #3 (updater, signed grants). Needs code signing. | M | High if skipped |
| 12 | **Survive Windows updates** | The most common bug class across ExplorerPatcher, TranslucentTB (e.g. [#1402](https://github.com/TranslucentTB/TranslucentTB/issues/1402)) and windhawk-mods ([#7827](https://github.com/ramensoftware/windhawk-mods/issues/7827)). | — | **Have, by design**: Lens draws its own surfaces and does not inject into Explorer by default. | — | — |

---

## 3. Best of Linux docks: 15 ideas worth bringing to Lens

Every idea below follows four rules:

- Off by default unless noted.
- Stored in `config.json` with a `#[serde(default)]`, so old configs load unchanged.
- No code injected into other processes.
- Disabled whenever `gamingPause` sees a fullscreen or exclusive app.

1. **Five hide modes and edge pressure** (from Plank and Dash to Dock).
   - Add `dock.hideMode`: `never | intellihide | dodgeActive | dodgeMaximized | always`. Existing `autoHide` values map to these: smart becomes intellihide.
   - Add `dock.revealPressurePx` (default 0, meaning instant) and `dock.revealDelayMs`.
   - Intersection uses the window rectangles `win_events` already tracks.
   - A reveal hotkey shows the Dock over fullscreen apps.
   - Reversible: the setting simply moves back to `never`.

2. **Parabolic magnification** (from Latte, Cairo-Dock and Plank).
   - Settings: `dock.magnify` (`off | subtle | classic`), `dock.magnifyRange` (icons on each side, default 2) and a cosine falloff.
   - Implement as CSS `scale` on transform only, so layout width never changes. This respects the earlier user requirement that the Dock never widens.
   - Hit-testing uses unscaled slots so clicks never miss.
   - Respects `theme.motion = reduced`.

3. **Click-action matrix** (from Dash to Dock).
   - `dock.actions.{click, shiftClick, middleClick, scrollUp, scrollDown}`, each one of: `focusOrMinimize | cycle | previews | newInstance | close | minimizeAll | launch | none`.
   - Defaults match today's behaviour.
   - Lives in a pure TypeScript reducer so it can be unit-tested.

4. **Dynamic opacity** (from Dash to Dock and KDE Adaptive).
   - `dock.opacityMode = static | adaptive`, with `adaptiveMin` (default 0.35) and `adaptiveMax` (1.0).
   - The Dock is solid while any window touches its rectangle or a window is maximised on its monitor.
   - The same engine drives the Top Bar.

5. **Presets that switch on window state** (from Panel Colorizer).
   - `surfacePresets: [{when: desktop | maximized | fullscreen | focusedApp:<exe>, dockStyle, topBarStyle}]`.
   - Example: glass on the desktop, solid and flush when something is maximised.
   - Purely visual, so it cannot strand the user.

6. **Hover peek** (from Dash to Panel).
   - Hovering a preview thumbnail for `peekDelayMs` (default 600) makes every other top-level window transparent through `DwmSetWindowAttribute` cloaking, or a Lens overlay where cloaking is unavailable.
   - Everything is restored on mouse-out, or on a timeout as a safety net.
   - Off on Windows 10 if cloaking misbehaves.

7. **Dock layouts and profiles** (from Latte and DockDoor).
   - `dockProfiles: [{id, name, pinned, style, position, autoSwitch?: {app|monitor|workspace}}]`.
   - Switch from the Dock's context menu or with a hotkey.
   - Profiles never touch the theme pack, so "Gaming layout" leaves your colours alone.

8. **Live icons** (from Plank docklets and Dash2Dock Animated).
   - Calendar shows today's date and Clock shows the hands.
   - Recycle Bin shows full or empty via `SHQueryRecycleBinW`, polled at most every 10 s.
   - Battery is shown only when a battery exists.
   - Rendered in Lens, never by changing the app's real icon.

9. **Multiple docks** (from Plank `-n` and Cairo-Dock).
   - A second, optional Dock instance (`docks[1]`) on another edge or monitor, for example a vertical folders dock.
   - Reuses DockSurface with an `?instance=` parameter.
   - Capped at 3 to keep RAM predictable.

10. **Scope: this workspace or this monitor only** (from nwg-dock and Seelen).
    - `dock.scope = all | monitor | workspace`.
    - Pinned apps always show; running-only apps are filtered.

11. **A panel on every monitor** (from Dash to Panel).
    - `func.surfacesOnAllMonitors` (default false), plus a per-monitor override `{monitorId: {dock, topBar, position}}`.
    - Windows are created and destroyed on `WM_DISPLAYCHANGE` via `win_monitors` (PR #2).

12. **Feedback animations** (from the Latte request list and Dash2Dock bounce).
    - `dock.launchFeedback = none | pulse | bounce` (default pulse, today's behaviour).
    - `dock.attention = none | glow | bounce`, driven by `HSHELL_FLASH` from `RegisterShellHookWindow`.
    - A click "press" squash lasting 90 ms.
    - All of these honour reduced motion.

13. **Focus dimming and a gradient active border** (from Hyprland).
    - `windows.dimInactive` (0–40 %, default 0) and `windows.activeBorder = {style: solid|gradient, colors[], widthPx}`.
    - Use `DWMWA_BORDER_COLOR` where possible (Windows 11).
    - Dimming uses a click-through Lens overlay per monitor that cuts out the active window, not layered styles on foreign windows. That makes it reversible and safe for any app.
    - Excluded automatically for fullscreen and for `rules.exclude`.

14. **Workspace overview with drag** (from Hyprland, GNOME and KDE).
    - The Overview shows every Lens workspace as a strip.
    - Dragging a window thumbnail onto a workspace calls `win_workspaces::move_window`.
    - Esc or a click on empty space returns.
    - Keyboard: arrows choose, Shift+arrows move.

15. **Hot-reload of theme files** (from Waybar and Hyprland config reload).
    - Watch `%APPDATA%\LensUI\themes\*.json|*.css` with the existing watcher.
    - Re-apply on save, debounced by 250 ms.
    - A broken file shows a toast and keeps the last good theme, never a blank shell.

---

## 4. Wave 5 build plan

**Base.** Start after #4 (`foundation/green-ci`) and #2 (`feature/shell-keys-monitors`) are merged, and after the four in-flight agents (dock styles, theme UX, playground, cursor suite) have landed. Every package branches from that `main`.

**Shared-file rule.** Only the integrator touches the shared files:

- `src-tauri/src/config.rs`
- `src-tauri/src/lib.rs`
- `src/types/lens.ts`
- `src/hooks/useLensState.ts`
- `src/surfaces/ControlCenterSurface.tsx`

Each package ships its additions to these as a snippet in its PR description, in the same way as `KEYHOOK.md` §1–12. This avoids the merge conflicts seen in Waves 2–4.

### W5-A: Dock behaviour engine

- **Owns new files:**
  - `src/dock/magnify.ts`
  - `src/dock/hideModes.ts`
  - `src/dock/actions.ts`
  - `src/dock/feedback.css`
  - `src/dock/liveIcons.tsx`
  - `src/__tests__/dock-*.test.ts`
  - `src-tauri/src/win_attention.rs` (`RegisterShellHookWindow`, `HSHELL_FLASH`)
  - `src-tauri/src/tests/win_attention.rs`
- **Owns edits to:** `src/surfaces/DockSurface.tsx`, `src/surfaces/DockSurface.css` (the only package allowed to), `src-tauri/src/commands/dock.rs`.
- **Delivers Linux ideas:** 1, 2, 3, 4, 8, 12.
- **Delivers from the tables:** drop a file on an app (§2.1 #4), aura tint (#19) and End task in the menu (#17).
- **Acceptance criteria:**
  - The Dock's outer width is identical with magnification on or off (parity-harness bounding-box assertion).
  - Each hide mode has a unit test over synthetic window rectangles.
  - Dropping a `.txt` on Notepad launches `notepad.exe <file>`.
  - Reduced motion disables bounce and magnify.
- **Verify:**
  - `bun test`.
  - `bun run parity` with new shots: dock-magnify-hover, dock-hidden-dodge, dock-badge-flash.
  - CI clippy `-D warnings`.

### W5-B: Multi-monitor and scope

- **Owns new files:**
  - `src-tauri/src/app/monitors_surfaces.rs` (spawns and destroys `dock-<id>` and `topbar-<id>` windows)
  - `src/dock/scope.ts` (exports `filterByScope`, which A imports)
  - `src/components/PerMonitorCard.tsx`
- **Owns edits to:** `src-tauri/src/win_monitors.rs`, `src-tauri/src/commands/surfaces.rs`, `src/shell/dockEdge.ts`.
- **Delivers Linux ideas:** 9, 10, 11.
- **Delivers from the tables:** §2.1 #2 and #11.
- **Acceptance criteria:**
  - With two monitors mocked, the harness renders two Docks with independent positions.
  - Unplugging a monitor (simulated `WM_DISPLAYCHANGE`) closes its windows within 1 s with no orphan windows.
  - `scope = workspace` hides running apps from other workspaces.
- **Verify:**
  - Rust tests for the monitor diff function.
  - Parity shot "two-monitors".
  - A manual check on the PC with a second display, if one is available.

### W5-C: Window styling 2.0

- **Owns edits to:**
  - `src-tauri/src/win_rules.rs`
  - `src-tauri/src/win_dwm_engine.rs`
  - `src-tauri/src/win_events.rs`
  - `src/components/WindowRulesCard.tsx`
- **Owns new files:**
  - `src-tauri/src/win_focus_dim.rs` (overlay-based dimming)
  - `src/surfaces/FocusDimSurface.tsx` (click-through overlay, `?surface=focusdim`)
  - `src-tauri/src/commands/rules.rs`
- **Delivers Linux ideas:** 6 (peek, via the shared cloak helper) and 13.
- **Delivers from the tables:** §2.2 #3, #4, #5, #6 (window picker) and #11 (pin or always-on-top toggle).
- **Acceptance criteria:**
  - Dimming never applies to fullscreen windows or excluded processes.
  - Every applied attribute is recorded and restored on exit, and the restore is tested.
  - Windows 10 shows the documented fallbacks (no border colour).
- **Verify:**
  - Rust tests for `ResolvedRule` with gradients and fullscreen.
  - A parity shot of the rules card.
  - Clippy.

### W5-D: Desktop and wallpaper

- **Owns edits to:**
  - `src-tauri/src/win_wallpaper.rs`
  - `src-tauri/src/commands/wallpaper.rs`
  - `src/surfaces/WallpaperSurface.tsx`
  - `src/components/WallpaperCard.tsx`
  - `src/components/DesktopGroupsCard.tsx`
  - `src/surfaces/DesktopFolderSurface.tsx`
- **Owns new files:**
  - `src/themes/surfacePresets.ts`
  - `src-tauri/src/win_theme_watch.rs` (hot reload)
- **Delivers Linux ideas:** 5 and 15.
- **Delivers from the tables:** §2.3 #4 (wallpaper per workspace), #5 (playlist), #10 (quick-hide on double-click and portal search) and #9.
- **Acceptance criteria:**
  - Switching workspace swaps the wallpaper in under 150 ms with no white flash (parity filmstrip).
  - A broken theme file keeps the previous theme and raises a toast.
  - Presets switch when a mocked window maximises.
- **Verify:**
  - Rust tests for the playlist scheduler and preset matcher.
  - Parity shots for desktop, maximised and broken-theme states.

### W5-E: Productivity input

- **Owns new files:**
  - `src-tauri/src/win_hotcorners.rs`
  - `src-tauri/src/win_altdrag.rs`
  - `src/components/HotCornersCard.tsx`
  - `src/components/AltDragCard.tsx`
- **Owns edits to:**
  - `src-tauri/src/win_notifications.rs` (DND schedule, auto-DND when fullscreen)
  - `src/components/NotificationCenterPane.tsx` (grouping)
  - `src/components/CalendarClockPane.tsx` (first day of week)
  - `src-tauri/src/commands/notifications.rs`
  - `src-tauri/src/commands/shell.rs` ("toggle app" hotkey)
- **Must not touch:** `win_keyhook.rs`, which belongs to PR #2. It registers its handlers through the keyhook's public API.
- **Delivers Linux ideas:** 14, via drag in `OverviewSurface.tsx`, which this package also owns.
- **Delivers from the tables:** §2.4 #1, #6, #7, #8 and #9.
- **Acceptance criteria:**
  - Hot corners and Alt+drag are off by default.
  - Both suspend while a fullscreen or exclusive app has focus.
  - Alt+drag passes the event through untouched when Alt is not held, which is unit-tested on the decision function.
  - The DND schedule crosses midnight correctly (test).
- **Verify:** Rust tests, a parity shot of the Overview drag state, and clippy.

### W5-F: Dock profiles (optional; run after A lands)

- **Owns new files:**
  - `src/dock/profiles.ts`
  - `src/components/DockProfilesCard.tsx`
  - `src-tauri/src/commands/profiles.rs`
- **Delivers Linux ideas:** 7.
- **Acceptance criteria:**
  - Switching profiles never changes `theme.*` (asserted by a test).
  - Auto-switch by focused app is debounced to at most once every 2 s.

**Integrator checklist, after each merge:**

1. Apply the config and type snippets.
2. Regenerate `src/types/generated.ts` (`tools/gen-types`).
3. Add search index entries (`src/search/settingsIndex.ts`).
4. Run the full parity sweep.
5. Bump `configVersion` only if a field is renamed. New fields alone never need a bump.

---

## 5. What not to build

- **Restyling the real Explorer taskbar or Start menu by injection.**
  - ExplorerPatcher, TranslucentTB and Windhawk taskbar mods dominate their trackers with "broken after Windows update" issues, for example:
    - TranslucentTB [#1402](https://github.com/TranslucentTB/TranslucentTB/issues/1402)
    - ExplorerPatcher [#4960](https://github.com/valinet/ExplorerPatcher/issues/4960)
    - windhawk-mods [#7827](https://github.com/ramensoftware/windhawk-mods/issues/7827)
  - ExplorerPatcher also got flagged as a hack tool.
  - Lens's advantage is that it draws its own surfaces. Keep `func.injectedHook` opt-in and never extend it to explorer.exe.

- **Stacked or tabbed foreign windows (Groupy-style reparenting).**
  - Demand is real (GlazeWM 👍93).
  - But reparenting other apps' windows breaks DPI, input focus, UWP apps and anti-cheat.
  - Offer Lens-drawn window *groups* in the Dock and the Overview instead.

- **Real per-monitor Windows virtual desktops.**
  - PowerToys #58 has stayed open for years because the virtual-desktop COM API is undocumented and changes between builds.
  - Emulate it with Lens workspaces (hide and show) only.

- **App-wide context-menu replacement** (PowerToys #33).
  - It needs shell extensions inside Explorer, with crash risk for the whole desktop.
  - Restyle only menus Lens owns.

- **OLED subpixel text rendering** (PowerToys #25595, 👍821).
  - This is a font-rasteriser problem, not a shell one. Leave it to the OS.

- **Executable or "application" wallpapers from strangers.**
  - Wallpaper Engine's app wallpapers are an unsandboxed attack surface.
  - Playground scenes and wallpapers stay data-only: images, video and sandboxed HTML without Tauri IPC.

- **A Stage Manager clone as a default.**
  - Reviews of Apple's version improved only after years of fixes (see the [MacSales review](https://eshop.macsales.com/blog/97454-on-the-eve-of-macos-tahoe-has-stage-manager-improved/)). Grouping windows was the hard part.
  - The Overview plus workspaces gives the benefits without a new mental model.

- **Global low-level hooks that are always on.**
  - Alt+drag, hot corners and focus dimming all touch every app. Each ships off by default, behind one toggle, and suspended for fullscreen and games, as `AGENTS.md` requires.

- **Fun effects on by default.**
  - Magnification, bounce, sand and cursor trails are opt-in through setup-wizard presets ("Playful"). They are never surprises after an update.

- **Raw taskbar progress or overlay capture while Explorer owns the taskbar.**
  - Reading `ITaskbarList3` state requires being the registered taskbar.
  - Ship it only in Shell Mode (`docs/SHELL_MODE.md`) and say so in the UI.
