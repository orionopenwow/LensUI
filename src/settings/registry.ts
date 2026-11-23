// The Settings hub's map: every page, its sections, and the Windows Settings pages Lens can open.
// Pure data + helpers (no React), so search and deep links are unit-testable.

export type GroupId = "lens" | "windows" | "status";

export type PageId =
  // Lens
  | "appearance"
  | "dock"
  | "desktop"
  | "keys"
  | "ai"
  | "music"
  | "store"
  // Windows
  | "display"
  | "sound"
  | "network"
  | "power"
  | "apps"
  | "storage"
  | "focus"
  | "privacy"
  | "update"
  | "time"
  | "accessibility"
  | "gaming"
  // Status
  | "tasks"
  | "notifications"
  | "about";

export interface SectionDef {
  id: string;
  label: string;
  keywords?: string[];
}

export interface PageDef {
  id: PageId;
  group: GroupId;
  label: string;
  /** One line under the title. */
  description: string;
  /** Icon key, resolved in icons.tsx. */
  icon: string;
  /** Spectrum colour for the icon. */
  color: string;
  /** The 2–4 things people do most here (shown in the hero row). */
  controls: string[];
  keywords: string[];
  sections: SectionDef[];
  /** The matching Windows Settings page, when there is one. */
  winUri?: string;
}

export const GROUPS: { id: GroupId; label: string }[] = [
  { id: "lens", label: "Lens" },
  { id: "windows", label: "Windows" },
  { id: "status", label: "Status" },
];

