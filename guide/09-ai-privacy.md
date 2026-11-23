---
id: ai-privacy
title: AI privacy explained
summary: What Lens AI can see, where it goes, and how to keep it all on this PC.
minutes: 3
order: 9
---

## AI is off until you turn it on
show: settings:ai
check: config.ai.enabled == true

Nothing AI-related runs until you enable it. The first engine is a script engine that needs no model at all.

## Choose an engine
show: settings:ai

Script (instant, offline), a local model (Ollama, LM Studio or llama.cpp on this PC), or Claude with your own key stored encrypted on this PC.

## Pick a privacy mode
show: settings:ai
check: config.ai.privacy != allow_cloud

Local only (the default) never sends anything off this PC. Ask each time shows exactly which context would be sent before it goes. Allow cloud sends without asking.

## See what was sent
show: settings:ai

The usage log lists which engine answered, token counts and which kinds of context were attached. It never stores your prompts or answers.
