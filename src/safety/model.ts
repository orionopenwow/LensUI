// Settings › About & Testing › Safety: what Lens touches and the ways back to plain Windows, on
// one card. Pure, so the wording and the counts are unit-tested (src/__tests__/safetyCard.test.ts).
// Live facts come from the code that enforces them: the change registry (`changes_manifest_cmd`),
// the failsafe (`failsafe_status`) and `safety_facts` (protected keys and apps).
import type { ChangeInfo, FailsafeReport, SafetyFacts } from "../types/generated";

/** Shown until `safety_facts` answers, and in previews. Same keys as `input::PROTECTED_KEYS`. */
export const FALLBACK_FACTS: SafetyFacts = {
  protectedKeys: ["Ctrl+Alt+Del", "Ctrl+Shift+Esc", "Alt+Esc", "Alt+F4", "Win+L", "Win+D", "Win+Tab"],
  protectedApps: 0,
  signinMaxWaitSecs: 120,
};

export interface ChangeGroup {
  id: "persistent" | "session" | "lensData";
  title: string;
  /** What this kind of change means for the person. */
  note: string;
  labels: string[];
}

/** The change registry in three plain groups, in the registry's own order. */
export function changeGroups(manifest: ChangeInfo[]): ChangeGroup[] {
  const of = (scope: ChangeInfo["scope"]) => manifest.filter((c) => c.scope === scope).map((c) => c.label);
  const groups: ChangeGroup[] = [
    { id: "persistent", title: "Stay after Lens quits", note: "Windows settings and files. Remove all puts each one back.", labels: of("persistent") },
    { id: "session", title: "Only while Lens runs", note: "Gone when Lens quits, and put back by Remove all too.", labels: of("session") },
    { id: "lensData", title: "Inside Lens's own folder", note: "Nothing in Windows changes.", labels: of("lensData") },
  ];
  return groups.filter((g) => g.labels.length > 0);
}

/** "33 kinds of change, each with its own undo". */
export function changesLine(manifest: ChangeInfo[]): string {
  const n = manifest.length;
  if (n === 0) return "The list of changes couldn't be read.";
  return `${n} ${n === 1 ? "kind" : "kinds"} of change, each with its own undo.`;
}

/** What Lens never touches, with the count when the backend gave one. */
export function neverTouchedLine(facts: SafetyFacts): string {
  const games = facts.protectedApps > 0 ? `${facts.protectedApps} anti-cheat services and protected games` : "Anti-cheat services and protected games";
  return `${games}, fullscreen apps, and Windows' machine-wide settings (HKLM).`;
}

export interface SafeModeLine {
  on: boolean;
  /** What follows the word "On." or "Off." on the card. */
  text: string;
}

/** Safe Mode now, plus anything the failsafe is holding off. */
export function safeModeLine(report: FailsafeReport | null): SafeModeLine {
  if (!report) return { on: false, text: "It starts Lens with every optional feature and every low-level hook off. Your settings stay as they are." };
  const { status } = report;
  if (status.safeMode) {
    return { on: true, text: `Optional features are off until you restart Lens; your settings are unchanged.${status.safeReason ? ` ${status.safeReason}` : ""}` };
  }
  const paused = status.tripped.length;
  const held = report.switches.filter((s) => s.off).length;
  const parts = [paused > 0 ? `${paused} paused after repeated failures` : "", held > 0 ? `${held} held off by features.json` : ""].filter(Boolean);
  return {
    on: false,
    text: parts.length
      ? `Lens is running normally, with ${parts.join(" and ")} (details below).`
      : "Two failed starts in a row bring the Windows taskbar back and offer it; you can also ask for it below.",
  };
}

/** The sign-in rule, in one sentence. */
export function signInLine(facts: SafetyFacts): string {
  const mins = Math.max(1, Math.round(facts.signinMaxWaitSecs / 60));
  return `Hold Shift while you sign in and Lens stays out for that sign-in. Otherwise Lens waits for the Windows desktop to be ready (up to ${mins} ${mins === 1 ? "minute" : "minutes"}) before it shows anything or touches the taskbar.`;
}

export interface RemoveAllPreview {
  /** "Remove all will check and undo 33 kinds of change." */
  line: string;
  /** Every kind of change it walks, in the order it runs. */
  labels: string[];
  /** What it never touches, so nobody has to wonder. */
  keeps: string;
}

/** What "Remove all Lens changes" is about to do, shown before the person confirms. It is the
 *  same list the backend walks (`changes::CHANGES`), so the preview can't promise more or less. */
export function removeAllPreview(manifest: ChangeInfo[]): RemoveAllPreview | null {
  if (manifest.length === 0) return null;
  const n = manifest.length;
  return {
    line: `Remove all will check and undo ${n} ${n === 1 ? "kind" : "kinds"} of change, and report each one.`,
    labels: manifest.map((c) => c.label),
    keeps: "Not changed: your files, the apps you installed and themes you exported.",
  };
}

/** Where the two buttons go (Settings deep links, `openSettingsAt`). */
export const SAFETY_LINKS = { report: "about#report", removeAll: "about#backup", safetyNet: "about#safety" } as const;
