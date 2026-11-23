# Testing Lens UI for robustness and fluidity

Lens replaces parts of the Windows shell, so it has to be steady under any input, smooth on slow
machines, and leave Windows exactly as it found it. This document covers the suites that check
that, how to run them, and what they have found.

| Suite | What it proves | Where | Runs |
|---|---|---|---|
| Unit + property (Rust) | Geometry, parsers and config loading hold for *any* input | `src-tauri/src/tests/robustness/` | every PR (`build.yml`, `portability.yml`); 16× cases nightly |
| Property (frontend) | Edge Shelf geometry, Dock config normalisers | `src/__tests__/robustness.prop.test.ts` | every PR (`bun run test`) |
| End-to-end on Windows | The real app starts, every tab renders, themes and Dock styles apply, palette and Lens Command work, the wizard can be skipped and finished, and quitting puts Windows back | `tests/e2e/run.mjs`, `tools/e2e/probe.ps1` | every PR; restart loop nightly |
| Fluidity budgets | Frame times, long tasks, layout shift and first paint stay within 20 % of the baseline at 4× CPU throttle | `tools/perf/run.mjs`, `tools/perf/budgets.json` | every PR; longer Playground runs nightly |
| Reduced motion | With animations off in Windows, nothing on the key surfaces animates | `tools/perf/reduced-motion.mjs` | every PR |
| Visual regression | Key states of every surface × 3 packs × 2 sizes match their goldens | `tools/visual/run.mjs`, `tools/parity/golden/` | every PR |
| Accessibility | No serious/critical axe violations or contrast failures on any tab or surface, light and dark | `tools/a11y/run.mjs`, `tools/a11y/allowlist.json` | every PR |
| Soak + chaos | No leaks after hundreds of toggles, theme switches and Command open/close cycles; no blank surface when 5 % of backend calls fail or time out | `tools/soak/run.mjs` | short on every PR, full nightly |

All browser-based suites share one harness (`tools/robust/`): the real frontend bundled with the
Tauri APIs mocked (`tools/parity/mock/`), plus a chaos layer (`tools/robust/mock/core.ts`) that
can fail or delay backend calls on demand. They are in `.github/workflows/e2e.yml`.

## Running locally

```bash
# once
bun install
npm i --no-save playwright@1.63.0 axe-core@4 && npx playwright install chromium

# frontend property tests (part of bun run test)
bun test src/__tests__/robustness.prop.test.ts
PROP_RUNS=20000 bun test src/__tests__/robustness.prop.test.ts   # more cases
bun test --todo src/__tests__/robustness.prop.test.ts             # include known findings

# Rust property tests
cd src-tauri && cargo test --lib robustness_tests
PROPTEST_CASES=4096 cargo test --lib robustness_tests             # 16× cases, like nightly
cargo test --lib robustness_tests -- --ignored                    # include known findings

# browser suites (build the harness first)
node tools/robust/build.mjs
node tools/perf/run.mjs                 # fluidity budgets
node tools/perf/reduced-motion.mjs      # no motion when motion is off
node tools/visual/run.mjs               # golden images
node tools/a11y/run.mjs                 # axe-core
SOAK_SCALE=0.2 node tools/soak/run.mjs  # quick soak + chaos (1.0 = full)
```

End-to-end needs Windows 10/11 with the WebView2 runtime:

```powershell
node tests/e2e/tauri-config.mjs                       # overlay: DevTools port on every webview
bun run tauri build --debug --no-bundle --config tests/e2e/out/tauri.e2e.json
npm i --no-save playwright@1.63.0                    # attaches over CDP, no browser download needed
pwsh tools/e2e/probe.ps1 snapshot tests/e2e/out/before.json
node tests/e2e/run.mjs                               # E2E_ONLY=palette,theme-switch for a subset
pwsh tools/e2e/probe.ps1 compare tests/e2e/out/before.json
```

The end-to-end run starts the real Lens UI: it will hide the taskbar and restyle windows while it
runs, exactly as Lens does. Run it on a test machine or VM, not in the middle of your work. The
probe then checks that quitting put everything back.

## What runs where

