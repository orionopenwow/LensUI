# Themes, looks and backdrops — feature dossier

> Batch 1 of the feature dossiers for the Fable pass. Status words: **works**, **partly**, **broken**, **not built**. Reviewed against `main` on 2026-11-26.
>
> **Fable pass (PR #113, 2026-11-26):** quick wins 1 and 2 done: the Dock is out of the theme distance, the two pairs that only differed by Dock are merged (CRT → Green Phosphor, Claude Light Brand → Claude Light), audit regenerated, B-38 closed, B-39 fixed. Backdrop Lab has a "Lens Cloud" preset. Left: full-pack contrast audit, the Lens Cloud featured look, wallpaper quick wins.

## Rundown

Themes decide how Lens looks: colours, materials, accent, and (only when the person opts in) a look's font and shape. Since #95 a theme never changes the Dock's style, size or position. Around themes sit the creative tools: 12 featured looks plus ~36 more packs, Day & night scheduling, accent from wallpaper, `.lenstheme` import/export, community themes, Living Skies (time/weather-aware skies), Backdrop Lab (GPU gradients, live wallpaper, export), and the Wallpaper Switcher.

- **Who it's for:** everyone picks a look in setup or Appearance; creators use Backdrop Lab and export/share.
- **Front end:** `src/themes/` (`packs.ts`, `featured.ts` — the twelve, `schedule.ts` — Day & night with sun times, `accentFromImage.ts`, `lenstheme.ts`, `customPacks.ts`, `distance.ts`, `living/`, `community/`, `dotmatrix/`, `shapes/`), `src/themeux/ThemeTab.tsx` (Appearance), `src/components/ThemeGallery.tsx`, `src/hooks/useLensState.ts` (apply before paint, one frame, #88), `src/styles/tokens.css` (`data-theme-switch` turns transitions off for two frames), `src/studio/backdrop/**` (Backdrop Lab: engine, presets, exporter, UI), `src/playground/living/**` (Living Skies: sky, astro, weather), `src/wallpapers/**` (Switcher).
- **Native:** `src-tauri/src/commands/theme.rs` (frame/border colours, Windows accent write when opted in), `win_wallpaper.rs` (wallpaper host), `config.rs` (`ThemeConfig.write_windows_accent`, `ThemeScheduleConfig`).
- **Docs:** `docs/THEMES_AUDIT.md` (generated: contrast, near-duplicates), `docs/BACKDROP_LAB.md`, `docs/LIVING_THEMES.md`, `docs/WALLPAPER_SWITCHER.md`, `docs/THEMES_ROADMAP.md`.
- **Tests:** `themes.test.ts` (every pack/look leaves Dock config identical, #95), `featuredThemes.test.ts` (audit freshness, contrast), `shapeStyles.test.ts`, `communityThemes.test.ts`, `living.test.ts`, `backdrop.test.ts`, `wallpapers.test.ts`, `lens-cloud.test.ts`; `tools/robust/theme-switch.mjs` (30-switch rig, full matrix nightly); perf `theme-switch`; E2E `theme-switch`.

## Feature tree

### 1. Looks and packs
| Feature | Sub / minute | Status | Evidence |
|---|---|---|---|
| Featured twelve | Obsidian, Alabaster Daylight, Living Sky, Catppuccin Mocha, Hyprland Neon, Cyberpunk Amber, Paper Minimal, Lens Expressive, Lens Dot Matrix, Everforest, Solarized Matte, Gruvbox Warm | works | `featured.ts` |
| More themes | 75 packs grouped by family under "More themes"; two packs that only differed by Dock are merged into their twin (ids still resolve) | works | `packs.ts` (`MERGED_PACKS`), THEMES_AUDIT "Merged", "By family" |
| Contrast | Text ≥4.5:1, accent ≥3:1 on surface and cards for all twelve | works | THEMES_AUDIT Contrast table |
| Colours only | Never Dock style/size/motion/position; font & shape only with "Also use the look's font and shape" | works | #95, `themes.test.ts` |
| Theme cards | Preview the default floating Dock; no "X dock" badge | works | #95 |
| Switch speed | Click → new theme median 48 ms, no flash, no growth | works | #88 rig 30/30 |

### 2. Accent rules
| Feature | Sub | Status | Evidence |
|---|---|---|---|
| Accent picker | Swatches + colour wheel | works | `ColorWheel.tsx` |
| Accent from wallpaper | Dominant colour (local) — setup pre-pick and Appearance | works | `accentFromImage.ts`, #99 |
| Write to Windows accent | Off by default; checkbox only for custom accents; turning off restores Windows' own; queued writes cancelled on undo | works | `ThemeTab.tsx:467`, `config.rs:47`, #102 |
| Windows accent read | Setup reads it as a fallback | works | #99 |

### 3. Day & night
| Feature | Sub | Status | Evidence |
|---|---|---|---|
| Fixed times or sun times | lat/long; day pack + night pack | works | `schedule.ts:82-139` |
| Dark / Light / Day & night control | Appearance + Quick settings; going back restores exactly | works | `choiceUndo.ts`, hyper |

### 4. Import, export, community
| Feature | Sub | Status | Evidence |
|---|---|---|---|
| `.lenstheme` export/import | Folder colours + window controls; layout keys ignored on import | works | `lenstheme.ts:42-124` |
| Custom packs | Save the current look as a pack | works | `customPacks.ts` |
| Community themes | Claude light/dark | works | `community/claude.ts` |

### 5. Living Skies
| Feature | Sub | Status | Evidence |
|---|---|---|---|
| Sky by time | Sun/moon position, twilight | works | `playground/living/sky.ts`, `astro.ts` |
| Weather tint | Local weather (Open-Meteo) when opted in | partly — needs location consent | `weather.ts` |
| Tint UI from the sky | `themes/living/tint.ts` | works | LIVING_THEMES |

### 6. Backdrop Lab
| Feature | Sub | Status | Evidence |
|---|---|---|---|
| Engine | WebGL2 gradient modes, presets, clock, inspire | works | `studio/backdrop/engine/*` |
| Live wallpaper | Applied through the wallpaper host | works (primary monitor) | BACKDROP_LAB §4 |
| Make a theme | From a backdrop | works | §5 |
| Export & share | PNG/WebM/share card | works | §6, `exporter.ts` |
| Ask for one | Text prompt → preset | works | §6b |
| Per-monitor / span | Engine supports span; host is one window | not built | §8.1 |
| Video-loop fallback without WebGL2 | | not built | §8.3 |

### 7. Wallpaper Switcher
| Feature | Sub | Status | Evidence |
|---|---|---|---|
| Library & picker | Folders, palette chips, fan | works | WALLPAPER_SWITCHER |
| Auto-change | Timer over your files | works | `AutoChangeControls.tsx` |
| Next wallpaper | Tray + Command intent `next_wallpaper` | works | intent ACTIONS |
| Wallpaper of the day | Setting exists, no source | not built | Deferred |
| Per-monitor / span, video thumbnails, folder dialog, sorting | | not built | Deferred |

### 8. Theme studio
| Feature | Sub | Status | Evidence |
|---|---|---|---|
| Studio v2 Theme workspace | Draft, undo/redo, templates | not built (scaffold, flag off) | `src/studio/v2/*` (#103) |

## Quick wins (≤1 day each, ranked)
1. **Done (PR #113).** ~~Regenerate THEMES_AUDIT and prune near-duplicates that now differ only by Dock.~~ Since themes are colour-only, pairs listed as differing in "dock" (Green Phosphor/CRT, Claude Light/Claude Light Brand) are visually identical in practice — merge or hide one of each.
2. **Done (PR #113).** ~~B-39 undo~~: snapshot `folderStyle.theme`, pinned-folder colours and `themeSchedule` before the first theme change in a session; restore on going back.
3. **Folder picker dialog** for the Wallpaper library (Tauri dialog) — currently paste-a-path only.
4. **Palette chip click copies hex** (deferred list) — tiny, delightful.
5. **"Next wallpaper" in the Dock context menu and Top Bar** (deferred list).

## Polish assessment
- **Motion:** theme switch is one frame with no transitions (#88); a single 150 ms whole-window cross-fade (opacity of a snapshot layer) would feel softer without the old flashes — try behind a flag and run the rig.
- **Copy:** Appearance now says "Themes change colours only…" clearly. Looks' descriptions vary in tone (some poetic, some technical).
- **Visual parity:** goldens for theme cards after #95; Backdrop Lab and Wallpaper picker have parity scenes; no golden for the font/shape opt-in state.
- **A11y:** featured contrast is good; ~36 non-featured packs aren't in the contrast table — some light packs may fail 3:1 for the accent on cards.
- **Perf:** `theme-switch` within budget; Living Sky ticks once a minute; Backdrop Lab GPU only while visible.
- **Consistency:** the Lens glow on Lens Browser's new tab and the Lens cloud orb share colours; Backdrop Lab presets don't include a "Lens cloud" preset.

## Bug assessment
| Id | Sev | What | Evidence |
|---|---|---|---|
| B-39 (fixed) | Low | Undo didn't restore folder colours / schedule | `themeChoiceUndo.test.ts` |
| B-38 (closed) | — | Was a stale row; moved to Fixed in BUGS.md, hyper `known.json` rows removed | `docs/brain/BUGS.md` |
| B-19 | Low | ~421 hard-coded hex colours in TSX ignore themes and contrast modes | patterns.md |
| fixed | Low | `lookPack` no longer copies the look's Dock style into the pack | `themes.test.ts` ("a featured look's pack carries no Dock style") |
| suspected | Low | Non-featured light packs may fail accent-on-card 3:1 (not audited) | THEMES_AUDIT covers only the twelve |

## One idea to push to main
**"Lens Cloud" look + Backdrop preset.** A featured look built from the logo's six hues as a very dark matte with the cloud gradient as the backdrop (the same colours as the Lens Browser glow and the orb), so the brand's one colour moment is one click away. Data-only: a pack in `featured.ts`/`packs.ts` + a Backdrop Lab preset.

## Test plan
**Unit:** every pack × "font & shape off" leaves fonts/shapes untouched; every pack × any → back restores the exact config (B-39); schedule `packForNow` across DST and polar latitudes; `dominantAccent` on flat, two-tone and noisy images; `.lenstheme` round-trip and rejection of layout keys.
**Contrast:** extend the audit to every pack (text 4.5:1, accent 3:1) and fail CI on regressions.
**Headless / parity:** golden per featured look × Appearance; theme-switch rig full matrix nightly (exists); Backdrop Lab presets render without WebGL errors; Wallpaper picker with 0/1/500 items.
**Windows E2E:** `theme-switch` (exists); "Also use this accent in Windows" on/off → DWM AccentColor changes and is restored; Remove all restores accent; wallpaper apply/next/resume with a pixel check around the swap.
**Hyper rows:** every `theme.*`, `themeSchedule.*`, `folderStyle.*`, `wallpaper.*` setting.
**Owner's PC checklist:**
1. Click through all twelve looks quickly — no flash, the Dock never changes.
2. Turn on "Also use the look's font and shape", pick Expressive, then off.
3. Pick a custom accent; tick "Also use this accent in Windows"; untick — Windows' accent returns.
4. Day & night with sun times for your location; check at dusk.
5. Backdrop Lab: make a gradient, set it as wallpaper, export a PNG.
6. Wallpaper Switcher: add a folder, auto-change every 5 minutes, Next from the tray.

## Suggested overhaul
**Phase 1 (3 days):** full-pack contrast audit + fixes; merge Dock-only near-duplicates; close B-38/B-39.
**Phase 2 (1 week):** Theme workspace in Studio v2 — edit tokens with live preview on real surfaces, contrast meter, save as pack, export `.lenstheme`, share card.
**Phase 3 (2 weeks):** per-monitor wallpaper/backdrop host (one window per monitor, mixed DPI), span, video-loop fallback; theme packs that carry a wallpaper collection.
**Risks:** per-monitor host touches the desktop window tree — needs the Remove-all and failsafe E2E green and a real-PC pass.

## Fable pass brief
```
FEATURE Themes / looks / backdrops — docs/features/themes.md
STATE   works; colours-only (#95), one-frame switch (#88), accent opt-in to Windows (#102)
DO FIRST
 1 DONE #113  Close stale B-38; fix B-39 (undo restores folderStyle, pinned-folder colours, themeSchedule)
 2 DONE #113  Regenerate THEMES_AUDIT; merge near-duplicates that only differed by Dock (MERGED_PACKS)
 3 Extend contrast audit to every pack; fail CI on regressions
 4 Wallpaper: folder dialog, palette chip copies hex, Next in Dock/Top Bar menus
POLISH
 - optional 150 ms snapshot cross-fade on theme switch (rig must stay 30/30)
 - consistent look descriptions; golden for the font/shape opt-in
IDEA   "Lens Cloud" featured look (LEFT) + Backdrop preset (DONE #113: Backdrop Lab › Lens › Lens Cloud)
TESTS  bun test src; tools/robust/theme-switch.mjs; perf theme-switch; E2E theme-switch, remove-all
OWNER CHECK  6-step list in this file
```
