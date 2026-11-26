# Settings: Simple and Advanced

Settings had too many options for a new user and many had no visual. Simple mode shows the core, most fun settings as visual cards; Advanced shows everything as before.

## The choice: concept B, "More options expands in place"

Three concepts were mocked up (`/mnt/user-data/outputs/settings-simple/concepts/`):

| Concept | How deeper settings appear | Verdict |
|---|---|---|
| A | A side sheet slides over the page | Hides the page you were looking at; two scroll areas |
| **B** | **One "More options · Show ⌄" row expands the rest of the page in place** | **Chosen** |
| C | Every card has its own ··· popover | Fiddly; hard to search; no place for long sections |

B wins on friendliness: one obvious place to look, nothing covers the page, deep links and search can simply open it, and Advanced is the same page with the row already open. From A we kept the per-page **Reset** button (it sits in the More options row once it's open).

## How it works

- **The pill:** one Simple / Advanced pill sits at the top of the sidebar. It's a radiogroup; the arrow keys switch it, and the thumb slides with a transform.
- **Simple sidebar:** Quick, Appearance, Dock & Bar, Windows & Keys, AI & Command, Music, Display, Sound, Network and Power. The other pages fold under **··· More (N pages)**. A folded page you open from search or a link still shows.
- **Card pages** (Appearance, Dock & Bar, Windows & Keys, AI & Command) open on visual cards. The whole original page sits below under **More options**, which reveals with a fade and slide (transform and opacity only). Nothing above it moves.
- **Pages left as they are:** Music, Display, Sound (the mixer with its white fill bars), Network and Power are already essentials-only, so they show unchanged in Simple.
- **Search** always searches everything. In Simple mode, results that are folded away or live under More options carry an **Advanced** tag. Opening one opens More options at that section.
- **Default:** new users (setup not finished) start Simple; existing users keep Advanced so nothing disappears. A one-time chip ("New here? Simple shows the essentials." / "Too much? Try Simple") offers the other mode until one is picked.
- **Stored** as `settingsMode` in config (`""` until chosen, then `"simple"` or `"advanced"`). It's in the control catalogue, so "Lens, show advanced settings" works.
- **Reduced motion:** no slides, no pulses.

## What Simple shows

| Page | Cards (visual aid) |
|---|---|
| Appearance | Theme (8 real pack previews, "All themes ›"); Light/Dark/Auto; Accent (8 swatches); Living wallpaper (animated spectrum, opens Creator) |
| Dock & Bar | Dock style (6 real mini Docks); Size (slider and live icon preview); Auto-hide (animated window and Dock illustration and choice); Screen edge (4 edge diagrams) |
| Windows & Keys | Window buttons (real dots: Yellow·Green·Red default, Green first, Mac order, Windows buttons); Start with Windows (respects the dev-build guard); Hot corners (corner pulse); Alt + drag (moving window and Alt key) |
| AI & Command | Lens assistant on/off with engine tiles (Offline / On this PC / Claude, "Connect Claude ›"); Lens Command (mini bar); Magic right-click (mini menu); Voice (try it / settings) |

**Reset** (in the open More options row): Dock goes back to 40 px, bottom edge and auto-hide off. Windows & Keys goes back to Yellow·Green·Red, with hot corners and Alt+drag off.

## Visual-aid audit

Everything shown in Simple now has a visual. The remaining Advanced-only settings that still have none are listed for a later pass:

- **Appearance › Customise:** fonts, folder icon style, shape style (the shape style has chips but no preview).
- **Dock & Bar:** top bar height, clock format, magnification amount (a number only).
- **Windows & Keys:** hotkey list, window rules, shell mode.
- **AI & Command:** engine privacy modes, permissions, context packs, the right-click order editor.
- **Desktop:** sessions and widgets (text rows).
- **Windows pages:** Focus, Privacy, Update, Time, Accessibility and Gaming are mostly rows and toggles. They are fine for Advanced, but a few would benefit from icons.

## Files

- `src/settings/simple/mode.ts`: mode rules, the Simple page lists, search tagging, reset (unit-tested in `src/__tests__/settings-simple.test.ts`).
- `src/settings/simple/SimpleView.tsx`, `MoreOptions.tsx`, `ModePill.tsx`, `simple.css`.
- Wiring: `src/settings/SettingsNav.tsx` (pill, folding, Advanced tag) and `src/surfaces/ControlCenterSurface.tsx` (cards and More options).
- Config: `settingsMode` (`config.rs`, `types/lens.ts`, `generated.ts`, control catalogue).
- These use the `src/ui` primitives (`Segmented`, `Toggle`) and motion tokens; there are no inline styles.
