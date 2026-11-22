import { invoke } from "@tauri-apps/api/core";
import { packById, registerCustomPack } from "./packs";

interface ThemeFileInfo {
  name: string;
  path: string;
}

let inFlight: Promise<number> | null = null;

/**
 * Reads every saved `.lenstheme` file and registers the custom packs they carry.
 * Each surface window has its own JS context, so each one calls this once at startup.
 * Safe to call repeatedly; concurrent calls share one read. Resolves to the number registered.
 */
export function loadCustomPacksFromDisk(): Promise<number> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    let count = 0;
    try {
      const files = await invoke<ThemeFileInfo[]>("list_theme_files_cmd");
      for (const file of files) {
        try {
          const raw = JSON.parse(await invoke<string>("read_theme_file_cmd", { name: file.name }));
          if (raw && typeof raw === "object" && raw.lenstheme === 1 && raw.pack !== undefined) {
            if (registerCustomPack(raw.pack)) count += 1;
          }
        } catch {
          // An unreadable or malformed file is skipped, never fatal.
        }
      }
    } catch {
      // Theme commands unavailable: built-in packs still work.
    }
    return count;
  })();
  const done = inFlight;
  done.finally(() => {
    if (inFlight === done) inFlight = null;
  });
  return done;
}

/**
 * Makes sure `presetId` resolves to a pack. If it is a custom id this window has not seen yet
 * (another surface just imported it), re-reads the theme files. Resolves true when the pack is known.
 */
export async function ensurePackLoaded(presetId: string | undefined | null): Promise<boolean> {
  if (!presetId) return false;
  if (packById(presetId)) return true;
  await loadCustomPacksFromDisk();
  return !!packById(presetId);
}
