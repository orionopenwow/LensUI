# Lens UI — Competitive Strategy and 12-Month Plan

_Researched 2026-11-21. Every claim about a competitor is tied to a source in section 7. Where something could not be verified it says so. Lens UI facts come from `docs/ROADMAP.md` and the code in this folder; **nothing in Lens has yet been compiled or run on Windows**, so every Lens "✓" below means "written and wired", not "proven"._

Legend: ✓ has it · ◐ partial / opt-in / unverified · ✗ no · ? could not verify

---

## 1. Feature matrix

### 1a. Whole-desktop suites (the real competition)

| Capability | **Lens UI** (today) | Seelen UI 2.8.x | Cairo Desktop | Start11 v3 (preview) | StartAllBack | Windhawk |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Model | Overlay on Explorer; opt-in shell replacement | Overlay (does not modify system files) | Full shell replacement or overlay | Explorer add-on | Explorer patcher | Injects mods into processes |
| Dock / taskbar replacement | ✓ bottom only | ✓ dock any edge, live previews (2.8.11) | ✓ taskbar | ✓ "Taskbar Islands" | ✓ (Win10-style) | ◐ via styler mods |
| Window previews in dock | ✗ (icon/title list) | ✓ live, paused in performance mode | ? | ? | ✓ (native) | n/a |
| Top bar / status bar | ✓ | ✓ toolbar, plugins | ✓ menu bar | ✗ | ✗ | ✗ |
| Start replacement / launcher | ◐ Launcher grid + dock search (unverified) | ✓ launcher (Rofi-style) | ✓ Programs menu | ✓ (core product) | ✓ | ◐ Start styler |
| Automatic tiling WM | ✗ (on-demand layouts, opt-in snap hotkeys) | ✓ (komorebi fork) | ✗ | ✗ | ✗ | ✗ |
| Workspaces | ✗ (cycles Windows virtual desktops) | ✓ own workspaces (no native vdesk support) | ◐ | ◐ app-group "workspaces" | ✗ | ✗ |
| Multi-monitor bars | ✗ (math exists, one monitor) | ✓ | ✓ (fixes in 0.4.407) | ? | ✓ native | n/a |
| Wallpapers | ✗ | ✓ image/video/CSS | ✗ | ✗ | ✗ | ✗ |
| System tray | ◐ opt-in experimental host / peek | ✓ tray plugin | ✓ | native | native | native |
| Notification center | ◐ Lens history; Windows toasts likely blocked | ✓ notifications plugin | ? | native | native | ◐ styler |
| Quick settings (Wi-Fi/BT/vol/brightness) | ◐ vol/brightness/night light/mixer; Wi-Fi list & BT shallow | ✓ incl. Bluetooth, adapters | ✓ | native | native | ◐ styler |
| Themes | ✓ 18 packs + `.lenstheme` + day/night schedule | ✓ themes marketplace | ◐ | ✓ thousands of Start buttons, shared layouts | ◐ | ✓ community styles |
| Community marketplace | ✗ (local files only) | ✓ themes, widgets, plugins, icon packs, wallpapers | ✗ | ✓ layout sharing | ✗ | ✓ mod repository |
| Plugin / widget SDK | ✗ | ✓ (YAML bundle + CLI) | ✗ | ✗ | ✗ | ✓ (C++ mods) |
| Window titlebar/frame styling | ✓ DWM color/frame/corners + traffic lights on all apps | ? | ✗ | ✗ | ◐ | ✓ via mods |
| Folder icon theming | ✓ (reversible desktop.ini) | ✓ icon packs | ✗ | ✗ | ✗ | ✗ |
| Natural-language / AI actions | ✓ local action router (unique) | ✗ found | ✗ | ✗ | ✗ | ✗ |
| Workflow recorder / macros | ✓ (unique) | ✗ found | ✗ | ◐ app groups | ✗ | ✗ |
| Clipboard history | ◐ opt-in | ? | ✗ | ✗ | ✗ | ✗ |
| Per-app window rules | ◐ opacity/frame/corners | ✓ auto-float/workspace rules | ✗ | ✗ | ✗ | per-mod |
| CLI / scripting | ✗ | ✓ `slu` CLI | ✗ | ✗ | ✗ | ✗ |
| Signed installer | ✗ | ✓ signed exe + msix | ✗ unsigned | ✓ | ✓ | ✓ |
| Store / winget | ✗ | ✓ Store (lags exe) | winget ✓ | Steam/Stardock | ? | ? |
| Price | Free (MIT) | Free, donations | Free | $10 ($8 preview) | Paid (price not verified) | Free |

