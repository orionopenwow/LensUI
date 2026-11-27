# Lens — Living Design Document

> **Mission, brand and design philosophy:** [`docs/brain/IDENTITY.md`](docs/brain/IDENTITY.md) is the top-level source (it wins on conflicts). This file holds the surface specs.

> **Purpose:** Single source of truth for Lens's visual language, motion physics, surface geometry, and interaction patterns. Every surface (`TopBar`, `Dock`, `QuickSettings`, `ControlCenter`, `CommandPalette`, `WidgetDrawer`, and native Win32 overlays) must follow this document so the shell feels unified, intentional, and cohesive.

---

## 1. Core Aesthetic Philosophy

- **Obsidian Monochrome Chrome:** Lens's own chrome is permanently monochrome Black & White (`#09090b` obsidian surfaces, `#fafafa` high-contrast foreground, `rgb(255 255 255 / 0.08–0.14)` hairline borders).
- **Intentional Color:** Color is reserved strictly for:
  1. Full-color application icons in the Dock (**never** strip color or apply monochrome filters to app icons).
  2. Minimal semantic accents on active quick-control tiles and fill bars (Volume blue `#60A5FA`, Night Mode amber `#FBBF24`, Audio cyan `#38BDF8`, Power emerald `#34D399`).
  3. The user's live Windows DWM accent color (configured via the Color Wheel — drives Windows titlebars/borders/folders, never pollutes Control Center's own B&W chrome).
  4. Window buttons (**Yellow `#FEBC2E` · Green `#28C840` · Red `#FF5F57`** by default).
- **Zero Visual Clutter:** Never wrap standalone utility icons in unnecessary pill boxes or double borders. Let bold pure-white iconography breathe directly on the obsidian glass.

---

## 2. Typography

- **Primary Family:** `"Arial Rounded MT Bold"`, `"Arial Rounded"`, `"Segoe UI Variable"`, `system-ui`, `sans-serif`.
- **Numeric Discipline:** All clocks, percentages, pixel readouts, and telemetry metrics use `font-variant-numeric: tabular-nums` so numbers never jitter when updating.
- **Hierarchy:**
  - Surface Header Title: `13px`, weight `600`, `#fafafa`.
  - Section Label: `11px`, uppercase or semibold, `#a1a1aa`, `letter-spacing: 0.04em`.
  - Body / Control Label: `12px–12.5px`, weight `500–600`, `#fafafa`.
  - Metadata / Subtext: `10.5px–11px`, `#71717a`.

---

## 3. Surface Architecture & Seamless Geometry

### 3.1 Flush `0px` Unified Flow-Out
- Popouts anchored to the Top Bar (`QuickSettings`, `CommandPalette`) attach **flush at `0px` gap** directly beneath the Top Bar (`border-top: none`, `border-right: none`, `border-radius: 0 0 0 var(--lens-radius)`).
- No floating gap or disconnected double-edge between the Top Bar and its flow-out drawer.
- All popouts auto-dismiss cleanly on window blur (`Escape` or clicking outside) and mutually exclude each other (opening Search closes Quick Settings, and vice versa).

### 3.2 Top Bar
- **Left:** Basic Virtual Desktops switcher (`<` · `Desktops` · `>` · `+`).
- **Center:** Active window title (`App — Title`).
- **Right:**
  - Integrated **matte-glassware search capsule** — no `"Search..."` placeholder text, subtle recessed specular glass rim + bold pure-white magnifying glass (`strokeWidth: 2.55`), smoothly expanding on focus (`132px → 216px`) and streaming live into the flush Command Palette dropdown.
  - **Free-floating bold system icons** (`Wi-Fi`, `Volume`, `Gear`) — **no bubble/pill wrapper**, thick pure-white strokes (`strokeWidth: 2.55–2.6`, `16px`).
  - **Hover Magnify & Dedicated Routing:** Each icon scales up smoothly (`scale(1.26)`) with a soft white halo on hover and opens its own dedicated flush area:
    - `Wi-Fi` → **Wi-Fi & Network** area (connections, hotspot, VPN, Ethernet, proxy).
    - `Volume` → **Sound & Mixer** area (Master Volume + live Per-App Volume Mixer + output/input devices).
    - `Gear` → **Quick Settings** (with the 3-way usable flick bar: `Quick` · `Theme` · `All`).
  - **Clock:** Clean tabular date & time (`Sat, Nov 21 · 03:30 PM`).
- **Auto-Hide on Overlap:** Enabled by default; stays pinned open whenever Search or Quick Settings is active.

