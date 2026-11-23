// Stable `data-guide-id` anchors that "Show me" and lessons can point at outside Settings. The
// snippet in docs/GUIDE.md adds each one to its component; until then, Settings targets still work
// through label matching and these targets simply don't highlight.
export const GUIDE_ANCHORS: Record<string, string> = {
  dock: "The dock (DockSurface root)",
  "dock.search": "Dock search / Ask field",
  "dock.sparkle": "Dock AI sparkle button",
  topbar: "The top bar (TopBarSurface root)",
  "topbar.help": "The top bar's ? button that opens the Guide",
  palette: "Command palette input",
  command: "Lens Command input",
  mini: "Lens Mini root",
  wallpaper: "The wallpaper / Playground surface",
  browser: "Browser frame (Lens Browser window, or the extension side panel)",
  guide: "The Guide drawer",
  "settings.help": "The Control Center's ? button that opens the Guide",
};

/** `settings.nav.<tab>` anchors on each Control Center nav button (one snippet attribute). */
export const settingsNavAnchor = (tab: string) => `settings.nav.${tab}`;
