# Modular Lens: editions and standalone repos (deep plan)

Lens stays one main repository and one full product. Its pieces also become **editions**: standalone apps people can install on their own (Lens Dock first), each with its own repo, release and site page. Every edition includes the pieces next to it that it needs to work fully. Nothing breaks along the way: the full Lens must behave the same after every step.

| | |
|---|---|
| Owner | Campton (decisions); agents keep it current |
| Started | 26 November 2026 |
| Status | Plan. Nothing moved yet |
| Related | [COMBINATOR.md](COMBINATOR.md) (Lens pieces become open-source building blocks too), [ARCHITECTURE.md](ARCHITECTURE.md), [IDENTITY.md](IDENTITY.md), `docs/features/` (dossiers per feature) |

---

## 1. Goals and non-goals

**Goals:**
1. **Pick and choose.** Someone can install just the Dock, or just Snip, or just the Magic tools, and get the complete experience of that piece.
2. **One source of truth.** The monorepo (`orionopenwow/LensUI`, or its future Campton home) stays canonical. Every edition is built from it, so a fix lands once and reaches every edition.
3. **Nothing breaks.** Full Lens behaves the same at every step (§9 gates). Each edition passes its own tests, and editions and full Lens coexist safely on one PC.
4. **Easy to grow.** An edition user can move to full Lens in one step, keeping their settings.

**Non-goals:**
- Separately developed forks, or code copied between repos by hand.
- Editions with weaker safety. The kernel (§3) carries the safety systems into every edition.
- Splitting for its own sake. An edition exists only when people would install it alone (the scan and community feedback decide, §11).

## 2. Where Lens is today (26 Nov 2026, `main`)

- **Backend.** One Rust crate (`src-tauri`): 81 modules, about 560 commands registered in one `lib.rs`, one `config.rs` (935 lines) holding every feature's settings, and one `tauri.conf.json` with 25 windows. Shared systems live in `app/` (setup, watcher, placement, flyout geometry, sign-in gate, loadguard, tray), `input.rs`, `changes.rs`, `failsafe/` and `agentsafe/`.
- **Frontend.** One Vite app; `main.tsx` routes each window by `?surface=`. Feature folders exist (`src/dock`, `src/topbar`, `src/magic`, `src/snip`, `src/browser`, `src/music`, `src/widgets`, `src/themes` …), but they reach into each other. `DockSurface.tsx` (2,844 lines) imports from `dock`, `music`, `search`, `magic`, `topbar`, `ai`, `themes`, `failsafe` and `components`. `settings` and `surfaces` import from almost everything.
- **What already helps:**
  - feature flags in config (most features are off by default);
  - generated IPC types;
  - one settings writer;
  - one change registry;
  - one approval card;
  - one motion system;
  - the control catalogue;
  - dossiers per feature;
  - CI rigs (E2E, parity, perf, hyper, theme-switch).

  These are the seams the plan builds on.

## 3. The model: kernel, modules, editions, mirrors

```
 ┌──────────────────────────── monorepo (canonical) ─────────────────────────────┐
 │ kernel ─┬─ dock ─ launcher ─ quicksettings ─ search ─ settings-shell …         │
 │         ├─ topbar     ├─ magic ─ magic-mouse ─ selection-bar ─ magic-search    │
 │         ├─ snip       ├─ browser     ├─ music     ├─ widgets ─ dashboard       │
 │         ├─ themes ─ window-styling ─ cursors ─ wallpaper ─ backdrop-lab        │
 │         └─ ai/agent ─ command ─ voice ─ shelf ─ clip …                         │
 │                                                                               │
 │ editions/  lens (all) · lens-dock · lens-snip · lens-magic · lens-themes …    │
 └───────────────┬───────────────────────────────────────────────────────────────┘
                 │ CI, on every main merge and tag (§7)
     ┌───────────┼──────────────┬──────────────┬─────────────┐
   lens-dock   lens-snip     lens-magic     lens-themes    …   (generated mirror repos + releases)
```

### 3.1 Kernel (in every edition, never optional)

