// Lesson progress, tips and "used features", kept on this PC only. Stored by the backend in
// %APPDATA%\LensUI\guide\progress.json; falls back to localStorage when the backend isn't there
// (parity harness, older builds).
import { invoke } from "@tauri-apps/api/core";
import { EMPTY_PROGRESS, type GuideProgress, type Lesson } from "./types";

const LS_KEY = "lens.guide.progress";

export function normalizeProgress(raw: unknown): GuideProgress {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<GuideProgress>;
  const strArr = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 500) : []);
  const numMap = (v: unknown) => {
    const out: Record<string, number[]> = {};
    if (v && typeof v === "object") {
      for (const [k, arr] of Object.entries(v as Record<string, unknown>)) {
        if (Array.isArray(arr)) out[k] = [...new Set(arr.filter((n): n is number => Number.isInteger(n) && n > 0 && n < 100))].sort((a, b) => a - b);
      }
    }
    return out;
  };
  const cur: Record<string, number> = {};
  if (r.current && typeof r.current === "object") {
    for (const [k, v] of Object.entries(r.current)) if (Number.isInteger(v) && (v as number) > 0) cur[k] = v as number;
  }
  return {
    enabled: r.enabled === true,
    steps: numMap(r.steps),
    current: cur,
    completed: strArr(r.completed),
    dismissedTips: strArr(r.dismissedTips),
    tipOfTheDay: r.tipOfTheDay === true,
    used: strArr(r.used),
  };
}

export async function loadProgress(): Promise<GuideProgress> {
  try {
    return normalizeProgress(await invoke<GuideProgress>("guide_progress_get"));
  } catch {
    try {
      return normalizeProgress(JSON.parse(localStorage.getItem(LS_KEY) ?? "null"));
    } catch {
      return { ...EMPTY_PROGRESS };
    }
  }
}

export async function saveProgress(p: GuideProgress): Promise<void> {
  const clean = normalizeProgress(p);
  try {
    await invoke("guide_progress_set", { progress: clean });
  } catch {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(clean));
    } catch {
      /* storage unavailable: progress lives for this session only */
    }
  }
}

// ---- pure helpers (tested) ------------------------------------------------------------------

export function markStep(p: GuideProgress, lesson: Lesson, step: number): GuideProgress {
  const done = [...new Set([...(p.steps[lesson.id] ?? []), step])].sort((a, b) => a - b);
  const next = lesson.steps.find((s) => !done.includes(s.n))?.n;
  const completed = next === undefined ? [...new Set([...p.completed, lesson.id])] : p.completed;
  return {
    ...p,
    steps: { ...p.steps, [lesson.id]: done },
    current: next === undefined ? omit(p.current, lesson.id) : { ...p.current, [lesson.id]: next },
    completed,
  };
}

export function skipStep(p: GuideProgress, lesson: Lesson, step: number): GuideProgress {
  // Skipping counts as seen, so the lesson can still finish; the step stays un-ticked.
  const later = lesson.steps.find((s) => s.n > step)?.n;
  if (later === undefined) return { ...p, current: omit(p.current, lesson.id), completed: [...new Set([...p.completed, lesson.id])] };
  return { ...p, current: { ...p.current, [lesson.id]: later } };
}

export function resetLesson(p: GuideProgress, lessonId: string): GuideProgress {
  return { ...p, steps: omit(p.steps, lessonId), current: omit(p.current, lessonId), completed: p.completed.filter((x) => x !== lessonId) };
}

export function lessonPercent(p: GuideProgress, lesson: Lesson): number {
  if (p.completed.includes(lesson.id)) return 100;
  const done = (p.steps[lesson.id] ?? []).filter((n) => lesson.steps.some((s) => s.n === n)).length;
  return Math.round((done / Math.max(1, lesson.steps.length)) * 100);
}

export function currentStep(p: GuideProgress, lesson: Lesson): number {
  return p.current[lesson.id] ?? lesson.steps.find((s) => !(p.steps[lesson.id] ?? []).includes(s.n))?.n ?? 1;
}

function omit<T>(o: Record<string, T>, k: string): Record<string, T> {
  const { [k]: _drop, ...rest } = o;
  return rest;
}
