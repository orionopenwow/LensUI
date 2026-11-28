// The optional Lens Apps icon on the Windows desktop (setup's Apps page, Settings › Lens Apps).
// The shortcut itself is made and removed by Rust (src-tauri/src/desktop_shortcut.rs); this draws
// the Lens Apps icon (src/icons/lensApps.ts) as a 256 px PNG for it. Off until turned on, and
// Remove all Lens changes takes it off again.
import { invoke } from "@tauri-apps/api/core";
import { lensAppIconUrl } from "../icons/lensApps";
import { quiet } from "../ui/oops";

/** The Lens Apps icon as PNG bytes, or null when the page can't draw it. */
export async function lensAppsIconPng(size = 256): Promise<number[] | null> {
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = lensAppIconUrl("apps");
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, size, size);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
    if (!blob) return null;
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  } catch {
    return null;
  }
}

/** Whether the Lens Apps icon is on the desktop. */
export const desktopIconOn = (): Promise<boolean> =>
  invoke<boolean>("apps_desktop_icon_get").then((on) => on === true, () => false);

/** Puts the icon on the desktop or takes it off; resolves to whether it is on afterwards. */
export async function setDesktopIcon(on: boolean): Promise<boolean> {
  const iconPng = on ? await lensAppsIconPng() : null;
  return invoke<boolean>("apps_desktop_icon_set", { on, iconPng });
}

/** Opens Lens Apps in its own window. */
export const openLensApps = (): Promise<void> => invoke<void>("open_surface", { label: "apps" });

// ── First-run hand-off ─────────────────────────────────────────────────────────────────────────
// After the very first setup, other first-run welcomes (the Lens browser's) wait their turn:
// `FIRST_RUN_DONE` is emitted to every window once, either when setup closes with "Open Lens Apps"
// off, or when the Lens Apps window that first-run setup opened is closed or hidden.
// Payload: { via: "setup-closed" | "apps-closed" }.
export const FIRST_RUN_DONE = "lens://setup/first-run-done";
const PENDING_KEY = "lens.setup.firstRunAppsPending";

/** Called by setup when the first setup closes. */
export function firstRunSetupClosed(openApps: boolean): void {
  if (!openApps) {
    void emitFirstRunDone("setup-closed");
    return;
  }
  try {
    localStorage.setItem(PENDING_KEY, "1");
  } catch {
    /* no storage: the Lens Apps window won't hand off, so do it now */
    void emitFirstRunDone("setup-closed");
  }
}

/** Called by the Lens Apps window when it closes or hides. Emits once, only after first-run setup. */
export function lensAppsWindowLeft(): void {
  try {
    if (localStorage.getItem(PENDING_KEY) !== "1") return;
    localStorage.removeItem(PENDING_KEY);
  } catch {
    return;
  }
  void emitFirstRunDone("apps-closed");
}

async function emitFirstRunDone(via: "setup-closed" | "apps-closed"): Promise<void> {
  const { emit } = await import("@tauri-apps/api/event");
  await emit(FIRST_RUN_DONE, { via }).catch(quiet);
}
