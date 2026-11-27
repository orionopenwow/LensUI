"""Generates catalog/apps/catalog.json from the compact table below.

Edit the table, run `python tools/apps/make_catalog.py`, and commit both files. Facts here are what
was verified on 2026-11-23 (see docs/APPS_RESEARCH.md); licence and version shown at install time
come from `winget show`, which is authoritative.
"""
import json, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[2]

def W(id, verified):
    return {"method": "winget", "wingetId": id, "wingetVerified": verified}

def GH(repo, hints=None, fallback=None, portable=False):
    d = {"method": "githubRelease", "repo": repo, "hints": hints or []}
    if portable:
        d["portable"] = True
    if fallback:
        d["fallbackUrl"] = fallback
    return d

def SITE(url):
    return {"method": "officialSite", "url": url}

def WEB(url):
    return {"method": "web", "url": url}

def VIA(app, page):
    return {"method": "via", "via": app, "fallbackUrl": page}

CRAFT_SRC = ["https://getartcraft.com/apps", "https://techaeris.com/2026/10/07/artcraft-launches-7-open-source-creative/"]

APPS = [
  # ---------------- Featured: open-source rewrites ----------------
  dict(id="artcraft", name="ArtCraft", category="create", collections=["rewrites", "ai"], status="beta",
       pitch="An IDE for artists: controllable AI image and video with 2D and 3D scene tools.",
       why="The flagship of the ArtCraft project; local-first, permissive licence, native Rust app.",
       replaces=["Midjourney", "Runway"], openSource=True, license="MIT OR Apache-2.0", licenseVerified=True,
       publisher="ArtCraft (storytold)", homepage="https://getartcraft.com", repo="https://github.com/storytold/artcraft",
       install=GH("storytold/artcraft", fallback="https://getartcraft.com"),
       media={"images": ["https://raw.githubusercontent.com/storytold/github-media/main/ship-editing.gif",
                         "https://raw.githubusercontent.com/storytold/github-media/22a27373707b13f48fc56405f1f89ca143c43d5d/character-posing.webp"],
              "video": None, "credit": "storytold/artcraft README"},
       integration={"fileTypes": [".png", ".jpg", ".webp", ".mp4"], "mcp": False, "cli": None, "voice": ["open artcraft", "make an image in artcraft"]},
       sources=["https://raw.githubusercontent.com/storytold/artcraft/HEAD/README.md"]),
  dict(id="craft-launcher", name="Craft Launcher", category="create", collections=["rewrites"], status="alpha",
       pitch="Installs and updates the whole ArtCraft suite (PhotoCraft, WordCraft, DeckCraft, GridCraft and more).",
       why="One launcher for 17 open-source creative and office rewrites; Lens installs the launcher, the launcher manages the apps.",
       replaces=["Adobe Creative Cloud app"], openSource=True, license="MIT OR Apache-2.0", licenseVerified=True,
       publisher="ArtCraft (storytold)", homepage="https://getartcraft.com/apps", repo="https://github.com/storytold/craft-launcher",
       install=GH("storytold/craft-launcher", fallback="https://getartcraft.com/apps"),
       media={"images": [], "video": None, "credit": "getartcraft.com"},
       integration={"fileTypes": [], "mcp": False, "cli": None, "voice": ["open the craft launcher"]},
       notes="Some coverage mentions 'fair source' terms in parts of the wider ArtCraft project; check each app's repo licence before commercial redistribution.",
       sources=CRAFT_SRC),
]

SUITE = [
  ("photocraft", "PhotoCraft", "create", "Image editor.", ["Photoshop"], "alpha", [".png", ".jpg", ".psd", ".webp"]),
  ("vectorcraft", "VectorCraft", "design", "Vector illustration.", ["Illustrator"], "alpha", [".svg"]),
  ("filmcraft", "FilmCraft", "create", "Video editing.", ["Premiere Pro"], "alpha", [".mp4", ".mov"]),
  ("lightcraft", "LightCraft", "create", "Photo library and RAW developer.", ["Lightroom"], "alpha", [".jpg", ".dng"]),
  ("pdfcraft", "PdfCraft", "docs", "PDF workbench.", ["Acrobat"], "alpha", [".pdf"]),
  ("effectcraft", "EffectCraft", "create", "Motion graphics and VFX.", ["After Effects"], "alpha", []),
  ("designcraft", "DesignCraft", "design", "Page layout and publishing.", ["InDesign"], "alpha", []),
  ("figcraft", "FigCraft", "design", "Interface design and prototyping.", ["Figma"], "alpha", []),
  ("wordcraft", "WordCraft", "docs", "Word processing.", ["Google Docs", "Word"], "alpha", [".docx", ".odt", ".md"]),
  ("deckcraft", "DeckCraft", "slides", "Presentations.", ["Google Slides", "PowerPoint"], "alpha", [".pptx", ".odp"]),
  ("gridcraft", "GridCraft", "sheets", "Spreadsheets and data analysis.", ["Google Sheets", "Excel"], "alpha", [".xlsx", ".csv", ".ods"]),
  ("soundcraft", "SoundCraft", "create", "Digital audio workstation.", ["Audition", "Logic"], "alpha", [".wav", ".mp3"]),
]
for sid, name, cat, pitch, repl, status, exts in SUITE:
    APPS.append(dict(id=sid, name=name, category=cat, collections=["rewrites", "artcraft-suite"], status=status,
        pitch=pitch + " Part of the open-source ArtCraft suite, native and in Rust.",
        why=f"A new open-source take on {repl[0]}; installs through the Craft Launcher.",
        replaces=repl, openSource=True, license="MIT OR Apache-2.0", licenseVerified=True,
        publisher="ArtCraft (storytold)", homepage=f"https://getartcraft.com/apps/{sid}", repo=None,
        install=VIA("craft-launcher", f"https://getartcraft.com/apps/{sid}"),
        media={"images": [], "video": None, "credit": "getartcraft.com"},
        integration={"fileTypes": exts, "mcp": False, "cli": None, "voice": [f"open {name.lower()}"]},
        notes="Early alpha / in development per getartcraft.com (November 2026).", sources=CRAFT_SRC))

