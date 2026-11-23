# Dock × Browser: one launcher, one switcher

Today the dock knows about apps and windows (**Integrated**), and Lens Browser knows about tabs and Spaces (**In PR #20**). This doc fuses them so the dock becomes the switcher for **everything you have open**: desktop apps, web apps, tabs, running agents, media and downloads.

Every behaviour below is **Planned** unless marked otherwise, is off by default, and has a setting under *Dock & Top Bar › Browser on the dock*.

## 1. Web apps are first-class dock items

```
 ┌──────────────────────────────────────────────────────────────┐
 │  [Files] [Code] [Spotify] │ [Gmail•3] [Figma] [Linear] │ [⬇] [◔] │
 │   desktop apps            │   web apps (Lens Browser)   │ stacks │
 └──────────────────────────────────────────────────────────────┘
```

- **Make a web app:** "Pin as app" on any tab, from right-click, the address bar or Command (`/pin-app`). It creates a dock item with the site's icon, a name, and its own Lens Browser window. That window has a chromeless frame with only the back and reload buttons and the site's own title.
- **Profile:** a web app opens in its Space's profile by default, or in a dedicated profile ("Separate sign-in") for work/personal splits.
- **Badges:** read the unread count from the page title pattern `(3) …` and from the app badge API where the site sets one. Off per app.
- **Behaves like a native app:** Alt+Tab, Overview, snapping, window rules, focus dimming and summon hotkeys all treat web-app windows like native apps, because they are real windows.
- **Edge cases:**
  - The site's icon is missing: Lens falls back to a monogram tile in the theme accent.
  - The site redirects to another origin: the window keeps its dock identity, and the origin shows in the title-bar chip.
  - A login popup opens as a child window that is not pinned.

## 2. Tabs grouped under dock icons

```
            hover ▼
   ┌────────────────────────────────────┐
   │ Work · 6 tabs                      │
   │  ▸ Linear — Sprint board     ◉ now │
   │  ▸ Stripe — Payments              │
   │  ▸ HN — Show HN: Lens…   🔊        │
   │  ▸ docs.rs — tauri                 │
   │  [ thumbnail of hovered tab      ] │
   │  ⏎ open · ⇧⏎ new window · ⌫ close  │
   └────────────────────────────────────┘
          [ Lens Browser ]
```

- The Lens Browser dock icon shows the **current Space's tab count** as a small mono number. It is not a red badge.
- Hovering shows the Space's tabs as a list with a live thumbnail of the hovered one. Integrated hover previews and the peek API from PR #10 provide the thumbnail.
- Scrolling on the icon cycles tabs. Middle-click opens a new tab in this Space.
- **Optional "tabs as icons" mode** for people who want every tab on the dock (taskbar/studio styles only):
  - each tab becomes a small icon after the browser icon, capped at 8, and the rest go into a "+N" stack;
  - it follows the dock's "never combine / labels" option (PR #8).
- **Edge cases:**
  - Sleeping tabs show dimmed.
  - Audible tabs show a speaker glyph.
  - Tabs waiting on an approval show the amber approval dot (see §4).

## 3. Space stacks and per-Space dock profiles

- A **Space stack** is a dock folder that opens a fan or grid with the Space's pinned sites, web apps, files and its active pack.
- Each Space can bind a **dock profile** (W5-F, Planned): pinned apps, style, size and system-area position. Switching Space swaps the profile with a 120 ms cross-fade, or instantly with reduced motion.
- **Space switcher:**
  - the first item of the dock in taskbar/studio styles, or a pill in the top bar;
  - shows the Space name, its accent dot and a mono shortcut chip (`⌃⊞1`).
- **Defaults:** one Space, "Personal", with the current dock as its profile. No behaviour changes until a second Space is made.

## 4. Running agents on the dock

```
   [Lens Browser ◔]   ← progress ring = run working
   [Lens Browser ◉]   ← amber dot = waiting for your OK
   [Lens Browser ✓]   ← brief check, then clears
```

- Any **Run** (see [unified-model](unified-model.md#runs)) attaches to the dock item of the app it acts in. That's Lens Browser for web runs, the target app for window runs, and the Lens sparkle for settings runs.
- **Progress ring** while working. It is indeterminate unless the run reports steps; then it fills by completed steps.
- **Approval dot** (amber) when the run is waiting. Clicking the icon opens the **Needs your OK** card anchored to the dock (from PR #21), and the top bar pill shows "Approve N actions" with its shortcut.
- **Done:** a short check animation, then a quiet toast with the outcome and undo. Failed runs show a red dot until opened.
- **Rules:**
  - Never animate or bounce for a run that is merely working.
  - The amber dot is the only attention signal, and it never flashes.

## 5. Tear-off: tab ⇄ desktop window

- **Out:** drag a tab out of the browser sidebar onto the desktop and it becomes its own window. It keeps the same webview, so no reload, and gets the same chromeless web-app frame as §1. It appears on the dock under Lens Browser, or under its pinned web app if one exists.
- **In:** drag a web window's title chip back onto the browser sidebar or the Lens Browser dock icon to re-dock it as a tab.
- **Snap together:** drop a tab on a screen edge to snap it with Lens snapping. Drop two tabs side by side to make a split view inside the browser.
- **Edge cases:**
  - Dragging across monitors with different DPI rescales the webview.
  - A tab in an agent run cannot be torn off mid-step; the drag waits for the step to end.

## 6. Media controls on the dock

- Any audible tab or media app exposes **play/pause, next, previous and mute** on hover of its dock icon, plus a slim scrubber in the hover card.
- Sources: Lens Browser's media session for tabs, and Windows' system media transport controls for other apps.
- Optional "Now playing" chip in the top bar and on Lens Mini's Glance tab.
- **Defaults:** media hover controls on; the top bar chip off.

## 7. Downloads stack

- A **Downloads** stack sits at the end of the dock and fans or grids the last 12 downloads with type icons and size. During a download it shows a progress ring.
- Item actions:
  - Open, which goes through Windows' file association and is never run by Lens;
  - Show in folder;
  - Add to Shelf;
  - Summarise or Transcribe, where the type allows;
  - Move to…;
  - Delete, which goes to the Recycle Bin and asks first.
- **Safety:** Lens shows Windows' Mark-of-the-Web status and never runs downloaded executables itself.
- **Defaults:** the stack is off; it appears after the first download if the user enables "Show downloads on dock" in the browser setup.

## 8. Drop anything on anything

The dock is a drop target for verbs (Integrated: drop a file on an app; In PR #12: drop on the sparkle):

| Drop… | …on | Does |
|---|---|---|
| File | App icon | open with that app (Integrated) |
| File / text / image | Sparkle | verb menu: summarise, transcribe, ask, Shelf (Integrated/PR #12) |
| Tab (from sidebar) | Web app icon | move the tab into that app's window |
| Tab | Space stack | move the tab to that Space |
| Anything | Shelf edge tab | save to Shelf (Integrated) |
| Shelf item | App icon | paste or open it in that app (text via clipboard, file via open-with) |

## 9. Settings (one card)

*Dock & Top Bar › Browser on the dock*:

| Setting | Default |
|---|---|
| Show web apps | on |
| Tab count | on |
| Tabs as icons | off |
| Hover tab list | on |
| Run rings | on |
| Media hover controls | on |
| Downloads stack | off |
| Space switcher placement | Auto: dock in taskbar/studio, top bar otherwise |
| Per-Space dock profiles | off until a second Space exists |

## 10. Performance budget

- **Dock idle:** stays within the MASTERPLAN budget (≤ 180 MB idle across dock and top bar).
- **Thumbnails:** tab thumbnails are captured only on hover, cached for 30 s and downscaled to 320 px.
- **Badges:** polled at most every 30 s, and only for pinned web apps that are open.
- **Run rings:** event-driven, no polling.
