---
id: make-it-yours
title: "Make it yours: themes, accents, dock and pointers"
summary: Pick a theme pack, an accent colour, a dock style and a mouse pointer that fit together.
minutes: 4
order: 2
---

## Choose a theme pack
show: settings:theme:Choose a theme
check: config.theme.preset != obsidian
success: New look applied. You can always return with "Reset to" in the hero.

The six recommended packs sit in one row. "Browse all" opens every pack with filters. A pack restyles surfaces, accents, icons, folders and window frames together.

## Set an accent colour
show: settings:theme
check: config.theme.accentMode == custom

Click a swatch, or open the colour wheel for any colour. "Windows" follows your Windows accent instead.

## Pick a dock style
show: settings:dock:Dock style
check: config.dock.style != floating

Floating, Slim, Taskbar, Studio, Minimal or Split. Each keeps the same feel; Taskbar and Studio add a system area with the clock.

## Choose a mouse pointer
show: settings:theme:Mouse pointer

Open "Mouse pointer" in Customise. Pick a family; it follows your accent colour. "Restore my Windows pointers" puts your old ones back exactly.
