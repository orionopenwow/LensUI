# Replacing Windhawk with something of our own

Status: **research and plan, nothing built**. Written 24 November 2026 against `main` after #81. Owner: the maintainer. This decides how Lens can style other apps' windows without asking people to install Windhawk, and without breaking the promises in [brain/IDENTITY.md](brain/IDENTITY.md) (off by default, reversible, games and anti-cheat left alone).

## 1. What Windhawk does for Lens today

Windhawk is a third-party, open-source mod engine. Lens ships one mod for it: `windhawk/lens-window-style.wh.cpp` (v1.1.0). Since #76 it is written into `C:\ProgramData\Windhawk\ModsSource` only when the person clicks **Install in Windhawk**, and it excludes every name on Lens's anti-cheat list (42, kept in sync by a test).

Inside every process it is allowed into, the mod:

1. reads five settings from Lens (caption colour, border colour, text colour, corner mode, dark mode);
2. calls `DwmSetWindowAttribute` on each top-level window: `DWMWA_USE_IMMERSIVE_DARK_MODE` (20), `DWMWA_WINDOW_CORNER_PREFERENCE` (33), `DWMWA_BORDER_COLOR` (34), `DWMWA_CAPTION_COLOR` (35), `DWMWA_TEXT_COLOR` (36);
3. re-applies them when a window is shown (an in-process `SetWinEventHook`).

That is all. It doesn't paint, hook APIs, or change behaviour; it sets five documented DWM attributes from inside the app.

## 2. What Lens already has of its own

| Piece | What it does | Where |
|---|---|---|
| Out-of-process DWM engine | Sets the same five attributes on other apps' windows **from Lens's own process**, on a refresh worker; tracks which windows it styled so an exclude rule can hand them back | `src-tauri/src/win_dwm_engine.rs` |
| Caption engine | Draws Lens's window buttons as overlay windows over other apps' title bars, colour-matched row by row (#80) | `src-tauri/src/win_caption_engine.rs`, `caption_paint.rs` |
| In-process hook (experimental, off) | A Lens-built DLL loaded with a global `WH_CALLWNDPROC` hook that applies the same five attributes from inside each process | `src-tauri/lens-dwm-hook/`, `win_dwm_engine.rs` |
| Anti-cheat list and rules | Process names never touched; per-app rules | `win_rules.rs` (`ANTI_CHEAT_FRAGMENTS`), `win_hook_guard.rs` |
| Windhawk sync | Finds Windhawk, installs/refreshes the mod on opt-in, removes it on Remove all | `win_windhawk.rs`, `changes.rs` |

So Lens already reproduces the mod's job without injection. The in-process routes (Windhawk mod, Lens's hook) exist for the cases where the out-of-process call isn't enough.

## 3. Why an out-of-process call can fall short

These are the known or likely gaps, to be confirmed by the phase 0 spike (§6):

- **Integrity level (UIPI).** An unelevated Lens can't change windows of elevated apps (Task Manager, admin terminals, installers). Windhawk reaches them only when it runs elevated too.
- **Apps that re-assert their own frame.** Some apps set their own DWM attributes or redraw the caption on activate/theme change, overwriting Lens until the next refresh. In-process code can apply right after the app does; out of process, Lens must notice and re-apply.
- **Custom-drawn title bars** (Chrome, Edge, VS Code, Electron, UWP/WinUI). Caption and text colour do nothing where the app draws its own title bar; neither approach changes that without app-specific hacks. Border colour and corners still work.
- **Timing.** A window can flash its default colours between creation and Lens's first pass.
- **Win 10.** Caption, border and text colour and corner preference are Windows 11 (22000+) attributes; on Windows 10 only dark mode applies, whichever process sets it.

## 4. Options

### (a) Out-of-process only (no injection)

Lens styles every window from its own process:

- an **out-of-context WinEvent hook** (`WINEVENT_OUTOFCONTEXT`, no DLL is loaded into anyone) for `EVENT_OBJECT_CREATE` / `SHOW` / `EVENT_SYSTEM_FOREGROUND` / `EVENT_OBJECT_LOCATIONCHANGE`, so new and re-activated windows are styled within a frame or two, and windows that reset their frame are re-applied after activation (the caption engine already uses settle-and-recheck reads; reuse that);
- the five DWM attributes plus `DWMWA_SYSTEMBACKDROP_TYPE` (Mica/Acrylic, Windows 11 22H2+) where the app allows it;
- the caption engine for Lens window buttons; overlays for active-window borders and focus dim (already shipped);
- per-app rules and the anti-cheat list exactly as today; nothing ever enters a game's process.

Reproduces: **all five mod effects** on unelevated apps with system-drawn title bars; borders and corners on custom title bars. Not: elevated windows (unless an optional elevated Lens helper is added, which is a separate, opt-in decision), instant styling at creation (one-frame flash possible).

Effort: small to medium; most code exists in `win_dwm_engine.rs`. Risk: **low**. No injection means no anti-cheat flags, no antivirus "injector" heuristics, no ARM64/x86 DLL matrix, no crash inside other apps.

### (b) Our own signed injection engine

A Lens-built engine like Windhawk's: inject a signed DLL into chosen processes and apply styling from inside.

