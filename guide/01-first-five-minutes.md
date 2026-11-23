---
id: first-five-minutes
title: First 5 minutes with Lens
summary: Find your way around: Settings, the dock, the top bar and how to get back to normal Windows.
minutes: 5
order: 1
---

## Open Settings
show: settings:system
check: ui.surface == settings

Lens keeps every option in one place: Settings (the Control Center). Open it from the gear in the dock or the top bar. The tabs on the left group everything by area.

## Look around the tabs
show: settings:theme
check: ui.tab == theme
success: This is Theme & Look: theme at the top, options underneath.

Pick the Theme & Look tab. Every tab follows the same pattern: the main control first, then options below it.

## Find the dock
anchor: dock
show: dock

The dock sits at the bottom of the screen. Click an app to open it, right-click it for more, and drag apps to reorder them.

## Try the palette
show: palette
check: event:palette-opened

Press Alt+Space to open the palette. Type an app, a file or a command like "dark mode".

## Know your escape hatch
show: settings:about:Remove all Lens changes

Everything Lens changes can be undone. If anything ever looks wrong, the Windows & Quick tab has a one-click restore, and Restore-Windows-Shell.bat in the Lens folder does the same from outside Lens.
