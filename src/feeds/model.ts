// Lens Feeds — pure UI model: source metadata, filters, time labels, voice intents, and the
// deck layout. No Tauri imports, so everything here is unit-tested (src/__tests__/feeds.test.ts).
import type { ItemDto, SourceView, TimelineDto } from "../types/generated";

export type { ItemDto, SourceView, TimelineDto };
export type FilterId = "all" | "people" | "news" | "video" | "dev";

export const FILTERS: { id: FilterId; label: string }[] = [
  { id: "all", label: "All" },
  { id: "people", label: "People" },
  { id: "news", label: "News" },
  { id: "video", label: "Video" },
  { id: "dev", label: "Dev" },
];

export interface SourceMeta {
  id: string;
  label: string;
  /** Monogram shown in the chip; full-color brand dot, never a logo image. */
  mono: string;
  color: string;
  /** How Lens reaches it — shown in Settings so nobody is surprised. */
  route: string;
  canPost: boolean;
}

export const SOURCES: Record<string, SourceMeta> = {
  rss: { id: "rss", label: "RSS", mono: "R", color: "#f97316", route: "RSS / Atom / JSON Feed — no account", canPost: false },
  bluesky: { id: "bluesky", label: "Bluesky", mono: "B", color: "#3b82f6", route: "Official AT Protocol API (app password)", canPost: true },
  mastodon: { id: "mastodon", label: "Mastodon", mono: "M", color: "#8b5cf6", route: "Official Mastodon API (sign in on your server)", canPost: true },
  reddit: { id: "reddit", label: "Reddit", mono: "r", color: "#ef4444", route: "Official Reddit API (installed app sign-in)", canPost: false },
  github: { id: "github", label: "GitHub", mono: "G", color: "#a1a1aa", route: "GitHub notifications API (your token)", canPost: false },
  youtube: { id: "youtube", label: "YouTube", mono: "Y", color: "#dc2626", route: "Channel RSS, or YouTube Data API sign-in", canPost: false },
  x: { id: "x", label: "X", mono: "X", color: "#e4e4e7", route: "Official embed, or your own paid X API key", canPost: false },
};

export function sourceMeta(id: string): SourceMeta {
  return SOURCES[id] ?? { id, label: id, mono: id.slice(0, 1).toUpperCase(), color: "#71717a", route: "", canPost: false };
}

/** Relative time like "now", "4m", "3h", "2d", or a short date. */
export function ago(ts: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 45) return "now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d`;
  const dt = new Date(ts);
  return dt.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Compact counts: 999, 1.2k, 34k, 1.1M. */
