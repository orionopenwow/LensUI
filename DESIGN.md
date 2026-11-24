# Lens — Living Design Document

> **Purpose:** Single source of truth for Lens's visual language, motion physics, surface geometry, and interaction patterns. Every surface (`TopBar`, `Dock`, `QuickSettings`, `ControlCenter`, `CommandPalette`, `WidgetDrawer`, and native Win32 overlays) must follow this document so the shell feels unified, intentional, and cohesive.

---

## 1. Core Aesthetic Philosophy

- **Obsidian Monochrome Chrome:** Lens's own chrome is permanently monochrome Black & White (`#09090b` obsidian surfaces, `#fafafa` high-contrast foreground, `rgb(255 255 255 / 0.08–0.14)` hairline borders).
- **Intentional Color:** Color is reserved strictly for:
  1. Full-color application icons in the Dock (**never** strip color or apply monochrome filters to app icons).
  2. Minimal semantic accents on active quick-control tiles and fill bars (Volume blue `#60A5FA`, Night Mode amber `#FBBF24`, Audio cyan `#38BDF8`, Power emerald `#34D399`).
  3. The user's live Windows DWM accent color (configured via the Color Wheel — drives Windows titlebars/borders/folders, never pollutes Control Center's own B&W chrome).
  4. Traffic-light window controls (**Green `#28C840` · Yellow `#FEBC2E` · Red `#FF5F57`**).
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
- Default order: **Green (Maximize) · Yellow (Minimize) · Red (Close)**, left-to-right.
- Proportions: `11.5px–12px` diameter (`5.75px` radius) with `20px` center-to-center spacing (`8px` gap), scaled per-monitor by DPI, matching Control Center's own traffic lights.
- Rendered natively on Lens windows and across **all visible third-party Windows apps** via the Multi-Window Z-Ordered Win32 Caption Pool (`win_caption_engine.rs`) with occlusion-safe titlebar pixel matching and true per-window Z-order (no bleed-through).

### 3.6 Control Center & First-Run Setup Wizard
- **Unified Theme Control Array:** Color Wheel sits on the left (`212px`), paired directly inside the same card with the 3 brushed-metal rotary knobs on top and the Icon Style & Icon Shape chips tucked right beneath a `1px` hairline divider — zero dead vertical whitespace.
- **Obvious Left-Pane Navigation:** Plain-English, scannable labels (`Theme & Look`, `Bottom Dock`, `Top Bar`, `Window Buttons`, `Folder Icons`, `Virtual Desktops`, `Widgets & Stats`, `Taskbar & Startup`, plus `Setup Wizard` & `Quit Lens`).
- **Startup Setup Wizard (`SetupWizard.tsx`):** Greets first-run users (`onboardingCompleted === false`) and is re-launchable anytime from the sidebar. 5 live-preview steps: *Welcome → Pick a look (6 recommended packs) → Pick a Dock (Floating, Slim, Taskbar, Split) → Work with Windows (hide taskbar, start with Windows) → Done (summary, self-test, where settings live)*. Every step can be skipped (skipping also undoes that step's changes), Back always works, Alt+←/→ change step and Esc leaves.
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

- **Primary Easing:** `cubic-bezier(0.22, 1, 0.36, 1)` (fast crisp start, silky deceleration, zero overshoot bounce).
- **Durations:**
  - Micro hover/scale: `140ms–160ms`.
  - Panel flow-out & flick transitions: `180ms–220ms`.
  - Auto-hide bar slide: `220ms`.
- **Feedback:** Every clickable element has an immediate hover state and clear cursor (`pointer` / `grab` / `grabbing`). No dead clicks, no layout shifts, and **no ugly native HTML `title="..."` browser tooltips** (use `aria-label` or custom obsidian pills only where needed).
