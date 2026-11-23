# Living Themes

Living Themes are theme packs that come with a live wallpaper driven by the real Sun and Moon where
you are. The flagship is **Sky**: the Sun rises low and glowing, climbs into a lavender-blue day,
sets bottom-right into a pink-violet dusk, and gives way to a navy night with faint stars. Lens' glass,
Dock and widgets can follow it.

Theme & Look → **Living themes** has live tiles for all nine, the location, a time-lapse scrubber,
"Tint Lens with the sky", Motion (Still / Subtle) and the weather options.

| Pack id | Name | What moves |
|---|---|---|
| `living-sky` | Sky | Real Sun and Moon, twilight stages, stars, slow high clouds |
| `living-moonlight` | Moonlight | A large Moon in tonight's real phase; the season's constellation (Orion, Big Dipper, Cygnus, Cassiopeia; Crux in the south) |
| `living-seasons` | Seasons | Palette, hills and particles (blossom, fireflies, leaves, snow) by date and hemisphere |
| `living-golden-hour` | Golden Hour | Cream by day; amber with sunbeams peaking at your real sunset |
| `living-weather` | Weather Window | The sky through a window with clear / cloudy / rain / snow / fog / storm |
| `living-tides` | Tides of Light | Sea that mirrors the sky; glitter path under the Sun or Moon; shore follows a Moon-driven tide |
| `living-city-night` | City Night | Skyline whose windows light up after sunset and thin out after midnight |
| `living-aurora` | Northern Lights | Aurora curtains on dark nights (stronger at high latitude) over snowy peaks |
| `living-desert` | Desert Day | Dunes whose lit faces and cast shadows follow the Sun's azimuth and altitude |

Each pack has light and dark behaviour (see Tint below), a token palette (`src/themes/living/packs.ts`;
`base`/`accent` are the night look) and a static frame for reduced motion.

## Code

```
src/playground/living/astro.ts     NOAA Sun, lunar phase/position, twilight stages
src/playground/living/sky.ts       shared sky painter (gradient, Sun, Moon, stars, clouds), projection
src/playground/living/themes.ts    the nine painters
src/playground/living/module.ts    Playground scene modules (registered in src/playground/registry.ts)
src/playground/living/settings.ts  local settings, location, preview time
src/playground/living/weather.ts   opt-in Open-Meteo
src/playground/living/bench.ts     frame-time benchmark (one painter per process)
src/themes/living/packs.ts         LIVING_PACKS (tier "Living"), added to allPacks / packById / packByAlias
src/themes/living/tint.ts          light/dark by Sun + "Tint Lens with the sky"
src/themes/living/LivingThemesRow.tsx  the settings row
tools/parity/living/               screenshots and the time-lapse
```

`LIVING_PACKS` is a separate list from `THEME_PACKS` and `COMMUNITY_PACKS`, so the community
collection and the recommended six are unchanged.

## Algorithms

**Sun.** The NOAA solar position algorithm (the NOAA Solar Calculator): Julian century, geometric
mean longitude and anomaly, equation of centre, apparent longitude with nutation, obliquity,
declination, equation of time, true solar time, hour angle, then altitude/azimuth, plus NOAA's
refraction correction. Tested against published sunrise/sunset times (London and New York at the June
solstice, Sydney at the December solstice) to within 2 minutes, against the Theme Schedule's own
sunrise for six cities on five dates to within 3 minutes, against 90 − φ + δ at London's solar noon
(within 0.15°), against the equator at the equinox (> 89.5°), and against polar night and midnight
sun in Tromsø (noon −3.1°, midnight +3.1° ± 0.5°).

**Moon.** The low-precision lunar theory used by suncalc (Meeus, truncated): longitude with the
equation of centre, latitude and distance; topocentric parallax; phase from the Sun–Moon elongation;
bright-limb angle rotated by the parallactic angle so the lit side faces the Sun on screen. Tested at
three full moons and two new moons (illumination > 0.99 / < 0.01, phase within 0.02 ≈ 14 h), first
and last quarter, the 2024-04-08 total solar eclipse at Dallas (Sun–Moon separation < 2°, Sun
altitude 64.6 ± 1°) and the 2025-09-07 total lunar eclipse (separation > 176°).

