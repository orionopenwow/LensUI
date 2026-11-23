# Fifteen workflows across one desktop

Each storyboard shows the surfaces involved (→), the objects and verbs, and where approvals stop the flow. Status tags show what each workflow needs. **Bold steps** are approval points.

---

## 1. Research a purchase
*"Best noise-cancelling headphones under $350 for long flights."*

1. **Command** (Ctrl+Alt+Space) takes the request and starts a **Run** in the *Personal* Space.
2. **Lens Browser** opens three shop tabs and two review sites. Dock ring on the browser icon.
3. The timeline shows "search · sort · open ×6 · kept 3".
4. It returns a comparison table with a *My pick* tag, and each row is Shelf-able.
5. "Add the winner to my cart" → **Needs your OK: Add to cart · $328 · arrives Fri** → Approve.
6. The checkout is never paid by the agent; you finish it yourself.

- **Objects:** Run, Tabs, Pages, Shelf items.
- **Verbs:** search, compare, add to cart.
- **Needs:** PR #20, #21; Planned: rich result cards.

## 2. Plan a dinner
*"Seafood Friday for four, somewhere Maya can eat (vegan)."*

1. Voice or Command → Run.
2. The browser compares 31 places and shows a map card with four picks.
3. **Needs your OK: Book Saltgrass for 4 · no-show fee $25/person.** The card shows the target form and "I'll click this", and you approve with HOLD.
4. Confirmation → "Add to calendar" (link) → **Needs your OK: Send to Maya** (message preview) → you press send in the chat app.

- **Objects:** Run, Pages, Approval ×2.
- **Verbs:** compare, book, draft message.
- **Needs:** PR #20, #21; Planned: place cards.

## 3. Triage email
*"Clean up newsletters older than 30 days, keep anything about travel or tax."*

1. Mail web app on the dock (web app, W8-A) → Command run in that tab.
2. It counts by category and sets aside "keeping: flight, lease, tax receipt".
3. **Needs your OK: Delete 2,315 · goes to Bin, restorable 30 days · Review all.**
4. Done toast with undo.

- **Objects:** web app, Run.
- **Verbs:** extract, delete-to-bin.
- **Needs:** W8-A, PR #20/#21.

## 4. Study a YouTube lecture into notes

1. Open the lecture in Lens Browser or Chrome with the extension.
2. Transcript panel: click-to-seek, find.
3. "Summarise into key points" (local) → **Add to Shelf** → pack *Lecture 4*.
4. Micro-save two quotes while watching (Ctrl+Alt+Shift+S), merged into one item.
5. `/note` in Command builds notes from the pack, then exports Markdown.

- **Objects:** Tab, transcript Shelf item, Pack.
- **Verbs:** transcribe, summarise, micro-save, pack.
- **Needs:** PR #19, #20.

## 5. Fix a bug with Claude Code from a snip

1. **Snip** the error dialog → pre-save studio auto-redacts a token it found → **Copy text (OCR)**.
2. Add the snip to pack *Bug 412* along with the log file (Explorer right-click → Add to pack).
3. Claude Code (connected over MCP) reads `lens://pack/bug-412` → proposes a fix in your terminal.
4. Lens never runs your code; Claude Code's own approvals apply.

- **Objects:** Snip, File, Pack, MCP resource.
- **Needs:** PR #19, #21, #24.

## 6. Write a report from a Shelf pack

1. Through the week: micro-saves, pages and transcripts land in pack *Q4 review*, with the size meter showing 41k tokens.
2. "Draft a two-page report from this pack": auto-trim proposes summarising long items locally first → OK.
3. The draft appears in the Command thread → "Open as doc" or copy Markdown with sources.

- **Objects:** Pack, Run.
- **Verbs:** trim, draft, cite.
- **Needs:** PR #19; Planned: export to doc.

## 7. Morning setup by voice
*"Lens, morning."*

1. A custom phrase maps to a script routine (W8-D), with no model needed:
   - switch to *Work* Space;
   - open Linear, Mail and Calendar web apps;
   - snap them;
   - DND until 10:00;
   - Playground scene "Sky Clock".
2. The voice HUD shows the chips with one undo for the whole routine.

- **Objects:** Space, Windows, web apps.
- **Verbs:** switch, open, snap, set DND.
- **Needs:** PR #23; Planned: routines, desktop Spaces.

## 8. Focus session

1. Top bar → *Focus 50 min*, or say "Lens, focus for 50 minutes".
2. DND turns on, dimming of inactive windows turns on, and the dock auto-hides.
3. The *Deep work* Space shows only its pinned apps. Optionally the Playground goes to Calm.
4. At the end: a gentle chime (optional), everything restored, and a summary of what got saved to the Shelf.

- **Needs:** Integrated (DND, dimming), PR #23; Planned: focus routine.

## 9. Clean the desktop and downloads

1. "Tidy my desktop and downloads" → Run → groups by type and age, shows counts and what it'll keep.
2. **Needs your OK: Move 214 files into Archive\2026-11 · nothing deleted.**
3. Old installers: **Needs your OK: Recycle 37 installers (4.1 GB) · restorable**.
4. One undo restores every path.

- **Objects:** Files, Run.
- **Verbs:** group, move, recycle.
- **Needs:** PR #21; Planned: file tidy tools (W8-E).

## 10. Meeting notes

1. A meeting app comes to the front. If enabled, Lens Mini offers "Start notes?" — a quiet chip, local suggestion.
2. With explicit start: local transcription (whisper) with a visible recording indicator.
3. At the end: summary and action items as Shelf items, and **Needs your OK: Send summary to #team** (message preview).

- **Needs:** PR #15 transcription; Planned: meeting recorder (MASTERPLAN "Later").

## 11. Share a snip with a friend

1. Snip a region → arrow and blur → **Recent: Maya · WhatsApp** chip.
2. The image goes into WhatsApp's share flow with Maya selected; **you press Send** there.
3. Alternative: **Paste to Claude** → the consent card shows the image and OCR text → ask.

- **Needs:** PR #24.

## 12. Theme the desktop from a wallpaper

1. Drop an image on the sparkle → "Make a theme from this".
2. A local palette is extracted and the contrast-checked accent and tokens are previewed with before/after on the approval card.
3. Approve → theme, dock style, pointer accent and border gradient applied as one change with one undo → "Save as .lenstheme".

- **Needs:** PR #21 (batch + preview); Planned: ECO-3 "rice in 60 s".

## 13. Travel rebooking
*"My flight got cancelled, find the best rebooking."*

1. Run in the browser: the airline page, options compared against your calendar (read only).
2. **Needs your OK: Pay the $84 fare difference? · Amex ··1007 · Non-refundable once ticketed.** Payments are blocked by default, so this card appears only if you set this run's payments to Ask first, and it needs HOLD.
3. Confirmation → Shelf item and calendar link.

- **Needs:** PR #20/#21.

## 14. Learn a new app with Guide

1. Open Blender for the first time → Guide chip: "Tips for Blender?" (only the app name is sent, local first).
2. "Do it with me": the helper shows one step at a time and waits for your click. No automation.
3. "Turn this into a how-to" → numbered snips plus text in the Shelf.

- **Needs:** PR #18; Planned: Teach-me mode (W8-C).

## 15. Hand off from phone (future companion)

1. Away from the PC: the phone shows a **Needs your OK** for the running dinner booking → Approve with Face ID or fingerprint.
2. "Continue the lecture notes on my PC": the pack opens in Command when you sit down.
3. Voice remote: "Lens, lock my PC".

- **Needs:** Planned: W8-H phone companion (see [roadmap](roadmap.md#phone-companion)).
