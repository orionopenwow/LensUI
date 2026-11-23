# Lens Expressive and Lens Dot Matrix

Two **style layers** taken from two user references. They are not palettes: every colour comes from
the active theme pack (surfaces, text tones, accent, danger), so both work on all packs. A user picks
them in two ways:

- **Theme & Look › Choose a theme**: the packs **Lens Expressive**, **Lens Expressive Light** and
  **Lens Dot Matrix**. They use Obsidian or Alabaster colours, bring their shape style and recommend the
  new **Islands** dock (the dock changes only if "Also change Dock style" is ticked, as for every pack).
- **Theme & Look › Customise › Shape style**: **Classic / Expressive / Dot Matrix**, on top of any of
  the 21 packs. Packs without a shape style leave this setting alone.

Classic (the default) renders exactly as before. The before/after pixel diff of every main-harness
surface in Obsidian and Alabaster Daylight shows differences only in live clocks (top-bar clock, widget
clock seconds) and the palette caret.

## Files

| Area | Files |
|---|---|
| Shapes (cookie, flower, burst, pill, squircle) | `src/themes/shapes/shapes.ts` |
| Expressive CSS layer | `src/themes/shapes/expressive.css` |
| Expressive components | `src/themes/shapes/Expressive.tsx` — `ShapeGlyph`, `CookieClock`, `WeatherBlob`, `WeekBadge`, `Fab`, `CheckRing`, `isoWeek` |
| Dot-matrix glyphs (original 5×7 set) | `src/themes/dotmatrix/glyphs.ts` |
| Dot Matrix components + CSS | `src/themes/dotmatrix/DotMatrix.tsx`, `dotmatrix.css` — `DotText`, `DotPictogram`, `BatteryTile`, `MediaDiscTile`, `WeatherCard`, `BigClockTile`, `DateTile`, `MinimalAnalogTile`, `StatPills` |
| Islands dock | `src/dock/islands/layout.ts` (pure geometry), `islands.css`, `IslandParts.tsx` (`LeftIsland`, `WorkspaceIndicator`, `ChipsIsland`) |
| Tests | `src/__tests__/shapeStyles.test.ts` |
| Screenshots | `tools/parity/styles/` (`build.mjs`, `entry.tsx`, `shoot.mjs`) |

## How it is applied

`applyThemeToDocument` calls `applyShapeStyle(root, theme.shapeStyle, accent, packBase)`:

- sets `data-shape="expressive" | "dotmatrix"` on `<html>` (removed for Classic);
- sets the shape masks (`--lens-shape-cookie`, …);
- sets `--lens-x-accent`: the accent, or the pack's text colour when the accent would vanish into the
  surface (a white accent on a light pack);
- sets `--lens-on-accent`: near-black or near-white text for accent-filled pills, falling back to pure
  black or white for mid-tone accents, so it is always at least 4.5:1.

## Shared-file edits in this branch (all small and additive)

- `src/themes/packs.ts`: `shapeStyle?` on `ThemePack`; three packs; `applyThemePack` copies a pack's
  shape style.
- `src/dock/styles.ts`: the `islands` style (full width, system area in the dock, 34 px icons).
- `src/dock/DockStylePreview.tsx`, `src/dock/DockScenePreview.ts`: islands previews.
- `src/hooks/useLensState.ts`: imports the two CSS layers and calls `applyShapeStyle`.
- `src/surfaces/DockSurface.tsx`: imports `islands.css`; the Launcher button shows for Islands.
- `src/themeux/ThemeTab.tsx`: the **Shape style** section in Customise.
- `src/types/lens.ts`, `src-tauri/src/config.rs` (`theme.shapeStyle`, default `"classic"`),
  `src/types/generated.ts` (regenerated).
- `src/__tests__/themes.test.ts`: `islands` is a known dock style.
- `tools/parity/mock/core.ts`: `?shape=` and `?dockStyle=` query parameters.
- `.github/workflows/build.yml`: a step that renders the style scenes.

## Snippets for files other packages own

### D1. Left island in the Islands Dock (`src/surfaces/DockSurface.tsx`)

