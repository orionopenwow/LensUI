# AAA audit: every Lens surface and Settings page

**Method.** On `main@5a4a5b2` I rendered every surface and gallery in **Obsidian** and **Alabaster Daylight** with the parity harness:

- 22 main surfaces;
- 80 Settings-hub shots (20 pages × 2 sizes × 2 packs);
- the galleries for Command (44 scenes), AI (38 states), Browser (28), Snip, Productivity, Tester, Guide, Magic, Presence, Agent safety, Styles, Music, Apps, Ambient and Approval.

All of them rendered without errors. On top of the screenshots, a static code survey:

| Metric | Count |
|---|---:|
| Hard-coded `transition:` declarations | 147 |
| Distinct durations | 14 (60 ms → 1 s) |
| Easing curves | 9 |
| Distinct `box-shadow` recipes | 94 |
| Inline `style={{}}` objects | 1,002 |
| Hex colours in TSX | 459 |
| Toast implementations | 12 |
| Skeleton components | 0 |
| Shared empty-state components | 0 |

The accessibility allowlist still carries F4 (switches and chips without names) and F5 (nested interactive controls).

**Scoring.** Each surface is scored 1–5 on six axes, and the AAA bar is a 4+ on every axis:

- **V**isual: hierarchy, density, token use;
- **M**otion: consistency, feel;
- **F**eedback: press, loading, error, empty;
- **A**ccessibility: names, focus, targets;
- **P**arity: light and dark both look designed;
- **C**opy.

## Scorecard

