// One source for the feature tour on the website (features.html, the home page) and in README.md.
// Edit here, then run `node tools/site/gen-readme.mjs` and `node tools/site/build.mjs`.
//
// status: "built"   merged into the integration branch (integration/waves-4-6 → main)
//         "dev"     still in an open pull request (pr: number)
// clip:   an id from docs/media/clips.json (tools/media/record.mjs)

export const REPO = "https://github.com/orionopenwow/LensUI";

export const FEATURES = [
  {
    id: "dock",
    title: "Dock",
    lede: "Six dock styles with the same physics, and search that opens inside the dock.",
    status: "built",
    clips: ["dock-magnify", "dock-styles", "dock-search"],
    bullets: [
      "Floating, Slim, Taskbar (a Windows 11-style bar), Studio, Minimal and Split, on any screen edge.",
      "Optional macOS-style magnification, bounce or jelly launch animations, app labels and a minimise pulse.",
      "Search spreads out of the magnifier inside the dock. The dock never gets wider and your icons stay visible.",
    ],
    docs: ["docs/DOCK_STYLES.md"],
    lesson: "make-it-yours",
  },
  {
    id: "themes",
    title: "Themes & look",
    lede: "Eighteen theme packs that restyle the dock, bar, panels and app window frames together.",
    status: "built",
    clips: ["themes"],
    bullets: [
      "Catppuccin, Tokyo Night, Nord, Dracula, Gruvbox, Solarized, Rosé Pine and more, using their real palettes.",
      "Every pack passes a 4.5:1 contrast check for body text. Day and night schedules switch packs for you.",
      "Export your look as a .lenstheme file and share it. Importing checks every value first.",
    ],
    docs: ["docs/THEMES_ROADMAP.md"],
    lesson: "make-it-yours",
  },
  {
    id: "windows",
    title: "Windows",
    lede: "Window frames, focus dimming, hot corners and Alt+drag, all off until you turn them on.",
    status: "built",
    clips: ["focus-borders"],
    bullets: [
      "Dim inactive windows and put a solid or gradient border on the active one. Pin any window on top.",
      "Hot corners, Alt+drag to move and Alt+right-drag to resize any window, and summon-an-app hotkeys.",
      "Workspaces with an Overview you can drag windows between. Full-screen apps and games are left alone.",
    ],
    docs: ["docs/WINDOW_STYLING.md", "docs/PRODUCTIVITY.md"],
    lesson: "windows-like-a-pro",
  },
  {
    id: "living-desktop",
    title: "Living desktop",
    lede: "Playground scenes run as your wallpaper. Some are calm, some you can play with.",
    status: "built",
    clips: ["playground-sand", "playground-ink"],
    bullets: [
      "Falling Sand, Ink, Flow Field, Constellation, Aurora, Rain on Glass, Starfield and Sky Clock, coloured by your theme.",
      "Click ripples on empty desktop, an idle-mode screensaver and a different scene per workspace.",
      "Scenes pause when a game or full-screen app is in front, and Calm freezes them into a still picture.",
    ],
    docs: ["docs/PLAYGROUND.md"],
    lesson: "living-desktop",
  },
  {
    id: "pointers",
    title: "Pointer suite",
    lede: "Six pointer families drawn in your accent colour, every Windows mouse setting, and pointer effects.",
    status: "built",
    clips: ["cursor-effects"],
    bullets: [
      "Obsidian, Accent, Glass, Minimal dot, Outline and Retro pixel, sharp from 32 to 128 px.",
      "Click ripples, glow and comet trails, a spotlight, shake to find and an on-screen shortcut display.",
      "Your original pointers and mouse settings are saved first, and one button puts them back.",
    ],
    docs: ["docs/CURSORS.md"],
    lesson: "make-it-yours",
  },
  {
    id: "command",
    title: "Lens Command, Shelf & right-click",
    lede: "One place for context: a standing clipboard, a pocket command bar and the same right-click menu everywhere.",
    status: "built",
    clips: ["command-mini", "right-click", "shelf-packs"],
    bullets: [
      "Lens Mini opens at your pointer and expands into Lens Command: one thread for answers, actions and approvals.",
      "The Shelf keeps selections, pages, files and transcripts. Clipboard history is encrypted and skips password managers.",
      "Right-click in the browser and File Explorer: summarise, translate, add to Shelf or pack it as context for Claude.",
    ],
    docs: ["docs/COMMAND.md", "docs/SHELF.md", "docs/BROWSER_BRIDGE.md"],
    lesson: "command-and-shelf",
    note: "Context packs, micro-saves and the shared action catalogue are in pull request #19.",
  },
  {
    id: "voice",
    title: "Voice",
    lede: "\"Lens, minimise this.\" Push-to-talk by default, recognised on your PC.",
    status: "dev",
    pr: 23,
    clips: ["voice"],
    bullets: [
      "Windows, apps, workspaces, themes, volume, timers, the Shelf and questions, with confirm and undo.",
      "Speech is recognised locally with whisper.cpp. Audio is never saved or sent anywhere.",
      "\"Hey Lens\" is opt-in and pauses in calls, games, full-screen apps and on the lock screen.",
    ],
    docs: [],
    lesson: "voice-control",
  },
  {
    id: "browser",
    title: "Lens Browser",
    lede: "A light WebView2 browser with spaces, vertical tabs and an agent that stops for your OK.",
    status: "dev",
    pr: 20,
    clips: ["browser-agent", "youtube-transcript"],
    bullets: [
      "Spaces with their own profiles, vertical tabs that sleep when idle, reader view and picture-in-picture.",
      "YouTube transcripts with timestamps you can click, summarise or add to the Shelf.",
      "Submit, book, send and delete always ask first. Passwords, payments and CAPTCHAs are never touched.",
    ],
    docs: [],
    lesson: "browser-and-approvals",
  },
  {
    id: "ai",
    title: "AI helper & approvals",
    lede: "Off until you turn it on. Local first, Claude when you choose, and nothing happens without your OK.",
    status: "built",
    clips: ["ai-dock", "approvals"],
    bullets: [
      "An instant offline command engine (no model), your own local model through Ollama or LM Studio, or Claude with your key.",
      "Every cloud request shows exactly what it would send. The usage log never stores your text.",
      "Risky steps show a Needs your OK card: what it will click, the details, Deny or hold to approve.",
    ],
    docs: ["docs/AI.md", "docs/AI_SURFACES.md", "docs/MCP.md"],
    lesson: "ai-privacy",
    note: "The unified approval card and Claude control over every setting are in pull request #21.",
  },
  {
    id: "snip",
    title: "Lens Snip",
    lede: "Capture, then do the useful part before anything is saved.",
    status: "dev",
    pr: 24,
    clips: ["snip"],
    bullets: [
      "Region, window or screen, with a loupe. Annotate, blur and number steps before you save.",
      "Auto-redaction suggests blurring e-mails, API keys and card-like numbers it finds in the image.",
      "One key to copy, copy text, pin to screen, add to the Shelf or paste to Claude with what is sent shown first.",
    ],
    docs: [],
  },
  {
    id: "guide",
    title: "Lens Guide",
    lede: "\"How do I…?\" answered from Lens's own settings, with Show me.",
    status: "dev",
    pr: 18,
    clips: ["guide"],
    bullets: [
      "An offline index of every setting, theme, dock style, command and shortcut. It only knows things that exist.",
      "Show me opens the right Settings tab and highlights the setting.",
      "Eleven short lessons that notice when you have done each step.",
    ],
    docs: [],
  },
  {
    id: "tester",
    title: "Tester Hub",
    lede: "For people testing Lens builds: what changed, what to test today and a report you can send.",
    status: "built",
    clips: ["tester-hub"],
    bullets: [
      "What's new in this build, grouped by area, and today's checklist with Pass, Fail and Skip.",
      "A session log with personal details hidden, and Mark moment (Ctrl+Alt+M) while you test.",
      "Export one zip with results and PC details. API keys, paths and clipboard contents are stripped.",
    ],
    docs: ["docs/TESTER_HUB.md"],
  },
];

export const TRUST = [
  ["Off until you turn it on", "New features ship disabled. Your desktop only changes when you ask it to."],
  ["Every change can be undone", "Lens records what it changes and puts it back. Remove all Lens changes is one button."],
  ["Games are left alone", "No injection into other processes. Overlays and hooks pause for full-screen apps and anti-cheat games."],
  ["Local first", "The command engine and Guide work offline. Cloud AI is opt-in and shows what it would send."],
  ["Open source", "MIT licensed. Releases are signed, and you can build every part yourself."],
];

export const WORKS_ON = [
  ["Dock, Top Bar, themes, Playground, Command, Shelf", "Windows 10 (1809+) and 11", "Windows 10 (1809+) and 11"],
  ["Dark title bars on other apps", "Yes (1809+)", "Yes"],
  ["Window frame colours and rounded corners", "No", "Yes"],
  ["Glass backdrops (Mica / acrylic)", "No", "22H2 and later"],
  ["Pointer size (CursorBaseSize)", "1903+", "Yes"],
];

/** Clip ids in feature order, for the README hero and page sections. */
export const HERO_CLIP = "dock-magnify";
