// Who gets a key press in the studio (B-118). The studio listens on the window so its shortcuts
// work wherever focus is, but a focused control must keep its own keys: Enter or Space on a
// toolbar button presses that button and nothing else, a text field keeps every key, and a
// drop-down keeps its letters, digits and arrows.

export interface KeyTarget {
  /** Upper-case tag name. */
  tag: string;
  /** For INPUT: its type. */
  type?: string;
  editable?: boolean;
}

const TEXT_TYPES = new Set(["", "text", "search", "url", "email", "tel", "password", "number"]);

/** "native": leave the key to the focused control. "studio": the studio's shortcuts may use it. */
export function routeKey(t: KeyTarget | null, key: string, mods: { ctrl?: boolean; alt?: boolean } = {}): "native" | "studio" {
  if (!t) return "studio";
  const tag = t.tag.toUpperCase();
  if (t.editable || tag === "TEXTAREA" || (tag === "INPUT" && TEXT_TYPES.has((t.type ?? "").toLowerCase()))) return "native";
  if (tag === "SELECT") return mods.ctrl ? "studio" : "native";
  const activates = key === "Enter" || key === " " || key === "Spacebar";
  if ((tag === "BUTTON" || tag === "A" || tag === "SUMMARY") && activates) return "native";
  // Checkboxes, radios and sliders: Space (and arrows on a slider) are theirs.
  if (tag === "INPUT") {
    const type = (t.type ?? "").toLowerCase();
    if (activates && key !== "Enter") return "native";
    if (type === "range" && key.startsWith("Arrow")) return "native";
  }
  return "studio";
}

export function keyTargetOf(el: EventTarget | null): KeyTarget | null {
  const e = el as (HTMLElement & { type?: string }) | null;
  if (!e || typeof e.tagName !== "string") return null;
  return { tag: e.tagName, type: e.type, editable: e.isContentEditable === true };
}
