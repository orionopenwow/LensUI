// Thin, failure-tolerant wrappers over the Tester Hub commands (src-tauri/src/commands/tester.rs).
// Every call degrades gracefully, so the hub still renders on builds without the backend.
import { invoke } from "@tauri-apps/api/core";
import type { EnvSummary } from "./model";
import { BUILD_INFO } from "./buildInfo";
import type { BuildInfo } from "./model";

export const buildInfo = BUILD_INFO as BuildInfo;

export interface LogLine {
  seq: number;
  atMs: number;
  level: "error" | "warn" | "info" | "debug" | "mark";
  area: string;
  message: string;
}

export interface ExportPlan {
  folder: string;
  files: string[];
  skipped: string[];
}

export interface ExportResult {
  path: string;
  files: string[];
  skipped: string[];
}

export const buildKey = (info: BuildInfo = buildInfo) => `${info.version}-${(info.sha || "dev").slice(0, 12)}`;

export async function loadResults(build: string): Promise<string | null> {
  try {
    return (await invoke<string | null>("tester_results_get", { build })) ?? null;
  } catch {
    try {
      return localStorage.getItem(`lens.tester.results.${build}`);
    } catch {
      return null;
    }
  }
}

export async function saveResults(build: string, json: string): Promise<void> {
  try {
    await invoke("tester_results_set", { build, json });
  } catch {
    try {
      localStorage.setItem(`lens.tester.results.${build}`, json);
    } catch {
      /* storage unavailable: results live for this session only */
    }
  }
}

export async function getLog(after = 0, limit = 500): Promise<LogLine[]> {
  try {
    return (await invoke<LogLine[]>("tester_log_get", { after, limit })) ?? [];
  } catch {
    return [];
  }
}

export async function markMoment(note: string): Promise<LogLine | null> {
  try {
    return await invoke<LogLine>("tester_log_mark", { note });
  } catch {
    return null;
  }
}

export async function getEnvironment(): Promise<EnvSummary | null> {
  try {
    return (await invoke<EnvSummary>("tester_environment")) ?? null;
  } catch {
    return null;
  }
}

export async function exportPlan(screenshots: string[]): Promise<ExportPlan | null> {
  try {
    return await invoke<ExportPlan>("tester_export_plan", { screenshots });
  } catch {
    return null;
  }
}

export function exportReport(req: { reportMd: string; resultsJson: string; screenshots: string[]; includeConfig: boolean }) {
  return invoke<ExportResult>("tester_export_report", { req });
}

export const revealReport = (path: string) => invoke("tester_reveal_report", { path }).catch(() => {});

export const openIssue = (title: string, body: string) => invoke("tester_open_issue", { title, body });

export const runSelfTest = () => invoke<{ ok: boolean; text: string }>("run_self_test_cmd");
