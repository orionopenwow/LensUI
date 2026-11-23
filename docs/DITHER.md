# Lens dither material

`src/style/dither.ts` + `src/style/dither.css`. An ordered (Bayer 8×8) halftone over soft,
tileable value-noise "clouds", drawn from theme tokens into a small PNG tile and repeated. It's a
presentation material: backdrops, empty states, hero panels, map cards. **Never behind body
text** — put text on a solid card above it.

```ts
import { installDither } from "../style/dither";
import "../style/dither.css";
installDither();               // once per surface; repaints when tokens or contrast settings change
```

```html
<div class="lens-dither lens-dither-vignette">…</div>
```

| Token | Meaning |
|---|---|
| `--lens-dither` | 0–1. Amount of texture; 0 turns it off. |
| `--lens-grain` | 0–1. Fine random speckle. |
| `--lens-dither-cell` | Size of one dot cell (default 3px). |
| `--lens-dither-img` / `--lens-dither-tile` | Written by `applyDither()`; read by the CSS. |

* Dot colour is `--lens-fg` at low alpha, so it follows light and dark packs.
* `prefers-contrast: more` and `forced-colors` turn it off (JS and CSS both).
* It is static. `data-drift` adds a 120 s drift that stops under `prefers-reduced-motion`.
* `applyDither(el, { dither, grain })` paints a single element with its own settings (Lens
  Browser does this from its "Make it yours" sliders).

## Theme snippet (Lens-wide opt-in)

`src/hooks/useLensState.ts`, inside `applyThemeToDocument`:

```ts
root.style.setProperty("--lens-dither", String(Math.max(0, Math.min(100, cfg.theme.dither ?? 40)) / 100));
root.style.setProperty("--lens-grain", String(Math.max(0, Math.min(100, cfg.theme.grain ?? 20)) / 100));
```

`src/types/lens.ts` (`ThemeConfig`): `dither?: number; grain?: number;`
`src-tauri/src/config.rs` (`ThemeConfig`): `#[serde(default = "d40")] pub dither: u8, #[serde(default = "d20")] pub grain: u8`.
`src/main.tsx`: `import { installDither } from "./style/dither"; import "./style/dither.css"; installDither();`
Theme & Look › Customise: two sliders labelled Dither and Grain, 0–100.