The islands CSS already turns the bar's sections into islands. To add the left island (launcher grid,
search, overview, workspace indicator), render it in the bar's left spacer:

```tsx
import { LeftIsland } from "../dock/islands/IslandParts";
// inside the bar, where `.dock-bar-spacer` is rendered:
{dockStyle === "islands" ? (
  <div className="dock-bar-spacer">
    <LeftIsland
      count={workspaces.length}
      active={activeWorkspaceIndex}
      shapeStyle={config.theme.shapeStyle}
      onSwitch={(i) => invoke("switch_workspace_cmd", { index: i })}
      onLauncher={() => setLauncherOpen(true)}
      onSearch={() => openDockSearch()}
      onOverview={() => invoke("show_overview_cmd")}
    />
  </div>
) : (
  <div className="dock-bar-spacer" />
)}
```

The search field and the voice-dock morph keep working inside the apps island (`.dock-icons-row`):
the islands style does not change their width lock.

### D2. Optional centre chips (media, weather)

```tsx
import { ChipsIsland } from "../dock/islands/IslandParts";
{dockStyle === "islands" && (media || weather) && <ChipsIsland media={mediaTitle} weather={weatherText} />}
```

### C1. Calendar (`src/components/CalendarClockPane.tsx`)

In the clock card, when `document.documentElement.dataset.shape === "expressive"`:

```tsx
import { CookieClock, WeekBadge } from "../themes/shapes/Expressive";
<WeekBadge date={now} />           // next to the big date
<CookieClock date={now} size={150} dayLabel={`${weekday} ${day}`} />   // replaces the round analogue face
```

For Dot Matrix use `BigClockTile` and `DateTile` from `src/themes/dotmatrix/DotMatrix`.

### C2. Agenda check rings and the add button

```tsx
import { CheckRing, Fab } from "../themes/shapes/Expressive";
<CheckRing checked={done} label={title} onChange={(v) => toggleDone(id, v)} />
<Fab label="Add reminder" onClick={focusNewReminder} />
```

### W1. Widget host (`src/surfaces/WidgetDrawerSurface.tsx`)

Add these widget ids, rendered when chosen in the widget picker:

```tsx
import { BatteryTile, MediaDiscTile, WeatherCard, BigClockTile, DateTile, MinimalAnalogTile } from "../themes/dotmatrix/DotMatrix";
import { WeatherBlob } from "../themes/shapes/Expressive";
"dm-battery":  <BatteryTile percent={battery.percent} charging={battery.charging} />,
"dm-media":    <MediaDiscTile playing={media.playing} title={media.title} />,
"dm-weather":  <WeatherCard {...weather} />,
"dm-clock":    <BigClockTile />,
"dm-date":     <DateTile />,
"dm-analog":   <MinimalAnalogTile />,
"x-weather":   <WeatherBlob temp={weather.temp} condition={weather.condition} />,
```

Wrap the Dot Matrix tiles in `<div className="ldm-grid">` for the two-column layout.

### T1. Top bar stat pills (`src/surfaces/TopBarSurface.tsx`)

```tsx
import { StatPills } from "../themes/dotmatrix/DotMatrix";
{(config.topBar?.statPills ?? config.theme.shapeStyle === "dotmatrix") && <StatPills />}
```

`StatPills` polls `get_telemetry_cmd` every 3 s, only while the page is visible. Lens has no CPU
temperature command yet, so temperature shows only when a value is passed (`tempC`). Add
`topBar.statPills?: boolean` to `config.rs` / `lens.ts` when wiring this.

## Contrast

Tests enforce:

- 4.5:1 or better for on-accent text on every pack's accent;
- 4.5:1 for body text on Expressive / Dot Matrix raised surfaces for every pack;
- an active fill visibly different from the surface for every pack.

The existing pack tests still pass for the three new packs.

## Notes

- **Recommended packs.** The new packs are not "recommended": a test requires exactly six.
- **Dot-matrix glyphs.** These are an original hand-drawn set; they are not derived from Nothing's NDot
  or any other font. Zero and capital O share a shape, as on LED displays.
- **Screenshots.** They use generated wallpapers and coloured squares for app icons; neither reference
  image is used.
