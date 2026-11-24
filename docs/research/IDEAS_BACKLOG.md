# Ideas backlog (ranked)

One ranked table written by the daily research lookout (`docs/research/daily/`). Rules:

- **Score** = demand (1–5) + fit with Lens (1–5) + inverse effort (S=3, M=2, L=1), plus **+1 each time the idea recurs** in a later daily note. Ties are broken by lower risk.
- **Status:** Have / Partial / In-flight / Missing / **Done** (the repo has it; kept for one week, then archived).
- Deduplicate before adding: if an idea matches an existing row, bump its score and add the date to **Seen**.
- Keep under 150 rows; low-scoring rows older than 30 days move to [`IDEAS_ARCHIVE.md`](./IDEAS_ARCHIVE.md).
- Sources for each row are in the daily note named by its first **Seen** date.

Last updated: 2026-11-24 (the lockfile and WebView2-canary rows recurred; seven new rows from that day's note; no rows done or archived).

| # | Idea | Area | Score | Status | Effort | Risk | Seen | Main files |
|---|---|---|---|---|---|---|---|---|
| 1 | Refresh `Cargo.lock`, build with `--locked`, add `cargo audit` to CI | Under the hood | 14 | Missing | S | low | 2026-11-23, 2026-11-24 | `src-tauri/Cargo.lock`, `.github/workflows/build.yml` |
| 2 | Dock hover "Titles list" mode; show more than four windows | Dock | 12 | Partial | S | low | 2026-11-23 | `src/components/DockPreviewStrip.tsx`, `src-tauri/src/win_previews.rs` |
| 3 | "Moving from Arc": Import-panel banner and docs before Arc closes on 22 Dec; Dia import if it has a Windows profile | Browser | 11 | Partial | S | low | 2026-11-24 | `src/browser/ImportPanel.tsx`, `src-tauri/src/browser/import/*`, `README.md` |
| 4 | Scroll on a dock icon to change that app's volume (wheel already cycles windows, so put it behind a modifier) | Dock | 11 | Partial | S | low | 2026-11-23 | `src/surfaces/DockSurface.tsx`, `src-tauri/src/win_quick_settings.rs` |
| 5 | Agent progress ring and pending-approval count on the dock's Ask icon | AI & Command | 11 | Partial | S | low | 2026-11-23 | `src/presence/model.ts`, `src/surfaces/DockSurface.tsx` |
| 6 | MCP tools/resources for Shelf, clipboard history and dock pins (gated, read-first) | AI & Command | 11 | Partial | M | med | 2026-11-23 | `src-tauri/src/win_mcp.rs`, `src-tauri/src/shelf/*`, `src-tauri/src/control/grants.rs` |
| 7 | Weekly WebView2 Beta canary run of the visual and e2e suites | Under the hood | 11 | Missing | S | low | 2026-11-23, 2026-11-24 | `.github/workflows/` |
| 8 | Inactive-window border colour (and shadow strength) separate from the active one | Windows | 10 | Partial | S | low | 2026-11-24 | `src-tauri/src/win_dwm_engine.rs`, `src-tauri/src/win_focus_dim.rs`, `src-tauri/src/win_rules.rs` |
| 9 | A different wallpaper (and pause state) on each monitor | Themes | 10 | Partial | M | med | 2026-11-24 | `src-tauri/src/win_wallpaper.rs`, `src-tauri/src/wallpapers/mod.rs`, `src/wallpapers/*` |
| 10 | "Recently closed" apps in the dock's Recent tab | Dock | 10 | Missing | S | low | 2026-11-23 | `src/surfaces/DockSurface.tsx`, `src-tauri/src/win_events.rs` |
| 11 | Dock app groups that launch into a workspace (Islands + workspaces) | Dock | 10 | Partial | M–L | med | 2026-11-23 | `src/dock/islands/*`, `src-tauri/src/win_workspaces.rs` |
| 12 | Grain slider for every theme (reuse `--lens-grain`) | Themes | 9 | Partial | S | low | 2026-11-24 | `src/style/dither.ts`, `src/themes/lenstheme.ts` |
| 13 | Windhawk card: say Lens's mod is symbol-free; hint to turn other mods off and on after a Windows build change | Themes | 9 | Partial | S | low | 2026-11-24 | `src-tauri/src/win_windhawk.rs` |
| 14 | Refraction ("liquid") glass material for Dock and Top Bar, with GPU cost tiers | Themes | 9 | Missing | M | med | 2026-11-24 | `src/style/`, `src/surfaces/DockSurface.css`, `src/surfaces/TopBarSurface.css`, `src/themes/featured.ts` |
| 15 | `.lenstheme` "setups": dock groups, Islands and workspace layouts in one shareable file | Themes | 8 | Partial | M | med | 2026-11-23 | `src/themes/*`, `src-tauri/src/win_themes.rs` |
| 16 | Snip recording via Windows.Graphics.Capture + Media Foundation (no FFmpeg) | Snip | 7 | Partial | L | med | 2026-11-23 | `src-tauri/src/snip/record.rs` |
| 17 | Offer `claude-haiku-5-5` as a cheap model choice in AI settings | AI & Command | 7 | Missing | S | low | 2026-11-23 | `src/ai/contract.ts`, `src/settings/pages/AiCommandPage.tsx` |
| 18 | Detect Windows' native video wallpaper if it ships, and hand over cleanly | Themes | 6 | Missing | L | med | 2026-11-24 | `src-tauri/src/win_wallpaper.rs` |
| 19 | Register Lens as a Windows taskbar agent if the Agent API ships publicly | AI & Command | 6 | Missing | L | high | 2026-11-23 | `src-tauri/src/win_mcp.rs` |
