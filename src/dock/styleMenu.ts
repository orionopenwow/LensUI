// The Dock's "Don't style this app" row (an app's right-click menu). It writes the same per-app
// window rule as Settings › Windows › Per-app window rules: `exclude`, "Lens leaves this app's
// windows completely alone" (no window buttons, border, opacity or dimming; win_rules.rs). The row
// only shows where Lens styles windows at all, for an app with a window open, and never for the
// protected apps Lens doesn't touch anyway. Its other face, "Style this app again", undoes it.
// Pure; tested in settingsQuickWins.test.ts.
import type { WindowRule } from "../types/generated";
import type { LensConfig } from "../types/lens";

/** "C:\\…\\Code.exe" → "code", the form `win_rules::normalize_process_name` compares. */
export function processKey(name: string): string {
  const file = (name.trim().toLowerCase().split(/[\\/]/).pop() ?? "").trim();
  return file.endsWith(".exe") ? file.slice(0, -4) : file;
}

/** Lens styles other apps' windows at all: its window buttons or its window border are on. */
export function stylingOn(config: Pick<LensConfig, "windowControls">): boolean {
  const wc = config.windowControls;
  return !!wc && (wc.enabled || wc.frameBorderEnabled === true);
}

export function leftAlone(rules: WindowRule[], process: string): boolean {
  const key = processKey(process);
  return !!key && rules.some((r) => r.exclude && processKey(r.match) === key);
}

/** A rule that only says "leave alone" (nothing else in it worth keeping). */
const onlyExcludes = (r: WindowRule) =>
  r.opacity == null && r.inactiveOpacity == null && (r.frame || "default") === "default" && (r.corners || "default") === "default";

/** The rule list with one app left alone, or styled again. Other rules are untouched. */
export function withLeftAlone(rules: WindowRule[], process: string, alone: boolean): WindowRule[] {
  const key = processKey(process);
  if (!key) return rules;
  const mine = (r: WindowRule) => processKey(r.match) === key;
  if (alone) {
    if (rules.some(mine)) return rules.map((r) => (mine(r) ? { ...r, exclude: true } : r));
    return [...rules, { match: key, opacity: null, frame: "default", corners: "default", exclude: true, inactiveOpacity: null }];
  }
  return rules.filter((r) => !(mine(r) && onlyExcludes(r))).map((r) => (mine(r) ? { ...r, exclude: false } : r));
}

export interface StyleRow {
  label: "Don't style this app" | "Style this app again";
  /** What the row turns the app into. */
  alone: boolean;
}

/** The row for an app's menu, or null where it doesn't belong. `rules` / `isProtected` are null
 *  until Lens Core has answered (the row waits rather than guess). */
export function styleRow(
  config: Pick<LensConfig, "windowControls">,
  process: string | undefined,
  rules: WindowRule[] | null,
  isProtected: boolean | null,
): StyleRow | null {
  if (!process || !processKey(process) || rules === null || isProtected !== false) return null;
  const alone = leftAlone(rules, process);
  // Already left alone: always offer the way back, even with styling off since.
  if (alone) return { label: "Style this app again", alone: false };
  return stylingOn(config) ? { label: "Don't style this app", alone: true } : null;
}
