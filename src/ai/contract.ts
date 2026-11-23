// Lens Intelligence — the fixed IPC contract (mirrors src-tauri/src/ai/mod.rs; see docs/AI.md).
//
// Field names are snake_case on the wire, exactly as the Rust types serialise them. Command
// *arguments* follow Tauri's usual camelCase conversion, so `ai_confirm_tool(call_id, approve)`
// is invoked as `{ callId, approve }` (src/ai/client.ts wraps all of this).
//
// This file has no runtime imports so it can be unit-tested and imported anywhere.

export type ProviderKind = "off" | "script" | "local" | "claude";
export type PrivacyMode = "local_only" | "ask_each_time" | "allow_cloud";
export type Risk = "low" | "confirm" | "blocked";

export interface ProviderInfo {
  id: string;
  kind: ProviderKind;
  label: string;
  available: boolean;
  model: string;
  /** True if nothing leaves this PC. */
  is_local: boolean;
  needs_key: boolean;
  has_key: boolean;
}

export interface AiStatus {
  providers: ProviderInfo[];
  /** "off" while Lens Intelligence is disabled, else the configured provider id. */
  active: string;
  privacy: PrivacyMode;
}

/** Stored as LensConfig.ai. Never contains API keys. */
export interface AiConfig {
  enabled: boolean;
  provider: "script" | "local" | "claude";
  privacy: PrivacyMode;
  allow_tools: boolean;
  claude_model: string;
  max_tokens: number;
  /** "" = auto-detect Ollama / LM Studio / llama.cpp on this PC; else a base URL ending in /v1. */
  local_endpoint: string;
  /** "" = first chat model the server lists. */
  local_model: string;
  /** Non-loopback hosts the user trusts (treated as cloud for the privacy mode). */
  local_allowed_hosts: string[];
  system_prompt: string;
  usage_log: boolean;
}

export const DEFAULT_AI_CONFIG: AiConfig = {
  enabled: false,
  provider: "script",
  privacy: "local_only",
  allow_tools: true,
  claude_model: "claude-sonnet-5-5",
  max_tokens: 1024,
  local_endpoint: "",
  local_model: "",
  local_allowed_hosts: [],
  system_prompt: "",
  usage_log: true,
};

/** Only attach what the user chose to share; every field is optional. */
export interface AiContext {
  selection?: string;
  clipboard?: string;
  window_title?: string;
  app_name?: string;
  files?: string[];
  url?: string;
  page_text?: string;
  /** Text collected on the Shelf; attached and privacy-gated like every other field. */
  shelf_text?: string;
}

export interface AiRequest {
  prompt: string;
  context: AiContext;
  /** Override the configured provider for this request ("script" | "local" | "claude"). */
  provider?: string;
  allow_tools: boolean;
}

export interface Intent {
  action: string;
  /** Flat arguments; `_tool` names the registry tool that would run it, when there is one. */
  args: Record<string, string | number | boolean>;
  confidence: number;
  summary: string;
}

export interface Usage {
  input_tokens: number;
  output_tokens: number;
}

export interface AiDeltaEvent {
  id: string;
  text: string;
}

export interface AiDoneEvent {
  id: string;
  provider: string;
  model: string;
  usage?: Usage;
  error?: string;
}

export interface AiToolProposalEvent {
  id: string;
  call_id: string;
  /** A registry tool, or "send_to_cloud" for the ask_each_time privacy consent. */
  tool: string;
  args: Record<string, unknown>;
  summary: string;
  risk: Risk;
}

export interface AiToolResultEvent {
  id: string;
  call_id: string;
  ok: boolean;
  message: string;
}

export const AI_EVENTS = {
  delta: "lens://ai/delta",
  done: "lens://ai/done",
  toolProposal: "lens://ai/tool-proposal",
  toolResult: "lens://ai/tool-result",
  /** Backend → UI: run a UI-layer action ({ tool, args }); see docs/AI.md "Apply bridge". */
  apply: "lens://ai/apply",
} as const;

export const AI_COMMANDS = [
  "ai_status",
  "ai_set_config",
  "ai_set_secret",
  "ai_clear_secret",
  "ai_ask",
  "ai_cancel",
  "ai_confirm_tool",
  "ai_intent",
  "ai_run_intent",
  "ai_usage_log",
] as const;

/** The consent pseudo-tool emitted in ask_each_time mode. */
export const CONSENT_TOOL = "send_to_cloud";

/** Registry tools and their risk (mirrors src-tauri/src/ai/tools.rs). */
export const AI_TOOLS: Record<string, Risk> = {
  launch_app: "low",
  focus_app: "low",
  close_app: "confirm",
  set_color_mode: "low",
  set_theme_pack: "low",
  set_accent: "low",
  snap_window: "low",
  arrange_windows: "low",
  show_desktop: "low",
  set_focus_mode: "low",
  set_dnd: "low",
  set_volume: "low",
  set_mute: "low",
  set_brightness: "low",
  set_night_light: "low",
  switch_workspace: "low",
  search_files: "low",
  start_timer: "low",
  open_settings_page: "low",
  create_note: "confirm",
  window_action: "low",
  move_window: "low",
  open_overview: "low",
  set_dock_style: "low",
  next_wallpaper: "low",
  set_wallpaper_scene: "low",
  set_calm_mode: "low",
  make_backdrop: "low",
  lock_screen: "confirm",
};