export const PAGES: PageDef[] = [
  // ---------------- Lens
  {
    id: "appearance",
    group: "lens",
    label: "Appearance",
    description: "Theme, accent, glass, window frames, pointers and shapes.",
    icon: "palette",
    color: "#A78BFA",
    controls: ["Theme pack", "Dark / Light / Auto", "Accent colour"],
    keywords: ["theme", "look", "pack", "accent", "colour", "color", "dark mode", "light mode", "glass", "blur", "roundness", "cursor", "pointer", "font", "icons", "wallpaper schedule", "shape style"],
    sections: [
      { id: "current", label: "Current theme", keywords: ["pack", "accent", "glass", "roundness"] },
      { id: "choose", label: "Choose a theme", keywords: ["gallery", "browse", "catppuccin", "nord", "claude"] },
      { id: "customise", label: "Customise", keywords: ["window frames", "buttons", "traffic lights", "icons", "fonts", "schedule", "accessibility"] },
      { id: "pointer", label: "Mouse pointer", keywords: ["cursor", "pointer", "trail", "ripple", "spotlight"] },
    ],
  },
  {
    id: "dock",
    group: "lens",
    label: "Dock & Bar",
    description: "Dock style, position, size, auto-hide and the top bar.",
    icon: "dock",
    color: "#60A5FA",
    controls: ["Dock style", "Screen edge", "Auto-hide"],
    keywords: ["dock", "taskbar", "top bar", "menu bar", "magnification", "auto hide", "pin", "launcher", "clock", "tray", "labels", "slim", "floating", "islands"],
    sections: [
      { id: "style", label: "Dock style", keywords: ["floating", "slim", "taskbar", "studio", "minimal", "split"] },
      { id: "behaviour", label: "Behaviour", keywords: ["auto hide", "magnification", "previews", "lock"] },
      { id: "topbar", label: "Top bar", keywords: ["menu bar", "clock", "widgets", "tray"] },
    ],
  },
  {
    id: "desktop",
    group: "lens",
    label: "Desktop",
    description: "Wallpaper and Playground, desktop sessions, widgets and folder icons.",
    icon: "layers",
    color: "#818CF8",
    controls: ["Playground scene", "Save desktop session", "Folder icon style"],
    keywords: ["wallpaper", "playground", "sand", "scene", "widgets", "sessions", "tiling", "workspaces", "virtual desktops", "folder icons", "explorer folders", "plugins"],
    sections: [
      { id: "living", label: "Living desktop", keywords: ["playground", "sand", "aurora", "idle mode"] },
      { id: "sessions", label: "Desktop sessions", keywords: ["save", "restore", "workspaces", "tiling"] },
      { id: "widgets", label: "Widgets", keywords: ["widget drawer", "calendar", "weather"] },
      { id: "folders", label: "Folder icons", keywords: ["explorer", "folder colour"] },
    ],
  },
  {
    id: "keys",
    group: "lens",
    label: "Windows & Keys",
    description: "How Lens works with Windows: startup, hotkeys, hot corners, Alt+drag and window styling.",
    icon: "monitor",
    color: "#38BDF8",
    controls: ["Start with Windows", "Hot corners", "Alt+drag"],
    keywords: ["hotkeys", "shortcuts", "win key", "alt tab", "hot corners", "alt drag", "summon", "window styling", "focus dim", "borders", "pin on top", "startup", "virtual desktop", "shell mode", "monitor"],
    sections: [
      { id: "desktops", label: "Virtual desktops", keywords: ["next desktop", "new desktop"] },
      { id: "integration", label: "Windows integration", keywords: ["startup", "fullscreen", "tray", "clipboard"] },
      { id: "input", label: "Keys, corners & monitors", keywords: ["win key", "alt tab", "hot corners", "alt drag", "summon"] },
      { id: "styling", label: "Window styling", keywords: ["focus dim", "borders", "rules", "opacity"] },
      { id: "shell", label: "Shell mode", keywords: ["replace explorer"] },
    ],
  },
  {
    id: "ai",
    group: "lens",
    label: "AI & Command",
    description: "Engines and privacy, Lens Command, clipboard, connections, transcription and agents.",
    icon: "sparkles",
    color: "#F472B6",
    controls: ["AI on / off", "Engine", "Privacy mode"],
    keywords: ["ai", "claude", "ollama", "local model", "command", "shelf", "clipboard history", "browser extension", "transcription", "whisper", "mcp", "agents", "privacy"],
    sections: [
      { id: "engine", label: "AI engine", keywords: ["claude", "ollama", "lm studio", "privacy", "api key"] },
      { id: "command", label: "Lens Command", keywords: ["hotkey", "mini", "slash commands"] },
      { id: "clipboard", label: "Clipboard history", keywords: ["paste", "history"] },
      { id: "connections", label: "Connections", keywords: ["browser", "explorer", "claude desktop"] },
      { id: "transcription", label: "Transcription", keywords: ["whisper", "subtitles"] },
      { id: "mcp", label: "AI apps (MCP)", keywords: ["claude code", "mcp"] },
      { id: "presence", label: "Lens at work", keywords: ["orb", "show steps", "watch ai", "captions", "pause lens", "stop", "claude is controlling", "overlay"] },
      { id: "agents", label: "Agents", keywords: ["automations", "macros"] },
      { id: "voice", label: "Voice", keywords: ["voice", "speech", "hold to talk", "wake word", "lens", "dictation", "conversation"] },
      { id: "magic", label: "Magic right-click", keywords: ["magic menu", "ctrl alt right click", "context window"] },
      { id: "rightclick", label: "Right-click menu", keywords: ["context menu", "actions", "custom actions", "explorer verbs"] },
      { id: "packs", label: "Context packs & clipper", keywords: ["packs", "micro save", "obsidian", "clipper", "templates"] },
      { id: "snip", label: "Lens Snip", keywords: ["screenshot", "snipping", "capture", "redact", "ocr", "record", "pin"] },
      { id: "browser", label: "Lens Browser", keywords: ["browser", "tabs", "spaces", "import bookmarks", "agent"] },
      { id: "permissions", label: "Permissions", keywords: ["grants", "allowed", "ask first", "blocked", "audit log"] },
      { id: "safety", label: "Agent safety", keywords: ["scam", "phishing", "prompt injection", "sandbox"] },
      { id: "guide", label: "Lens Guide", keywords: ["lessons", "help", "tutorial", "how do i"] },
    ],
  },
  {
    id: "music",
    group: "lens",
    label: "Music",
    description: "Now playing from any app, synced lyrics, and the theme following your music.",
    icon: "music",
    color: "#F472B6",
    controls: ["Now playing", "Lyrics", "Theme follows music"],
    keywords: ["music", "spotify", "apple music", "lyrics", "now playing", "media", "last.fm", "spicetify", "sleep timer"],
    sections: [],
  },
  {
    id: "store",
    group: "lens",
    label: "Apps",
    description: "Free and open-source tools, one click to install, nothing without your OK.",
    icon: "grid",
    color: "#34D399",
    controls: ["Browse", "Install", "Update all"],
    keywords: ["apps", "install", "store", "catalogue", "open source", "artcraft", "concat", "winget", "download"],
    sections: [{ id: "settings", label: "Apps settings", keywords: ["auto update", "activity log", "remove installed"] }],
  },
  // ---------------- Windows
  {
    id: "display",
    group: "windows",
    label: "Display",
    description: "Brightness, night light, resolution, refresh rate and your monitors.",
    icon: "sun",
    color: "#FBBF24",
    controls: ["Brightness", "Night light", "Warmth"],
    keywords: ["brightness", "night light", "blue light", "warmth", "resolution", "refresh rate", "hz", "scale", "dpi", "monitors", "hdr", "display"],
    sections: [
      { id: "monitors", label: "Monitors", keywords: ["resolution", "refresh", "scale", "arrangement"] },
      { id: "hdr", label: "HDR & colour", keywords: ["hdr", "colour profile"] },
    ],
    winUri: "ms-settings:display",
  },
  {
    id: "sound",
    group: "windows",
    label: "Sound",
    description: "Volume, output and input devices, and per-app volume.",
    icon: "volume",
    color: "#38BDF8",
    controls: ["Volume", "Apps playing now", "Output device", "Microphone"],
    keywords: ["volume", "mute", "speakers", "headphones", "output", "input", "microphone", "mic", "mixer", "app volume", "spatial sound", "switch output"],
    sections: [
      { id: "mixer", label: "Mixer", keywords: ["volume", "per app", "playing now"] },
      { id: "devices", label: "Output & microphone", keywords: ["output", "input", "microphone", "speakers", "headphones"] },
      { id: "extras", label: "More sound settings", keywords: ["spatial sound", "app routing"] },
    ],
    winUri: "ms-settings:sound",
  },
  {
    id: "network",
    group: "windows",
    label: "Network & Bluetooth",
    description: "Wi-Fi, airplane mode and Bluetooth devices.",
    icon: "wifi",
    color: "#34D399",
    controls: ["Wi-Fi", "Bluetooth", "Airplane mode"],
    keywords: ["wifi", "wi-fi", "network", "internet", "bluetooth", "airplane", "flight mode", "headphones", "pair", "ethernet", "vpn", "proxy"],
    sections: [
      { id: "wifi", label: "Wi-Fi networks", keywords: ["connect", "ssid"] },
      { id: "bluetooth", label: "Bluetooth devices", keywords: ["pair", "headphones", "mouse"] },
    ],
    winUri: "ms-settings:network",
  },
  {
    id: "power",
    group: "windows",
    label: "Power & Battery",
    description: "Power mode, battery and battery saver, screen and sleep.",
    icon: "zap",
    color: "#FBBF24",
    controls: ["Power mode", "Battery", "Battery saver"],
    keywords: ["power", "battery", "battery saver", "performance", "efficiency", "balanced", "sleep", "screen timeout", "charging", "lock", "restart", "shut down"],
    sections: [
      { id: "mode", label: "Power mode", keywords: ["performance", "efficiency"] },
      { id: "sleep", label: "Screen & sleep", keywords: ["timeout", "hibernate"] },
      { id: "actions", label: "Power actions", keywords: ["lock", "sleep", "restart", "shut down", "sign out"] },
    ],
    winUri: "ms-settings:powersleep",
  },
  {
    id: "apps",
    group: "windows",
    label: "Apps & Startup",
    description: "Which apps start with Windows, default apps and installed apps.",
    icon: "appwindow",
    color: "#F87171",
    controls: ["Startup apps", "Default apps", "Installed apps"],
    keywords: ["startup", "startup apps", "run at login", "autostart", "default apps", "installed apps", "uninstall", "open with"],
    sections: [
      { id: "startup", label: "Startup apps", keywords: ["autostart", "login"] },
      { id: "manage", label: "Manage apps", keywords: ["default", "installed", "uninstall"] },
    ],
    winUri: "ms-settings:startupapps",
  },
  {
    id: "storage",
    group: "windows",
    label: "Storage",
    description: "How full your drives are, and cleanup.",
    icon: "harddrive",
    color: "#A3A3A3",
    controls: ["Drive space", "Storage Sense", "Cleanup"],
    keywords: ["storage", "disk", "drive", "space", "free space", "cleanup", "storage sense", "temp files"],
    sections: [{ id: "drives", label: "Drives" }],
    winUri: "ms-settings:storagesense",
  },
  {
    id: "focus",
    group: "windows",
    label: "Focus & Notifications",
    description: "Do not disturb, focus sessions and which apps can notify you.",
    icon: "bell",
    color: "#60A5FA",
    controls: ["Do not disturb", "Focus session", "App notifications"],
    keywords: ["do not disturb", "dnd", "focus", "focus assist", "notifications", "quiet hours", "banners"],
    sections: [{ id: "windows", label: "Windows notifications" }],
    winUri: "ms-settings:notifications",
  },
  {
    id: "privacy",
    group: "windows",
    label: "Privacy & Security",
    description: "Which apps are using your camera, microphone and location, and Windows Security.",
    icon: "shield",
    color: "#34D399",
    controls: ["Camera use", "Microphone use", "Location use"],
    keywords: ["privacy", "camera", "webcam", "microphone", "mic", "location", "permissions", "security", "antivirus", "defender", "firewall"],
    sections: [
      { id: "inuse", label: "In use now", keywords: ["camera", "microphone", "location"] },
      { id: "security", label: "Windows Security", keywords: ["defender", "firewall"] },
    ],
    winUri: "ms-settings:privacy",
  },
  {
    id: "update",
    group: "windows",
    label: "Update",
    description: "Windows Update and Lens updates.",
    icon: "refresh",
    color: "#38BDF8",
    controls: ["Check Windows Update", "Lens updates"],
    keywords: ["update", "windows update", "upgrade", "patch", "restart required"],
    sections: [{ id: "windows", label: "Windows Update" }],
    winUri: "ms-settings:windowsupdate",
  },
  {
    id: "time",
    group: "windows",
    label: "Time & Language",
    description: "Time zone, clock format and keyboard layouts.",
    icon: "clock",
    color: "#A78BFA",
    controls: ["Time zone", "Keyboard layout"],
    keywords: ["time", "date", "time zone", "clock", "24 hour", "language", "region", "keyboard", "input method", "layout"],
    sections: [
      { id: "clock", label: "Date & time", keywords: ["time zone", "24 hour"] },
      { id: "keyboard", label: "Keyboard layouts", keywords: ["input", "language"] },
    ],
    winUri: "ms-settings:dateandtime",
  },
  {
    id: "accessibility",
    group: "windows",
    label: "Accessibility",
    description: "Text size, animation effects, contrast themes and the magnifier.",
    icon: "accessibility",
    color: "#F472B6",
    controls: ["Animation effects", "Text size", "Magnifier"],
    keywords: ["accessibility", "text size", "font size", "animations", "reduce motion", "contrast", "high contrast", "magnifier", "zoom", "narrator", "captions"],
    sections: [
      { id: "vision", label: "Vision", keywords: ["text size", "contrast", "magnifier"] },
      { id: "motion", label: "Motion", keywords: ["animations"] },
    ],
    winUri: "ms-settings:easeofaccess",
  },
  {
    id: "gaming",
    group: "windows",
    label: "Gaming",
    description: "Game Mode and how Lens steps aside while you play.",
    icon: "gamepad",
    color: "#22D3EE",
    controls: ["Game Mode", "Pause Lens in games"],
    keywords: ["gaming", "game mode", "game bar", "captures", "fullscreen", "anti-cheat"],
    sections: [{ id: "lens", label: "Lens while gaming" }],
    winUri: "ms-settings:gaming-gamemode",
  },
  // ---------------- Status
  {
    id: "tasks",
    group: "status",
    label: "System & Tasks",
    description: "CPU, memory and uptime, running windows and top processes.",
    icon: "activity",
    color: "#34D399",
    controls: ["CPU", "Memory", "End task"],
    keywords: ["task manager", "cpu", "ram", "memory", "processes", "end task", "running apps", "uptime", "performance"],
    sections: [{ id: "processes", label: "Windows & processes" }],
  },
  {
    id: "notifications",
    group: "status",
    label: "Notifications",
    description: "Messages and notification history.",
    icon: "message",
    color: "#60A5FA",
    controls: ["Notification history"],
    keywords: ["messages", "notifications", "history", "inbox"],
    sections: [],
  },
  {
    id: "about",
    group: "status",
    label: "About & Testing",
    description: "Lens updates, crash reports, self-test, backups and the Tester Hub.",
    icon: "flask",
    color: "#FBBF24",
    controls: ["Check for updates", "Run self-test", "Back up settings"],
    keywords: ["about", "version", "update lens", "crash reports", "self test", "backup", "restore", "tester", "remove all lens changes", "uninstall"],
    sections: [
      { id: "updates", label: "Updates & crash reports" },
      { id: "selftest", label: "Self-test" },
      { id: "backup", label: "Back up & restore", keywords: ["remove all lens changes"] },
      { id: "tester", label: "Tester Hub" },
    ],
  },
];