| | Every PR / push to main | Nightly (02:17 Phoenix) |
|---|---|---|
| `build.yml` › Windows build | Rust property tests (default cases) | — |
| `portability.yml` | Rust property tests on Linux and macOS | — |
| `e2e.yml` › robustness | perf, reduced motion, visual, a11y, soak at 30 % | soak at 100 %, Playground scenes 15 s each |
| `e2e.yml` › windows-e2e | all scenarios + Windows-restored probe | + start → quit × 10 restart loop |
| `e2e.yml` › nightly-properties | — | Rust property tests × 16 cases |

`workflow_dispatch` with "update baselines" re-measures perf on the runner and uploads the numbers
and fresh renders as artifacts. It never commits anything.

## The suites in detail

### Property tests (Rust)

`src-tauri/src/tests/robustness/`, registered in `lib.rs` as a test-only module:

* **geometry.rs**
  * Dock flyouts on any edge never leave their monitor or grow, and side flyouts sit flush against the Dock.
  * Hot corners only fire in real (hard) corners of arbitrary 1–4 monitor rows. Shared edges between monitors never fire. The dwell timer fires once per visit, never while blocked.
  * Lens Mini placement near the cursor and above the Dock stays inside the work area.
  * Alt+drag: moving keeps size and grab offset; resizing keeps the opposite edges fixed and the minimum size; restoring a maximised window lands it under the pointer; the hook passes injected input and unmodified clicks straight through.
  * Focus border: the four strip windows never overlap and hold every visible ring pixel; pixels are valid premultiplied colours; dim alpha is capped and monotonic; gradients never panic.
* **input_fuzz.rs**
  * The offline intent parser (voice, palette "Do it", Ask) never panics on any text. Polite filler, casing and punctuation never change the action.
  * The native-messaging protocol never panics on any text or JSON. It refuses unknown fields and oversized fields, and never accepts a file path from a web page. Framing never panics and never over-allocates. Replies always fit the browser's 1 MB limit.
  * Selection reading: password fields, Lens itself, elevated apps, fullscreen apps and excluded apps are refused under every policy.
* **config_fuzz.rs**: `config.json` from random JSON or with corrupted sections never panics. A missing section either fails cleanly or keeps every other section. Unknown sections are tolerated. The default config round-trips exactly.

Case counts default to a few hundred per property, so the suite takes seconds. `PROPTEST_CASES`
scales them all.

### End-to-end (Windows)

`tests/e2e/run.mjs` starts the built app and attaches Playwright to its WebView2 windows over the
Chrome DevTools Protocol. Every Lens surface is its own webview (a CDP page), and scenarios find
them by their `surface` URL parameter. Backend commands are called through
`window.__TAURI_INTERNALS__.invoke`, the way the UI calls them.

**Why not tauri-driver / msedgedriver.** That was the first approach, and it can't attach to Lens.
wry always hands WebView2 its own `AdditionalBrowserArguments`, which replace the
`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` variable msedgedriver relies on. No debugging port ever
opens: CI reported "DevToolsActivePort file doesn't exist", and a diagnostic run showed the
webview processes start without `--remote-debugging-port`.

The test build therefore uses a config overlay instead (`tests/e2e/tauri-config.mjs`, passed with
`tauri build --config`):
* it adds `--remote-debugging-port=9222` to every window's `additionalBrowserArgs`, next to wry's defaults;
* every window gets identical arguments, because all webviews share one WebView2 environment;
* release builds are untouched.

The one window built in code rather than from the config, Playground's idle window, isn't covered
by the overlay. It isn't used by the end-to-end run.

| Scenario | Checks |
|---|---|
| startup | the Dock and Top Bar windows exist and render |
| control-center | every Control Center tab renders text with no console error, uncaught error or rejection |
| theme-switch | switching pack changes `data-scheme` / `--lens-pack-base` on every open surface, and they agree |
| dock-style | taskbar → slim → split → floating each re-render the Dock |
| palette | opens, finds results for "notepad" |
| lens-command | opens; "dark mode" through the offline engine gives an answer or action card, no errors |
| setup-wizard | Escape skips it; Next through every step finishes it and sets `onboardingCompleted` |
| quit-clean | `quit_lens` leaves no `lens-ui` process |
| restart-loop (nightly) | start → quit × 10, no `lens-ui` left, no growth in WebView2 processes |

`tools/e2e/probe.ps1` runs around the scenarios. It snapshots, and then compares:
* that the taskbar is visible;
* the taskbar, Explorer, DWM, pointer, mouse and personalisation registry keys Lens may change;
* that no Lens process or window is left behind.

