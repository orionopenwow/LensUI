# Lens Apps: research (2026-11-23)

What the user asked for: free tools like **concat** and **ArtCraft** offered as optional installs in an Apps section, with instant download, information, live thumbnails and setup integration, including **"that new TradingView GitHub repo rewrite"**. They also want the new rewrites of Docs, Slides and similar apps, plus full voice and menu integration.

My reading: Lens becomes a hub that curates the new wave of open-source rewrites of big paid apps. Each one is one click to install, and Lens then wires it into the Dock, right-click menus, voice, Command and the AI helper.

About 35 lookups. Quotes are kept under 15 words, one per source.

## 1. What the three named things are

| Asked for | What it is | Confidence |
|---|---|---|
| **ArtCraft** | [storytold/artcraft](https://github.com/storytold/artcraft) is an "IDE for artists": controllable AI image and video with 2D/3D scene tools. It is licensed MIT OR Apache-2.0, with stable Windows/macOS/Linux builds from [getartcraft.com](https://getartcraft.com). In October 2026 the same team launched a **suite of native Rust apps** on [getartcraft.com/apps](https://getartcraft.com/apps), installed and updated by one **Craft Launcher** ([storytold/craft-launcher](https://github.com/storytold/craft-launcher), v0.1.0, 10 Oct 2026). The suite includes PhotoCraft (Photoshop), VectorCraft, FilmCraft, LightCraft, PdfCraft, EffectCraft, AniCraft, DesignCraft, FigCraft (Figma), TextureCraft, MaterialCraft, SoundCraft, **WordCraft (Docs/Word), DeckCraft (Slides/PowerPoint), GridCraft (Sheets/Excel)**, CADCraft and Craft Anything ([TechAeris](https://techaeris.com/2026/10/07/artcraft-launches-7-open-source-creative/)). Most are early alpha or in development. | **High.** This matches "docs slides etc the new rewrite" too. |
| **concat** | [jub0t/Concat](https://github.com/jub0t/Concat) is "the truly free, open-source, local-first, cross-platform CapCut replacement". It has 11.9k stars and is AGPL-3.0-or-later. It is Rust + FFmpeg with local Whisper captions, scriptable over **JSON-RPC and MCP**. Windows ships a setup .exe and an .msi on GitHub Releases. Site: [concatenate.pages.dev](https://concatenate.pages.dev). Also covered by [JustUse](https://justuse.tech/concat/) and TechPP (Nov 2026). | **High.** Other "concat" hits are file-concatenation CLIs for AI prompts (FileKitty, ccat4ai, file-concat); they fit the "AI tools" context less well and aren't apps. |
| **TradingView rewrite** | No single repo is clearly *the* viral one. The candidates:<br>• [**degenview**](https://github.com/degenview/degenview) is a native Rust desktop app with a local **Pine Script v6** engine and Windows installer and portable builds (unsigned). It is GPL-3.0-only, has a paper-trading simulator only, and is the truest "rewrite".<br>• [**OpenCharts**](https://github.com/dylanpersonguy/OpenCharts) is an MIT, browser-based, self-hostable TradingView alternative on Lightweight Charts. It has 315 stars and +219 in 61 days ([Trendshift](https://trendshift.io/repositories/243036)).<br>• [**OpenStock**](https://github.com/Open-Dev-Society/OpenStock) is an AGPL-3.0 market dashboard with 16.3k stars; it uses TradingView widgets rather than replacing the charting. | **Medium.** I ship degenview (desktop) and OpenCharts and OpenStock (web), and mark the match as unverified. If the user meant a different repo, it's one catalogue entry to add. |

**Couldn't verify:**
- whether ArtCraft and Concat are in winget (the winget-pkgs tree blocks fetching), so both install from GitHub releases with checksum and signature checks;
- the Windows asset names on the Craft Launcher release (only non-Windows assets were visible), so it falls back to the official page when no Windows installer is found;
- per-app licences inside the ArtCraft suite; one outlet mentions "fair source" terms in parts of the project, and this is noted in the catalogue.

## 2. Candidate list (51 shipped)

Winget ids marked ✓ were confirmed on winstall.app on 2026-11-23. The others are well-known ids that Lens re-checks with `winget show` before offering Install; when that check fails, Lens offers the official link. Licences marked † come from memory and are confirmed by `winget show` at install time; the confirm sheet shows the authoritative licence.

| Category | App | Licence | Install route |
|---|---|---|---|
| Rewrites / Create | ArtCraft | MIT OR Apache-2.0 | GitHub release `storytold/artcraft` → getartcraft.com |
| | Craft Launcher (+12 suite apps: PhotoCraft, VectorCraft, FilmCraft, LightCraft, PdfCraft, EffectCraft, DesignCraft, FigCraft, **WordCraft, DeckCraft, GridCraft**, SoundCraft) | Permissive (per app) | GitHub release `storytold/craft-launcher`; suite apps install "via" the launcher |
| | Concat | AGPL-3.0-or-later | GitHub release `jub0t/Concat` |
| Markets (charts only) | degenview | GPL-3.0-only | GitHub release |
| | OpenCharts | MIT | Web app |
| | OpenStock | AGPL-3.0 | Web app (demo needs sign-up; self-host) |
| Notes | AFFiNE | MIT (CE)† | winget ✓ `ToEverything.AFFiNE` |
| | AppFlowy | AGPL-3.0† | winget ✓ `AppFlowy.AppFlowy` |
| | Obsidian (free, not OSS) | Proprietary | winget ✓ `Obsidian.Obsidian` |
| | Logseq | AGPL-3.0† | winget `Logseq.Logseq` |
| | Joplin | AGPL-3.0† | winget `Joplin.Joplin` |
| Docs | ONLYOFFICE Desktop Editors | AGPL-3.0† | winget ✓ `ONLYOFFICE.DesktopEditors` |
| | LibreOffice | MPL-2.0† | winget ✓ `TheDocumentFoundation.LibreOffice` |
| | Typst | Apache-2.0† | winget ✓ `Typst.Typst` |
| Slides | Slidev, Marp | MIT† | Official site (Node/VS Code based) |
| Design | Penpot | MPL-2.0† | Web app |
| | Excalidraw | MIT† | Web app |
| | Inkscape | GPL-2.0-or-later† | winget ✓ `Inkscape.Inkscape` |
| Create | Krita, Blender, Kdenlive, OBS Studio, Audacity | GPL family† | winget ✓ (`KDE.Krita`, `BlenderFoundation.Blender`, `KDE.Kdenlive`, `OBSProject.OBSStudio`, `Audacity.Audacity`) |
| | Shotcut, darktable | GPL-3.0† | winget `Meltytech.Shotcut`, `darktable.darktable` |
| Dev | Zed | GPL-3.0† | winget ✓ `ZedIndustries.Zed` |
| | VSCodium | MIT† | winget `VSCodium.VSCodium` |
| Media | VLC, HandBrake | GPL-2.0† | winget `VideoLAN.VLC`, `HandBrake.HandBrake` |
| Utilities | PowerToys | MIT† | winget ✓ `Microsoft.PowerToys` |
| | Everything (freeware) | Freeware | winget ✓ `voidtools.Everything` |
| | ShareX | GPL-3.0† | winget ✓ `ShareX.ShareX` |
| | Flow Launcher | MIT† | winget `Flow-Launcher.Flow-Launcher` |
| | 7-Zip | LGPL-2.1 (+unRAR)† | winget `7zip.7zip` |
| AI | Ollama | MIT† | winget ✓ `Ollama.Ollama` |
| | LM Studio (free, not OSS) | Proprietary | winget ✓ `ElementLabs.LMStudio` |
| | ComfyUI | GPL-3.0† | Official site (desktop app) |
| | whisper.cpp | MIT† | Official releases (Lens Transcription sets it up) |

Stars and release dates are only shown where a page confirmed them (Concat 11.9k, OpenStock 16.3k, OpenCharts 315). Everything else shows the live `winget show` version at install time.

**Official media used for live thumbnails** (loaded at runtime from the project's own host, never committed):
- ArtCraft's README GIF and WebP;
- Concat's `assets/editor.png` via jsDelivr;
- degenview's `assets/screenshots/*.png`;
- OpenCharts' `docs/screenshot.png`.

The other entries have no published media URL I could confirm, so they show dithered placeholders. Adding a URL is a one-line catalogue edit.

## 3. Safety model for third-party installs

1. **winget first.** The manifests in microsoft/winget-pkgs are reviewed, point to the publisher's own URLs and carry a SHA-256 that winget checks before running. Lens calls winget with a **fixed argument vector**: no shell, id regex `[A-Za-z0-9._-]` with no leading `-`, and `--exact --source winget` always. Install and upgrade add `--accept-package-agreements` only after the UI has shown the agreements from `winget show`. There is no `--override`, `--location`, `--force` or `--silent`.
2. **GitHub-release fallback.**
   - Only github.com's release hosts, and redirects are only followed within them (no mirrors).
   - SHA-256 is checked against the project's own checksum file when one exists.
   - The Authenticode signature is checked with `Get-AuthenticodeSignature`; the path is passed by environment variable, never interpolated.
   - A **second confirmation** shows the checksum result, signer and SmartScreen warning, then Lens re-hashes right before running.
3. **Never silently, never elevated by Lens.** Every system change needs a click. Installers raise their own UAC prompt. One install runs at a time.
4. **Uninstall path.**
   - winget apps uninstall from their page.
   - "Remove everything Lens installed" lists only apps Lens installed.
   - Setup recipes are journaled and "Undo Lens setup" reverts them.
5. **Audit log.** Every install, upgrade, uninstall, download and recipe goes to `%APPDATA%\LensUI\apps\audit.jsonl` (trimmed to 2,000 lines) and the Tester Hub log.
6. **SmartScreen and signing.** Unsigned installers, such as degenview's, are allowed but clearly labelled. Lens's own catalogue refresh stays off until the catalogue is signed with the Lens release key (TODO, below).

**Don't include:**
- cracked or "free" versions of paid apps;
- repacks or mirrors;
- unknown publishers or any app without a public source;
- crypto-trading bots or anything that executes trades or connects to brokers (charting and paper trading only);
- anything that needs the user's credentials to install;
- browser toolbars and bundleware installers.

## 4. Suggestions for next polish

- **Verify and pin.** CI should run `winget show` for every unverified id on a Windows runner nightly (the daily lookout can do it), flip `wingetVerified`, and record the version.
- **ArtCraft suite deep links.** Once the launcher's CLI or URL scheme is documented, "Install WordCraft" should open the launcher straight on that app.
- **Concat MCP.** Read Concat's MCP server command from its docs and add an `mcpServer` recipe step, so "Lens, cut the silences in this video" works through approvals.
- **Signed catalogue updates.** Sign `catalog.json` with the release key (PR #3 updater key, minisign) and enable "Check for new apps".
- **Real media.** Ask projects for a short silent demo loop (WebM ≤ 2 MB); cache thumbnails under `%APPDATA%\LensUI\apps\media` with a size cap.
- **App collections by task.** For example "Start a YouTube channel" (OBS + Concat + Audacity + Krita) as a one-confirmation batch.
