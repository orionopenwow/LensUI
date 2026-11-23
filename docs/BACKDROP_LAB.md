# Backdrop Lab

Lens Studio's background maker: animated gradients, light, glass and pattern looks that you can play as a
**live wallpaper**, turn into a **theme**, or export as a **still or seamless video loop**. It is Lens's own
take on in-browser gradient generators. The engine, shaders, looks, presets and names are written for Lens
from scratch; no code, shaders, presets or assets were taken from any other product.

- **Open it:** Settings › Appearance › Creator (compact), then **Open Backdrop Lab**, which opens the full
  `Lens Studio` window (`?surface=studio`, built on first open).
- **Code:** `src/studio/backdrop/` (engine in `engine/`, UI in `ui/`), the wallpaper scene in
  `src/studio/backdrop/scene.ts`, and exports in `src-tauri/src/studio/`.
- **Tests:** `src/__tests__/backdrop.test.ts` (bun) and `tools/parity/backdrop/` (headless WebGL: compile,
  NaN, loop seam, blank frames, switch flash, screenshots).

## 1. Engine (framework-free)

`engine/` has no React and no Tauri. The Lab, the wallpaper, thumbnails, exports and (later) the website all
run the same code on the same **state object**, so what you see in the Lab is exactly what plays on the
desktop.

| File | What it does |
| --- | --- |
| `state.ts` | The single serialisable `BackdropState` (look, palette, shape, motion, grade, effects, handles, optional layer); `normaliseState` never trusts input; share codes (`LBG1.…`), `lens://studio/backdrop?s=…` links, `.lensbg` files, a CSS fallback. |
| `color.ts` | sRGB ↔ linear ↔ OKLab ↔ OKLCH, gamut mapping, the 256-entry gradient LUT (blend space, bias, sharpness), WCAG contrast, harmonies, hex-list parsing, k-means palette extraction, layer blend reference. |
| `modes.ts` | 29 looks, each an original GLSL `look(p, uv)` returning *(t, glow, shade)*, with its own controls and on-canvas handles. |
| `glsl.ts` | Shared shader library (integer hash, quintic gradient noise with optional x-period, fbm, domain warp, cells), the look `main`, and the finishing pass. |
| `renderer.ts` | WebGL2 pipeline: look → texture A (+ layer → B) → finish (crossfade snapshot, layer blend + mask, chromatic edge, bloom, grade, filmic tone, vignette, grain, dither) → canvas. Parallel shader compile, swap only when ready, context-loss recovery. |
| `clock.ts` | Wall-clock scene time with capped gaps; loop phase; export frame times. |
| `presets.ts` | 43 original presets + one per built-in theme pack (18). |
| `inspire.ts` | Mood-steered Inspire with locks; words → backdrop (“make me a calm blue aurora backdrop”); adjustments (“slower and more purple”). |
| `living.ts` | State interpolation, time-of-day keyframes, playlists, bounded “evolve”, gentle system reactions. |
| `theme.ts` | Backdrop → readable custom pack (text ≥ 4.5:1, accent ≥ 3:1). |
| `thumbs.ts` | Live thumbnails from one shared GPU context. |

### Colour

Every look outputs a scalar *t*; colour comes from one LUT baked on the CPU in the chosen space
(sRGB, Linear, OKLab, OKLCH with shortest-arc hue and chroma-reducing gamut mapping). Bias is a gamma on
*t*, sharpness narrows each blend zone. Glow adds the brightest stop's colour. The LUT is tested without a
GPU.

### Seamless motion

- The scene phase is `2π · frac(t / loop)`. Looks only use **whole multiples** of the phase, circular paths
  through noise space (`orbit(k, φ)`, radius from Flow speed), or x-periodic noise shifted by exactly its
  period. So frame *loop* equals frame 0 for every look and preset (checked in CI: worst seam 0.000/255).
- Grain and dither patterns are indexed by loop time too, so exported loops repeat bit-for-bit.
- Time follows the wall clock (a dropped frame never slows motion) and any gap longer than 0.25 s is
  capped, so pause/resume, sleep and hidden windows continue from the same moment instead of snapping.

## 2. The looks