APPS += [
  dict(id="concat", name="Concat", category="create", collections=["rewrites", "ai"], status="beta",
       pitch="Free, local-first video editor that replaces CapCut, with AI captions and an MCP/JSON-RPC API.",
       why="11.9k stars, fully local (Whisper captions on your PC), scriptable over MCP, so Lens AI can drive edits.",
       replaces=["CapCut"], openSource=True, license="AGPL-3.0-or-later", licenseVerified=True,
       publisher="jub0t", homepage="https://concatenate.pages.dev", repo="https://github.com/jub0t/Concat", stars="11.9k",
       install=GH("jub0t/Concat", fallback="https://github.com/jub0t/Concat/releases"),
       media={"images": ["https://cdn.jsdelivr.net/gh/jub0t/Concat@main/assets/editor.png"], "video": None, "credit": "jub0t/Concat README"},
       integration={"fileTypes": [".mp4", ".mov", ".mkv", ".webm"], "mcp": True, "cli": None, "voice": ["open concat", "edit this video in concat"]},
       sources=["https://github.com/jub0t/Concat", "https://justuse.tech/concat/"]),
  dict(id="degenview", name="degenview", category="markets", collections=["rewrites"], status="beta",
       pitch="Open-source TradingView-style charting app in Rust with a local Pine Script v6 engine.",
       why="A native desktop rewrite (no Electron) with Pine scripts, many data sources and a paper-trading simulator that never routes orders.",
       replaces=["TradingView"], openSource=True, license="GPL-3.0-only", licenseVerified=True,
       publisher="degenview", homepage="https://github.com/degenview/degenview", repo="https://github.com/degenview/degenview", stars=None,
       install=GH("degenview/degenview", fallback="https://github.com/degenview/degenview/releases"),
       media={"images": ["https://github.com/degenview/degenview/raw/main/assets/screenshots/hero.png",
                         "https://github.com/degenview/degenview/raw/main/assets/screenshots/pine-debugger.png"], "video": None, "credit": "degenview README"},
       integration={"fileTypes": [".pine"], "mcp": False, "cli": None, "voice": ["open the charting app", "open degenview"]},
       notes="Windows builds are not code-signed yet, so SmartScreen may warn on first launch. Charting and paper trading only; Lens never connects it to a broker.",
       sources=["https://github.com/degenview/degenview"]),
  dict(id="opencharts", name="OpenCharts", category="markets", collections=["rewrites"], status="beta",
       pitch="Self-hosted TradingView alternative in the browser, built on Lightweight Charts.",
       why="Runs entirely in the browser with drawing tools, indicators and a paper-trading engine; MIT licence.",
       replaces=["TradingView"], openSource=True, license="MIT", licenseVerified=True,
       publisher="dylanpersonguy", homepage="https://dylanpersonguy.github.io/OpenCharts/", repo="https://github.com/dylanpersonguy/OpenCharts", stars="315",
       install=WEB("https://dylanpersonguy.github.io/OpenCharts/"),
       media={"images": ["https://github.com/dylanpersonguy/OpenCharts/raw/main/docs/screenshot.png"], "video": None, "credit": "OpenCharts README"},
       integration={"fileTypes": [], "mcp": False, "cli": None, "voice": ["open opencharts"]},
       sources=["https://github.com/dylanpersonguy/OpenCharts", "https://trendshift.io/repositories/243036"]),
  dict(id="openstock", name="OpenStock", category="markets", collections=["rewrites"], status="stable",
       pitch="Open-source market dashboard: prices, alerts and company insights.",
       why="16.3k stars; a free alternative to paid market platforms. Web app you can self-host.",
       replaces=["Paid market platforms"], openSource=True, license="AGPL-3.0", licenseVerified=True,
       publisher="Open Dev Society", homepage="https://openstock-ods.vercel.app", repo="https://github.com/Open-Dev-Society/OpenStock", stars="16.3k",
       install=WEB("https://openstock-ods.vercel.app"),
       media={"images": [], "video": None, "credit": "Open-Dev-Society/OpenStock"},
       integration={"fileTypes": [], "mcp": False, "cli": None, "voice": ["open openstock"]},
       notes="The public demo asks you to sign up; self-hosting keeps your watchlists on your own server.",
       sources=["https://github.com/Open-Dev-Society/OpenStock"]),
  dict(id="affine", name="AFFiNE", category="notes", collections=["rewrites"], status="stable",
       pitch="Docs, whiteboards and databases in one local-first workspace.",
       why="A Notion and Miro rewrite that works offline and keeps data on your PC.",
       replaces=["Notion", "Miro"], openSource=True, license="MIT (Community Edition)", licenseVerified=True,
       publisher="AFFiNE", homepage="https://affine.pro", repo="https://github.com/toeverything/AFFiNE",
       install=W("ToEverything.AFFiNE", True), media={"images": [], "video": None, "credit": "affine.pro"},
       integration={"fileTypes": [".md"], "mcp": False, "cli": None, "voice": ["open affine"]}, sources=["https://winstall.app/apps/ToEverything.AFFiNE"]),
  dict(id="appflowy", name="AppFlowy", category="notes", collections=["rewrites"], status="stable",
       pitch="Open-source Notion alternative with docs, databases and local AI.",
       why="Notion-style workspace with your data on your device.",
       replaces=["Notion"], openSource=True, license="AGPL-3.0", licenseVerified=True,
       publisher="AppFlowy-IO", homepage="https://appflowy.com", repo="https://github.com/AppFlowy-IO/AppFlowy",
       install=W("AppFlowy.AppFlowy", True), media={"images": [], "video": None, "credit": "appflowy.com"},
       integration={"fileTypes": [".md", ".csv"], "mcp": False, "cli": None, "voice": ["open appflowy"]}, sources=["https://winstall.app/apps/AppFlowy.AppFlowy"]),
  dict(id="onlyoffice", name="ONLYOFFICE Desktop Editors", category="docs", collections=["rewrites", "essentials"], status="stable",
       pitch="Documents, spreadsheets, slides and PDFs with strong Microsoft Office compatibility.",
       why="The closest open-source match to Word, Excel and PowerPoint layouts.",
       replaces=["Microsoft Office", "Google Docs"], openSource=True, license="AGPL-3.0", licenseVerified=True,
       publisher="Ascensio System SIA", homepage="https://www.onlyoffice.com", repo="https://github.com/ONLYOFFICE/DesktopEditors",
       install=W("ONLYOFFICE.DesktopEditors", True), media={"images": [], "video": None, "credit": "onlyoffice.com"},
       integration={"fileTypes": [".docx", ".xlsx", ".pptx", ".pdf", ".odt"], "mcp": False, "cli": None, "voice": ["open onlyoffice"]},
       sources=["https://winstall.app/apps/ONLYOFFICE.DesktopEditors"]),
  dict(id="libreoffice", name="LibreOffice", category="docs", collections=["essentials"], status="stable",
       pitch="The full open-source office suite: Writer, Calc, Impress, Draw.",
       why="Mature, free forever, opens nearly everything.",
       replaces=["Microsoft Office"], openSource=True, license="MPL-2.0", licenseVerified=True,
       publisher="The Document Foundation", homepage="https://www.libreoffice.org", repo="https://git.libreoffice.org/core",
       install=W("TheDocumentFoundation.LibreOffice", True), media={"images": [], "video": None, "credit": "libreoffice.org"},
       integration={"fileTypes": [".docx", ".xlsx", ".pptx", ".odt", ".ods", ".odp"], "mcp": False, "cli": "soffice", "voice": ["open libreoffice"]},
       sources=["https://winstall.app/apps/TheDocumentFoundation.LibreOffice"]),
  dict(id="penpot", name="Penpot", category="design", collections=["rewrites"], status="stable",
       pitch="Open-source design and prototyping, built on open web standards.",
       why="Figma-style collaborative design that you can self-host.",
       replaces=["Figma"], openSource=True, license="MPL-2.0", licenseVerified=True,
       publisher="Kaleidos", homepage="https://penpot.app", repo="https://github.com/penpot/penpot",
       install=WEB("https://design.penpot.app"), media={"images": [], "video": None, "credit": "penpot.app"},
       integration={"fileTypes": [".svg"], "mcp": False, "cli": None, "voice": ["open penpot"]}, sources=["https://penpot.app"]),
  # ---------------- Create ----------------
  dict(id="krita", name="Krita", category="create", collections=["essentials"], status="stable",
       pitch="Professional painting and illustration.", why="The best free painting app on Windows.",
       replaces=["Photoshop (painting)"], openSource=True, license="GPL-3.0", licenseVerified=True,
       publisher="Krita Foundation", homepage="https://krita.org", repo="https://invent.kde.org/graphics/krita",
       install=W("KDE.Krita", True), media={"images": [], "video": None, "credit": "krita.org"},
       integration={"fileTypes": [".kra", ".psd", ".png"], "mcp": False, "cli": None, "voice": ["open krita"]}, sources=["https://winstall.app/apps/KDE.Krita"]),
  dict(id="inkscape", name="Inkscape", category="design", collections=[], status="stable",
       pitch="Vector graphics editor for SVG.", why="Mature, free Illustrator alternative.",
       replaces=["Illustrator"], openSource=True, license="GPL-2.0-or-later", licenseVerified=False,
       publisher="Inkscape", homepage="https://inkscape.org", repo="https://gitlab.com/inkscape/inkscape",
       install=W("Inkscape.Inkscape", True), media={"images": [], "video": None, "credit": "inkscape.org"},
       integration={"fileTypes": [".svg", ".pdf"], "mcp": False, "cli": "inkscape", "voice": ["open inkscape"]}, sources=["https://winstall.app/apps/Inkscape.Inkscape"]),
  dict(id="blender", name="Blender", category="create", collections=["essentials"], status="stable",
       pitch="3D modelling, animation, rendering and video editing.", why="The standard free 3D suite.",
       replaces=["Maya", "Cinema 4D"], openSource=True, license="GPL-3.0", licenseVerified=True,
       publisher="Blender Foundation", homepage="https://www.blender.org", repo="https://projects.blender.org/blender/blender",
       install=W("BlenderFoundation.Blender", True), media={"images": [], "video": None, "credit": "blender.org"},
       integration={"fileTypes": [".blend", ".fbx", ".obj", ".glb"], "mcp": False, "cli": "blender", "voice": ["open blender"]}, sources=["https://winstall.app/apps/BlenderFoundation.Blender"]),
  dict(id="kdenlive", name="Kdenlive", category="create", collections=[], status="stable",
       pitch="Multi-track video editor.", why="Long-standing, capable open-source editor.",
       replaces=["Premiere Pro"], openSource=True, license="GPL-3.0", licenseVerified=True,
       publisher="KDE e.V.", homepage="https://kdenlive.org", repo="https://invent.kde.org/multimedia/kdenlive",
       install=W("KDE.Kdenlive", True), media={"images": [], "video": None, "credit": "kdenlive.org"},
       integration={"fileTypes": [".mp4", ".mov", ".kdenlive"], "mcp": False, "cli": None, "voice": ["open kdenlive"]}, sources=["https://winstall.app/apps/KDE.Kdenlive"]),
  dict(id="shotcut", name="Shotcut", category="create", collections=[], status="stable",
       pitch="Simple, fast video editor.", why="Lightweight alternative for quick edits.",
       replaces=["Clipchamp"], openSource=True, license="GPL-3.0", licenseVerified=True,
       publisher="Meltytech", homepage="https://shotcut.org", repo="https://github.com/mltframework/shotcut",
       install=W("Meltytech.Shotcut", False), media={"images": [], "video": None, "credit": "shotcut.org"},
       integration={"fileTypes": [".mp4", ".mlt"], "mcp": False, "cli": None, "voice": ["open shotcut"]}, sources=["https://shotcut.org"]),
  dict(id="obs-studio", name="OBS Studio", category="create", collections=["essentials"], status="stable",
       pitch="Screen recording and live streaming.", why="The standard for recording and streaming.",
       replaces=["Streamlabs"], openSource=True, license="GPL-2.0-or-later", licenseVerified=True,
       publisher="OBS Project", homepage="https://obsproject.com", repo="https://github.com/obsproject/obs-studio",
       install=W("OBSProject.OBSStudio", True), media={"images": [], "video": None, "credit": "obsproject.com"},
       integration={"fileTypes": [], "mcp": False, "cli": None, "voice": ["open obs", "start recording in obs"]}, sources=["https://winstall.app/apps/OBSProject.OBSStudio"]),
  dict(id="audacity", name="Audacity", category="create", collections=[], status="stable",
       pitch="Record and edit audio.", why="Fast, familiar audio editing.",
       replaces=["Audition"], openSource=True, license="GPL-3.0", licenseVerified=True,
       publisher="Audacity", homepage="https://www.audacityteam.org", repo="https://github.com/audacity/audacity",
       install=W("Audacity.Audacity", True), media={"images": [], "video": None, "credit": "audacityteam.org"},
       integration={"fileTypes": [".wav", ".mp3", ".flac", ".aup3"], "mcp": False, "cli": None, "voice": ["open audacity"]}, sources=["https://winstall.app/apps/Audacity.Audacity"]),
  dict(id="darktable", name="darktable", category="create", collections=[], status="stable",
       pitch="Photo workflow and RAW developer.", why="A mature Lightroom alternative.",
       replaces=["Lightroom"], openSource=True, license="GPL-3.0", licenseVerified=True,
       publisher="darktable", homepage="https://www.darktable.org", repo="https://github.com/darktable-org/darktable",
       install=W("darktable.darktable", False), media={"images": [], "video": None, "credit": "darktable.org"},
       integration={"fileTypes": [".dng", ".cr3", ".nef", ".arw"], "mcp": False, "cli": None, "voice": ["open darktable"]}, sources=["https://www.darktable.org"]),
  # ---------------- Docs / slides / sheets ----------------
  dict(id="typst", name="Typst", category="docs", collections=[], status="stable",
       pitch="A fast, modern typesetting system: LaTeX-quality documents from simple markup.",
       why="Great for reports and papers; compiles instantly. CLI install; editor optional.",
       replaces=["LaTeX"], openSource=True, license="Apache-2.0", licenseVerified=True,
       publisher="Typst GmbH", homepage="https://typst.app", repo="https://github.com/typst/typst",
       install=W("Typst.Typst", True), media={"images": [], "video": None, "credit": "typst.app"},
       integration={"fileTypes": [".typ"], "mcp": False, "cli": "typst", "voice": ["compile this with typst"]}, sources=["https://winstall.app/apps/Typst.Typst"]),
  dict(id="slidev", name="Slidev", category="slides", collections=[], status="stable",
       pitch="Presentation slides from Markdown, for developers.", why="Write slides as text, present in the browser.",
       replaces=["PowerPoint"], openSource=True, license="MIT", licenseVerified=True,
       publisher="Slidev", homepage="https://sli.dev", repo="https://github.com/slidevjs/slidev",
       install=SITE("https://sli.dev/guide/"), media={"images": [], "video": None, "credit": "sli.dev"},
       integration={"fileTypes": [".md"], "mcp": False, "cli": "slidev", "voice": []}, notes="Needs Node.js; the guide shows the one-line setup.", sources=["https://sli.dev"]),
  dict(id="marp", name="Marp", category="slides", collections=[], status="stable",
       pitch="Markdown presentations with a live preview in VS Code or a CLI.", why="The simplest way to turn notes into slides.",
       replaces=["PowerPoint"], openSource=True, license="MIT", licenseVerified=True,
       publisher="Marp team", homepage="https://marp.app", repo="https://github.com/marp-team/marp",
       install=SITE("https://marp.app"), media={"images": [], "video": None, "credit": "marp.app"},
       integration={"fileTypes": [".md"], "mcp": False, "cli": "marp", "voice": []}, sources=["https://marp.app"]),
  # ---------------- Design ----------------
  dict(id="excalidraw", name="Excalidraw", category="design", collections=[], status="stable",
       pitch="Hand-drawn style whiteboard and diagrams.", why="Instant sketches and diagrams, nothing to install.",
       replaces=["Miro"], openSource=True, license="MIT", licenseVerified=True,
       publisher="Excalidraw", homepage="https://excalidraw.com", repo="https://github.com/excalidraw/excalidraw",
       install=WEB("https://excalidraw.com"), media={"images": [], "video": None, "credit": "excalidraw.com"},
       integration={"fileTypes": [".excalidraw"], "mcp": False, "cli": None, "voice": ["open excalidraw", "open a whiteboard"]}, sources=["https://excalidraw.com"]),
  # ---------------- Notes ----------------
  dict(id="obsidian", name="Obsidian", category="notes", collections=["essentials"], status="stable",
       pitch="Private, local Markdown notes with links and plugins.", why="Your notes stay plain files; Lens clipper templates save straight into a vault.",
       replaces=["Evernote"], openSource=False, license="Proprietary (free for personal use)", licenseVerified=False,
       publisher="Obsidian", homepage="https://obsidian.md", repo=None,
       install=W("Obsidian.Obsidian", True), media={"images": [], "video": None, "credit": "obsidian.md"},
       integration={"fileTypes": [".md"], "mcp": False, "cli": None, "urlScheme": "obsidian://", "voice": ["open obsidian"]}, sources=["https://winstall.app/apps/Obsidian.Obsidian"]),
  dict(id="logseq", name="Logseq", category="notes", collections=[], status="stable",
       pitch="Outliner and knowledge graph, local-first.", why="Daily notes and linked thinking, open source.",
       replaces=["Roam"], openSource=True, license="AGPL-3.0", licenseVerified=True,
       publisher="Logseq", homepage="https://logseq.com", repo="https://github.com/logseq/logseq",
       install=W("Logseq.Logseq", False), media={"images": [], "video": None, "credit": "logseq.com"},
       integration={"fileTypes": [".md"], "mcp": False, "cli": None, "voice": ["open logseq"]}, sources=["https://logseq.com"]),
  dict(id="joplin", name="Joplin", category="notes", collections=[], status="stable",
       pitch="Notes and to-dos with end-to-end encrypted sync.", why="Evernote-style, open source, encrypted.",
       replaces=["Evernote"], openSource=True, license="AGPL-3.0-or-later", licenseVerified=True,
       publisher="Joplin", homepage="https://joplinapp.org", repo="https://github.com/laurent22/joplin",
       install=W("Joplin.Joplin", False), media={"images": [], "video": None, "credit": "joplinapp.org"},
       integration={"fileTypes": [".md", ".jex"], "mcp": False, "cli": None, "voice": ["open joplin"]}, sources=["https://joplinapp.org"]),
  # ---------------- Dev ----------------
  dict(id="zed", name="Zed", category="dev", collections=[], status="stable",
       pitch="A very fast code editor, written in Rust, with built-in AI.", why="Snappy, collaborative, open source.",
       replaces=["VS Code"], openSource=True, license="GPL-3.0-or-later", licenseVerified=True,
       publisher="Zed Industries", homepage="https://zed.dev", repo="https://github.com/zed-industries/zed",
       install=W("ZedIndustries.Zed", True), media={"images": [], "video": None, "credit": "zed.dev"},
       integration={"fileTypes": [".rs", ".ts", ".py", ".md"], "mcp": True, "cli": "zed", "voice": ["open zed"]}, sources=["https://winstall.app/apps/ZedIndustries.Zed"]),
  dict(id="vscodium", name="VSCodium", category="dev", collections=[], status="stable",
       pitch="VS Code built from source without Microsoft telemetry.", why="The familiar editor, fully open.",
       replaces=["VS Code"], openSource=True, license="MIT", licenseVerified=True,
       publisher="VSCodium", homepage="https://vscodium.com", repo="https://github.com/VSCodium/vscodium",
       install=W("VSCodium.VSCodium", False), media={"images": [], "video": None, "credit": "vscodium.com"},
       integration={"fileTypes": [".ts", ".js", ".json", ".md"], "mcp": False, "cli": "codium", "voice": ["open vscodium"]}, sources=["https://vscodium.com"]),
  # ---------------- Media ----------------
  dict(id="vlc", name="VLC", category="media", collections=["essentials"], status="stable",
       pitch="Plays nearly every audio and video format.", why="The player that just works.",
       replaces=["Windows Media Player"], openSource=True, license="GPL-2.0-or-later", licenseVerified=True,
       publisher="VideoLAN", homepage="https://www.videolan.org", repo="https://code.videolan.org/videolan/vlc",
       install=W("VideoLAN.VLC", False), media={"images": [], "video": None, "credit": "videolan.org"},
       integration={"fileTypes": [".mp4", ".mkv", ".mp3", ".flac"], "mcp": False, "cli": "vlc", "voice": ["open vlc", "play this in vlc"]}, sources=["https://www.videolan.org"]),
  dict(id="handbrake", name="HandBrake", category="media", collections=[], status="stable",
       pitch="Convert and compress video.", why="Shrink big recordings without losing quality.",
       replaces=["Paid converters"], openSource=True, license="GPL-2.0", licenseVerified=True,
       publisher="HandBrake Team", homepage="https://handbrake.fr", repo="https://github.com/HandBrake/HandBrake",
       install=W("HandBrake.HandBrake", False), media={"images": [], "video": None, "credit": "handbrake.fr"},
       integration={"fileTypes": [".mp4", ".mkv", ".mov"], "mcp": False, "cli": None, "voice": ["compress this video"]}, sources=["https://handbrake.fr"]),
  # ---------------- Utilities ----------------
  dict(id="powertoys", name="PowerToys", category="utilities", collections=["essentials"], status="stable",
       pitch="Microsoft's power-user utilities: FancyZones, Text Extractor, Color Picker and more.", why="Free, official and open source; pairs well with Lens.",
       replaces=[], openSource=True, license="MIT", licenseVerified=True,
       publisher="Microsoft Corporation", homepage="https://learn.microsoft.com/windows/powertoys/", repo="https://github.com/microsoft/PowerToys",
       install=W("Microsoft.PowerToys", True), media={"images": [], "video": None, "credit": "microsoft/PowerToys"},
       integration={"fileTypes": [], "mcp": False, "cli": None, "voice": ["open powertoys"]}, sources=["https://winstall.app/apps/Microsoft.PowerToys"]),
  dict(id="everything", name="Everything", category="utilities", collections=["essentials"], status="stable",
       pitch="Finds any file by name instantly.", why="The fastest file-name search on Windows.",
       replaces=["Windows Search"], openSource=False, license="Freeware", licenseVerified=False,
       publisher="voidtools", homepage="https://www.voidtools.com", repo=None,
       install=W("voidtools.Everything", True), media={"images": [], "video": None, "credit": "voidtools.com"},
       integration={"fileTypes": [], "mcp": False, "cli": "es", "voice": ["open everything"]}, sources=["https://winstall.app/apps/voidtools.Everything"]),
  dict(id="sharex", name="ShareX", category="utilities", collections=[], status="stable",
       pitch="Screenshots, screen recording and upload workflows.", why="Deep capture automation; Lens Snip covers the everyday cases.",
       replaces=["Snagit"], openSource=True, license="GPL-3.0", licenseVerified=True,
       publisher="ShareX Team", homepage="https://getsharex.com", repo="https://github.com/ShareX/ShareX",
       install=W("ShareX.ShareX", True), media={"images": [], "video": None, "credit": "getsharex.com"},
       integration={"fileTypes": [], "mcp": False, "cli": None, "voice": ["open sharex"]}, sources=["https://winstall.app/apps/ShareX.ShareX"]),
  dict(id="flow-launcher", name="Flow Launcher", category="utilities", collections=[], status="stable",
       pitch="Keyboard launcher with a big plugin store.", why="If you want an extra launcher beside Lens Command.",
       replaces=["Alfred"], openSource=True, license="MIT", licenseVerified=True,
       publisher="Flow Launcher", homepage="https://www.flowlauncher.com", repo="https://github.com/Flow-Launcher/Flow.Launcher",
       install=W("Flow-Launcher.Flow-Launcher", False), media={"images": [], "video": None, "credit": "flowlauncher.com"},
       integration={"fileTypes": [], "mcp": False, "cli": None, "voice": ["open flow launcher"]}, sources=["https://www.flowlauncher.com"]),
  dict(id="7zip", name="7-Zip", category="utilities", collections=["essentials"], status="stable",
       pitch="Open and make zip, 7z, rar and more.", why="Small, fast, free.",
       replaces=["WinRAR"], openSource=True, license="LGPL-2.1-or-later (+ unRAR restriction)", licenseVerified=True,
       publisher="Igor Pavlov", homepage="https://www.7-zip.org", repo=None,
       install=W("7zip.7zip", False), media={"images": [], "video": None, "credit": "7-zip.org"},
       integration={"fileTypes": [".7z", ".zip", ".rar", ".tar"], "mcp": False, "cli": "7z", "voice": ["extract this"]}, sources=["https://www.7-zip.org"]),
  # ---------------- AI / local models ----------------
  dict(id="ollama", name="Ollama", category="ai", collections=["ai", "essentials"], status="stable",
       pitch="Run open models (Llama, Qwen, Gemma and more) locally.", why="Lens AI's recommended local model engine.",
       replaces=["Cloud chatbots"], openSource=True, license="MIT", licenseVerified=True,
       publisher="Ollama", homepage="https://ollama.com", repo="https://github.com/ollama/ollama",
       install=W("Ollama.Ollama", True), media={"images": [], "video": None, "credit": "ollama.com"},
       integration={"fileTypes": [], "mcp": False, "cli": "ollama", "voice": ["open ollama"]}, sources=["https://winstall.app/apps/Ollama.Ollama"]),
  dict(id="lm-studio", name="LM Studio", category="ai", collections=["ai"], status="stable",
       pitch="Download and chat with local models in a friendly app.", why="Easy model browsing; Lens can use its local server.",
       replaces=["Cloud chatbots"], openSource=False, license="Proprietary (free)", licenseVerified=False,
       publisher="LM Studio (Element Labs)", homepage="https://lmstudio.ai", repo=None,
       install=W("ElementLabs.LMStudio", True), media={"images": [], "video": None, "credit": "lmstudio.ai"},
       integration={"fileTypes": [".gguf"], "mcp": True, "cli": "lms", "voice": ["open lm studio"]}, sources=["https://winstall.app/apps/ElementLabs.LMStudio"]),
  dict(id="comfyui", name="ComfyUI", category="ai", collections=["ai"], status="stable",
       pitch="Node-based local image and video generation.", why="The most flexible local generative pipeline; desktop app available.",
       replaces=["Midjourney"], openSource=True, license="GPL-3.0", licenseVerified=True,
       publisher="Comfy Org", homepage="https://www.comfy.org", repo="https://github.com/comfyanonymous/ComfyUI",
       install=SITE("https://www.comfy.org/download"), media={"images": [], "video": None, "credit": "comfy.org"},
       integration={"fileTypes": [".json"], "mcp": False, "cli": None, "voice": ["open comfyui"]}, sources=["https://www.comfy.org"]),
  dict(id="whisper-cpp", name="whisper.cpp", category="ai", collections=["ai"], status="stable",
       pitch="Fast local speech-to-text.", why="Powers Lens voice and transcription; Lens's Transcription setup handles it for you.",
       replaces=["Cloud transcription"], openSource=True, license="MIT", licenseVerified=True,
       publisher="ggml-org", homepage="https://github.com/ggml-org/whisper.cpp", repo="https://github.com/ggml-org/whisper.cpp",
       install=SITE("https://github.com/ggml-org/whisper.cpp/releases"), media={"images": [], "video": None, "credit": "ggml-org/whisper.cpp"},
       integration={"fileTypes": [".wav", ".mp3", ".mp4"], "mcp": False, "cli": "whisper-cli", "voice": []},
       notes="Lens Settings › AI & Command › Transcription sets it up with a pinned, checksum-verified download.", sources=["https://github.com/ggml-org/whisper.cpp"]),
]