### 3.3 Unified Flow-Out Quick Settings (with Usable Flick)
- A single cohesive right-aligned drawer with a **3-way usable flick switcher** at the top:
  1. **`Quick`** — 3×2 quick toggles, Volume & Brightness `PillFillBar`s, expandable Night Mode card (Strength + Manual / Sunset–Sunrise / Schedule), and real Per-App Volume Mixer (`IAudioSessionManager2`).
  2. **`Theme & Desktop`** — Instant access to **all** theme and desktop controls without leaving the flow-out: Visual Master Theme cards, live Windows Accent Color Wheel, Opacity / Roundness / Accent Strength fill bars, Traffic Light controls, Dock & Top Bar behavior toggles, Taskbar & Startup switches, Folder Theme quick-apply, plus a 1-click pop-out to full Lens Control Center.
  3. **`All Settings`** — Full Windows Settings launcher grid + live CPU/RAM/Uptime telemetry strip + Widget Drawer trigger.
- **Flick Interactions:** Click any segment, **scroll wheel** over the flick bar, **horizontal drag/swipe**, or press `ArrowLeft` / `ArrowRight` to flick smoothly between panes.

### 3.4 Grounded Bottom Dock
- Flush to the bottom edge (`0px` margin default), preserving soft rounded pill geometry.
- **Infinite Auto-Fit:** Dynamically scales icon/gap sizing to accommodate any number of pinned and running apps without overflowing.
- **Zero-Dip Click Physics:** Icons magnify smoothly on hover (with neighbor wave), stay elevated on `:active` (**never dip downward**), and animate upward from themselves when launching.
- **Slot Unification:** Running apps appear directly on their pinned slot (zero duplicates), with a subtle instance indicator and rich right-click context menu.

