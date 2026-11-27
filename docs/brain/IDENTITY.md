# Lens identity: mission, brand and design philosophy

The single source for what Lens stands for, how it looks and sounds, and the promises it keeps. Every surface, doc, site page and agent follows it. Detailed specs live elsewhere and are linked; when they disagree with this page, this page wins and the spec gets fixed.

| | |
|---|---|
| Owner | The maintainer (decisions); agents keep it current |
| Last reviewed | 24 November 2026, `main` after 0.3.0 (#78) and #79–#81 |
| Related | [`DESIGN.md`](../../DESIGN.md) (surface specs), [`AGENTS.md`](../../AGENTS.md) (binding safety contract), [`docs/VISION.md`](../VISION.md) (the unified-desktop thesis), [FEATURES.md](FEATURES.md) (everything Lens does and could do) |

How to update: change this page in the same PR as the decision (a new colour rule, a naming change, a pricing decision). Mark anything not yet decided as **open**, never as settled. Bump "Last reviewed".

---

## 1. Mission

**Make Windows calm, beautiful and yours, with an assistant you can trust, for free.**

Lens is one coherent desktop (docks, top bar, themes, windows, wallpapers, pointers, a command layer, a browser and small apps) in one design language, with AI that acts only where you can see it and only with your OK.

### The promises (non-negotiable)

1. **Free and open source.** MIT licensed ([LICENSE](../../LICENSE)). Every part can be built from source. Nothing that keeps you safe (approvals, agent checks, Remove all, the failsafe) is ever paid or locked.
2. **Local-first and private.** The offline command engine answers what it can without a model; local models come next; cloud models (Claude) only when you choose. No ambient capture: no background screenshots, no "remember everything" timeline. Nothing is uploaded without a step you take (bug reports open a pre-filled GitHub issue; they are never sent silently).
3. **Reversible.** Every change Lens makes to Windows is recorded in the change registry and undone by **Settings › About › Remove all Lens changes**. Deletions go to the Recycle Bin first. A crash never leaves you without a taskbar.
4. **Off by default.** Every feature that changes Windows, writes outside Lens's own folder, or listens (voice, Explorer menu entries, Windhawk styling, Start with Windows, shell mode) starts off. Default experience: the floating dock and the default theme, nothing else changed.
5. **You approve what matters.** Anything that sends, submits, books, pays, deletes or signs in stops on one "Needs your OK" card showing exactly what will happen. Pages, files and transcripts are data, never instructions.
6. **Games and anti-cheat are left alone.** No hooks or overlays in anti-cheat processes or fullscreen games; optional in-process styling skips every name on Lens's anti-cheat list.
7. **No dark patterns.** No nagging, no fake urgency, no hidden opt-outs, no telemetry by default, no ads.
8. **Honest copy.** We only claim what is built and checked. "Not yet confirmed on a real PC" is said out loud ([CHANGELOG](../../CHANGELOG.md)).

### How it stays free (decided vs open)

| | Status |
|---|---|
| Lens itself free and open source, forever | **Decided** |
| Safety features never paid | **Decided** |
| Supporter tier (GitHub Sponsors / Ko-fi, name in credits, early betas, ~$3–5/month) | **Open**: proposed in the launch plan, not set up |
| Founder pack (exclusive theme packs + backdrop set, free for everyone after 6 months, ~$15 one-time) | **Open**: proposed for 1.0, prices untested |
| Marketplace tips to pack creators (Lens takes nothing at first) | **Open**: after a marketplace exists |
| Lens Cloud sync (end-to-end encrypted, ~$2–4/month) | **Open**: only if people ask |

Prices above are starting suggestions from the launch plan, not researched figures. Rule for any future stream: it adds something optional; it never removes or gates something that exists.

---

## 2. Naming

- The product is **Lens**. Not "Lens UI" in anything a person reads. (Technical names stay: repo `orionopenwow/LensUI`, `%APPDATA%\LensUI`, `lens-ui.exe`, the bundle id and the install folder, because renaming them would lose settings or install a second copy. The installer's display name moves together with an installer migration before a signed 1.0.)
- The AI is also just **Lens** ("Ask Lens", "Lens is working on it"). Not "Lens Guide", not a persona name. The help system is **the Guide**.
- Family members keep the prefix: **Lens Browser, Lens Music, Lens Cleaner, Lens Apps, Lens Feeds, Lens Messages, Lens Notes, Lens Snip**. Tools with their own names: **Backdrop Lab**, **Command**, **Shelf**, **Magic** (the right-click menu), **Redline** (planned review tool).
- **Open:** whether other first-party apps (e.g. the TradingView rewrite as "Lens Trade") join the family on the site.
- **Maker: Campton.** Lens launches under its maker's own name, **Campton**, together with Campton's other products (**Tribe Code**, **ThumbDesk**). It is written "Lens, made by Campton" in the About page, the site footer and the README. *Decided 26 November 2026.* The brand architecture, the projection ideas and what is still open (Tribe Code's description, a Campton GitHub organisation, "Lens Desktop" as a descriptor) are in [COMBINATOR.md §3](COMBINATOR.md#3-brand-projection-lens-by-campton).

---

## 3. Brand and aesthetic

### 3.1 The look in one line

**Matte, minimal, monochrome chrome, with one rainbow moment.**

- **Obsidian monochrome chrome.** Lens's own surfaces are near-black (`#09090b`) or near-white (`#fafafa`) with hairline borders (`rgb(255 255 255 / 0.08–0.14)` on dark). Matte, not glossy: depth from a faint top highlight and hairline, never from glare, heavy gradients or neon.
- **Colour is earned.** It appears only in: full-colour app icons (never greyscale them); the person's accent on things that are *on* (a filled icon chip on a Quick settings tile, an active tab); semantic meaning (urgent/attention, danger); the window buttons; and the Lens cloud.
- **The Lens cloud is the one colour moment.** The logo's billowing rainbow nebula (six hues: red, gold, green, cyan, violet, magenta, `src/styles/lens-cloud.css`) marks "Lens is here": the orb, the AI's presence, the Lens row in menus, the faint Lens glow behind the browser's search box. It billows; it never spins or flips.
- **Window buttons: Yellow · Green · Red** by default (minimise, maximise, close), with Green · Yellow · Red and Red · Yellow · Green (Mac) as options. They sit directly on the title bar: never on a strip or box of their own.
- **Themes change colour and material, not layout.** Switching theme never moves or resizes anything.

### 3.2 Typography

- Lens type: `"Arial Rounded MT Bold"`, `"Segoe UI Variable"`, system UI. Mono (for keys, paths, numbers in tables) in small caps-height labels.
- Tabular numbers everywhere numbers update (clocks, percentages, meters).
- Hierarchy: titles 13–22 px semibold; section labels 11 px, uppercase, letter-spaced, secondary colour; body 12–12.5 px; metadata 10.5–11 px.
- Strong type and spacing replace boxes, lines and labels.

### 3.3 Iconography

- Lucide-style line icons, bold strokes (~2–2.6), no bubbles or double borders around standalone utility icons.
- Icon chips (26 px, 8 px radius, matte fill + hairline) only where an icon names a control (Quick settings tiles); filled with the accent when that control is on.
- App icons keep their own colours. Dock attention uses Windows-orange by default.
- Lens's own app icons are one set (`src/icons/lensApps.ts`, DESIGN.md §3.7): a bold white glyph on a plain matte tile, no effects. Lens Browser alone wears the Lens logo; the rainbow logo is otherwise kept for brand moments, not app icons.

### 3.4 Motion

- **Transform and opacity only.** No animating width, height, top/left or layout; no native window resizes mid-animation. One motion system: `src/ui/motion` (glide, usePresence, FLIP) and the duration/easing tokens (`--lens-dur-*`, `--lens-ease-*`). A lint (`bun run lint:motion`) blocks regressions.
- **Quick slides, never snaps.** Panels glide in and out (~180–220 ms ease-out); the dock slides away on auto-hide and the window hides only after the slide ends; interrupted motion reverses from where it is.
- **Settle, don't bounce** — except one deliberate bounce: an app asking for attention, once.
- **Light to look at, weighty to touch.** Presses sink and spring back with weight (three press weights: light, medium, heavy); everything that opens grows from what opened it. The binding spec is [`DESIGN.md` §5.1–5.5](../../DESIGN.md#5-motion--feel).
- **Reduced motion respected** (Windows "Animation effects" off or the Lens setting): motion collapses to instant, nothing loops.
- Budgets: p95 frame ≤ 16.7 ms at 60 Hz, no frame over 33 ms during an animation; tested by the perf and smoothness rigs.

### 3.5 Geometry

- Flyouts that come off a bar or dock are **one shape** with it: no seam, no double edge, rounded only on the outer corners.
- Window roundness 0–20 px (8 px default, matching Windows 11); window opacity 40–100 %.
- Hit targets ≥ 32 px; every pop-out has the same small × (top-right) and closes on Esc and click-outside.

### 3.6 Copy voice

Plain, short, honest. Say what happens and what it changes ("Moves 2.3 GB to the Recycle Bin"), not marketing. No exclamation marks, no "Oops", no "simply". British-neutral spelling in the app ("colour") is fine; be consistent per surface. Name things by what people call them, not by internal ids.

---

## 4. Design principles, with do and don't

| Principle | Do | Don't |
|---|---|---|
| One desktop, one language | Same row, chip, slider and × everywhere | A new control style per feature |
| Simple first, depth on demand | Simple/Advanced in Settings; extras behind "More" | Every option on the first screen |
| Show, then ask | Preview what a change will do; one primary button | Apply on hover; three equal buttons |
| The real thing, not a mock-up | The site demo runs the real surfaces on sample data | Hand-drawn demo windows that don't match the app |
| Quiet by default | Badges only when something needs you | Counters and pulses for their own sake |
| Reversible everything | "Undo" next to every result; Remove all covers it | One-way changes, or undo hidden in a menu |
| Robust by construction | One owner of each state; reconcile with the real window; timeouts and fallbacks | Flags that can disagree; "should never happen" branches |
| Native-feeling on Windows | Taskbar style at Windows proportions; honour light/dark and accent | Fighting the OS (stealing focus, nonstandard keys) |
| Measured, not guessed | Rigs for parity, theme switching, perf, failsafe | "Looks fine on my machine" |

---

## 5. Safety contract on one page

Binding text: [`AGENTS.md`](../../AGENTS.md). In short:

1. No deleting, overwriting or moving files outside `%APPDATA%\LensUI` without explicit confirmation.
2. Every OS change is one-click reversible, registered in `src-tauri/src/changes.rs`, and undone on Remove all (checked by `node tools/changes/check.mjs`).
3. No secrets in logs, exports or reports (the report preview is built and redacted in Rust).
4. No hooks or overlays in anti-cheat processes or fullscreen games.
5. Ask before shell commands or system settings when intent is unclear; every agent path goes through `agentsafe::gate` and the one approval card.
6. Visual rules: monochrome chrome, full-colour app icons, roundness and opacity in range, no native `title=` tooltips.

---

## 6. The modern rewrite (what "built right" means now)

Lens was rebuilt from late-November 2026 onward around a few shared systems. New work uses them; old code moves onto them when touched. Details and status in [FEATURES.md › Foundations](FEATURES.md#foundations-the-modern-rewrite).

- **One motion system** (`src/ui/motion`, tokens, motion lint).
- **Failsafe** (error boundary per surface, renderer watchdog, crash-loop guard and Safe Mode, circuit breakers, config validation).
- **One input service** (`src-tauri/src/input.rs`), **one settings writer** (`config::write_config_file`), **one clipboard history** (`clip/`), **one change registry** (`changes.rs`), **one approval card**.
- **Measured quality**: parity scenes, golden images, the theme-switch rig, the caption parity rig, perf budgets, a11y, chaos and soak tests, real-Windows E2E.
