// "Ask about this" on a Dashboard card (wave M2): the text handed to Ask is this card's own words
// and nothing else from the Dashboard. Ask shows it in the box first; nothing goes out until Enter.
import type { Card } from "./store";

const MAX = 1200;

export function askText(c: Pick<Card, "title" | "detail" | "source">): string {
  const lines = [`About this ${c.source} item:`, c.title.trim()];
  if (c.detail?.trim()) lines.push(c.detail.trim());
  return lines.join("\n").slice(0, MAX);
}