/** Windows Settings pages Lens can open directly (ms-settings URIs, all documented by Microsoft). */
export interface WinSetting {
  label: string;
  uri: string;
  /** The hub page it belongs to. */
  page: PageId;
  keywords?: string[];
}

export const WINDOWS_SETTINGS: WinSetting[] = [
  { label: "Display", uri: "ms-settings:display", page: "display", keywords: ["resolution", "scale"] },
  { label: "Night light", uri: "ms-settings:nightlight", page: "display", keywords: ["blue light"] },
  { label: "Advanced display", uri: "ms-settings:display-advanced", page: "display", keywords: ["refresh rate", "hz"] },
  { label: "HDR", uri: "ms-settings:display-hdr", page: "display", keywords: ["high dynamic range"] },
  { label: "Graphics", uri: "ms-settings:display-advancedgraphics", page: "display", keywords: ["gpu preference"] },
  { label: "Sound", uri: "ms-settings:sound", page: "sound", keywords: ["output", "input"] },
  { label: "Sound devices", uri: "ms-settings:sound-devices", page: "sound", keywords: ["manage devices"] },
  { label: "Volume mixer", uri: "ms-settings:apps-volume", page: "sound", keywords: ["app volume"] },
  { label: "Network & internet", uri: "ms-settings:network", page: "network" },
  { label: "Wi-Fi", uri: "ms-settings:network-wifi", page: "network", keywords: ["wireless"] },
  { label: "Known Wi-Fi networks", uri: "ms-settings:network-wifisettings", page: "network", keywords: ["saved networks", "forget"] },
  { label: "Airplane mode", uri: "ms-settings:network-airplanemode", page: "network", keywords: ["flight"] },
  { label: "VPN", uri: "ms-settings:network-vpn", page: "network" },
  { label: "Proxy", uri: "ms-settings:network-proxy", page: "network" },
  { label: "Ethernet", uri: "ms-settings:network-ethernet", page: "network" },
  { label: "Bluetooth & devices", uri: "ms-settings:bluetooth", page: "network", keywords: ["pair", "add device"] },
  { label: "Printers & scanners", uri: "ms-settings:printers", page: "network" },
  { label: "Mouse", uri: "ms-settings:mousetouchpad", page: "keys", keywords: ["pointer speed", "scroll"] },
  { label: "Touchpad", uri: "ms-settings:devices-touchpad", page: "keys", keywords: ["gestures"] },
  { label: "Power & battery", uri: "ms-settings:powersleep", page: "power", keywords: ["screen timeout", "sleep"] },
  { label: "Battery saver", uri: "ms-settings:batterysaver", page: "power" },
  { label: "Battery usage", uri: "ms-settings:batterysaver-usagedetails", page: "power", keywords: ["per app battery"] },
  { label: "Startup apps", uri: "ms-settings:startupapps", page: "apps", keywords: ["autostart"] },
  { label: "Default apps", uri: "ms-settings:defaultapps", page: "apps", keywords: ["open with", "browser default"] },
  { label: "Installed apps", uri: "ms-settings:appsfeatures", page: "apps", keywords: ["uninstall", "programs"] },
  { label: "Optional features", uri: "ms-settings:optionalfeatures", page: "apps" },
  { label: "Storage", uri: "ms-settings:storagesense", page: "storage", keywords: ["disk", "cleanup"] },
  { label: "Cleanup recommendations", uri: "ms-settings:storagerecommendations", page: "storage", keywords: ["temp files", "free space"] },
  { label: "Notifications", uri: "ms-settings:notifications", page: "focus", keywords: ["banners", "app notifications"] },
  { label: "Focus", uri: "ms-settings:focus", page: "focus", keywords: ["focus session", "do not disturb"] },
  { label: "Camera privacy", uri: "ms-settings:privacy-webcam", page: "privacy", keywords: ["webcam"] },
  { label: "Microphone privacy", uri: "ms-settings:privacy-microphone", page: "privacy", keywords: ["mic"] },
  { label: "Location privacy", uri: "ms-settings:privacy-location", page: "privacy", keywords: ["gps"] },
  { label: "Windows Security", uri: "ms-settings:windowsdefender", page: "privacy", keywords: ["defender", "antivirus", "firewall"] },
  { label: "Windows Update", uri: "ms-settings:windowsupdate", page: "update", keywords: ["updates"] },
  { label: "Update history", uri: "ms-settings:windowsupdate-history", page: "update" },
  { label: "Date & time", uri: "ms-settings:dateandtime", page: "time", keywords: ["time zone", "clock"] },
  { label: "Language & region", uri: "ms-settings:regionlanguage", page: "time", keywords: ["display language", "region"] },
  { label: "Typing", uri: "ms-settings:typing", page: "time", keywords: ["autocorrect", "keyboard"] },
  { label: "Text size", uri: "ms-settings:easeofaccess-display", page: "accessibility", keywords: ["font size", "make text bigger"] },
  { label: "Visual effects", uri: "ms-settings:easeofaccess-visualeffects", page: "accessibility", keywords: ["animations", "transparency"] },
  { label: "Contrast themes", uri: "ms-settings:easeofaccess-highcontrast", page: "accessibility", keywords: ["high contrast"] },
  { label: "Magnifier", uri: "ms-settings:easeofaccess-magnifier", page: "accessibility", keywords: ["zoom"] },
  { label: "Narrator", uri: "ms-settings:easeofaccess-narrator", page: "accessibility", keywords: ["screen reader"] },
  { label: "Captions", uri: "ms-settings:easeofaccess-closedcaptioning", page: "accessibility", keywords: ["subtitles"] },
  { label: "Game Mode", uri: "ms-settings:gaming-gamemode", page: "gaming" },
  { label: "Game Bar", uri: "ms-settings:gaming-gamebar", page: "gaming", keywords: ["xbox"] },
  { label: "Captures", uri: "ms-settings:gaming-gamedvr", page: "gaming", keywords: ["recording"] },
  { label: "Personalisation", uri: "ms-settings:personalization", page: "appearance", keywords: ["windows theme", "background"] },
  { label: "Colours", uri: "ms-settings:colors", page: "appearance", keywords: ["accent colour", "dark mode windows"] },
  { label: "Taskbar", uri: "ms-settings:taskbar", page: "dock", keywords: ["windows taskbar"] },
  { label: "Multitasking", uri: "ms-settings:multitasking", page: "keys", keywords: ["snap", "alt tab", "virtual desktops"] },
  { label: "About this PC", uri: "ms-settings:about", page: "about", keywords: ["device specs", "pc name", "windows version"] },
];

