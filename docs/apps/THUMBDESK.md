# ThumbDesk in Lens

ThumbDesk ([github.com/orionopenwow/ThumbDesk](https://github.com/orionopenwow/ThumbDesk), MIT) is the
companion app from the makers of Lens: use the whole PC from an Xbox or PlayStation controller (120 Hz
dual-stick cursor, modifier layers, voice commands and scripts, a radial menu, DualSense gyro and
adaptive triggers, LAN companion), with an anti-cheat guard that pauses itself in protected and Steam
games. It ships as one portable `ThumbDesk.exe` with a `SHA256SUMS.txt` per release.

## Where it lives in Lens

| Place | What it does |
|---|---|
| Lens Apps (`catalog/apps/catalog.json`, id `thumbdesk`, collection "From the makers of Lens") | Get: downloads the latest release's `ThumbDesk.exe`, checks it against `SHA256SUMS.txt`, shows file, version, checksum and signature, and on "Keep it" stores it in `%APPDATA%\LensUI\apps\portable\thumbdesk\`. Open runs that copy. Uninstall deletes the folder. |
| Settings › Gaming › Use a controller, and Settings › Accessibility › Use a controller | The same card: Get ThumbDesk (two clicks), Open/Show, Pin to Dock, Remove, and a plain line about its state ("DualSense connected and driving the desktop", "Paused while a protected or Steam game has focus"). |
| Dock | When pinned, ThumbDesk's icon shows a small text badge: "Voice" while it listens, "Paused" while a game has it paused. Nothing otherwise. |
| Command | `/thumbdesk` and `/controller` open it (or the settings card if it isn't installed). Voice: "open thumbdesk", "controller mode". |
| Website | Home › "Run the desktop from the couch" (after Lens Apps), and the first tile in "More picks". |

## Rules

- Never installed without the person choosing it: Get, then Keep it.
- Lens only **reads** ThumbDesk's status (`GET http://127.0.0.1:49152/api/status`). It never calls the
  haptics, lightbar or profile endpoints and never sends input on ThumbDesk's behalf.
- The status call is made only while the settings card is open (every 5 s) or while ThumbDesk is
  pinned to the Dock (every 6 s, `commands/thumbdesk.rs::start_badge`). It gives up within a second
  when ThumbDesk isn't running.
- Everything Lens writes is inside `%APPDATA%\LensUI` (the portable copy and the Dock pin), so Remove
  all with "delete data" covers it; nothing outside Lens's data folder is touched.

## Feature catalogue row (for docs/brain/FEATURES.md)

| Feature | Area | Status | Why |
|---|---|---|---|
| ThumbDesk companion (controller control) | Apps / Gaming / Accessibility | Shipped (PR "Lens Apps: ThumbDesk") | Use the PC from a controller; a first-party companion, verified portable install, Dock badge, Command entry. |

## Code

- `src-tauri/src/thumbdesk.rs`: status parsing, the localhost call, the badge text (unit-tested).
- `src-tauri/src/commands/thumbdesk.rs`: `thumbdesk_info`, `thumbdesk_open`, the Dock badge thread.
- `src-tauri/src/commands/apps.rs`: portable installs for any catalogue app with `"portable": true`
  (`install_portable`, `portable_program`, `apps_portable_remove`).
- `src/components/ControllerCard.tsx`, `src/components/controller.ts`: the settings card.
- `src/coreapps/registry.ts`: `/thumbdesk`, `/controller`.
- `tools/site/content/thumbdesk.mjs`: the website section.