| Kernel part | Today | Why every edition needs it |
|---|---|---|
| Config core + the one settings writer, with sections owned by modules | `config.rs` | Settings survive moving between editions; one writer, no clobbering |
| Change registry + **Remove all** | `changes.rs`, `win_backup.rs` | Promise 3 (reversible) holds in every edition |
| Failsafe: renderer watchdog, loadguard, safe start, crash-loop guard, **sign-in gate**, autostart guard | `failsafe/`, `app/loadguard.rs`, `app/safe_start.rs`, `app/signin_gate.rs`, `app/autostart_guard.rs` | A crash never leaves the person without a usable desktop or sign-in screen |
| Input service | `input.rs` | The only low-level hooks; Magic Mouse, hot corners, selection bar and dock edges all claim through it |
| Windows, monitors and placement | `win_windows.rs`, `win_events.rs`, `win_monitors.rs`, `app/place.rs`, `app/flyout_geom.rs`, fullscreen and anti-cheat detection (`win_rules.rs`) | Anything on screen needs correct placement, DPI and the game/anti-cheat step-aside |
| Theme engine core: tokens, theme apply, the base packs, motion system, UI kit | `app/theme_apply.rs`, `src/themes` (core), `src/styles`, `src/ui`, `src/components` (kit only) | Every edition looks like Lens and follows the person's theme |
| Agent safety core: `agentsafe` gate + the one approval card | `agentsafe/`, `src/approval` | Any edition that acts (even just "Ask Lens") goes through the same gate |
| Updater, tray, single instance + **role locks** (§6), i18n, bug report, Tester Hub (slim) | `win_update.rs`, `app/tray.rs`, `report.rs`, `tester/`, `src/i18n` | Signed updates, honest bug reports, consistent language |
| Control catalogue core + generated types | `control/`, `tools/gen-types` | Settings and intents stay typed and agent-readable |
| Setup wizard shell | `src/setup` | First run per edition (the edition supplies its own steps) |

Kernel budget: idle ≤ 40 MB extra over WebView2's shared baseline, and no windows of its own except tray and setup.

### 3.2 Modules

A module owns its Rust code, frontend code, settings section, windows (surfaces), commands, control-catalogue entries, intents, Magic actions, Remove-all handlers, tests, parity scenes and dossier. It declares:

- **requires**: modules that must be present for it to work at all;
- **adjacent**: modules an edition should ship with it for the full experience;
- **enhances**: optional modules it lights up when they're present (entry points hidden otherwise).

