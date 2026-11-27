// The Dock's own model: its types and the pure rules behind the icons (which window sits on
// which pin, what a badge says). No React, no IPC, so every rule is unit-tested
// (src/__tests__/dockModel.test.ts).
import type { PinnedApp, PinnedFolder, RunningWindow } from "../types/lens";

export interface RecentFileItem {
  name: string;
  path: string;
  ext: string;
  ageLabel: string;
  sizeLabel?: string;
  folderName?: string;
  isDir?: boolean;
}

export interface QuickFolderItem {
  name: string;
  path: string;
  color: string;
  itemCount?: number;
}

export interface LauncherHomeData {
  recentFiles: RecentFileItem[];
  folders: QuickFolderItem[];
}

export type DockFilterTab = "all" | "apps" | "files" | "folders" | "recent";

export type DockContextMenu =
  | {
      kind: "app";
      x: number;
      y: number;
      title: string;
      pinnedApp?: PinnedApp;
      windows: RunningWindow[];
      launchPath: string;
    }
  | {
      kind: "folder";
      x: number;
      y: number;
      folder: PinnedFolder;
    }
  | {
      kind: "dock";
      x: number;
      y: number;
    };

/** Which screen edge the Dock sits on. */
export type DockEdge = "bottom" | "top" | "left" | "right";

/** Dock settings added for edge placement, locking, separators and live previews. They are
 *  optional so older config files keep working (missing = bottom, unlocked, none, off). */
export interface DockExtras {
  position?: string;
  locked?: boolean;
  separatorsAfter?: string[];
  livePreviews?: boolean;
  style?: string;
  alignment?: string;
  systemArea?: string;
  magnification?: string;
  magnificationRange?: number;
  launchAnimation?: string;
  minimizeFeedback?: boolean;
  iconSizes?: Record<string, number>;
  showLabels?: boolean;
  fileDropOpen?: boolean;
  scrollCyclesWindows?: boolean;
}

/** What the hover card is showing: an app's windows, anchored at its icon. */
export interface DockHoverCardState {
  key: string;
  x: number;
  y: number;
  title: string;
  isSpotify: boolean;
  windows: RunningWindow[];
  iconUrl?: string | null;
}

/** Shape of Tauri's window drag-and-drop events (physical pixels). */
export interface DragDropPayload {
  paths?: string[];
  position?: { x: number; y: number };
}

export const prefersReducedMotion = () =>
  typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export const normalizeEdge = (raw?: string): DockEdge =>
  raw === "top" || raw === "left" || raw === "right" ? raw : "bottom";

/** Lower-case letters and digits only, without ".exe" — for matching app names loosely. */
export const normName = (s: string) =>
  s.toLowerCase().replace(/\.exe$/, "").replace(/[^a-z0-9]/g, "");

/** Spoken form of the Dock badge (the badge itself is aria-hidden): the same number it shows. */
export function dockBadgeLabel(unread: number, windows: number): string {
  if (unread > 0) return `, ${unread > 99 ? "99+" : unread} notifications`;
  if (windows > 1) return `, ${windows} windows`;
  return "";
}

/** Resolves when an animation finishes, or after `ms` if it never does (a window hidden mid-glide
 *  stops its animations): a failsafe, not the animation's clock. */
export function finishedOrGiveUp(finished: Promise<unknown>, ms: number): Promise<unknown> {
  return Promise.race([finished, new Promise((resolve) => window.setTimeout(resolve, ms))]);
}

const PROCESS_ALIASES: Record<string, string[]> = {
  "wt.exe": ["windowsterminal.exe", "wt.exe"],
  "terminal": ["windowsterminal.exe", "wt.exe"],
  "windows terminal": ["windowsterminal.exe", "wt.exe"],
  "explorer.exe": ["explorer.exe"],
  "file explorer": ["explorer.exe"],
  "notepad.exe": ["notepad.exe"],
  "code.exe": ["code.exe"],
  "visual studio code": ["code.exe"],
  "vs code": ["code.exe"],
  "antigravity": ["antigravity.exe"],
  "chrome.exe": ["chrome.exe"],
  "google chrome": ["chrome.exe"],
  "msedge.exe": ["msedge.exe"],
  "microsoft edge": ["msedge.exe"],
  "spotify": ["spotify.exe"],
  "discord": ["discord.exe"],
  "steam": ["steam.exe", "steamwebhelper.exe"],
  "obs studio": ["obs64.exe"],
  "claude": ["claude.exe"],
};