# From the makers of Lens.
APPS += [
  dict(id="thumbdesk", name="ThumbDesk", category="utilities", collections=["lens-family", "essentials"], status="stable",
       pitch="Use your whole PC from an Xbox or PlayStation controller: cursor, clicks, shortcuts, voice and scripts.",
       why="From the makers of Lens. A 120 Hz dual-stick cursor, modifier layers, voice commands, a radial menu and DualSense gyro, with an anti-cheat guard that pauses itself in protected and Steam games. One portable program, no drivers.",
       replaces=["Steam Desktop Configuration", "Gopher360"], openSource=True, license="MIT", licenseVerified=True,
       publisher="orionopenwow", homepage="https://orionopenwow.github.io/ThumbDesk/", repo="https://github.com/orionopenwow/ThumbDesk",
       install=GH("orionopenwow/ThumbDesk", ["thumbdesk.exe"], "https://github.com/orionopenwow/ThumbDesk/releases/latest", portable=True),
       media={"images": [], "video": None, "credit": "orionopenwow/ThumbDesk"},
       integration={"fileTypes": [], "mcp": False, "cli": None, "voice": ["open thumbdesk", "controller mode", "use my controller"]},
       lastRelease="v2.3.0",
       notes="Lens keeps ThumbDesk in its own apps folder and reads its status from ThumbDesk's local API (127.0.0.1:49152, read-only) to badge its Dock icon. Lens never sends input for it.",
       sources=["https://raw.githubusercontent.com/orionopenwow/ThumbDesk/HEAD/README.md"]),
]