HKCU `Run` ("Start with Windows") is reported but not compared, because it is a setting the user keeps.

Not covered headless on the runner, and so not asserted: WorkerW wallpaper attachment, real DWM
frame colours on other apps' windows, the low-level keyboard and mouse hooks, and multi-monitor
layouts. Those stay on the manual smoke-test list (docs/INTEGRATION_NOTES.md).

### Fluidity budgets

`tools/perf/run.mjs` throttles the CPU 4× through DevTools. It records the time between animation
frames, long tasks over 50 ms, cumulative layout shift and first contentful paint for:
* the Dock: hover sweep, classic magnification, search glide open and close;
* Lens Mini expanding to Command;
* six theme switches;
* every Settings tab;
* each of the 8 Playground scenes for 5 s.

`budgets.json` holds the baseline. A run fails when a metric exceeds baseline × 1.2 plus a small
absolute allowance (one 60 Hz frame — 17 ms — on p50 and p95, 3 long tasks, 0.02 CLS, 150 ms first paint; frame times are quantised to display frames, so a tighter margin would fail on a single dropped frame). The allowance
keeps timer noise from failing runs.

**Updating the budgets** after an intended change:
1. Run the workflow manually with "update baselines".
2. Download `robustness-reports`.
3. Copy its `budgets.json` over `tools/perf/budgets.json`.

Always take the runner's numbers; budgets from a developer machine don't transfer.

`tools/perf/reduced-motion.mjs` opens 15 states with `prefers-reduced-motion: reduce`, which is
what Windows' "Animation effects" switch maps to. It fails if any visible element keeps a
transition or animation longer than 0 ms. It also proves the probe works, by finding animations
when motion is allowed.

### Visual regression

`tools/visual/run.mjs` renders 19 key states:
* every surface;
* Dock hover, search and Taskbar style;
* the Theme, Dock and AI Settings tabs;
* a palette query;
* Lens Mini and full Command.

Each state is rendered in Obsidian, Catppuccin Mocha and Alabaster Daylight at two window sizes,
114 images in all. Rendering is deterministic:
* the clock is frozen at Wed 15 Jan 2026 10:30;
* reduced motion is on and animations are disabled;
* the caret is hidden;
* live clocks are masked.

The diff runs inside Chromium on canvas, so there are no native dependencies. A pixel differs when
any channel moves by more than 26/255, and an image fails when more than 0.1 % of its pixels differ
(`VISUAL_TOLERANCE`). Diff images go to `tools/visual/out/diff/`.

**Updating goldens.** Goldens depend on fonts, so they are recorded on the CI runner, with Chromium
from the pinned Playwright 1.63.0:
* **Missing goldens:** written to the `visual-new` artifact, which doesn't fail the run until goldens exist.
* **Changed renders:** in `visual-actual`.

To accept a change, copy the PNGs into `tools/parity/golden/`, or run
`node tools/visual/run.mjs --update` on Linux with the same Playwright.

### Accessibility

`tools/a11y/run.mjs` injects axe-core into every Control Center tab and 12 surface states, in
Obsidian and Alabaster Daylight. Any `serious` or `critical` violation fails, and so does any
`color-contrast` failure. Page-level rules that don't apply to window fragments are switched off:
`region`, `landmark-one-main`, `page-has-heading-one`, `html-has-lang` and `document-title`.

Known exceptions live in `tools/a11y/allowlist.json`. Each entry has a rule, a surface, a target
selector substring and a reason, and the reason links to a finding below when it is a real defect.
Entries that no longer match anything are reported, so the list can only shrink.

### Soak and chaos

`tools/soak/run.mjs` runs two passes.

**Soak:**
* 500 settings steps: real toggle clicks on each tab, plus config changes broadcast the way the backend does.
* 500 Dock config changes.
* 200 theme switches.
* 200 Command/Mini open–type–close cycles.

DOM nodes, event listeners and JS heap are sampled through DevTools after a warm-up and at the end,
both after forced GC. Growth beyond 25 % nodes, 25 % listeners or 50 % heap (plus small absolute
slack) fails, as does any console error or uncaught exception.