### 1b. Specialists Lens overlaps with

| Tool | What it owns | Overlap with Lens |
| :--- | :--- | :--- |
| komorebi | Tiling WM; free for personal use, paid individual commercial licence | Tiling (Lens lacks automatic tiling) |
| GlazeWM 3.x | Keyboard-first tiling, now cross-platform (macOS), runtime workspace config | Tiling, workspaces |
| YASB | Python status bar, 60+ widgets, komorebi/GlazeWM widgets, SignPath-signed, winget/Scoop/Choco | Top bar |
| Zebar | Web-tech status bar from the GlazeWM team | Top bar |
| PowerToys 0.97–0.100 | Command Palette with extension gallery; new **Dock** (any edge, per-monitor, perf widgets) | Launcher, dock, quick stats |
| Raycast for Windows 2.x | Launcher, extension store, clipboard history, window layouts, AI chat, MCP server | Launcher, clipboard, AI router |
| Flow Launcher | Free launcher with large plugin catalogue | Launcher |
| Fences 6 | Desktop organization, tabbed fences, icon tinting, folder portals, business deployment | Desktop condenser tab |
| Groupy 2 | Tabbing any app windows | (none yet) |
| Rainmeter | Desktop skins/widgets | Widgets |
| Nilesoft Shell | Context-menu replacement | (none) |
| TranslucentTB | Taskbar transparency | Glass |

---

## 2. Where Lens can win (ranked)

1. **"Unified look across the whole OS," not just the bars.** Lens already restyles every app's titlebar, frame and corners, folder icons and its own chrome from one theme pack. Competitors split this: Seelen styles its own surfaces; Windhawk needs several separate styler mods; Start11 covers Start/taskbar only. Evidence: Windhawk's popular setups combine taskbar, Start, Explorer and notification-center stylers individually.
2. **Local AI desktop control.** Lens' natural-language router and workflow recorder have no equivalent in Seelen, Start11 or Cairo. Raycast added AI chat and an MCP server, and Windows 11 now has native MCP support, so the category is moving here; Lens should expose its actions as an MCP server rather than compete with chat.
3. **Safety as a feature.** Microsoft treats third-party shell customizers as unsupported and tells users to uninstall them before updates; repeated Windows updates have broken ExplorerPatcher/StartAllBack-style tools. Lens' overlay model (no Explorer patching, no injection by default since pass 2) is structurally safer. Market it, and prove it with a clean-exit guarantee.
4. **Integrated launcher + dock + bar + tiling in one install,** like Seelen, but with a stricter performance budget. Seelen's own FAQ admits a WebView2 memory leak in long sessions and that RAM depends on features enabled; users of web-tech shells care about this.
5. **Design-first presets.** Start11 v3 is moving toward a macOS-like "Taskbar Islands" look; Lens' obsidian/traffic-light design language is already there and free.

## 3. Recurring complaints about competitors to design against

| Complaint | Seen in | Lens design response |
| :--- | :--- | :--- |
| Breaks after Windows updates (Start/Explorer crashes, boot issues) | ExplorerPatcher, StartAllBack (2023 Moment 2; KB5028254), Windhawk Start styler | Never patch Explorer; overlay only; auto-detect a broken surface and fall back to native in one step |
| Microsoft won't help when a customizer breaks the shell | Microsoft release-health guidance | Built-in "Restore Windows" button, `Restore-Windows-*.bat`, crash-safe restore (already designed) |
| Memory growth in long sessions (WebView2) | Seelen FAQ / 2.4.6 notes | Suspend hidden WebViews, lazy windows, single shared WebView2 environment, periodic reload of idle surfaces |
| Code injection risks and game conflicts | Windhawk (excludes games, critical processes) | Keep injection off by default; ship game-folder and anti-cheat exclusion lists like Windhawk's |
| SmartScreen / Defender warnings on unsigned installers | Cairo 0.4.407 (unsigned) | Sign every build (Artifact Signing) and ship via Store + winget |
| Store version lags | Seelen FAQ | Same-day Store + winget + exe release pipeline |
| Hard-to-reproduce bugs ("unreplicable" label) | Seelen GitHub | One-click diagnostics bundle (logs, config, monitor layout) |

## 4. 12-month plan

