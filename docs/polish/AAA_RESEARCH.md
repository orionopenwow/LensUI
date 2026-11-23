# AAA polish research: the Lens polish vocabulary

What "triple-A" means for a desktop shell, distilled into values we can put in tokens and tests. Research done 2026-11-22: 24 lookups (searches plus page reads). Sources are listed at the end. Wording is paraphrased throughout. Each quote is under 15 words, with at most one quote per source.

**The short version:** Lens already has the right taste: one easing curve (`cubic-bezier(0.22, 1, 0.36, 1)`), 140–220 ms panels and a token system. What separates it from AAA is *consistency* and *finish*:

- 9 different easing curves;
- 147 hard-coded transitions spread over 14 durations;
- 94 distinct box-shadows;
- 1,002 inline `style={{}}` objects;
- 459 hex colours in TSX;
- icon-only controls with no name.

The fixes are vocabulary, primitives and a lint, not a redesign.

---

## 1. What the best teams agree on

| Theme | What the sources say | What it means for Lens |
|---|---|---|
| **Frequency decides motion** | Emil Kowalski: anything used 100+ times a day gets no animation, and tens of times a day means reduce it. Apple HIG: avoid motion on frequent interactions and let people cancel it. | Command open, Dock hover and Settings tab switch must be ≤160 ms or instant. Launch and theme switch can afford 250–400 ms. |
| **Ease-out for entering, never ease-in for UI** | Kowalski: ease-out for enter/exit, ease-in-out for on-screen moves, never ease-in. Microsoft: entrances use "fast out, slow in" (`cubic-bezier(0,0,0,1)`) and exits use "slow out, fast in" (`cubic-bezier(1,0,1,1)`). | Keep our out curve. Add a dedicated exit curve and a move curve. Ban the 8 other curves. |
| **Short is premium** | Microsoft control durations are 83 / 167 / 250 ms. Kowalski: press 100–160 ms, tooltip 125–200, dropdown 150–250, drawer 200–500, general UI under 300. | Five duration tokens: 80 / 140 / 180 / 240 / 360. The 1 s and 900 ms transitions are ambient only. |
| **Press feedback is physical** | Kowalski: scale 0.97 (range 0.95–0.98) on press, 160 ms ease-out. Never animate from `scale(0)`; start at 0.9–0.97 with opacity 0. Popovers grow from their trigger. | A global `:active` scale of 0.98 on buttons, Dock items and chips. Popovers use `transform-origin` from the anchor. |
| **Interruptible > pretty** | Kowalski: prefer CSS transitions over keyframes so a reversal mid-flight is smooth. Animate only transform and opacity. | Window open/close and Dock magnify use transitions on transform/opacity only. No `width`/`height`/`top` animations. |
| **Reduced motion ≠ no feedback** | Kowalski: keep opacity and colour, remove movement. Chrome's View Transitions docs make the same point ("reduced motion doesn't mean no motion"). | Today Lens collapses everything to 1 ms, and its probe enforces that. Tokens follow suit. Keeping 120 ms fades is a Wave E decision (see 2.1). |
| **Structure should be felt, not seen** | Linear's 2025 refresh: dimmer chrome so content leads, softer and fewer separators, a warmer and less saturated grey; their phrase is "Don't compete for attention you haven't earned." | Fewer borders in Settings cards. Hairline separators at 6–8 % ink. The sidebar sits one step dimmer than content. |
| **Do less, better** | Karri Saarinen's 10 rules: the spec is a baseline, quality is not perfection, be opinionated, reduce scope. | The wave plan cuts scope per wave and ships a quality bar (scorecard) rather than a feature count. |
| **Focus must be visible and unobscured** | WCAG 2.2: 2.4.11 Focus Not Obscured (AA). 2.4.13 Focus Appearance (AAA) asks for an indicator at least as large as a 2 CSS px perimeter at 3:1 contrast against the unfocused state. | Ring of 2 px solid `--lens-focus-ring` plus a 2 px offset. 3 px in High Contrast. Never clipped by `overflow:hidden` (use `outline`, not `box-shadow` inside clipped cards). |
| **Targets** | WCAG 2.2 2.5.8: at least 24×24 CSS px (with spacing exceptions). Fluent's compact density is 24 px and standard is 32 px. | `--lens-hit-min: 24px` everywhere. Primary actions are 32 px. Dock items are already ≥40. |
| **Sound is seasoning, opt-in** | Microsoft UX guide: use sound only with a clear benefit; when in doubt, don't. Never make it the sole channel. Keep it under 1 s, in 600 Hz–2 kHz, and softer for frequent events. Don't add an in-app volume control (use the mixer). | The sounds pack is **off by default**. It has 5 sounds (open, close, success, error, wake), each ≤400 ms, registered under the Lens mixer row, and never the only feedback. |
| **Optimistic UI with honest rollback** | The React 19 `useOptimistic` pattern and optimistic-UI guides: show the result immediately and reconcile; on failure, revert visibly and say why in place. | Toggles flip instantly. On backend error they spring back plus an inline error toast with Retry. This is the `Toggle` primitive's contract. |
| **Skeletons for layout, not for everything** | The skeleton-vs-spinner literature (Viget, uxdesign.cc, AWS Builder): skeletons reduce perceived wait for *content-shaped* loads in roughly 300 ms–3 s; under ~300 ms show nothing; for long jobs show progress. | `Skeleton` only after a 200 ms delay (no flash). Settings pages, Apps catalogue and Feeds use page-shaped skeletons. Over 3 s, show progress text. |
| **Theme switch without a flash** | View Transitions: the old view is a static snapshot and the new one is live. Rendering is blocked during the callback, so keep it tiny. Only one transition runs at a time. | Theme switch = `startViewTransition` crossfade of 240 ms, with a feature-detect fallback to a 160 ms opacity cover. Pack CSS vars are applied inside the callback, with no fetch inside it. |
| **Identity through restraint** | Nothing OS: monochrome, dot-matrix display type used sparingly, and one red accent. Raycast: dense, keyboard-first, a uniform 8 px rhythm. Vercel Geist: strict scale and tokens for everything. | One signature typeface moment (clock, numbers) and everything else quiet. Tabular numerals everywhere numbers change. |
| **Juice, carefully** | Game-feel literature ("juice"): layered, small feedback (scale, glow, particles, sound) makes actions feel alive. Too much hurts readability. | Signature moments (Wave D) are where juice lives. Everyday controls get only press scale and colour. |

