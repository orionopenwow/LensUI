# Third-party notices

Lens credits the projects whose ideas or formats it follows here. This includes projects it borrows only ideas or formats from, without bundling their code.

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

## Simple Icons — website demo only

- Source: <https://github.com/simple-icons/simple-icons> · licence: CC0 1.0 Universal.
- Used: a handful of brand marks (Spotify, Discord, Chrome, Steam, Obsidian, Figma, VSCodium, Firefox,
  GitHub, Notion…) vendored in `tools/site/vendor/simple-icons/`, drawn as brand-colour tiles in the
  website's live dock to illustrate apps a person might pin. Nothing ships in the Lens app.
- The trademarks belong to their owners. Lens is not affiliated with or endorsed by them.
- Windows built-ins (File Explorer, Notepad, Terminal) are shown with original generic stand-ins, not
  Microsoft's artwork. Open-source apps (Krita, Blender, OBS Studio, Ollama, ArtCraft…) use the icon from
  each project's own repository, under that project's licence.

## Cider — learned from, nothing used

Lens Music's Immersive mode, artwork-tinted pages, lyric translation, Discord presence and its
setup/Tweaks pages were inspired by Cider (cider.sh), a community Apple Music client. Its licence
for reuse is unclear, so nothing of it is in Lens: no code, assets or copy. The Lens versions were
built from Cider's public site and observed behaviour (docs/features/music.md › 10). Credit only.

## Discord RPC — protocol only

`src-tauri/src/music/discord.rs` speaks Discord's documented local RPC framing to the Discord app
on the same PC. It is Lens's own code (standard library only); no Discord SDK or library is
bundled or linked.
