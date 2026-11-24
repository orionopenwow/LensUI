// Parity mock for Lens Browser: base harness mock plus browser and AI commands.
import { invoke as baseInvoke } from "../mock/core";
export { convertFileSrc, isTauri } from "../mock/core";

const extra: Record<string, (a: any) => any> = {
  browser_state: () => (globalThis as any).__lensBrowserView,
  browser_history_search: () => (globalThis as any).__lensSuggest ?? [],
  browser_set_viewport: () => null,
  browser_set_overlay: () => null,
  browser_events: () => [],
  // AAA pass: toolbar state, downloads, per-item import, receipts.
  browser_page: () => (globalThis as any).__lensPageStatus ?? { canBack: true, canForward: false, ready: "complete", error: "", hasVideo: false },
  browser_history_nav: () => null,
  browser_history_remove: () => null,
  browser_history_clear: () => null,
  browser_downloads_clear: (a) => ((globalThis as any).__lensBrowserView?.downloads ?? []).filter((d: any) => d.state === "downloading" || (a.id != null && d.id !== a.id)),
  browser_download_reveal: () => null,
  browser_tab_duplicate: () => (globalThis as any).__lensBrowserView,
  browser_zoom: (a) => a.zoom,
  browser_archived: () => [],
  browser_import_items: () => (globalThis as any).__lensImportItems ?? { bookmarks: [], tabs: [], truncated: false, defaults: {} },
  browser_import_receipts: () => (globalThis as any).__lensImportReceipts ?? [],
  browser_import_undo: () => (globalThis as any).__lensBrowserView,
  shelf_add: () => "s9",
};

export async function invoke<T = any>(cmd: string, args?: any): Promise<T> {
  if (extra[cmd]) return (await extra[cmd](args ?? {})) as T;
  return baseInvoke<T>(cmd, args);
}