export function count(n: number | null | undefined): string {
  if (n == null || n <= 0) return "";
  if (n < 1000) return String(n);
  if (n < 10_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}

/** Client-side source chips: filter the already-merged timeline by enabled chip ids. */
export function bySourceChips(items: ItemDto[], off: Set<string>): ItemDto[] {
  if (off.size === 0) return items;
  return items.filter((i) => !off.has(i.source) || i.also.some(([s]) => !off.has(s)));
}

/** Items newer than the last time the user looked (for the "N new" pill). */
export function newSince(items: ItemDto[], seenTs: number): number {
  return items.reduce((n, i) => n + (i.ts > seenTs ? 1 : 0), 0);
}

/** Deck columns: one per enabled source, keeping Settings order; capped so the deck stays usable. */
export function deckColumns(sources: SourceView[], max = 6): SourceView[] {
  return sources.filter((s) => s.enabled).slice(0, max);
}

/** Splits the merged timeline back into per-source lanes for the deck (cross-posts appear in each). */
export function lanes(items: ItemDto[], columns: SourceView[]): Map<string, ItemDto[]> {
  const out = new Map<string, ItemDto[]>(columns.map((c) => [c.id, []]));
  const kindOf = new Map(columns.map((c) => [c.id, c.kind]));
  for (const it of items) {
    for (const c of columns) {
      const kind = kindOf.get(c.id);
      const hit = it.feed === c.id || (it.feed === "" && kind === it.source) || it.also.some(([s]) => s === kind);
      if (hit) out.get(c.id)!.push(it);
    }
  }
  return out;
}

/** "Read later" goes to Shelf; "Save" adds to a context pack. Both carry the same small payload. */
export function shelfPayload(it: ItemDto): { kind: "link"; title: string; url: string; note: string } {
  const title = (it.title || it.text || it.url).replace(/\s+/g, " ").trim().slice(0, 120);
  return { kind: "link", title, url: it.url, note: `${sourceMeta(it.source).label} · ${it.author}` };
}

/** Text limits per network (graphemes approximated by code points). */
export const POST_LIMITS: Record<string, number> = { bluesky: 300, mastodon: 500 };

export function composeLimit(targets: string[], kinds: Record<string, string>): number {
  const ls = targets.map((t) => POST_LIMITS[kinds[t]] ?? 500);
  return ls.length ? Math.min(...ls) : 500;
}

export function charCount(s: string): number {
  return [...s].length;
}

// ── Voice ──────────────────────────────────────────────────────────────────────────────────────

export type FeedsIntent =
  | { do: "open-feeds"; filter: FilterId }
  | { do: "digest"; hours: number }
  | { do: "refresh" }
  | { do: "compose" }
  | { do: "open-messages" }
  | { do: "catch-up"; channel: string | null }
  | { do: "focus"; mode: "all" | "vip" | "snooze"; minutes?: number };

/** Parses a spoken/typed phrase into a Feeds/Messages intent. Compose never posts by voice — it
 *  only opens the composer; posting always needs the approval card. */
export function parseVoice(input: string): FeedsIntent | null {
  const s = input.toLowerCase().replace(/[.!?,]/g, " ").replace(/\s+/g, " ").trim();
  if (!s) return null;
  let m: RegExpMatchArray | null;
  const hoursIn = (t: string) => {
    const h = t.match(/(\d+) ?(?:h|hours?)\b/);
    return h ? Math.min(72, Math.max(1, Number(h[1]))) : 12;
  };
  if ((m = s.match(/\bcatch me up (?:on|in) (.+)$/))) {
    const what = m[1].replace(/\b(?:the )?last \d+ ?(?:h|hours?)\b/, "").replace(/^(?:my|the) /, "").trim();
    if (!what || /^(?:feeds?|timeline|news|socials?)$/.test(what)) return { do: "digest", hours: hoursIn(s) };
    return { do: "catch-up", channel: what };
  }
  if (/\bcatch me up\b|\b(?:summari[sz]e|digest)\b.*\b(?:feeds?|timeline|news)\b|\b(?:feed|timeline) (?:digest|summary)\b/.test(s)) {
    return { do: "digest", hours: hoursIn(s) };
  }
  if (/\b(?:snooze|mute) (?:messages|notifications|chats)\b/.test(s)) {
    const mm = s.match(/(\d+) ?(min|minutes?|h|hours?)/);
    const minutes = mm ? Number(mm[1]) * (mm[2].startsWith("h") ? 60 : 1) : 60;
    return { do: "focus", mode: "snooze", minutes };
  }
  if (/\b(?:vip|important) only\b|\bonly (?:vips?|important)\b/.test(s)) return { do: "focus", mode: "vip" };
  if (/\b(?:unsnooze|all notifications|end focus)\b/.test(s)) return { do: "focus", mode: "all" };
  if (/\b(?:refresh|reload) (?:my )?(?:feeds?|timeline)\b/.test(s)) return { do: "refresh" };
  if (/\b(?:new post|write a post|compose|draft a post)\b/.test(s)) return { do: "compose" };
  if (/\b(?:open|show) (?:my )?(?:messages|inbox|chats)\b/.test(s)) return { do: "open-messages" };
  if ((m = s.match(/\b(?:open|show) (?:my )?(?:(people|news|video|videos|dev) )?(?:feeds?|timeline)\b/))) {
    const f = (m[1] === "videos" ? "video" : m[1]) as FilterId | undefined;
    return { do: "open-feeds", filter: f ?? "all" };
  }
  return null;
}

/** Timeline status line under the header: muted count, quiet hours, failing sources. */
export function statusLine(tl: TimelineDto | null): string {
  if (!tl) return "";
  const bits: string[] = [];
  if (tl.quiet) bits.push("Quiet hours — refresh paused");
  const bad = tl.sources.filter((s) => !s.ok).length;
  if (bad) bits.push(`${bad} source${bad > 1 ? "s" : ""} need${bad > 1 ? "" : "s"} attention`);
  if (tl.hiddenByMutes) bits.push(`${tl.hiddenByMutes} muted`);
  return bits.join(" · ");
}
