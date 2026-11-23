# Lens UI master plan

Status: living document. Owner: the maintainer. Reviewed weekly (see §7). Last revised 2026-11-23.

## 1. North star

**Make Lens the #1 themeable desktop shell for Windows.** It should be the one app people install to make Windows calm, beautiful and fast, and the one they trust because every change can be undone. Lens should earn the right to come to Linux (Wayland layer-shell) and macOS later.

Lens wins on three things competitors don't combine:

1. **One coherent desktop.** Dock, top bar, themes, window styling, wallpaper, pointers and a command layer, all in one design language.
2. **Trust.** Every feature is off until you turn it on. Every OS change can be undone. Games and anti-cheat are never touched. Releases are signed. The code is open source.
3. **Local-first intelligence.** An offline command engine, local models, and Claude only when the user says so. Every action goes through an approval card.

### Measurable goals

| Area | Metric | Today | 1.0 target (≈ Feb 2027) | Stretch (≈ mid-2027) |
|---|---|---|---|---|
| Stability | Crash-free sessions (opt-in crash reports, PR #3) | unmeasured | ≥ 99.5 % | ≥ 99.9 % |
| Stability | "Remove all Lens changes" leaves Windows exactly as before (tester step) | untested | 100 % on Win 10 22H2 + Win 11 23H2/24H2 | + Insider Dev channel weekly |
| Performance | Idle RAM, whole process tree (`lens_process_tree_memory`) | unmeasured | ≤ 180 MB with dock + top bar; ≤ 260 MB with every surface warm | ≤ 140 MB / 200 MB |
| Performance | Idle CPU (dock + top bar, nothing animating) | unmeasured | ≤ 0.3 % average over 5 min | ≤ 0.1 % |
| Performance | Frame time while animating (dock magnify, theme switch) | unmeasured | p95 ≤ 16.7 ms at 60 Hz, no frame > 50 ms | p95 ≤ 8.3 ms at 120 Hz |
| Performance | Cold start to dock visible | unmeasured | ≤ 900 ms | ≤ 500 ms |
| Performance | Lens Snip (W7-G): hotkey to capture overlay | — | ≤ 150 ms, ≤ 40 MB extra RAM while open, 0 MB when closed | ≤ 80 ms |
| Performance | Lens Browser (W7-C): idle RAM with 1 tab | — | ≤ 220 MB extra (WebView2 shared); ≤ 60 MB per extra suspended tab | ≤ 150 MB |
| Quality | Body-text contrast in every theme pack | 18/18 ≥ 4.5:1 (PR #6) | 100 % of packs and surfaces | AAA for body text |
| Quality | Parity coverage (surfaces × presets with screenshots) | 22 surfaces × 2 presets + galleries | every surface and card, 3 presets, 2 widths | + golden-image diffing (W7-B) |
| Quality | Tests | 95 on main (25 Rust + 70 bun); several hundred more across open PRs | ≥ 600 Rust, ≥ 500 bun, all green | + property tests and fuzzing (W7-B) |
| Adoption | GitHub stars | — | 2,500 | 10,000 |
| Adoption | Installs (updater pings, opt-in) | 0 | 5,000 | 50,000 |
| Adoption | Community themes published | 0 | 50 | 500 |
| Community | Tester reports closed within 7 days | — | ≥ 80 % | ≥ 90 % |

## 2. Operating model: fast and safe

### 2.1 Waves with strict ownership

Work ships in **waves**: 4–8 parallel *agent packages*, each owning a named set of files.

- Shared files (`lib.rs`, `config.rs`, `lens.ts`, `useLensState.ts`, `ControlCenterSurface.tsx`, `main.tsx`, `tauri.conf.json`, `capabilities/default.json`, `build.yml`, `package.json`) are edited **only by the integrator**. Packages ship snippets in their own `docs/<AREA>.md`.
- New code goes into new modules (`src-tauri/src/<area>/`, `src/<area>/`). Pure logic stays dependency-free, so it is unit-testable without Windows.
- Each package opens a PR and never merges itself.

### 2.2 One integration branch per wave

`integration/<wave>` merges every package PR, applies every snippet, regenerates `src/types/generated.ts`, and must be green before one PR goes to `main`. The maintainer merges that single PR. Package PRs are then closed as superseded.

### 2.3 Daily loops (already running)

- **05:13 Phoenix: research lookout.** A scheduled task scans competitors, Linux docks, Windows Insider changes, local-LLM tooling and security advisories. It writes `docs/research/daily/YYYY-MM-DD.md` and keeps `docs/research/IDEAS_BACKLOG.md` ranked on branch `research/daily`.
- **Same run: tester notes.** It writes `docs/tester/daily/YYYY-MM-DD.md` and `docs/tester/LATEST.json`. The next build bundles them into the **Tester Hub** (Settings › About & Testing).
- **Tester feedback loop:**
  1. The tester runs the checklist (Pass / Fail / Skip plus notes and screenshots) and marks moments in the session log.
  2. They export the redacted report zip and press **Report an issue**, which opens a prefilled GitHub issue labelled `tester-report`.
  3. The weekly review (§7) turns those issues into backlog rows, ranked above research ideas when they are bugs.

### 2.4 Definition of done (every package)

- CI green: Windows build, `clippy -D warnings`, `cargo test`, bun tests, generated-types check, parity, and portability (Linux/macOS `cargo check`).
- Parity contact sheets were produced and looked at, in Obsidian and Alabaster Daylight at both widths. There is no clipped text, no overlap, and contrast is ≥ 4.5:1.
- New features are off by default. They can be undone, and the undo is covered by a test or a tester step. They pause for fullscreen apps and games where relevant.
- `docs/<AREA>.md` lists every snippet, and the integrator applies them.
- At least three tester steps for the feature are added to the next `LATEST.json`, highest risk first.
- Privacy review for anything touching input, clipboard, screen, files or the network: what is read, where it goes, how it is redacted.

### 2.5 Release train

| Channel | Source | Cadence | Signing | Who |
|---|---|---|---|---|
| Nightly | `main` after each integration merge | daily if `main` moved | signed updater manifest (PR #3) | maintainer + tester |
| Beta | tagged from `main` after a clean tester pass | weekly (Thursday) | signed installer + updater | opted-in users |
| Stable | Beta that survived 7 days with no high-risk regressions | every 2–4 weeks | signed installer, Store, winget, Scoop | everyone |

Each channel has its own `latest.json`. The updater never moves a user to a less stable channel. Rollback means republishing the previous manifest.

## 3. Roadmap

### 3.1 Now (next 2 weeks)

| Package | Scope | Files | Acceptance |
|---|---|---|---|
| **INT-46** | Integrate waves 4–6 (PRs #1–#3, #5–#16) on `integration/waves-4-6` | shared files | one green PR to `main`; Settings contact sheets for every tab; `docs/INTEGRATION_NOTES.md` smoke list |
| **TEST-1** | Real-hardware pass on Win 10 22H2, Win 11 23H2 and Win 11 24H2, at 100 / 150 / 200 % scaling and with 2 monitors | Tester Hub (this PR) | every high-risk step passes; failures filed as `tester-report` issues |
| **W5-A** | Dock behaviour: 5 hide modes and edge pressure, parabolic magnify (no widening), click-action matrix, glass that turns solid when a window touches it, live icons, attention bounce | `src/dock/*`, `win_attention.rs` | parity at 3 scales; hide modes covered by unit tests; zero dock widening in all styles |
| **W5-B** | Multi-monitor: dock and panel per monitor with overrides; "only this monitor's apps" | `app/monitors_surfaces.rs`, `src/dock/scope.ts` | hot-plugging a monitor never loses the dock; settings survive monitor id changes |
| **W5-D** | Desktop presets (states for desktop / maximised / fullscreen), wallpaper per workspace, hot-reloaded theme files with last-good fallback | `src/themes/surfacePresets.ts`, `win_theme_watch.rs` | a broken `.lenstheme` never blanks the UI |
| **W5-F** | Dock profiles (named layouts, independent of theme) | `src/dock/profiles.ts` | switching profiles takes < 100 ms |
| **UX-1** | Spacing, alignment and visibility pass on every surface: 4 px grid, type scale, focus rings, hit targets ≥ 32 px | all CSS (after INT-46) | contact-sheet diff reviewed; no element below 4.5:1 |
| **W7-A** | Voice control ("Lens, minimise this…"): push-to-talk, local whisper, the same intents and approvals as the script engine | `src-tauri/src/voice/*`, `src/voice/*` | works offline; no always-on listening; works when the mic is shared with a call app |
| **W7-B** | Robustness and fluidity tests: real-Windows E2E on a self-hosted runner, perf budgets enforced in CI, visual golden images, proptest/fuzz for parsers and redaction, 8-hour soak, accessibility audit | `tools/e2e/*`, `tools/perf/*`, `src-tauri/src/tests/*` | budgets in §1 fail the build when exceeded; zero crashes in a 24 h soak |

### 3.2 Next (1–2 months)

| Package | Scope | Acceptance |
|---|---|---|
| **W7-C Lens Browser** | Lightweight WebView2 browser: vertical tabs and spaces, YouTube transcripts into the Shelf, an agent mode in which every step needs your OK | idle RAM budget in §1; agent never submits forms or pays without approval; passes the bridge privacy rules |
| **W7-D Claude controls the desktop** | A Desktop State API over MCP that covers every Lens detail, per-task capability grants, one unified approval card, undo and snapshots for every AI action | every MCP action can be undone; grants expire with the task; audit log in the Tester Hub |
| **W7-E Right-click everything** | Action catalogue across dock, windows, files, text and the desktop; "micro-saves" (one-click save of a selection to the Shelf); context packs for Claude | one consistent menu component; actions searchable in Command |
| **W7-F Lens Guide** | AI tutor with coach marks and short lessons ("make my desktop calmer", "learn hot corners") | lessons run without a model (script engine), better with one; can be dismissed for good |
| **W7-G Lens Snip** | Capture region/window/screen. Before saving: a pre-save studio with auto-redaction of e-mails and keys, OCR, pin to screen, paste to Claude, a share sheet with recent targets, screen recording, scrolling capture and searchable history | budgets in §1; redaction on by default; history stays local and encrypted |
| **ECO-1 Theme gallery** | A `.lenstheme` gallery on the Pages site, one-click "Open in Lens" installs, creator credit, moderation queue | 50 community themes; install takes ≤ 2 clicks |
| **ECO-2 Theme editor** | Live-preview editor with export; Playground scene packs | a theme made in under 5 minutes in a hallway test |
| **ECO-3 Rice in 60 s** | From the wallpaper, generate a theme, dock style, pointers and border that match; "shareable desktop" links | the generated theme passes contrast checks |
| **DIST-1** | Code signing, Microsoft Store, winget, Scoop; hero video in the README | SmartScreen-clean install |
| **PERF-1** | Publish RAM/CPU comparisons against Seelen UI, Object Desktop and Explorer alone | reproducible script and results page |

### 3.3 Later (this quarter and beyond)

- **Natural-language layouts:** "coding setup" arranges windows, built on W7-D.
- **Local meeting recorder:** transcription, summary, action items to the Shelf. Off by default; shows a recording indicator.
- **Plugin marketplace:** sandbox review, signed grants (PR #3) and per-plugin capability prompts.
- **Sync between PCs:** themes, dock profiles and the Shelf. End-to-end encrypted, with the user's own storage as an option.
- **Snip and capture follow-ons to W7-G:**
  - live OCR translate overlay;
  - step recorder that turns a series of snips into a how-to doc;
  - annotated bug-report bundles that go straight into the Tester Hub zip;
  - video snips with auto-captions via whisper;
  - screenshot-to-theme, which extracts a palette into a `.lenstheme`;
  - "explain this screen" with a local vision model.
- **Linux/Wayland exploration:** layer-shell dock and bar via `gtk-layer-shell` / `wlr-layer-shell`. Most of the frontend and the std-only Rust modules already port. Start with Hyprland and KDE Plasma.
- **macOS feasibility study:** a menu-bar plus dock companion with no shell replacement; check what Accessibility and ScreenCaptureKit permissions allow.

### 3.4 Moonshots

- **An adaptive desktop.** Lens notices context (focus, meeting, gaming, battery) and proposes a calm layout. It always asks, and learns only on the device.
- **A desktop as a shareable document.** One link reproduces someone's entire setup, with a "what this changes" preview.
- **A fully accessible desktop.** Voice, switch access and high-contrast themes are first-class, built with disabled users, not just for them.
- **Cross-platform Lens.** The same themes and Shelf on Windows, Linux and macOS.

## 4. Architecture guardrails that keep speed safe

- **No patching other processes, out-of-process first.** Lens styles windows with DWM attributes and overlays, never by injecting into other processes. The optional Windhawk hook stays opt-in.
- **Feature flags in config.** Default off; each feature has a matching restore path in "Remove all Lens changes".
- **Pure cores.** Parsing, maths, redaction and policy live in std-only modules with unit tests. Windows calls sit in thin wrappers.
- **Generated IPC types.** Types are generated (`tools/gen-types`), and CI fails on drift.
- **A visible budget per surface.** The Tester Hub shows the current RAM/CPU per surface (PERF-1). Regressions block release.

## 5. Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Windows update breaks DWM attributes, WorkerW wallpaper or the taskbar | high | high | Daily lookout watches Insider builds; W7-B E2E on Insider Dev weekly; every feature degrades to "off" when its API fails; kill-switch flags downloadable with the update manifest |
| Anti-cheat flags Lens | medium | high | No injection; protected-process list; pause overlays and hooks for fullscreen apps and games; publish a statement listing what Lens never does |
| Plugin or bridge abuse | medium | high | Sandboxed iframes; signed grants; native messaging limited to known extension ids; schema validation and rate limits; fuzz the parsers (W7-B) |
| AI privacy incident (screen, clipboard or file content sent to the cloud) | medium | very high | Local-only by default; consent card lists every field; private clipboard formats honoured; redaction tests; audit log; no screen capture without an explicit snip |
| Scope creep slows releases | high | medium | Waves with fixed scope; anything new goes to the backlog first; weekly review cuts or defers |
| Unsigned binaries trigger SmartScreen and cost trust | high | medium | DIST-1 code signing before any public launch |
| Maintainer burnout | medium | very high | Agents do the volume; the human does decisions and testing; one integration PR per wave; a no-merge day each week; the release train runs without heroics |
| Regressions from parallel work | medium | medium | Strict file ownership; integration branch; golden images; tester checklist for each build |

## 6. Metrics dashboard

A page in the Pages site (`docs/site/metrics.html`, built nightly from CI artefacts and opt-in telemetry) with:

- **Health:**
  - crash-free sessions (7-day);
  - open `tester-report` issues by age;
  - failed checklist steps per build.
- **Performance:**
  - idle RAM and CPU per surface;
  - cold start;
  - p95 frame time, per build;
  - Snip and Browser budgets once they exist.
- **Quality:**
  - test counts;
  - parity coverage;
  - contrast failures;
  - clippy and type drift (always 0).
- **Adoption:**
  - stars;
  - installs per channel;
  - themes published and installed;
  - extension installs.
- **Flow:**
  - PRs merged per week;
  - lead time from package PR to `main`;
  - research ideas shipped per week.

## 7. Weekly review ritual (Mondays, 30 minutes)

1. **Health first.** Look at crashes, failed tester steps and budget regressions. Any red item becomes this week's top task.
2. **Tester reports.** Triage every new `tester-report` issue as bug, UX or idea. Bugs go into the next integration wave.
3. **Research backlog.** Take the top 10 from `IDEAS_BACKLOG.md`. Promote at most 3 to the next wave and defer or kill the rest on purpose.
4. **Wave plan.** Name the packages, owners (agent package names), files and acceptance criteria, then check for file-ownership collisions.
5. **Release decision.** Promote Beta → Stable if it's clean; otherwise name the blocker.
6. **One thing to stop doing.**
