# Command, Shelf and Clipboard — research

How the best launchers, clipboard managers and browser AI tools handle context, history, privacy,
commands, keyboard flow and density, and what Lens takes from each. Written for Wave 6 package
W6-D (Lens Command, Shelf, clipboard history v2).

## Method

About 30 lookups (November 2026), with primary sources wherever possible: product manuals, GitHub
READMEs and Microsoft Learn. Quotes are kept under 15 words, at most one per source; the rest is
paraphrased.

Not verified first-hand:
- **Sider:** its help pages refused the fetch.
- **Merlin, MaxAI, Monica:** only store-listing titles were found.
- **Pieces:** only store listings were found.
- **Arc Max:** arc.net now shows only Arc's shutdown notice.
- **Windows Win+V:** behaviour is described from the platform documentation for clipboard formats.

Features from these products are described from general product knowledge and are marked *(unverified)*.

## What each product teaches

| Product | Best idea | Source |
|---|---|---|
| Raycast Clipboard History | Ignored apps, with password managers excluded by default. Filter by type (text, image, file, link, colour). "Paste as…" any captured format. Paste sequentially. Delete by time window. Rename and pin. | [Raycast manual](https://manual.raycast.com/clipboard-history) |
| Raycast placeholders | `{selection}`, `{clipboard offset=1}`, `{browser-tab format="markdown"}`, `{argument name= options=}`, plus chained modifiers like `{clipboard \| trim \| uppercase}`. | [Dynamic placeholders](https://manual.raycast.com/dynamic-placeholders) |
| Raycast Quick AI | Type in the root search, press Tab and the answer streams in place. Return pastes the answer back. Ctrl+J continues in full chat with its attachments. `@` adds context. | [Quick AI](https://manual.raycast.com/ai/quick-ai) |
| Raycast Screen Awareness | Capture only on request; it says "Nothing is captured in the background." An attachment card shows exactly what was included, and password fields are excluded. | [Screen Awareness](https://manual.raycast.com/ai/screen-awareness) |
| Alfred Clipboard | Off by default for privacy. Merge (⌘CC appends to the last clip). Clear the last 5 or 15 minutes. Maximum clip size. 1Password and Passwords are ignored by default. | [Alfred help](https://www.alfredapp.com/help/features/clipboard/) |
| Maccy | Always ignores transient, concealed and auto-generated pasteboard types. Option-click pauses capture; Option-Shift-click ignores only the next copy. Pinned items get a permanent shortcut. | [Maccy README](https://raw.githubusercontent.com/p0deje/Maccy/master/README.md) |
| Paste (Mac) | A horizontal strip of cards that show the source app icon and a footer with character count or link title. Pinboards are named, coloured collections. The Paste Stack collects copies and pastes them in order. | [MacStories review](https://www.macstories.net/reviews/paste-the-clipboard-management-utility-gets-an-elegant-new-design-on-the-mac/) |
| Ditto | Groups and subgroups. Paste-special transforms (case, trim, slugify, remove line feeds). Search with regex or wildcards. Encrypted send to other PCs. | [Ditto features](https://deepwiki.com/sabrogden/Ditto/1.2-features) |
| CopyQ | Tabs, notes and tags on items. Ignore rules by window or by text. Commands that run when the clipboard changes. A scriptable CLI. | [CopyQ](https://github.com/hluk/CopyQ) |
| Windows clipboard formats | `ExcludeClipboardContentFromMonitorProcessing` (any data) blocks all history and sync. `CanIncludeInClipboardHistory` (DWORD 0) blocks history. `CanUploadToCloudClipboard` (DWORD 0) blocks sync only. | [Microsoft Learn](https://learn.microsoft.com/en-in/windows/win32/dataxchg/clipboard-formats) |
| PowerToys Advanced Paste | Local conversions with no AI: plain text, markdown from HTML, JSON from CSV/XML/INI, file outputs, OCR. AI is opt-in, with a provider per action, including local Ollama and Foundry Local. A preview before pasting. A CLI. | [Microsoft Learn](https://learn.microsoft.com/windows/powertoys/advanced-paste), [Windows Central](https://www.windowscentral.com/software-apps/powertoys-breaks-free-from-openai-limits-advanced-paste-now-works-with-multiple-ai-models) |
| Page Assist | A sidebar on any page for chatting with the page, using Ollama, Chrome's built-in AI or any OpenAI-compatible endpoint. Data stays in browser storage. Keyboard shortcuts throughout. | [GitHub](https://github.com/n4ze3m/page-assist) |
| Brave Leo BYOM | Local models via any OpenAI-compatible endpoint (Ollama `/v1/chat/completions`). Page and PDF context stay on the device. Brave is not in the request path. | [Brave blog](https://brave.com/blog/byom-nightly/) |
| Firefox AI chatbot | Right-click prompts on a selection (Summarize, Explain this, Quiz me, Proofread) send prompt, selection and page title. "Summarize page" sits in the sidebar. | [Mozilla support](https://support.mozilla.org/sv/kb/ai-chatbot) |
| Chrome built-in AI | The Summarizer types (key-points, tldr, teaser, headline) × lengths (short, medium, long) × format (markdown, plain) are a ready-made design for /summarise options. | [Chrome docs](https://developer.chrome.com/docs/ai/summarizer-api) |
| Apple Writing Tools | A small, fixed verb set: Proofread, Rewrite (Friendly, Professional, Concise), Summarize, Key Points, and "describe your change". | [Apple support](https://support.apple.com/guide/mac-help/mchldcd6c260) |
| Obsidian Web Clipper | Template variables (`{{content}}` as markdown, `{{selection}}`, `{{url}}`, `{{highlights}}`) and "prompt variables" filled by a model, only if the interpreter is enabled. | [Obsidian help](https://obsidian.md/help/web-clipper/variables) |
| Readwise Ghostreader | Jinja prompts over `document.content` and highlights. Truncation helpers (`central_paragraphs`, `central_sentences`, `num_tokens`) keep long documents within the model's context window. | [Readwise docs](https://docs.readwise.io/reader/guides/ghostreader/custom-prompts) |
| Windows Recall (cautionary) | After a backlash it became opt-in with a "clear, unavoidable choice", required Windows Hello, and kept per-app filters and pause. | [PCWorld](https://www.pcworld.com/article/2360514/microsoft-retreats-on-recall-always-on-screenshots-will-be-opt-in.html) |
| Sider, Monica, MaxAI, Merlin *(unverified)* | A floating selection toolbar plus a right-click menu with Explain, Translate, Summarise and Rewrite. Prompt libraries. Dense UIs with many models and upsells, which is what Lens should *not* look like. | store listings |
| Pieces *(unverified)* | Every saved snippet keeps its origin (URL, app, time), so the context can be traced later. | store listings |

## Ranked features

Ranked by how many leading products ship the feature and how much it matters for Lens's goals. "Build" means it is in this PR.

| # | Feature | Best at it | Lens plan |
|---|---|---|---|
| 1 | Clipboard history with private formats honoured and password managers ignored by default | Raycast, Maccy, Alfred | **Build**: honour all three Windows formats, a default exclusion list of 12 password managers, and a size cap. |
| 2 | Off by default, local only, encrypted at rest | Alfred, Page Assist | **Build**: opt-in, DPAPI-sealed file under `%APPDATA%\LensUI\clip`. |
| 3 | One input where Tab switches from search to ask, answers stream in place, and Enter pastes back | Raycast Quick AI | **Build**: the Command mode pill, compact then expanded, with "Paste answer". |
| 4 | `@` to attach context, with a visible card showing exactly what will be sent | Raycast | **Build**: a context strip of chips, each with its destination (Local / Claude). |
| 5 | Prompt templates with placeholders and modifiers | Raycast, Obsidian, Ghostreader | **Build**: a `commands.json` with `{selection}`, `{clipboard}`, `{shelf}`, `{page}`, `{lang}` and `\| trim`, `\| upper`, `\| lower`, `\| first:N`. |
| 6 | Paste-as formats (plain, markdown, trimmed, original) | PowerToys, Raycast | **Build**: `clip_paste(id, as)`. Markdown from HTML is a local converter with no AI. |
| 7 | Named collections (pinboards, tabs, groups) | Paste, CopyQ, Ditto | **Build**: the Shelf, with multiple named shelves, pins, tags and reorder. |
| 8 | Fixed right-click verbs on selections and pages | Firefox, Apple, Sider | **Build**: /summarise, /explain, /translate, /rewrite, /fix, /todo, /extract, /compare, /ask-page; the browser bridge maps its menu items to these. |
| 9 | Summary shape options | Chrome Summarizer | **Build**: /summarise takes `key-points` (default), `tldr`, `headline` and a length. |
| 10 | Long-context safety | Ghostreader | **Build**: `shelf_as_context` estimates tokens and truncates per item, with a visible "trimmed" note. |
| 11 | Pause capture, ignore the next copy, clear the last N minutes | Maccy, Alfred | **Build**: pause for 10 minutes, ignore next, clear 5 min / 1 h / all. |
| 12 | Filter by type and keep the source app and URL | Raycast, Paste, Pieces | **Build**: kind filter chips; items record `source_app` and `url`. |
| 13 | Paste stack (sequential paste) | Paste, Raycast | Planned: needs a paste-queue hotkey. Spec in COMMAND.md. |
| 14 | Merge clips | Alfred | **Build**: select several clips, then "Merge to Shelf". |
| 15 | OCR of image clips | PowerToys, Raycast | Planned: Windows.Media.Ocr is local. |
| 16 | Commands that run when the clipboard changes | CopyQ | Not now. Automation on raw clipboard data is a privacy trap without a clear UI. |
| 17 | Cross-device sync | Ditto, Windows | Not built. Everything stays local. |

## The 10 design principles for Lens Command

1. **Nothing is captured until you ask.** Clipboard history, the Shelf and Command are all off by default, and Lens never captures the screen.
2. **What gets sent is always visible.** Every context chip says what it is, its size, and where it goes (Local or Claude) before anything is sent.
3. **Local first.** The script engine and local models are the default for every built-in command. Claude is chosen per command, never by surprise.
4. **One input, one thread.** Ask, do, shelf, clipboard and actions share one field and one timeline. There is no second chat window.
5. **Keyboard first.** Tab cycles modes, `/` opens commands, `@` attaches, ↑↓ moves through results, Enter runs, Ctrl+Enter pastes back, and Esc steps back one level.
6. **Calm density.** One column, a 4 px grid, 13/12 px type, a single accent, and no model zoo, upsells or badge clutter.
7. **Honour the platform's privacy signals.** That means the Windows private-clipboard formats, the per-app ignore list, and the pause control.
8. **Every result is reusable.** Any answer, clip or page can go to the Shelf, be pasted or be exported to Markdown.
9. **User-extensible without code.** Commands are a plain JSON file of templates, and Lens ships its own defaults in that format.
10. **Reversible and quiet.** No registry changes, data lives under `%APPDATA%\LensUI`, "Clear" really deletes, and turning a feature off stops capture immediately.

## Don't do

- **Always-on screen recording or background capture.** Recall shows the backlash, and it is unnecessary for these features.
- **Silent cloud sends.** Each cloud request needs the privacy mode or an explicit consent card (feature/ai-core).
- **Capturing clipboard content from password managers or marked private.** Never store it, even temporarily on disk.
- **Auto-paste.** Paste only after the user picks an item; never type into a window the user did not choose.
- **Running automation on clipboard changes.** It turns a history tool into a keylogger-shaped surface.
- **Uploading attachments to a Lens server.** There is no Lens server.
- **A model picker on every message.** Choose the provider per command in settings and show a badge, not a dropdown.
- **Floating selection toolbars over every app.** They are intrusive; use the hotkey, the right-click menu in the browser, and the dock sparkle instead.
