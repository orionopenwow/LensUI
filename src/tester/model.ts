// Tester Hub data model: build info, the daily LATEST.json, checklist results and their maths.
// Pure functions only (no React, no Tauri), so everything here is covered by bun tests.

export type Risk = "high" | "med" | "low";

export interface LatestChange {
  area: string;
  title: string;
  detail: string;
  pr?: number;
}

export interface LatestStep {
  id: string;
  area: string;
  steps: string;
  expected: string;
  risk: Risk;
}

/** docs/tester/LATEST.json, written daily by the research-lookout scheduled task. */
export interface LatestNotes {
  date: string;
  build_ref: string;
  changes: LatestChange[];
  test_steps: LatestStep[];
  known_issues: string[];
}

export interface BuildCommit {
  sha: string;
  subject: string;
  /** Top-level-ish paths touched (at most 12), used to infer the area. */
  files: string[];
  pr?: number;
  date?: string;
}

/** src/tester/buildInfo.json, written by tools/changelog/gen.mjs at build time. */
export interface BuildInfo {
  version: string;
  sha: string;
  builtAt: string;
  branch?: string;
  commits: BuildCommit[];
  latest: unknown;
  latestSource?: "docs" | "example" | "none";
}

export const AREAS = ["Dock", "Themes", "Windows", "Desktop", "AI & Command", "Settings", "Under the hood"] as const;
export type Area = (typeof AREAS)[number];

