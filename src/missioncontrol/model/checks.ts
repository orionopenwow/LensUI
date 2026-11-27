// Real-PC checks: every "needs a real PC" item from open PRs, recently merged PRs and the feature
// dossiers as one checklist, with the owner's pass / fail / skip, notes and a screenshot.
import { slug } from "./suggestions";
import type { ListItem, MergedPr, Pr } from "./types";

export type CheckState = "todo" | "pass" | "fail" | "skip";

export interface CheckResult {
  state: CheckState;
  notes: string;
  /** A small data: URL (the page downsizes it); never uploaded on its own. */
  screenshot?: string;
  at: string;
  /** Set once the result was posted as a comment or written into a dossier draft. */
  posted?: string;
}

export type CheckResults = Record<string, CheckResult>;

export interface CheckItem {
  id: string;
  text: string;
  section: string;
  kind: "pr" | "merged" | "dossier";
  /** "#118" or "docs/features/dock.md". */
  ref: string;
  number?: number;
  url?: string;
  /** Ticked in its source already ("- [x]"). */
  doneInSource: boolean;
  result: CheckResult;
}

const EMPTY: CheckResult = { state: "todo", notes: "", at: "" };

export function checkId(kind: CheckItem["kind"], ref: string, text: string): string {
  return `${kind}:${ref}:${slug(text).slice(0, 48)}`;
}

export function buildChecklist(
  open: Pick<Pr, "number" | "url" | "realPc">[],
  merged: MergedPr[],
  dossier: { source: string; item: ListItem }[],
  results: CheckResults
): CheckItem[] {
  const out: CheckItem[] = [];
  const add = (kind: CheckItem["kind"], ref: string, i: ListItem, number?: number, url?: string) => {
    const id = checkId(kind, ref, i.text);
    if (out.some((x) => x.id === id)) return;
    out.push({ id, text: i.text, section: i.section, kind, ref, number, url, doneInSource: i.done, result: results[id] ?? EMPTY });
  };
  for (const p of open) for (const i of p.realPc) add("pr", `#${p.number}`, i, p.number, p.url);
  for (const p of merged) for (const i of p.realPc) add("merged", `#${p.number}`, i, p.number, p.url);
  for (const d of dossier) add("dossier", d.source, d.item);
  return out;
}

export function summarize(items: CheckItem[]) {
  const s = { todo: 0, pass: 0, fail: 0, skip: 0, total: items.length };
  for (const i of items) s[i.doneInSource && i.result.state === "todo" ? "pass" : i.result.state]++;
  return s;
}

export function setResult(results: CheckResults, id: string, patch: Partial<CheckResult>, now = new Date()): CheckResults {
  const prev = results[id] ?? EMPTY;
  return { ...results, [id]: { ...prev, ...patch, at: now.toISOString() } };
}

const MARK: Record<CheckState, string> = { pass: "Pass", fail: "**Fail**", skip: "Skipped", todo: "Not checked yet" };

/** The comment posted on a PR (or issue) for its checked items. Only checked items are listed. */
export function commentFor(items: CheckItem[], machine = "the maintainer's PC"): string {
  const done = items.filter((i) => i.result.state !== "todo");
  const lines = done.map((i) => `- ${i.result.state === "pass" ? "[x]" : "[ ]"} ${i.text} — ${MARK[i.result.state]}${i.result.notes.trim() ? `: ${i.result.notes.trim()}` : ""}${i.result.screenshot ? " (screenshot attached locally)" : ""}`);
  const fails = done.filter((i) => i.result.state === "fail").length;
  return [`### Real-PC check on ${machine}`, "", ...lines, "", fails ? `${fails} failed — see notes.` : "Everything checked passed.", "", "_Posted from Lens Mission Control._"].join("\n");
}

/** A dossier's real-PC lines rewritten with results, for the dossier-status draft PR. */
export function dossierPatch(md: string, items: CheckItem[], today: string): string {
  let out = md;
  for (const i of items.filter((x) => x.kind === "dossier" && x.result.state !== "todo")) {
    const tag = i.result.state === "pass" ? `Confirmed on a real PC (${today})` : i.result.state === "fail" ? `Failed on a real PC (${today}): ${i.result.notes.trim() || "see Mission Control notes"}` : `Skipped on a real PC (${today})`;
    const at = out.indexOf(i.text.slice(0, 40));
    if (at < 0) continue;
    const end = out.indexOf("\n", at);
    const lineEnd = end < 0 ? out.length : end;
    if (out.slice(at, lineEnd).includes("on a real PC (")) continue;
    out = `${out.slice(0, lineEnd)} **${tag}.**${out.slice(lineEnd)}`;
  }
  return out;
}
