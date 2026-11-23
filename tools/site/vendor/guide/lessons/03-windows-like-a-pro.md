---
id: windows-like-a-pro
title: Windows like a pro
summary: Snapping, Alt+drag, hot corners, workspaces and summon keys.
minutes: 5
order: 3
---

## Snap and arrange
show: command

In Lens Command type "snap left", "snap right" or "arrange windows". Windows' own Win+← and Win+→ still work too.

## Move windows with Alt+drag
show: settings:system:Drag Windows
check: config.altDrag.enabled == true

Turn on Alt+drag. Then hold Alt and drag anywhere inside a window to move it, or Alt+right-drag to resize. Full-screen and admin windows are left alone.

## Set a hot corner
show: settings:system:Hot Corners
check: config.hotCorners.enabled == true

Give a screen corner an action, like Overview or Show desktop. Rest the pointer there to trigger it. Corners pause while a game or full-screen app is in front.

## Use workspaces
show: settings:sessions
check: config.workspaces.enabled == true

Workspaces keep groups of windows apart. Switch with the workspace strip in Overview, or type "workspace 2" in Lens Command.

## Summon an app with one key
show: settings:system:App hotkeys

Pick an app and a key. That key shows it, hides it, or launches it if it isn't running, like a drop-down terminal.
