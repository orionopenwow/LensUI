// Magic Search's view model (docs/plans/SELECTION_BAR.md §3.4). Pure: which AI answers and
// whether it may, the prompt with numbered sources, citations, copy text, local matches from your
// own Lens data, cheap smart cards, follow-ups. The pop-out (MagicSearch.tsx) only wires these up.
import type { AiRequest, AiStatus, ProviderInfo } from "../../ai/contract";
import { isCloud, sendGate, type SendGate } from "../../ai/context";
import { PROMPTS } from "../model";
import type { WebAnswer, WebResult } from "../../types/generated";

export const EVT_OPEN = "lens://magicsearch/open";
export const STAGGER_FIRST = 6;

// ---- who answers -------------------------------------------------------------------------------

export type ProviderPref = "default" | "local" | "claude";

/** The provider for the quick answer: the local model when there is one and the person didn't
 *  ask otherwise ("local when it's enough"), else the configured one. */
export function pickProvider(status: AiStatus | null, pref: ProviderPref = "default"): ProviderInfo | null {
  if (!status || status.active === "off") return null;
  const byId = (id: string) => status.providers.find((p) => p.id === id || p.kind === id) ?? null;
  const local = status.providers.find((p) => p.is_local && p.available && p.kind !== "script" && p.kind !== "off") ?? null;
  if (pref === "local") return local;
  if (pref === "claude") return byId("claude");
  return local ?? byId(status.active);
}

export interface AnswerGate {
  provider: ProviderInfo | null;
  gate: SendGate;
  cloud: boolean;
  /** What the panel says about who answers and where the selection goes. */
  line: string;
}

export function answerGate(status: AiStatus | null, pref: ProviderPref, consented: boolean): AnswerGate {
  const provider = pickProvider(status, pref);
  const gate = status ? sendGate(status.privacy, provider, consented) : "no-provider";
  const cloud = isCloud(provider);
  const name = provider ? (provider.model ? `${provider.label} · ${provider.model}` : provider.label) : "";
  const line =
    gate === "no-provider"
      ? "No AI is set up, so there's no quick answer. Results below are still here."
      : gate === "needs-key"
        ? `${provider?.label ?? "The AI"} needs a key in Settings › AI before it can answer.`
        : gate === "blocked"
          ? "Your AI privacy setting keeps everything on this PC, and no local model is running."
          : cloud
            ? `Answered by ${name} (cloud). The selection is sent to it.`
            : `Answered by ${name} on this PC.`;
  return { provider, gate, cloud, line };
}

// ---- the prompt --------------------------------------------------------------------------------

export interface Turn {
  q: string;
  a: string;
}

const MAX_SOURCE_SNIPPET = 280;

/** Numbered sources for the prompt (web results only: local results never leave the PC). */
export function sourcesBlock(results: WebResult[], max = 6): string {
  return results
    .slice(0, max)
    .map((r, i) => `[${i + 1}] ${r.title} — ${r.url}\n${r.snippet.slice(0, MAX_SOURCE_SNIPPET)}`)
    .join("\n\n");
}

/** The quick answer (or a selection-bar action) as one request through the AI plumbing. */
export function buildRequest(opts: {
  query: string;
  action?: string | null;
  results?: WebResult[];
  thread?: Turn[];
  followUp?: string;
  provider?: ProviderInfo | null;
}): AiRequest {
  const { query, action, results = [], thread = [], followUp } = opts;
  const parts: string[] = [];
  if (action) {
    parts.push(PROMPTS[action] ?? "Help with this.");
  } else {
    parts.push(
      "Give a quick, accurate answer about the selected text in 2–5 short sentences. " +
        (results.length ? "Use the numbered sources when they help and cite them like [1]. Never cite a source that isn't listed. " : "") +
        "If you're not sure, say so. No preamble.",
    );
    if (results.length) parts.push(`Sources:\n${sourcesBlock(results)}`);
  }
  if (thread.length) parts.push(`Earlier in this search:\n${thread.map((t) => `Q: ${t.q}\nA: ${t.a.slice(0, 800)}`).join("\n\n")}`);
  if (followUp?.trim()) parts.push(`Follow-up question: ${followUp.trim()}`);
  const provider = opts.provider && (opts.provider.id === "local" || opts.provider.id === "claude") ? opts.provider.id : undefined;
  return { prompt: parts.join("\n\n"), context: { selection: query }, ...(provider ? { provider } : {}), allow_tools: false };
}

// ---- citations and copying -----------------------------------------------------------------------

/** The source numbers an answer cites, in first-use order, only ones that exist. */
export function citedNumbers(text: string, count: number): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(/\[(\d{1,2})(?:\s*,\s*(\d{1,2}))*\]/g)) {
    for (const n of m[0].slice(1, -1).split(",").map((x) => Number(x.trim()))) {
      if (n >= 1 && n <= count && !out.includes(n)) out.push(n);
    }
  }
  return out;
}

