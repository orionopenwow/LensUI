# Settings hub

The Settings popout (Control Center, opened from the Dock) is one calm place for both Lens and Windows.

## Map

| Group | Page | What's on it | Old tab(s) |
|---|---|---|---|
| Lens | Appearance | Theme & Look (packs, accent, glass, window frames, pointer suite) | theme, controls |
| Lens | Dock & Bar | Dock style and options, top bar | dock, topbar |
| Lens | Desktop | Playground, desktop sessions, tiling/workspaces, widgets, folder icons | sessions, widgets, folders |
| Lens | Windows & Keys | Virtual desktops, Windows integration, keys/corners/monitors, window styling, shell mode | system, func |
| Lens | AI & Command | AI engine, Lens Command, clipboard, connections, transcription, MCP, **Agents** (section) | ai, agents |
| Windows | Display | Brightness, night light + warmth, monitors (arrangement, resolution, Hz, scale), HDR link | — |
| Windows | Sound | Volume, mute, output/input device, per-app volume | — |
| Windows | Network & Bluetooth | Wi-Fi on/off + networks (connect saved/open), Bluetooth on/off + paired devices, airplane link | — |
| Windows | Power & Battery | Power mode, battery, battery saver, sleep links, power actions | — |
| Windows | Apps & Startup | Startup apps on/off, default/installed apps links | — |
| Windows | Storage | Drive usage, cleanup and Storage Sense links | — |
| Windows | Focus & Notifications | Lens Do not disturb, Windows focus/notifications links | — |
| Windows | Privacy & Security | Which apps are using camera/mic/location, Windows Security link | — |
| Windows | Update | Windows Update links (Lens updates are in About) | — |
| Windows | Time & Language | Time zone, clock format, keyboard layouts (switch) | — |
| Windows | Accessibility | Animation effects (switch), text size, contrast, magnifier | — |
| Windows | Gaming | Game Mode status, "Pause Lens in games" | — |
| Status | System & Tasks | CPU, memory, uptime, windows and processes | monitor |
| Status | Notifications | Messages and history | messages |
| Status | About & Testing | Lens updates, crash reports, self-test, backups, Tester Hub | about |

Old tab ids still work everywhere (`lens://settings-tab` events, `open_dock_popout_tab_cmd`): `resolveTarget()` in `src/settings/registry.ts` maps them.

## Native vs deep link

Lens only changes what it can change safely and reversibly; everything else shows the current value plus a precise `ms-settings:` link.

