// "Do" mode in Lens Command: run a desktop command. Pure orchestration so it can be unit-tested
// (src/__tests__/commandDo.test.ts).
//
// Order matters: the offline intent engine (ai_intent → ai_run_intent) runs first and needs no
// model and no "Lens Intelligence" switch, so "dark mode" works with AI off. Only text the
// engine doesn't understand goes to the AI (ai_ask with tools), which does need AI on.
import type { Intent } from "../ai/contract";

export interface DoDeps {
  intent: (text: string) => Promise<Intent | null>;
  runIntent: (intent: Intent) => Promise<string>;
  ask: (text: string) => Promise<string>;
}

export type DoOutcome =
  | { kind: "none" }
  | { kind: "intent"; intent: Intent; reqId: string }
  | { kind: "ai"; reqId: string }
  | { kind: "error"; message: string; intent?: Intent };

/** `known`: the intent the preview already parsed for this text, if any (saves a round trip). */
export async function runDo(text: string, deps: DoDeps, known?: Intent | null): Promise<DoOutcome> {
  const t = text.trim();
  if (!t) return { kind: "none" };
  const intent = known ?? (await deps.intent(t).catch(() => null));
  if (intent) {
    try {
      return { kind: "intent", intent, reqId: await deps.runIntent(intent) };
    } catch (e) {
      return { kind: "error", message: errorText(e, "Lens couldn't run that."), intent };
    }
  }
  try {
    return { kind: "ai", reqId: await deps.ask(t) };
  } catch (e) {
    return { kind: "error", message: errorText(e, "Lens didn't recognise that, and AI is off. Turn it on in Settings › AI.") };
  }
}

function errorText(e: unknown, fallback: string): string {
  const s = typeof e === "string" ? e : e instanceof Error ? e.message : "";
  return s.trim() || fallback;
}

/** Results of a calculation or conversion arrive as text, so they need an answer card. */
export const answersInText = (intent: Intent) => intent.action === "calculate" || intent.action === "convert";