How Windhawk does it, for reference: it allocates memory in the target and starts a remote thread (or queues an APC for processes that haven't started) to load its engine DLL, hooks process creation to follow child processes, uses MinHook for API hooks, and keeps exclusion lists for critical system processes and many games. It needs administrator rights for elevated targets, special file permissions for UWP apps, and can't load into processes that require signed images.

Reproduces: everything (a) does, plus elevated windows (if the engine runs elevated) and styling from the first frame. Could later reach custom title bars by hooking the app's drawing, which Lens has ruled out (FEATURES › Dropped).

Effort: large (injector, x64/x86/ARM64 builds, child-process following, safe unload, signing, crash isolation, updates). Risk: **high**. Antivirus and EDR tools flag injectors even when they're legitimate; anti-cheat may reject injection even when the target isn't a game Lens knows about; a bug crashes someone else's app; every Windows update can break it. It also contradicts the MASTERPLAN guardrail "no patching other processes, out-of-process first".

### (c) Hybrid

(a) by default for everyone; an **opt-in "deep styling" mode** for the few cases (a) can't cover, implemented by the existing `lens-dwm-hook` (already Lens-built, already anti-cheat-excluded, off by default), rebuilt from source and signed in releases, with a strict per-app allowlist instead of "every process", and fixed to refuse loading into excluded processes (B-05).

Reproduces: everything, with injection only where the person chose it, per app. Effort: medium. Risk: medium, contained to the apps someone opted in.

## 5. Recommendation

**Go with (a) now and keep (c) as the escape hatch; don't build (b).**

1. The Windhawk mod only sets five documented DWM attributes, and Lens already sets the same five from its own process. The gap is timing, apps that reset their frame, and elevated windows; it isn't about capability.
2. An out-of-context WinEvent hook plus re-apply-after-activate closes most of the timing gap with no code inside other apps.
3. Injection is where the risk lives (anti-cheat, antivirus, crashes in other apps, maintenance), and it contradicts Lens's own trust promise. A general injection engine would make Lens look like the thing antivirus tools are built to stop.
4. For the remaining cases, the opt-in, allowlisted `lens-dwm-hook` (c) is enough, and Windhawk can stay as an optional path for people who already use it.
5. Result: Lens needs no third-party install for window styling. Windhawk becomes optional, then unnecessary.

## 6. Phased plan

| Phase | What | Exit criteria |
|---|---|---|
| **0 · Spike** (days) | Run `tools/spikes/dwm-foreign-window.ps1` on Windows 11 23H2 and 24H2, and on Windows 10 22H2: set the five attributes plus Mica on Notepad, Explorer, Settings, Paint, Task Manager (elevated), Chrome, VS Code, Terminal, Calculator from an unelevated process. Record per app: which sets succeed, whether they survive activation, theme change, maximise. | A table per app and attribute in this doc. Confirms or corrects §3. |
| **1 · Out-of-process engine v2** (1–2 weeks) | Out-of-context WinEvent hook; style on create/show; re-apply after activation and on `WM_THEMECHANGED`-equivalent events (settle-and-recheck, like #80); Mica option; one owner of "styled windows"; Remove all restores defaults on every styled window. Parity rig extended (like the caption rig) for the attribute logic. | On the spike's app list, every unelevated app with a system title bar shows Lens colours within 100 ms of appearing and keeps them through activate/maximise/theme switch; zero processes have a Lens DLL loaded (`tasklist /m lens_dwm_hook.dll` is empty). |
| **2 · Beta** | Ship v2 as the default styling path; Windhawk card in Settings becomes "Optional: for elevated apps and early styling"; collect Report-a-problem feedback for apps that resist. | Two weeks of beta with no styling crash reports and a short list of resisting apps with reasons. |
| **3 · Deep styling (c), only if needed** | For resisting apps: allowlist-only `lens-dwm-hook`, rebuilt and signed in CI, refuses to load in excluded processes (B-05), unloads cleanly, per-app toggle with a plain warning. | Zero anti-cheat incidents in beta; each allowlisted app documented. |
| **4 · Default without Windhawk** | Lens no longer suggests Windhawk; the sync stays for people who use it. | README and site say "window styling built in"; FEATURES updated. |

Success criteria overall: no third-party install needed for the documented styling; no injection by default; every styled window restored by Remove all; anti-cheat list honoured everywhere (unit test, as today).

## 7. How others do it (for comparison)

- **Mica For Everyone**: a standalone app that applies backdrop and title-bar settings to other apps' windows through rules; its FAQ lists apps that need flags or don't work (Chromium's custom title bar, Firefox after 115).
- **ExplorerPatcher / StartAllBack**: change the Windows shell itself by loading code into Explorer only, a narrower and different job from styling every app.
- **WindowBlinds**: full skinning by injection; the most complete look and the most compatibility and anti-cheat friction.
- **Windhawk**: general mod engine, global injection with exclusion lists; powerful, and flagged by some antivirus and anti-cheat tools for exactly that reason.

## Sources

- [DwmSetWindowAttribute (Microsoft Learn)](https://learn.microsoft.com/en-us/windows/win32/api/dwmapi/nf-dwmapi-dwmsetwindowattribute) and [DWMWINDOWATTRIBUTE](https://learn.microsoft.com/en-ca/windows/win32/api/dwmapi/ne-dwmapi-dwmwindowattribute)
- [Implementing Global Injection and Hooking in Windows](https://m417z.com/Implementing-Global-Injection-and-Hooking-in-Windows/) (Windhawk's author)
- [Windhawk wiki: Injection targets and critical system processes](https://github.com/ramensoftware/windhawk/wiki/Injection-targets-and-critical-system-processes)
- [Is Windhawk safe? Mods, injection and antivirus alerts (Gridinsoft)](https://blog.gridinsoft.com/windhawk-safety/)
- [Mica For Everyone FAQ](https://github.com/MicaForEveryone/MicaForEveryone/wiki/FAQ)
- [ExplorerPatcher wiki: using it as a shell extension](https://github.com/valinet/ExplorerPatcher/wiki/Using-ExplorerPatcher-as-shell-extension)
