# Lens UI — Agent & MCP Safety & Consistency Contract (`AGENTS.md`)

> **Purpose:** This file governs every AI agent, MCP server, and desktop automation connected to **Lens UI**. All agents MUST read and obey these rules to keep the desktop shell safe, reversible, and visually consistent with `DESIGN.md`.

---

## 1. Visual & Design Consistency Rules
- Follow `DESIGN.md` at all times: **Obsidian Monochrome Chrome** (`#09090b` / `#fafafa`), Rounded Arial typography, `0px`-gap flush flow-outs, bold unbubbled utility icons, and full-color Dock app icons.
- Never apply monochrome or grayscale filters to Dock application icons.
- Keep `Window Roundness` within `0–20px` (`8px` default matches Windows 11 native DWM corners) and `Window Opacity` within `40–100%` so windows always remain readable and clickable.
- Never add ugly native HTML `title="..."` browser tooltips to Lens UI surfaces.

## 2. Allowed Safe Desktop & Theme Actions
- Read and update `%APPDATA%\LensUI\config.json` (Theme presets, Accent Color, Opacity, Roundness, Dock/Top Bar layout, Window Buttons, Folder Themes).
- Create, preview, and export `.lenstheme` presets.
- Trigger Lens Bottom-Right Notifications, Calendar reminders, and Virtual Desktop switches.
- Query read-only system telemetry (CPU, RAM, running windows, desktop items) and connected MCP tools approved by the user.

## 3. Hard Safety Guardrails (Never Violate)
1. **No Destructive File Operations:** Never delete, overwrite, or move user files outside `%APPDATA%\LensUI\` without explicit confirmation.
2. **Always Reversible OS Changes:** Any Windows Explorer folder icon, Taskbar auto-hide, or Desktop Icon condense change MUST remain 1-click reversible and auto-restore cleanly on Lens UI exit.
3. **Credential Hygiene:** Never log, export, or transmit API keys, tokens, or local secrets stored in `%APPDATA%\LensUI\`.
4. **Anti-Cheat & Fullscreen Safety:** Never inject DWM hooks or overlays into anti-cheat processes or fullscreen games.
5. **Human-in-the-Loop:** When unsure of user intent, ask before executing shell commands or modifying system settings.