**Chaos:** 11 surfaces × 3 seeds with `?chaos=0.05`, so 5 % of backend calls fail. Half reject at
once and half "time out" after 1.5 s. A surface must stay rendered and must not throw. Unhandled
promise rejections are counted per command and reported.

Known defects are matched in `KNOWN` in `tools/soak/run.mjs` and reported as `fixme(Fn)` rather
than failures.

## App-side test hooks (snippets, not applied)

The suites need nothing from the app today. They find elements by existing class names and roles,
and reach the backend through Tauri's own IPC. These optional hooks would make them sturdier;
apply them in the owning files when convenient.

1. **Stable test ids.** Class names change with design work. Add `data-testid` to the elements the
   suites key on, then switch the selectors in `tools/*/run.mjs` and `tests/e2e/run.mjs`:
   ```tsx
   // src/surfaces/DockSurface.tsx
   <nav className="dock-pill …" data-testid="dock-pill">
   <div className="dock-icons-row" data-testid="dock-icons">
   <button className="dock-search-mag-btn dock-item" data-testid="dock-search">
   // src/surfaces/ControlCenterSurface.tsx — sidebar tab buttons
   <button className={`cc-nav-btn ${…}`} data-testid={`cc-tab-${id}`}>
   // src/command/mini/MiniView.tsx
   <button className="mini-expand" data-testid="mini-expand" …>
   // src/surfaces/CommandPaletteSurface.tsx
   <div className="pal-results" data-testid="palette-results">
   ```
2. **Perf marks** around expensive work, so the perf suite can attribute long tasks:
   ```ts
   // src/hooks/useLensState.ts, inside applyThemeToDocument()
   performance.mark("lens:theme-apply:start");
   …
   performance.measure("lens:theme-apply", "lens:theme-apply:start");
   ```
3. **`?test` flag for e2e.** A build-time-off flag that makes the Tauri build skip the first-run
   wizard and the "Start with Windows" registry write. Tests then start from a known state without
   touching HKCU `Run`:
   ```rust
   // src-tauri/src/app/setup.rs, at the top of setup()
   let e2e = std::env::var("LENS_E2E").ok().as_deref() == Some("1");
   if e2e { cfg.onboarding_completed = true; cfg.func.run_on_startup = false; }
   ```
   and in `.github/workflows/e2e.yml` › End-to-end scenarios: `env: LENS_E2E: "1"`.

## Findings

Real defects the suites found. Each is marked in its test (`test.todo` for bun, `#[ignore]` for
Rust, `KNOWN` for chaos, the allowlist for a11y), so CI stays green until it is fixed. Remove the
marker together with the fix.

### F1: a failed `get_windows_theme` at startup leaves the whole surface blank

**Status: fixed on integration/waves-7-8** (`useLensState` loads config and theme independently; the `KNOWN` marker can go once the chaos suite confirms).

* **Found by:** chaos (`tools/soak/run.mjs`), on the dock, topbar, settings and widgets surfaces.
* **What happens:** `useLensState` loads `get_config` and `get_windows_theme` with `Promise.all`. If the theme call rejects (an IPC hiccup at startup, a registry read failing), `.catch(console.error)` swallows it and `config` stays `null`. Every surface built on `useLensState` returns `null` and stays empty. Nothing retries; the surface only recovers if another window saves the config and broadcasts it.
* **Repro:** `node tools/robust/build.mjs`, then open `tools/robust/out/harness.html?surface=dock&chaos=0.05&seed=1` through any static server, for example `SOAK_ONLY=chaos node tools/soak/run.mjs`. The Dock never appears, and the console shows `chaos: get_windows_theme failed`.
* **Suggested fix** (`src/hooks/useLensState.ts`): load the two independently. Apply the config as soon as it arrives, and fall back to the default `winTheme` already held in state when the theme call fails. Retry `get_config` with a short backoff if it fails.
  ```ts
  const cfg = await invoke<LensConfig>("get_config");
  const theme = await invoke<WindowsThemeInfo>("get_windows_theme").catch(() => null);
  ```
* **Marker:** `KNOWN` entry `F1` in `tools/soak/run.mjs`.

### F2: `dock.iconSize` is never clamped

