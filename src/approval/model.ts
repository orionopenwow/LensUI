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
  /** One-line principle ("Every payment waits"). */
  principle?: string | null;
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
  kind: "look" | "window" | "settings" | "element" | "delete" | "payment" | "send" | "none";
  details: { label: string; value: string }[];
  reversible: boolean;
  risk: Risk;
  holdToConfirm?: boolean;
  capabilities: string[];
  look?: { before: LookState; after: LookState };
  window?: { hwnd: number; title: string; app: string; thumbnail?: string | null };
  /** A capture of the page element the browser agent will act on. */
  element?: { image: string; label?: string; capturedAgo?: string; siteLabel?: string };
  /** Bulk delete / change: always to a recoverable bin. Details hold Includes/Keeping/Account/Recovery. */
  bulk?: { count: number; reviewLabel?: string };
  /** Money: shown big, monospace; method is masked (never a card number). */
  payment?: { amount: string; method: string; note?: string; warning?: string };
  /** A message in the user's name, shown exactly. */
  send?: { to: string; app: string; message: string };
  /** "Approve similar actions for this task": what would be trusted. Never on send, pay or delete. */
  similar?: { capability: string; site: string; label: string };
  /** Label for the deny button ("Deny", "Don't send"). */
  denyLabel?: string;
  /** "trusted" = known source (green dot); "danger" = irreversible or money (red dot). */
  tone?: "trusted" | "danger" | "neutral";
  taskList?: TaskItem[];
  source?: { client: string; kind: string; label: string };
  /** Why the agent-safety gate made this wait (chips on the card). */
  safetyReasons?: SafetyReasonLike[];
  /** Hide the "Undo available" line: sending or running something has no undo to offer. */
  noUndoLine?: boolean;
}

/** One reason from the agent-safety gate (`agentsafe::Reason`). */
export interface SafetyReasonLike {
  code: string;
  severity: string;
  detail: string;
}

