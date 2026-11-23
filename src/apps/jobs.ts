// Job state for installs, upgrades, uninstalls and release downloads, driven by
// `lens://apps/progress` events. Pure reducer so the UI and tests share it.
import type { ProgressEvent, Stage } from "./types";

export interface JobState {
  jobId: string;
  appId: string;
  op: string;
  stage: Stage;
  /** Overall 0–100 across stages, never going backwards. */
  overall: number;
  message: string;
  finished: boolean;
  ok: boolean;
}

/** Each stage's share of the overall bar. */
const BANDS: Record<Stage, [number, number]> = {
  resolving: [0, 5],
  downloading: [5, 70],
  verifying: [70, 75],
  installing: [75, 99],
  done: [100, 100],
  failed: [0, 0],
};

export function overallPct(stage: Stage, pct: number | null): number {
  const [a, b] = BANDS[stage];
  if (stage === "done") return 100;
  const p = pct == null ? 0 : Math.max(0, Math.min(100, pct));
  return Math.round(a + ((b - a) * p) / 100);
}

export type Jobs = Record<string, JobState>;

/** Applies one progress event. Keyed by app id: one job per app at a time. */
export function reduceJobs(jobs: Jobs, ev: ProgressEvent): Jobs {
  const prev = jobs[ev.appId];
  const sameJob = prev && prev.jobId === ev.jobId;
  const finished = ev.stage === "done" || ev.stage === "failed";
  const overall = ev.stage === "failed" ? (sameJob ? prev.overall : 0) : Math.max(sameJob ? prev.overall : 0, overallPct(ev.stage, ev.pct));
  return {
    ...jobs,
    [ev.appId]: {
      jobId: ev.jobId,
      appId: ev.appId,
      op: ev.op,
      stage: ev.stage,
      overall,
      message: ev.message,
      finished,
      ok: ev.stage === "done",
    },
  };
}

export function clearJob(jobs: Jobs, appId: string): Jobs {
  const { [appId]: _drop, ...rest } = jobs;
  return rest;
}

export const STAGE_LABEL: Record<Stage, string> = {
  resolving: "Finding package",
  downloading: "Downloading",
  verifying: "Verifying",
  installing: "Installing",
  done: "Done",
  failed: "Didn't finish",
};

/** The stage list shown as steps in the install sheet. */
export const STAGES: Stage[] = ["resolving", "downloading", "verifying", "installing", "done"];