| Control | How |
|---|---|
| Brightness, night light, warmth | existing native commands (`set_brightness_cmd`, `set_night_light_cmd`) |
| Volume, mute, per-app volume and mute | Core Audio (existing commands), as white fill bars |
| Which apps are playing, live output/app/mic levels | **new** `sys_audio_levels_cmd` (session state + IAudioMeterInformation), polled every 1.5 s only while the page is visible |
| Microphone volume and mute | **new** `sys_set_mic_cmd` (default capture endpoint). Same switch as Windows' own; nothing to restore |
| Switch output | between the last two output devices you used (remembered on this PC) |
| Per-app output routing | no public API → link to App volume & device preferences |
| Default output/input device | existing `set_default_audio_device_cmd` (disabled with a note when Windows doesn't allow it) |
| Wi-Fi on/off, Bluetooth on/off | Windows.Devices.Radios (existing `set_radio_cmd`) |
| Connect to a saved or open Wi-Fi network | WlanAPI with the saved profile (existing `wifi_connect_cmd`). Passwords are only typed into Windows' own page |
| Power mode | existing `set_power_mode_cmd` (PowerSetActiveOverlayScheme) |
| Startup apps on/off | **new**: HKCU `Explorer\StartupApproved\Run` (the Task Manager switch). Originals saved; restored by "Remove all Lens changes" |
| Animation effects | **new**: `SPI_SETCLIENTAREAANIMATION`. Original saved; restored by "Remove all Lens changes" |
| Keyboard layout | existing `set_keyboard_layout_cmd` |
| Lens Do not disturb, Pause Lens in games | Lens config / existing commands |
| Read-outs: refresh rate, drives, camera/mic/location use, high contrast, text size, time zone, clock format, Game Mode | **new** `sys_*_cmd` (EnumDisplaySettings, GetDiskFreeSpaceEx, ConsentStore, SystemParametersInfo, HKCU/HKLM reads) |
| Deep link only | airplane mode, battery saver, screen/sleep timeouts, HDR, resolution/scale, Bluetooth connect/pair, default/installed apps, Storage Sense, Windows notifications/focus, Windows Update, Windows Security, contrast themes, magnifier, Game Mode, time zone |

HKLM is never written. Nothing here touches other processes or games.

## Sound mixer

One connected card, most-used first: master volume (40 px bar, mute, level) → **Playing now** (34 px bars with app icon, mute and a live level) → **Other apps (N)** collapsed → **Output** devices with a "Switch to …" quick toggle → **Microphone** (device, level, volume bar, mute) → "More sound settings" links. Rows only move when an app starts or stops playing (`src/settings/audioOrder.ts`). Everything the old Windows & Quick mixer had (master + mute, per-app bars with icon-click mute) is here.

`FillSlider` (`src/settings/ui/FillSlider.tsx`, logic in `fillModel.ts`) is the shared bar: theme ink fill (near-white on dark, near-black on light), icon/label left and value right that flip colour where the fill passes, drag anywhere, wheel (2%/notch), arrows 1 / PageUp-Down 10 / Home-End; the bar moves live and commits on release (keys/wheel after a short pause). Display uses it for brightness and night-light warmth.

## Layout

Every page is: sticky header (icon, title, one line, "Windows Settings ↗") → hero row (the 2–4 things people do most) → collapsible sections with a one-line summary → rows (label column, right-aligned value/control). Primitives live in `src/settings/ui/primitives.tsx`; states (loading, error with a Windows Settings way out, unavailable with the reason) in `StateNote`. Each page renders inside `PageErrorBoundary` (Retry instead of a blank window). Sliders commit after the hand stops (debounced); toggles are optimistic with rollback and a readable error.

Search (top of the sidebar, Ctrl+F or `/`) indexes every page, section and 53 Windows Settings pages; results show the breadcrumb and Windows entries open the exact `ms-settings:` page. Arrow keys move through the sidebar.

## Deep links

`page`, `page#section`, legacy ids and `lens://settings/page#section` all resolve. From the frontend: `emit("lens://settings-tab", "sound#mixer")`. From Rust: `open_dock_popout_tab_cmd { tab: "network#bluetooth" }`.

Snippet for the bridge owner (`src-tauri/src/bridge/cli.rs::parse_lens_url`) so external `lens://settings/...` links work:

```rust
// before the action match:
if let Some(target) = host.strip_prefix("settings") {
    let target = target.trim_matches('/');
    let section = head.split_once('#').map(|(_, s)| s).unwrap_or("");
    return Ok(json!({ "v": 1, "action": "settings_open", "target": format!("{}{}{}", target, if section.is_empty() { "" } else { "#" }, section) }));
}
// and in the action dispatcher: "settings_open" => open_dock_popout_tab_cmd(target)
```

Voice / Command / Guide: emit `lens://settings-tab` with any page id from `PAGES` (e.g. "Lens, open sound settings" → `sound`).

## Duplicates removed

1. Top stats strip (CPU/RAM/windows + quick actions): removed earlier; all of it lives in System & Tasks, Quick Settings or the palette.
2. Windows & Keys' CPU/Memory/Uptime row: removed earlier.
3. Display & Eye Care and Sound & App Mixer cards in Windows & Keys → Windows › Display and Windows › Sound.
4. The 4 big Windows tiles + 8 pills (Wi-Fi, Bluetooth, Display, Sound, Power, Apps, Storage, Updates, Gaming, Input, Security, System deep links) → replaced by the Windows pages.
5. Hidden "Window Style & Controls" tab (traffic lights, button order, control theme, window frame) duplicated Appearance › Window frames & buttons → removed.
6. WindowRulesCard was mounted twice → once, in Windows & Keys › Window styling.
7. Quick-action "Taskbar Hidden" and "Traffic Lights" toggles duplicated Dock & Bar / Appearance → removed (virtual desktops, Task Manager and File Explorer remain).
8. Self-test, Back up & restore, Updates and Crash reports moved from Windows & Keys to About & Testing.
9. "Auto-pause overlays in fullscreen games" moved from Windows & Keys to Windows › Gaming.
10. Agents and Folder Icons are sections, not separate tabs.

Still duplicated (left on purpose): the older "Clipboard History" toggle in Windows & Keys and the new clipboard history in AI & Command, until the new one is checked on hardware (see INTEGRATION_NOTES).

## Not split yet

Appearance, Dock & Bar, Desktop, Windows & Keys, System & Tasks and Notifications are still rendered by `ControlCenterSurface.tsx` (now ~1,250 lines, down from ~1,980) inside the new page shell; the next step is moving each into `src/settings/pages/` the same way.

## Live updates

No background polling while Settings is hidden. Each page reloads when the popout is shown or focused, listens to the events Lens already emits (`lens://dnd-changed`, `lens://windows-changed`), and polls only what changes on its own while visible (Wi-Fi/Bluetooth 15 s, battery 30 s, app audio 5 s, privacy use 10 s). Device add/remove and power-source broadcasts from Windows would replace those polls; that needs a message-only window in the backend (planned).

## Tests

- Rust (`syssettings::tests`): StartupApproved bytes round trip, hex round trip, originals recorded once, ConsentStore names and in-use rule, clock/Game Mode/text-size parsing, backup serialisation. Power-mode GUIDs and battery parsing are covered by the existing `tests/win_system_modules.rs`.
- bun (`src/__tests__/settingsHub.test.ts`): registry completeness, deep links, the ms-settings catalogue, 40 golden search queries, the error boundary's Retry.
- Screenshots: `node tools/parity/build.mjs && node tools/parity/settings-hub/shoot.mjs` (every page × obsidian/alabaster-daylight × 760×560/1024×640; fails on page errors or a shown error boundary).