| Module | Requires | Adjacent (ship together) | Enhances when present |
|---|---|---|---|
| **dock** (all styles incl. Unified; auto-hide; attention; window-count marks; carousel; reflow; pin order; system area) | kernel | launcher, quicksettings, search, settings-shell, previews, media-mini | topbar, magic (Lens › menu), widgets, ai (AI dock), music (full) |
| **previews** (live DWM thumbnails, hover cards) | kernel | — | dock, topbar |
| **launcher** | kernel | search | dock, magic-start |
| **quicksettings** (Wi-Fi, sound, brightness, tiles) | kernel | — | dock, topbar |
| **search** (Search flyout, app/file search) | kernel | — | magic-search (upgrades results) |
| **settings-shell** (the Settings window; shows only installed modules' pages) | kernel | — | every module (each brings its pages) |
| **media-mini** (Now Playing card, sound glow, level meter) | kernel | — | music (full app), dock, topbar, widgets |
| **topbar** (Top Bar, extra bars, halo, click-through) | kernel | quicksettings, previews, media-mini | dock, widgets, dashboard |
| **magic** (Magic menu, Lens › item, LensPan, action catalogue) | kernel | — | everything with actions |
| **magic-mouse** | magic, input | snip (grab → studio) | — |
| **magic-start** (Magic button) | magic, launcher | — | dashboard |
| **selection-bar** + **magic-search** | magic | shelf, browser (side panel) | ai |
| **snip** (capture, studio, OCR, pins, recording, history) | kernel | shelf | magic, magic-mouse, ai |
| **shelf** + **clip** (clipboard history) | kernel | — | magic, command, snip |
| **command** + **ai** + **voice** + **presence** (agent, Lens cloud pointer) | kernel, agentsafe | shelf, magic | every module's intents |
| **browser** | kernel, agentsafe | shelf | magic-search, ai |
| **music** (full Now Playing app, lyrics, Spotify) | media-mini | — | widgets |
| **widgets** + **dashboard** (desktop widgets, Magic Dashboard) | kernel | media-mini | feeds, messages, shelf |
| **themes-pro** (all packs, Backdrop Lab, window styling, caption engine, cursors, wallpaper, folders) | kernel | — | every visible module |
| **cleaner**, **feeds**, **messages**, **coreapps** (Lens Apps) | kernel | — | magic, dashboard |

The full table is generated from module manifests (§5.1) into `docs/brain/generated/modules.md` and checked in CI, so the table can't drift from the code.

### 3.3 Editions

An edition is a build profile: kernel + a set of modules + its own name, identifier, icon, setup steps, site page and release channel.

| Edition | Modules | Who it's for | Size target (installer / idle) |
|---|---|---|---|
| **Lens** (full) | all | Everyone who wants the whole desktop | today's |
| **Lens Dock** (first) | kernel, dock, previews, launcher, quicksettings, search, settings-shell, media-mini; *topbar optional at setup* | People who want a better dock/taskbar and nothing else | ≤ 12 MB / ≤ 110 MB |
| **Lens Snip** | kernel, snip, shelf + clip, settings-shell | A capture tool | ≤ 10 MB / ≤ 60 MB idle (overlay built on demand) |
| **Lens Magic** | kernel, magic, magic-mouse, magic-start, selection-bar, magic-search, snip, shelf + clip, launcher, settings-shell | Right-click, selection bar, Magic Mouse, Magic Search | ≤ 14 MB / ≤ 90 MB |
| **Lens Themes** | kernel, themes-pro, settings-shell | A themer: window styling, cursors, wallpapers, Backdrop Lab | ≤ 12 MB / ≤ 70 MB |
| **Lens Browser** | kernel, browser, shelf + clip, settings-shell (+ magic-search if chosen) | The light AI browser | per MASTERPLAN W7-C budget |
| **Lens Widgets** | kernel, widgets, dashboard, media-mini, settings-shell | Desktop widgets and Dashboard | ≤ 12 MB / ≤ 90 MB |
| **Lens Music**, **Lens Cleaner** | kernel + module + settings-shell | Single-purpose apps | small |

ThumbDesk and Tribe Code stay their own products (Campton siblings); Lens Apps links them.

**Adjacent rule.** An edition must include every *requires* and every *adjacent* module of what it ships. A CI check (§8) fails if, say, Lens Dock ships without quicksettings. That's how "each piece has the adjacent pieces needed for full user function" is enforced rather than remembered.

**Graceful absence.** Where an *enhances* module is missing, its entry points disappear cleanly. For example, the Dock's right-click "Lens ›" item and the Magic button aren't shown in Lens Dock. One quiet "More in full Lens" link in About and in Settings' footer is the only upsell (no nagging; IDENTITY promise 7).

## 4. How modules talk (contracts)

1. **Capabilities, not imports.** Modules never import each other's internals. Each exposes a small public contract (`src/<module>/contract.ts`, `src-tauri/src/<module>/api.rs`). `magic/contract.ts` and `shelf/contract.ts` already work this way.
2. **Runtime registry.** At start-up the kernel builds a registry from the edition's modules: surfaces, settings sections and pages, control entries, intents, Magic actions, Remove-all handlers, role locks. The UI asks `hasModule("magic")` or `capability("magic.open")`. These are compile-time constants per edition (Vite `define`), so absent code is tree-shaken, not just hidden.
3. **Events for loose links.** Cross-module reactions use named events (`lens://media/changed`, `lens://selection/ready` …) with typed payloads in the generated types. A missing listener is harmless.
4. **Settings sections.** Each module owns `config.<section>` with its own defaults and migrations. The kernel merges the sections, and an edition reads and writes only its own. The file format stays identical across editions, so moving to full Lens keeps everything.

## 5. Mechanics inside the monorepo

### 5.1 Module manifests

`modules/<id>/module.json` holds: id, name, version, requires, adjacent, enhances, Rust feature, frontend entry, surfaces (window specs), settings section, catalogue entries, intents, Magic actions, role locks, budgets. Generators read these to produce: per-edition `tauri.conf.json` (windows, identifier, product name), capabilities, the surface router, generated types, control catalogue, docs tables and the CI matrix.

### 5.2 Rust: modules as Tauri plugins

The idiomatic Tauri v2 boundary is the plugin, so each module becomes one (`tauri::plugin::Builder::new("dock")`):
- it registers its own commands (`plugin:dock|…`), its setup and its cleanup;
- `lib.rs` shrinks to kernel setup plus `.plugin(dock::init())` lines chosen by Cargo features (`edition-dock` etc.).

Two-step path to keep risk low:
1. **Features first.** `#[cfg(feature = "mod-dock")]` gates in the single crate, with plugins registered by feature. Frontend calls go through the generated API layer, so the `plugin:` names change in one place, not at 500 call sites.
2. **Crates later.** Once the boundaries lint (§8) is clean, move modules to `crates/lens-<module>` in a Cargo workspace, with `crates/lens-kernel` underneath. Each edition app is a thin crate in `editions/<id>/src-tauri`.

### 5.3 Frontend: packages per module

- bun workspaces: `packages/kernel-ui` (themes core, UI kit, motion, i18n, hooks such as `useLensState` slimmed to kernel state), then `packages/<module>`.
- Each edition has `editions/<id>/main.tsx` (generated router) and its own Vite config.
- `useLensState` splits into kernel state plus per-module stores, so a module only re-renders on its own changes. This is also a perf win for full Lens.

### 5.4 Splitting the big files

Splitting these is a prerequisite and already ranked in the dossiers:
- **`DockSurface.tsx`** splits into dock core, hover card/carousel, system area, music card host, context menu, and a "Lens › menu host" that only exists when magic is present.
- **`ControlCenterSurface.tsx`/settings** becomes a page registry fed by modules.
- **`config.rs`** becomes sections.
- **`lib.rs`** becomes plugin registration.

## 6. Coexistence and upgrades (one PC, several Lens pieces)

- **Shared data folder.** Every edition uses `%APPDATA%\LensUI`, so settings are shared and moving to full Lens is seamless. Each edition writes only its own sections.
- **Role locks.** Each exclusive job (dock, top bar, input hooks, Magic Mouse pointer, selection bar, snip hotkey, wallpaper host, tray icon, MCP server) is a named, per-session lock. If full Lens and Lens Dock both run, only one owns the dock. The newer or fuller one takes over; the other steps aside and shows "Full Lens is handling the dock".
- **Change registry is shared.** Remove all from any edition undoes every Lens change, whichever edition made it, using the same registry file.
- **Upgrade.** "Get full Lens" downloads the signed full installer. On first run full Lens finds the edition, takes its roles, keeps the settings and offers to uninstall the edition (asks first).
- **Downgrade.** Uninstalling full Lens leaves the edition's settings intact; Remove all runs first, as it does today.
- **Updater.** Each edition has its own channel manifest, signed with the same key. Edition and full versions share the kernel version line, so a security fix ships to all of them together.

## 7. Repos and releases

- **Canonical:** the monorepo. All development, issues of record, PRs and reviews happen here.
- **Edition repos:** `lens-dock`, `lens-snip`, `lens-magic`, `lens-themes`, `lens-browser`, `lens-widgets` … under the same owner (a Campton GitHub organisation is open, see COMBINATOR §3). They are **generated mirrors** with history: a CI job on each `main` merge runs a path filter over kernel + the edition's modules + `editions/<id>` + docs, and pushes to the mirror (josh-style filtering or `git filter-repo`; the exact tool is chosen in P4). Each mirror has:
  - a README for that edition, with screenshots, install and "part of Lens";
  - its own CI, so the mirror builds from its own contents (proving it's complete);
  - Issues on, with a template that lands in the monorepo (a bot transfers issues);
  - PRs welcome. A bot ports them to the monorepo, and the mirror updates when the port merges. P4 starts read-only, P6 adds the porting bot (Copybara-style) if people send PRs.
- **Releases:** tags in the monorepo (`dock-v0.1.0`) build that edition and publish the signed installer to the mirror's Releases and the edition's update channel. Full Lens keeps `v0.x.y` tags.
- **Why not independent repos:** the kernel changes every week. Independent repos would mean N copies drifting apart and security fixes landing late. Generated mirrors give each piece its own home, stars and issues without that cost.

## 8. "Nothing gets broken": the safety net

| Check | What it catches | Blocks merge |
|---|---|---|
| **Full-Lens parity**: every golden, E2E, hyper, theme-switch and perf rig stays green, and goldens are pixel-identical through P1–P3 (no behaviour change) | A refactor changing what people see | Yes |
| **Boundaries lint**: frontend dependency rules (dependency-cruiser config generated from manifests) plus a Rust check that a module only uses kernel and declared modules. Warn in P1, error from P2 | Hidden coupling | Yes (from P2) |
| **Edition matrix CI**: each edition builds, runs its unit tests, its E2E subset, its parity scenes and its budgets | An edition missing code or regressing | Yes for shipped editions |
| **Adjacent check**: the edition's module set satisfies requires and adjacent | An edition shipped without a piece it needs | Yes |
| **Absence tests**: for every *enhances* link, a test with the module removed (Dock without Magic shows no Lens › item and no errors; Settings lists only present pages; Command offers only present intents) | Dead buttons, console errors, broken menus | Yes |
| **Coexistence E2E**: full Lens + Lens Dock running together → one dock, one set of hooks; then quit either → the other takes the role within 2 s | Double docks, fighting hooks | Yes (from P3) |
| **Upgrade E2E**: Lens Dock with custom settings → install full Lens → same settings, roles moved, edition offered for removal | Lost settings | Yes (from P3) |
| **Remove-all per edition**: each edition's Remove all leaves Windows as before (tester step + `tools/changes/check.mjs` per edition) | Leftover OS changes | Yes |
| **Mirror self-build**: each mirror's own CI builds from the mirror alone | A mirror missing files | Yes for publishing |
| **Budgets per edition**: installer size, idle RAM/CPU, cold start | Bloat | Yes |

## 9. Phases and gates

| Phase | Work | Gate to move on | Size |
|---|---|---|---|
| **P0: Map** | `tools/modules/graph.mjs` generates today's real dependency graph (frontend imports, Rust `use`, commands per module, settings fields per module) into `generated/modules.md`. Draft manifests for every module. List the cross-links to cut | Graph reviewed; the module table above corrected from the real graph | S |
| **P1: Seams** | Settings sections in `config.rs` (no file-format change); the capability registry and `hasModule` (all true in full Lens); contracts for dock↔magic/music/search/topbar; split `DockSurface.tsx` and the Settings page registry; boundaries lint in warn mode | Full-Lens goldens identical; lint warnings counted and falling | M |
| **P2: Plugins** | Rust modules become Tauri plugins behind Cargo features; the generated API layer for `invoke`; `lib.rs` becomes registration; boundaries lint becomes an error | Full-Lens CI green; zero lint errors; perf unchanged | L |
| **P3: Lens Dock** | `editions/lens-dock`: manifest, setup steps (dock style, edge, colours; Top Bar optional), identifier, icon, installer, update channel; role locks; absence, coexistence and upgrade tests; site page | Edition matrix green; real-PC tester pass (TEST-1 list) | M |
| **P4: Mirrors** | Mirror generator plus `lens-dock` mirror repo, first signed edition release, issue transfer bot | Mirror self-build green; release installs and updates | M |
| **P5: More editions** | In demand order: Lens Snip and Lens Magic, then Lens Themes, Lens Widgets, Lens Browser, then Music and Cleaner. Each repeats P3–P4 | Same gates per edition | M each |
| **P6: Two-way** | PR porting bot (mirror → monorepo) if mirrors get PRs; crates extraction (§5.2 step 2) | Ported PRs merge without manual copy | M |

Rough timing (targets, not promises):
- **P0–P1** in December 2026, alongside the 1.0 work. They make full Lens cleaner and faster too.
- **P2** before or right after 1.0.
- **P3–P4** (Lens Dock) as the first post-1.0 launch, which fits the "Rebuilt in Lens"/Campton launch story.
- **P5** through H2 of the combinator plan.

## 10. Risks

| Risk | Mitigation |
|---|---|
| A refactor breaks full Lens | Pixel-identical goldens through P1–P3; one module per PR; the Fable pass reviews every phase |
| Editions drift from full Lens | Single source + generated mirrors; one kernel version line |
| Two Lens apps fight over the desktop | Role locks + coexistence E2E |
| Plugin command renames break call sites | Generated API layer; old names kept as aliases for one release |
| Settings get lost moving between editions | Shared data folder, sectioned config, upgrade E2E |
| Too many editions to maintain | An edition must earn its place (demand from the scan, issues, downloads); at most one new edition per month |
| Safety weakens in a small edition | Kernel is mandatory: sign-in gate, failsafe, Remove all, approvals, anti-cheat rules in every edition |

## 11. Open decisions

1. Edition names: "Lens Dock", "Lens Snip" … (proposed), shown with "by Campton".
2. Where the mirror repos live (a Campton org is proposed; see COMBINATOR §3).
3. Whether mirrors accept PRs from day one (proposed: issues yes, PRs via the porting bot in P6).
4. Which edition follows Lens Dock (proposed: Lens Magic, because the selection bar, Magic Mouse and Magic Search make a strong standalone).
5. Whether editions appear in Lens Apps (proposed: yes, as "Lens pieces", so people can add one piece at a time).