| Surface | V | M | F | A | P | C | Notes |
|---|---|---|---|---|---|---|---|
| Command (full/compact/slash/thread/tool/clipboard) | 5 | 4 | 4 | 4 | 4 | 5 | The best surface: dense, keyboard-first, `KeyChip` footer. Cold-start replay race (e2e retry). |
| Command Mini / Edge shelf | 4 | 4 | 3 | 4 | 4 | 4 | Its own toast style differs from the Dock's |
| AI Ask / Dock AI | 4 | 4 | 4 | 4 | 4 | 4 | The error state is good. The streaming caret uses its own easing. |
| Dock | 4 | 3 | 3 | 4 | 4 | 4 | 17 hard-coded transitions. Magnify is linear-ish, not springy. No press scale. |
| Top Bar | 4 | 3 | 3 | 3 | 4 | 4 | 10 transitions. Icon-only tray buttons depend on aria from the parent. |
| Quick Settings | 3 | 3 | 3 | 2 | 3 | 4 | Sliders are saturated colour slabs (olive/blue) that dominate the panel, and their fill hue differs per row. F5 nesting. |
| Launcher | 3 | 3 | 3 | 3 | 4 | 4 | Generic window glyph for every app in the parity mock. Folder counts low-contrast (F6). |
| Palette | 4 | 3 | 3 | 3 | 4 | 4 | Recents age contrast (F6) |
| Overview | 3 | 3 | 3 | 2 | 4 | 4 | The red close badge overlaps the card corner. Cards are buttons containing buttons (F5). |
| Widgets drawer | 3 | 3 | 2 | 2 | 4 | 4 | Icon buttons with no names (F4). The empty "Quick notes" well has no empty-state copy. |
| Notifications | 4 | 3 | 3 | 4 | 4 | 4 | Fine. Toast enter doesn't match the other 11 toasts. |
| Desktop folder | 4 | 3 | 3 | 4 | 4 | 4 | — |
| Wallpaper / Ambient | 4 | 4 | — | — | 4 | — | The Aurora scene is the perf hot spot (66.6 ms p95) |
| Browser | 4 | 3 | 3 | 4 | 4 | 4 | Its own toast |
| Snip / Studio | 4 | 4 | 3 | 4 | 4 | 4 | Its own toast ×3 |
| Music | 4 | 4 | 3 | 4 | 4 | 4 | — |
| Lens Apps | 3 | 3 | 2 | 4 | 4 | 4 | No skeleton while the catalogue loads; the grid pops in |
| Feeds & Messages | 3 | 3 | 2 | 3 | 4 | 4 | Spinner-only loading. The bridge URL input is very low-contrast. |
| Guide / coach marks | 4 | 4 | 4 | 4 | 4 | 5 | — |
| **Settings hub** shell | 4 | 3 | 3 | 2 | 4 | 4 | Tab switch is 50 ms p95. No page skeleton. F4 toggles. |
| ↳ Appearance | 4 | 3 | 3 | 2 | 4 | 4 | Swatch chips have no names (F4). The theme tiles in light are tiny next to the current theme. |
| ↳ Dock & Bar | 4 | 3 | 3 | 4 | 4 | 4 | — |
| ↳ Desktop | 4 | 4 | 3 | 4 | 3 | 4 | In light, the thumbnails of dark scenes read as holes |
| ↳ Windows & Keys | 3 | 3 | 3 | 2 | 4 | 3 | A wall of 8 toggles with long descriptions and no grouping; copy says "Enabled by default via HKCU\...Run" |
| ↳ AI & Command | 4 | 3 | 3 | 2 | 4 | 4 | Provider "Test" buttons are tiny (~20 px) |
| ↳ Display | 3 | 3 | 3 | 2 | 3 | 4 | The Brightness and Warmth sliders are full-width solid slabs; in light, a 100 % black bar |
| ↳ Sound | 3 | 3 | 3 | 2 | 3 | 4 | Same black-slab sliders in light. Per-app rows nest buttons (F5). |
| ↳ Network | 4 | 3 | 3 | 4 | 4 | 4 | "Disconnect" (destructive) has the same weight as "Connect" |
| ↳ Power | 4 | 3 | 3 | 4 | 4 | 4 | — |
| ↳ Apps & Startup | 4 | 3 | 3 | 2 | 4 | 4 | Startup toggles without names |
| ↳ Storage | 4 | 3 | 3 | 4 | 4 | 4 | The usage bar colours (orange/red/black) don't come from tokens |
| ↳ Focus | 3 | 3 | 3 | 4 | 4 | 4 | Two-thirds of the page is empty: no empty state or illustration |
| ↳ Privacy | 4 | 3 | 3 | 4 | 4 | 4 | — |
| ↳ Notifications | 3 | 3 | 3 | 3 | 4 | 3 | Channel chips use coloured dots plus text, which is noisy. The bridge input is low-contrast. |
| ↳ Gaming | 3 | 3 | 3 | 4 | 4 | 4 | Sparse page |
| ↳ System & Tasks | 4 | 3 | 3 | 3 | 4 | 4 | Row icon buttons are 22 px (below the 24 px minimum) |
| ↳ Time & Language | 4 | 3 | 3 | 4 | 4 | 4 | — |
| ↳ Update | 4 | 3 | 3 | 4 | 4 | 4 | — |
| ↳ Accessibility | 4 | 3 | 3 | 4 | 4 | 4 | — |
| ↳ About & Testing | 4 | 3 | 3 | 4 | 4 | 4 | — |

**Averages:**

| Axis | Average |
|---|---:|
| V | 3.7 |
| M | 3.1 |
| F | 2.9 |
| A | 3.3 |
| P | 3.9 |
| C | 4.0 |

Motion and Feedback are the weakest axes and the cheapest to lift, because they are systemic, not per-page.

## Top 50 issues (ranked by reach × severity)

**Systemic (fix once, lifts everything)**

