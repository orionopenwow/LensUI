// The studio's actions bar: one chip per action with a number key, plus Ctrl shortcuts.
// Pure keyboard model so the flow is testable.

export type ActionId = "copy" | "copyText" | "save" | "pin" | "shelf" | "claude" | "ask" | "translate" | "share" | "openIn";

export interface ActionDef {
  id: ActionId;
  key: string;
  label: string;
  /** Shown in the custom tooltip (Lens never uses native title tooltips). */
  hint: string;
}

export const ACTIONS: ActionDef[] = [
  { id: "copy", key: "1", label: "Copy", hint: "Copy the image (Ctrl+C)" },
  { id: "copyText", key: "2", label: "Copy text", hint: "Copy the text Windows OCR found" },
  { id: "save", key: "3", label: "Save", hint: "Save a PNG to your snips folder (Ctrl+S)" },
  { id: "pin", key: "4", label: "Pin", hint: "Float it on top of your windows" },
  { id: "shelf", key: "5", label: "Shelf", hint: "Add the image and its text to your Shelf" },
  { id: "claude", key: "6", label: "Paste to Claude", hint: "Claude Desktop (you press Ctrl+V) or Lens Command" },
  { id: "ask", key: "7", label: "Ask", hint: "Ask a question about this snip in Lens Command" },
  { id: "translate", key: "8", label: "Translate", hint: "Translate the text in place" },
  { id: "share", key: "9", label: "Share", hint: "Open the Windows share sheet — you choose where it goes" },
  { id: "openIn", key: "0", label: "Send to…", hint: "Copy it and bring an app forward. You press Send yourself." },
];

export interface Availability {
  ocrReady: boolean;
  hasText: boolean;
  aiOn: boolean;
}

/** Why an action is unavailable, or null when it can run. */
export function disabledReason(id: ActionId, a: Availability): string | null {
  if (id === "copyText" || id === "translate") {
    if (!a.ocrReady) return "Reading text…";
    if (!a.hasText) return "No text found in this snip";
  }
  if (id === "translate" && !a.aiOn) return "Turn on Lens Intelligence to translate";
  return null;
}

export interface BarState {
  focus: number;
}

export type BarResult = { state: BarState; run?: ActionId; close?: boolean };

/** Keyboard handling for the bar. Number keys run directly; arrows move focus; Enter runs the focused chip. */
export function onKey(state: BarState, key: string, mods: { ctrl?: boolean; shift?: boolean }, a: Availability): BarResult {
  const n = ACTIONS.length;
  const can = (id: ActionId) => disabledReason(id, a) === null;
  if (mods.ctrl) {
    const k = key.toLowerCase();
    if (k === "c" && !mods.shift) return { state, run: "copy" };
    if (k === "c" && mods.shift && can("copyText")) return { state, run: "copyText" };
    if (k === "s") return { state, run: "save" };
    return { state };
  }
  if (key === "Escape") return { state, close: true };
  const byKey = ACTIONS.find((x) => x.key === key);
  if (byKey) return can(byKey.id) ? { state: { focus: ACTIONS.indexOf(byKey) }, run: byKey.id } : { state };
  if (key === "ArrowRight" || key === "ArrowLeft") {
    const dir = key === "ArrowRight" ? 1 : -1;
    let f = state.focus;
    for (let i = 0; i < n; i++) {
      f = (f + dir + n) % n;
      if (can(ACTIONS[f].id)) break;
    }
    return { state: { focus: f } };
  }
  if (key === "Home") return { state: { focus: 0 } };
  if (key === "End") return { state: { focus: n - 1 } };
  if (key === "Enter") {
    const id = ACTIONS[state.focus]?.id;
    return id && can(id) ? { state, run: id } : { state };
  }
  return { state };
}

/** The after-capture setting decides which action is focused when the studio opens. */
export function initialFocus(after: string): number {
  const map: Record<string, ActionId> = { copy: "copy", save: "save", pin: "pin", shelf: "shelf" };
  const id = map[after];
  return id ? ACTIONS.findIndex((x) => x.id === id) : 0;
}
