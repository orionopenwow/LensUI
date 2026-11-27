// Suggestions: the "recursive self-improvement" feed. Merges the research IDEAS_BACKLOG, the
// combinator's top candidates, Fable/agent "what is left" lists and dossier quick wins into one
// ranked list, and applies the owner's decisions (accept → queue, defer, reject with a reason).
import type { CatalogRow, DossierRow, IdeaRow, ListItem } from "./types";

export type SuggestionSource = "research" | "combinator" | "fable" | "dossier" | "quick-win";
export type DecisionState = "accepted" | "deferred" | "rejected";

export interface Suggestion {
  id: string;
  title: string;
  sources: SuggestionSource[];
  area: string;
  effort: "S" | "M" | "L" | "?";
  /** 0–100, higher first. */
  rank: number;
  status: string;
  detail: string;
}

export interface Decision {
  state: DecisionState;
  reason?: string;
  at: string;
  title?: string;
}

export type Decisions = Record<string, Decision>;

/** A stable id from the title: lowercase words, punctuation and Markdown dropped. */
export function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[`*~_"'“”]/g, "")
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export function effortOf(e: string): Suggestion["effort"] {
  const t = e.trim().toUpperCase();
  if (t.startsWith("S")) return "S";
  if (t.startsWith("M")) return "M";
  if (t.startsWith("L")) return "L";
  return "?";
}

const EFFORT_BONUS: Record<Suggestion["effort"], number> = { S: 10, M: 0, L: -10, "?": 0 };
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export function fromIdeas(rows: IdeaRow[]): Suggestion[] {
  return rows
    .filter((r) => !/^(have|done)$/i.test(r.status.trim()))
    .map((r) => ({
      id: `research:${slug(r.idea)}`,
      title: r.idea,
      sources: ["research"],
      area: r.area,
      effort: effortOf(r.effort),
      // Backlog scores run to ~20 (demand + fit + inverse effort + recurrences).
      rank: clamp(r.score * 5 + (r.seen.length > 1 ? 5 : 0)),
      status: r.status,
      detail: `Backlog #${r.rank}, score ${r.score}, risk ${r.risk || "?"}, seen ${r.seen.join(", ") || "—"}${r.files ? ` · ${r.files}` : ""}`,
    }));
}

export function fromCatalog(rows: CatalogRow[], top = 10): Suggestion[] {
  return rows
    .filter((r) => r.score >= 60 && !/built|shipped|maintained/i.test(r.status))
    .slice(0, top)
    .map((r) => ({
      id: `combinator:${slug(r.project)}`,
      title: `${r.mode || "Combine"}: ${r.project}`,
      sources: ["combinator"],
      area: "Combinator",
      effort: /rewrite/i.test(r.mode) ? "M" : /link/i.test(r.mode) ? "S" : "?",
      rank: clamp(r.score - 10),
      status: r.status || "Catalogued",
      detail: `${r.repo} · ${r.licence || "licence ?"} · score ${r.score}${r.hooks ? ` · hooks: ${r.hooks}` : ""}`,
    }));
}

export function fromLeft(items: ListItem[], source: "fable" | "dossier"): Suggestion[] {
  return items
    .filter((i) => !i.done)
    .map((i) => {
      const title = i.text.split(/[:.](\s|$)/)[0].slice(0, 120) || i.text.slice(0, 120);
      return {
        id: `${source}:${slug(title)}`,
        title,
        sources: [source],
        area: i.section,
        effort: "?" as const,
        rank: source === "dossier" ? 55 : 50,
        status: "Open",
        detail: i.text,
      };
    });
}

export function fromQuickWins(rows: DossierRow[]): Suggestion[] {
  return rows
    .filter((r) => r.quickWin && !/^done/i.test(r.quickWin))
    .map((r) => ({
      id: `quick-win:${slug(r.quickWin)}`,
      title: r.quickWin,
      sources: ["quick-win"],
      area: r.feature,
      effort: "S" as const,
      rank: 60,
      status: r.status.split(" ")[0] || "Open",
      detail: `Top quick win in the ${r.feature} dossier (${r.file})`,
    }));
}

