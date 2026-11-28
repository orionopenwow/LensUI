// The optional Lens Apps icon on the Windows desktop (setup's Apps page, Settings › Lens Apps).
// The shortcut itself is made and removed by Rust (src-tauri/src/desktop_shortcut.rs); this draws
// the Lens Apps icon (src/icons/lensApps.ts) as a 256 px PNG for it. Off until turned on, and
// Remove all Lens changes takes it off again.
import { invoke } from "@tauri-apps/api/core";
import { lensAppIconUrl } from "../icons/lensApps";

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
export const desktopIconOn = (): Promise<boolean> => invoke<boolean>("apps_desktop_icon_get").catch(() => false);

/** Puts the icon on the desktop or takes it off; resolves to whether it is on afterwards. */
export async function setDesktopIcon(on: boolean): Promise<boolean> {
  const iconPng = on ? await lensAppsIconPng() : null;
  return invoke<boolean>("apps_desktop_icon_set", { on, iconPng });
}

/** Opens Lens Apps in its own window. */
export const openLensApps = (): Promise<void> => invoke<void>("open_surface", { label: "apps" });
