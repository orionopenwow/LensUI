import { invoke } from "@tauri-apps/api/core";
import type { LensConfig, RunningWindow, SavedSession } from "../types/lens";

/**
 * Session restore: remember which apps were open (and how they were tiled), then bring that
 * workspace back with one click.
 *
 * `layout` is an optional extra on SavedSession. It round-trips through the config only once the
 * Rust `SavedSession` struct has the matching `#[serde(default)] pub layout: Option<String>` field;
 * until then sessions restore with the default layout.
 */
export interface SavedSessionEx extends SavedSession {
  /** A `tile_windows_cmd` layout id, or "none" to leave windows where they open. */
  layout?: string | null;
}

export const DEFAULT_SESSION_LAYOUT = "focus-stack";

export const SESSION_LAYOUTS: { id: string; label: string }[] = [
  { id: "focus-stack", label: "Master-Stack" },
  { id: "split", label: "50/50 Split" },
  { id: "thirds", label: "Columns" },
  { id: "grid", label: "2×2 Grid" },
  { id: "smart-group", label: "Smart Group" },
  { id: "none", label: "Don't tile" },
];

/** Hosts and shell processes that are not apps a user can relaunch by path. */
const NOT_RELAUNCHABLE = [
  "lens-ui.exe",
  "applicationframehost.exe",
  "systemsettings.exe",
  "textinputhost.exe",
  "shellexperiencehost.exe",
  "startmenuexperiencehost.exe",
  "searchhost.exe",
  "lockapp.exe",
];

const lower = (s: string) => s.trim().toLowerCase();
const fileName = (path: string) => path.split(/[\\/]/).pop() ?? path;

export function sessionLayout(session: SavedSession): string {
  const layout = (session as SavedSessionEx).layout;
  return layout && SESSION_LAYOUTS.some((l) => l.id === layout) ? layout : DEFAULT_SESSION_LAYOUT;
}

/** Pure: the unique, relaunchable exe paths among `windows`, plus names of the ones left out. */
export function appsFromWindows(windows: RunningWindow[]): { apps: string[]; skipped: string[] } {
  const apps: string[] = [];
  const skipped: string[] = [];
  const seen = new Set<string>();
  for (const w of windows) {
    const path = w.exePath?.trim();
    if (!path) continue;
    const key = lower(path);
    if (seen.has(key)) continue;
    seen.add(key);
    if (NOT_RELAUNCHABLE.includes(lower(fileName(path)))) {
      // Store apps (Calculator, Settings, ...) run inside a shared host and cannot be started by path.
      if (lower(fileName(path)) !== "lens-ui.exe") skipped.push(w.title || w.processName);
      continue;
    }
    apps.push(path);
  }
  return { apps, skipped };
}

/** Reads the apps that are open right now. */
export async function captureSessionApps(): Promise<{ apps: string[]; skipped: string[] }> {
  return appsFromWindows(await invoke<RunningWindow[]>("get_running_windows"));
}

/** Pure: config with `sessionId` updated to hold `apps` / `layout`. */
export function withCapturedSession(
  config: LensConfig,
  sessionId: string,
  apps: string[],
  layout: string
): LensConfig {
  return {
    ...config,
    sessions: config.sessions.map((s) =>
      s.id === sessionId ? ({ ...s, apps, layout } as SavedSessionEx) : s
    ),
  };
}

/** Pure: config with a new session appended. */
export function withNewSession(
  config: LensConfig,
  name: string,
  color: string,
  apps: string[],
  layout: string
): LensConfig {
  const session: SavedSessionEx = {
    id: `session-${Date.now()}`,
    name: name.trim().slice(0, 40) || "Session",
    color,
    apps,
    layout,
  };
  return { ...config, sessions: [...config.sessions, session] };
}

/** Pure: which of the session's apps are not running yet. */
export function missingApps(session: SavedSession, windows: RunningWindow[]): string[] {
  const running = new Set(windows.map((w) => lower(w.exePath ?? "")));
  return session.apps.filter((path) => !running.has(lower(path)));
}

export interface RestoreResult {
  alreadyOpen: number;
  launched: string[];
  failed: string[];
  /** Apps that were launched but had not shown a window when the wait ran out. */
  stillOpening: string[];
  /** Message from the tiler, or null when tiling was skipped or failed. */
  tiled: string | null;
}

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/**
 * Launches the session's apps that are not open, waits (up to `waitMs`) for their windows, then
 * tiles with the session's layout. Tiling arranges the visible app windows, focused one first —
 * the same behaviour as the tiling buttons.
 */
export async function restoreSession(
  session: SavedSession,
  onProgress?: (message: string) => void,
  waitMs = 10000
): Promise<RestoreResult> {
  const before = await invoke<RunningWindow[]>("get_running_windows");
  const toLaunch = missingApps(session, before);
  const result: RestoreResult = {
    alreadyOpen: session.apps.length - toLaunch.length,
    launched: [],
    failed: [],
    stillOpening: [],
    tiled: null,
  };

  for (const path of toLaunch) {
    onProgress?.(`Opening ${fileName(path)}…`);
    try {
      await invoke("launch_app_cmd", { path });
      result.launched.push(path);
    } catch {
      result.failed.push(path);
    }
  }

  if (result.launched.length > 0) {
    onProgress?.("Waiting for windows…");
    const deadline = Date.now() + waitMs;
    let pending = result.launched;
    while (pending.length > 0 && Date.now() < deadline) {
      await sleep(500);
      const now = await invoke<RunningWindow[]>("get_running_windows").catch(() => before);
      pending = missingApps({ ...session, apps: pending }, now);
    }
    result.stillOpening = pending;
    // Give freshly created windows a moment to finish their first layout before moving them.
    await sleep(350);
  }

  const layout = sessionLayout(session);
  if (layout !== "none" && session.apps.length > 0) {
    onProgress?.("Arranging windows…");
    try {
      result.tiled = await invoke<string>("tile_windows_cmd", { layout });
    } catch {
      result.tiled = null;
    }
  }
  return result;
}

/** One plain sentence describing what a restore did. */
export function describeRestore(session: SavedSession, r: RestoreResult): string {
  const names = (paths: string[]) => paths.map((p) => fileName(p).replace(/\.exe$/i, "")).join(", ");
  const parts: string[] = [];
  if (r.launched.length) parts.push(`opened ${r.launched.length}`);
  if (r.alreadyOpen) parts.push(`${r.alreadyOpen} already open`);
  let text = `${session.name}: ${parts.join(", ") || "nothing to open"}.`;
  if (r.failed.length) text += ` Couldn't open ${names(r.failed)}.`;
  if (r.stillOpening.length) text += ` Still starting: ${names(r.stillOpening)}.`;
  return text;
}
