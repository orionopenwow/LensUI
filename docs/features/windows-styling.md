# Window styling — feature dossier

> Batch 1 of the feature dossiers for the Fable pass. Status words: **works**, **partly**, **broken**, **not built**. Reviewed against `main` on 2026-11-26.
>
> **Fable pass, 2026-11-26 (PR #115): status now works, with one item to check on a real PC.** Done: the caption engine uses the shared 42-name list through `caption_rules::skip_reason` (so do the tiler, Alt+drag, the key hook and pointer effects, with two source tests that keep it that way); `excluded_processes`, "leave alone" rules and fullscreen are honoured; `style` and `position` are drawn; a first cut of the per-app page ("Apps and window buttons", with the locked Protected badge) is in Settings › Windows & Keys › Window styling. Left: `position: top-left` needs a look on real hardware (it is only used where the title bar's left end is plain caption, and it covers the icon and the start of the title there); "Don't style this app" in the Dock menu; B-29; splitting `win_tiler.rs`. Rows below are updated in place.

## Rundown

Lens restyles other apps' windows: the coloured caption buttons (close / minimise / maximise) drawn as an overlay, a frame border and corner style through DWM, snap layouts on long hover, and an optional Windhawk mod for deeper in-process styling. The design rule (WINDHAWK_REPLACEMENT.md) is **out-of-process first**: Lens draws on top of windows and calls DWM; it injects nothing, and it never touches anti-cheat games or fullscreen apps (AGENTS.md §3.4).

- **Who it's for:** people who want macOS-like window buttons and consistent borders across every app.
- **Native:** `src-tauri/src/win_caption_engine.rs` (overlay engine: tracks foreground windows, positions the button overlay, exclusions at `:190`, fullscreen check at `:396`, snap-layout hover `:79/:906/:948`), `caption_paint.rs` (button drawing, per-row colours), `win_traffic.rs` (older traffic-light path; reads `excluded_processes`), `commands/theme.rs:69` (frame border colour/style through `DwmSetWindowAttribute`), `win_rules.rs:180` (`ANTI_CHEAT_FRAGMENTS`, 42 names), `win_tiler.rs` (1,974 lines: snap/tiling), `windhawk/lens-window-style.wh.cpp` (mod v1.1.0), `win_dwm_engine.rs` + `win_hook_guard.rs` (opt-in experimental in-process hook, off by default).
- **Config:** `WindowControlsConfig` (`config.rs:223`): `style`, `order`, `position`, `frame_border_enabled`, `frame_style`, `excluded_processes`; catalogue entries in `catalogue.rs:139`.
- **Front end:** window controls in Settings › Appearance and Quick settings (`src/surfaces/QuickSettingsSurface.tsx`), previews in setup.
- **Docs:** `docs/WINDOW_STYLING.md`, `docs/WINDHAWK_REPLACEMENT.md`.
- **Tests:** caption parity rig `tools/parity/caption` (8,806 cases, #80); E2E `caption-overlay` (button probe, no transparent pixels, #99); `win_rules` unit tests; hyper rows for `windowControls.*`.

## Feature tree

### 1. Caption buttons (overlay)
| Feature | Sub / minute | Status | Evidence |
|---|---|---|---|
| Overlay buttons | Close/min/max drawn over the app's caption, follow move/resize | works | #80, #99 |
| Per-row colour | Colour per button, hover glyphs | works | `caption_paint.rs`, parity rig |
| No transparent pixels | Opaque edge, button probe in E2E | works | #99 |
| Order | Close-min-max / min-max-close | works | `order` read by engine |
| Position (top-left) | Buttons 18 px in from the left edge, a plain patch over the native buttons on the right | partly — drawn where the left of the title bar is plain caption; tabbed and custom title bars keep the right. Not seen on a real PC yet | `caption_paint::left_side_is_free`, `render_cover`; PR #115 |
| Style variants | classic, soft, small dots, pills, the in-app colours | works | `caption_paint::render_with`; parity rig runs every style on both sides; PR #115 |
| Snap layouts | Long hover on green → Windows snap flyout | works | `win_caption_engine.rs:79/906/948` |
| Exclusions | Per-app list, "leave alone" rules | works | `caption_rules::skip_reason`; Apps and window buttons card; PR #115 |
| Anti-cheat / fullscreen skip | Never draw over protected games or fullscreen | works — shared list, full path match; fullscreen = covers the monitor and not maximised | `caption_rules.rs`, `tests/win_rules.rs` source tests; PR #115 |

### 2. Frame (DWM)
| Feature | Sub | Status | Evidence |
|---|---|---|---|
| Border colour | Follows accent / theme | works | `theme.rs:69` |
| Frame style | Rounded / small round / square | works (Win 11 only) | `DWMWA_WINDOW_CORNER_PREFERENCE` |
| Border on/off | `frame_border_enabled` | works | |
| Restore on quit / Remove all | Reset DWM attributes | works | change registry, #76 |

### 3. Snap and tiling
| Feature | Sub | Status | Evidence |
|---|---|---|---|
| Snap layouts flyout | From green button | works | #99 |
| Tiler | Zones, keyboard moves | works; large single file (1,974 lines) | `win_tiler.rs` |

### 4. Windhawk mod
| Feature | Sub | Status | Evidence |
|---|---|---|---|
| Mod v1.1.0 | In-process styling for people who already use Windhawk | works | `windhawk/lens-window-style.wh.cpp` |
| Experimental DWM hook | Off by default; `win_hook_guard` keeps it out while anti-cheat or fullscreen is present | works (B-05/B-06 fixed, wave 1); B-29 open | BUGS.md |
| Excludes synced | Uses the same exclusion list | works | #76 |
| Install | Only on click, never automatic | works | #76 |

## Quick wins (≤1 day each, ranked)
1. ~~Use `win_rules::ANTI_CHEAT_FRAGMENTS` in the caption engine and honour `excluded_processes`.~~ Done (PR #115).
2. ~~Hide or wire `position` and `style`.~~ Wired (PR #115); `position` has the limit described above.
3. **"Don't style this app" from the Dock's context menu**, writing `excluded_processes`. Open; the switch now exists in Apps and window buttons, so this is a shortcut to it.
4. ~~Unit test: every name in `ANTI_CHEAT_FRAGMENTS` is skipped by the engine.~~ Done: `caption_rules::tests::every_shared_anti_cheat_name_is_skipped` (PR #115).
5. ~~Note that corner style needs Windows 11.~~ Already there (Appearance shows it on Windows 10).

## Polish assessment
- **Visual:** buttons match per-row colours and pass 8,806 parity cases; hover glyph fade could use the shared motion token.
- **Behaviour:** overlay follows windows well; watch for a one-frame lag on fast drags (no rig for it yet).
- **Copy:** "Window controls" section mixes "traffic lights" and "window buttons" — pick "window buttons".
- **Docs:** WINDOW_STYLING.md doesn't say which settings are inert.
- **Code health:** `win_tiler.rs` at 1,974 lines; two button paths (`win_traffic.rs` and the engine) with drifting rules.

## Bug assessment
| Id | Sev | What | Evidence |
|---|---|---|---|
| B-43 | — | Fixed (PR #115): the caption engine's private anti-cheat list missed 38 of the 42 names; the tiler, key hook and pointer effects had their own short lists and Alt+drag could move a protected game that wasn't in front | `docs/brain/BUGS.md` |
| B-44 | — | Fixed (PR #115): `excluded_processes`, `style` and `position` were ignored by the engine | `docs/brain/BUGS.md` |
| open | Low | `position: top-left` not yet seen on a real PC (stacking of the two overlay windows, classic title bars) | `win_caption_engine.rs` |
| B-29 | Low | Prebuilt hook DLL (`lens-dwm-hook/`) callbacks have no panic guard; app-crate callbacks are guarded | `docs/brain/BUGS.md:53` |
| B-05 / B-06 | — | Fixed in wave 1 (hook guard; DLL by content hash; Remove all stops the hook) — keep the E2E | `docs/brain/BUGS.md:25-26` |

## One idea to push to main
**Per-app window rules page.** One list: every app Lens has seen, with toggles for buttons, border and snap, plus a locked "Protected (anti-cheat)" badge from `win_rules`. It gives exclusions a home and makes the safety rule visible.

## Test plan
**Unit:** engine `is_excluded` returns true for every `ANTI_CHEAT_FRAGMENTS` entry and for `excluded_processes`; fullscreen detection on borderless-fullscreen and exclusive; `order` permutations; `position` once wired.
**Parity:** caption rig (exists) + new cases for left position and each `style`.
**Windows E2E:** `caption-overlay` (exists); new: excluded app gets no overlay; a dummy process named like an anti-cheat binary gets no overlay; fullscreen window gets none; Remove all restores DWM attributes; Windhawk install only after click.
**Hyper rows:** every `windowControls.*` key, each asserting a visible change or flagged inert.
**Owner's PC checklist:**
1. Open Explorer, Notepad, Chrome — buttons appear and follow drags.
2. Long-hover green — snap layouts appear.
3. Add Notepad to exclusions — its buttons disappear.
4. Launch a game you play with anti-cheat — no Lens buttons, no stutter.
5. Change corner style; Quit Lens — corners and borders go back to Windows'.

## Suggested overhaul
**Phase 1 (2 days):** one exclusion function shared by engine and `win_traffic.rs`; wire or hide `position`/`style`; tests above.
**Phase 2 (1 week):** rebuild the hook DLL with panic guards (B-29); retire `win_traffic.rs` into the engine; per-app rules page; split `win_tiler.rs` into zones / input / layout modules.
**Phase 3 (2 weeks):** left-side buttons and style variants with parity goldens; tiling presets; drag-lag rig.
**Risks:** anything that touches foreground hooks must keep the §3.4 rules and the failsafe E2E green.

## Fable pass brief
```
FEATURE Window styling — docs/features/windows-styling.md
STATE   overlay buttons + DWM frame work (#80, #99); Windhawk mod opt-in (#76)
DO FIRST (safety)
 1 win_caption_engine.rs:190 → use win_rules::ANTI_CHEAT_FRAGMENTS; add unit test over all 42
 2 engine honours windowControls.excluded_processes
 3 wire or hide windowControls.position and .style (catalogue.rs:139)
POLISH
 - "window buttons" wording; note corner style is Windows 11 only
 - shared motion token for hover glyphs
IDEA   per-app window rules page with locked "Protected" badge
TESTS  cargo test; tools/parity/caption; E2E caption-overlay + new exclusion/anti-cheat cases
OWNER CHECK  5-step list in this file
```