1. **No motion vocabulary.** 147 hand-written transitions, 14 durations and 9 curves, so surfaces feel like different apps. Fix: tokens (Wave A).
2. **No elevation scale.** 94 shadow recipes, so the same "card" floats at different heights across surfaces. Fix: tokens (Wave A).
3. **No shared primitives.** `cc-toggle` is re-declared in 15 components, with `aria-label` present in 4. Fix: `src/ui` (Wave A).
4. **F4:** switches without accessible names in Settings, Widgets and Setup. Critical axe rule.
5. **F5:** nested interactive controls in Quick Settings sliders, Settings sliders and Overview cards.
6. **12 toast implementations** with different positions, durations and enter motion. Fix: one `Toast` plus a `toast()` bus.
7. **No skeletons anywhere.** Settings pages, Apps and Feeds pop in after loading.
8. **No empty-state component.** Focus, Gaming, Widgets notes and Feeds with no channels are just blank space.
9. **No press feedback.** Buttons don't respond on `:active` (no scale), so clicks feel dead next to Command.
10. **Numbers jitter.** Only 67 `tabular-nums` usages; Quick Settings %, Storage sizes and Stats CPU/RAM shift width as they update.
11. **1,002 inline style objects and 459 hex colours in TSX** bypass tokens, so packs can't reach them. Fix: lint baseline + ratchet.
12. **Theme switch** costs 83 ms p95 of main-thread work with 6 long tasks and shows a hard cut, with a white frame on dark→light in WebView2.
13. **Settings tab switch** is 50 ms p95 with 10 long tasks: the whole page body re-mounts with no transition.
14. **Window open/close motion** differs per surface (Command scales from 0.96, Quick Settings slides 8 px, Launcher fades, Overview pops).
15. **Command cold-start replay race.** The first `command:open` can arrive before the listener mounts, and e2e hides this with a 3-attempt retry.

**Surface-specific**

16. Quick Settings sliders are saturated colour slabs, with a different hue per row (olive brightness, blue volume, teal Spotify).
17. Settings Display/Sound sliders in Alabaster are 100 % black slabs and the heaviest element on the page.
18. Overview close badge: a red circle that overlaps the card corner and reads as an error.
19. Windows & Keys is a wall of 8 toggles with no grouping, and the copy leaks registry paths.
20. The Focus page is two-thirds empty.
21. The Gaming page is sparse, with no explanation of what Lens pauses.
22. Appearance accent swatches have no names (F4), and the selected state is only a ring.
23. Appearance theme tiles are small in light; the selected tile is distinguished only by a border.
24. Network: destructive "Disconnect" has the same visual weight as "Connect".
25. System & Tasks row actions are 22 px targets (below the 24 px minimum).
26. AI & Command provider "Test" buttons are ~20 px.
27. Storage usage bars use raw orange/red/black, not the status tokens.
28. Notifications channel chips (coloured dots) are noisy, and the bridge URL input is low-contrast.
29. Launcher folder counts and hint are low-contrast (F6).
30. Palette recents age is low-contrast (F6).
31. Widgets "Quick notes" is an empty well with no hint.
32. Widgets icon buttons have no names.
33. Dock magnify uses ease-out on `transform` with no spring, so it feels mechanical next to macOS.
34. The Dock has no press scale; the launch has no acknowledgement until the window appears.
35. Top Bar tray hover tints use 3 different durations (120/140/160).
36. Feeds loading is a spinner only, with no structure.
37. Apps catalogue: the grid pops in without a skeleton, and the tiles are letter placeholders.
38. Snip: three local toasts with different durations.
39. Browser: a local toast style.
40. Mini/Edge shelf toast differs from the Dock's.
41. Settings sidebar and content have equal brightness, so nothing says "content leads".
42. Settings card borders are on every card *and* on the rows inside it, which doubles the lines.
43. Section headers in Settings are inconsistent sizes (11 px caps vs 13 px bold).
44. Error states differ: some are red text inline, some a red banner, some only a toast.
45. "Open in Windows Settings ↗" buttons are styled differently across pages.
46. Desktop page: in light, the thumbnails of dark scenes read as holes and need a frame.
47. The Setup Wizard disabled toggle uses `aria-disabled` and `disabled` with no explanation visible to sighted users.
48. Keyboard hints in Settings are raw text, where Command uses `KeyChip`s.
49. Focus ring is cut off inside a few `overflow:hidden` cards (theme tiles, Playground thumbnails).
50. Reduced-motion has no *designed* alternative: everything snaps (accepted for now; see Wave E).

## Top 10 (what to do first)

1–3 (tokens and primitives) unlock 6–14. 4–5 are critical accessibility issues. 12–13 are the two perf scenarios with headroom. 15 is a real race hidden by a test retry.
