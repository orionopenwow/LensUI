// Settings › Windows › Apps and window buttons: every app Lens has seen, with a switch for its
// window buttons and "leave alone", and a locked Protected badge for the apps Lens never touches
// (anti-cheat games, Windows shell hosts, Lens itself). Pure; tested in windowApps.test.ts.
//
// Where the switches are stored:
//   window buttons → `windowControls.excludedProcesses` in the main config (the caption engine
//                    reads it, src-tauri/src/caption_rules.rs)
//   leave alone    → a per-app window rule with `exclude` (src-tauri/src/win_rules.rs); shown here,
//                    changed in Per-app window rules just below
//   protected      → nowhere: it is built in (`win_rules::is_protected_process`) and can't be changed
import type { WindowRule } from "../types/generated";

/** The form apps are compared in, the same as `win_rules::normalize_process_name`. */
export function appKey(name: string): string {
  const file = (name.trim().toLowerCase().split(/[\\/]/).pop() ?? "").trim();
  return file.endsWith(".exe") ? file.slice(0, -4) : file;
}

export interface SeenApp {
  processName: string;
  exePath?: string;
}

export interface AppRow {
  key: string;
  /** File name as Windows shows it ("Notepad.exe"). */
  name: string;
  running: boolean;
  /** Built in: Lens never touches it. No switches. */
  protected: boolean;
  /** Lens draws its window buttons over this app. */
  buttons: boolean;
  /** A rule says "leave this app alone": no buttons, border, opacity or dimming. */
  leftAlone: boolean;
}

/** Everything to ask `protected_processes_cmd` about: running apps (by full path, so a game is
 *  recognised by its folder too) and the names already on the exclusion list. */
export function protectionQueries(running: SeenApp[], excluded: string[]): { key: string; query: string }[] {
  const out = new Map<string, string>();
  for (const w of running) {
    const key = appKey(w.processName || w.exePath || "");
    if (key && !out.has(key)) out.set(key, w.exePath || w.processName);
  }
  for (const e of excluded) {
    const key = appKey(e);
    if (key && !out.has(key)) out.set(key, e);
  }
  return [...out].map(([key, query]) => ({ key, query }));
}

export function buildRows(running: SeenApp[], excluded: string[], rules: WindowRule[], protectedKeys: ReadonlySet<string>): AppRow[] {
  const excludedKeys = new Set(excluded.map(appKey).filter(Boolean));
  const alone = new Set(rules.filter((r) => r.exclude).map((r) => appKey(r.match)));
  const rows = new Map<string, AppRow>();
  const add = (key: string, name: string, isRunning: boolean) => {
    if (!key) return;
    const prev = rows.get(key);
    if (prev) {
      prev.running = prev.running || isRunning;
      return;
    }
    const prot = protectedKeys.has(key);
    const leftAlone = !prot && alone.has(key);
    rows.set(key, { key, name, running: isRunning, protected: prot, leftAlone, buttons: !prot && !leftAlone && !excludedKeys.has(key) });
  };
  for (const w of running) add(appKey(w.processName), w.processName.split(/[\\/]/).pop() ?? w.processName, true);
  for (const e of excluded) add(appKey(e), e.split(/[\\/]/).pop() ?? e, false);
  for (const r of rules) if (r.exclude) add(appKey(r.match), `${appKey(r.match)}.exe`, false);
  const rank = (r: AppRow) => (r.protected ? 2 : r.running ? 0 : 1);
  return [...rows.values()].sort((a, b) => rank(a) - rank(b) || a.key.localeCompare(b.key));
}

/** The exclusion list with one app's window buttons switched on or off. Other entries keep their
 *  spelling and order; switching on removes every spelling of the app. */
export function withButtons(excluded: string[], app: string, on: boolean): string[] {
  const key = appKey(app);
  if (!key) return excluded;
  const has = excluded.some((e) => appKey(e) === key);
  if (on) return has ? excluded.filter((e) => appKey(e) !== key) : excluded;
  return has ? excluded : [...excluded, `${key}.exe`];
}

/** One line under the card title: how many apps, how many protected. */
export function summaryLine(rows: AppRow[]): string {
  const prot = rows.filter((r) => r.protected).length;
  const off = rows.filter((r) => !r.protected && !r.buttons).length;
  const parts = [`${rows.length} ${rows.length === 1 ? "app" : "apps"}`];
  if (off) parts.push(`${off} without Lens buttons`);
  if (prot) parts.push(`${prot} protected`);
  return parts.join(" · ");
}
