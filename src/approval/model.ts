// "Needs your OK": the shared approval model used by the Command thread, Mini, the Dock popover,
// the voice HUD and the standalone approval window. Pure (no React, no Tauri) so it is unit-tested.
import { packById, lighten } from "../themes/packs";

export type Risk = "low" | "confirm" | "blocked";
export type Level = "allowed" | "ask" | "blocked";

export interface TaskItem {
  id: string;
  label: string;
  level: Level;
  used: boolean;
}

/** The look values the mini preview understands (see control::tools LOOK_KEYS). */
export interface LookState {
  pack?: string | null;
  accent?: string | null;
  accentMode?: string | null;
  surface?: string | null;
  radius?: number | null;
  opacity?: number | null;
  dockStyle?: string | null;
  dim?: number | null;
  magnification?: string | null;
}

export interface ApprovalPreview {
  question: string;
  reason?: string;
  verb: string;
  kind: "look" | "window" | "settings" | "element" | "none";
  details: { label: string; value: string }[];
  reversible: boolean;
  risk: Risk;
  holdToConfirm?: boolean;
  capabilities: string[];
  look?: { before: LookState; after: LookState };
  window?: { hwnd: number; title: string; app: string; thumbnail?: string | null };
  /** A capture of the page element the browser agent will act on. */
  element?: { image: string; label?: string; capturedAgo?: string };
  taskList?: TaskItem[];
  source?: { client: string; kind: string; label: string };
}

export interface ApprovalRequest {
  id: string;
  origin: "mcp" | "ai" | "voice" | "browser";
  /** Client or app name ("Claude Desktop", "Lens assistant", a site). */
  source: string;
  /** A website the action is on, when there is one. */
  site?: string;
  createdMs: number;
  preview: ApprovalPreview;
}

export type Phase = "pending" | "holding" | "working" | "done" | "denied" | "failed";

export interface CardState {
  phase: Phase;
  collapsed: boolean;
  /** Hold progress 0..1. */
  progress: number;
  message?: string;
}

export type CardEvent =
  | { type: "hold-start" }
  | { type: "hold-progress"; p: number }
  | { type: "hold-cancel" }
  | { type: "approve" }
  | { type: "deny" }
  | { type: "result"; ok: boolean; message?: string }
  | { type: "toggle-collapse" };

export const HOLD_MS = 900;

export const initialCard = (collapsed = false): CardState => ({ phase: "pending", collapsed, progress: 0 });

export function cardReducer(s: CardState, e: CardEvent): CardState {
  const open = s.phase === "pending" || s.phase === "holding";
  switch (e.type) {
    case "toggle-collapse":
      return { ...s, collapsed: !s.collapsed };
    case "hold-start":
      return open ? { ...s, phase: "holding", progress: 0 } : s;
    case "hold-progress":
      return s.phase === "holding" ? { ...s, progress: Math.max(0, Math.min(1, e.p)) } : s;
    case "hold-cancel":
      return s.phase === "holding" ? { ...s, phase: "pending", progress: 0 } : s;
    case "approve":
      return open ? { ...s, phase: "working", progress: 1 } : s;
    case "deny":
      return open ? { ...s, phase: "denied", progress: 0, message: "You said no. Nothing changed." } : s;
    case "result":
      return s.phase === "working" ? { ...s, phase: e.ok ? "done" : "failed", message: e.message } : s;
  }
}

/** Hold-to-confirm preference: "confirm" (risky items only, default), "always" or "never". */
export type HoldPref = "confirm" | "always" | "never";

export function needsHold(p: ApprovalPreview, pref: HoldPref = "confirm"): boolean {
  if (p.risk === "blocked") return false;
  if (pref === "always") return true;
  if (pref === "never") return false;
  return p.risk === "confirm" || p.holdToConfirm === true || !p.reversible;
}

export function pendingLabel(n: number): string {
  if (n <= 0) return "";
  return n === 1 ? "Approve 1 action" : `Approve ${n} actions`;
}

