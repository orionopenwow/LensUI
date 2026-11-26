# Failsafe engineering

One fault must never break the desktop. Lens sits where the taskbar, the Start key and Alt+Tab
used to be, so a bug in one feature cannot be allowed to take the others, or Windows itself, down
with it. This page lists every guard, what it does when it fires, and how it is tested.

The rule behind all of them: **contain the fault, hand the event back to Windows, tell the person
once, and keep the rest running.**

| § | Guard | Where | What happens when it fires |
|---|---|---|---|
| 1 | Surface isolation | `src/failsafe/`, `src/main.tsx`, `app/loadguard.rs` | The crashed window shows one line and reloads itself; three failures in a row switch that window off for the session. A window whose page dies is reloaded. |
| 2 | Window state machine | `app/surface_state.rs`, `commands/surfaces.rs` | A stale or repeated show or hide is ignored. |
| 3 | No panic across FFI | `failsafe/guard.rs`, every OS callback | The panic is caught and counted, the event goes on to Windows, the feature sits out for a minute. |
| 4 | Timeouts and retries | `failsafe/call.rs`, `commands/system.rs` | The call returns a typed error after its time limit; Lens never waits on a hung OS call. |
| 5 | Circuit breakers, kill switches, Safe Mode | `failsafe/breaker.rs`, `failsafe/features.rs` | A control that keeps hanging is paused with one notice; `features.json` or Safe Mode hold features off for a run. |
| 6 | Crash-loop guard | `failsafe/boot.rs`, `app/safe_start.rs` | Two starts that never reach "the UI is up" in five minutes: taskbar back, one question, Safe Mode. |
| 7 | Config validation | `failsafe/config_check.rs`, `config.rs` | Only the damaged values (or sections) fall back to defaults; a copy of the old file is kept. |
| 8 | Chaos tests | `tools/soak/run.mjs`, `tests/e2e/failsafe.mjs`, Rust unit tests | Each of the above is broken on purpose in CI. |

Everything Lens reports stays on this PC: the session log (Tester Hub), `lens.log` and the crash
reports folder. Nothing is uploaded.

## 1. Surface isolation

Every surface (Dock, Top Bar, Settings, each flyout and overlay) is its own WebView2 window and
renders inside one error boundary, `SurfaceBoundary` in `src/main.tsx`.

When a surface throws while rendering:

1. The crash is reported (`failsafe_ui_crash`): the session log and `lens.log` get the message and
   the top of the stack, with the user name and profile path removed.
2. **First failure:** the window says "This part of Lens hit a problem. Reloading…" and reloads
   itself after 0.8 s.
3. **Second failure in a row** (within a minute): a window offers a **Reload** button and waits
   for it. An overlay, which has nothing to click, waits 4 s and reloads once more.
4. **Third failure in a row:** the surface is off until Lens restarts. A window says so and offers
   **Try again**; the person is told once by a Lens notification.

Overlay surfaces (wallpaper, pointer effects, focus dimming, the notification stack, the snip
overlay, the desktop tab and the like) never show a card, and a crashed overlay asks for its own
window to be hidden, so it can never sit over the desktop as an invisible sheet that eats clicks.

A surface that runs for 30 s without failing starts from a clean slate. The count lives in the
window's `sessionStorage`, so it survives the window's own reloads and ends with Lens.

Coach marks and the "Lens at work" twin are mounted beside the surface in their own quiet
boundaries: if one of them throws it disappears and is reported, and the surface carries on.

Uncaught errors and unhandled promise rejections go through the same reporter, limited to twelve
per ten seconds so a page stuck in an error loop cannot flood the log.

**A page that dies after it loaded.** If the WebView2 renderer behind the Dock, Top Bar or desktop
tab crashes or is killed, the window stays on screen showing nothing and no script is left to
notice. These three pages send a heartbeat every 5 s (`surface_alive_cmd`). `app/loadguard.rs`
checks it every 20 s; when a *visible* window's heartbeat has been missing for 150 s on three
checks in a row, the page is reloaded with the same backoff as a page that never loaded (3 s,
10 s, 30 s), at most three times per run. If that fails, the Windows taskbar comes back and one
message explains. The thresholds are long on purpose: a browser slows a hidden page's timers to
one a minute, and a check that itself ran late (the PC slept) judges nothing.

## 2. Window state machine