### 3.5 Window Controls (Traffic Lights)
- Default order: **Yellow (Minimize) · Green (Maximize) · Red (Close)**, left-to-right. Options: Green · Yellow · Red, and Red · Yellow · Green (Mac). Buttons sit directly on the title bar, never on a strip of their own (#80).
- Proportions: `11.5px–12px` diameter (`5.75px` radius) with `20px` center-to-center spacing (`8px` gap), scaled per-monitor by DPI, matching Control Center's own traffic lights.
- Rendered natively on Lens windows and across **all visible third-party Windows apps** via the Multi-Window Z-Ordered Win32 Caption Pool (`win_caption_engine.rs`) with occlusion-safe titlebar pixel matching and true per-window Z-order (no bleed-through).

### 3.6 Control Center & First-Run Setup Wizard
- **Unified Theme Control Array:** Color Wheel sits on the left (`212px`), paired directly inside the same card with the 3 brushed-metal rotary knobs on top and the Icon Style & Icon Shape chips tucked right beneath a `1px` hairline divider — zero dead vertical whitespace.
- **Obvious Left-Pane Navigation:** Plain-English, scannable labels (`Theme & Look`, `Bottom Dock`, `Top Bar`, `Window Buttons`, `Folder Icons`, `Virtual Desktops`, `Widgets & Stats`, `Taskbar & Startup`, plus `Setup Wizard` & `Quit Lens`).
- **Startup Setup Wizard (`SetupWizard.tsx`):** Greets first-run users (`onboardingCompleted === false`) and is re-launchable anytime from the sidebar. 5 live-preview steps: *Welcome → Pick a look (6 recommended packs) → Pick a Dock (Floating, Slim, Taskbar, Split, Unified) → Work with Windows (hide taskbar, start with Windows) → Done (summary, self-test, where settings live)*. Every step can be skipped (skipping also undoes that step's changes), Back always works, Alt+←/→ change step and Esc leaves.
- **Theme & Look tab:** top to bottom — *Current theme* hero (live preview, accent swatches + wheel, Dark/Light/Auto, glass opacity, roundness, blur, tint) → *Choose a theme* (6 recommended, "Browse all" with filters and search) → *Customise* collapsible sections that show a one-line summary when closed. Dock and shell options live in Dock & Top Bar.

---

## 4. Signature Interactive Controls

| Control | Component | Rules |
|---|---|---|
| **Fill Bar** | `PillFillBar` | Rounded-rectangle track with vibrant fill, crisp `4×20px` thumb handle, `pointer`/`grabbing` cursor, click + drag + non-passive mouse-wheel support. **Never** use a "dot on a thin line" slider. |
| **Rotary Knob** | `RotaryDial` | `88px` brushed-metal tactile dial with non-passive mouse-wheel, vertical drag, and double-click reset. |
| **Color Wheel** | `ColorWheel` | Outer Hue Ring + inner `68×68` SV Square with a live `18px` zoomed color circle loupe (**never** a crosshair) and 8 curated swatches. |
| **Toggle Switch** | Monochrome Pill | `38×21px` capsule; `#fafafa` active track with `#09090b` knob (or `#FBBF24` for Night Mode), smooth `cubic-bezier(0.22, 1, 0.36, 1)` slide. |

---

## 5. Motion & Feel

The motion tokens live in `src/styles/motion.css` and `src/ui/motion/tokens.ts`. Use them, never raw values (the `polishGuardrails` test and `bun run lint:motion` enforce this).

- **Primary easing:** `--lens-ease-out` = `cubic-bezier(0.22, 1, 0.36, 1)` (fast, crisp start, silky stop, no overshoot) for entering and changing state; `--lens-ease-in-out` for moving across the screen; `--lens-ease-exit` for leaving; `--lens-ease-spring` only for the release of a press (§5.2) and signature moments.
- **Durations:** hover and micro-scale `--lens-dur-fast` (140 ms); panel flow-out `--lens-dur-base`–`--lens-dur-slow` (180–240 ms); auto-hide slide 220 ms; leaving is always quicker than arriving (`--lens-dur-exit`, 120 ms).
- **Feedback:** every clickable element has an immediate hover state and the right cursor (`pointer` / `grab` / `grabbing`). No dead clicks, no layout shifts, no native `title="..."` tooltips (use `aria-label`, or custom Obsidian pills only where needed).

### 5.1 The feel: light to look at, weighty to touch

Lens looks minimal and quiet, but **controls have weight**. A press should feel like pressing a well-made physical key: it gives, holds, and springs back. It should never feel like a flat web link that only changes colour. Three rules:

1. **Every press is seen.** Pressing starts the press-in within one frame (no waiting for `click`), and the pressed state stays visible for at least **90 ms** even on the fastest click, so it never "flashes" invisibly.
2. **Weight comes from depth, not decoration.** The control sinks: scale down, move 1 px towards the surface, its top highlight dims and its fill darkens a step (or lightens a step on light themes). There's no glow, no ripple, no colour flash.
3. **The release springs back.** Press-in is fast and firm (`--lens-press-in`, 70 ms, `--lens-ease-out`). The release uses the spring (`--lens-press-release`, 220 ms, `--lens-ease-spring`), so the control settles with a tiny, damped overshoot. The overshoot gives the weight; it is never a bounce.

### 5.2 Press weights

Every interactive element declares one weight (`data-weight` or the UI-kit prop). If it doesn't, the kit default applies (**medium** for buttons, **light** for rows).

| Weight | Use for | Press-in | Depth | Release |
|---|---|---|---|---|
| **light** | list rows, menu items, tabs, sidebar entries, chips in dense lists | fill steps one shade; no scale | none | `--lens-dur-fast` colour ease |
| **medium** (default) | buttons, icon buttons, segmented options, Quick settings tiles, dock icons (on click, not hover) | scale `--lens-press-scale` (0.97), translateY 1 px, fill one shade, top highlight to 40 % | 1 px | spring 220 ms |
| **heavy** | primary actions (Done, Install, Approve), destructive actions, big tiles and cards that open something | scale 0.955, translateY 1.5 px, fill two shades, highlight off, inner shade 1 px | 1.5 px | spring 260 ms |

- **Hover** never scales a control. It only steps the fill or brightens the icon (`--lens-dur-fast`). The dock's magnification is its own system.
- **Keyboard** presses (Space/Enter) play the same press as the pointer.
- **Disabled** controls have no press and no hover, at 40 % opacity, with the `not-allowed` cursor.
- **Pending work:** a press that starts work (install, search, apply) keeps the control **sunk** until the work answers. After 300 ms it shows a small inline spinner in place of the icon. No layout change; the width is fixed beforehand.
- **Toggles:** the knob travels with the spring (220 ms) and squashes 6 % wide while pressed; the track colour crossfades over `--lens-dur-fast`.
- **Segmented controls and tabs:** the selected indicator *slides* to the new option (FLIP, transform only) with `--lens-ease-out`; it never jumps.
- **Sliders and fill bars:** the thumb grows 1 px wide while grabbed; the fill follows the pointer 1:1 (no easing while dragging) and settles with `--lens-ease-out` on release or on wheel steps.

### 5.3 Flows: everything comes from somewhere

- **Continuity.** A thing that opens grows from what opened it, using transform from the trigger's rect (FLIP, `src/ui/motion/flip.ts`):
  - a pop-out from its dock icon or bar button;
  - a card into its panel;
  - a search result into its page;
  - a tab into the page.

  Closing returns it to the same place, quicker.
- **One shape.** Flow-outs that leave a bar or dock are one shape with it during the motion too: no seam appears mid-animation (§3.1).
- **Lists arrive in order.** Items stagger by `--lens-stagger` (30 ms), first 6 items only, then the rest appear together. Leaving lists don't stagger.
- **Content swaps** (a page change in Settings, a step in a setup flow) crossfade with a 6 px slide in the direction of travel (forward → from the right, back → from the left), using `--lens-dur-base`.
- **Interruptible.** Any animation can be reversed mid-way from where it is (glide/Presence), never restarted from the end. Rapid toggling never queues animations.
- **Nothing moves the layout.** Only transform, opacity and colour animate. Width, height and position changes are measured and expressed as transforms (FLIP), or happen instantly while hidden.
- **Calm by default.** Things used 100+ times a day (dock hover, list hover, tab switch) get the shortest durations or none. Signature moments (setup Done, Immersive mode, Magic opening) may use `--lens-dur-slower` and the spring.

### 5.4 Reduced motion and performance

- Reduced motion (Windows "Animation effects" off, or the Lens setting) collapses durations to 1 ms and press scales to 1. Presses then show depth only through the fill step, so feedback stays.
- Budgets: p95 frame ≤ 16.7 ms at 60 Hz during any of the above; no animation may trigger layout or paint of large layers (no `filter: blur` on large layers, no `backdrop-filter` in new code).

### 5.5 How it is enforced

- [x] **UI kit primitives** (`src/ui/press` and the kit components) implement §5.2–5.3, so apps get the feel by using the kit, not by hand-writing `:active` rules.
  - [x] Tokens: `--lens-press-in` (70 ms), `--lens-press-release` (220 ms) / `--lens-press-release-heavy` (260 ms), `--lens-press-hold-min` (90 ms), `--lens-pending-delay` (300 ms), per-weight scale / travel / fill step / highlight, the light-pack fill direction, and their reduced-motion values (`src/styles/motion.css`, `src/ui/motion/tokens.ts`).
  - [x] `src/ui/press`: `installPress()` (one delegate per window, attributes only, no re-renders), `usePress()` / `pressProps()`, `data-weight` CSS with the minimum hold, keyboard presses, clean cancel, `pending` (sunk, spinner after 300 ms, no layout change) and no press when disabled.
  - [x] Kit: `Button` / `IconButton` (medium; primary and danger heavy; `pending`), `Toggle` (knob spring + 6 % squash), `Segmented` (sliding indicator, `useSlidingIndicator`), `Chip`, `Card` with `onClick` (heavy), `FlyoutClose`; fill sliders grow 1 px while grabbed (`data-grab`). Shared classes (`cc-btn`, `cc-chip`, `cc-nav-btn`, Quick settings tiles…) get their weight from `src/ui/press/weights.ts`; `global.css` no longer hand-writes `:active`.
  - [x] Flows (`src/ui/motion/flow.ts`, `origin.ts`): `growFrom` / `returnTo`, `staggerIn` (first 6), `swapIn` (6 px, forward/back), and pop-outs that grow from their trigger across windows (`data-opens` on the trigger, `useGrowFromTrigger` on the pop-out's content root; the native window is never resized). Applied to Settings page swaps, setup steps, and the Quick settings, Settings and Search pop-outs.
- **Guardrails:**
  - [x] a test fails when an interactive element in a migrated surface has no press weight or uses raw durations (`src/__tests__/feel.test.ts`, list in `tools/polish/feel-migrated.txt`);
  - [x] the parity rig renders a "feel" scene (each weight at rest, hover, pressed, pending, disabled; light and dark; toggles mid-press; the segmented indicator) — `tools/parity/feel`, goldens `feel-*` in `tools/parity/golden`;
  - [x] the perf rig measures press and flow frames (`feel-rapid-press`, `feel-settings-press`, `feel-popout-grow` in `tools/perf/run.mjs`).
- **Review:** every Fable pass checks its area against §5.1–5.4.

#### Adopting the feel (areas not migrated yet: Dock, Lens Browser, other apps)

1. Use the kit (`Button`, `IconButton`, `Toggle`, `Segmented`, `Chip`, `Card`) or put `data-weight="light|medium|heavy"` on each control (`usePress()` when it starts work, for `pending`). Delete the area's `:active` scale rules.
2. The Dock and Lens Browser windows opt out of class-based weights (`data-press-classes="off"` in `main.tsx`) so their pass decides; remove that line when the pass lands. Dock icons are **medium on click only**; magnification stays the Dock's own system (the press uses the separate `scale` / `translate` properties, so it composes with the magnify `transform`).
3. Pop-outs: add `data-opens="<surface label>"` to the button that opens one (Dock Quick settings, Settings and Search buttons still need it) and `useGrowFromTrigger(label, rootRef)` on the pop-out's root. In-window cards and panels use `growFrom(el, triggerRect)` / `returnTo(...)`.
4. Lists: `staggerIn(items)` on arrival; content swaps: `data-swap="forward|back"` on a `.lens-swap` root, or `swapIn(el, dir)`.
5. Add the area's files to `tools/polish/feel-migrated.txt` so the guardrail holds them.
