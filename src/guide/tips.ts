// "Did you know?" and context suggestions. Computed from the local config only; nothing here is
// ever sent anywhere.
import type { LensConfig } from "../types/lens";
import type { GuideIndex, GuideProgress } from "./types";

export interface Tip {
  id: string;
  title: string;
  text: string;
  /** Index entry id the tip's "Show me" goes to. */
  entry: string;
}

interface TipRule {
  id: string;
  title: string;
  text: string;
  entry: string;
  /** True when the feature is NOT in use yet. */
  unused: (c: Partial<LensConfig> & Record<string, unknown>) => boolean;
}

const get = (o: unknown, path: string): unknown =>
  path.split(".").reduce<unknown>((cur, k) => (cur && typeof cur === "object" ? (cur as Record<string, unknown>)[k] : undefined), o);

const RULES: TipRule[] = [
  { id: "alt-drag", title: "Move windows from anywhere", text: "Hold Alt and drag inside any window to move it; Alt+right-drag resizes.", entry: "card.system.altdragcard", unused: (c) => get(c, "altDrag.enabled") !== true },
  { id: "hot-corners", title: "Hot corners", text: "Rest the pointer in a screen corner to open Overview or show the desktop.", entry: "card.system.hotcornerscard", unused: (c) => get(c, "hotCorners.enabled") !== true },
  { id: "dock-style", title: "Six dock styles", text: "Slim, Taskbar, Studio, Minimal and Split keep the same feel as Floating.", entry: "setting.dock.docktab.dock-style", unused: (c) => !get(c, "dock.style") || get(c, "dock.style") === "floating" },
  { id: "command", title: "One box for everything", text: "Lens Command asks, does, and keeps your Shelf and clipboard in one place.", entry: "card.ai.commandcard", unused: (c) => get(c, "command.enabled") !== true },
  { id: "workspaces", title: "Workspaces", text: "Keep groups of windows apart and switch between them from Overview.", entry: "card.sessions.workspacescard", unused: (c) => get(c, "workspaces.enabled") !== true },
  { id: "theme-schedule", title: "Day and night themes", text: "Switch to a light theme in the day and a dark one at night, automatically.", entry: "card.theme.themeschedulecard", unused: (c) => !get(c, "themeSchedule.enabled") },
  { id: "summon", title: "Summon an app with one key", text: "Show, hide or launch an app with a single hotkey, like a drop-down terminal.", entry: "card.system.appsummoncard", unused: (c) => !((get(c, "appSummon.bindings") as unknown[] | undefined)?.length) },
  { id: "ai-local", title: "AI that stays on this PC", text: "Use a local model through Ollama or LM Studio; nothing leaves your PC.", entry: "card.ai.aicard", unused: (c) => get(c, "ai.enabled") !== true },
];

/** Up to `limit` tips for features not in use yet, skipping dismissed ones and unknown entries. */
export function didYouKnow(config: unknown, progress: GuideProgress, index: GuideIndex, limit = 2): Tip[] {
  const ids = new Set(index.entries.map((e) => e.id));
  const c = (config ?? {}) as Partial<LensConfig> & Record<string, unknown>;
  return RULES.filter((r) => ids.has(r.entry) && !progress.dismissedTips.includes(r.id) && r.unused(c))
    .slice(0, limit)
    .map(({ unused: _u, ...t }) => t);
}

/** Tip of the day: one tip, stable for the whole day. Only when the user turned it on. */
export function tipOfTheDay(config: unknown, progress: GuideProgress, index: GuideIndex, day = new Date()): Tip | null {
  if (!progress.tipOfTheDay) return null;
  const all = didYouKnow(config, progress, index, 99);
  if (!all.length) return null;
  const n = Math.floor(day.getTime() / 86_400_000);
  return all[n % all.length];
}

/** Suggested questions for where the user is. */
export function suggestedQuestions(ctx: { surface?: string; tab?: string; app?: string }): string[] {
  const byTab: Record<string, string[]> = {
    theme: ["How do I change my mouse pointer?", "Can themes switch at night?", "How do I save my theme?"],
    dock: ["How do I make the dock thinner?", "Can the dock look like the Windows 11 taskbar?", "How do I auto-hide the dock?"],
    sessions: ["How do I put sand on my desktop?", "What is idle mode?", "How do workspaces work?"],
    ai: ["How do I keep AI private?", "How do I use a local model with Ollama?", "How do I connect the browser extension?"],
    system: ["How do I move windows with Alt+drag?", "How do I set a hot corner?", "How do I undo all Lens changes?"],
  };
  if (ctx.surface === "command" || ctx.surface === "mini") return ["What can I type in Lens Command?", "How do I add things to the Shelf?", "What is Lens Mini?"];
  if (ctx.surface === "dock") return byTab.dock;
  if (ctx.tab && byTab[ctx.tab]) return byTab[ctx.tab];
  return ["How do I change the dock style?", "How do I undo all Lens changes?", "What can I say to Lens?"];
}