`app/surface_state.rs` owns show and hide for every surface window:

```text
Hidden ──show──▶ Showing ──shown──▶ Shown ──hide──▶ Hiding ──hidden(gen)──▶ Hidden
                    ▲                                  │
                    └────────────── show ──────────────┘   (a show during Hiding wins)
```

Each window has its own phase and its own generation. Every accepted show or hide takes a new
generation, and the acknowledgement that finishes a hide (the page's "exit done" or the fallback
timer) must quote it. So:

* a show always wins: a hide still in flight can no longer hide a window that was just reopened;
* a second hide while closing does nothing;
* a late or repeated acknowledgement is ignored;
* a window shown or hidden by another path is settled from what the native window reports.

Before this, every window that was not on a short list shared one counter, so a show for one
window could cancel another window's hide. `glide_show_surface`, `glide_hide_surface` and
`surface_exit_done_cmd` now all go through the machine. The phases are listed in
`failsafe_status` for the Tester Hub.

## 3. No panic across FFI

A panic inside an `extern "system"` callback cannot unwind into Windows; Rust aborts the process,
with the keyboard hook installed and the taskbar possibly hidden. Every callback body now runs
inside `failsafe::guard::ffi_guard`:

* the low-level keyboard and mouse hooks (`input.rs`): a panicking handler passes the event to the
  next hook and the feature that was running is left out of dispatch for a minute, the same as a
  handler that stalled;
* window procedures (caption buttons, tray host, clipboard listeners, previews, focus dimming):
  the message goes to `DefWindowProcW`;
* WinEvent callbacks (window events, tiler, caption engine, focus dimming): the event is dropped;
* enumeration callbacks (windows, monitors): enumeration continues;
* the console control handler.

Release builds now use `panic = "unwind"` so the guards can catch. A panic **outside** a guard is
still the end of the process, exactly as before: the panic hook writes the crash report, restores
the taskbar and everything else Lens changed, and aborts. A panic inside a guard writes a crash
report for the first three per run, is counted by place (Settings › About & Testing › Safety net
shows the counts), and tears nothing down.

`win_dwm_engine.rs` and the hook DLL are owned by the agent-safety work and are not wrapped here.

## 4. Timeouts and retries

`failsafe::call` is the one way to make an OS call that can hang (COM, WMI, DDC/CI monitors, the
radio stack, PowerShell):

* `with_timeout(what, limit, f)` runs `f` on a worker thread and waits at most `limit`. The error
  is typed: `TimedOut`, `Failed`, `Busy` or `Crashed`, each with one sentence for the person.
* A call that never returns leaves its thread parked. At most two such threads exist per kind of
  call; after that new calls are refused at once (`Busy`) instead of piling up. Calls that are
  merely running at the same time (a slider being dragged) are never refused.
* `retry(what, policy, f)` is a bounded retry with backoff (`Retry::QUICK`: three tries, 150 ms
  then 450 ms; `Retry::ONCE_MORE`: two tries 80 ms apart, for sliders).
* `os_call(feature, label, what, limit, f)` adds the feature's circuit breaker (§5). An honest
  "can't" from Windows (no such device, access refused) is passed through unchanged and is never
  counted as a fault.

Applied to: volume and mute, per-app volume, screen brightness (WMI and DDC/CI, with retries),
the list of screens, the Quick Settings state probe, Wi-Fi scan, connect and disconnect, the
radio switches, the Bluetooth and Wi-Fi state reads, the Core Apps performance sampler and the
installer signature check.

## 5. Circuit breakers, kill switches and Safe Mode

**Circuit breaker.** Three faults (timeouts, crashes, stuck calls) from one feature inside a
minute pause that feature for the session. Further calls are refused with a sentence that says
so, one Lens notification is shown, and Settings › About & Testing › Safety net lists the feature
with **Turn back on**. A success in between starts the count again.

**Kill switches.** `%APPDATA%\LensUI\features.json` switches named features off at startup,
whatever the settings say:

```json
{ "off": ["tiling", "windowHook"] }
```

| Name | Feature |
|---|---|
| `taskbar` | Hiding the Windows taskbar |
| `windowHook` | Window styling hook |
| `keyboard` | Win key, Alt+Tab, Dock number and tiling shortcuts |
| `tray` | Tray icons in the Top Bar |
| `clipboard` | Clipboard history |
| `windowButtons` | Lens window buttons and frames |
| `tiling`, `workspaces`, `hotCorners`, `altDrag`, `appSummon` | As named |
| `mcp` | Connections from AI apps |
| `ai`, `command` | Lens AI, Lens Command |

