// Lens's own app icons: one set, one tile, used everywhere a Lens app shows up as an app (Dock pins,
// Lens Apps, Search, Command, the core-app title bar, the website's demo desks). DESIGN.md §3.7.
//
//   Lens apps     a bold white glyph (stroke 2.5 on a 24 px grid, round caps and joins, one idea per
//                 icon) on a plain matte tile (#18181B) with one faint hairline. No gradient, glow,
//                 shadow, inner highlight or colour.
//   Lens Browser  the one exception: it keeps the Lens logo (a silver lens with the colour inside),
//                 redrawn flat for icon sizes on the same tile.
//
// The same tile reads in every theme, so there is no light variant: on dark docks the hairline
// separates it (the tile alone is ~1.1:1 against #09090B), on light docks the dark tile itself is the
// edge (~15:1 against #EEEEF0), and the glyph is ~17:1 on the tile either way. A light tile would
// sit at ~1.1:1 on light docks and need a dark glyph — not the white set the design asks for.
//
// Plain TypeScript with no imports and no TS-only runtime syntax, so the website build can import it
// straight from Node (tools/site/lib/icons.mjs). src-tauri/src/coreapps/mod.rs mirrors TILE_OPEN,
// TILE_CLOSE and the core-app glyphs; src/__tests__/lensAppIcons.test.ts keeps them identical.

/** Stroked SVG path data on a 24×24 grid. */
export const LENS_APP_GLYPHS = {
  // Core apps (src/coreapps/registry.ts)
  monitor: "M3 12h4l2.5-6 5 12 2.5-6H21",
  startup: "M12 16V4M7 9l5-5 5 5M5 20h14",
  timer: "M19 14a7 7 0 1 1-14 0 7 7 0 0 1 14 0zM12 14v-3.5M10 3h4",
  calculator: "M7 4v6M4 7h6M14 7h6M14 15h6M14 19h6M5 15l4 4M9 15l-4 4",
  color: "M12 3.5c3 3.5 6 6.9 6 10.5a6 6 0 0 1-12 0c0-3.6 3-7 6-10.5z",
  notes: "M13 20h7M4 20l1-4L15.5 5.5a2.1 2.1 0 0 1 3 3L8 19z",
  power: "M5 7h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2zM21 10.5v3",
  network: "M3.5 9.5a12 12 0 0 1 17 0M7 13.2a7 7 0 0 1 10 0M12 18h.01",
  clipboard: "M8 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-1M9 3h6v4H9z",
  feeds: "M5 11a8 8 0 0 1 8 8M5 4a15 15 0 0 1 15 15M5.5 18.5h.01",
  messages: "M6 4h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4V6a2 2 0 0 1 2-2z",
  // Lens's other own apps
  settings: "M4 7h8M16 7h4M4 17h4M12 17h8M14 5v4M10 15v4",
  apps: "M5 4h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM15 4h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM5 14h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1zM17 14v6M14 17h6",
  command: "M17 11a6 6 0 1 1-12 0 6 6 0 0 1 12 0zM20 20l-4.5-4.5",
  music: "M9 18V5.5l11-2V16M9 18a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0zM20 16a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z",
  cleaner: "M10 4c.6 3.4 2.6 5.4 6 6-3.4.6-5.4 2.6-6 6-.6-3.4-2.6-5.4-6-6 3.4-.6 5.4-2.6 6-6zM18 14v6M15 17h6",
} as const;

export type LensAppGlyphId = keyof typeof LENS_APP_GLYPHS;
export type LensAppIconId = LensAppGlyphId | "browser";

/** Every glyph id, in sheet order. */
export const LENS_APP_IDS = Object.keys(LENS_APP_GLYPHS) as LensAppGlyphId[];

export const LENS_APP_TILE = "#18181B";
export const LENS_APP_INK = "#FAFAFA";
/** Stroke width on the 24 px grid (the tile draws the grid at 1.625×, so ~4 px of 64). */
export const LENS_APP_STROKE = 2.5;

/** The tile and the glyph group around one `<path d='…'/>`. Single quotes only, so the string drops
 * into a Rust literal and a data URL unchanged. */
export const TILE_OPEN =
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'>" +
  `<rect x='2' y='2' width='60' height='60' rx='15' fill='${LENS_APP_TILE}'/>` +
  "<rect x='2.5' y='2.5' width='59' height='59' rx='14.5' fill='none' stroke='white' stroke-opacity='.1'/>" +
  `<g transform='translate(12.5 12.5) scale(1.625)' fill='none' stroke='${LENS_APP_INK}' stroke-width='${LENS_APP_STROKE}' stroke-linecap='round' stroke-linejoin='round'>`;
export const TILE_CLOSE = "</g></svg>";

const tile = (glyph: string) => `${TILE_OPEN}<path d='${glyph}'/>${TILE_CLOSE}`;

/** Lens Browser keeps the Lens logo: a solid silver ring with the logo's six colours inside, flat
 * enough to stay crisp at 16 px (no turbulence, blur, drop shadow, stars or pinstripe rims). */
export function lensBrowserIconSvg(): string {
  // The logo's six hues around the centre, as soft radial blobs (no filters), under a dark vignette.
  const hues: [number, number, number][] = [
    [0, 38, 31],
    [45, 36, 37],
    [140, 30, 38],
    [195, 26, 33],
    [255, 28, 26],
    [306, 35, 26],
  ];
  const stops = hues
    .map(([h], i) => `<radialGradient id='h${i}'><stop offset='0' stop-color='hsl(${h} 95% 60%)'/><stop offset='1' stop-color='hsl(${h} 95% 60%)' stop-opacity='0'/></radialGradient>`)
    .join("");
  const blobs = hues.map(([, x, y], i) => `<circle cx='${x}' cy='${y}' r='13' fill='url(#h${i})'/>`).join("");
  return (
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'>" +
    `<defs>${stops}<radialGradient id='v'><stop offset='.5' stop-color='#050507' stop-opacity='0'/><stop offset='1' stop-color='#050507' stop-opacity='.9'/></radialGradient>` +
    "<clipPath id='lg'><circle cx='32' cy='32' r='18'/></clipPath></defs>" +
    `<rect x='2' y='2' width='60' height='60' rx='15' fill='${LENS_APP_TILE}'/>` +
    "<rect x='2.5' y='2.5' width='59' height='59' rx='14.5' fill='none' stroke='white' stroke-opacity='.1'/>" +
    `<g clip-path='url(#lg)'><rect x='12' y='12' width='40' height='40' fill='#050507'/>${blobs}<circle cx='32' cy='32' r='18' fill='url(#v)'/></g>` +
    "<circle cx='32' cy='32' r='19.5' fill='none' stroke='#D4D4D8' stroke-width='4'/>" +
    "</svg>"
  );
}

/** One Lens app icon as an SVG string. */
export function lensAppIconSvg(id: LensAppIconId): string {
  if (id === "browser") return lensBrowserIconSvg();
  return tile(LENS_APP_GLYPHS[id]);
}

/** The same icon as a data URL (`#` and `<` encoded). */
export const lensAppIconUrl = (id: LensAppIconId) => `data:image/svg+xml,${encodeURIComponent(lensAppIconSvg(id))}`;
