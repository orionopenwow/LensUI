# Desktop widgets

> Status: **built, off by default** (`magicWaves.desktopWidgets`). Part of the Magic waves
> ([plans/MAGIC_WAVES.md](../plans/MAGIC_WAVES.md)); widgets from the Dashboard gallery
> ([DASHBOARD.md](../DASHBOARD.md)) can sit on the desktop too.

Widgets pinned on the desktop in a tidy snapping grid, above the wallpaper and below every app
window, the way the desktop widgets on macOS work: a clock, today's list, your notes, what's
playing, the battery, and the Dashboard widgets you already approved (weather, a feed, a release).
Everything comes from Lens on this PC; nothing new leaves it.

## Turning it on

- **Settings › About & Testing › Magic (preview) › Desktop widgets** (the section shows in Tester
  mode, or once any Magic flag is on). With it on, the same section has **Edit widgets…**.
- **Magic Dashboard › Board › Widgets** lane header: a **Desktop widgets** switch and **Edit widgets…**.
- Nothing asks for permission: the built-in widgets read only Lens's own local data. A Dashboard
  widget that fetches (Weather, a feed…) was approved on the Dashboard's consent screen; placing it
  on the desktop doesn't approve anything new.

The first time, the desktop gets the Calendar in the top-left corner, then your latest note and
today's list.

## Using it

- **Move**: drag a widget; a snap outline shows where it lands, and the widgets in the way flow to
  the next free spots.
- **Right-click a widget**: Small, Medium, Large · Edit “<name>”… · Remove Widget · Edit Widgets….
  Resizing animates and the grid reflows around it.
- **Edit mode** (Edit Widgets… from a widget's menu, Settings, the Dashboard, Command
  “edit widgets” or `/widgets`, or Magic on the desktop background → **Edit widgets…**): the
  desktop dims and the gallery opens at the bottom with a search box, the kinds on the left and the
  chosen kind at each size. Click a size to add it, or drag it onto the desktop. Each widget gets a
  − to remove it. **Done** or **Esc** leaves edit mode; so does going to another app.
- **In place**: tick off a Today item (it slides away and the count updates), play/pause/skip in
  Now playing, click a note to open it in Lens Notes.

| Kind | Small | Medium | Large | Data |
|---|---|---|---|---|
| Calendar | weekday, day, time | time + date + this month | + today's items | this PC's clock and the Lens calendar (`lens_calendar_events_v1`), read only |
| Clock | analog, smooth second hand | world clock, four cities | analog + three cities | this PC's clock; cities editable (Edit “Clock”…) |
| Today | count + 2 items | 3 items with times | up to 8 | the Lens calendar (`lens_calendar_events_v1`); ticking off writes `done` there |
| Notes | newest note | two notes | up to six | the "Notes" shelf (Lens Notes), read only; click opens the note |
| Now playing | art + play/pause | art, title, controls | big art, progress, controls | Windows media session (`get_media_now_playing_cmd`); sound glow off on the desktop |
| Batteries | ring + percent | ring, state, time left | bar list | this PC's battery (`GetSystemPowerStatus`, `get_battery_cmd`) |
| Weather | place, temperature, condition, H/L | + wind | + source line | a Weather widget you added on the Dashboard (Open-Meteo, the site you approved) |
| From the Dashboard | the widget's card | | | any other Dashboard gallery widget (feed, release, prices, clocks, This PC) |

Weather and "From the Dashboard" ask you to add the widget on the Dashboard first (its consent
screen names every site); the desktop then shows that same widget. They follow the Dashboard's
kill switch (**Stop all widget fetching**) and its Sources page.

## Widget flyout (opt-in)

`magicWaves.widgetFlyout`, off by default: **Settings › About & Testing › Magic (preview) › Widget
flyout**. It is enough by itself (it starts the host even with Desktop widgets off). With it on, the
widgets wait out of sight instead of sitting on the desktop:

- **Out**: the Widgets key (**Alt+W**, which opens the Widget Drawer while the flyout is off), the
  **Widgets** hot corner, the tray's **Widgets** item, or Command `widgets` / `show widgets`. The
  host comes to the front on the monitor under the pointer, the desktop dims a little (a dashboard
  over your windows) and every widget flies out to its place from the top-left cell where the
  Calendar lives, or from the hot corner that called it. The nearest widget leaves first.
