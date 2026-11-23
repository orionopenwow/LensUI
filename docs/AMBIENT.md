# Ambient backdrops

Every theme pack gets a **very slow, very faint animated backdrop** in its own colours: Obsidian's
black waves roll, Nord's aurora drifts, Tokyo Night's contour lines reshape, Alabaster's paper
catches a moving wash of light. It's the Lens wallpaper, so it sits behind the desktop icons.

- **Off for existing users.** New users see a pre-ticked *Animated backdrop (subtle)* box on the Setup
  Wizard's *Pick a look* step; it is applied only when they press **Finish** (Escape or skipping
  setup changes nothing).
- **One switch** in Theme & Look's current-theme hero; **Motion** (Still / Subtle / Lively) and a
  **Scene** override under Customise › Wallpaper.
- Theme cards in Theme & Look and the gallery show each pack's backdrop running at ~6–8 fps while on
  screen.

## How it works

The backdrop is a Playground scene with the id `ambient` ("Theme backdrop", `src/playground/ambient/module.ts`).
It is stored in the existing wallpaper settings, so nothing new is needed in Rust and every wallpaper
rule applies:

| Wallpaper setting | Value while the backdrop is on |
|---|---|
| `enabled` | `true` |
| `scene` | `"ambient"` |
| `sceneOptions.ambient` | `{ variant: "auto" \| <scene id>, motion: "still" \| "subtle" \| "lively", prevScene, prevEnabled }` |

Turning it off restores `prevScene` / `prevEnabled`, so a chosen image, video or Playground scene comes
back exactly (`withAmbient` in `src/playground/ambient/settings.ts`, covered by a test).

With `variant: "auto"` the scene follows the active pack (`<html data-preset>`). When the theme
changes, the backdrop cross-fades to the new colours over 1.6 s; if the new pack uses a different
scene it switches scene. "Theme follows music" and any accent change re-tint it the same way (it
listens to the same palette watcher as every Playground scene).

### Quiet by construction