### Q1 2027 — "It runs" (Dec–Feb)
- First successful `tauri build` on Windows 11 24H2/25H2; fix compile errors from passes 1–3.
- Parity harness (the headless render used for the Dock/Top Bar fixes) promoted into CI with screenshot diffs per theme pack.
- Default-config behaviour identical to pre-pass shell; each opt-in feature verified individually.
- Diagnostics bundle + crash log + "Restore Windows" in tray.
- **Exit:** 2 weeks of daily use by the author with zero lost-desktop incidents.

### Q2 2027 — "Daily driver" (Mar–May)
- Multi-monitor bars (patches M0–M9 already applied; add picker), on-demand windows (L-series), WebView2 suspend for hidden surfaces.
- Dock: any edge, live/hover previews via DWM thumbnails, Win+number, badges.
- System modules: battery, Bluetooth, real Wi-Fi list, keyboard layout, account menu.
- Automatic tiling v1 + Lens workspaces (named, per-monitor, with app rules).
- Signed builds (Artifact Signing), winget manifest, auto-updater with rollback.
- **Exit:** public beta 0.5 on GitHub + winget.

### Q3 2027 — "Ecosystem" (Jun–Aug)
- Plugin/widget SDK (sandboxed web widgets with a declared-permission manifest).
- Theme/widget gallery backed by a GitHub repo index (cheap to run, reviewable PRs).
- Lens MCP server: expose action-router actions to external agents with per-action consent.
- Wallpapers (image/video; HTML later, behind performance mode).
- i18n framework + 5 languages; accessibility pass (screen reader names, high contrast, reduced motion).
- **Exit:** 0.8 with ≥20 community themes.

### Q4 2027 — "1.0" (Sep–Nov)
- Microsoft Store listing (removes SmartScreen friction) alongside winget/exe.
- Robustness bar in section 5 met for 30 consecutive days of telemetry-free opt-in crash reports.
- Shell-replacement mode out of "experimental" only after VM test matrix passes.
- Desktop organization (fence-like groups) and window tabbing exploration.
- **Exit:** 1.0 release, docs site, migration guides from Seelen/Start11 layouts.

## 5. Robustness bar for 1.0

| Area | Target | Basis |
| :--- | :--- | :--- |
| Crash-free sessions | ≥ 99.5% (opt-in local crash reports) | Industry norm; no competitor publishes a figure (not verified) |
| Lost-desktop incidents | 0 tolerated; any crash restores Explorer taskbar within 3 s | Design rule from AGENTS.md |
| Idle CPU | < 0.5% averaged over 5 min with no window changes | Lens target; competitors publish no numbers (Seelen notes only a 10 MB saving from a Svelte rewrite) |
| Idle RAM (all WebView2 processes) | < 250 MB default; < 150 MB with lazy windows | Lens target; WebView2 guidance: shared environment, low memory target, suspend hidden views |
| Memory growth | < 10% over 8 h | Seelen's documented long-session leak is the failure to avoid |
| Windows builds | 11 23H2, 24H2, 25H2, 26H2 Insider; Windows 10 22H2 best-effort | Microsoft's 26H2 changes movable taskbar/Start, which overlays must coexist with |
| DPI | 100/125/150/175/200%, mixed-DPI multi-monitor | Cairo shipped high-DPI fixes as recently as 0.4.407 |
| Multi-monitor | hot-plug, primary change, 1–4 monitors, portrait | Seelen 2.8 still fixing multi-monitor auto-hide |
| Games | Zero injection into games; overlays hidden in exclusive/borderless fullscreen; exclusion list covering Steam, Epic, Riot, Ubisoft, EA, Blizzard, GOG folders | Windhawk's default game exclusions |
| Updates | Signed, staged, rollback on failed start | Store/winget/Artifact Signing guidance |

## 6. Risks and mitigations

| Risk | Likelihood | Mitigation |
| :--- | :--- | :--- |
| Windows update changes shell behaviour (26H2 movable taskbar, Start redesign, XAML registration bugs) | High | Overlay-only default; nightly smoke test on Insider VM; native fallback switch |
| Microsoft blames third-party customizers and won't support affected users | High | One-click restore; never patch Explorer; clear uninstall |
| Anti-cheat flags injected code | Medium if injection used | Injection off by default (done); never touch game processes; publish an anti-cheat statement |
| SmartScreen / Smart App Control blocks unsigned builds | High until signed | Artifact Signing (from $9.99/mo); Store listing; consistent signing identity — EV no longer bypasses SmartScreen |
| WebView2 memory leaks / bloat | Medium | Budgets in section 5, suspend hidden webviews, periodic reload |
| Reading Windows toasts needs package identity | High | MSIX/sparse package for the Store build |
| Competitors move fast (PowerToys Dock, Start11 v3, Raycast) | High | Compete on the unified theme + safety + AI integration, not feature count |
| Shell-replacement mode locks users out | Low with guards | Keep experimental until VM matrix passes; boot guard + restore script already built |

