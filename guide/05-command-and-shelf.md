---
id: command-and-shelf
title: Lens Command, Mini, Shelf and context packs
summary: One box for asking and doing, a pocket version, and a standing clipboard for context.
minutes: 5
order: 5
---

## Turn on Lens Command
show: settings:ai:Lens Command
check: config.command.enabled == true

Lens Command is one input with modes: Ask, Do, Shelf, Clipboard and Actions. Tab cycles modes, "/" lists commands, "@" attaches context.

## Do something without AI
show: command
check: event:command-intent

Type "dark mode" or "volume 30". The script engine does it instantly, with no model and nothing sent anywhere.

## Open Lens Mini
show: mini

Tap the Command shortcut once for Mini next to your pointer; tap again for the full view. Mini's tiles change with the app you're in.

## Add things to the Shelf
show: settings:ai:Clipboard history

The Shelf keeps selections, pages, files and answers ready to use as context. Drag things onto the edge Shelf tab, or use "Add to Shelf" on any answer.

## Use the Shelf as context
show: command

Type "@" in Command and pick Shelf items. The chips under the input show exactly what will be sent and where (Local or Claude). Remove any chip before sending.
