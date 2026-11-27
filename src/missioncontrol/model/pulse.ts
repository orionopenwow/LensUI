// Pulse (home) view models: CI health of main, PR board counts, dev folder state, trends, and the
// "copy brief" for pasting into a Claude session.
import type { CheckRun, GitInfo, Pr, Verdict } from "./types";
import type { InboxItem } from "./inbox";
import type { RankedSuggestion } from "./suggestions";

export type Health = "green" | "red" | "running" | "unknown";

export function ciHealth(checks: CheckRun[]): { health: Health; failing: string[]; running: string[]; passed: number } {
  if (!checks.length) return { health: "unknown", failing: [], running: [], passed: 0 };
  const failing = checks.filter((c) => c.conclusion === "failure" || c.conclusion === "timed_out").map((c) => c.name);
  const running = checks.filter((c) => c.status !== "completed").map((c) => c.name);
  const passed = checks.filter((c) => c.conclusion === "success").length;
  return { health: failing.length ? "red" : running.length ? "running" : "green", failing, running, passed };
}

export function board(prs: Pr[]): Record<Verdict, Pr[]> {
  const b: Record<Verdict, Pr[]> = { READY: [], WAIT: [], BLOCKED: [] };
  for (const p of prs) b[p.status.verdict].push(p);
  for (const k of Object.keys(b) as Verdict[]) b[k].sort((x, y) => (y.updatedAt ?? "").localeCompare(x.updatedAt ?? ""));
  return b;
}

export function devFolderLine(g: GitInfo | null, now = Date.now()): string {
  if (!g || !g.root) return "No dev folder found";
  const parts: string[] = [g.status.branch || "?"];
  if (g.behindMain != null) parts.push(g.behindMain === 0 ? "up to date with main" : `${g.behindMain} behind main`);
  if (g.aheadOfMain) parts.push(`${g.aheadOfMain} ahead`);
  if (g.dirty) parts.push(`${g.status.changed.length} changed file(s)`);
  if (g.lastFetchMs) parts.push(`fetched ${ago(g.lastFetchMs, now)}`);
  return parts.join(" · ");
}

export function ago(ms: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

export interface TrendPoint {
  date: string;
  stars: number;
  issues: number;
}

/** Keeps one point per day (the newest), at most `keep` days. */
export function addTrendPoint(points: TrendPoint[], p: TrendPoint, keep = 60): TrendPoint[] {
  const rest = points.filter((x) => x.date !== p.date);
  return [...rest, p].sort((a, b) => a.date.localeCompare(b.date)).slice(-keep);
}

export function trendDelta(points: TrendPoint[], days = 7): { stars: number; issues: number } {
  if (points.length < 2) return { stars: 0, issues: 0 };
  const last = points[points.length - 1];
  const first = points[Math.max(0, points.length - 1 - days)];
  return { stars: last.stars - first.stars, issues: last.issues - first.issues };
}

/** A Markdown brief of where things stand, for a Claude session. Plain facts, no secrets. */
export function buildBrief(input: { today: string; main?: { health: Health; failing: string[] }; prs: Pr[]; bugs: InboxItem[]; suggestions: RankedSuggestion[]; git?: GitInfo | null; researchTop?: string[] }): string {
  const b = board(input.prs);
  const lines: string[] = [`# Lens state — ${input.today}`, "", "Repo orionopenwow/LensUI. Read AGENTS.md, DESIGN.md and docs/brain/IDENTITY.md first.", ""];
  if (input.main) lines.push(`**main CI:** ${input.main.health}${input.main.failing.length ? ` (failing: ${input.main.failing.join(", ")})` : ""}`, "");
  lines.push(`## PRs (${input.prs.length} open: ${b.READY.length} ready, ${b.WAIT.length} waiting, ${b.BLOCKED.length} blocked)`, "");
  for (const p of b.BLOCKED) lines.push(`- **#${p.number} BLOCKED** ${p.title} — ${p.status.reasons.join("; ")}`);
  for (const p of b.READY) lines.push(`- #${p.number} READY ${p.title}`);
  for (const p of b.WAIT) lines.push(`- #${p.number} WAIT ${p.title} — ${p.status.reasons[0] ?? ""}`);
  const open = input.bugs.filter((x) => x.open).slice(0, 8);
  lines.push("", `## Top open bugs (${input.bugs.filter((x) => x.open).length} open)`, "");
  for (const x of open) lines.push(`- ${x.ref} [${x.severity}] ${x.title}`);
  lines.push("", "## Top suggestions", "");
  for (const s of input.suggestions.filter((x) => x.decision?.state !== "accepted").slice(0, 8)) lines.push(`- (${s.sources.join("+")}, effort ${s.effort}) ${s.title}`);
  const queued = input.suggestions.filter((x) => x.decision?.state === "accepted");
  if (queued.length) {
    lines.push("", "## Queued for the next wave", "");
    for (const s of queued) lines.push(`- ${s.title}`);
  }
  if (input.researchTop?.length) {
    lines.push("", "## Today's research top 3", "");
    for (const t of input.researchTop.slice(0, 3)) lines.push(`- ${t}`);
  }
  if (input.git) lines.push("", `Dev folder: ${devFolderLine(input.git)}`);
  lines.push("", "Rules: open PRs, never merge; new bugs get ids from BUGS.md; every OS change undoable by Remove all.");
  return lines.join("\n");
}
