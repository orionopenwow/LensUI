# Lens — Shell Mode

Shell Mode makes Lens the Windows shell for **your user account**: at sign-in Windows starts
Lens instead of Explorer's desktop and taskbar. It is off by default and never required.
Without it, Lens runs as an overlay on top of Explorer, exactly as before.

> Status: written but not yet run on a real machine. Try it on a spare account or a virtual
> machine first, and keep `Restore-Windows-Shell.bat` somewhere you can find it.

## What it changes

One registry value, for the current user only:

```
HKCU\Software\Microsoft\Windows NT\CurrentVersion\Winlogon
    Shell = "C:\...\lens-ui.exe" --shell
```

Nothing machine-wide (`HKLM`) is ever written. Deleting that one value puts Windows back on Explorer.
Other user accounts on the PC are not affected.

Shell Mode can only be enabled from a release build. A development build (`bun run tauri dev`)
refuses, because its program path is not stable.

## What you lose without Explorer

Explorer is more than file windows. While Lens is the shell, these are absent unless Lens provides them:

| Explorer feature | In Shell Mode |
| :--- | :--- |
| Taskbar and Start menu | Replaced by the Lens Dock, Top Bar and search |
| System tray icons | Only what Lens hosts itself; the "peek native taskbar" chevron has nothing to show |
| Desktop icons | Lens desktop folder only |
| Wallpaper | May be a plain background — Explorer normally draws it |
| Windows notification toasts and Action Center | Lens notifications only |
| `Win` key shortcuts (`Win+E`, `Win+R`, `Win+D`, `Win+Tab`, snap layouts…) | Mostly unavailable; Explorer handles them |
| Alt+Tab | Falls back to the basic Windows switcher |
| Startup apps | Lens starts your per-user `Run` entries and Startup-folder items once per sign-in, respecting Task Manager's on/off switches. Machine-wide startup entries and `RunOnce` are not run |
| Store / UWP apps | May start slowly or not at all; they rely on Explorer more than classic apps do |

File Explorer windows still work: opening a folder starts `explorer.exe` as an ordinary file window.

## Three ways back to the normal desktop

1. **`Restore-Windows-Shell.bat`** (in the Lens folder). Removes the registry value and starts
   Explorer. Works even if Lens will not start.
2. **Task Manager.** Press `Ctrl+Shift+Esc` → *Run new task* → type the full path to
   `Restore-Windows-Shell.bat` → OK. This keyboard shortcut works with no shell running at all.
   If you only type `explorer` there, you get a file window but not the taskbar, because Windows still
   thinks Lens is the shell — run the bat, or first run:
   `reg delete "HKCU\Software\Microsoft\Windows NT\CurrentVersion\Winlogon" /v Shell /f`
   and then `explorer`.
3. **The automatic boot guard.** Each time Lens starts as the shell it counts the attempt, and clears
   the count once the desktop has been up for about 20 seconds. If the next start finds the count
   still set, the previous one never reached a working desktop: Lens switches Shell Mode off, starts
   Explorer, and shows the reason in Control Center. One failed start is enough to trigger it.
   Signing out within the first 20 seconds counts as a failed start too — that is deliberate.

Inside Lens there are also: **Start Explorer now** in Control Center, the emergency hotkey
`Ctrl+Alt+Shift+E`, and quitting Lens — all three bring Explorer's desktop back immediately.
A crash inside Lens switches Shell Mode off and starts Explorer by itself.

`Ctrl+Alt+Del` always works as well (sign out, Task Manager, power).

## Files it keeps

In `%APPDATA%\LensUI`:

- `shell-mode.marker` — Shell Mode was enabled from this copy of Lens.
- `shell-boot-attempts` — the boot guard's counter (absent after a good start).
- `shell-last-boot.txt` — outcome of the last start as the shell, shown in Control Center.

## For developers

All logic is in `src-tauri/src/win_shell.rs`. Call order in `lib.rs`:

1. `win_shell::shell_startup()` — first line of `run()`.
2. `win_shell::run_startup_apps()` — in `setup()`, on a background thread, only when step 1 returned `Shell`.
3. `win_shell::mark_shell_boot_ok()` — about 20 seconds after `setup()`.
4. `win_shell::emergency_restore_explorer(..)` — in the panic hook.
5. `win_shell::on_quit_restore_desktop()` — on every quit path, before `app.exit`.
