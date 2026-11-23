// Agent-mode glue: turns plan steps into gated page actions and keeps the timeline model.
import type { Decision, ElementDescription, PageAction, Target } from "./api";
import type { PlanStep, ResultCard } from "./guard";

export type StepIcon = "globe" | "search" | "layers" | "type" | "click" | "scroll" | "read";

export type AgentItem =
  | { kind: "user"; key: string; text: string; at: number }
  | { kind: "say"; key: string; text: string; at: number }
  | { kind: "action"; key: string; text: string; ok: boolean; at: number; retry?: PlanStep }
  | { kind: "blocked"; key: string; text: string; reason: string; at: number }
  | { kind: "flag"; key: string; excerpts: string[]; at: number }
  | { kind: "answer"; key: string; text: string; provider?: string; at: number }
  | { kind: "group"; key: string; title: string; icon: StepIcon; host?: string; verbs: string[]; why?: string; tabId?: string; at: number }
  | { kind: "result"; key: string; result: ResultCard; at: number };

export interface PendingOk {
  step: PlanStep;
  element: number;
  decision: Decision;
  desc: ElementDescription;
  capturedAt: number;
}

export function stepToAction(step: PlanStep): { action: PageAction; element?: number } {
  const blank: Partial<Target> = {};
  switch (step.do) {
    case "read_page":
      return { action: { do: "read_page" } };
    case "scroll":
      return { action: { do: "scroll", dy: step.dy ?? 600 }, element: step.ref };
    case "click":
      return { action: { do: "click", target: blank }, element: step.ref };
    case "submit":
      return { action: { do: "submit", target: blank }, element: step.ref };
    case "type":
      return { action: { do: "type", target: blank, text: step.text }, element: step.ref };
    case "select":
      return { action: { do: "select", target: blank, value: step.value }, element: step.ref };
    case "navigate":
      return { action: { do: "navigate", url: step.url } };
    case "search":
      return { action: { do: "search", query: step.query } };
  }
}

/** Card headline from what's about to happen, e.g. "Complete reservation on opentable.com?" */
export function approvalTitle(d: ElementDescription, decision: Decision): string {
  const what = (d.target.text || d.target.label || "this button").replace(/\s+/g, " ").trim().slice(0, 60);
  const host = d.host.replace(/^www\./, "");
  switch (decision.category) {
    case "booking":
      return `${what} on ${host}?`;
    case "send":
      return `Send this on ${host}?`;
    case "delete":
      return `${what}? This can't be undone on ${host}.`;
    default:
      return `${what} on ${host}?`;
  }
}

/** Notes that mention money or irreversibility are surfaced as warnings on the card. */
export function warnings(d: Pick<ElementDescription, "notes" | "context">): string[] {
  const all = [...d.notes, ...(d.context ? [d.context] : [])];
  const out: string[] = [];
  for (const n of all) {
    if (/(\$|€|£)\s?\d|\bfee\b|no[- ]show|non[- ]refundable|cannot be undone|charged/i.test(n) && !out.includes(n)) out.push(n.length > 140 ? `${n.slice(0, 137)}…` : n);
    if (out.length >= 3) break;
  }
  return out;
}

/** Hold-to-confirm progress (0–1) for a press that started at `downAt`. */
export function holdProgress(downAt: number | null, now: number, holdMs = 900): number {
  if (downAt === null) return 0;
  return Math.max(0, Math.min(1, (now - downAt) / holdMs));
}

/** Short verb for a step, for the timeline's monospace sub-caption. */
export function verbOf(step: PlanStep): string {
  switch (step.do) {
    case "read_page":
      return "read";
    case "navigate":
      return "open";
    case "search":
      return "search";
    case "type":
      return "type";
    case "select":
      return "pick";
    case "submit":
      return "submit";
    case "scroll":
      return "scroll";
    default:
      return "click";
  }
}

export function iconOf(steps: PlanStep[]): StepIcon {
  if (steps.some((s) => s.do === "search")) return "search";
  if (steps.some((s) => s.do === "navigate")) return "globe";
  if (steps.length > 2) return "layers";
  const s = steps[0];
  return !s ? "read" : s.do === "type" || s.do === "select" ? "type" : s.do === "scroll" ? "scroll" : s.do === "read_page" ? "read" : "click";
}

/** "search · sort · open ×6 · kept 3": consecutive repeats collapse to ×N. */
export function summariseVerbs(verbs: string[], extra: string[] = []): string {
  const out: string[] = [];
  let i = 0;
  while (i < verbs.length) {
    let j = i;
    while (j + 1 < verbs.length && verbs[j + 1] === verbs[i]) j++;
    const n = j - i + 1;
    out.push(n > 1 ? `${verbs[i]} ×${n}` : verbs[i]);
    i = j + 1;
  }
  return [...out, ...extra].join(" · ");
}

/** A group title when the model didn't give one. */
export function defaultGroupTitle(steps: PlanStep[], host: string): string {
  const nav = steps.find((s) => s.do === "navigate") as { url: string } | undefined;
  if (nav) {
    const h = /^https?:\/\/(?:www\.)?([^/]+)/i.exec(nav.url)?.[1] ?? host;
    return `Opened ${h}`;
  }
  const q = steps.find((s) => s.do === "search") as { query: string } | undefined;
  if (q) return `Searched “${q.query.slice(0, 40)}”`;
  if (steps.some((s) => s.do === "type" || s.do === "select")) return `Filled in a form on ${host}`;
  return `Worked on ${host}`;
}

/** An .ics file for "Add to calendar" (a 2-hour event starting at `when`). */
export function icsFor(p: { name: string; when: string; address?: string; url?: string }, now = Date.now()): string {
  const t = new Date(p.when);
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const esc = (s: string) => s.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, "\\n");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Lens UI//Lens Browser//EN",
    "BEGIN:VEVENT",
    `UID:${t.getTime()}-${p.name.length}@lens-browser`,
    `DTSTAMP:${fmt(new Date(now))}`,
    `DTSTART:${fmt(t)}`,
    `DTEND:${fmt(new Date(t.getTime() + 2 * 3600_000))}`,
    `SUMMARY:${esc(p.name)}`,
    ...(p.address ? [`LOCATION:${esc(p.address)}`] : []),
    ...(p.url ? [`URL:${p.url}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}

/** Directions link (OpenStreetMap, no account or tracking). */
export function directionsUrl(place: { name: string; address?: string }): string {
  return `https://www.openstreetmap.org/search?query=${encodeURIComponent(place.address || place.name)}`;
}

/** Plain-language error for a failed step (no stack traces, no codes). */
export function plainError(e: unknown): string {
  const s = String(e ?? "").replace(/^Error:\s*/, "");
  if (/didn't answer|timed out|timeout/i.test(s)) return "The page took too long to respond.";
  if (/element is gone|fresh look/i.test(s)) return "The page changed before I could act.";
  if (/asleep or closed|No page is open/i.test(s)) return "That tab isn't open any more.";
  return s.length > 140 ? `${s.slice(0, 137)}…` : s || "Something went wrong.";
}