/** Used capabilities first, then what still asks, then the rest. */
export function orderTaskList(list: TaskItem[] = []): TaskItem[] {
  const rank = (t: TaskItem) => (t.used ? 0 : 3) + (t.level === "ask" ? 0 : t.level === "allowed" ? 1 : 2);
  return [...list].sort((a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label));
}

/** Ask-first capabilities this request uses (what "Allow for this session" would grant). */
export function sessionGrantable(list: TaskItem[] = []): string[] {
  return list.filter((t) => t.used && t.level === "ask" && t.id !== "destructive").map((t) => t.id);
}

export function reversibilityLine(p: ApprovalPreview): string {
  return p.reversible ? "Undo available" : "Can't be undone";
}

export function agoLabel(ms: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
}

/** A card for requests without a Lens Control preview (legacy tools, natural-language requests). */
export function fallbackPreview(text: string, client: string, risk: Risk = "confirm"): ApprovalPreview {
  const q = text.trim().replace(/[.?!]*$/, "");
  return {
    question: `${q || "Do this"}?`,
    reason: `${client || "An AI app"} asked Lens to do this.`,
    verb: "Allow",
    kind: "none",
    details: [],
    reversible: risk !== "confirm",
    risk,
    holdToConfirm: risk === "confirm",
    capabilities: [],
  };
}

/** Pending MCP action (list_mcp_actions_cmd) → request. */
export function fromPendingAction(
  a: { id: string; tool: string; text: string; client: string; createdMs: number },
  preview?: ApprovalPreview | null
): ApprovalRequest {
  return {
    id: a.id,
    origin: "mcp",
    source: preview?.source?.label ?? (a.client || "AI app"),
    createdMs: a.createdMs,
    preview: preview ?? fallbackPreview(a.text, a.client),
  };
}

/** CSS variables that paint a mini preview in `state`'s theme, scoped to the preview element. */
export function lookTokens(state: LookState, fallbackAccent = "#fafafa"): Record<string, string> {
  const pack = packById(state.pack ?? undefined);
  const light = pack?.scheme === "light";
  const base = (state.surface && /^#[0-9a-f]{6}$/i.test(state.surface) ? state.surface : pack?.base) ?? "#08080b";
  const hex = (v?: string | null) => (v && /^#[0-9a-f]{6}$/i.test(v) ? v : null);
  const accent =
    (state.accentMode === "custom" ? hex(state.accent) : null) ?? hex(pack?.accent) ?? hex(state.accent) ?? fallbackAccent;
  const radius = Math.max(0, Math.min(20, Number(state.radius ?? pack?.radius ?? 8)));
  return {
    "--lens-pack-base": base,
    "--lens-pack-elevated": light ? "#ffffff" : lighten(base, 0.045),
    "--lens-accent": accent,
    "--lens-radius": `${radius}px`,
    "--lens-ink": light ? "0 0 0" : "255 255 255",
    "--lp-fg": light ? "#18181b" : "#fafafa",
    "--lp-dim": String(Math.max(0, Math.min(40, Number(state.dim ?? 0))) / 100),
  };
}

/** Plain words for the look values that differ (for screen readers and the details line). */
export function lookDiff(before: LookState, after: LookState): string[] {
  const out: string[] = [];
  const name = (id?: string | null) => packById(id ?? undefined)?.label ?? id ?? "";
  if (before.pack !== after.pack) out.push(`Theme: ${name(before.pack)} → ${name(after.pack)}`);
  if (before.dockStyle !== after.dockStyle) out.push(`Dock: ${before.dockStyle ?? "?"} → ${after.dockStyle ?? "?"}`);
  if (before.accent !== after.accent && after.accentMode !== "windows") out.push(`Accent: ${before.accent ?? "?"} → ${after.accent ?? "?"}`);
  if (before.radius !== after.radius) out.push(`Roundness: ${before.radius ?? "?"} → ${after.radius ?? "?"} px`);
  if (before.dim !== after.dim) out.push(`Dim inactive windows: ${before.dim ?? 0} → ${after.dim ?? 0} %`);
  return out;
}