**Twilight.** `skyStage(altitude)`: day ≥ 6°, golden ≥ −0.27° (apparent; geometric −0.833°),
civil ≥ −6°, nautical ≥ −12°, astronomical ≥ −18°, else night. Stars fade in from −2° and are all
out by −16°.

**Sky colour.** Keyframes by solar altitude (−90, −18, −12, −6, −3, 0, 3, 8, 20, 45, 90°) for
zenith, mid and horizon, smoothly interpolated: a stylised Rayleigh look (bluer zenith,
whiter/warmer horizon), pinker in the evening. The Sun disc and bloom take their colour from the
altitude; a horizon band glows near sunrise and sunset. Family themes apply a grade to these colours.

**Projection.** The view faces the meridian the Sun culminates on (south in the northern hemisphere).
Azimuth maps across ±150° of the screen and altitude up from a horizon line. With "One sky across all
monitors" each wallpaper window shows its slice of one virtual canvas, from `list_monitors_cmd`.

**Tide.** A toy semidiurnal model: high water when the Moon is on the meridian (upper or lower), with
spring tides at new and full Moon. Not a tide table.

## Tint and light/dark

While a living pack is active, Lens is light between sunrise and sunset and dark otherwise, using the
same `sunTimes` / `isDaytime` logic as the Theme Schedule. Polar day and night are handled.

"Tint Lens with the sky" (off by default) moves the glass base and the accent towards the current sky
colour of the active living theme, or of Sky when a regular pack is active (regular packs keep their
own light or dark scheme). The controller:

* writes only CSS variables in each window (`--lens-pack-base`, `--lens-pack-elevated`,
  `--lens-accent`, `data-scheme`). It never writes config.json, and turning it off restores the pack's
  own values;
* re-applies at most once a minute, and skips changes too small to see;
* holds still while the desktop is covered (the wallpaper pause monitor reports `covered` for
  fullscreen apps and games) and inside fullscreen pages;
* always keeps the ink at ≥ 4.5:1 on the base and elevated surfaces and the accent at ≥ 4.5:1 on both.
  The test checks every living pack and every built-in pack with a base, with tint on and off, in four
  cities (including Tromsø and Singapore) on four dates every three hours.

## Privacy

* **Location** is chosen in this order: a manual city or "lat, long" (rounded to 0.1°), the Theme
  Schedule location, or a guess from the time zone (a representative city for ~70 zones, else UTC
  offset × 15°). It is stored in this PC's localStorage (`lens.living.v1`) and never sent anywhere.
* **Weather** is manual by default. "Use live weather (Open-Meteo)" is opt-in. It requests only
  `https://api.open-meteo.com/v1/forecast?latitude=<0.1°>&longitude=<0.1°>&current=weather_code`, with
  no key, account or other parameters, and caches the answer for 30 minutes, so there are at most
  two requests an hour. Switching it off clears the cache. Open-Meteo is the only host added to the
  app's `connect-src`.
* No other part of Living Themes uses the network.

## Performance and motion

* The painters write straight into an RGBA buffer at **half the CSS resolution** (a third above 2560
  px wide), and CSS scales it up. Frame time at 960×540, one painter per process
  (`bun src/playground/living/bench.ts <id>`): about 1.2–2.4 ms median on a loaded 2-core sandbox.
  The unit test fails above 3 ms (25th percentile) or 7.5 ms (median).
* At most **10 fps** in Subtle (scene `maxFps`, inside the requested 6–15). Still draws one frame and
  then repaints once a minute so the Sun stays where it really is. The wallpaper host already stops
  the loop when the desktop is covered, on battery or battery saver, with Calm, or with reduced
  motion. Covered and paused windows still get the once-a-minute repaint.
* Every painter is deterministic for a given instant, place, size and seed (tested by hashing frames).

## Screenshots

```
node tools/parity/build.mjs && node tools/parity/living/build.mjs
PARITY_CHROME=/path/to/chrome LIVING_OUT=/tmp/living node tools/parity/living/shoot.mjs
```

This produces Sky at sunrise, noon, sunset, dusk and night with the Dock and widgets dressed in the
tint for that moment, each family theme, the settings row with the scrubber at 18:30, a
10-second WebP time-lapse of a full Sky day (London, 15 October), and `looks.json` with the exact
colours applied.
