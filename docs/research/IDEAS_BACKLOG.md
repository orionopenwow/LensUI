# Ideas backlog (ranked)

One ranked table written by the daily research lookout (`docs/research/daily/`). Rules:

- **Score** = demand (1–5) + fit with Lens (1–5) + inverse effort (S=3, M=2, L=1), plus **+1 each time the idea recurs** in a later daily note. Ties are broken by lower risk.
- **Status:** Have / Partial / In-flight / Missing / **Done** (the repo has it; kept for one week, then archived).
- Deduplicate before adding: if an idea matches an existing row, bump its score and add the date to **Seen**.
- Keep under 150 rows; low-scoring rows older than 30 days move to [`IDEAS_ARCHIVE.md`](./IDEAS_ARCHIVE.md).
- Sources for each row are in the daily note named by its first **Seen** date.

Last updated: 2026-11-26 (lockfile, dock titles list, Arc and WebView2-canary rows recurred; four new rows from that day's note; no rows done or archived).

| # | Idea | Area | Score | Status | Effort | Risk | Seen | Main files |
|---|---|---|---|---|---|---|---|---|
| 1 | Refresh `Cargo.lock`, build with `--locked`, add `cargo audit` to CI | Under the hood | 15 | Missing | S | low | 2026-11-23, 2026-11-24, 2026-11-26 | `src-tauri/Cargo.lock`, `.github/workflows/build.yml` |
| 2 | Dock hover "Titles list" mode; show more than four windows | Dock | 13 | Partial | S | low | 2026-11-23, 2026-11-26 | `src/components/DockPreviewStrip.tsx`, `src-tauri/src/win_previews.rs` |
| 3 | "Arc closes 22 Dec" banner in Import; add Zen and Dia import sources (Dia profile path unverified) | Browser | 12 | Partial | S | low | 2026-11-24, 2026-11-26 | `src/browser/ImportPanel.tsx`, `src-tauri/src/browser/import/mod.rs`, `README.md` |
| 4 | Weekly WebView2 Beta canary run of the visual and e2e suites | Under the hood | 12 | Missing | S | low | 2026-11-23, 2026-11-24, 2026-11-26 | `.github/workflows/` |
| 5 | Scroll on a dock icon to change that app's volume (wheel already cycles windows, so put it behind a modifier) | Dock | 11 | Partial | S | low | 2026-11-23 | `src/surfaces/DockSurface.tsx`, `src-tauri/src/win_quick_settings.rs` |
| 6 | Agent progress ring and pending-approval count on the dock's Ask icon | AI & Command | 11 | Partial | S | low | 2026-11-23 | `src/presence/model.ts`, `src/surfaces/DockSurface.tsx` |
| 7 | MCP tools/resources for Shelf, clipboard history and dock pins (gated, read-first) | AI & Command | 11 | Partial | M | med | 2026-11-23 | `src-tauri/src/win_mcp.rs`, `src-tauri/src/shelf/*`, `src-tauri/src/control/grants.rs` |
| 8 | Inactive-window border colour (and shadow strength) separate from the active one | Windows | 10 | Partial | S | low | 2026-11-24 | `src-tauri/src/win_dwm_engine.rs`, `src-tauri/src/win_focus_dim.rs`, `src-tauri/src/win_rules.rs` |
| 9 | "Recently closed" apps in the dock's Recent tab | Dock | 10 | Missing | S | low | 2026-11-23 | `src/surfaces/DockSurface.tsx`, `src-tauri/src/win_events.rs` |
| 10 | Explorer card: explain Windows 11 "Customize menu" (KB5127936) and where Lens entries live | Desktop | 10 | Partial | S | low | 2026-11-26 | Explorer card in Settings, `docs/RIGHTCLICK.md` |
| 11 | Copy/export selected tabs as Markdown; tab hover previews in the sidebar | Browser | 10 | Partial | S–M | low | 2026-11-26 | `src/browser/Sidebar.tsx`, `src/browser/BrowserSurface.tsx`, `src/browser/api.ts` |
| 12 | A different wallpaper (and pause state) on each monitor | Themes | 10 | Partial | M | med | 2026-11-24 | `src-tauri/src/win_wallpaper.rs`, `src-tauri/src/wallpapers/mod.rs`, `src/wallpapers/*` |
| 13 | Dock app groups that launch into a workspace (Islands + workspaces) | Dock | 10 | Partial | M–L | med | 2026-11-23 | `src/dock/islands/*`, `src-tauri/src/win_workspaces.rs` |
| 14 | "Watch this page" in Lens Browser: local change checks + Lens notification, no cookies, ≤15 watches | Browser | 10 | Missing | M | med | 2026-11-26 | new `src-tauri/src/browser/watch.rs`, `src-tauri/src/feeds/ratelimit.rs`, `src/context/actions.catalog.json` |
| 15 | Read-only MCP tools for Lens Browser tabs (`list_tabs`, `read_tab` marked untrusted) with a per-site block list | AI & Command | 10 | Missing | M | med | 2026-11-26 | `src-tauri/src/win_mcp.rs`, `src-tauri/src/control/grants.rs`, `src-tauri/src/browser/store.rs` |
| 16 | Grain slider for every theme (reuse `--lens-grain`) | Themes | 9 | Partial | S | low | 2026-11-24 | `src/style/dither.ts`, `src/themes/lenstheme.ts` |
| 17 | Windhawk card: say Lens's mod is symbol-free; hint to turn other mods off and on after a Windows build change | Themes | 9 | Partial | S | low | 2026-11-24 | `src-tauri/src/win_windhawk.rs` |
| 18 | Refraction ("liquid") glass material for Dock and Top Bar, with GPU cost tiers | Themes | 9 | Missing | M | med | 2026-11-24 | `src/style/`, `src/surfaces/DockSurface.css`, `src/surfaces/TopBarSurface.css`, `src/themes/featured.ts` |
| 19 | `.lenstheme` "setups": dock groups, Islands and workspace layouts in one shareable file | Themes | 8 | Partial | M | med | 2026-11-23 | `src/themes/*`, `src-tauri/src/win_themes.rs` |
| 20 | Offer `claude-haiku-5-5` as a cheap model choice in AI settings | AI & Command | 7 | Missing | S | low | 2026-11-23 | `src/ai/contract.ts`, `src/settings/pages/AiCommandPage.tsx` |
| 21 | Snip recording via Windows.Graphics.Capture + Media Foundation (no FFmpeg) | Snip | 7 | Partial | L | med | 2026-11-23 | `src-tauri/src/snip/record.rs` |
| 22 | Detect Windows' native video wallpaper if it ships, and hand over cleanly | Themes | 6 | Missing | L | med | 2026-11-24 | `src-tauri/src/win_wallpaper.rs` |
| 23 | Register Lens as a Windows taskbar agent if the Agent API ships publicly | AI & Command | 6 | Missing | L | high | 2026-11-23 | `src-tauri/src/win_mcp.rs` |
