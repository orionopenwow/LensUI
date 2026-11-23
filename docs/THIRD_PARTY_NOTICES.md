# Third-party notices

Lens UI credits the projects whose ideas or formats it follows here. This includes projects it borrows only ideas or formats from, without bundling their code.

## Obsidian Web Clipper — template syntax

- Project: https://github.com/obsidianmd/obsidian-clipper
- Licence: MIT, Copyright (c) Obsidian
- Used for: the clipper template syntax, `{{variable|filter:"argument"}}`, and the idea of chained variable filters.
- Lens's parser (`src/context/templates/parser.ts`) is its own implementation of that syntax. No code was copied.

The MIT licence permits use with attribution. The full licence text is in the project repository.

## SingleFile — not used

SingleFile (AGPL-3.0) is the best-known page-archiving extension. Lens does not use or vendor it.

"Save page offline" is Lens's own DOM-snapshot approach (`extensions/browser/src/content/snapshot.js`). Lens Browser uses WebView2's built-in MHTML capture.

## YouTube captions

"Get transcript" reads the caption track the YouTube page has already loaded, the same request the player makes when captions are turned on. Nothing is downloaded from third-party services.

## Dictionaries

Lens does not include an offline dictionary. Double-click "Define" uses the user's local model only.

WordNet 3.0 (Princeton) is a redistributable option for a future offline fallback. Its licence permits redistribution with its notice, but its size (about 30 MB) needs a separate decision.
