// Mirrors of the Rust types in src-tauri/src/cleaner (camelCase over IPC).

export type Safety = "SAFE" | "REVIEW" | "ADMIN";
export type Method = "deleteFiles" | "emptyRecycleBin" | "recycleFiles" | "elevated" | "openSettings" | "storeUninstall";

export interface CleanerItem {
  path: string;
  size: number;
  ageDays: number;
  note?: string | null;
  link?: string | null;
}

export interface CleanerCategory {
  id: string;
  title: string;
  description: string;
  cost: string;
  icon: string;
  safety: Safety;
  method: Method;
  preTicked: boolean;
  size: number;
  count: number;
  items: CleanerItem[];
  partial: boolean;
  action?: string | null;
}

export interface ScanReport {
  categories: CleanerCategory[];
  safeBytes: number;
  reviewBytes: number;
  elapsedMs: number;
}

export interface ScanProgress {
  phase: string;
  category?: string | null;
  /** Size of the category that just finished. */
  size?: number;
  bytes: number;
  files: number;
  done: number;
  total: number;
}

export interface DriveUsage {
  root: string;
  total: number;
  free: number;
  low: boolean;
}

export interface CleanerSettings {
  weekly: boolean;
  lowSpaceAlert: boolean;
  lowSpacePct: number;
  lowSpaceGb: number;
  history: boolean;
  explorerVerb: boolean;
  lastWeeklyMs: number;
  lastAlertDay: string;
}

export interface Overview {
  drives: DriveUsage[];
  storageSense: boolean | null;
  settings: CleanerSettings;
  checklist: [string, string][];
}

export interface PlanEntry {
  category: string;
  path: string;
  size: number;
  action: "delete" | "recycle";
}

export interface PlanStep {
  category: string;
  kind: "emptyBin" | "elevated" | "open";
  target: string;
  label: string;
  size: number;
}

export interface Preview {
  id: string;
  entries: PlanEntry[];
  entryCount: number;
  steps: PlanStep[];
  total: number;
  /** A permanent delete of your files: the run needs the one-time code the person types. */
  permanent?: boolean;
  refused: [string, string][];
}

export interface Pick {
  category: string;
  path: string;
  link?: string | null;
  size?: number;
}

export interface Outcome {
  freed: number;
  deleted: string[];
  binned: string[];
  skipped: [string, string][];
  stepsDone: string[];
  dryRun: boolean;
}

export type NodeKind = "dir" | "file" | "locked" | "denied";

export interface SpaceNode {
  id: number;
  name: string;
  path: string;
  size: number;
  files: number;
  kind: NodeKind;
  hasChildren: boolean;
  ageDays: number;
  note?: string | null;
  children: SpaceNode[];
}

export interface SpaceView {
  node: SpaceNode;
  crumbs: SpaceNode[];
  children: SpaceNode[];
}

export interface SpaceSummary {
  root: string;
  size: number;
  files: number;
  elapsedMs: number;
  cloudOnly: number;
  links?: number;
  cancelled: boolean;
}

export interface SpaceProgress {
  files: number;
  bytes: number;
  folders: number;
  current: string;
}

export interface AppUsage {
  key: string;
  name: string;
  publisher: string;
  size: number;
  dataSize: number;
  dataDirs: string[];
  icon?: string | null;
  canUninstall: boolean;
}

export interface Verdict {
  path: string;
  name: string;
  size: number;
  kind: string;
  ageDays: number;
  openedDays: number;
  suggest: boolean;
  reason: string;
}

export interface HistoryPoint {
  day: string;
  used: number;
  free: number;
}

export interface HistoryView {
  enabled: boolean;
  series: HistoryPoint[];
  growth: { path: string; before: number; after: number; delta: number }[];
  sudden?: number | null;
  /** The biggest day-to-day rises in the series, labelled by the folder that grew when known. */
  jumps?: HistoryJump[];
}

export interface HistoryJump {
  day: string;
  delta: number;
  folder?: string | null;
  folderDelta: number;
}

export interface UndoResult {
  restored: string[];
  left: [string, string][];
}

/** The one-time code for a permanent delete, minted in Rust for the Cleaner's confirm step only. */
export interface ConfirmCode {
  code: string;
  expiresInMs: number;
  tries: number;
}