/** UI-layer actions the backend asks the frontend to perform via `lens://ai/apply`. */
export type AiApplyTool =
  | "set_color_mode"
  | "set_accent"
  | "set_focus_mode"
  | "show_desktop"
  | "start_timer"
  | "open_settings_page"
  | "note_saved"
  | "open_overview"
  | "set_dock_style"
  | "next_wallpaper"
  | "set_wallpaper_scene"
  | "set_calm_mode"
  | "make_backdrop";

export interface AiApplyPayload {
  tool: AiApplyTool;
  args: Record<string, unknown>;
}

// ---------------------------------------------------------------------------------------------
// Streaming state (pure; used by useAiRequest and testable without Tauri)
// ---------------------------------------------------------------------------------------------

export type AiRunStatus = "idle" | "running" | "waiting" | "done" | "error" | "cancelled";

export interface AiToolStep {
  call_id: string;
  tool: string;
  args: Record<string, unknown>;
  summary: string;
  risk: Risk;
  /** proposed → running/awaiting → ok | failed */
  state: "running" | "awaiting" | "ok" | "failed";
  message?: string;
}

export interface AiRunState {
  id: string | null;
  status: AiRunStatus;
  text: string;
  provider?: string;
  model?: string;
  usage?: Usage;
  error?: string;
  steps: AiToolStep[];
}

export const INITIAL_RUN: AiRunState = { id: null, status: "idle", text: "", steps: [] };

export type AiEvent =
  | { kind: "delta"; payload: AiDeltaEvent }
  | { kind: "done"; payload: AiDoneEvent }
  | { kind: "tool-proposal"; payload: AiToolProposalEvent }
  | { kind: "tool-result"; payload: AiToolResultEvent };

/** Applies one backend event to a run's state. Events for other requests are ignored. */
export function reduceAiEvent(s: AiRunState, ev: AiEvent): AiRunState {
  if (s.id !== null && ev.payload.id !== s.id) return s;
  switch (ev.kind) {
    case "delta":
      return {
        ...s,
        status: s.status === "waiting" || s.status === "idle" ? "running" : s.status,
        text: s.text + ev.payload.text,
      };
    case "tool-proposal": {
      const p = ev.payload;
      const awaiting = p.risk === "confirm";
      const step: AiToolStep = {
        call_id: p.call_id,
        tool: p.tool,
        args: p.args ?? {},
        summary: p.summary,
        risk: p.risk,
        state: awaiting ? "awaiting" : "running",
      };
      const steps = s.steps.some((x) => x.call_id === p.call_id)
        ? s.steps.map((x) => (x.call_id === p.call_id ? step : x))
        : [...s.steps, step];
      return { ...s, steps, status: awaiting ? "waiting" : "running" };
    }
    case "tool-result": {
      const r = ev.payload;
      const steps = s.steps.map((x) =>
        x.call_id === r.call_id ? { ...x, state: (r.ok ? "ok" : "failed") as AiToolStep["state"], message: r.message } : x,
      );
      const stillWaiting = steps.some((x) => x.state === "awaiting");
      return { ...s, steps, status: stillWaiting ? "waiting" : "running" };
    }
    case "done": {
      const d = ev.payload;
      const cancelled = d.error === "Cancelled.";
      return {
        ...s,
        status: d.error ? (cancelled ? "cancelled" : "error") : "done",
        provider: d.provider,
        model: d.model,
        usage: d.usage,
        error: d.error,
        steps: s.steps.map((x) => (x.state === "awaiting" || x.state === "running" ? { ...x, state: "failed" } : x)),
      };
    }
  }
}

/** True once a run can't change any more. */
export function isFinished(s: AiRunState): boolean {
  return s.status === "done" || s.status === "error" || s.status === "cancelled";
}

/** Steps waiting for the user's yes/no. */
export function pendingApprovals(s: AiRunState): AiToolStep[] {
  return s.steps.filter((x) => x.state === "awaiting");
}

/** A short label for where a provider runs, for badges ("On this PC" / "Cloud"). */
export function whereItRuns(p: Pick<ProviderInfo, "kind" | "is_local">): string {
  if (p.kind === "off") return "Off";
  return p.is_local ? "On this PC" : "Cloud";
}

/** Context field names in the order the backend lists them (for consent text). */
export function attachedFields(ctx: AiContext): (keyof AiContext)[] {
  const order: (keyof AiContext)[] = ["app_name", "window_title", "url", "selection", "clipboard", "files", "page_text", "shelf_text"];
  return order.filter((k) => {
    const v = ctx[k];
    return Array.isArray(v) ? v.length > 0 : typeof v === "string" && v.trim().length > 0;
  });
}