export function matchesPinnedApp(app: PinnedApp, win: RunningWindow): boolean {
  const appPathLower = app.path.toLowerCase();
  const winPathLower = win.exePath.toLowerCase();
  if (appPathLower && winPathLower && appPathLower === winPathLower) return true;

  const appExe = appPathLower.split("\\").pop() ?? "";
  const winProc = win.processName.toLowerCase();
  if (appExe && winProc === appExe) return true;

  const appNameLower = app.name.toLowerCase().trim();
  const aliases = PROCESS_ALIASES[appExe] || PROCESS_ALIASES[appNameLower];
  if (aliases && aliases.includes(winProc)) return true;

  const appStem = appExe.replace(/\.(exe|lnk|url)$/i, "");
  const winStem = winProc.replace(/\.exe$/i, "");
  if (appStem.length >= 3 && (appStem === winStem || appStem.includes(winStem) || winStem.includes(appStem))) {
    return true;
  }
  if (appNameLower.length >= 3 && (appNameLower === winStem || appNameLower.includes(winStem))) {
    return true;
  }

  return false;
}

export interface PinnedRow {
  app: PinnedApp;
  wins: RunningWindow[];
  primaryWin: RunningWindow | undefined;
}

export interface WindowGroup {
  key: string;
  primaryWin: RunningWindow;
  wins: RunningWindow[];
}

/** Every running window on its pinned app's slot; the rest grouped by process, in first-seen order. */
export function assignWindows(pinnedApps: PinnedApp[], windows: RunningWindow[]): { pinnedRows: PinnedRow[]; extraGroups: WindowGroup[] } {
  const matchedHwnds = new Set<number>();
  const pinnedRows = pinnedApps.map((app) => {
    const wins = windows.filter((w) => matchesPinnedApp(app, w));
    wins.forEach((w) => matchedHwnds.add(w.hwnd));
    const focusedWin = wins.find((w) => w.isFocused) ?? wins[0];
    return { app, wins, primaryWin: focusedWin };
  });

  const extraGroups: WindowGroup[] = [];
  const groupMap = new Map<string, WindowGroup>();
  for (const w of windows) {
    if (matchedHwnds.has(w.hwnd)) continue;
    const key = w.processName.toLowerCase();
    const existing = groupMap.get(key);
    if (existing) {
      existing.wins.push(w);
      if (w.isFocused) existing.primaryWin = w;
    } else {
      const entry = { key, primaryWin: w, wins: [w] };
      groupMap.set(key, entry);
      extraGroups.push(entry);
    }
  }
  return { pinnedRows, extraGroups };
}

/** Running groups in the order the person dragged them into; never-dragged ones keep their place after. */
export function orderGroups(groups: WindowGroup[], order: string[]): WindowGroup[] {
  return [...groups].sort((a, b) => {
    const ia = order.indexOf(a.key);
    const ib = order.indexOf(b.key);
    if (ia === -1 && ib === -1) return 0;
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

export interface NotificationLite {
  id?: string;
  appName?: string;
}

/** Unread counts per app (normalised name → count); each notification id counted once. */
export function countNotifications(lists: NotificationLite[][]): Record<string, number> {
  const seen = new Set<string>();
  const counts: Record<string, number> = {};
  lists.flat().forEach((n, i) => {
    const id = n.id ?? `idx-${i}`;
    if (seen.has(id)) return;
    seen.add(id);
    const k = normName(n.appName ?? "");
    if (!k || k === "lensui") return;
    counts[k] = (counts[k] ?? 0) + 1;
  });
  return counts;
}

/** Unread notifications for an app, matched loosely by any of its names. */
export function notifBadgeFor(counts: Record<string, number>, ...names: (string | undefined)[]): number {
  const keys = names.map((n) => normName(n ?? "")).filter((k) => k.length >= 3);
  if (keys.length === 0) return 0;
  let total = 0;
  for (const [k, n] of Object.entries(counts)) {
    if (keys.some((x) => x === k || (k.length >= 4 && x.length >= 4 && (x.includes(k) || k.includes(x))))) {
      total += n;
    }
  }
  return total;
}

/** Which one badge an icon shows. One at a time, so two can never overlap. */
export type DockBadge =
  | { kind: "text"; text: string }
  | { kind: "unread"; text: string }
  | { kind: "attention"; text: string }
  | { kind: "windows"; text: string }
  | null;

const cap99 = (n: number) => (n > 99 ? "99+" : String(n));

export function pickBadge(input: { coreBadge?: string; unread: number; urgentCount: number; windows: number }): DockBadge {
  if (input.coreBadge) return { kind: "text", text: input.coreBadge };
  if (input.unread > 0) return { kind: "unread", text: cap99(input.unread) };
  if (input.urgentCount > 1) return { kind: "attention", text: cap99(input.urgentCount) };
  if (input.windows > 1) return { kind: "windows", text: String(input.windows) };
  return null;
}
