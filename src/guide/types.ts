// Lens Guide: shapes of the generated knowledge index (src/guide/index.json, built by
// tools/guide/build-index.mjs) and of lesson progress.

export type GuideKind =
  | "setting"
  | "card"
  | "tab"
  | "pack"
  | "dock-style"
  | "scene"
  | "command"
  | "hotkey"
  | "doc"
  | "lesson";

/** Where "Show me" goes. Every target comes from the index, never from a model. */
export interface GuideTarget {
  surface: "settings" | "command" | "mini" | "dock" | "topbar" | "palette" | "browser" | "guide" | "doc" | "lesson" | "wallpaper";
  tab?: string;
  card?: string;
  label?: string;
  /** Collapsible section to open first (`data-cc-section` id). */
  section?: string;
  /** Stable `data-guide-id` anchor. */
  anchor?: string;
  doc?: string;
  heading?: string;
  lesson?: string;
}

export interface GuideEntry {
  id: string;
  kind: GuideKind;
  title: string;
  text: string;
  path: string[];
  target?: GuideTarget;
  examples?: string[];
  source: string;
}

export interface LessonStep {
  n: number;
  title: string;
  text: string;
  show?: string;
  target?: GuideTarget;
  anchor?: string;
  check?: string;
  success?: string;
  hint?: string;
}

export interface Lesson {
  id: string;
  title: string;
  summary: string;
  minutes: number;
  order: number;
  requires: string | null;
  requiresNote: string | null;
  steps: LessonStep[];
  source: string;
}

export interface GuideIndex {
  version: number;
  tabs: { id: string; label: string }[];
  entries: GuideEntry[];
  lessons: Lesson[];
}

/** Persisted in %APPDATA%\LensUI\guide\progress.json (Rust: guide::GuideProgress). */
export interface GuideProgress {
  /** Lens Guide is off until the user turns it on. */
  enabled: boolean;
  /** lesson id → completed step numbers */
  steps: Record<string, number[]>;
  /** lesson id → step number the user is on */
  current: Record<string, number>;
  completed: string[];
  dismissedTips: string[];
  tipOfTheDay: boolean;
  /** Feature ids the user has used (for "Did you know?"). Local only. */
  used: string[];
}

export const EMPTY_PROGRESS: GuideProgress = {
  enabled: false,
  steps: {},
  current: {},
  completed: [],
  dismissedTips: [],
  tipOfTheDay: false,
  used: [],
};

/** Runtime state lesson checks are evaluated against. */
export interface GuideState {
  config: unknown;
  ui: { surface?: string; tab?: string; focusedApp?: string };
  events: Set<string>;
}
