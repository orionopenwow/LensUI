// Bugs inbox: GitHub issues (labels tester-report, bug), in-app bug reports (issues the Report a
// problem sheet prefills, labelled bug / tester-report), BUGS.md rows and local crash reports, in
// one list.
import type { BugRow, CrashReport, Issue } from "./types";

export type InboxKind = "issue" | "brain" | "crash";
export type Severity = "Critical" | "High" | "Medium" | "Low" | "?";

export interface InboxItem {
  id: string;
  kind: InboxKind;
  title: string;
  severity: Severity;
  open: boolean;
  ref: string;
  number?: number;
  labels: string[];
  url?: string;
  at: string;
  detail: string;
}

const SEV_ORDER: Record<Severity, number> = { Critical: 0, High: 1, Medium: 2, Low: 3, "?": 4 };

export function severityOf(text: string): Severity {
  const t = text.toLowerCase();
  if (/critical|sev[:-]?0|p0/.test(t)) return "Critical";
  if (/high|sev[:-]?1|p1/.test(t)) return "High";
  if (/medium|sev[:-]?2|p2/.test(t)) return "Medium";
  if (/low|sev[:-]?3|p3|polish/.test(t)) return "Low";
  return "?";
}

export const INBOX_LABELS = ["tester-report", "bug"];

export function fromIssues(issues: Issue[]): InboxItem[] {
  return issues
    .filter((i) => !i.pull_request && i.labels.some((l) => INBOX_LABELS.includes(l.name)))
    .map((i) => {
      const labels = i.labels.map((l) => l.name);
      return {
        id: `issue:${i.number}`,
        kind: "issue" as const,
        title: i.title,
        severity: severityOf(labels.join(" ")),
        open: i.state === "open",
        ref: `#${i.number}`,
        number: i.number,
        labels,
        url: i.html_url,
        at: (i.updated_at ?? i.created_at ?? "").slice(0, 10),
        detail: (i.body ?? "").slice(0, 400),
      };
    });
}

export function fromBrain(rows: BugRow[]): InboxItem[] {
  return rows.map((b) => ({
    id: `brain:${b.id}`,
    kind: "brain" as const,
    title: b.title,
    severity: severityOf(b.severity),
    open: b.status === "open",
    ref: b.id,
    labels: [],
    at: "",
    detail: [b.location, b.note].filter(Boolean).join(" · "),
  }));
}

export function fromCrashes(reports: CrashReport[]): InboxItem[] {
  return reports.map((c) => ({
    id: `crash:${c.name}`,
    kind: "crash" as const,
    title: c.summary || c.name,
    severity: "High" as const,
    open: true,
    ref: c.name,
    labels: [],
    at: new Date(c.createdMs).toISOString().slice(0, 10),
    detail: "Local crash report on this PC (scrubbed when it was written).",
  }));
}

export function mergeInbox(...lists: InboxItem[][]): InboxItem[] {
  return lists
    .flat()
    .sort((a, b) => Number(b.open) - Number(a.open) || SEV_ORDER[a.severity] - SEV_ORDER[b.severity] || b.at.localeCompare(a.at) || a.ref.localeCompare(b.ref));
}

export function openBySeverity(items: InboxItem[]): Record<Severity, number> {
  const r: Record<Severity, number> = { Critical: 0, High: 0, Medium: 0, Low: 0, "?": 0 };
  for (const i of items) if (i.open) r[i.severity]++;
  return r;
}

export function filterInbox(items: InboxItem[], f: { kind?: InboxKind | "all"; open?: boolean; q?: string }): InboxItem[] {
  const q = (f.q ?? "").trim().toLowerCase();
  return items.filter(
    (i) => (f.kind === undefined || f.kind === "all" || i.kind === f.kind) && (f.open === undefined || i.open === f.open) && (!q || `${i.ref} ${i.title} ${i.detail} ${i.labels.join(" ")}`.toLowerCase().includes(q))
  );
}