/** Merges duplicates (same slug after the source prefix), keeping the best rank and every
 * source; an idea several feeds agree on gets +5 per extra source. */
export function mergeSuggestions(lists: Suggestion[][]): Suggestion[] {
  const by = new Map<string, Suggestion>();
  for (const s of lists.flat()) {
    const key = s.id.slice(s.id.indexOf(":") + 1);
    const prev = by.get(key);
    if (!prev) {
      by.set(key, { ...s, sources: [...s.sources] });
      continue;
    }
    for (const src of s.sources) if (!prev.sources.includes(src)) prev.sources.push(src);
    prev.rank = clamp(Math.max(prev.rank, s.rank) + 5);
    if (prev.effort === "?") prev.effort = s.effort;
  }
  return [...by.values()];
}

export interface RankedSuggestion extends Suggestion {
  decision?: Decision;
  score: number;
}

/** The ranked feed. Rejected items are dropped (unless `includeRejected`), deferred ones sink,
 * accepted ones stay visible (marked) until they leave the sources. */
export function rankSuggestions(list: Suggestion[], decisions: Decisions, includeRejected = false): RankedSuggestion[] {
  const decided = (s: Suggestion) => decisions[s.id] ?? decisions[s.id.slice(s.id.indexOf(":") + 1)];
  return list
    .map((s) => {
      const d = decided(s);
      const score = s.rank + EFFORT_BONUS[s.effort] - (d?.state === "deferred" ? 40 : 0) - (d?.state === "accepted" ? 20 : 0);
      return { ...s, decision: d, score };
    })
    .filter((s) => includeRejected || s.decision?.state !== "rejected")
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
}

export function decide(decisions: Decisions, s: Suggestion, state: DecisionState, reason?: string, now = new Date()): Decisions {
  if (state === "rejected" && !reason?.trim()) throw new Error("A rejection needs a reason, so scans stop re-suggesting it for that reason.");
  return { ...decisions, [s.id]: { state, reason: reason?.trim() || undefined, at: now.toISOString().slice(0, 10), title: s.title } };
}

/** docs/brain/QUEUE.md as Mission Control writes it: the accepted queue and the rejected list the
 * research lookout and the combinator scan read so they stop re-suggesting. */
export function queueMarkdown(decisions: Decisions, suggestions: Suggestion[], today: string): string {
  const title = (id: string, d: Decision) => d.title ?? suggestions.find((s) => s.id === id)?.title ?? id;
  const esc = (t: string) => t.replace(/\|/g, "\\|").replace(/\n/g, " ");
  const rows = (state: DecisionState) =>
    Object.entries(decisions)
      .filter(([, d]) => d.state === state)
      .sort(([, a], [, b]) => a.at.localeCompare(b.at));
  const queued = rows("accepted").map(([id, d]) => `| ${esc(title(id, d))} | \`${id}\` | ${d.at} |`);
  const rejected = rows("rejected").map(([id, d]) => `| ${esc(title(id, d))} | \`${id}\` | ${esc(d.reason ?? "")} | ${d.at} |`);
  return [
    "# Queue for the next wave",
    "",
    `Written by Lens Mission Control (docs/MISSION_CONTROL.md), ${today}. The next wave takes work from **Queued**. The daily research lookout and the combinator scan read **Rejected** and do not suggest those again unless the reason no longer holds.`,
    "",
    "## Queued",
    "",
    "| Item | Id | Queued |",
    "|---|---|---|",
    ...(queued.length ? queued : ["| — | | |"]),
    "",
    "## Rejected (don't re-suggest)",
    "",
    "| Item | Id | Reason | Date |",
    "|---|---|---|---|",
    ...(rejected.length ? rejected : ["| — | | | |"]),
    "",
  ].join("\n");
}
