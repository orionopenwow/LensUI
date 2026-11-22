/**
 * "What was I doing?": groups open windows into activities by app type. Pure and local; the only thing
 * that may ever be sent to an AI is the list of window titles, and only to a provider allowed by
 * `canSendTitles`.
 */
import type { AiPrivacy, AiProviderInfo } from "../../ai/contract.shim";
import { isCloud } from "../../ai/context";

export interface WinLite {
  hwnd: number;
  title: string;
  processName: string;
  isFocused?: boolean;
  isMinimized?: boolean;
}

export type Activity = "code" | "web" | "chat" | "docs" | "media" | "files" | "games" | "other";

export interface WindowGroup {
  activity: Activity;
  label: string;
  windows: WinLite[];
}

const RULES: [Activity, RegExp][] = [
  ["code", /^(code|code - insiders|cursor|devenv|idea64|pycharm64|webstorm64|rider64|clion64|sublime_text|notepad\+\+|zed|windowsterminal|wt|powershell|pwsh|cmd|alacritty|wezterm-gui)\.exe$/i],
  ["web", /^(chrome|msedge|firefox|brave|opera|vivaldi|arc|zen)\.exe$/i],
  ["chat", /^(discord|slack|teams|ms-teams|telegram|whatsapp|signal|zoom|outlook|thunderbird|olk)\.exe$/i],
  ["docs", /^(winword|excel|powerpnt|onenote|notion|obsidian|acrord32|acrobat|sumatrapdf|notepad|wordpad|logseq)\.exe$/i],
  ["media", /^(spotify|vlc|mpc-hc64|wmplayer|music\.ui|photoshop|illustrator|afterfx|premiere|resolve|blender|obs64|audacity|figma|krita|gimp-\d.*)\.exe$/i],
  ["files", /^(explorer|files|totalcmd64|directory opus|dopus)\.exe$/i],
  ["games", /^(steam|steamwebhelper|epicgameslauncher|battle\.net|riotclientservices|galaxyclient)\.exe$/i],
];

const LABEL: Record<Activity, string> = {
  code: "Coding",
  web: "Browsing",
  chat: "Talking",
  docs: "Documents",
  media: "Media & creative",
  files: "Files",
  games: "Games",
  other: "Other",
};

export function activityOf(processName: string): Activity {
  for (const [a, re] of RULES) if (re.test(processName)) return a;
  return "other";
}

/** Groups windows; the group holding the focused window comes first, then by size. Empty titles are skipped. */
export function groupWindows(wins: WinLite[]): WindowGroup[] {
  const map = new Map<Activity, WinLite[]>();
  for (const w of wins) {
    if (!w.title.trim()) continue;
    const a = activityOf(w.processName);
    map.set(a, [...(map.get(a) ?? []), w]);
  }
  return [...map.entries()]
    .map(([activity, windows]) => ({ activity, label: LABEL[activity], windows }))
    .sort((x, y) => {
      const fx = x.windows.some((w) => w.isFocused) ? 1 : 0;
      const fy = y.windows.some((w) => w.isFocused) ? 1 : 0;
      if (fx !== fy) return fy - fx;
      if (x.activity === "other" !== (y.activity === "other")) return x.activity === "other" ? 1 : -1;
      return y.windows.length - x.windows.length;
    });
}

/** Window titles can contain private things (email subjects, document names). Cloud only when allowed. */
export function canSendTitles(provider: AiProviderInfo | undefined | null, privacy: AiPrivacy): boolean {
  if (!provider || provider.kind === "off" || !provider.available) return false;
  if (!isCloud(provider)) return true;
  return privacy === "allow_cloud";
}

export function summaryPrompt(groups: WindowGroup[]): { prompt: string; page_text: string } {
  const lines = groups.map((g) => `${g.label}: ${g.windows.map((w) => w.title.slice(0, 90)).join(" | ")}`);
  return {
    prompt:
      "From these open windows, say in 2–4 short bullets what I was working on, and suggest the one thing to pick up next. Don't repeat the titles verbatim.",
    page_text: lines.join("\n"),
  };
}
