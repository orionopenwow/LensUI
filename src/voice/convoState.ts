// Conversation mode: spoken Q&A in a large panel or full screen. Pure state and helpers, so
// the word-by-word reveal, timers and captions are unit-tested.

export type ConvStatus = "idle" | "listening" | "thinking" | "speaking";

export interface ConvState {
  open: boolean;
  status: ConvStatus;
  /** When the conversation opened (ms, from the caller's clock). */
  startedAt: number;
  question: string;
  answer: string;
  /** Index of the word being spoken; -1 before speech; Infinity when the whole answer is out. */
  spokenWord: number;
  /** Speech progress comes from Windows (true) or is estimated (false). */
  synced: boolean;
  caption: string;
  muted: boolean;
  aiRequest: string | null;
}

export const INITIAL_CONV: ConvState = {
  open: false,
  status: "idle",
  startedAt: 0,
  question: "",
  answer: "",
  spokenWord: -1,
  synced: false,
  caption: "",
  muted: false,
  aiRequest: null,
};

export type ConvAction =
  | { kind: "open"; at: number }
  | { kind: "close" }
  | { kind: "listening" }
  | { kind: "muted"; muted: boolean }
  | { kind: "question"; text: string }
  | { kind: "request"; id: string }
  | { kind: "delta"; id: string; text: string }
  | { kind: "caption"; text: string }
  | { kind: "answered"; id: string; error?: string }
  | { kind: "speaking" }
  | { kind: "word"; word: number; synced: boolean }
  | { kind: "spoken"; interrupted: boolean }
  | { kind: "say"; text: string };

export function reduceConv(s: ConvState, a: ConvAction): ConvState {
  switch (a.kind) {
    case "open":
      return s.open ? s : { ...INITIAL_CONV, open: true, startedAt: a.at, status: "listening", muted: s.muted };
    case "close":
      return { ...INITIAL_CONV, muted: s.muted };
    case "listening":
      return { ...s, status: s.status === "speaking" ? "listening" : s.status === "thinking" ? s.status : "listening" };
    case "muted":
      return { ...s, muted: a.muted };
    case "question":
      return { ...s, question: a.text, answer: "", caption: "", spokenWord: -1, synced: false, status: "thinking", aiRequest: null };
    case "request":
      return { ...s, aiRequest: a.id, status: "thinking" };
    case "delta":
      return a.id === s.aiRequest ? { ...s, answer: s.answer + a.text } : s;
    case "caption":
      return { ...s, caption: a.text };
    case "answered":
      if (a.id !== s.aiRequest) return s;
      return a.error && !s.answer ? { ...s, answer: a.error, status: "speaking", spokenWord: -1 } : { ...s, status: s.answer ? "speaking" : "idle", spokenWord: -1 };
    case "say":
      // A spoken line that isn't an AI answer (a command result, "I'm listening").
      return { ...s, answer: a.text, status: "speaking", spokenWord: -1, synced: false };
    case "speaking":
      return { ...s, status: "speaking" };
    case "word":
      return { ...s, spokenWord: Math.max(s.spokenWord, a.word), synced: s.synced || a.synced };
    case "spoken":
      // Finished: everything is "said". Interrupted (barge-in): keep what was heard, listen.
      return { ...s, spokenWord: a.interrupted ? s.spokenWord : Number.POSITIVE_INFINITY, status: a.interrupted ? "listening" : "idle" };
  }
}

export interface Word {
  text: string;
  /** Trailing whitespace, kept so the paragraph wraps naturally. */
  space: string;
}

/** Whitespace-separated words, matching the backend's word index. */
export function words(text: string): Word[] {
  const out: Word[] = [];
  const re = /(\S+)(\s*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push({ text: m[1], space: m[2] });
  return out;
}

/** Which words are bright: those already spoken, including the one being spoken. */
export function isSpoken(i: number, spokenWord: number, reducedMotion: boolean): boolean {
  if (reducedMotion) return true; // no progressive reveal
  return i <= spokenWord;
}

/** Estimated ms per word when Windows speech doesn't report progress (≈170 wpm, longer words slower). */
export function estimateWordMs(word: string): number {
  return 260 + Math.min(12, word.length) * 22 + (/[.!?]$/.test(word) ? 220 : /[,;:]$/.test(word) ? 120 : 0);
}

/** "1:01" */
export function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function statusLabel(s: ConvState): string {
  if (s.muted && s.status !== "speaking") return "Mic muted";
  switch (s.status) {
    case "speaking":
      return "Lens is speaking";
    case "thinking":
      return "Lens is thinking";
    case "listening":
      return "Listening";
    default:
      return "Ready";
  }
}

/** The monospace source line under the answer. */
export function captionFrom(info: { tool?: string; summary?: string; source?: string; provider?: string; model?: string }): string {
  if (info.source) return `Reading ${info.source}…`;
  if (info.summary) return `${info.summary.replace(/\.$/, "")}…`;
  if (info.provider === "claude") return `Answered by Claude${info.model ? ` · ${info.model}` : ""}`;
  if (info.provider === "local") return `Answered on this PC${info.model ? ` · ${info.model}` : ""}`;
  if (info.provider === "script") return "Answered on this PC";
  return "";
}

/** Bar heights (0..1) for the aurora: mic levels while listening, a speech-shaped envelope
 * while speaking, a calm low band otherwise. `t` is seconds. */
export function auroraBars(n: number, status: ConvStatus, levels: number[], t: number, reducedMotion: boolean): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const x = i / Math.max(1, n - 1);
    const centre = Math.exp(-Math.pow((x - 0.5) / 0.32, 2)); // louder in the middle
    let v: number;
    if (reducedMotion) v = 0.18 + 0.22 * centre;
    else if (status === "listening") {
      const l = levels.length ? levels[Math.floor(x * (levels.length - 1))] : 0;
      v = 0.08 + centre * (0.15 + 0.85 * l) * (0.75 + 0.25 * Math.sin(i * 1.7 + t * 6));
    } else if (status === "speaking") {
      const syll = 0.5 + 0.5 * Math.sin(t * 9 + i * 0.35) * Math.sin(t * 3.1 + i * 0.9);
      v = 0.1 + centre * (0.25 + 0.75 * syll);
    } else if (status === "thinking") v = 0.1 + 0.2 * centre * (0.6 + 0.4 * Math.sin(t * 2 + i * 0.25));
    else v = 0.08 + 0.12 * centre;
    out.push(Math.max(0, Math.min(1, v)));
  }
  return out;
}
