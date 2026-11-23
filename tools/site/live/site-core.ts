// The website's backend for the live dock: the parity harness's mock (tools/parity/mock/core.ts) with
// the demo desk's apps and real icons, bridged to the page. The page's desk (docs/site/js/desk.js)
// owns the windows: it tells the dock which are open ({lens:"windows"}), and the dock's launch, focus,
// minimise and close requests go back to the page ({lens:"act"}). Icons are files the site build writes
// to media/icons and media/apps (tools/site/lib/icons.mjs); the dock frame lives at live/dock/.
import { invoke as baseInvoke } from "../../parity/mock/core";
export { calls, convertFileSrc, isTauri } from "../../parity/mock/core";

const I = (id: string) => `../../media/icons/${id}.svg`;
const A = (file: string) => `../../media/apps/${file}`;

/** The desk's apps, pinned in this order. `id` is the desk app id the page opens. */
export const APPS = [
  { id: "browser", name: "Lens Browser", path: "lens://browser", icon: I("lens-browser") },
  { id: "files", name: "Files", path: "lens://files", icon: I("explorer") },
  { id: "notes", name: "Notes", path: "lens://notes", icon: I("lens-notes") },
  { id: "music", name: "Lens Music", path: "lens://music", icon: I("lens-music") },
  { id: "monitor", name: "Monitor", path: "lens://monitor", icon: I("lens-monitor") },
  { id: "timer", name: "Timer", path: "lens://timer", icon: I("lens-timer") },
  { id: "terminal", name: "Terminal", path: "lens://terminal", icon: I("terminal") },
  { id: "code", name: "VSCodium", path: "lens://code", icon: I("vscodium") },
  { id: "chat", name: "Discord", path: "lens://chat", icon: I("discord") },
  { id: "store", name: "Lens Apps", path: "lens://store", icon: I("lens-apps") },
  { id: "settings", name: "Settings", path: "lens://settings", icon: I("lens-settings") },
];
/** The short set used by the dock-style rail (?mini=1). */
export const MINI = ["browser", "files", "notes", "music", "code", "settings"];
const EXTRA = [
  { name: "Krita", path: "lens://store/krita", icon: A("krita-icon.webp") },
  { name: "Blender", path: "lens://store/blender", icon: A("blender-icon.svg") },
  { name: "OBS Studio", path: "lens://store/obs-studio", icon: A("obs-studio-icon.webp") },
  { name: "Spotify", path: "lens://music/spotify", icon: I("spotify") },
  { name: "Firefox", path: "lens://browser/firefox", icon: I("firefox") },
];
export const ICON_BY_NAME: Record<string, string> = Object.fromEntries([...APPS, ...EXTRA].map((a) => [a.name.toLowerCase(), a.icon]));
const ICON: Record<string, string> = Object.fromEntries([...APPS, ...EXTRA].map((a) => [a.path.toLowerCase(), a.icon]));

let running: any[] = [];
/** The page's open windows, in the dock's RunningWindow shape. */
export function setRunning(list: { hwnd: number; app: string; title: string; focused: boolean; min: boolean }[]) {
  running = list.map((w) => {
    const a = APPS.find((x) => x.id === w.app) ?? APPS[0];
    return { hwnd: w.hwnd, title: w.title, processName: a.path.split("/").pop(), exePath: a.path, isFocused: w.focused, isMinimized: w.min, isMaximized: false, iconDataUrl: a.icon };
  });
  return running;
}
const toPage = (cmd: string, args: any) => { try { window.parent?.postMessage({ lens: "act", cmd, args }, "*"); } catch { /* no host */ } };
const INSTALLED = [...APPS, ...EXTRA].map((a) => ({ name: a.name, path: a.path, category: "App" })).sort((a, b) => a.name.localeCompare(b.name));

export async function invoke<T = any>(cmd: string, args?: any): Promise<T> {
  if (cmd === "get_icon_for_path") return (ICON[String(args?.path ?? "").toLowerCase()] ?? null) as T;
  if (cmd === "get_running_windows") return running as T;
  if (cmd === "scan_installed_apps_cmd") return INSTALLED as T;
  if (cmd === "launch_app_cmd" || cmd === "focus_window_cmd" || cmd === "window_action_cmd") { toPage(cmd, args); return null as T; }
  if (cmd === "get_launcher_home_cmd") {
    return {
      recentFiles: [
        { name: "Launch plan.md", path: "lens://notes", extension: "md", modifiedMinutesAgo: 6 },
        { name: "release-notes.html", path: "lens://browser", extension: "html", modifiedMinutesAgo: 25 },
      ],
      folders: [
        { name: "Downloads", path: "lens://files", color: "cobalt", itemCount: 6 },
        { name: "Projects", path: "lens://files", color: "amber", itemCount: 9 },
      ],
    } as T;
  }
  return baseInvoke<T>(cmd, args);
}
