# Ideas backlog (ranked)

One ranked table written by the daily research lookout (`docs/research/daily/`). Rules:

- **Score** = demand (1–5) + fit with Lens (1–5) + inverse effort (S=3, M=2, L=1), plus **+1 each time the idea recurs** in a later daily note. Ties are broken by lower risk.
- **Status:** Have / Partial / In-flight / Missing / **Done** (the repo has it; kept for one week, then archived).
- Deduplicate before adding: if an idea matches an existing row, bump its score and add the date to **Seen**.
- Keep under 150 rows; low-scoring rows older than 30 days move to [`IDEAS_ARCHIVE.md`](./IDEAS_ARCHIVE.md).
- Sources for each row are in the daily note named by its first **Seen** date.

Last updated: 2026-11-27 (Snip day: six new Snip rows; lockfile, WebView2 canary, Explorer card, Windhawk card and Snip recording rows recurred; Arc/Zen import now in flight in PR #126; nothing done or archived).

| # | Idea | Area | Score | Status | Effort | Risk | Seen | Main files |
|---|---|---|---|---|---|---|---|---|
| 1 | Refresh `Cargo.lock`, build with `--locked`, add `cargo audit` to CI (lock is stale: records reqwest 0.13.5, no rustls) | Under the hood | 16 | Missing | S | low | 2026-11-23, 2026-11-24, 2026-11-26, 2026-11-27 | `src-tauri/Cargo.lock`, `.github/workflows/build.yml` |
| 2 | Dock hover "Titles list" mode; show more than four windows | Dock | 13 | Partial | S | low | 2026-11-23, 2026-11-26 | `src/components/DockPreviewStrip.tsx`, `src-tauri/src/win_previews.rs` |
| 3 | Weekly WebView2 Beta canary run of the visual and e2e suites | Under the hood | 13 | Missing | S | low | 2026-11-23, 2026-11-24, 2026-11-26, 2026-11-27 | `.github/workflows/` |
| 4 | "Arc closes 22 Dec" banner in Import; add Zen and Dia import sources (Dia profile path unverified) | Browser | 12 | Partial (Zen/Arc import in flight in PR #126; banner still missing) | S | low | 2026-11-24, 2026-11-26 | `src/browser/ImportPanel.tsx`, `src-tauri/src/browser/import/mod.rs`, `README.md` |
| 5 | Scroll on a dock icon to change that app's volume (wheel already cycles windows, so put it behind a modifier) | Dock | 11 | Partial | S | low | 2026-11-23 | `src/surfaces/DockSurface.tsx`, `src-tauri/src/win_quick_settings.rs` |
| 6 | Agent progress ring and pending-approval count on the dock's Ask icon | AI & Command | 11 | Partial | S | low | 2026-11-23 | `src/presence/model.ts`, `src/surfaces/DockSurface.tsx` |
| 7 | Explorer card: explain Windows 11 "Customize menu" (KB5127936) and where Lens entries live | Desktop | 11 | Partial | S | low | 2026-11-26, 2026-11-27 | Explorer card in Settings, `docs/RIGHTCLICK.md` |
| 8 | Snip reliability pass: mixed-DPI and negative-origin monitors E2E, overlay frame-time/VRAM budget | Snip | 11 | Partial | S–M | low | 2026-11-27 | `src-tauri/src/snip/geom.rs`, `tests/e2e/`, `docs/PERF_REPORT.md` |
| 9 | MCP tools/resources for Shelf, clipboard history and dock pins (gated, read-first) | AI & Command | 11 | Partial | M | med | 2026-11-23 | `src-tauri/src/win_mcp.rs`, `src-tauri/src/shelf/*`, `src-tauri/src/control/grants.rs` |
| 10 | Inactive-window border colour (and shadow strength) separate from the active one | Windows | 10 | Partial | S | low | 2026-11-24 | `src-tauri/src/win_dwm_engine.rs`, `src-tauri/src/win_focus_dim.rs`, `src-tauri/src/win_rules.rs` |
| 11 | "Recently closed" apps in the dock's Recent tab | Dock | 10 | Missing | S | low | 2026-11-23 | `src/surfaces/DockSurface.tsx`, `src-tauri/src/win_events.rs` |
| 12 | Copy/export selected tabs as Markdown; tab hover previews in the sidebar | Browser | 10 | Partial | S–M | low | 2026-11-26 | `src/browser/Sidebar.tsx`, `src/browser/BrowserSurface.tsx`, `src/browser/api.ts` |
| 13 | Windhawk card: say Lens's mod is symbol-free; hint to turn other mods off and on after a Windows build change | Themes | 10 | Partial | S | low | 2026-11-24, 2026-11-27 | `src-tauri/src/win_windhawk.rs` |
| 14 | A different wallpaper (and pause state) on each monitor | Themes | 10 | Partial | M | med | 2026-11-24 | `src-tauri/src/win_wallpaper.rs`, `src-tauri/src/wallpapers/mod.rs`, `src/wallpapers/*` |
| 15 | Dock app groups that launch into a workspace (Islands + workspaces) | Dock | 10 | Partial | M–L | med | 2026-11-23 | `src/dock/islands/*`, `src-tauri/src/win_workspaces.rs` |
| 16 | "Watch this page" in Lens Browser: local change checks + Lens notification, no cookies, ≤15 watches | Browser | 10 | Missing | M | med | 2026-11-26 | new `src-tauri/src/browser/watch.rs`, `src-tauri/src/feeds/ratelimit.rs`, `src/context/actions.catalog.json` |
| 17 | Read-only MCP tools for Lens Browser tabs (`list_tabs`, `read_tab` marked untrusted) with a per-site block list | AI & Command | 10 | Missing | M | med | 2026-11-26 | `src-tauri/src/win_mcp.rs`, `src-tauri/src/control/grants.rs`, `src-tauri/src/browser/store.rs` |
| 18 | Grain slider for every theme (reuse `--lens-grain`) | Themes | 9 | Partial | S | low | 2026-11-24 | `src/style/dither.ts`, `src/themes/lenstheme.ts` |
| 19 | Live text "Join lines" and "Copy as table" (TSV/Markdown from OCR word boxes) | Snip | 9 | Partial | S–M | low | 2026-11-27 | `src/snip/liveText.ts`, `src/snip/Studio.tsx`, `src/snip/actions.ts` |
| 20 | Snip editor: saved custom colours; step numbers that start at N or carry on from the last snip | Snip | 9 | Partial | S | low | 2026-11-27 | `src/snip/annotations.ts`, `src/snip/Studio.tsx`, `src-tauri/src/snip/config.rs` |
| 21 | Make scrolling capture discoverable (Snip tip, Guide, README) — Lens already stitches | Snip | 9 | Have | S | low | 2026-11-27 | `src/snip/Tip.tsx`, `docs/GUIDE.md`, `README.md` |
| 22 | Refraction ("liquid") glass material for Dock and Top Bar, with GPU cost tiers | Themes | 9 | Missing | M | med | 2026-11-24 | `src/style/`, `src/surfaces/DockSurface.css`, `src/surfaces/TopBarSurface.css`, `src/themes/featured.ts` |
| 23 | HDR-safe Snip capture: detect advanced colour and warn, then tone-map via Windows.Graphics.Capture | Snip | 9 | Missing | M | med | 2026-11-27 | `src-tauri/src/snip/win.rs`, `src-tauri/src/snip/image.rs`, `src-tauri/src/snip/record.rs` |
| 24 | `.lenstheme` "setups": dock groups, Islands and workspace layouts in one shareable file | Themes | 8 | Partial | M | med | 2026-11-23 | `src/themes/*`, `src-tauri/src/win_themes.rs` |
| 25 | Snip recording via Windows.Graphics.Capture + Media Foundation (no FFmpeg) | Snip | 8 | Partial | L | med | 2026-11-23, 2026-11-27 | `src-tauri/src/snip/record.rs` |
| 26 | Say a caption while snipping (hold Space, whisper.cpp), pasted/shelved with the image | Snip | 8 | Missing | M | med | 2026-11-27 | `src/snip/Select.tsx`, `src/snip/keys.ts`, `src-tauri/src/voice/hold.rs`, `src-tauri/src/shelf/*` |
| 27 | Offer `claude-haiku-5-5` as a cheap model choice in AI settings | AI & Command | 7 | Missing | S | low | 2026-11-23 | `src/ai/contract.ts`, `src/settings/pages/AiCommandPage.tsx` |
| 28 | Detect Windows' native video wallpaper if it ships, and hand over cleanly | Themes | 6 | Missing | L | med | 2026-11-24 | `src-tauri/src/win_wallpaper.rs` |
| 29 | Register Lens as a Windows taskbar agent if the Agent API ships publicly | AI & Command | 6 | Missing | L | high | 2026-11-23 | `src-tauri/src/win_mcp.rs` |