const RULES: { area: Area; paths: RegExp[]; words: RegExp }[] = [
  { area: "Dock", paths: [/Dock/i, /\/dock\//i, /TopBar/i, /win_taskbar/i, /tray/i], words: /\bdock|taskbar|top ?bar|tray\b/i },
  { area: "Themes", paths: [/themes?\//i, /Theme/i, /tokens\.css/i, /cursors?/i, /SetupWizard/i, /win_theme/i], words: /\btheme|palette|accent|cursor|pointer|wizard|contrast/i },
  { area: "Windows", paths: [/win_(dwm|rules|focus|windows|tiler|altdrag|hotcorners|workspaces|events)/i, /WindowRules/i, /Overview/i], words: /\bwindow|border|snap|tiling|alt\+?drag|hot corner|workspace|overview/i },
  { area: "Desktop", paths: [/wallpaper/i, /playground/i, /DesktopFolder/i, /desktop_input/i, /Widget/i], words: /\bwallpaper|playground|desktop|widget|sand|scene/i },
  { area: "AI & Command", paths: [/\/ai\//i, /command\//i, /shelf/i, /clip\//i, /bridge/i, /extensions\//i, /media\//i, /win_mcp/i], words: /\bai\b|claude|ollama|command|shelf|clipboard|bridge|extension|transcri|mcp/i },
  { area: "Settings", paths: [/ControlCenter/i, /components\/.*Card/i, /tester\//i], words: /\bsettings?|control center|card|tester/i },
];

/** Best-guess plain-language area for a commit, from its files first, then its message. */
export function areaOf(c: Pick<BuildCommit, "subject" | "files">): Area {
  const score = new Map<Area, number>();
  for (const f of c.files ?? []) {
    for (const r of RULES) if (r.paths.some((p) => p.test(f))) score.set(r.area, (score.get(r.area) ?? 0) + 1);
  }
  let best: Area | null = null;
  let bestN = 0;
  for (const r of RULES) {
    const n = score.get(r.area) ?? 0;
    if (n > bestN) {
      best = r.area;
      bestN = n;
    }
  }
  if (best) return best;
  const hit = RULES.find((r) => r.words.test(c.subject));
  return hit ? hit.area : "Under the hood";
}

/** Strips conventional-commit prefixes and trailing PR refs; capitalises. */
export function plainTitle(subject: string): string {
  let s = subject.trim();
  s = s.replace(/^(feat|fix|chore|docs|refactor|perf|test|ci|build|style)(\([^)]*\))?!?:\s*/i, "");
  s = s.replace(/^Merge pull request #\d+ from \S+\s*/i, "");
  s = s.replace(/\s*\(#\d+\)\s*$/, "");
  return s ? s[0].toUpperCase() + s.slice(1) : subject;
}

export function prOf(c: BuildCommit): number | undefined {
  if (c.pr) return c.pr;
  const m = /#(\d+)/.exec(c.subject);
  return m ? Number(m[1]) : undefined;
}

export interface ChangeGroup {
  area: Area;
  items: { title: string; pr?: number; sha: string }[];
}

/** Groups commits by area in the fixed AREAS order, dropping merge noise and duplicates. */
export function groupCommits(commits: BuildCommit[]): ChangeGroup[] {
  const seen = new Set<string>();
  const by = new Map<Area, ChangeGroup["items"]>();
  for (const c of commits) {
    if (/^Merge (branch|remote-tracking)/i.test(c.subject)) continue;
    const title = plainTitle(c.subject);
    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const a = areaOf(c);
    if (!by.has(a)) by.set(a, []);
    by.get(a)!.push({ title, pr: prOf(c), sha: c.sha.slice(0, 7) });
  }
  return AREAS.filter((a) => by.has(a)).map((a) => ({ area: a, items: by.get(a)! }));
}

const str = (v: unknown, max = 2000): string | null => (typeof v === "string" && v.trim() ? v.slice(0, max) : null);

/**
 * Validates LATEST.json. Bad entries are dropped individually (never the whole file), and
 * anything unusable yields `null`, so the hub falls back to "no notes for this build".
 */
export function parseLatest(raw: unknown): { notes: LatestNotes | null; problems: string[] } {
  const problems: string[] = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { notes: null, problems: ["not an object"] };
  const r = raw as Record<string, unknown>;
  const changes: LatestChange[] = [];
  for (const [i, c] of (Array.isArray(r.changes) ? r.changes : []).entries()) {
    const o = (c ?? {}) as Record<string, unknown>;
    const title = str(o.title, 200);
    if (!title) {
      problems.push(`changes[${i}] has no title`);
      continue;
    }
    const pr = typeof o.pr === "number" && Number.isInteger(o.pr) && o.pr > 0 ? o.pr : undefined;
    changes.push({ area: str(o.area, 40) ?? "Under the hood", title, detail: str(o.detail) ?? "", ...(pr ? { pr } : {}) });
  }
  const steps: LatestStep[] = [];
  const ids = new Set<string>();
  for (const [i, s] of (Array.isArray(r.test_steps) ? r.test_steps : []).entries()) {
    const o = (s ?? {}) as Record<string, unknown>;
    const id = str(o.id, 60) ?? `step-${i + 1}`;
    const text = str(o.steps);
    if (!text) {
      problems.push(`test_steps[${i}] has no steps`);
      continue;
    }
    if (ids.has(id)) {
      problems.push(`duplicate step id ${id}`);
      continue;
    }
    ids.add(id);
    const risk: Risk = o.risk === "high" || o.risk === "low" ? o.risk : "med";
    steps.push({ id, area: str(o.area, 40) ?? "General", steps: text, expected: str(o.expected) ?? "", risk });
  }
  const known = (Array.isArray(r.known_issues) ? r.known_issues : []).map((k) => str(k, 400)).filter((k): k is string => !!k);
  if (!changes.length && !steps.length && !known.length) return { notes: null, problems: [...problems, "no usable content"] };
  return {
    notes: { date: str(r.date, 20) ?? "", build_ref: str(r.build_ref, 80) ?? "", changes, test_steps: steps, known_issues: known },
    problems,
  };
}

// ---------------------------------------------------------------------------------------------
// Checklist results
// ---------------------------------------------------------------------------------------------

export type StepStatus = "pass" | "fail" | "skip" | "todo";

export interface StepResult {
  status: StepStatus;
  notes: string;
  screenshots: string[];
  updatedAt?: string;
}

export interface Results {
  build: string;
  tester?: string;
  steps: Record<string, StepResult>;
}

export const emptyResult = (): StepResult => ({ status: "todo", notes: "", screenshots: [] });

export function parseResults(json: string | null | undefined, build: string): Results {
  try {
    const r = JSON.parse(json ?? "");
    if (r && typeof r === "object" && r.steps && typeof r.steps === "object") {
      const steps: Record<string, StepResult> = {};
      for (const [k, v] of Object.entries(r.steps as Record<string, any>)) {
        const status: StepStatus = ["pass", "fail", "skip"].includes(v?.status) ? v.status : "todo";
        steps[k] = {
          status,
          notes: typeof v?.notes === "string" ? v.notes : "",
          screenshots: Array.isArray(v?.screenshots) ? v.screenshots.filter((s: unknown) => typeof s === "string").slice(0, 12) : [],
          updatedAt: typeof v?.updatedAt === "string" ? v.updatedAt : undefined,
        };
      }
      return { build, tester: typeof r.tester === "string" ? r.tester : undefined, steps };
    }
  } catch {
    /* fall through */
  }
  return { build, steps: {} };
}

export function setStep(r: Results, id: string, patch: Partial<StepResult>, now = new Date().toISOString()): Results {
  const prev = r.steps[id] ?? emptyResult();
  return { ...r, steps: { ...r.steps, [id]: { ...prev, ...patch, updatedAt: now } } };
}

export interface Progress {
  total: number;
  done: number;
  pass: number;
  fail: number;
  skip: number;
  todo: number;
  /** 0–100, done / total. */
  pct: number;
  highRiskOpen: number;
}

export function progressOf(steps: LatestStep[], r: Results): Progress {
  const p: Progress = { total: steps.length, done: 0, pass: 0, fail: 0, skip: 0, todo: 0, pct: 0, highRiskOpen: 0 };
  for (const s of steps) {
    const st = r.steps[s.id]?.status ?? "todo";
    p[st] += 1;
    if (st !== "todo") p.done += 1;
    else if (s.risk === "high") p.highRiskOpen += 1;
  }
  p.pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
  return p;
}

export type RiskFilter = "all" | Risk | "open" | "failed";

const RISK_ORDER: Record<Risk, number> = { high: 0, med: 1, low: 2 };

/** Filters and orders steps: highest risk first, then original order. */
export function visibleSteps(steps: LatestStep[], r: Results, filter: RiskFilter): LatestStep[] {
  return steps
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => {
      const st = r.steps[s.id]?.status ?? "todo";
      if (filter === "all") return true;
      if (filter === "open") return st === "todo";
      if (filter === "failed") return st === "fail";
      return s.risk === filter;
    })
    .sort((a, b) => RISK_ORDER[a.s.risk] - RISK_ORDER[b.s.risk] || a.i - b.i)
    .map(({ s }) => s);
}

// ---------------------------------------------------------------------------------------------
// Report text
// ---------------------------------------------------------------------------------------------

export interface EnvSummary {
  windows: string;
  cpu: string;
  gpus: string[];
  ramGb: number;
  displays: { width: number; height: number; scale: number; primary: boolean }[];
  lensVersion: string;
}

export function envLines(env: EnvSummary | null): string[] {
  if (!env) return ["Environment: not available"];
  return [
    `Windows: ${env.windows}`,
    `CPU: ${env.cpu}`,
    `GPU: ${env.gpus.length ? env.gpus.join(", ") : "unknown"}`,
    `RAM: ${env.ramGb} GB`,
    `Displays: ${env.displays.length ? env.displays.map((d) => `${d.width}×${d.height} @ ${Math.round(d.scale * 100)}%${d.primary ? " (primary)" : ""}`).join(", ") : "unknown"}`,
  ];
}

const STATUS_LABEL: Record<StepStatus, string> = { pass: "✅ Pass", fail: "❌ Fail", skip: "⏭ Skipped", todo: "⬜ Not tested" };

export function reportMarkdown(info: Pick<BuildInfo, "version" | "sha" | "builtAt">, notes: LatestNotes | null, r: Results, env: EnvSummary | null, generatedAt = new Date().toISOString()): string {
  const steps = notes?.test_steps ?? [];
  const p = progressOf(steps, r);
  const out: string[] = [
    `# Lens test report`,
    ``,
    `- Build: ${info.version} (${info.sha.slice(0, 7)}), built ${info.builtAt}`,
    `- Notes: ${notes ? `${notes.date} · ${notes.build_ref}` : "none bundled"}`,
    `- Report written: ${generatedAt}`,
    `- Result: ${p.pass} passed, ${p.fail} failed, ${p.skip} skipped, ${p.todo} not tested (${p.pct}% done)`,
    ``,
    `## Environment`,
    ...envLines(env).map((l) => `- ${l}`),
    ``,
    `## Checklist`,
  ];
  if (!steps.length) out.push("", "No test steps were bundled with this build.");
  for (const s of visibleSteps(steps, r, "all")) {
    const res = r.steps[s.id] ?? emptyResult();
    out.push("", `### ${STATUS_LABEL[res.status]} — ${s.area}: ${s.id} (${s.risk} risk)`, "", `**Steps:** ${s.steps}`, "", `**Expected:** ${s.expected || "—"}`);
    if (res.notes.trim()) out.push("", `**Tester notes:** ${res.notes.trim()}`);
    if (res.screenshots.length) out.push("", `**Screenshots:** ${res.screenshots.length} attached`);
  }
  if (notes?.known_issues.length) out.push("", "## Known issues at build time", ...notes.known_issues.map((k) => `- ${k}`));
  return out.join("\n") + "\n";
}

/** Short body for the GitHub "new issue" form (the zip carries the details). */
export function issueBody(info: Pick<BuildInfo, "version" | "sha">, env: EnvSummary | null, failed: { step: LatestStep; result: StepResult }[]): string {
  const lines = [
    `**Build:** ${info.version} (${info.sha.slice(0, 7)})`,
    ...envLines(env).map((l) => `- ${l}`),
    "",
    "### What happened",
    "",
    "<!-- Describe what you saw. Drag the exported test report zip into this box. -->",
  ];
  if (failed.length) {
    lines.push("", "### Failed checklist steps");
    for (const f of failed.slice(0, 8)) {
      lines.push(`- **${f.step.id}** (${f.step.area}): ${f.step.steps.slice(0, 200)}${f.result.notes ? ` — _${f.result.notes.slice(0, 300)}_` : ""}`);
    }
  }
  return lines.join("\n");
}

export function issueTitle(failed: { step: LatestStep }[]): string {
  if (failed.length === 1) return `Tester report: ${failed[0].step.area} — ${failed[0].step.id} failed`;
  if (failed.length > 1) return `Tester report: ${failed.length} checklist steps failed`;
  return "Tester report";
}
