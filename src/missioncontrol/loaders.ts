// The data each page shares, loaded through `useLoad` keys so pages reuse one answer per session.
import { call, gh, R } from "./api";
import type { BranchInfo, CrashReport, DocsBundle, GitInfo, Issue, MergedPr, Pr, CheckRun } from "./model/types";

export interface Status {
  repoRoot: string | null;
  dataDir: string;
  tokenSource: "credentialManager" | "ghCli" | "none";
  offline: boolean;
  rate: { remaining: number; limit: number; reset: number } | null;
  version: string;
  hotkey: string | null;
  hotkeyChoices: string[];
  knownFlakes: string[];
}

export interface LocalSnapshot {
  version: string;
  pid: number;
  startedMs: number;
  safeMode: boolean;
  safeReason: string;
  windows: string[];
  config: string;
  flags: { path: string; value: unknown; default: unknown }[];
  killSwitches: { id: string; label: string; killed: boolean }[];
  changes: { id: string; label: string; scope: string; writes: string[] }[];
  notChanged: { what: string; why: string }[];
  crashReports: CrashReport[];
  lensLog: string[];
  logPath: string;
  crashDir: string;
}

export const L = {
  status: () => call<Status>("mc_status"),
  prs: () => call<{ prs: Pr[]; knownFlakes: string[]; offline: boolean }>("mc_prs"),
  merged: () => call<MergedPr[]>("mc_merged_prs", { limit: 20 }),
  docs: () => call<DocsBundle>("mc_docs"),
  git: () => call<GitInfo>("mc_git"),
  branches: () => call<BranchInfo[]>("mc_branches"),
  local: () => call<LocalSnapshot>("mc_local"),
  mainChecks: () => gh<{ check_runs: CheckRun[] }>(`${R}/commits/main/check-runs?per_page=100`),
  pages: () => gh<{ status?: string; created_at?: string; commit?: string }>(`${R}/pages/builds/latest`),
  releases: () => gh<{ tag_name: string; name: string; published_at: string; prerelease: boolean; draft: boolean; html_url: string; assets: { name: string }[] }[]>(`${R}/releases?per_page=10`),
  repo: () => gh<{ stargazers_count: number; open_issues_count: number; forks_count: number }>(R),
  /** Issues labelled tester-report or bug (labels= is AND on GitHub, so one call each). */
  issues: async () => {
    const [a, b] = await Promise.all([gh<Issue[]>(`${R}/issues?state=all&labels=tester-report&per_page=100`), gh<Issue[]>(`${R}/issues?state=all&labels=bug&per_page=100`)]);
    const seen = new Set<number>();
    const all = [...(Array.isArray(a.data) ? a.data : []), ...(Array.isArray(b.data) ? b.data : [])].filter((i) => (seen.has(i.number) ? false : (seen.add(i.number), true)));
    return { issues: all, offline: a.offline || b.offline, stale: a.stale || b.stale, fetchedMs: Math.min(a.fetchedMs, b.fetchedMs) };
  },
};
