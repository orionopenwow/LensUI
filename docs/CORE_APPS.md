# Lens core apps

Small companion apps built on backends Lens already has. They are quick wins, not rewrites. Each one opens in its own window (`coreapp-<id>`, route `index.html?surface=coreapp&app=<id>`). You can open them from:

- the Launcher and Command palette search;
- Command (`/monitor`, `/timer`, `/calc`, `/color`, `/notes`, `/power`, `/network`, `/clipboard`, `/startup`, `/uninstall`, `/stopwatch`, `/pomodoro`);
- voice ("Lens, open timer"; names Windows owns, like *calculator* and *notes*, need the "Lens" prefix);
- a Dock pin (the pin button in every app's title bar; the pin path is `lens-app:<id>`);
- links on the Settings pages where relevant (Power, Apps & Startup, Network).

| App | Reuses | Adds |
| --- | --- | --- |
| **Monitor** | `sys_telemetry::collect_telemetry`, `kill_process_pid_cmd`, the Dock icon extractor | Processes grouped by app with real icons, search and sort, plus sparklines for CPU, RAM, GPU, disk and network. GPU, disk and network come from CIM `Win32_PerfFormatted*` classes, read at most every 2 s on a background thread and only while the window asks. Plain-English "What's slowing my PC" hints. End task asks first, refuses Windows and Lens processes in Rust as well as in the UI, and is audited. |
| **Startup & Uninstall** | `sys_startup_list_cmd` / `sys_startup_set_cmd` (reversible; restored by *Remove all Lens changes*) | Estimated startup impact (labelled as an estimate). Installed apps from the HKLM, WOW6432Node and HKCU Uninstall keys, with size and last use (UserAssist, no admin). Uninstall only runs the app's own uninstaller (`validate_uninstall`) or `winget uninstall --exact --name`, after a confirm, through ShellExecute so UAC shows. Leftover folders are review-only, limited to the install folder of an app uninstalled this session, and go to the Recycle Bin. |
| **Timer** | `calc::parse_duration_secs`, notifications, Lens Do Not Disturb; voice `start_timer` now lands here | Timers, pomodoro (turns DND on for focus and puts back the previous state), stopwatch and alarms (one-off or by weekday). These run in Rust (`coreapps/timers.rs`) and are saved to `coreapps-timers.json`, so they ring with the window closed. The Dock pin shows a countdown badge. Clock faces: Classic, Dot matrix, Ring (Expressive), or Auto to follow the pack. |
| **Calculator** | `ai/calc.rs` (the same engine as Command and voice) | Expression history, unit conversion, and programmer mode (hex/dec/oct/bin, 8–64-bit, bitwise). Copy, or send to the Shelf. Currency is **off** until you allow it and press *Get rates* (frankfurter.app, ECB daily rates; only the currency code is sent). |
| **Color** | The Snip loupe idea, the theme config | Live 9×9 loupe that reads pixels under the pointer while you pick (never stored). Space or a click picks; Esc stops. Palette history and WCAG contrast with AA/AAA verdicts and a "fix it" shade. *Make it the Lens accent* asks first, can be undone, and opens the Theme lab. |
| **Notes** | Shelf storage (a shelf called "Notes") | Notes and to-dos with markdown-lite (no HTML), search, pins, and *Send to context pack*. *Pin to desktop* opens an always-on-top sticky (`coreapp-sticky-*`) with a click-through toggle; Ctrl+Shift+U in Notes makes every sticky clickable again. |
| **Power** | `get_battery_cmd`, `set_power_mode_cmd` | Battery health from `powercfg /batteryreport /xml`, written to a temp folder and deleted after reading (no admin). Shows design vs full-charge capacity, cycles, a recent charge graph, wear over time, and tips. |
| **Network** | `get_wifi_cmd` | Read-only. Shows the connection, IPv4/IPv6 (found with a no-packet UDP route lookup; the public IP is not looked up) and Wi-Fi details. "Who's using my internet right now" groups `netstat -ano` connections by app; it counts connections, not bandwidth. The speed test is off by default: it only runs after you pick a server and confirm. |
| **Clipboard** | `clip_*` commands (existing history) | Standalone window with filters, day groups, pins, search, paste-as (plain / markdown / trimmed) and send to the Shelf. |

## Shared shell

`src/coreapps/shell/` holds the shared parts:

- **AppShell:** logo badge and title, the Lens-at-work status (`usePresence` announces End task, uninstall and recycle through the presence orb, and Stop cancels), the Guide "?" anchor (F1), Pin to Dock, Open in Settings, a keyboard map (`?`), and a sticky bottom action bar with mono metadata and a solid primary button.
- **ui.tsx:** Hero (draws the headline number in dots on Dot Matrix packs), Card, Sparkline, Meter, Tabs (arrow keys), Switch, Search, Confirm (focus trap; Esc cancels), Toast, Empty (the pack's ambient backdrop), Skeleton, ErrorNote and an error boundary.
- **hooks.ts:** `useVisiblePoll` and `useLoad`, which never poll while hidden, and `useShape`.

Every screen has loading, empty, error and success states. Everything is reachable from the keyboard, with accessible names. Spacing is on a 4 px grid, numbers are tabular, and styles use Lens tokens only, so all packs (light and dark) and the Expressive and Dot Matrix shapes work.

These apps use their own small primitives next to `src/settings/ui`. **They move to `src/ui` once the AAA primitives land.**

## Safety

- Everything destructive is confirmed and audited to `%APPDATA%\LensUI\coreapps-audit.jsonl`: End task, uninstall, Recycle Bin and the speed test.
- OS changes made here (startup entries, power mode) go through the existing reversible commands.
- Uninstall can't be undone, so it always runs the vendor's own uninstaller.
- Leftovers go to the Recycle Bin and can be restored from there.
- Nothing contacts the network unless you press *Get rates* or *Run speed test*.

## Tests

- **Rust** (`src-tauri/src/coreapps/*`, run with `cargo test --lib`):
  - battery-report parser on fixture XML;
  - netstat parser and network table mapper;
  - `validate_uninstall`, which accepts MSI product codes and the app's own exe and rejects cmd, powershell, rundll32, shell metacharacters, other folders, UNC paths and `..`;
  - the leftover allow-list and UserAssist decoding;
  - the timer, pomodoro and alarm scheduler (time zones, weekdays);
  - WCAG contrast;
  - registry, voice names and pins.
- **bun** (`src/__tests__/coreapps.test.ts`): the load state machine, Monitor hints and sorting, startup impact, the stopwatch reducer and alarm parsing, programmer-mode evaluation, colour and palette, markdown-lite and to-dos, power, network, clipboard grouping, formatting, and a check that the TS registry matches the Rust one.
- **Gallery:** `node tools/parity/coreapps/build.mjs && node tools/parity/coreapps/shoot.mjs`. Every app is shot in obsidian and alabaster-daylight plus one Expressive or Dot Matrix variant, with a contact sheet.

## Needs real hardware

These parts can only be checked on a real Windows PC:

- GPU, disk and network counters (CIM classes; the GPU class needs WDDM 2.x drivers);
- `powercfg` battery reports on a laptop;
- the UserAssist last-used dates;
- uninstallers starting with UAC, and the Recycle Bin move;
- the screen-pixel sampler on mixed-DPI monitors;
- sticky click-through;
- the Dock countdown badge.

## Recommended next quick wins (ranked)

1. **Peek:** Space-to-preview for files from the Launcher, Desktop drawer and Shelf. Reuses the Snip studio viewer and the Shelf previewers.
2. **Screen Ruler:** measure distances and pick colours on screen. Reuses the Color sampler and the Snip overlay.
3. **Fonts:** browse installed fonts with sample text, compare them, and copy CSS. Read-only.
4. **Bluetooth devices:** battery levels and connect/disconnect. Reuses `get_bluetooth_cmd`.
5. **Windows Backup status:** File History, OneDrive folder backup and the last restore point. Read-only.
6. **Hosts / Firewall viewer:** a read-only view of the hosts file and the firewall rules per app.
7. **Display arranger:** a visual layout of the monitors, with scale and refresh rate. Reuses `list_monitors_cmd`; any change goes through Windows Settings.
8. **Wallpaper studio:** browse, crop and schedule wallpapers. Reuses the Lens wallpaper engine and the ambient scenes.

**Not quick wins:**

- **A full file manager** means replacing Explorer: shell extensions, every edge case of copy, move and permissions, network shares, and undo. A file manager that can lose files is worse than none. Peek and the Desktop drawer cover most of the need.
- **A mail client** means IMAP/Exchange/OAuth, offline sync, HTML rendering security, search and credential storage. It's a product on its own, and the messaging hub already covers notifications from mail.
