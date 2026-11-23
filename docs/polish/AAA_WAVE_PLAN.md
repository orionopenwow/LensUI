# AAA wave plan

Five waves take Lens from "lots of good surfaces" to "one instrument". Each wave has:

- a quality bar (the AAA_AUDIT scorecard axes);
- a definition of done that CI checks;
- a scope cut: what we deliberately don't do in that wave.

The values come from [AAA_RESEARCH.md](AAA_RESEARCH.md) and the issue numbers (#n) from [AAA_AUDIT.md](AAA_AUDIT.md).

| Wave | Theme | Lifts axes | Size | Status |
|---|---|---|---|---|
| A | Foundations: tokens, primitives, guardrails | M, F, A | M | **Built in `polish/aaa-wave-1`** (see "What shipped") |
| B | Surfaces: migrate every surface to tokens and primitives | V, P | L | Next |
| C | Flows: storyboarded transitions between surfaces | M, F | M | — |
| D | Signature moments | delight | M | — |
| E | Perf and robustness to budget | all | M | Ongoing ratchet |

---

## Wave A: Foundations

**Goal:** one vocabulary and one set of parts, plus a lint that keeps it that way.

1. **Motion tokens** (`src/styles/motion.css`): `--lens-ease-{out,in-out,exit,drawer,spring}`, `--lens-dur-{instant,fast,base,slow,slower}`, `--lens-press-scale`, `--lens-enter-scale` and `--lens-stagger`. Under reduced motion, every duration token is 1 ms and the scales are 1.
2. **Elevation tokens** (`src/styles/elevation.css`): `--lens-elev-0…4` built on `--lens-shade`, plus the edge light.
3. **Replace hard-coded transitions** in the 20 worst files with tokens (#1). The rest move in Wave B under the ratchet.
4. **Primitives** (`src/ui/`):
   - `Button`, plus `IconButton`, where `aria-label` is required by the type;
   - `Toggle`, which needs `label` or `labelledBy` by the type and is optimistic with rollback;
   - `Segmented`, `Chip`, `KeyChip` and `Card`;
   - `Toast` plus the `toast()` bus;
   - `Skeleton` (delayed 200 ms), `EmptyState` and `ErrorState`.
5. **Settings hub** migrated to the primitives. The shared `cc-toggle` paths get names (F4). Nested controls are un-nested (F5).
6. **Quick wins:**
   - global press scale of 0.98;
   - tabular numerals on numeric classes;
   - skeletons in Settings, Apps and Feeds;
   - empty states (Focus, Gaming, widget notes);
   - theme cross-fade with no white flash;
   - one window enter/exit keyframe pair;
   - a fix for the Command cold-start replay race, with the e2e retry removed.
7. **Guardrails:**
   - `tests/ui/a11y-names.test.ts`: a static scan where every `role="switch"`, `cc-toggle` and icon-only button must carry a name;
   - `tests/ui/motion-tokens.test.ts`: the tokens exist, reduced motion zeroes them, and touched files carry no raw durations;
   - `tests/ui/no-new-inline-styles.test.ts`: a ratchet over the inline-style count per file, which may only go down.

**Done when:**

- the F4/F5 allowlist entries are removed and the a11y suite is green;
- `perf` theme-switch and settings-tab-switch are no worse, with budgets lowered where they improved;
- the guardrail tests are green.

**Scope cut:** no visual redesign of any page; no new features.

---

## Wave B: Surfaces

**Goal:** every surface scores ≥4 on V and P.

| Area | Work |
|---|---|
| Sliders (#16, #17) | One `Slider` primitive: a 6 px track, accent fill at 85 % of `--lens-accent`, and a 16 px thumb. The value chip is right-aligned with tabular numerals. The Quick Settings "slab" sliders become slim tracks in pill rows (row = container, slider = the only control, which also fixes F5 structurally). |
| Settings shell (#41–43) | Sidebar at −1 step lightness. One card border; inner rows use 6 % hairlines. Section headers become a single `SectionTitle` (12 px, 600, 0.02em tracking). |
| Windows & Keys (#19) | Group into "Startup", "Windows", "Keyboard" and "Experimental". Rewrite the copy without registry paths. |
| Focus, Gaming (#20, #21) | `EmptyState` with one-line explanations and a primary action. Gaming gets a "What Lens pauses" list. |
| Overview (#18) | Close becomes an `IconButton` revealed on hover/focus, inset 6 px, neutral (red only on hover). The card is a `div` with an inner `button`. |
| Destructive actions (#24) | `Button variant="danger-quiet"` for Disconnect, Remove and Forget. |
| Targets (#25, #26) | All row actions use `IconButton size="sm"` = 28 px. |
| Status colours (#27, #28) | `--lens-ok/warn/danger/info` tokens with light/dark pairs. Storage bars and channel dots use them. |
| Inputs (#28, F6) | One `TextField` with a token well. Secondary text uses `--lens-text-2`. |
| Toasts (#38–40) | Snip, Browser, Mini and Feeds move to the `toast()` bus. |
| Keyboard hints (#48) | `KeyChip` everywhere. |
| Theme previews (#22, #23, #46) | 1.5× tiles. The selected tile gets a check badge plus a ring. Swatches are named. Dark thumbnails get an edge light in light packs. |

**Done when:** the scorecard is re-run with no axis below 4 and the inline-style ratchet is at least 40 % down.

**Scope cut:** Lens Apps icons and screenshots stay with the Apps v2 work.

---

## Wave C: Flows (storyboarded)

Each flow is a storyboard of frames with exact timings. All times are from input. "out" = `--lens-ease-out`.

**C1: Command summon (Win+Space)**

| t (ms) | Frame |
|---|---|
| 0 | Key down. The window is already warm (hidden, not destroyed). |
| 0–16 | Show the window at opacity 0, `scale(var(--lens-enter-scale))`, `translateY(6px)`. The input is focused **before** paint. |
| 16–156 | Opacity → 1, scale → 1, y → 0 (`--lens-dur-fast`, out). The caret is visible from the first frame, so typing never waits on motion. |
| 156–336 | Recents fade in with a 30 ms stagger (max 6 rows). |
| Dismiss | Opacity → 0, scale → 0.98 in 120 ms with the exit curve, then hide. Esc during the enter reverses it mid-flight (a transition, not a keyframe). |

**C2: Dock launch**

| t (ms) | Frame |
|---|---|
| 0 | Press: item scale 0.98 (80 ms) |
| 80–380 | Release: spring back to the magnified scale (`--lens-ease-spring`, 300 ms) plus the running-dot "breathing" (opacity 0.4↔1, 2 cycles, 600 ms) until the window appears |
| Window appears | The dot settles to solid in 140 ms. If 4 s pass with no window, the dot fades and a toast says "Still opening <App>…" |

**C3: Settings navigation**

| t (ms) | Frame |
|---|---|
| 0 | Click a nav item. The nav highlight slides (`--lens-ease-in-out`, 180 ms). |
| 0–16 | The old page is kept, and the new page renders off-thread (`startTransition`) |
| ≤200 | If it isn't ready, a page-shaped `Skeleton` shows after a 200 ms delay |
| Ready | The new page cross-fades in (opacity 0→1, y 4→0, 140 ms). The old page leaves instantly (no exit motion, frequent action). |

**C4: Theme switch**

| t (ms) | Frame |
|---|---|
| 0 | Click the pack. `document.startViewTransition` snapshots the old view. |
| Callback | Only `applyThemeToDocument` (sync CSS vars). No fetch: packs are preloaded on hover. |
| 0–240 | Root cross-fade, `--lens-dur-slow`, out. Under reduced motion it is instant. |
| Fallback | Without View Transitions (old WebView2), a pack-coloured cover fades out over 160 ms, so there is no white flash. |

**C5: Quick Settings and the Top Bar flyouts**

- The panel grows from its anchor icon (`transform-origin` = icon centre): scale 0.96→1 and opacity 0→1 in 180 ms.
- Rows stagger 20 ms.
- Close is 120 ms with the exit curve.
- Switching between flyouts while one is open cross-fades content with no window re-animation (as macOS menus do).

**C6: Notification → action**

- The toast enters from the bottom-right: y 12→0, opacity, `--lens-dur-slower` with the drawer curve.
- Hover pauses the timer, and the progress hairline shows the time left.
- Swiping with velocity above 0.11 px/ms dismisses it.
- An action button shows its result in place ("Replied ✓") for 1.2 s, then the toast leaves.

**C7: First run → Setup Wizard → the desktop**

The wizard's last step hands off to the launch bloom (D1), so the first impression is the signature moment.

**Done when:** every storyboard has a parity scene that records frames at the listed timestamps, plus a golden.

---

## Wave D: Signature moments

All of these are opt-out (Settings › Accessibility › Motion). They are off under reduced motion and GPU-cheap (transform/opacity/canvas only).

1. **Launch nebula bloom.** On Lens start, the nebula-monocle "B" logo blooms from screen centre: a radial gradient that scales 0.6→1.4 and fades in 360 ms, while 24 dust particles drift towards the Dock position. The Dock rises 12 px with the spring as the bloom collapses into it. Total 900 ms, skippable by any key, and shown once per boot.
2. **Ink-wash theme switch.** An upgrade of C4: the new theme spreads out from the click point as an ink wash. This is a `clip-path: circle()` on `::view-transition-new(root)` growing from the pointer, with a feathered edge (SVG turbulence mask, baked once) over 420 ms. Dark→light spreads like paper, light→dark like ink.
3. **Spring dock physics.** Magnification driven by a critically-damped spring (stiffness 300, damping 30, bounce ≈0.15), simulated in one rAF loop for the whole Dock rather than per item. Includes an overshoot on launch (C2) and a rubber-band at the edges when dragging to reorder.
4. **"Lens wakes."** Saying "Hey Lens" (or holding the voice key) brings up a soft edge glow that breathes along the bottom of the screen in the accent colour. It ripples with the amplitude of your voice (a 30 Hz envelope, capped at 8 px). On "done" it gathers into the Dock mic like a drop of water. Reduced motion: a static glow.
5. **Sounds pack** (optional, **off by default**). 5 cues (wake, open, close, success, error) of ≤400 ms in the 600 Hz–2 kHz band. Each surface has a Lens row in the Sound mixer. Sound is never the only signal, and a cue is throttled to once per 250 ms. Shipped as an installable `.lenssounds` pack so the community can make more.

**Done when:** each moment has a parity reel (webm), a perf budget entry, and a reduced-motion check.

---

## Wave E: Perf and robustness to budget

| Scenario | Now p95 | Target | How |
|---|---|---|---|
| Theme switch | 83.4 ms, 6 long tasks | ≤50 ms, ≤2 | View Transition snapshot; batch CSS var writes into one `style.cssText`; preload packs on hover; stop re-rendering every subscriber (memoised selectors) |
| Settings tab switch | 50 ms, 10 long tasks | ≤33 ms, ≤4 | `startTransition`; split the 415 KB settings chunk per page; keep visited pages mounted (`hidden`) |
| Command Mini→full | 50 ms | ≤33 ms | Pre-measure the full layout; animate transform only |
| Dock magnify | 33.3 ms | ≤16.7 ms | One spring loop (D3); `will-change` only while hovered |
| Aurora | 66.6 ms | ≤33 ms | Half-res canvas plus CSS upscale; pause when occluded |
| main.js | 643 KB | ≤450 KB | Lazy-load the AI, Browser and Music chunks |

Also in Wave E:

- revisit the reduced-motion policy (keep 120 ms fades) once the probe can tell opacity-only transitions apart;
- a soak test for 2 h of theme flips with no leak growth;
- budgets only ever go down.

---

## Standout features (ranked)

Ranked by distinctiveness × fit with Lens × effort.

1. **Spaces.** Named, persistent desktops that remember their windows, wallpaper, Dock pins, focus mode and theme ("Studio", "Writing", "Gaming"). Switching is a single Win+1…9 or a Command phrase ("go to Writing"). Unlike Windows virtual desktops, a Space can be *dehydrated*: closed apps are recorded and relaunched in place when you return. Built on WorkspacesCard and Desktop Groups. The signature here is a horizontal ink-wash slide between Spaces.
2. **Peek.** Hold Space over any file in the Desktop folder, Launcher, Shelf or Command results to get an instant floating preview: images, PDF, code with syntax highlighting, audio scrub, video. Releasing Space dismisses it, and pressing Enter opens the file. It uses the Windows preview handlers where available and falls back to Lens renderers. It is the Quick Look Windows never shipped.
3. **Split view and snap stacks.** Drag a window to an edge and Lens offers 2/3/4 layouts as live thumbnails (not just the FancyZones grid). Snapped groups become a *stack* that minimises, restores and moves to another Space together. Command phrase: "split Chrome and VS Code".
4. **Routines.** Trigger → steps automations, readable as sentences: "When I connect the work monitor, open the Work Space, set Balanced power, mute Discord." Triggers are time, app, network, display, battery, voice phrase or calendar. Steps are any Lens action, MCP tool or script. Every run is logged and reversible (AGENTS.md). Routines can be suggested by AI from repeated behaviour, always with consent.
5. **Phone companion.** A PWA paired by QR over the local network (end-to-end encrypted). It works as a remote for Music, Volume and Snip, a share target (send a link or photo to the Shelf), a notification mirror, and lets you approve AI actions from your phone (human in the loop when you're away).
6. **Live theme editor.** Edit any pack on the live desktop: click an element and its tokens appear in a floating inspector. Contrast is checked live (WCAG badge) and the light/dark pair is generated automatically. Export as `.lenstheme`, or publish to the community gallery.
7. **Desktop share link.** One click produces a link to a read-only, beautiful render of your setup (theme, Dock, widgets, wallpaper) with an "Install this look" button. It shares no personal data: window titles and names are stripped. This is the growth loop.
8. **Widgets SDK.** Widgets as small sandboxed web components with a typed manifest, permissions (network, files, system telemetry) and the theme tokens injected. Hot reload in Playground. Includes a gallery and a review process.
9. **Per-app theming bridge.** Push the current Lens pack into apps that support themes: VS Code, Windows Terminal, Obsidian, Discord (BetterDiscord), Firefox/Chrome (userChrome/extension), Spotify (Spicetify). It is reversible and switches when the Lens theme switches (including day/night).
10. **Time Machine for the desktop.** Snapshots of Lens config plus Space layouts, taken on every meaningful change, with a scrubber in Settings to browse "how my desktop looked last Tuesday" and restore it. Everything stays inside `%APPDATA%\LensUI\`.
11. **Focus lens.** One key dims everything except the active window (a 70 % scrim with a soft vignette). Notifications are held and released as a digest afterwards, and an optional ambient soundscape plays. Works with Focus sessions.
12. **Universal clipboard shelf with OCR.** Every copied image becomes searchable text (Windows OCR, local only). Search the Shelf by what's *in* a screenshot.
13. **Smart rename and tidy.** Select messy Downloads, and AI proposes names and folders as a diff you approve. Never applied without consent; one-click undo.
14. **Window tabs.** Drag a window onto another to tab them together, like browser tabs for any app. Lens draws the tab strip as a top overlay.
15. **Activity rings for the desktop.** Optional, private, local: how long you spent in deep-work apps vs messaging, shown as quiet rings in the Top Bar with a weekly digest. No telemetry leaves the PC.
16. **Command scripts marketplace.** Share `/commands` (prompt plus tools plus UI card) as small signed packs; install with one click from the community page.
17. **Hover scrub media.** Hover over the Dock's Music item and scroll to scrub. Hover a video file in Peek and move to scrub. Tactile control everywhere.
18. **Accessibility profiles.** One switch applies a whole profile: Low vision (larger type, high contrast, bigger targets), Motor (bigger targets, dwell click, sticky drag), Focus (reduced motion, fewer badges). Each profile is a pack overlay, so it composes with any theme.
19. **Night shift for UI.** Beyond Night Light: after sunset, packs drift warmer and lower in contrast over 30 minutes (the Linear-style warm grey), then back at sunrise. Imperceptible, but evenings feel calmer.

---

## What shipped in Wave A (this branch)

| Item | Where |
|---|---|
| Motion tokens (5 durations + exit, 5 curves incl. spring, press/enter scale, stagger), window enter/exit, theme cross-fade, tabular numerals | `src/styles/motion.css` |
| Elevation scale (5 levels on `--lens-shade-k`, edge light) and hit-target sizes | `src/styles/elevation.css` |
| 149 transition declarations in the 21 worst files moved to tokens (`tools/polish/migrated.txt`) | `tools/polish/tokenize-motion.mjs` |
| Primitives: Button, IconButton (label required by type), Toggle (optimistic + rollback), Segmented (arrow keys), Chip, KeyChip, Card, Skeleton (200 ms grace), EmptyState, ErrorState, Toast + `toast()` bus | `src/ui/` |
| Settings hub on the primitives (Toggle, Segmented, StateNote → Skeleton), page skeleton, ToastHost, tab body in a React transition | `src/settings/ui/primitives.tsx`, `ControlCenterSurface.tsx` |
| **F4 fixed:** every switch named; icon-only buttons named; swatches named and `aria-pressed` | allowlist emptied |
| **F5 fixed:** `PillFillBar` un-nested (slider role on its track, keyboard support added); Overview tiles are groups | allowlist emptied |
| Overview close badge: neutral 24 px, red only when aimed at | `OverviewSurface.css` |
| One enter/exit motion for every glide surface | `global.css` |
| Theme: layout-effect apply (no stale frame), cross-fade in the initiating window, no needless stylesheet rewrites | `useLensState.ts` |
| Command cold-start race fixed (single listener + backend `seq`), e2e retry removed | `CommandSurface.tsx`, `openSeq.ts`, `integration.rs`, `tests/e2e/run.mjs` |
| Skeletons: Settings, Apps catalogue, Feeds. Empty states: Feeds, Focus | — |
| No native `title=` left (TrafficLights, ColorWheel) | — |
| Guardrails | `src/__tests__/polishGuardrails.test.ts`, `commandOpen.test.ts` |

**Perf (CI runner, 4× throttle, p95 ms / long tasks):**

| Scenario | Before (budget baseline) | After (CI run) |
|---|---|---|
| Theme switch | 83.4 / 6 | 33.4 / 0 |
| Settings tab switch | 50 / 10 | 33.4 / 6 |

The budgets were lowered to 50/2 and 33.4/6.

**Not done in Wave A (moved to B):**

- the remaining 126 transitions in other files;
- migrating Snip, Browser, Mini and Feeds toasts to the bus;
- Gaming and widget-notes empty states.

The inline-style ratchet starts at 1,006. It is 4 above main, because the un-nested `PillFillBar` needs separate layers. It can only go down from here.