/** Old tab ids (from the dock, palette and AI bridge) → hub pages. */
export const LEGACY_TABS: Record<string, PageId> = {
  theme: "appearance",
  controls: "appearance",
  dock: "dock",
  topbar: "dock",
  sessions: "desktop",
  widgets: "desktop",
  folders: "desktop",
  system: "keys",
  func: "keys",
  ai: "ai",
  agents: "ai",
  monitor: "tasks",
  messages: "notifications",
  about: "about",
};

export function getPage(id: PageId): PageDef {
  return PAGES.find((p) => p.id === id) ?? PAGES[0];
}

/**
 * Accepts a page id, a legacy tab id, `page#section`, or a `lens://settings/page#section` link.
 * Returns null for anything unknown.
 */
export function resolveTarget(input: string | null | undefined): { page: PageId; section?: string } | null {
  if (!input) return null;
  let s = input.trim();
  s = s.replace(/^lens:\/\/settings\/?/i, "");
  const [rawPage, rawSection] = s.split("#");
  const key = (rawPage || "").toLowerCase();
  const page = (PAGES.find((p) => p.id === key)?.id ?? LEGACY_TABS[key]) as PageId | undefined;
  if (!page) return null;
  // Legacy ids that became sections land on that section.
  const legacySection: Record<string, string> = { agents: "agents", folders: "folders", widgets: "widgets", topbar: "topbar" };
  const section = rawSection || legacySection[key];
  if (section && !getPage(page).sections.some((x) => x.id === section)) return { page };
  return section ? { page, section } : { page };
}

export function pagesInGroup(group: GroupId): PageDef[] {
  return PAGES.filter((p) => p.group === group);
}
