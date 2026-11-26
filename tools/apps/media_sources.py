"""Which official GitHub repo each catalogue app's media comes from, plus hand-checked overrides.

`None` means the project has no public repo with its media (closed source); the catalogue then
records a `noMedia` reason instead.
"""

SUITE = ["photocraft", "vectorcraft", "filmcraft", "lightcraft", "pdfcraft", "effectcraft", "designcraft", "figcraft", "wordcraft", "deckcraft", "gridcraft", "soundcraft"]

SOURCES = {
    "artcraft": "storytold/artcraft",
    "thumbdesk": "orionopenwow/ThumbDesk",
    "craft-launcher": "storytold/craft-launcher",
    **{s: f"storytold/{s}" for s in SUITE},
    "concat": "jub0t/Concat",
    "degenview": "degenview/degenview",
    "opencharts": "dylanpersonguy/OpenCharts",
    "openstock": "Open-Dev-Society/OpenStock",
    "affine": "toeverything/AFFiNE",
    "appflowy": "AppFlowy-IO/AppFlowy",
    "onlyoffice": "ONLYOFFICE/DesktopEditors",
    "libreoffice": "LibreOffice/core",
    "penpot": "penpot/penpot",
    "krita": "KDE/krita",
    "inkscape": "inkscape/inkscape",
    "blender": "blender/blender",
    "kdenlive": "KDE/kdenlive",
    "shotcut": "mltframework/shotcut",
    "obs-studio": "obsproject/obs-studio",
    "audacity": "audacity/audacity",
    "darktable": "darktable-org/darktable",
    "typst": "typst/typst",
    "slidev": "slidevjs/slidev",
    "marp": "marp-team/marp",
    "excalidraw": "excalidraw/excalidraw",
    "obsidian": "obsidianmd/obsidian-releases",
    "logseq": "logseq/logseq",
    "joplin": "laurent22/joplin",
    "zed": "zed-industries/zed",
    "vscodium": "VSCodium/vscodium",
    "vlc": "videolan/vlc",
    "handbrake": "HandBrake/HandBrake",
    "powertoys": "microsoft/PowerToys",
    "everything": None,
    "sharex": "ShareX/ShareX",
    "flow-launcher": "Flow-Launcher/Flow.Launcher",
    "7zip": "ip7z/7zip",
    "ollama": "ollama/ollama",
    "lm-studio": "lmstudio-ai/lms",
    "comfyui": "comfyanonymous/ComfyUI",
    "whisper-cpp": "ggml-org/whisper.cpp",
}

# Hand-checked choices where the heuristic picks the wrong file. Filled in after reviewing the
# contact sheet (tools/apps/contact.py).
def _suite_icon(name):
    return {
        "photocraft": "assets/app-icon/hicolor/256x256/apps/ai.storyteller.photocraft.png",
        "vectorcraft": "assets/app-icon/vectorcraft-macos-512.png",
        "filmcraft": "assets/app-icon/filmcraft-macos-512.png",
        "lightcraft": "assets/app-icon/lightcraft-macos-512.png",
        "pdfcraft": "assets/app-icon/hicolor/256x256/apps/ai.storyteller.pdfcraft.png",
        "effectcraft": "assets/app-icon/effectcraft-macos-512.png",
        "designcraft": "assets/app-icon/designcraft-macos-512.png",
        "figcraft": "assets/app-icon/figcraft-256.png",
        "wordcraft": "assets/app-icon/wordcraft-macos-512.png",
        "deckcraft": "assets/app-icon/hicolor/256x256/apps/ai.storyteller.deckcraft.png",
        "gridcraft": "assets/app-icon/gridcraft-macos-512.png",
        "soundcraft": "assets/app-icon/soundcraft-macos-512.png",
    }[name]