- **Back in**: the same key or corner again, **Esc**, a click on the dimmed desktop, Command
  `hide widgets`, or going to another app (after 1.5 s, like edit mode). The same animation plays
  backwards: the farthest widget goes first, each accelerating into the origin, then the host goes
  back behind the windows. Pressing the key again mid-way turns the widgets round where they are.
- A fullscreen app or a protected game in front puts them away and refuses to bring them out.
- Everything else works while they're out: right-click menus, Edit Widgets…, ticking off Today.
- **Calendar** (new kind): small is the weekday, the day and the time; medium adds this month (the
  week starts on the day your Windows language uses, today ringed); large adds today's open items
  from the Lens calendar. New layouts (any monitor that never had widgets) start with a medium
  Calendar in the top-left cell, then Notes and Today.
- **Monitors and scaling**: the flyout opens on the monitor under the pointer and uses that
  monitor's own layout; the host is placed with `place::place_window` (DPI-checked) before the
  page is told to fly, and the page loads that monitor's widgets first if it was showing another
  one. Origins Lens sends are converted to CSS pixels with that monitor's scale
  (`flyout_origin`), so the legs land on the same spot at 100 %, 150 % or 200 %. When the widgets
  are back in, the host returns to Lens's monitor.
- **Motion**: one Web Animation per widget from "shrunk onto the origin" (scale 0.18, faded) to
  "in place", 360 ms on the `out` curve with up to 160 ms of stagger; drawing in plays it in
  reverse (the stagger is mirrored with `endDelay`). Transform and opacity only; the animations are
  dropped once a leg ends, so drags and FLIP reflows are untouched. Reduced motion: a 140 ms fade.
  Rust keeps the host in front for `FLYOUT_TUCK_MS` (560 ms) after "back in" so no window covers
  the widgets halfway.
- Code: `desktop_widgets_flyout` and `widgets_key` in `commands/desktop_widgets.rs` (the `OUT`,
  `TUCK_UNTIL` and `FLY_TARGET` state), `host_on` / `flyout_origin` in
  `magic_waves/desktop_widgets.rs`, `fly()` and the `EVT_FLYOUT` listener in
  `DeskWidgetsSurface.tsx`, `CalendarWidget` in `Widgets.tsx`, `monthGrid` / `flyFrom` /
  `flyStagger` in `model.ts`.

## How it works

- **One host window** (`deskwidgets`, built from its `tauri.conf.json` entry only while the flag is
  on) covers the work area of Lens's monitor. It is a tool window (no Alt+Tab, no taskbar button),
  non-activating (clicking a widget never takes the focus from your app), and sits at the bottom of
  the window stack, just above the desktop (`HWND_BOTTOM`, re-asserted every 3 s, so it survives an
  Explorer restart). When the desktop itself is in front (Show desktop, Win+D) it rises above it so
  widgets don't vanish with the windows; in edit mode it comes to the front and takes the keyboard.
- **Click-through except over widgets**: the page reports each widget's rectangle; the host loop
  (Rust, about 25 passes a second) checks the pointer and lets clicks through everywhere else. A
  drag or an open menu holds the pointer until it ends.
