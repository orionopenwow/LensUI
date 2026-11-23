// Parity mock for the right-click card, packs and the micro-save toast (base harness mock + extras).
import { invoke as baseInvoke } from "../mock/core";
export { convertFileSrc, isTauri } from "../mock/core";

export async function invoke<T = any>(cmd: string, args?: any): Promise<T> {
  switch (cmd) {
    case "context_menu_get":
      return { prefs: null, usage: {} } as T;
    case "context_menu_set":
    case "context_menu_reset":
      return null as T;
    default:
      return baseInvoke<T>(cmd, args);
  }
}