export interface ApprovalRequest {
  id: string;
  origin: "mcp" | "ai" | "voice" | "browser" | "bridge" | "app";
  /** For requests raised inside Lens: the id their owner knows them by (assistant call id,
   *  bridge message id, Lens Apps popover). */
  reference?: string;
  /** Bridge requests that asked for the clipboard: the click that approves reads it. */
  wantsClipboard?: boolean;
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
  // Money always needs a hold, whatever the preference.
  if (p.kind === "payment") return true;
  if (pref === "always") return true;
  // The card itself is the check for messages and recoverable deletes: one press, shown exactly.
  if ((p.kind === "send" || p.kind === "delete") && pref === "confirm") return false;
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

/** A queue record as `list_mcp_actions_cmd` returns it (win_mcp::PendingAction). */
export interface PendingActionLike {
  id: string;
  /** "nl" | "tool" for MCP clients; "ai" | "bridge" | "app" for requests raised inside Lens. */
  kind?: string;
  tool: string;
  args?: unknown;
  text: string;
  client: string;
  createdMs: number;
  status?: string;
  reference?: string;
  preview?: ApprovalPreview | null;
}

const LOCAL_ORIGIN: Record<string, ApprovalRequest["origin"]> = { ai: "ai", bridge: "bridge", app: "app" };

export const isLocalKind = (kind?: string): boolean => !!kind && kind in LOCAL_ORIGIN;

/** Pending action (list_mcp_actions_cmd) → request. Requests raised inside Lens carry their own
 *  card; MCP requests get the Lens Control preview passed in (or the fallback card). */
export function fromPendingAction(a: PendingActionLike, preview?: ApprovalPreview | null): ApprovalRequest {
  const own = a.preview && typeof a.preview === "object" && typeof a.preview.question === "string" ? a.preview : null;
  const pv = own ?? preview ?? null;
  const local = isLocalKind(a.kind);
  const args = a.args && typeof a.args === "object" ? (a.args as Record<string, unknown>) : {};
  return {
    id: a.id,
    origin: local ? LOCAL_ORIGIN[a.kind as string] : "mcp",
    source: pv?.source?.label ?? (a.client || (local ? "Lens" : "AI app")),
    createdMs: a.createdMs,
    preview: pv ?? fallbackPreview(a.text, a.client || (local ? "Lens" : ""), local ? "low" : "confirm"),
    ...(a.reference ? { reference: a.reference } : {}),
    ...(a.kind === "bridge" && args.useClipboard === true ? { wantsClipboard: true } : {}),
  };
}

/** The card for a step the assistant proposed (Lens Command, the AI dock, voice) before, or
 *  without, its queue record: same shape, so the surface never draws its own dialog. */
export function requestForProposal(
  p: { call_id: string; tool: string; args?: Record<string, unknown>; summary: string; risk: string; safety?: SafetyReasonLike[] },
  now = Date.now()
): ApprovalRequest {
  const q = (p.summary || p.tool).trim().replace(/[.?!]*$/, "");
  const consent = p.tool === "send_to_cloud";
  const details = Object.entries(p.args ?? {})
    .filter(([k]) => !consent || k === "label" || k === "model")
    .slice(0, 4)
    .map(([k, v]) => ({ label: k, value: typeof v === "string" ? v : JSON.stringify(v) }));
  const safety = (p.safety ?? []).filter((r) => r && typeof r.detail === "string");
  return {
    id: `proposal-${p.call_id}`,
    origin: "ai",
    source: "Lens",
    reference: p.call_id,
    createdMs: now,
    preview: {
      question: `${q}?`,
      verb: consent ? "Send" : "Allow",
      ...(consent ? { denyLabel: "Don't send", noUndoLine: true } : {}),
      kind: "none",
      details,
      reversible: true,
      risk: p.risk === "blocked" ? "blocked" : "low",
      holdToConfirm: false,
      capabilities: [],
      source: { client: "internal", kind: "internal", label: "Lens" },
      ...(safety.length ? { safetyReasons: safety } : {}),
    },
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

/** Status dot colour: red for irreversible or money, green for a known source, else neutral. */
export function toneOf(p: ApprovalPreview): "trusted" | "danger" | "neutral" {
  if (p.tone) return p.tone;
  if (p.kind === "payment" || !p.reversible || p.risk === "blocked") return "danger";
  if (p.source || p.kind === "look" || p.kind === "settings") return "trusted";
  return "neutral";
}

/** Exact verb with its number for the primary button ("Delete 2,315", "Pay $84.00"). */
export function primaryLabel(p: ApprovalPreview): string {
  if (p.kind === "delete" && p.bulk) return `${p.verb} ${p.bulk.count.toLocaleString("en-US")}`;
  if (p.kind === "payment" && p.payment) return `${p.verb} ${p.payment.amount}`;
  return p.verb;
}

export function denyLabel(p: ApprovalPreview): string {
  return p.denyLabel ?? (p.kind === "send" ? "Don't send" : "Deny");
}

/** Principles shown in "This task can" when the server didn't send them. */
export const PRINCIPLES: Record<string, string> = {
  delete_to_bin: "Deletions go to the Bin",
  payments: "Every payment waits",
  send_messages: "Nothing sent in your name",
  type_text: "Shows you where it'll click",
};

export type TrustSpan = "run" | "day" | "always";

export const TRUST_SPANS: { id: TrustSpan; label: string }[] = [
  { id: "run", label: "This run" },
  { id: "day", label: "1 day" },
  { id: "always", label: "Always" },
];

const NEVER_SIMILAR = new Set(["send_messages", "payments", "delete_to_bin", "destructive"]);

/** Offer "Approve similar actions for this task"? Never for send, pay, delete or confirm-risk items. */
export function canApproveSimilar(p: ApprovalPreview): boolean {
  if (!p.similar || !p.similar.label) return false;
  if (p.kind === "send" || p.kind === "payment" || p.kind === "delete") return false;
  if (p.risk !== "low") return false;
  return !NEVER_SIMILAR.has(p.similar.capability) && !p.capabilities.some((c) => NEVER_SIMILAR.has(c));
}

/** An honest "can't access that" result from Lens Control (no source). */
export interface NoAccess {
  access: "none";
  source: null;
  reason: string;
}

export function isNoAccess(v: unknown): v is NoAccess {
  return !!v && typeof v === "object" && (v as NoAccess).access === "none" && (v as NoAccess).source === null;
}

export interface SiteTrust {
  id: string;
  client: string;
  capability: string;
  site: string;
  label: string;
  span: TrustSpan;
  createdMs: number;
  expiresMs: number | null;
}

export function trustExpiryLabel(t: Pick<SiteTrust, "span" | "expiresMs">, now = Date.now()): string {
  if (t.span === "run") return "This run";
  if (t.span === "always" || t.expiresMs == null) return "Always";
  const h = Math.max(0, Math.round((t.expiresMs - now) / 3_600_000));
  return h <= 0 ? "Expiring" : `${h} h left`;
}