RECIPES = {
    "ollama": [{"kind": "addToDock"}, {"kind": "localModelProvider", "provider": "ollama"}, {"kind": "voiceVerbs", "phrases": ["open ollama"]}, {"kind": "guideLesson", "lesson": "Use a local model with Lens"}],
    "lm-studio": [{"kind": "addToDock"}, {"kind": "localModelProvider", "provider": "lmstudio"}, {"kind": "guideLesson", "lesson": "Use a local model with Lens"}],
    "concat": [{"kind": "addToDock"}, {"kind": "openWith", "extensions": [".mp4", ".mov", ".mkv", ".webm"]}, {"kind": "rightClick", "actions": ["open_in_app"]}, {"kind": "voiceVerbs", "phrases": ["open concat", "edit this video in concat"]}, {"kind": "guideLesson", "lesson": "Edit a video with Concat"}],
    "artcraft": [{"kind": "addToDock"}, {"kind": "openWith", "extensions": [".png", ".jpg", ".webp"]}, {"kind": "voiceVerbs", "phrases": ["open artcraft"]}],
    "thumbdesk": [{"kind": "addToDock"}, {"kind": "voiceVerbs", "phrases": ["open thumbdesk", "controller mode"]}],
    "degenview": [{"kind": "addToDock"}, {"kind": "voiceVerbs", "phrases": ["open the charting app"]}],
    "obsidian": [{"kind": "addToDock"}, {"kind": "openWith", "extensions": [".md"]}, {"kind": "voiceVerbs", "phrases": ["open obsidian"]}],
}

