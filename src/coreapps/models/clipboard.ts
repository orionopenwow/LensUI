// Lens Clipboard: grouping and filtering over the existing clipboard history. Pure.
import type { ClipKind, ClipView } from "../../types/generated";

export type ClipFilter = "all" | "pinned" | ClipKind;

export function filterClips(list: ClipView[], f: ClipFilter): ClipView[] {
  if (f === "all") return list;
  if (f === "pinned") return list.filter((c) => c.pinned);
  return list.filter((c) => c.kind === f);
}

/** Pinned first, then Today / Yesterday / Earlier this week / Older. */
export function groupClips(list: ClipView[], now = Date.now()): { label: string; items: ClipView[] }[] {
  const d0 = new Date(now);
  d0.setHours(0, 0, 0, 0);
  const today = d0.getTime();
  const bucket = (c: ClipView) => (c.pinned ? "Pinned" : c.tsMs >= today ? "Today" : c.tsMs >= today - 86_400_000 ? "Yesterday" : c.tsMs >= today - 6 * 86_400_000 ? "Earlier this week" : "Older");
  const order = ["Pinned", "Today", "Yesterday", "Earlier this week", "Older"];
  const groups = new Map<string, ClipView[]>();
  for (const c of [...list].sort((a, b) => b.tsMs - a.tsMs)) {
    const k = bucket(c);
    groups.set(k, [...(groups.get(k) ?? []), c]);
  }
  return order.filter((k) => groups.has(k)).map((label) => ({ label, items: groups.get(label)! }));
}

export const KIND_LABEL: Record<ClipKind, string> = { text: "Text", link: "Link", image: "Image", files: "Files" };
