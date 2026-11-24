// A featured look names a pointer family. Lens only changes the Windows pointers when its own
// pointers are already switched on (Settings › Appearance › Mouse pointer), so applying a theme
// never starts writing cursor settings by itself. Runs after the theme is applied; never blocks it.
import { cursorApi } from "../cursors/api";
import { packById } from "./packs";
import { featuredLook } from "./featured";

export async function matchLookPointer(id: string): Promise<boolean> {
  const look = featuredLook(id);
  const pack = packById(id);
  if (!look || !pack) return false;
  try {
    const status = await cursorApi.status();
    if (!status.state.applied) return false;
    await cursorApi.apply({ ...status.state.style, family: look.cursor, dark: pack.scheme !== "light", accent: pack.accent.toLowerCase() }, status.state.size);
    return true;
  } catch {
    return false;
  }
}