def default_recipe(app):
    steps = [{"kind": "addToDock"}]
    exts = app["integration"]["fileTypes"]
    if exts and app["install"]["method"] != "web":
        steps.append({"kind": "openWith", "extensions": exts[:6]})
    if app["integration"]["voice"]:
        steps.append({"kind": "voiceVerbs", "phrases": app["integration"]["voice"][:3]})
    return steps

import sys as _sys
_sys.path.insert(0, str(pathlib.Path(__file__).parent))
from media_sources import ICON_PLATE, NO_MEDIA, SOURCES  # noqa: E402

MEDIA = json.loads((pathlib.Path(__file__).parent / "media.json").read_text())


def media_for(app):
    m = MEDIA.get(app["id"])
    repo = SOURCES.get(app["id"])
    icon = m["icon"] if m else None
    shots = m["screenshots"] if m else []
    loop = m["loop"] if m else None
    reasons = []
    if app["id"] in NO_MEDIA:
        reasons.append(NO_MEDIA[app["id"]])
    elif not shots:
        host = app["homepage"].split("//", 1)[1].split("/", 1)[0]
        reasons.append(f"Screenshots live on {host}, not in the repo; Lens shows the icon on a tinted backdrop.")
    return {
        "icon": icon,
        "screenshots": shots,
        "loop": loop,
        "credit": f"github.com/{repo}" if repo else app["publisher"],
        "sourceUrl": f"https://github.com/{repo}" if repo else app["homepage"],
        "noMedia": " ".join(reasons) or None,
        "iconPlate": app["id"] in ICON_PLATE,
    }


