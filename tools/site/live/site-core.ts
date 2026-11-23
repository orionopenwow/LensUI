// The website's backend for the live dock: the parity harness's mock (tools/parity/mock/core.ts) with
// a believable set of apps and real icons. Icons are files the site build writes to media/icons and
// media/apps (see tools/site/lib/icons.mjs); the dock iframe lives at live/dock/, hence "../../".
import { invoke as baseInvoke } from "../../parity/mock/core";
export { calls, convertFileSrc, isTauri } from "../../parity/mock/core";

const I = (id: string) => `../../media/icons/${id}.svg`;
const A = (file: string) => `../../media/apps/${file}`;

export const APPS = [
  { id: "lens-browser", name: "Lens Browser", path: "C:\\Program Files\\Lens UI\\lens-browser.exe", proc: "lens-browser.exe", icon: I("lens-browser") },
  { id: "explorer", name: "File Explorer", path: "C:\\Windows\\explorer.exe", proc: "explorer.exe", icon: I("explorer") },
  { id: "terminal", name: "Terminal", path: "C:\\Apps\\wt.exe", proc: "wt.exe", icon: I("terminal") },
  { id: "vscodium", name: "VSCodium", path: "C:\\Apps\\VSCodium\\VSCodium.exe", proc: "VSCodium.exe", icon: I("vscodium") },
  { id: "spotify", name: "Spotify", path: "C:\\Apps\\Spotify\\Spotify.exe", proc: "Spotify.exe", icon: I("spotify") },
  { id: "discord", name: "Discord", path: "C:\\Apps\\Discord\\Discord.exe", proc: "Discord.exe", icon: I("discord") },
  { id: "obsidian", name: "Obsidian", path: "C:\\Apps\\Obsidian\\Obsidian.exe", proc: "Obsidian.exe", icon: I("obsidian") },
  { id: "figma", name: "Figma", path: "C:\\Apps\\Figma\\Figma.exe", proc: "Figma.exe", icon: I("figma") },
  { id: "krita", name: "Krita", path: "C:\\Apps\\Krita\\krita.exe", proc: "krita.exe", icon: A("krita-icon.webp") },
  { id: "steam", name: "Steam", path: "C:\\Apps\\Steam\\steam.exe", proc: "steam.exe", icon: I("steam") },
  { id: "lens-apps", name: "Lens Apps", path: "lens://apps", proc: "lens-apps", icon: I("lens-apps") },
  { id: "lens-settings", name: "Lens Settings", path: "lens://settings", proc: "lens-settings", icon: I("lens-settings") },
];
// Search results beyond the pinned ones (what "Installed apps" shows).
const EXTRA = [
  { name: "Notepad", path: "C:\\Windows\\notepad.exe", icon: I("notepad") },
  { name: "Blender", path: "C:\\Apps\\Blender\\blender.exe", icon: A("blender-icon.svg") },
  { name: "OBS Studio", path: "C:\\Apps\\obs\\obs64.exe", icon: A("obs-studio-icon.webp") },
  { name: "Ollama", path: "C:\\Apps\\Ollama\\ollama app.exe", icon: A("ollama-icon.webp") },
  { name: "ArtCraft", path: "C:\\Apps\\ArtCraft\\artcraft.exe", icon: A("artcraft-icon.webp") },
  { name: "Firefox", path: "C:\\Apps\\Firefox\\firefox.exe", icon: I("firefox") },
  { name: "Lens Command", path: "lens://command", icon: I("lens-command") },
];
/** App name → icon, for decorating search rows in the demo. */
export const ICON_BY_NAME: Record<string, string> = Object.fromEntries([...APPS, ...EXTRA].map((a) => [a.name.toLowerCase(), a.icon]));
const ICON: Record<string, string> = Object.fromEntries([...APPS, ...EXTRA].map((a) => [a.path.toLowerCase(), a.icon]));

const win = (hwnd: number, title: string, id: string, focused = false) => {
  const a = APPS.find((x) => x.id === id)!;
  return { hwnd, title, processName: a.proc, exePath: a.path, isFocused: focused, isMinimized: false, isMaximized: false, iconDataUrl: a.icon };
};
const RUNNING = [
  win(201, "lens-ui — VSCodium", "vscodium", true),
  win(202, "Release notes · Lens Browser", "lens-browser"),
  win(203, "Spotify", "spotify"),
  win(204, "Downloads", "explorer"),
  win(205, "#design — Discord", "discord"),
];
const INSTALLED = [...APPS.filter((a) => !a.path.startsWith("lens://")), ...EXTRA]
  .map((a) => ({ name: a.name, path: a.path, category: "App" }))
  .sort((a, b) => a.name.localeCompare(b.name));

export async function invoke<T = any>(cmd: string, args?: any): Promise<T> {
  if (cmd === "get_icon_for_path") return (ICON[String(args?.path ?? "").toLowerCase()] ?? null) as T;
  if (cmd === "get_running_windows") return RUNNING as T;
  if (cmd === "scan_installed_apps_cmd") return INSTALLED as T;
  if (cmd === "get_launcher_home_cmd") {
    return {
      recentFiles: [
        { name: "Launch plan.md", path: "C:\\Users\\you\\Documents\\Launch plan.md", extension: "md", modifiedMinutesAgo: 6 },
        { name: "dock-mockup.fig", path: "C:\\Users\\you\\Design\\dock-mockup.fig", extension: "fig", modifiedMinutesAgo: 25 },
      ],
      folders: [
        { name: "Downloads", path: "C:\\Users\\you\\Downloads", color: "cobalt", itemCount: 42 },
        { name: "Projects", path: "C:\\Users\\you\\Projects", color: "amber", itemCount: 9 },
      ],
    } as T;
  }
  return baseInvoke<T>(cmd, args);
}
