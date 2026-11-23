// Parity mock for Lens Browser: base harness mock plus browser and AI commands.
import { invoke as baseInvoke } from "../mock/core";
export { convertFileSrc, isTauri } from "../mock/core";

const extra: Record<string, (a: any) => any> = {
  browser_state: () => (globalThis as any).__lensBrowserView,
  browser_history_search: () => (globalThis as any).__lensSuggest ?? [],
  browser_set_viewport: () => null,
  browser_set_overlay: () => null,
  browser_events: () => [],
  shelf_add: () => "s9",
};

export async function invoke<T = any>(cmd: string, args?: any): Promise<T> {
  if (extra[cmd]) return (await extra[cmd](args ?? {})) as T;
  return baseInvoke<T>(cmd, args);
}
