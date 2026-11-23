// Lens Browser's "Needs your OK" card model, in the same shape as the shared approval model on
// feature/claude-control (src/approval/model.ts: ApprovalRequest / ApprovalPreview). The types
// below mirror that file; once both branches are merged, import them from "../approval/model"
// instead and delete the copies.
import type { Category, Decision, ElementDescription } from "./api";
import type { PendingOk } from "./agent";

export type SharedRisk = "low" | "confirm" | "blocked";
export type Level = "allowed" | "ask" | "blocked";

export interface TaskItem {
  id: string;
  label: string;
  level: Level;
  used: boolean;
}

export interface ApprovalPreview {
  question: string;
  reason?: string;
  verb: string;
  kind: "look" | "window" | "settings" | "element" | "none";
  details: { label: string; value: string }[];
  reversible: boolean;
  risk: SharedRisk;
  holdToConfirm?: boolean;
  capabilities: string[];
  element?: { image: string; label?: string; capturedAgo?: string };
  taskList?: TaskItem[];
  source?: { client: string; kind: string; label: string };
}

export interface ApprovalRequest {
  id: string;
  origin: "mcp" | "ai" | "voice" | "browser";
  source: string;
  site?: string;
  createdMs: number;
  preview: ApprovalPreview;
}

/** The four card layouts (matching the claude-control variants). */
export type Variant = "click" | "delete" | "payment" | "send";

export interface CardModel {
  variant: Variant;
  question: string;
  reason: string;
  site: string;
  verb: string;
  deny: string;
  details: { label: string; value: string }[];
  warnings: string[];
  reversible: boolean;
  hold: boolean;
  capturedAgo: string;
  /** Payment: "$84.00" and "Amex ··1007". */
  amount?: string;
  cardHint?: string;
  /** Send: who and what. */
  recipient?: string;
  message?: string;
  /** Delete: "Review all 2,318". */
  review?: string;
  /** Click: the element replica. */
  element?: { label: string; look: ElementDescription["look"]; fields: { label: string; value: string }[]; title: string };
}

export function variantOf(c: Category): Variant {
  if (c === "delete") return "delete";
  if (c === "purchase") return "payment";
  if (c === "send") return "send";
  return "click";
}

const MONEY = /(?:[$€£]\s?\d[\d,]*(?:\.\d{2})?|\d[\d,]*(?:\.\d{2})?\s?(?:USD|EUR|GBP))/;

export function findAmount(texts: string[]): string | undefined {
  for (const t of texts) {
    const m = MONEY.exec(t);
    if (m) {
      const v = m[0].replace(/\s/g, "");
      return /\.\d{2}$/.test(v) || !/^[$€£]/.test(v) ? v : `${v}.00`;
    }
  }
  return undefined;
}

/** "Amex ··1007", "Visa ending 4242" → a short hint; never more than the last four digits. */
export function findCardHint(texts: string[]): string | undefined {
  for (const t of texts) {
    const m = /\b(visa|mastercard|amex|american express|discover|card)\b[^\d]{0,24}(\d{4})\b/i.exec(t);
    if (m) {
      const brand = m[1].toLowerCase() === "american express" ? "Amex" : m[1][0].toUpperCase() + m[1].slice(1).toLowerCase();
      return `${brand} ··${m[2]}`;
    }
  }
  return undefined;
}

export function agoText(ms: number, now: number): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  return s < 60 ? `${s}s ago` : `${Math.round(s / 60)} min ago`;
}

const titleCase = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** Builds the card from what the page agent described, right before acting. */
export function cardModel(p: PendingOk, now = Date.now()): CardModel {
  const d = p.desc;
  const decision: Decision = p.decision;
  const variant = variantOf(decision.category);
  const site = d.host.replace(/^www\./, "");
  const label = (d.target.text || d.target.label || "Continue").replace(/\s+/g, " ").trim().slice(0, 48);
  const notes = [...d.notes, d.context].filter(Boolean);
  const warnings = notes.filter((n) => /non[- ]refundable|cannot be undone|can't be undone|no[- ]show|fee\b|charged/i.test(n)).slice(0, 2);
  const base = { site, reason: decision.reason, capturedAgo: agoText(p.capturedAt, now), warnings };
  switch (variant) {
    case "payment": {
      const amount = findAmount([d.target.text, ...notes]);
      return {
        ...base,
        variant,
        question: amount ? `Pay ${amount} on ${site}?` : `${label} on ${site}?`,
        verb: amount ? `Pay ${amount}` : label,
        deny: "Deny",
        amount,
        cardHint: findCardHint(notes),
        details: d.fields.filter((f) => !/card|cvc|cvv|expiry|security/i.test(f.label)).slice(0, 4),
        reversible: false,
        hold: true,
      };
    }
    case "send": {
      const to = d.fields.find((f) => /^(to|recipient|send to)\b/i.test(f.label));
      const msg = [...d.fields].reverse().find((f) => f.value && f !== to && f.value.length > 3);
      return {
        ...base,
        variant,
        question: to?.value ? `Send this to ${to.value}?` : `Send this on ${site}?`,
        verb: titleCase(label || "Send"),
        deny: "Don't send",
        recipient: to?.value || d.title,
        message: msg?.value,
        details: [],
        reversible: false,
        hold: false,
      };
    }
    case "delete": {
      const count = /(\d[\d,]*)/.exec(label)?.[1];
      return {
        ...base,
        variant,
        question: `${titleCase(label)}?`,
        verb: titleCase(label),
        deny: "Deny",
        review: count ? `Review all ${count}` : undefined,
        details: d.fields.slice(0, 4),
        reversible: notes.some((n) => /bin|trash|restor|undo/i.test(n)),
        hold: !notes.some((n) => /bin|trash|restor|undo/i.test(n)),
      };
    }
    default:
      return {
        ...base,
        variant: "click",
        question: `${label} on ${site}?`,
        verb: label.split(" ")[0] === "Complete" ? label : titleCase(label),
        deny: "Deny",
        details: d.fields.slice(0, 6),
        reversible: false,
        hold: decision.category !== "click",
        element: { label, look: d.look, fields: d.fields.slice(0, 3), title: d.title },
      };
  }
}

/** The same request in the shared approval shape (for the Command thread, Dock pill, phone). */
export function toApprovalRequest(p: PendingOk, id: string, tasks: TaskItem[] = [], now = Date.now()): ApprovalRequest {
  const m = cardModel(p, now);
  return {
    id,
    origin: "browser",
    source: "Lens Browser",
    site: m.site,
    createdMs: p.capturedAt,
    preview: {
      question: m.question,
      reason: m.reason,
      verb: m.verb,
      kind: "element",
      details: [...(m.amount ? [{ label: "Amount", value: `${m.amount}${m.cardHint ? ` · ${m.cardHint}` : ""}` }] : []), ...(m.recipient ? [{ label: "To", value: m.recipient }] : []), ...m.details],
      reversible: m.reversible,
      risk: "confirm",
      holdToConfirm: m.hold,
      capabilities: [p.decision.category],
      element: m.element ? { image: "", label: m.element.label, capturedAgo: m.capturedAgo } : undefined,
      taskList: tasks,
      source: { client: "Lens Browser", kind: "browser", label: m.site },
    },
  };
}
