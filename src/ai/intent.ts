/**
 * Pure routing for the palette and Dock "Ask" field: decide whether a query is a command (ask the backend's
 * ai_intent for a one-key "Do it"), a question (offer "Ask AI"), or neither (normal search only).
 */
import type { AiIntent } from "./surfaceApi";

export type QueryRoute =
  /** "ai: …", "/ask …", "@ai …": go straight to the Ask panel; hide normal results. */
  | { kind: "ask-exclusive"; prompt: string }
  /** Imperative phrasing ("turn on night light", "move spotify to workspace 2"): try ai_intent first. */
  | { kind: "command"; text: string }
  /** Question phrasing ("why is…", "how do I…", ends with "?"): show "Ask AI" near the top. */
  | { kind: "question"; prompt: string }
  /** Anything else of 3+ words: "Ask AI" goes to the bottom, above web search. */
  | { kind: "maybe"; prompt: string }
  | { kind: "none" };

const ASK_PREFIX = /^(?:ai:|ask:|\/ask\b|@ai\b|@claude\b)\s*/i;

const COMMAND_VERBS = [
  "open", "launch", "start", "close", "quit", "kill", "end", "turn", "switch", "set", "change", "make",
  "enable", "disable", "toggle", "mute", "unmute", "play", "pause", "resume", "skip", "next", "previous",
  "move", "send", "snap", "tile", "maximize", "maximise", "minimize", "minimise", "hide", "show", "lock",
  "dim", "brighten", "increase", "decrease", "raise", "lower", "volume", "brightness", "remind", "schedule",
  "rename", "pin", "unpin", "focus", "go", "take", "screenshot", "record", "empty", "restart", "sleep",
];

const QUESTION_WORDS = [
  "what", "why", "how", "who", "when", "where", "which", "is", "are", "can", "could", "should", "would",
  "does", "do", "did", "explain", "summarise", "summarize", "translate", "write", "draft", "rewrite",
  "fix", "help", "tell", "compare", "describe", "define",
];

/**
 * Prefixes owned by other palette features. Never route these to AI:
 * ">" shell, "?" web search, "=" calculator.
 */
const RESERVED = /^[>?=]/;

export function routeQuery(raw: string): QueryRoute {
  const q = raw.trim();
  if (!q || RESERVED.test(q)) return { kind: "none" };
  const pre = q.match(ASK_PREFIX);
  if (pre) return { kind: "ask-exclusive", prompt: q.slice(pre[0].length).trim() };

  const lower = q.toLowerCase();
  const tokens = lower.split(/\s+/);
  const first = tokens[0].replace(/[^a-z]/g, "");

  if (q.endsWith("?") || (QUESTION_WORDS.includes(first) && tokens.length >= 3)) return { kind: "question", prompt: q };
  // Two words are enough for a command ("mute volume", "lock pc"); one word is just a search.
  if (COMMAND_VERBS.includes(first) && tokens.length >= 2) return { kind: "command", text: q };
  if (tokens.length >= 3) return { kind: "maybe", prompt: q };
  return { kind: "none" };
}

/** Intents below this confidence are shown as a suggestion that needs Enter twice, never one-key. */
export const INTENT_CONFIRM_THRESHOLD = 0.75;
/** Intents below this are ignored and the query falls back to "Ask AI". */
export const INTENT_MIN = 0.4;

/** Actions that change or remove something get a second-Enter confirmation even at high confidence. */
const RISKY_ACTION = /(close|quit|kill|end|delete|remove|empty|restart|shutdown|shut_down|sleep|lock|uninstall|send)/i;

export interface IntentDecision {
  show: boolean;
  /** Needs a second Enter (or a click on "Do it") before running. */
  confirm: boolean;
  title: string;
  subtitle: string;
}

export function decideIntent(intent: AiIntent | null | undefined): IntentDecision {
  if (!intent || !intent.action || intent.confidence < INTENT_MIN)
    return { show: false, confirm: false, title: "", subtitle: "" };
  const risky = RISKY_ACTION.test(intent.action);
  const confirm = risky || intent.confidence < INTENT_CONFIRM_THRESHOLD;
  const pct = Math.round(intent.confidence * 100);
  return {
    show: true,
    confirm,
    title: intent.summary || intent.action,
    subtitle: confirm
      ? `AI action · ${pct}% sure · Enter twice to run`
      : `AI action · Enter to run`,
  };
}
