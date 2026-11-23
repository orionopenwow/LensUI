# Lens vision: one desktop, not a pile of apps

> **Status legend used across the vision docs**
> - **Integrated:** on `integration/waves-4-6`, waiting for one PR into `main`.
> - **In PR #n:** an open package PR.
> - **Planned:** not built yet.
>
> Nothing here has been run on a real Windows desktop yet; the Tester Hub pass (TEST-1 in [MASTERPLAN](MASTERPLAN.md)) comes first.

## The thesis

Windows gives you a taskbar, a browser, a clipboard, a snipping tool, a voice assistant and an AI sidebar. Each is a separate app with its own idea of what "the thing I'm working on" is.

**Lens treats them as one system.** The dock, the top bar, the browser, Lens Command, the Shelf, voice, Snip, right-click and the AI helper are different *views* over the same few objects:

- windows, tabs and pages;
- files, snips and clips;
- Shelf items and packs;
- Spaces;
- runs and approvals.

The same few verbs work on all of them: ask, summarise, save, send, arrange, undo.

- A tab is an icon on the dock.
- A Space switches your browser tabs, your windows, your wallpaper and your focus mode together.
- What you snip, copy, micro-save or transcribe lands on one Shelf, which any surface can hand to the AI as context.
- Every action the AI wants to take shows up on one kind of card, in whichever surface you're looking at, and can be undone in one place.

The industry is converging on this from the browser side:

- [Atlassian bought The Browser Company](https://www.atlassian.com/blog/announcements/atlassian-acquires-the-browser-company) to make Dia a browser that "helps you do, not just browse".
- [Opera Neon](https://techcrunch.com/2025/09/30/opera-launches-its-ai-centric-neon-browser/) groups chats and tabs into Tasks.
- [Edge Copilot Mode](https://blogs.windows.com/msedgedev/2025/10/23/meet-copilot-mode-in-edge) groups history into Journeys.

From the desktop side, [KDE Activities](https://blogs.kde.org/2026/01/17/streamline-plasma-with-activities-to-be-more-focused-and-productive) has long switched wallpaper, widgets, apps and files together.

**Lens's bet:** do both on Windows, in one calm app that owns the whole desktop surface, not just a browser window.

## Principles (non-negotiable)

1. **Calm.** Quiet by default: no badges for their own sake, motion that settles, and one light primary button per card.
2. **Local-first.** The script engine answers common commands with no model, local models come next, and Claude only when you choose. This follows [Apple's on-device-first idea](https://security.apple.com/blog/private-cloud-compute/): data that never leaves the PC has no central point of attack.
3. **Approve everything that matters.** Anything that sends, submits, books, pays, deletes or signs in stops on a **Needs your OK** card that shows exactly what will happen and where.
4. **Undo everything.** Every look change, window action and setting can be undone. Deletions go to a bin first. "Remove all Lens changes" restores Windows exactly.
5. **Off by default.** Every feature, AI included, starts off. One master switch turns AI off everywhere.
6. **Works without AI.** The dock, Spaces, Shelf, Snip, right-click and Guide all work fully with AI off. AI makes them faster; it is never a requirement.
7. **No ambient capture.** No background screenshots or recordings, and no "remember everything" timeline. [Recall's reception](https://therecord.media/microsoft-reverses-course-recall-opt-in) shows how fast that trust is lost. Lens only captures what you explicitly snip, save or ask about.
8. **Pages and files are untrusted.** Content is data, never instructions. See [ai-helper.md](vision/ai-helper.md).

## What exists today

| Area | Status |
|---|---|
| Dock styles, themes, window styling, cursors, Playground, productivity (hot corners, Alt+drag), shell keys | **Integrated** |
| AI core (script → local → Claude), AI surfaces, browser extension bridge, transcription | **Integrated** |
| Lens Command, Lens Mini, Shelf, clipboard history, edge Shelf, selection bubble | **Integrated** |
| Tester Hub, master plan | **Integrated** |
| Lens Guide | **In PR #18** |
| Right-click everything, micro-saves, context packs, YouTube transcripts | **In PR #19** |
| Lens Browser (vertical tabs, Spaces, agent mode with approvals) | **In PR #20** |
| Claude control (Desktop State API, capability grants, unified approval card) | **In PR #21** |
| Robustness and fluidity test suites | **In PR #22** |
| Voice control and conversation mode | **In PR #23** |
| Lens Snip | **In PR #24** |
| The unified object model, Spaces across browser and desktop, dock ↔ browser fusion, phone companion | **Planned** (this folder) |

## Read next

- [Unified model](vision/unified-model.md): the objects, verbs, context, runs and Spaces everything shares.
- [Dock × Browser](vision/dock-browser.md): tabs, web apps, agents, media and downloads on the dock.
- [One AI helper](vision/ai-helper.md): many faces, one memory, one threat model.
- [Workflows](vision/workflows.md): 15 storyboards across surfaces.
- [Roadmap](vision/roadmap.md): W8+ packages, the phone companion and metrics.
- [Style](vision/style.md): dither, mono metadata, cards, timelines, voice.
- [Research notes](vision/research.md): the sources behind these choices.