* **Found by:** frontend property test, Dock config normalisers.
* **What happens:** `dockStyleIconSize` passes the configured size straight through, and the backend sizes the Dock window from `icon_size` too (`commands/surfaces.rs`). Per-style sizes (`iconSizes`) are checked to 16–96 px, but the main `iconSize` is not. A hand-edited, synced or restored config with `0` gives an invisible Dock, and one with `5000` gives a screen-sized Dock window that covers the desktop.
* **Repro:** set `"iconSize": 5000` in `%APPDATA%\LensUI\config.json` and start Lens. Or run `bun test --todo src/__tests__/robustness.prop.test.ts`.
* **Suggested fix:** clamp to 16–96 in `migrate_config_value` (a v2→v3 step) and in `dockStyleIconSize` / `resolveDockIconSize`.
* **Marker:** `test.todo("F2: …")` in `src/__tests__/robustness.prop.test.ts`.

### F3: Dock app buttons have no accessible name (axe `button-name`, critical)

**Status: fixed on integration/waves-7-8** for pinned apps, running windows, Launcher, System and Settings (`aria-label` with running/focused state); drop the F3 allowlist entries after the next a11y run.

* **Found by:** accessibility suite, on the dock and dock-search states, light and dark.
* **What happens:** `.dock-item` buttons show only an icon. The app name lives in a sibling tooltip that isn't linked, so Narrator and other screen readers announce every Dock icon as just "button". The same applies to voice access ("click Spotify" can't find it).
* **Repro:** `node tools/a11y/run.mjs` with the F3 allowlist entries removed.
* **Suggested fix** (`src/surfaces/DockSurface.tsx`): `aria-label={app.name}` on each `.dock-item`. Add "(running)" or "(focused)" when that applies.
* **Marker:** allowlist entries with reason F3.

### F4: Control Center switches and icon-only buttons have no name (axe `button-name`, critical)

**Status: fixed on polish/aaa-wave-1.** Every switch carries `role="switch"`, `aria-checked` and a name; icon-only buttons are named; `src/ui` `Toggle`/`IconButton` require a name by type; `src/__tests__/polishGuardrails.test.ts` scans for regressions. Allowlist entries removed.

* **Found by:** accessibility suite. 34 nodes across the Windows & Quick, Stats & Tasks, Desktops & Widgets, AI & Command and Agents tabs, plus the widget drawer.
* **What happens:** `.cc-toggle` switches carry `role="switch"` but no `aria-label`/`aria-labelledby`. Their visible label sits in a sibling `.cc-label`, which isn't linked. Icon-only `.cc-chip` buttons (accent swatches, small icon actions) have no text either.
* **Suggested fix:** give the shared toggle component an `aria-labelledby` pointing at its row's `.cc-label` id, and give swatches `aria-label={"Accent " + name}`.
* **Marker:** allowlist entries with reason F4.

### F5: interactive controls nested inside interactive controls (axe `nested-interactive`, serious)

**Status: fixed on polish/aaa-wave-1.** `PillFillBar` is a plain container with the slider role on its track layer and the icon button beside it (it also gained keyboard support); Overview tiles are `role="group"` with the close button inside. Allowlist entries removed.

* **Found by:** accessibility suite: Quick Settings, Control Center sliders, Overview window cards.
* **What happens:** slider pills (`role="slider"`) and app volume rows contain their own buttons, and Overview window cards are buttons that contain close buttons. Screen readers skip or merge the inner controls, and keyboard focus order is ambiguous.
* **Suggested fix:** make the outer element a plain container with the slider/button role on one inner element, or move the inner buttons beside it.
* **Marker:** allowlist entries with reason F5.

### F6: low-contrast secondary text in the palette and launcher (axe `color-contrast`, serious)

* **Found by:** accessibility suite, in Obsidian and Alabaster Daylight.
* **What happens:** the palette's "12 min ago" recents age (`.pal-recent-age`), and the launcher's folder counts (`.ln-count`) and keyboard hint (`.ln-hint`), fall below 4.5:1.
* **Suggested fix:** use the secondary text token instead of the tertiary one for these three. The theme-ux pass did the same for Control Center descriptions.
* **Marker:** allowlist entries with reason F6.

### F7: ARIA labels that don't match what's on screen

* **Found by:** accessibility suite (`label-content-name-mismatch`, `aria-prohibited-attr`, serious).
* **What happens:**
  * The Top Bar clock's `aria-label` doesn't contain the time it shows.
  * The AI card's Detect button is labelled "Look for local models again" while it reads "Detect".
  * Lens Mini's context row (`.mini-ctx`) puts `aria-label` on a div with no role, so it is ignored.

  Voice-control users say what they see, so a mismatched name can't be targeted.