---

## 2. The vocabulary (exact values)

### 2.1 Motion: `src/styles/motion.css`

| Token | Value | Use |
|---|---|---|
| `--lens-ease-out` | `cubic-bezier(0.22, 1, 0.36, 1)` | Default: enter, hover, state change (our existing curve) |
| `--lens-ease-in-out` | `cubic-bezier(0.65, 0, 0.35, 1)` | On-screen moves (tab indicator, reorder) |
| `--lens-ease-exit` | `cubic-bezier(0.4, 0, 1, 1)` | Leaving (close, dismiss). A softened version of Microsoft's exit curve. |
| `--lens-ease-drawer` | `cubic-bezier(0.32, 0.72, 0, 1)` | Drawers and sheets (iOS-like) |
| `--lens-ease-spring` | `linear(...)` approximation of a spring with bounce 0.2 | Dock magnify and the signature moments only |
| `--lens-dur-instant` | 80 ms | Colour and opacity on very frequent things (Dock hover tint, list hover) |
| `--lens-dur-fast` | 140 ms | Press, toggle knob, tooltip, chip |
| `--lens-dur-base` | 180 ms | Menus, popovers, tab content |
| `--lens-dur-slow` | 240 ms | Windows/panels open, theme crossfade |
| `--lens-dur-slower` | 360 ms | Signature moments, toast enter |
| `--lens-stagger` | 30 ms | List entrance stagger (cap 6 items, 180 ms total) |
| `--lens-press-scale` | 0.98 | `:active` on pressables |
| `--lens-enter-scale` | 0.96 | Starting scale for popovers and windows (never 0) |

