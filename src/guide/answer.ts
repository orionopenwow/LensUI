// Turns a question into a grounded answer. Offline: the top matching settings, lessons and
// commands as cards. With AI: a prompt that contains only index snippets, and a parser that keeps
// only citations pointing at those snippets, so "Show me" can never point at an invented setting.
import type { GuideEntry, GuideIndex, GuideTarget } from "./types";
import { searchFor, type SearchHit } from "./search";

export interface AnswerCard {
  entry: GuideEntry;
  /** "Settings › Theme & Look › Mouse pointer" */
  where: string;
  target?: GuideTarget;
}

export type Coverage = "good" | "weak" | "none";

export interface OfflineAnswer {
  query: string;
  cards: AnswerCard[];
  coverage: Coverage;
  /** Docs passages used to ground an AI answer (not shown as cards). */
  passages: GuideEntry[];
}

const CARD_KINDS = new Set(["setting", "card", "tab", "lesson", "command", "pack", "dock-style", "scene", "hotkey"]);

export function whereOf(e: GuideEntry): string {
  return e.path.join(" › ");
}

/** Score thresholds tuned on the golden queries: below WEAK the index doesn't really cover it. */
const GOOD = 6;
const WEAK = 2.5;

export function answerOffline(index: GuideIndex, query: string, limit = 3): OfflineAnswer {
  const hits = searchFor(index).search(query, { limit: 12 });
  const cards: AnswerCard[] = [];
  const seen = new Set<string>();
  for (const h of hits) {
    if (!CARD_KINDS.has(h.entry.kind)) continue;
    const key = `${h.entry.target?.tab ?? ""}|${h.entry.target?.label ?? h.entry.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    cards.push({ entry: h.entry, where: whereOf(h.entry), target: h.entry.target });
    if (cards.length >= limit) break;
  }
  const best = hits[0]?.score ?? 0;
  const coverage: Coverage = best >= GOOD ? "good" : best >= WEAK ? "weak" : "none";
  return { query, cards: coverage === "none" ? [] : cards, coverage, passages: passagesFrom(hits) };
}

function passagesFrom(hits: SearchHit[]): GuideEntry[] {
  return hits.slice(0, 8).map((h) => h.entry);
}

// ---------------------------------------------------------------------------------------------
// AI grounding
// ---------------------------------------------------------------------------------------------

export interface GroundedPrompt {
  prompt: string;
  /** Snippet number → entry, for citation parsing. */
  sources: GuideEntry[];
  /** Index text to attach as context (privacy-gated like any other field). */
  contextText: string;
}

const MAX_CONTEXT = 6000;

export function buildGroundedPrompt(question: string, sources: GuideEntry[], opts: { windowsBasics?: boolean } = {}): GroundedPrompt {
  const lines: string[] = [];
  let used = 0;
  const kept: GuideEntry[] = [];
  for (const e of sources) {
    const block = `[${kept.length + 1}] ${e.title} — ${whereOf(e)}\n${e.text.slice(0, 700)}`;
    if (used + block.length + 2 > MAX_CONTEXT) break;
    lines.push(block);
    kept.push(e);
    used += block.length + 2;
  }
  const prompt = [
    "You are Lens, the helper built into the Lens desktop shell.",
    "Answer the user's question using ONLY the numbered Lens snippets in the attached context.",
    "Name settings exactly as written in the snippets and say where they live (the path after the dash).",
    "Cite snippets like [1] or [2]. Never invent a setting, menu, shortcut or feature that is not in the snippets.",
    opts.windowsBasics
      ? "If the snippets don't cover it, you may give brief general Windows guidance, clearly marked as general Windows advice."
      : "If the snippets don't cover it, say Lens's guide doesn't cover that yet.",
    "Keep it short: 2-5 sentences or a short list.",
    "",
    `Question: ${question}`,
  ].join("\n");
  return { prompt, sources: kept, contextText: lines.join("\n\n") };
}

export interface ParsedAnswer {
  text: string;
  /** Cited snippets that exist, in order of first citation. */
  citations: GuideEntry[];
  /** Citation numbers that pointed nowhere (dropped). */
  dropped: number[];
}

/** Keeps only citations that refer to real snippets; strips any that don't. */
export function parseCitations(answer: string, sources: GuideEntry[]): ParsedAnswer {
  const citations: GuideEntry[] = [];
  const dropped: number[] = [];
  const text = answer.replace(/\[(\d{1,2})\]/g, (m, n) => {
    const i = Number(n) - 1;
    const e = sources[i];
    if (!e) {
      dropped.push(Number(n));
      return "";
    }
    if (!citations.includes(e)) citations.push(e);
    return m;
  });
  return { text: text.replace(/\s+([.,;:])/g, "$1").trim(), citations, dropped };
}

/** Every Show-me target in an answer must resolve to an index entry. */
export function showMeTargets(index: GuideIndex, parsed: ParsedAnswer): GuideTarget[] {
  const ids = new Set(index.entries.map((e) => e.id));
  return parsed.citations.filter((e) => ids.has(e.id) && e.target).map((e) => e.target!);
}
