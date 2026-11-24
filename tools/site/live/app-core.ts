// The website's backend for the real surfaces in the demo: the parity galleries' mocks chained into
// one (build-live.mjs resolves each gallery's "../mock/core" to the next mock in the chain, ending at
// tools/parity/mock/core.ts), so one shared chunk serves every surface. Requests that leave a surface
// (open another surface, launch an app, act on a window) go to the page's desk as {lens:"act"}.
import { invoke as chainInvoke } from "../../parity/cleaner/mockCore";
export { convertFileSrc, isTauri } from "../../parity/mock/core";

const W = globalThis as any;
// The app's default window-button order (Yellow · Green · Red); the harness mock predates it.
{
  const c = W.__lensConfig?.();
  if (c?.windowControls) { c.windowControls.order = "yellow-green-red"; W.__lensSetConfig(c); }
}
const TO_PAGE = new Set(["open_surface", "toggle_surface", "close_surface", "hide_surface", "open_quicksettings_tab_cmd", "show_command_cmd", "launch_app_cmd", "focus_window_cmd", "window_action_cmd", "browser_open", "apps_open_cmd", "open_core_app_cmd", "coreapp_open"]);
export const calls: string[] = [];
export async function invoke<T = any>(cmd: string, args?: any): Promise<T> {
  calls.push(cmd);
  if (TO_PAGE.has(cmd)) { try { window.parent?.postMessage({ lens: "act", cmd, args: args ?? {} }, location.origin); } catch { /* no host */ } }
  return (await (chainInvoke as any)(cmd, args)) as T;
}
export const transformCallback = () => 0;
export class Channel<T = unknown> { onmessage: (m: T) => void = () => {}; }