## 7. Sources

- Seelen UI v2.8.11 release (latest) — https://seelen.io/uk/apps/seelen-ui/releases/latest
- Seelen UI v2.8.0 release — https://seelen.io/apps/seelen-ui/releases/v2.8.0
- Seelen UI v2.4.6 release (Svelte rewrite, long-session leak) — https://seelen.io/apps/seelen-ui/releases/v2.4.6
- Seelen FAQ — https://seelen.io/blog/seelen-faq
- Seelen resource guidelines — https://seelen.io/docs/resource-guidelines
- Seelen GitHub issue stats — https://issues.ecosyste.ms/hosts/GitHub/repositories/eythaann%2FSeelen-UI
- Seelen UI GitHub — https://github.com/eythaann/Seelen-UI
- Start11 v3 announcement — https://alternativeto.net/news/2026/11/stardock-announces-start11-v3-with-start-menu-widgets-taskbar-grouping-and-layout-sharing/
- TechRadar on KB5028254 / ExplorerPatcher — https://www.techradar.com/computing/windows/windows-11-update-breaks-start-menu-for-some-customization-apps-and-microsoft-isnt-going-to-help-this-time
- Microsoft KB5072911 (XAML-dependent shell failures) — https://support.microsoft.com/en-us/servicing/os/windows/docs/2025/11/kb5072911-explorer-the-start-menu-and-other-xaml-dependent-apps-might-not-start-or-close-unexpectedl
- Windows Latest on January 2026 Explorer crash — https://www.windowslatest.com/2026/01/31/microsoft-says-latest-windows-11-issue-crashes-explorer-exe-makes-taskbar-disappear-but-a-fix-is-rolling-out
- Windows Central on 26H2 Start/taskbar/search — https://www.windowscentral.com/microsoft/windows-11/windows-11-2026-update-26h2-changes-for-start-menu-taskbar-and-search
- Windows Central on Windhawk mods — https://www.windowscentral.com/microsoft/windows-11/7-best-windhawk-mods-to-transform-your-desktop-on-windows-11
- Windhawk injection targets wiki — https://github.com/ramensoftware/windhawk/wiki/Injection-targets-and-critical-system-processes
- Cairo Desktop 0.4.407 — https://www.warp2search.net/story/cairo-desktop-04407-released
- komorebi licensing — https://komorebi.lgug2z.com/about/licensing/
- GlazeWM 3.10.0 — https://newreleases.io/project/github/glzr-io/glazewm/release/v3.10.0
- YASB README — https://raw.githubusercontent.com/amnweb/yasb/main/README.md
- PowerToys 0.98 (Command Palette Dock) — https://devblogs.microsoft.com/commandline/powertoys-0-98-is-here-new-keyboard-manager-ux-the-command-palette-dock-and-better-cursorwrap/
- PowerToys 0.100 — https://devblogs.microsoft.com/commandline/powertoys-0-100-is-here-new-shortcut-guide-command-palette-improvements-and-much-more/
- Raycast Windows changelog — https://raycast.com/changelog/windows
- Fences 6 — https://alternativeto.net/news/2025/5/fences-6-adds-tabbed-desktop-organization-and-enterprise-deployment-tools
- SmartScreen reputation (Microsoft Learn) — https://learn.microsoft.com/windows/apps/package-and-deploy/smartscreen-reputation
- WebView2 performance (Microsoft Learn) — https://learn.microsoft.com/microsoft-edge/webview2/concepts/performance
- Windows Latest on Windows 11 agentic/MCP — https://www.windowslatest.com/2026/01/07/microsoft-is-encouraging-developers-to-build-next-gen-ai-agents-for-windows-11-as-copilot-alone-isnt-enough

**Not verified:** StartAllBack current price and 25H2 status; Zebar's current release; Rainmeter, Nilesoft Shell, TranslucentTB and Groupy 2026 changes (searched, no authoritative current page read); any competitor's published idle CPU/RAM numbers (none found).