/** Answer text for the clipboard: without sources the [n] markers go; with them a list follows. */
export function copyText(answer: string, results: WebResult[], withSources: boolean): string {
  const clean = answer.replace(/\s*\[(\d{1,2})(?:\s*,\s*\d{1,2})*\]/g, "").replace(/[ \t]+\n/g, "\n").trim();
  if (!withSources) return clean;
  const cited = citedNumbers(answer, results.length);
  const list = (cited.length ? cited : results.map((_, i) => i + 1)).slice(0, 8);
  if (!list.length) return clean;
  return `${answer.trim()}\n\nSources:\n${list.map((n) => `[${n}] ${results[n - 1].title} — ${results[n - 1].url}`).join("\n")}`;
}

/** Splits an answer into text and citation chips for display. */
export function answerParts(text: string, count: number): ({ t: "text"; v: string } | { t: "cite"; n: number })[] {
  const out: ({ t: "text"; v: string } | { t: "cite"; n: number })[] = [];
  let last = 0;
  for (const m of text.matchAll(/\[(\d{1,2})\]/g)) {
    const n = Number(m[1]);
    if (n < 1 || n > count) continue;
    if (m.index! > last) out.push({ t: "text", v: text.slice(last, m.index) });
    out.push({ t: "cite", n });
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push({ t: "text", v: text.slice(last) });
  return out;
}

// ---- local results (found here, never sent anywhere) -----------------------------------------------

export type LocalKind = "shelf" | "note" | "clip" | "file";

export interface LocalItem {
  kind: LocalKind;
  id: string;
  title: string;
  detail: string;
  /** File path or URL to open, when there is one. */
  target?: string;
}

export function words(q: string): string[] {
  return [...new Set(q.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3))].slice(0, 12);
}

/** Share of the query's words found in the text (0–1). */
export function overlap(qw: string[], text: string): number {
  if (!qw.length) return 0;
  const t = text.toLowerCase();
  return qw.filter((w) => t.includes(w)).length / qw.length;
}

/** The best local matches: at least `min` of the words, best first, `limit` per kind. */
export function localMatches(query: string, items: LocalItem[], limit = 3, min = 0.34): LocalItem[] {
  const qw = words(query);
  if (!qw.length) return [];
  const scored = items
    .map((it, i) => ({ it, i, s: overlap(qw, `${it.title} ${it.detail}`) }))
    .filter((x) => x.s >= min)
    .sort((a, b) => b.s - a.s || a.i - b.i);
  const per = new Map<LocalKind, number>();
  const out: LocalItem[] = [];
  for (const { it } of scored) {
    const n = per.get(it.kind) ?? 0;
    if (n >= limit) continue;
    per.set(it.kind, n + 1);
    out.push(it);
  }
  return out;
}

// ---- smart cards (cheap, local) ----------------------------------------------------------------------

export type Card =
  | { type: "maths"; expr: string; result: string }
  | { type: "convert"; from: string; to: string }
  | { type: "define"; word: string }
  | { type: "translate"; script: string }
  | { type: "code"; language: string };

/** Evaluates + - * / ^ ( ) with numbers; null for anything else. */
export function evalMaths(src: string): number | null {
  const s = src.replace(/,/g, "").replace(/×/g, "*").replace(/÷/g, "/").replace(/=\s*$/, "").trim();
  if (!/^[\d\s.+\-*/^()%]+$/.test(s) || !/\d/.test(s) || !/[+\-*/^%]/.test(s.replace(/^-/, ""))) return null;
  let i = 0;
  const peek = () => s[i];
  const skip = () => {
    while (s[i] === " ") i++;
  };
  const num = (): number | null => {
    skip();
    if (peek() === "(") {
      i++;
      const v = expr();
      skip();
      if (peek() !== ")") return null;
      i++;
      return v;
    }
    if (peek() === "-") {
      i++;
      const v = num();
      return v === null ? null : -v;
    }
    const m = /^\d+(\.\d+)?/.exec(s.slice(i));
    if (!m) return null;
    i += m[0].length;
    return Number(m[0]);
  };
  const pow = (): number | null => {
    const b = num();
    skip();
    if (b !== null && peek() === "^") {
      i++;
      const e = pow();
      return e === null ? null : b ** e;
    }
    return b;
  };
  const term = (): number | null => {
    let v = pow();
    for (;;) {
      skip();
      const op = peek();
      if (v === null || (op !== "*" && op !== "/" && op !== "%")) return v;
      i++;
      const r = pow();
      if (r === null) return null;
      v = op === "*" ? v * r : op === "/" ? (r === 0 ? null : v / r) : v % r;
    }
  };
  function expr(): number | null {
    let v = term();
    for (;;) {
      skip();
      const op = peek();
      if (v === null || (op !== "+" && op !== "-")) return v;
      i++;
      const r = term();
      if (r === null) return null;
      v = op === "+" ? v + r : v - r;
    }
  }
  const v = expr();
  skip();
  return v !== null && i === s.length && Number.isFinite(v) ? v : null;
}

