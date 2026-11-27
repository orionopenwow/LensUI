// Shapes of what Mission Control's Rust commands return (src-tauri/src/mission/commands.rs).
// Kept loose on purpose: GitHub objects pass through mostly as they come.

export type Verdict = "READY" | "WAIT" | "BLOCKED";

export interface CheckRun {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  runId?: number | null;
}

export interface FailingCheck {
  id: number;
  runId?: number | null;
  name: string;
  scenarios: string[];
  knownFlake: boolean;
  likelyFlake: boolean;
}

export interface Classification {
  number: number;
  verdict: Verdict;
  running: number;
  e2eOk: number;
  failing: FailingCheck[];
  reasons: string[];
}

export interface ListItem {
  section: string;
  text: string;
  done: boolean;
}

export interface Pr {
  number: number;
  title: string;
  author?: string;
  headRef: string;
  baseRef: string;
  headSha: string;
  draft: boolean;
  mergeableState: string;
  additions?: number;
  deletions?: number;
  changedFiles?: number;
  commits?: number;
  updatedAt?: string;
  url?: string;
  labels?: string[];
  body?: string | null;
  realPc: ListItem[];
  checks: CheckRun[];
  status: Classification;
}

export interface MergedPr {
  number: number;
  title: string;
  mergedAt: string;
  url?: string;
  realPc: ListItem[];
}

export interface BugRow {
  id: string;
  severity: string;
  status: "open" | "fixed";
  title: string;
  location: string;
  note: string;
}

export interface DossierRow {
  feature: string;
  file: string;
  status: string;
  quickWin: string;
  topBug: string;
  idea: string;
}

export interface IdeaRow {
  rank: number;
  idea: string;
  area: string;
  score: number;
  status: string;
  effort: string;
  risk: string;
  seen: string[];
  files: string;
}

export interface CatalogRow {
  project: string;
  repo: string;
  licence: string;
  mode: string;
  score: number;
  status: string;
  hooks: string;
  lastSeen: string;
}

export interface Table {
  heading: string;
  headers: string[];
  rows: string[][];
}

export interface DocsBundle {
  bugs: BugRow[];
  dossiers: DossierRow[];
  whatIsLeft: ListItem[];
  fableLeft: ListItem[];
  realPc: { source: string; item: ListItem }[];
  ideas: IdeaRow[];
  dailyPath: string | null;
  dailyTop: string[];
  tester: { date?: string; build_ref?: string; test_steps?: { id: string; area: string; steps: string; risk: string }[]; known_issues?: string[] } | null;
  catalog: CatalogRow[];
  scanPath: string | null;
  unreleased: { name: string; items: string[] }[];
  masterplan: { title: string; items: string[] }[];
  horizons: Table | null;
  phases: Table | null;
  queue: string;
  sources: Record<string, string>;
  missing: string[];
  readAtMs: number;
}

export interface Issue {
  number: number;
  title: string;
  state: string;
  labels: { name: string }[];
  html_url?: string;
  created_at?: string;
  updated_at?: string;
  user?: { login: string };
  pull_request?: unknown;
  body?: string | null;
}

export interface CrashReport {
  name: string;
  createdMs: number;
  summary: string;
}

export interface Plan {
  id: string;
  action: string;
  target: string;
  steps: string[];
  heavy: boolean;
}

export type WriteAction =
  | { kind: "rerun"; runId: number; label: string }
  | { kind: "merge"; pr: number; sha: string; method: "merge" | "squash" | "rebase"; title: string; headRef: string; baseRef: string; files: number; commits: number }
  | { kind: "comment"; issue: number; body: string }
  | { kind: "label"; issue: number; labels: string[] }
  | { kind: "close"; issue: number; note: string; notPlanned: boolean }
  | { kind: "tag"; tag: string; sha: string }
  | { kind: "draftPr"; branch: string; path: string; content: string; title: string; body: string }
  | { kind: "localDraft"; name: string; content: string }
  | { kind: "syncDevFolder" }
  | { kind: "clearCache" }
  | { kind: "relaunch" }
  | { kind: "configSet"; path: string; value: string; before: string };

export interface GitInfo {
  root: string | null;
  status: { branch: string; upstream: string | null; ahead: number; behind: number; changed: string[] };
  dirty: boolean;
  aheadOfMain: number | null;
  behindMain: number | null;
  head: string;
  log: { sha: string; date: string; subject: string }[];
  lastFetchMs: number | null;
  devFiles: { name: string; dir: boolean; bytes: number }[];
}

export interface BranchInfo {
  family: string;
  name: string;
  date: string;
  subject: string;
}
