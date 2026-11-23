# Wallpaper Switcher (planned)

Status: **planned, not built.** Inspiration: the WallpaperSuite wallpaper manager for Windows (user reference video, 23 Nov 2026). Everything below is an original Lens design; no code, art or names are copied.

Where it lives: **Customizer › Appearance › Wallpaper** (Simple mode shows the picker and "Change automatically"; the rest sits under More options), plus a **Wallpapers** add-on card in Lens Apps / Add-ons, Command (`/wallpaper next`), voice ("Lens, next wallpaper") and the Dock/Top Bar context menu.

## Picker
- Full-screen **carousel picker**: a curved 3D fan of cards over a blurred, colour-matched backdrop of the focused wallpaper; arrow keys / wheel / drag to browse, Enter to set.
- Each card shows the image, its number/name, resolution and size, and **5 palette chips** (hex) extracted from it; click a chip to copy or to "Make a theme from this" (palette → .lenstheme, same path as Backdrop Lab).
- Keyboard bar: search, favourite, hide, tags, collection, random, fit (fill/fit/stretch/center/span), open folder, delete (to Recycle Bin, confirmed).

## Library
- Watched folders (any number) + Lens's own Backdrop Lab presets and Living themes in one library.
- **Collections** and **tags**, favourites, hidden, sort by recent/colour/name/random.
- **Find duplicates** (perceptual hash), shown for review; nothing deleted without confirmation.
- Optional **Wallpaper of the day** sources (Bing, NASA APOD, Unsplash with key) — off by default, network only when on.

## Auto-change
- Every N minutes/hours, at sign-in, or on a schedule (morning/evening sets); random or in order; per-collection.
- Pause while a fullscreen app or game runs, on battery saver, and when the desktop is covered (shares the ambient-backdrop pause rules).
- Per-monitor or span; crossfade on change (no flash), honouring reduced motion.

## Live wallpapers
- Video loops (MP4/WebM) and Backdrop Lab shaders as live wallpapers with the existing ambient budget (≤30 fps, adaptive, pause rules). Static frame fallback.

## Quick controls
- Tray / Top Bar menu: Open picker, Next, Previous, Current (show in folder, favourite, hide), Collection ›, Change automatically ✓, Live wallpaper ✓, Wallpaper of the day ✓.

## Light footprint
- Idle CPU ~0%, small memory (thumbnails cached on disk at 256 px, decoded lazily), no background work when auto-change is off.

## Safety
- Never changes files in the user's folders except a confirmed delete (Recycle Bin). Windows wallpaper changes are recorded so "Remove all Lens changes" restores the original.

## Theme packs / Overlay Marketplace
- A pack can carry a wallpaper collection (or links to it) and auto-change settings, so a shared look includes its wallpapers.