- **Hidden for games and fullscreen**: hidden while the app in front covers its monitor without a
  title bar (a game, a film, a presentation; Windows' own "D3D fullscreen" state counts too) or is
  on the anti-cheat list (`win_rules::is_anti_cheat_process`). Nothing is injected into any app.
- **Sign-in**: the host starts from Lens's setup, after the sign-in gate.
- **Placement**: checked every 2 s with `place::place_window` (one checked `SetWindowPos`, placed
  again when a DPI change resized it on the way), so monitor, resolution and scaling changes follow.
- **Grid**: square cells of 152 px with 16 px gaps (CSS pixels, so higher scaling means fewer
  cells); small 1×1, medium 2×1, large 2×2; packed from the top-left down each column, starting
  under the Top Bar. Chosen spots are kept when they still fit; a smaller monitor clamps the rest
  back on (`src/deskwidgets/grid.ts`).
- **Layout per monitor** in `%APPDATA%\LensUI\desktop-widgets.json` (atomic writes, sanitized on
  read), keyed by the monitor's device name and resolution. Not in config.json, so agents using the
  control catalogue can't rearrange your desktop (they can only turn the feature on or off).
- **Feel** (DESIGN.md §5): every control declares a press weight (`data-weight`: light for menu
  rows, the kinds list and notes; medium for widget buttons, the − badge and the cards; heavy for
  Done/Save and the gallery previews). The press starts on pointer-down, shows for at least 90 ms
  even on the quickest click (also for Space/Enter), sinks (medium 0.97 and 1 px, heavy 0.955 and
  1.5 px, a fill step) and springs back in 220 ms; hover never scales (`src/deskwidgets/press.ts`,
  a local stand-in for the shared press primitives). A widget added from the gallery grows from
  its preview (or from the preview carried under the pointer); the gallery rises from the bottom
  and returns there on Done/Esc, and both can be reversed mid-way.
- **Motion**: add, remove, resize and move reflow with FLIP (`captureFlip`, transform and opacity
  only); the analog second hand is one CSS sweep started at the current second. Reduced motion:
  no reflow animation, no fades, no second hand.

## Performance

- One shared 1 s tick for every widget (`src/deskwidgets/tick.ts`); minute listeners run when the
  minute changes. No widget starts a timer of its own.
- The tick stops, and the CSS sweep pauses, while the host is hidden (fullscreen app, game) or
  every widget is covered by app windows (checked every 1.5 s).
- No backdrop blur and no filters; the cards are solid. Expected memory: one WebView2 page with a
  handful of small React components, in the same range as the Dashboard window (about 30–50 MB in
  the shared WebView2 process group); closed entirely when the flag is off.
- Perf scenario `deskwidgets-reflow` (tools/perf): six resizes with reflow at 4× CPU throttle.

## Not built (follow-ups)

- **Bluetooth device batteries**: Windows exposes them through a device property
  (`DEVPKEY_Bluetooth_Battery`) per paired device; reading it needs SetupAPI/CfgMgr calls that
  can't be tested without hardware. PC battery only for now; the large size says so.
- **Usage (screen time)**: Lens doesn't track app foreground time, and adding tracking silently
  isn't something Lens does. Needs its own opt-in feature first.
- **Photos "On this day"**: no local, opt-in photo index exists yet.
- **One host per monitor**: the host lives on Lens's monitor (Settings › Dock & Bar › monitor);
  layouts are already stored per monitor, so a host per monitor is the next step.
- **A Lens desktop context menu**: Explorer owns the desktop's right-click; Lens's own entry point
  there is Magic (Ctrl+Alt+right-click on the desktop → Edit widgets…).

## Real-PC checks

- Widgets stay below every app window, above the desktop icons area, and never show in Alt+Tab or
  the taskbar; clicking a widget doesn't take the focus from the app you're in.
- Clicks between widgets reach the desktop (icons, Explorer's own right-click menu).
- Win+D keeps the widgets; restoring windows puts them back on top of the widgets.
- A fullscreen game (and an anti-cheat game) hides them at once; they come back after.
- Explorer restart (Task Manager › Restart) and a scaling change (100 % ↔ 150 %) leave them in place.
- Drag, resize and add feel smooth (60 fps) on a mid-range PC.

## Code

| Piece | Where |
|---|---|
| Flag | `config::MagicWavesConfig::desktop_widgets`, `src/magicwaves/flags.ts` |
| Host window, rules, loop | Rust `commands/desktop_widgets.rs` (loop, Win32), `magic_waves/desktop_widgets.rs` (pure rules, layout store, tests) |
| Page | `src/deskwidgets/DeskWidgetsSurface.tsx`, `EditGallery.tsx`, `Widgets.tsx`, `grid.ts`, `tick.ts`, `model.ts`, `api.ts`, `deskwidgets.css` |
| Entry points | `src/magicwaves/MagicPreviewSection.tsx`, `src/widgets/WidgetsLane.tsx` (Dashboard switch), `src/command/CommandSurface.tsx` ("edit widgets"), `src/magic/model.ts` (`desktopRows`) |
| Tests | `src/__tests__/deskWidgets.test.ts`, `magic.test.ts`; Rust `magic_waves::desktop_widgets::tests`; parity `tools/parity/magicwaves/shoot.mjs` (desk scenes); visual `deskwidgets`, `deskwidgets-edit`; theme-switch rig scenario C; hyper (surface `deskwidgets`); perf `deskwidgets-reflow`; E2E `desktop-widgets` |