| Family | Looks |
| --- | --- |
| Soft | Mesh (orbiting blobs + domain warp), Bands, Plasma, Smoke |
| Light | Rays, Bokeh, Eclipse, Horizon glow, Prism band, Edge glow, **Light beam** (centre + direction handles, softness ring), Light tunnel |
| Nature | Curtains (vertical luminous folds), Caustics, **Window light** (procedural frame + leaf shadows), **Sea horizon** (sun/moon + glitter path), Pixel landscape (8-bit clouds and islands), Planet arc, **Lens nebula** (signature, first-run default) |
| Pattern | Marble, Cells, Kaleido, Halftone (dot-screen falloff), Bevelled tiles (movable spotlight) |
| Glass | Ribbed glass, Crystal (bevelled shards lit from a handle), Motion streaks (with Chromatic edge) |
| Photo | Glass over photo, Gradient-map photo (your picture stays on this PC) |

Every look has generic, descriptive names and its own controls (`a`–`d`), plus the shared Shape
(scale, softness), Motion (warp, speed, loop length), Grade (brightness, contrast, saturation, exposure,
filmic tone) and Effects (grain fine/film/paper, vignette, bloom, chromatic edge, blue-noise or ordered
dither, on by default to remove banding).

## 3. The Lab

- **Top bar:** prompt box (new look or adjustment), **Inspire** `I` with a mood popover (calm↔energetic,
  cool↔warm, minimal↔rich) and locks, Undo/Redo (`Ctrl+Z` / `Ctrl+Shift+Z`), **Save** `S` (to *Mine*),
  **Fit** `F` (fill / 16:9 frame), **Export** `E` (primary).
- **Left:** Looks / Presets / Mine with live thumbnails (hover plays), search, and filters for family,
  motion and colour temperature.
- **Centre:** the live canvas with handles (hover / always / off; Shift snaps; arrow keys nudge), A/B
  **Compare** `C` with a draggable divider, **In context** (Top Bar, a window and the Dock over the
  gradient, with a readability warning), pause `Space`, and a history strip of the last 30 looks.
- **Right:** Basic (look, colours, speed, warp, grain) or Advanced (everything) controls. Sliders: drag,
  arrows (Shift ×10), scroll to fine-tune, double-click to reset, click the value to type. Colours: swatch
  grid, Randomize, From image, From theme, harmony generator, hex paste, a draggable stops bar, blend-space
  segmented control. Every section has a reset.
- **Bottom of the stage:** **Set as live wallpaper** (headline), **Try 10 s** (reverts unless you keep it),
  **Still**, and **Make a theme**. Every change shows a toast with **Undo**.
- **First run:** a three-step coach mark; it never shows again once dismissed.
- **Compact:** under 1100 px the controls become a sheet; the window's minimum width is 900 px.
- **Accessibility:** everything is reachable by keyboard, has a screen-reader label and a visible focus
  ring; reduced motion stills thumbnails and UI animation. No native `title` tooltips (AGENTS.md §1).

The Lab's controls are local to `ui/controls.tsx` and match Lens tokens. When the AAA wave's `src/ui`
primitives land on main they should replace them (see Next).

## 4. Live wallpaper

`Set as live wallpaper` stores the state's code in the wallpaper settings (`sceneOptions.backdrop`) and
selects the `backdrop` Playground scene. The wallpaper window decodes the same code with the same engine,
so nothing is re-encoded.

- **Courtesy:** 30 fps cap; adaptive resolution (0.5–1× device pixels, adjusted from the frame cadence the
  runner achieves); the runner's existing pause rules (covered desktop, fullscreen and games, battery);
  reduced motion → one still frame; Do Not Disturb calms motion (on by default).
- **No flicker:** changes crossfade inside the renderer (600 ms; shaders compiled before the swap) and
  switching to or from another scene crossfades in `WallpaperSurface` (the outgoing scene keeps its
  instance underneath). The parity check samples every frame across three kinds of switch and fails on a
  blank or a flash.
- **GPU resets** (driver reset, sleep, RDP, display change): the last frame is kept (a quarter-size copy is
  shown) until the context is restored and the backdrop rebuilds itself.
