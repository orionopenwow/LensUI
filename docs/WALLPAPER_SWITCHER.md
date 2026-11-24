# Wallpaper Switcher

A library of your own pictures and loops, a full-screen picker, and automatic changes. Off until you
use it: Lens lists nothing until you add a folder, and nothing changes on a timer until you turn
"Change automatically" on.

## What it never does

- **It never writes the Windows wallpaper.** The picture you pick is shown by the Lens wallpaper host,
  the window Lens draws behind your desktop icons (`win_wallpaper.rs`, `docs/PLAYGROUND.md`). Turn Lens
  Wallpaper off, quit Lens, or use Remove all, and your own Windows wallpaper is what you see,
  untouched. There is nothing to restore in Windows because nothing in Windows was changed.
- **It never moves, renames or edits your files.** A chosen picture is hard-linked (or, across drives,
  copied) into `%APPDATA%\LensUI\wallpapers` as `lib-<id>.<ext>`; only the last three of those are kept.
- **It never deletes for good.** Delete asks first, in the picker, and then sends the one file to the
  Windows Recycle Bin, where you can restore it.
- **It never uses the network.** "Wallpaper of the day" is a stored setting that is off by default and
  has no source yet (see Deferred), so nothing is fetched.

## Remove all

The first change records what the wallpaper host was showing (on or off, which file or scene). The
`wallpaper-switcher` row in the change registry (`src-tauri/src/changes.rs`) turns automatic changes
off, puts that back and removes the linked copies; the `wallpaper` row right after it detaches the
host. `node tools/changes/check.mjs` covers both files (they call no OS writer at all, and a test in
`src/__tests__/wallpapers.test.ts` keeps it that way).

## The library

| | |
| --- | --- |
| Sources | Folders you add (four levels deep, up to 5,000 files), plus Backdrop Lab presets and the living themes' wallpapers, which Lens draws itself |
| Files | jpg, jpeg, png, webp, bmp, gif, avif; mp4, webm, mov, m4v loops |
| Thumbnails | 256 px WebP in `%APPDATA%\LensUI\wallpapers\thumbs`, made once per picture |
| Per picture | favourite, hidden, tags, collections, size, five-colour palette, look-alike hash |
| Look-alikes | A 64-bit difference hash; pictures within 5 bits are listed together under "Look-alikes" for you to review. Nothing is removed for you |
| Stored in | `%APPDATA%\LensUI\wallpaper-library.json` |

Thumbnails, palettes and hashes are made in the webview (it already decodes every format the host can
show): Rust hands over one original at a time, only from a folder you added and only up to 48 MB, and
stores what comes back. Indexing runs while the picker is open, nearest the card in focus first.

## The picker

Lens Studio › Wallpapers (the Studio window, shared with Backdrop Lab). A curved fan of cards over a
backdrop made of the focused wallpaper's own five colours; each card carries its palette as five chips.

| Key | Does |
| --- | --- |
| ← → (PgUp/PgDn, Home/End, wheel) | Browse |
| Enter | Set as wallpaper (toast has Undo) |
| / | Search names, folders, tags and collections |
| F · H | Favourite · Hide |
| T · C | Tags · Collection |
| R | Random from the library |
| V | Fit: fill, show it all, stretch, actual size |
| M | Make a theme from this |
| O | Open its folder |
| Del | Move to the Recycle Bin (asks first) |
| S | Change automatically |
| Esc | Close the panel, clear the search, then close |

**Make a theme from this** turns the picture's palette into a pack the same way Backdrop Lab does
(`engine/theme.ts` `backdropToPack`: a base and an accent checked for 4.5:1 text and 3:1 accent
contrast), saves it as a `.lenstheme` and applies it, with Undo. The picture stays the wallpaper.

The fan moves with transform and opacity only, on the motion tokens; panels enter and leave through
`src/ui/motion`. The window is never resized by the page.

## Change automatically

| Setting | |
| --- | --- |
| How often | 5 minutes to once a day, or not on a timer |
| When Lens starts | One change per run |
| Order | Shuffled (never the one showing, and not the recent ones while there are others) or in order |
| Choose from | Everything, favourites, a collection or a tag |
| Day and night | A set for the day and another for the night, with the hours each starts |
| Crossfade | Cut to very slow; the old picture stays underneath until the new one has faded in |

It pauses with the wallpaper itself: in fullscreen apps and games, while a window covers the desktop,
and on battery or battery saver (the host's own pause rules, `win_wallpaper::pause_reason`). It also
waits while Calm is on or while a living scene, not a picture, is the wallpaper. The wallpaper surface
asks once a minute; the rules are in Rust (`wallpapers::due`, `pick_next`) and are unit-tested.

## Where it is

- Settings › Appearance › Wallpaper. Simple mode shows the picker button and "Change automatically";
  the rest (when Lens starts, order, sets, crossfade, Next / Previous / Random) is under More options.
- Lens Command: `/wallpaper next`, `/wallpaper previous`, `/wallpaper random`, or `/wallpaper` to open the picker.
- Voice and Lens AI: "next wallpaper" (the existing `next_wallpaper` intent now does this).
- The tray icon's menu: Next wallpaper.

## Deferred

From the plan (the spec this replaced, 23 Nov 2026), not built yet:

- **Wallpaper of the day** (Bing, NASA APOD, Unsplash with a key). The opt-in setting exists and is
  off; no source is wired, so there is no toggle in the UI yet and nothing is ever fetched. It needs a
  source whose terms allow it and an approval the first time.
- **Per-monitor wallpapers and span.** The host attaches to one monitor (the Lens monitor). Different
  pictures per monitor, and a "span" fit, need one host window per monitor.
- **Thumbnails for video loops.** Loops are listed and play as wallpapers; their cards show a
  placeholder, not a frame.
- **A folder picker dialog.** Folders are added from the suggestions or by pasting a path.
- **Auto-change through Lens' own living wallpapers.** They are in the picker and can be set by hand;
  the timer rotates your files only.
- **More quick controls.** The tray menu has Next wallpaper. Previous, Current, Collection and the
  on/off ticks, and a Top Bar or Dock context-menu entry, are not there yet.
- **Sorting** by recent, colour or name (the library is in path order), **dragging** the fan, and
  **clicking a palette chip** to copy its hex.
- **A Wallpapers add-on card** in Lens Apps, and **theme packs that carry a wallpaper collection**.

## Code

| | |
| --- | --- |
| Rules and files | `src-tauri/src/wallpapers/mod.rs` (+ `tests.rs`) |
| Commands | `src-tauri/src/commands/wallpapers.rs` |
| Picker | `src/wallpapers/WallpaperPicker.tsx`, `wallpapers.css` |
| Pure model | `src/wallpapers/model.ts` (hash, palette, look-alikes, filtering, fan geometry) |
| Indexer | `src/wallpapers/indexer.ts` |
| Settings card | `src/wallpapers/SwitcherCard.tsx`, `AutoChangeControls.tsx` |
| Auto-change clock and crossfade | `src/surfaces/WallpaperSurface.tsx` |
| Tests | `src/__tests__/wallpapers.test.ts`, `src-tauri/src/wallpapers/tests.rs` |
| Screenshots | `node tools/parity/build.mjs && node tools/parity/themes/shoot.mjs` |
