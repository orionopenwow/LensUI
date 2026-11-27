// "mission control", "open mission control", "/mission" — opens Lens Mission Control in dev
// builds only (CommandSurface checks __LENS_ADMIN__ first; docs/MISSION_CONTROL.md).
export function isMissionControlPhrase(text: string): boolean {
  const t = text.trim().toLowerCase().replace(/\s+/g, " ");
  return /^(open |show )?(lens )?mission control$/.test(t) || t === "/mission";
}