- **No WebGL2:** a still gradient from the same stops.
- **Living options** (all opt-in except DND calm): evolve slowly, follow the time of day, follow theme
  colours (switching packs crossfades), soft pulse on notifications, warm slightly when the PC is busy,
  colours from what's playing, rotate looks every 15/60 minutes, and morning / noon / evening / night
  keyframes that ease into each other.
- **Settings › Desktop › Playground** lists **Backdrop Lab** with 12 card presets and the same options.
- The Windows wallpaper is never changed. Turning the Lens wallpaper off (or quitting Lens, or “Remove all
  Lens changes”) shows the original wallpaper again.
- Scene options are capped at 32 KB in `win_wallpaper.rs` (was 8 KB) so codes and keyframes fit.

## 5. Make a theme

`backdropToPack` takes the darkest stop (lightest for light backdrops) as the base and nudges its lightness
until the pack's text reads at ≥ 7:1 (≥ 4.5:1 guaranteed), picks the most colourful stop that stands out by
≥ 3:1 as the accent, and registers a custom pack. The `.lenstheme` file gets an extra `backdrop` field with
the code, and the backdrop becomes the live wallpaper. Every preset passes this in tests.

## 6. Export and share

- **PNG** up to 4K, plus square, phone (9:19.5), two-monitor span and ultrawide.
- **Video loop:** WebM (VP9/VP8) or MP4 where the WebView supports it, 1–3 whole loops (≤ 30 s), with
  progress, time remaining and Cancel. Frames are rendered at exact loop times, so files repeat seamlessly.
- **Share:** Lens link, `.lensbg` file, share card PNG, copy CSS fallback. All settings-only (< 1 KB),
  nothing uploaded.
- Files go to `Pictures\Lens\Backdrops` with never-overwriting names (`studio_save_export`, which also
  checks the bytes match the extension). Still wallpapers go to Lens's own wallpapers folder.

## 7. Performance

- Preview: up to 60 fps at ≤ 1.25× DPR; thumbnails share one GPU context and redraw a few tiles per tick.
- Wallpaper: 30 fps cap, adaptive resolution, paused whenever the Playground runner pauses.
- Measured in the harness (`tools/parity/backdrop/shots/perf.json`): software WebGL (SwiftShader) only, so
  the absolute numbers are CPU-rendered and far above a real GPU. The GPU/CPU share on real hardware
  (target: < 2 % GPU, < 1 % CPU at 1080p on mid hardware) still has to be measured on Windows with the
  Tester Hub; `tools/perf` has a `playground-backdrop` fluidity budget for the main thread.

## 8. Next

Cut for this pass (listed so nothing is lost):

1. **Per-monitor and span on real multi-monitor setups.** The engine already supports span
   (`setSpan(origin, world)`: one continuous field across windows), but the wallpaper host attaches one
   window to the primary monitor. Needs a window per monitor in `win_wallpaper.rs` with mixed-DPI tests.
2. **Real-Windows E2E** for apply / switch / resume / multi-monitor with pixel checks around the swap
   (the browser-side flash check exists; tests/e2e needs a wallpaper step).
3. Video-loop fallback when WebGL2 is missing (today: still gradient).
4. Weather input to “follow the time of day” (the weather source is not exposed to the wallpaper yet).
5. Cursor parallax on the desktop: the shader supports it (`setCursor`), the scene keeps it at 0 until the
   desktop input hook is opt-in per scene with a game guard.
6. Use the gradient in Snip “beautify”, Lens Browser new-tab, Top Bar / Dock tint and the Lens Music
   visualiser.
7. QR code on the share card; WebCodecs encoding (faster than real time) with a small WebM muxer.
8. Migrate `ui/controls.tsx` to the `src/ui` primitives once the AAA wave is on main.
9. Add the Lab's presets to the ambient-backdrop scene list (that list is CPU painters; today they appear
   in the Playground card instead).
10. Lens Command / voice intent “Lens, make me a … backdrop” (the Lab already reads a pending prompt from
    `localStorage` key `lens.backdrop.pendingPrompt`).
11. Apply a `.lenstheme`'s `backdrop` field when a theme file is imported.
