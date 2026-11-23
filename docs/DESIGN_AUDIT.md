# Design audit — integration/waves-7-8

Rendered every surface (main harness, 11 surfaces) and all 22 Settings hub pages in Obsidian, Alabaster Daylight, Catppuccin Mocha and Claude Dark (`cc-claude-dark`) at 1024×640. Contact sheets: `/mnt/user-data/outputs/final/design/contact-settings-<pack>.png`; per-page shots `cc-<pack>-<page>.png`. Method: screenshots plus an automatic check for text clipped without an ellipsis.

## Fixed in this pass (before → after)

| # | Before | After |
|---|---|---|
| 1 | Dock crashed on every render after the voice mount (React #310: hook after an early return) | Hook moved with the other top-level hooks; Dock renders in all packs |
| 2 | Music page showed "Music couldn't load" (settings card crashed on a null config) | Card merges defaults with whatever the backend returns |
| 3 | Mini player showed in the Top Bar even when set to Dock or Hidden, and while Music was off | Follows the Dock / Top Bar / Hidden setting; hidden while Music is off |
| 4 | Old Top Bar media controls and the Music mini player could both show | Old controls hide while Lens Music is on |
| 5 | Voice mic button would sit in every Dock | Shown only while voice is on |
| 6 | New cards (Voice, Magic, Right-click, Packs, Snip, Browser, Permissions, Agent safety, Guide) were not reachable from Settings | Sections in AI & Command; new Music and Apps pages in the Lens group with nav icons |
| 7 | No way to open the Guide from Settings or the Top Bar | "?" in the Settings page header and the Top Bar, plus the drawer and coach marks on every surface |
| 8 | Dock buttons announced as just "button" (a11y F3) | Named, with running/focused state |
| 9 | Approval requests from AI apps had nowhere to show while Lens was in the background | Standalone approval window and an "Approve N" pill in the Top Bar (only when something waits) |
| 10 | `lens://settings/...` links went nowhere | Open the right page and section |

## Still open (not fixed here)

- **Clipped slider labels** on Display and Sound ("Brightness", "Night warmth", "Volume", per-app volume): the settings-hub branch is reworking `FillSlider`; re-check after its final merge.
- **Apps page thumbnails** are still letter placeholders until the Lens Apps v2 update (real icons and screenshots) lands.
- **Two clipboard histories** (old toggle in Windows & Keys, new card in AI & Command) remain on purpose until hardware testing.
- **Token audit:** hard-coded hex colours remain in older inline styles (`ControlCenterSurface.tsx` page bodies, `DockSurface.tsx` menus, `CommandPaletteSurface.tsx` quick actions). The Settings hub's `src/settings/ui` primitives are token-clean; moving the remaining six inline pages into `src/settings/pages/` is the way to retire them.
- **a11y F4** (Control Center switches without names) is still allow-listed; the fix is `aria-labelledby` on the shared toggle.