**Reduced motion** (`prefers-reduced-motion: reduce`, or Lens's own "Animation effects off", `html[data-motion="off"]`):

- every duration token becomes `1ms`;
- the press and enter scales become `1`.

Lens already collapses *every* transition to 1 ms in global.css, and `tools/perf/reduced-motion.mjs` enforces that. We keep this strict policy for Wave A. The research case for keeping 120 ms fades (Kowalski, Chrome) is logged as a Wave E decision. It needs the reduced-motion probe to allow opacity-only transitions first.

### 2.2 Elevation: `src/styles/elevation.css`

Five levels, built on the existing `--lens-shade` depth multiplier so light packs stay soft:

| Token | Recipe (dark packs; light packs ×0.55 via `--lens-shade`) | Use |
|---|---|---|
| `--lens-elev-0` | none | Flat in-card rows |
| `--lens-elev-1` | 0 1px 2px α.18 | Cards, chips |
| `--lens-elev-2` | 0 4px 12px α.22, 0 1px 2px α.16 | Menus, popovers, toasts |
| `--lens-elev-3` | 0 12px 32px α.30, 0 2px 6px α.18 | Panels (Command, Quick Settings) |
| `--lens-elev-4` | 0 24px 64px α.42, 0 4px 12px α.22 | Modal windows, the launch bloom |

Each level also gets a 1 px inner hairline (`inset 0 0 0 1px rgb(var(--lens-ink)/0.06)`, an "edge light"). That is what makes glass read as glass on both light and dark backgrounds.

### 2.3 Focus

- **Ring:** `outline: var(--lens-focus-width) solid var(--lens-focus-ring); outline-offset: 2px`. Shown only on `:focus-visible`.
- **Width:** 2 px by default; 3 px in High Contrast and Windows forced-colours (already in tokens.css).
- **Inside clipped containers:** use `outline-offset: -2px` so the ring is never cut (WCAG 2.4.11).
- **Toggles and sliders:** the ring sits around the whole control, not just the knob.

### 2.4 Hit targets and spacing

- `--lens-hit-min: 24px` (WCAG 2.5.8);
- `--lens-hit: 32px` (default button and icon button);
- `--lens-hit-lg: 40px` (Dock and primary CTA).
- The spacing rhythm is 4 px, with 8/12/16/24 used for layout.
- Icon-only buttons are 28–32 px with a 16 px glyph.

### 2.5 Numbers

- `font-variant-numeric: tabular-nums` on anything that changes (percentages, clocks, counts, sizes, timers).
- Changing numbers cross-fade rather than roll. A roll is allowed only for the battery and the clock seconds, if at all.
- Units are a lighter weight with a thin space: "62 %" (not "62%"), and "1.2 GB".

### 2.6 Copy rules

- **Sentence case** for every label and button. **Verbs on buttons** ("Install", "Clean up", "Try again"), not "OK".
- **Errors** say what happened, why, and what to do: "Couldn't reach Ollama. Is it running? [Try again]".
- **Empty states** have one sentence on what goes here, one action, and no sad illustrations.
- **No native `title=` tooltips** (existing rule). Use `Tooltip`/`KeyChip`.
- **Numbers before nouns** in compact UI ("4 windows").
- **Keyboard hints** use `KeyChip` (Ctrl, Space), never raw text.

### 2.7 Sound (optional pack, off by default)

5 cues: wake, open, close, success and error.

- Length is ≤400 ms, in roughly the 600 Hz–2 kHz band, at −18 LUFS.
- Frequent cues (open/close) sit 6 dB under success/error.
- A cue never plays twice within 250 ms, and only the first of a burst plays.
- Sound is never the sole signal.
- Volume follows the Lens row in the Sound mixer; there is no extra in-app slider.

---

## 3. Benchmarks we hold Lens to

| Moment | Target | Source of the bar |
|---|---|---|
| Command palette open → first paint | ≤ 50 ms p95 (currently 50) | Raycast/Spotlight expectation |
| Settings tab switch | ≤ 33 ms p95 (currently 50) | One frame at 30 fps under 4× CPU throttle |
| Theme switch | ≤ 50 ms p95 of main-thread work (currently 83.4), no white frame | View Transitions snapshot |
| Press feedback | visible within 1 frame | Kowalski press guidance |
| Every interactive element | accessible name, ≥24 px target, visible focus | WCAG 2.2 AA (2.4.11, 2.5.8) |

---

## Sources

- Microsoft Learn: [Timing and easing](https://learn.microsoft.com/windows/apps/design/motion/timing-and-easing)
- [Fluent 2 Motion](https://fluent2.microsoft.design/motion)
- Microsoft Win32 UX guide: [Sound](https://learn.microsoft.com/en-us/windows/win32/uxguide/vis-sound)
- Emil Kowalski: [review-animations STANDARDS.md](https://raw.githubusercontent.com/emilkowalski/skills/main/skills/review-animations/STANDARDS.md)
- Apple HIG: [Motion](https://developer.apple.com/design/human-interface-guidelines/motion)
- W3C: [What's new in WCAG 2.2](https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/)
- Linear: [Behind the latest design refresh](https://linear.app/now/behind-the-latest-design-refresh) and [How we redesigned the Linear UI](https://linear.app/now/how-we-redesigned-the-linear-ui)
- Figma blog: [Karri Saarinen's 10 rules for crafting products that stand out](https://www.figma.com/blog/karri-saarinens-10-rules-for-crafting-products-that-stand-out/)
- Chrome for Developers: [Same-document view transitions](https://developer.chrome.com/docs/web-platform/view-transitions/same-document)
- MDN: [Using the View Transition API](https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API/Using)
- Viget: [A Bone to Pick with Skeleton Screens](https://medium.com/viget-collection/a-bone-to-pick-with-skeleton-screens-eb006536ca1c)
- uxdesign.cc: [What you should know about skeleton screens](https://uxdesign.cc/what-you-should-know-about-skeleton-screens-a820c45a571a)
- [Optimistic UI (interaction craft)](https://camoa.github.io/dev-guides/js/interaction-craft/optimistic-ui) and [React 19 useOptimistic](https://dev.to/uaslimcreate/react-19-useoptimistic-for-instant-ui-feedback-building-confidence-in-ai-feature-interactions-4jp1)
- [Nothing Design System (shadcn)](https://www.shadcn.io/design/nothing) and [Nothing brand guidelines](https://madegooddesigns.com/nothing-brand-guidelines/)
- [Raycast design guide](https://blakecrosley.com/guides/design/raycast)
- [Vercel Geist](https://vercel.com/geist)
- Toptal: [UX sounds guide](https://www.toptal.com/designers/ux/ux-sounds-guide)
- Material 2: [Applying sound to UI](https://m2.material.io/design/sound/applying-sound-to-ui.html)
- Game juice: [arXiv 2011.09201](https://arxiv.org/abs/2011.09201)