for app in APPS:
    app["media"] = media_for(app)
    app.setdefault("stars", None)
    app.setdefault("notes", None)
    app.setdefault("replaces", [])
    app.setdefault("lastRelease", None)
    app.setdefault("size", None)
    app["integration"].setdefault("urlScheme", None)
    app["platforms"] = ["web"] if app["install"]["method"] == "web" else ["windows"]
    app["recipe"] = RECIPES.get(app["id"]) or default_recipe(app)

CATALOG = {
    "$schema": "./schema.json",
    "version": 1,
    "updated": "2026-11-23",
    "collections": [
        {"id": "rewrites", "title": "Open-source rewrites", "subtitle": "New open alternatives to the big paid apps"},
        {"id": "artcraft-suite", "title": "The ArtCraft suite", "subtitle": "17 native creative and office apps, one launcher"},
        {"id": "ai", "title": "AI on your PC", "subtitle": "Local models, generation and transcription"},
        {"id": "essentials", "title": "Essentials", "subtitle": "Free tools almost everyone wants"},
        {"id": "lens-family", "title": "From the makers of Lens", "subtitle": "Companion apps that work with Lens"},
    ],
    "categories": [
        {"id": "create", "title": "Create"}, {"id": "docs", "title": "Write & docs"}, {"id": "slides", "title": "Slides"},
        {"id": "sheets", "title": "Sheets & data"}, {"id": "design", "title": "Design"}, {"id": "notes", "title": "Notes"},
        {"id": "dev", "title": "Dev"}, {"id": "markets", "title": "Markets (charts only)"}, {"id": "media", "title": "Media"},
        {"id": "utilities", "title": "Utilities"}, {"id": "ai", "title": "AI & local models"},
    ],
    "apps": APPS,
}

out = ROOT / "catalog" / "apps" / "catalog.json"
out.write_text(json.dumps(CATALOG, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
print(f"wrote {out} with {len(APPS)} apps")
