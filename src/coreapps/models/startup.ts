// Lens Startup & Uninstall: impact estimates and list helpers. Pure.
import type { InstalledProgram, StartupEntry } from "../../types/generated";

export type Impact = "high" | "medium" | "low";

/** Apps known to do a lot at sign-in (sync, launchers, chat, updaters). Lower case, no spaces. */
const HEAVY = ["onedrive", "teams", "dropbox", "googledrive", "creativecloud", "adobe", "steam", "epicgames", "battle.net", "origin", "eaapp", "ubisoft", "discord", "spotify", "zoom", "skype", "slack", "icloud", "nvidia", "razer", "logioptions", "corsair", "msiafterburner", "wallpaperengine"];
const LIGHT = ["securityhealth", "rtkaudio", "realtek", "synaptics", "elan", "igfx", "ctfmon", "lensui", "lens ui", "keepass", "1password", "bitwarden", "flux", "powertoys", "everything", "ditto", "sharex"];

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9.]/g, "");

/**
 * Estimated sign-in impact. Windows measures real impact with ETW traces Lens can't read without
 * admin, so this is a labelled estimate from what the app is and how it starts.
 */
export function startupImpact(e: Pick<StartupEntry, "name" | "command">): { impact: Impact; why: string } {
  const hay = squash(`${e.name} ${e.command}`);
  const quiet = /(--?(minimi[sz]ed|background|silent|hidden|tray|autostart|startup))|\/(min|background|silent)\b/i.test(e.command);
  if (HEAVY.some((h) => hay.includes(h))) {
    return quiet ? { impact: "medium", why: "Starts in the background, but syncs or updates at sign-in." } : { impact: "high", why: "Opens a full app and syncs or updates at sign-in." };
  }
  if (LIGHT.some((l) => hay.includes(squash(l)))) return { impact: "low", why: "A small helper that starts quickly." };
  if (/update|updater|helper|agent|service/i.test(e.name + " " + e.command)) return { impact: "medium", why: "Checks for updates or runs a helper in the background." };
  return quiet ? { impact: "low", why: "Starts minimised." } : { impact: "medium", why: "Opens when you sign in." };
}

export const impactRank: Record<Impact, number> = { high: 0, medium: 1, low: 2 };

export function sortStartup(list: StartupEntry[]): (StartupEntry & { impact: Impact; why: string })[] {
  return list
    .map((e) => ({ ...e, ...startupImpact(e) }))
    .sort((a, b) => Number(b.enabled) - Number(a.enabled) || impactRank[a.impact] - impactRank[b.impact] || a.name.localeCompare(b.name));
}

export type ProgramSort = "name" | "size" | "lastUsed";

export function sortPrograms(list: InstalledProgram[], sort: ProgramSort, query = ""): InstalledProgram[] {
  const q = query.trim().toLowerCase();
  const xs = q ? list.filter((p) => `${p.name} ${p.publisher}`.toLowerCase().includes(q)) : list.slice();
  const cmp: Record<ProgramSort, (a: InstalledProgram, b: InstalledProgram) => number> = {
    name: (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    size: (a, b) => (b.sizeKb ?? -1) - (a.sizeKb ?? -1) || a.name.localeCompare(b.name),
    // Never-used (or unknown) apps first: those are the ones worth reviewing.
    lastUsed: (a, b) => (a.lastUsedMs ?? 0) - (b.lastUsedMs ?? 0) || a.name.localeCompare(b.name),
  };
  return xs.sort(cmp[sort]);
}

export const totalKb = (list: InstalledProgram[]) => list.reduce((s, p) => s + (p.sizeKb ?? 0), 0);

/** Apps not opened from the Start menu or taskbar in `days` days (only when Windows recorded it). */
export function unusedFor(list: InstalledProgram[], days: number, now = Date.now()): InstalledProgram[] {
  return list.filter((p) => p.lastUsedMs != null && now - p.lastUsedMs > days * 86_400_000);
}