const UNITS: Record<string, [string, number]> = {
  km: ["mi", 0.621371], mi: ["km", 1.609344], kg: ["lb", 2.204623], lb: ["kg", 0.453592], m: ["ft", 3.28084], ft: ["m", 0.3048],
  cm: ["in", 0.393701], in: ["cm", 2.54], l: ["gal", 0.264172], gal: ["l", 3.785412],
};

export function fmt(n: number): string {
  const r = Math.round(n * 1e4) / 1e4;
  return Math.abs(r) >= 1000 ? r.toLocaleString("en-GB", { maximumFractionDigits: 2 }) : String(r);
}

/** Cards that fit the query, cheapest first. */
export function smartCards(query: string): Card[] {
  const q = query.trim();
  const out: Card[] = [];
  if (q.length > 400) return out;
  const m = evalMaths(q);
  if (m !== null) out.push({ type: "maths", expr: q.replace(/=\s*$/, ""), result: fmt(m) });
  const u = /^(-?\d+(?:[.,]\d+)?)\s*(km|mi|kg|lb|m|ft|cm|in|l|gal)\.?$/i.exec(q);
  if (u) {
    const [to, f] = UNITS[u[2].toLowerCase()];
    const v = Number(u[1].replace(",", "."));
    out.push({ type: "convert", from: `${fmt(v)} ${u[2].toLowerCase()}`, to: `${fmt(v * f)} ${to}` });
  }
  if (/^\p{L}[\p{L}'-]{1,31}$/u.test(q)) out.push({ type: "define", word: q });
  const script = scriptOf(q);
  if (script) out.push({ type: "translate", script });
  if (/[;{}]\s*$|=>|\bfunction\b|\bdef\s+\w+\(|\bfn\s+\w+\(|\bconst\s+\w+\s*=/m.test(q) && q.length >= 8) {
    out.push({ type: "code", language: /\bfn\s/.test(q) ? "Rust" : /\bdef\s/.test(q) ? "Python" : "JavaScript" });
  }
  return out;
}

/** A non-Latin script that most of the text is in ("Cyrillic", "Japanese"…), or "". */
export function scriptOf(t: string): string {
  const letters = [...t].filter((c) => /\p{L}/u.test(c));
  if (letters.length < 2) return "";
  const share = (re: RegExp) => letters.filter((c) => re.test(c)).length / letters.length;
  const tests: [string, RegExp][] = [
    ["Cyrillic", /\p{Script=Cyrillic}/u], ["Greek", /\p{Script=Greek}/u], ["Arabic", /\p{Script=Arabic}/u], ["Hebrew", /\p{Script=Hebrew}/u],
    ["Japanese", /[\p{Script=Hiragana}\p{Script=Katakana}]/u], ["Chinese", /\p{Script=Han}/u], ["Korean", /\p{Script=Hangul}/u],
    ["Devanagari", /\p{Script=Devanagari}/u], ["Thai", /\p{Script=Thai}/u],
  ];
  for (const [name, re] of tests) if (share(re) >= 0.5) return name;
  return "";
}

// ---- the panel as a whole ------------------------------------------------------------------------------

export type Section = "answer" | "cards" | "web" | "local";

/** Which sections the panel shows, fast first: the answer streams, cards are instant, then results. */
export function sections(o: { answerable: boolean; cards: number; web: WebAnswer | null; webOn: boolean; local: number; onlyMine: boolean }): Section[] {
  const out: Section[] = [];
  if (!o.onlyMine && o.answerable) out.push("answer");
  if (!o.onlyMine && o.cards) out.push("cards");
  if (!o.onlyMine && o.webOn) out.push("web");
  if (o.local || o.onlyMine) out.push("local");
  return out;
}

/** The query for "Refine": what was searched plus the person's words. */
export function refine(query: string, extra: string): string {
  const e = extra.trim();
  return e ? `${query.trim()} ${e}`.slice(0, 300) : query.trim();
}

/** The site's monogram for a result (no favicon request is made). */
export function monogram(site: string): string {
  return (site.replace(/^www\./, "")[0] ?? "?").toUpperCase();
}

/** Short source line for a result: "calmtech.com · DuckDuckGo, Wikipedia". */
export function sourceLine(r: WebResult): string {
  const names: Record<string, string> = { duckduckgo: "DuckDuckGo", wikipedia: "Wikipedia" };
  return `${r.site} · ${r.sources.map((s) => names[s] ?? s).join(", ")}`;
}