* **Suggested fix:** start each `aria-label` with the visible text (for example "Detect: look for local models again"), and give `.mini-ctx` `role="group"`.
* **Marker:** allowlist entries with reason F7.

### F8: the Theme & Look hero jumps when switching packs (layout shift)

* **Found by:** the fluidity budgets (`theme-switch`, CLS 0.053 on the runner) once Theme & Look became the first Control Center tab.
* **What happens:** each pack's one-line description has a different length. When it wraps to a second line, the preview window, the Dark/Light/Auto switch and the sliders below jump down about 29 px. Clicking through themes makes the whole card bounce, right under the pointer.
* **Repro:** `PERF_ONLY=theme-switch node tools/perf/run.mjs`. Or open Theme & Look and click through the recommended packs.
* **Suggested fix:** reserve two lines for the description (`min-height: calc(2 * line-height)` on the description in the Theme hero), or clamp it to two lines.
* **Marker:** the `theme-switch` CLS baseline in `tools/perf/budgets.json` is raised to 0.055, with a `_findings` note. Lower it with the fix.

## Change log: waves 7–8 integration (`integration/waves-7-8`)

The suites caught these when waves 7–8 met the waves 4–6 merge. App bugs were fixed in the app, and
no test or allowlist entry was loosened.

* **E2E theme-switch: approval and nowplaying kept the old theme.** Both new surfaces (the MCP
  "Needs your OK" window and Lens Music's Now Playing) never called `useLensState()`. So no
  `data-scheme` or pack tokens were applied, and they never followed later changes.
  * **Fix:** both call `useLensState()` like every other surface. The listener is set up when the
    lazy window is created, so theme changes made before it opens still apply.
* **E2E lens-command: Enter in "Do" mode did nothing visible.**
  * **Causes:**
    * Do mode sent everything to `ai_ask`, which refuses while Lens Intelligence is off.
    * The offline intent engine (`ai_intent → ai_run_intent`), which needs no model, was only used for the preview row.
    * Do mode shows only tool and action cards, so `ai_ask`'s error landed on a hidden answer card and Enter looked dead.
    * When the preview hadn't finished parsing yet, Enter went to `ai_ask` even with the engine available.
  * **Fix:** `src/command/doMode.ts` runs `ai_intent`, then `ai_run_intent`, and falls back to `ai_ask` only for text the engine doesn't know. Every outcome, including failures, leaves a visible card.
  * **Coverage:** unit tests in `src/__tests__/commandDo.test.ts`. The e2e scenario now runs with AI **off**, so it is stricter than before.
* **Accessibility (axe, serious or critical; fixed in markup, no allowlist entries added):**
  * **Settings search:** `aria-controls` pointed at a results list that only exists while typing. It is now set only then.
  * **Dock buttons:** the visible badge number wasn't in the button's name. Badges are `aria-hidden`, and the name carries the same count, for example "Terminal, 4 notifications". This closes the badge part of F7 for the Dock.
  * **Top Bar keyboard-layout button:** its name now starts with the visible "ENG".
  * **Network signal bars:** `aria-label` sat on a span with no role. They now have `role="img"`.
  * **Quick Settings `.sysmod-sub` text:** it was 3.55:1 at 10.5 px. It now uses the secondary text token, which passes 4.5:1. This is part of F6.
* **Visual regression:** the `settings-theme` state picked its tab by the old name "Theme", which no longer exists in the new Settings hub, so the run timed out. It now picks "Appearance".
  * The `settings-*` and `topbar-*` goldens were re-recorded on the runner: the Settings hub is new UI, and the Top Bar gained Lens Music and keyboard modules.
  * Each re-recorded image was compared by eye with its old golden before acceptance.
  * Quick Settings (`quicksettings-*`, 33–39 % changed): the waves 7–8 Battery and Keyboard modules now sit above Display & Eye Care. These are new features, not a regression, so the goldens were re-recorded.
  * Command full view and the launcher (0.1–0.3 %): the keycap hints in their footers changed padding with the shared `kbd` style. The goldens were re-recorded.
* **Perf:** within budget on the same run, so no budget changes.