Unknown names are ignored. The file is read once, at launch.

**Safe Mode** switches every feature in that table off for one run and installs no low-level hook
at all (`input::claim` refuses). The Dock, Top Bar, Settings and themes stay. Start it with
`lens-ui.exe --safe-mode`, from Settings › About & Testing › Safety net ("Start in Safe Mode next
time"), or through the crash-loop guard (§6).

Both work by holding config values off **in memory only**. `config.json` keeps what the person
chose: every save puts the stored value back for a switch that is still held off, and a switch the
person turns on during the run keeps the new choice. "Remove all Lens changes" releases the hold
first, so what it switches off is written as off.

Limits: features with their own settings file (living wallpapers, the Magic menu, voice) are not
in the table. In Safe Mode the ones that need a hook stay off because no hook is installed; the
others keep their own switch.

## 6. Crash-loop guard

Every start is written to `%APPDATA%\LensUI\boot-guard.json` before the config is loaded or
anything is switched on. A start is marked good when a surface page has reported ready and Lens
has been up for 20 s, when Lens quits cleanly, or when its console is closed.

Two starts inside five minutes that never got that mark mean Lens is failing on launch. The next
start then, before anything else:

1. brings the Windows taskbar back;
2. asks once, in a native message box (not a Lens window: the WebView may be what is failing):
   **Yes** starts normally, **No** starts in Safe Mode, **Cancel** does not start Lens and opens
   the crash reports folder so a report can be sent.

Answering forgets the earlier failures; the start in progress still has to prove itself, so a
Lens that keeps failing keeps asking. Development runs (`tauri dev`), which are killed on every
code change, are not counted. `LENS_SAFE_MODE_CHOICE=normal|safe|quit` answers the question for
unattended runs (CI sets `normal`).

The taskbar restore also runs from the panic hook, from the console control handler, on a clean
exit, when the load guard gives up, and from `Restore-Windows-Taskbar.bat` with Lens not running.

## 7. Config validation

`load_config` never fails and never panics:

1. A file that loads is used as written.
2. Otherwise a copy is kept (`config.json.unreadable-<time>`), and values whose JSON type differs
   from the default's are replaced, path by path (`theme.borderRadius`, `dock`).
3. If the document still does not load, each top-level section is tried on top of the defaults
   and the ones that fail are replaced whole.
4. Only a file that is not JSON at all, or was written by a newer Lens, falls back to full
   defaults.

The person is told once what was reset, and the list stays in Settings › About & Testing ›
Safety net until Lens restarts.

## 8. Chaos tests

| Fault injected | Where | What must hold |
|---|---|---|
| A surface throws while rendering (window and overlay) | `tools/soak/run.mjs` (`failsafe`), `tests/e2e/failsafe.mjs` | Reported; reloads once; offers Reload; switches off after three; overlays show nothing and ask to be hidden; Try again starts over |
| Half of all backend calls fail or time out | `tools/soak/run.mjs` (`failsafe`, ipc-storm) | No surface crashes or goes blank |
| 5 % of backend calls fail, three seeds, eleven surfaces | `tools/soak/run.mjs` (`chaos`) | As above; a boundary takeover counts as a crash |
| `config.json` with wrong-typed values | `tests/e2e/failsafe.mjs`, `config_check` unit tests | Only those values reset; the rest survives; a copy is kept |
| `config.json` that is not JSON | same | Defaults; a copy is kept; Lens starts |
| `features.json` kill switch | `tests/e2e/failsafe.mjs`, `features` unit tests | Feature off for the run; saving does not rewrite the stored choice |
| Lens killed twice before its UI is up | `tests/e2e/failsafe.mjs`, `boot` unit tests | Third start is offered Safe Mode; hooks off; stored settings untouched; the next start is normal |
| Safe Mode question answered "quit" | same | Exits with code 0; not counted as a failure |
| Every WebView2 renderer killed | `tests/e2e/failsafe.mjs`, `loadguard` unit tests | The Lens process survives; the Dock page is reloaded |
| The HKCU Run key refuses writes | `tests/e2e/failsafe.mjs` | The command reports an error; Lens keeps running |
| A callback panics; an OS call hangs, crashes or keeps failing | `guard`, `call`, `breaker` unit tests | Caught and counted; typed error; the feature is paused after three faults; an honest error never pauses anything |
| Any order of show, hide and late acknowledgements | `surface_state` unit tests (every sequence of six requests) | The machine stays consistent; only the current hide can hide the window |
| Dev or asset server unreachable | `app/loadguard.rs`, `app/autostart_guard.rs` (B-21) | The window stays hidden and click-through, is retried with backoff; then the taskbar comes back |

The headless suites run on every push (`.github/workflows/e2e.yml`, job "Fluidity, visuals, a11y,
soak"). `tests/e2e/failsafe.mjs` runs on the Windows runner against the real app; it rewrites
Lens' data folder and, for one scenario, the permissions of the HKCU Run key, puts both back, and
therefore only runs on CI unless `FAILSAFE_RUN=1` is set.

### Needs a real PC

CI has no GPU session, no second monitor, no real DDC/CI screen and no sleep. Before a release,
check on hardware:

* Safe Mode question on a real sign-in (Lens set to start with Windows), all three answers.
* A hung DDC/CI monitor or a disabled audio service: the control is paused after three timeouts
  and **Turn back on** works.
* Sleep and resume, and a display unplugged, with the Dock visible: the liveness check must not
  reload a healthy page.
* Killing `msedgewebview2.exe` (the GPU process and the browser process, not only a renderer).
* A fullscreen game in front while a hook handler is benched: input must be unaffected.
* Release build size and start-up time after the move from `panic = "abort"` to `"unwind"`.

## 9. Sign-in safety

What Lens may do while Windows is signing you in, and what always gets you back to a working
desktop. Added after a report that "Start with Windows" made it hard to get in.

**Sign-in gate** (`app/signin_gate.rs`). A Lens started by "Start with Windows" (`--autostart`)
creates no window, installs no hook and leaves the taskbar alone until the desktop is ready:
Explorer's taskbar window exists and the input desktop is the normal one (not the lock screen,
the sign-in screen or a UAC prompt), both for 3 s in a row. If that never happens Lens starts
anyway after two minutes, but never while the lock or sign-in screen is up. **Hold Shift while
signing in to skip Lens for that sign-in.** A Lens started by hand does not wait.

**Keys that always reach Windows** (`input::protected_combo`). Whatever a Lens feature asks, these
pass through the keyboard hook untouched: Ctrl+Alt+Del, Ctrl+Shift+Esc, Alt+Esc, Alt+F4, Win+L,
Win+D, Win+Tab. Alt+Tab is only ever taken by the optional Lens Alt+Tab (off by default), which
falls back to Windows when its page does not answer. Every hook calls `CallNextHookEx` unless a
handler swallowed the key.

**Shell Mode is a Tester mode experiment.** Replacing Explorer as the Windows shell can leave a
person with no desktop at sign-in. The card only shows with Tester mode on, enabling it is refused
otherwise, and an override found at start-up without Tester mode is removed.

**Start-up crashes** (§6) still bring back the Windows taskbar first and ask about Safe Mode in a
native box; as the shell, the boot guard starts Explorer after two failed starts.

**The watcher cannot freeze the Dock and Top Bar in place.** Each watcher pass runs inside a panic
guard (a panic used to end the whole process). A supervisor thread watches the passes: after 2 s
without one, the Dock and Top Bar are made click-through until the watcher runs again, so a stuck
Lens can never cover other apps' buttons.

**Fix-My-Desktop.bat** removes the start-with-Windows entry, the Shell Mode override and
restarts Explorer. It is safe to run at any time.

## 10. Monitors and pop-outs

- The Dock and Top Bar are placed again whenever the monitor they belong on changes in any way
  (added or removed, resolution, scaling, work area, after sleep). They used to be placed only at
  start-up and on a setting change.
- **Follow the pointer** (Settings › Dock & Bar › Monitor): the bars stay on their monitor until
  the pointer is pushed into the top or bottom edge of another one.
- Pop-outs close by themselves: Quick Settings after 1.5 s and Settings on the Dock after 1.8 s
  with the pointer away and no keyboard focus in them; never under the pointer, never while a
  mouse button is held. Settings dragged off the Dock is a window and stays. The setting is
  `func.autoClosePopouts` (on by default).
