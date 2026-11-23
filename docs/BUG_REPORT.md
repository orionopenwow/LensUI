# Bug report — integration/waves-7-8

Sources: code review of the high-risk areas, the robustness suites' findings (docs/TESTING.md F1–F4), parity renders, and CI. `cargo clippy -W clippy::pedantic`, `cargo audit` and `bun audit` could not run here (no crates registry or network in this sandbox); CI runs clippy with `-D warnings` on Windows.

| Sev | Area | Where | Problem | Reasoning / repro | Status |
|---|---|---|---|---|---|
| Critical | Dock | `src/surfaces/DockSurface.tsx` (voice hook) | Dock crashed on every render (React #310) after the voice mount: a hook ran after an early return | Parity: "Minified React error #310" on the dock in all packs | **Fixed** |
| High | Startup | `src/hooks/useLensState.ts` | A failed `get_windows_theme` at startup left every surface blank (F1) | Chaos suite, 5 % IPC failure | **Fixed**: config and theme load independently, config retried |
| High | Uninstall | `src-tauri/src/win_uninstall.rs` | "Remove all Lens changes" left the browser native-messaging host, the `lens://` URL handler and the Explorer right-click verbs in HKCU | Cross-check of every OS-changing feature against the restore list | **Fixed**: three uninstall steps added |
| High | Uninstall | same | Print Screen takeover (Snip) was restored on exit but not by Remove-all | same | **Fixed**: `snip::restore_print_screen()` step |
| High | a11y | Dock buttons | No accessible names (F3, axe critical) | axe on the dock | **Fixed** |
| High | Settings | `MusicCard.tsx` | Null config from the backend crashed the Music page | Parity render | **Fixed** |
| Med | Perf | `app/integration.rs` idle monitor | Read the wallpaper settings file from disk every second | Code review | **Fixed** (10 s cache) |
| Med | Perf | `dock/voice/VoiceDock.tsx` | 10 Hz timer ran forever in the Dock | Code review | **Fixed** |
| Med | Tests | `src/__tests__/guide.test.ts` | Partial Tauri mock leaked into later files in CI order | CI "Export named 'convertFileSrc' not found" | **Fixed** |
| Med | Config | `dockStyleIconSize` / backend window sizing | `dock.iconSize` never clamped (F2): a hand-edited 5000 sizes the Dock window off-screen | Property test | Open: clamp 16–96 in `migrate_config_value` and the TS normaliser |
| Med | a11y | Control Center toggles | Switches and icon-only chips unnamed (F4) | axe | Open: `aria-labelledby` on the shared toggle |
| Med | Agent safety | browser, control, snip, bridge, AI tool runner | `agentsafe_check` / `agentsafe_scan` are built and tested but not yet called from those packages | docs/AGENT_SAFETY.md › Integration | Open: the snippets reference fields that need adapting per package; do with a Windows compile |
| Med | Approvals | browser, magic, snip, voice | Each still uses its local approval card instead of `src/approval` | docs/CLAUDE_CONTROL.md §4 | Open |
| Low | Voice | `useVoiceHud` | Mounting it in more than one surface would double earcons | Code review | Avoided: the mic indicator was not added to the Top Bar |
| Low | Music | Spicetify export | Theme folder copied into `%APPDATA%\spicetify\Themes\Lens` (only when ticked) is not removed by Remove-all | Code review | Open |
| Low | Dock | magic right-click on Dock items | `magicOpen` hook for Dock/Shelf/notifications not wired | docs/MAGIC.md | Open |

## Reviewed and fine

- **FFI callbacks:** no `unwrap`, `expect` or `panic!` inside any `extern "system"` hook or window procedure (scanned all of `src-tauri/src`).
- **Hooks off by default:** cursor FX installs its hooks only when an effect is on; Alt+drag, magic, desktop input, voice push-to-talk and Win-key hooks install only when their feature is on. Panic and exit paths go through `app::integration::shutdown` / `panic_shutdown`.
- **Bridge:** `lens://settings` targets are sanitised to `[A-Za-z0-9-#_]`, at most 64 chars; the action is validated in `protocol.rs` and mirrored in the extension (test enforced).
- **Secrets:** API keys, Spotify and Last.fm tokens and clipboard history are DPAPI-sealed; the tester export redacts them (tests).