OVERRIDES: dict[str, dict] = {
    **{s: {"icon": _suite_icon(s)} for s in SUITE},
    "thumbdesk": {"icon": "docs/assets/logo.png", "screenshots": ["docs/assets/thumbdesk_ui_screenshot.png", "docs/assets/ui_radial_menu.png", "docs/assets/ui_lab_gyro.png"], "loop": "docs/assets/thumbdesk_demo.gif"},
    "artcraft": {"screenshots": ["frontend/apps/artcraft/app/public/resources/gifs/3D_CANVAS_DEMO.webp", "frontend/apps/artcraft/app/public/resources/gifs/2D_CANVAS_DEMO.webp"]},
    "craft-launcher": {"icon": "assets/app-icon/hicolor/256x256/apps/ai.storyteller.artcraft-launcher.png"},
    "concat": {"screenshots": ["assets/editor.png"]},
    "affine": {"screenshots": []},
    "appflowy": {"icon": "frontend/appflowy_flutter/android/app/src/main/ic_launcher-playstore.png", "screenshots": []},
    "onlyoffice": {"icon": "ONLYOFFICE/desktop-apps:macos/ONLYOFFICE/Images.xcassets/AppIcon.appiconset/512x512.png", "screenshots": ["screenshots/ONLYOFFICE Desktop Editors.png"]},
    "libreoffice": {"icon": "sysui/desktop/icons/hicolor/512x512/apps/main.png", "screenshots": []},
    "krita": {"icon": "krita/pics/branding/default/512-apps-krita.png", "screenshots": []},
    "blender": {"icon": "release/freedesktop/icons/scalable/apps/blender.svg", "screenshots": []},
    "kdenlive": {"icon": "data/icons/512-apps-kdenlive.png", "screenshots": []},
    "inkscape": {"noIcon": True, "screenshots": []},
    "vlc": {"icon": "share/icons/256x256/vlc.png"},
    "vscodium": {"icon": "src/stable/resources/server/code-512.png"},
    "handbrake": {"icon": "gtk/icons/256x256/apps/fr.handbrake.ghb.png"},
    "ollama": {"icon": "app/darwin/Ollama.app/Contents/Resources/ollama@2x.png"},
    "comfyui": {"icon": "Comfy-Org/desktop:assets/UI/Comfy_Logo_x256.png", "screenshots": []},
    "7zip": {"icon": "C/Util/7zipInstall/7zip.ico"},
    "obsidian": {"noIcon": True, "screenshots": ["dark.png", "light.png"]},
    "zed": {"screenshots": []},
    "penpot": {"screenshots": ["docs/img/codemode-code.png"]},
    "marp": {"screenshots": ["website/public/assets/202205-ecosystem-update/transition-showcase-poster.jpg"]},
    "whisper-cpp": {"noIcon": True, "screenshots": []},
    "typst": {"noIcon": True, "screenshots": []},
    "lm-studio": {"noIcon": True, "screenshots": []},
}

NO_MEDIA = {
    "everything": "Closed source with no public media repo; Lens uses the installed app's own icon once it's installed.",
    "inkscape": "The GitHub mirror holds only a README and GitLab isn't reachable from the build; icon comes from the installed app.",
    "typst": "The repo ships no app icon or screenshots; the logo lives on typst.app.",
    "whisper-cpp": "A library and command-line tool with no app icon or screenshots.",
    "lm-studio": "Closed-source app; its public repos hold SDKs without the app icon. Lens uses the installed app's icon.",
    "obsidian": "Closed source; the public releases repo has screenshots but no app icon. Lens uses the installed app's icon.",
}

# Apps whose repos have an icon but no product screenshots (screenshots live on their websites).
SCREENSHOTS_ON_WEBSITE = {"affine", "appflowy", "libreoffice", "krita", "blender", "kdenlive", "comfyui", "zed", "audacity", "darktable", "obs-studio", "shotcut", "vlc", "vscodium", "handbrake", "sharex", "flow-launcher", "7zip", "ollama", "marp", "slidev"}

# Monochrome icons drawn for light backgrounds; Lens shows them on a light plate so they read on dark themes.
ICON_PLATE = {"ollama"}