Every scene is a pure painter that fills a small RGBA buffer (1/3 to 1/16 of the screen's resolution),
which CSS scales up. A painter only chooses weights for five colours derived from the pack's tokens
(ink, accent, a companion hue, a deep tone, the elevated surface); the final pixel is

    base + k · Σ wᵢ · (colourᵢ − base),   Σ wᵢ ≤ 1,   k ≤ 0.09

so no pixel can move more than 9 % of the way from the pack background towards any theme colour.
Luminance variation across a frame is therefore bounded at ≤ 9 %; the test checks ≤ 10 % on every
scene × 7 palettes (including pure black + yellow and pure white + black) at 6 points in a cycle, at
the loudest setting. Scenes contain no colour literals (a test greps for hex and `rgb(`).

Motion levels: **Still** (one frame, no loop), **Subtle** (default; one full cycle every 40–90 s),
**Lively** (1.8× speed, slightly stronger). Light packs use a lower strength so they stay airy.

### Performance and pausing

- Frame cap 24 fps (`maxFps`). If painting averages over 3 ms, the scene draws every other frame
  (adaptive, down to 12 fps).
- Buffers are tiny and the pixel writes are one packed 32-bit store per pixel. The bun test fails if
  any scene's paint exceeds 3 ms per frame at 1080p (median of 7 batches); the CI browser step also
  measures paint + `putImageData`.
- Pauses (existing wallpaper monitor, `win_wallpaper.rs`): a maximised/fullscreen window covering the
  monitor (this covers games and fullscreen apps), battery (when "pause on battery" is on), and now
  **Windows battery saver** — always (`pause_reason_with_saver`, new test).
- **Calm** freezes it into a still frame; **reduced motion** (Lens or Windows) shows a still frame;
  hidden window → stopped.
- The cursor is ignored (no input hook: the scene is not `interactive`), and no WebGL is needed.

Measured on this machine (headless Chromium, software rendering, paint + `putImageData`, 1080p
buffer sizes, median of 7×12 frames; `tools/parity/ambient/shots/perf.json`):

| Scene | Buffer at 1080p | ms / frame |
|---|---|---|
| waves | 320×180 | 1.1 |
| drift-aurora | 240×135 | 0.65 |
| breathe | 240×135 | 0.53 |
| star-drift | 640×360 | 0.52 |
| dither-dunes | 480×270 | 0.69 |
| halftone-tide | 480×270 | 0.37 |
| contours | 384×216 | 1.13 |
| glow-contours | 320×180 | 1.17 |
| grain-fog | 384×216 | 0.70 |
| plotter | 480×270 | 0.41 |
| paper | 384×216 | 0.52 |
| scanlines | 640×360 | 0.56 |
| caustics | 384×216 | 0.66 |
| pixel-clouds | 120×68 | 0.50 |

At 24 fps the worst case (~1.2 ms) is ~3 % of one core on a slow software path; on a real GPU-backed
WebView2 `putImageData` is cheaper. The < 2 % CPU target on a mid laptop at 1080p still needs a
measurement on real hardware (Tester Hub step below).

## Scenes (all original to Lens)

| Id | Name | What it does | Upscale |
|---|---|---|---|
| `waves` | Rolling waves | Four layered swells rolling slowly, faint crest lines | soft, 1/6 |
| `drift-aurora` | Drift aurora | Two soft ribbons drifting high in the sky | soft, 1/8 |
| `breathe` | Soft gradient breathe | Three large colour fields drifting and breathing (low saturation = "misty") | soft, 1/8 |
| `star-drift` | Starfield drift | Sparse stars at three depths, very slow twinkle | soft, 1/3 |
| `dither-dunes` | Dither dunes | One-bit dunes sliding under a dotted sun (Bayer 4×4) | pixelated, 1/4 |
| `halftone-tide` | Halftone tide | Dot field whose dots swell in a slow tide | soft, 1/4 |
| `contours` | Contour lines | Topographic lines reshaping, constant 1 px width | soft, 1/5 |
| `glow-contours` | Glow contours | Contours with a soft halo (neon packs) | soft, 1/6 |
| `grain-fog` | Grain fog | Slow fog banks + film grain that steps every 0.6 s (never flickers) | soft, 1/5 |
| `plotter` | Plotter lines | Wavy pen-plot lines redrawn left to right one at a time | soft, 1/4 |
| `paper` | Paper fibres | Static fibres with a slow wash of light (light packs) | soft, 1/5 |
| `scanlines` | Scanline drift | Fine scanlines with a glow band drifting down | pixelated, 1/3 |
| `caustics` | Slow caustics | Underwater light network over deepening water | soft, 1/5 |
| `pixel-clouds` | Pixel clouds | Blocky clouds drifting past a pixel moon | pixelated, 1/16 |

## Pack → scene

Mapping lives in `src/playground/ambient/packMap.ts`. A pack can also carry its own
`ambient: { scene, params }` in `src/themes/packs.ts`, which wins. Packs that aren't listed fall back
by mood: dark → `waves`, light → `paper`.

### Built-in packs

| Pack | Scene | Tuning |
|---|---|---|
| Obsidian | waves | — (black swells, faint crests) |
| Windows Mesh | breathe | saturation 0.8 |
| Graphite | grain-fog | saturation 0 (monochrome) |
| Midnight | star-drift | — |
| Catppuccin Mocha | breathe | companion hue +60° |
| Tokyo Night | contours | — |
| Nord Frost | drift-aurora | saturation 0.8, hue +30° |
| Dracula Glass | halftone-tide | density 1.2 |
| Gruvbox Warm | grain-fog | — (warm fog) |
| Kanagawa Wave | waves | speed 0.8 |
| Rosé Pine | breathe | hue −40°, saturation 0.7 |
| Everforest | contours | density 0.7, saturation 0.7 |
| Hyprland Neon | glow-contours | — |
| Sequoia Frost | breathe | saturation 0.35, speed 0.8 (misty gradient) |
| Cyberpunk Amber | scanlines | — |
| Solarized Matte | plotter | — |
| Alabaster Daylight | paper | — |
| Paper Minimal | paper | amount 1.1 |

### Expressive / Dot Matrix (PR #32)

| Pack | Scene |
|---|---|
| `lens-expressive` | breathe (saturation 0.6) |
| `lens-expressive-light` | paper |
| `lens-dot-matrix` | halftone-tide (density 0.8) |

### Claude Code community packs (PR #31)

Lens-original scenes matched to each mood. No code, shaders or assets from those themes are copied.

| Pack | Scene | | Pack | Scene |
|---|---|---|---|---|
| cc-honu-lagoon | caustics | | cc-retro-amber | scanlines |
| cc-koi-mosaic | breathe | | cc-retro-green | scanlines |
| cc-halftone-dawn | halftone-tide | | cc-retro-white | scanlines |
| cc-halftone-dusk | halftone-tide | | cc-retro-cga | pixel-clouds |
| cc-plotter-tide | plotter | | cc-retro-crt | scanlines |
| cc-plotter-tide-night | plotter | | cc-retro-synthwave | drift-aurora (hue −60°) |
| cc-dither-dunes | dither-dunes | | cc-catppuccin-latte | paper |
| cc-dither-dunes-night | dither-dunes | | cc-catppuccin-frappe | breathe (hue +60°) |
| cc-paper-garden | paper | | cc-catppuccin-macchiato | breathe (hue +60°) |
| cc-paper-garden-kraft | paper | | cc-gruvbox-light | paper |
| cc-night-reef | caustics (speed 0.8) | | cc-rose-pine-moon | breathe (hue −40°) |
| cc-snow-pines | star-drift | | cc-rose-pine-dawn | paper |
| cc-braille-stars | star-drift | | cc-solarized-light | plotter |
| cc-block-clouds | pixel-clouds | | cc-everforest-light | paper |
| cc-vector-range | glow-contours | | cc-github-dark | waves |
| cc-departure-board | scanlines | | cc-github-dark-dimmed | waves (speed 0.8) |
| cc-blueprint | contours | | cc-github-light | paper |
| cc-deep-water | caustics | | cc-one-dark | contours |
| cc-aurora | drift-aurora | | cc-onehalf-light | paper |
| cc-ember | grain-fog | | cc-monokai | glow-contours |
| cc-claude-dark | waves | | cc-monokai-pro | contours |
| cc-claude-light | paper | | cc-base16-ocean | waves |
| cc-claude-dusk | breathe | | cc-base16-eighties | plotter |
| cc-claude-midnight | star-drift | | cc-base16-cupcake | paper |
| cc-claude-dark-brand | grain-fog | | cc-wl-cyberpunk | scanlines |
| cc-claude-light-brand | paper | | cc-wl-daltonized-dark | waves (amount 0.7) |
| cc-wl-nature | contours | | cc-wl-daltonized-light | paper (amount 0.7) |
| cc-wl-warm-neutral | grain-fog | | cc-wl-high-contrast | paper (amount 0.4, speed 0.5) |
| cc-wl-circit | glow-contours | | cc-wl-high-contrast-pro | waves (amount 0.4, speed 0.5) |
| cc-wl-branded | paper | | | |

## Files

- `src/playground/ambient/core.ts`: colour rule, motion tuning, buffer sizing, `renderFrame` for tests.
- `src/playground/ambient/scenes/*`: the 14 painters.
- `src/playground/ambient/packMap.ts`: pack → scene.
- `src/playground/ambient/module.ts`: the `ambient` Playground scene (registered in `registry.ts`).
- `src/playground/ambient/settings.ts`: pure on/off helpers on wallpaper settings.
- `src/playground/ambient/controls.tsx`: `useAmbient`, `AnimatedBackdropSwitch`, `AmbientWallpaperOptions`, `AmbientPreview`, `enableAmbientBackdrop`.
- `src/playground/ambient/packPalette.ts`: palette for a pack that isn't applied yet (cards).
- `tools/parity/ambient/*`: contact sheets, loops, composed desktops, in-browser timing.
- `src/__tests__/ambient.test.ts`: mapping, colour literals, determinism, still, luminance bound, animation, 3 ms budget, reversible on/off.

Shared files touched (small, additive): `src/playground/registry.ts` (register), `src/surfaces/WallpaperSurface.tsx`
(Motion: Still → still frame), `src/themes/packs.ts` (optional `ambient` field), `src/themeux/ThemeTab.tsx`
(switch, preview in hero, options under Wallpaper), `src/components/ThemeGallery.tsx` (preview layer in
`PackPreview`), `src/components/SetupWizard.tsx` (checkbox, applied on Finish), `src-tauri/src/win_wallpaper.rs`
(battery-saver pause), `tools/parity/mock/core.ts` (`?ambient=` in the wallpaper mock), `.github/workflows/build.yml`
(gallery step), `.gitignore`.

## Snippet for the settings hub (feature/settings-hub, Appearance page)

The hub is rebuilding Theme & Look as an Appearance page. Mount the same two components; both read
and write the wallpaper settings themselves:

```tsx
import { AnimatedBackdropSwitch, AmbientWallpaperOptions } from "../../playground/ambient/controls";

// In the page's "controls" hero row, next to Dark / Light / Auto:
<AnimatedBackdropSwitch />

// In the Wallpaper section (above the existing wallpaper picker):
<AmbientWallpaperOptions />
```

For the hero preview, put `<AmbientPreview packId={pack.id} palette={packPalette(pack, accent)} />`
as the first child of a `position: relative` preview box (it draws absolutely, under everything else).

Settings search entries: "Animated backdrop", "Backdrop motion", "Backdrop scene" →
`lens://settings/appearance#wallpaper`.

## Tester Hub steps

1. **High** — Theme & Look → turn on *Animated backdrop*. The desktop shows the theme's backdrop
   within a second; desktop icons stay clickable. Turn it off: the previous wallpaper comes back.
2. **High** — With the backdrop on, open a game or a fullscreen video, then turn on Windows battery
   saver: Task Manager shows Lens's WebView CPU near 0 % while either is active.
3. **Med** — Switch theme pack Obsidian → Nord Frost → Alabaster Daylight: the backdrop cross-fades
   and changes scene; nothing flashes.
4. **Med** — Motion: Still shows one frame; Lively is visibly faster but still calm. Windows
   *Show animations* off → still frame.
5. **Low** — Idle at 1080p for 5 minutes on a laptop: CPU for the wallpaper WebView stays under 2 %.
