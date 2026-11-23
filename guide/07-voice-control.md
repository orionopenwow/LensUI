---
id: voice-control
title: Voice control
summary: Say "Lens, minimise this" and more, with push-to-talk or a wake phrase.
minutes: 3
order: 7
requires: config.voice exists
requiresNote: Voice control isn't in this build yet. This lesson unlocks when it lands.
---

## Turn on voice
show: settings:ai:Voice
check: config.voice.enabled == true

Push-to-talk is the default. A wake phrase is optional and always shows a mic indicator while listening. Audio stays on this PC.

## Say a command
check: event:voice-intent

Hold the push-to-talk key and say "minimise this" or "dark mode". The recognised command appears as a chip, with Undo when it can be undone.

## Ask a question
check: event:voice-ask

Say "Lens, how do I change the dock style?". The Guide answers and offers "Show me".
