// Shelf → Notes sheet logic (docs/plans/MAGIC_WAVES.md §4, wave M4). Pure pieces the sheet and
// its tests share. Nothing here sends or saves; the sheet calls the commands after the person acts.
import type { Conversation } from "../types/generated";

/** Conversations a note can be sent to: Matrix rooms that offer replies. Every other messenger
 *  runs as its own web app, which Lens only reads a badge from and never writes to. */
export function sendableContacts(list: Conversation[]): Conversation[] {
  return list.filter((c) => c.source === "matrix" && c.canReply);
}

/** Messages have a size limit; a note sent as a message is its plain text, clipped with a pointer
 *  to the full note. */
export const MESSAGE_MAX = 4000;
export function messageText(plain: string): string {
  const t = plain.trim();
  return t.length <= MESSAGE_MAX ? t : `${t.slice(0, MESSAGE_MAX - 40).trimEnd()}\n\n… (the full note is in Lens Notes)`;
}

/** The two-step send: register the exact text (Lens shows it on the approval card), the person
 *  holds Send, then it goes once. Each step is a function so tests can check the order. */
export interface SendSteps {
  request: (conversation: string, text: string) => Promise<{ approvalId: string; text: string }>;
  approve: (approvalId: string) => Promise<unknown>;
  deny: (approvalId: string) => Promise<unknown>;
  send: (approvalId: string) => Promise<unknown>;
}

export type SendState =
  | { stage: "idle" }
  | { stage: "awaiting"; approvalId: string; text: string; conversation: string }
  | { stage: "sent" }
  | { stage: "cancelled" }
  | { stage: "failed"; error: string };

export async function startSend(steps: SendSteps, conversation: string, plain: string): Promise<SendState> {
  try {
    const r = await steps.request(conversation, messageText(plain));
    return { stage: "awaiting", approvalId: r.approvalId, text: r.text, conversation };
  } catch (e) {
    return { stage: "failed", error: String(e) };
  }
}

/** Only an "awaiting" send can be approved, and only by an explicit choice. */
export async function finishSend(steps: SendSteps, s: SendState, approved: boolean): Promise<SendState> {
  if (s.stage !== "awaiting") return s;
  try {
    if (!approved) {
      await steps.deny(s.approvalId);
      return { stage: "cancelled" };
    }
    await steps.approve(s.approvalId);
    await steps.send(s.approvalId);
    return { stage: "sent" };
  } catch (e) {
    return { stage: "failed", error: String(e) };
  }
}

/** What goes into the note: the ticked items when any are ticked, otherwise the whole shelf. */
export function noteSource<T extends { id: string }>(items: readonly T[], picked: ReadonlySet<string>): T[] {
  const chosen = items.filter((i) => picked.has(i.id));
  return chosen.length ? chosen : [...items];
}
