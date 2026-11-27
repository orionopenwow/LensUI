// Magic Dashboard lanes from Lens's own local data (docs/plans/MAGIC_WAVES.md §4, wave M1).
// Read once each time the Dashboard opens: nothing is polled, collected in the background or
// fetched from the network. Every source is optional; a source that fails or is off leaves its
// lane empty with its plain "how to fill this" line.
import type { Card } from "./store";

/** A Lens Messages conversation (Rust `messages::Conversation`). */
export interface ConvLike {
  id: string;
  app: string;
  title: string;
  unread: number;
  mentions: number;
  lastPreview: string | null;
  lastTs: number;
  url: string;
}

/** A Feeds timeline row (Rust `feeds::ItemDto`), only the fields the Dashboard shows. */
export interface FeedItemLike {
  key: string;
  source: string;
  author: string;
  title: string | null;
  text: string;
  url: string;
  ts: number;
}

/** A calendar event as Lens's calendar pane stores it (localStorage `lens_calendar_events_v1`). */
export interface CalEventLike {
  id: string;
  dateKey: string;
  time: string;
  title: string;
  done: boolean;
}

/** A Shelf item (src/shelf/contract.ts). */
export interface ShelfLike {
  id: string;
  title: string;
  text: string;
  kind: string;
  source_app?: string | null;
  created_ms: number;
  pinned: boolean;
}

/** Now playing (Rust `MediaNowPlaying`). */
export interface NowPlayingLike {
  hasSession: boolean;
  isPlaying: boolean;
  title: string;
  artist: string;
  sourceApp: string;
}

/** What a card does when it's opened. Kept as data so tests can check it without Tauri. */
export type CardAction =
  | { kind: "app"; app: "messages" | "feeds" }
  | { kind: "url"; url: string }
  | { kind: "shelf" }
  | { kind: "media" }
  | { kind: "none" };

export type DashCard = Card & { action: CardAction };

const clip = (s: string, n = 90) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const tsMs = (t: number) => (t > 0 && t < 1e12 ? t * 1000 : t);

/** Conversations with something unread, newest first (max 8). */
export function inboxCards(convs: ConvLike[]): DashCard[] {
  return convs
    .filter((c) => c.unread > 0)
    .sort((a, b) => b.lastTs - a.lastTs)
    .slice(0, 8)
    .map((c) => ({
      id: `inbox:${c.id}`,
      lane: "inbox",
      title: c.title || c.app,
      detail: c.lastPreview ? clip(c.lastPreview) : `${c.unread} unread${c.mentions ? `, ${c.mentions} mention${c.mentions === 1 ? "" : "s"}` : ""}`,
      source: `${c.app || "Messages"} · Lens Messages`,
      at: tsMs(c.lastTs),
      action: { kind: "app", app: "messages" },
    }));
}

/** The newest feed posts (max 8). Links open in Lens Browser. */
export function feedCards(items: FeedItemLike[]): DashCard[] {
  return [...items]
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 8)
    .map((i) => ({
      id: `feeds:${i.key}`,
      lane: "feeds",
      title: clip(i.title || i.text || i.author, 80),
      detail: i.title && i.text ? clip(i.text) : undefined,
      source: `${i.author ? `${i.author} · ` : ""}${i.source}`,
      at: tsMs(i.ts),
      action: i.url ? { kind: "url", url: i.url } : { kind: "app", app: "feeds" },
    }));
}

const pad = (n: number) => String(n).padStart(2, "0");
export const dateKeyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function eventTime(e: CalEventLike): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(e.dateKey);
  const t = /^(\d{1,2}):(\d{2})$/.exec(e.time || "");
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3], t ? +t[1] : 0, t ? +t[2] : 0);
}

/** Today's calendar events that aren't done, earliest first. */
export function todayCards(events: CalEventLike[], now: Date): DashCard[] {
  const key = dateKeyOf(now);
  return events
    .filter((e) => e.dateKey === key && !e.done)
    .map((e) => ({ e, at: eventTime(e) }))
    .sort((a, b) => (a.at?.getTime() ?? 0) - (b.at?.getTime() ?? 0))
    .map(({ e, at }) => ({
      id: `today:${e.id}`,
      lane: "today",
      title: e.title,
      detail: e.time ? fmtTime(at) : "Today",
      source: "Lens calendar",
      // Upcoming events sort first in the lane (it sorts newest first), so use the negative gap.
      at: at ? now.getTime() * 2 - at.getTime() : undefined,
      action: { kind: "none" },
    }));
}

function fmtTime(d: Date | null): string {
  if (!d) return "Today";
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** The next event today that hasn't started, for the context strip. */
export function nextEvent(events: CalEventLike[], now: Date): { title: string; at: Date } | null {
  const key = dateKeyOf(now);
  const upcoming = events
    .filter((e) => e.dateKey === key && !e.done)
    .map((e) => ({ title: e.title, at: eventTime(e) }))
    .filter((x): x is { title: string; at: Date } => !!x.at && x.at.getTime() >= now.getTime())
    .sort((a, b) => a.at.getTime() - b.at.getTime());
  return upcoming[0] ?? null;
}

/** Shelf items: pinned first, then newest (max 8). */
export function shelfCards(items: ShelfLike[]): DashCard[] {
  return [...items]
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.created_ms - a.created_ms)
    .slice(0, 8)
    .map((i) => ({
      id: `shelf:${i.id}`,
      lane: "shelf",
      title: clip(i.title || i.text || "Untitled", 80),
      detail: i.title && i.text ? clip(i.text) : undefined,
      source: i.source_app ? `Shelf · ${i.source_app}` : "Shelf",
      at: i.created_ms + (i.pinned ? 1e13 : 0),
      action: { kind: "shelf" },
    }));
}

export function nowPlayingCards(np: NowPlayingLike | null): DashCard[] {
  if (!np || !np.hasSession || !np.title) return [];
  return [
    {
      id: "nowplaying:current",
      lane: "nowplaying",
      title: np.title,
      detail: [np.artist, np.isPlaying ? "Playing" : "Paused"].filter(Boolean).join(" · "),
      source: np.sourceApp || "This PC",
      action: { kind: "media" },
    },
  ];
}

/** Everything the Dashboard reads when it opens. Each reader may fail on its own. */
export interface Readers {
  inbox: () => Promise<ConvLike[]>;
  feeds: () => Promise<FeedItemLike[]>;
  calendar: () => CalEventLike[];
  shelf: () => Promise<ShelfLike[]>;
  nowPlaying: () => Promise<NowPlayingLike | null>;
}

export interface Snapshot {
  cards: DashCard[];
  unread: number;
  shelfCount: number;
  next: { title: string; at: Date } | null;
  nowPlaying: NowPlayingLike | null;
}

/** A reader that answers with something other than a list counts as empty. */
const arr = <T>(v: T[] | null | undefined): T[] => (Array.isArray(v) ? v : []);

const safe = async <T>(f: () => Promise<T> | T, fallback: T): Promise<T> => {
  try {
    return await f();
  } catch {
    return fallback;
  }
};

/** Reads every source once and builds the lanes. */
export async function loadSnapshot(r: Readers, now: Date): Promise<Snapshot> {
  const [rawConvs, rawFeeds, rawShelf, rawNp] = await Promise.all([
    safe(r.inbox, [] as ConvLike[]),
    safe(r.feeds, [] as FeedItemLike[]),
    safe(r.shelf, [] as ShelfLike[]),
    safe(r.nowPlaying, null as NowPlayingLike | null),
  ]);
  const events = arr(await safe(r.calendar, [] as CalEventLike[]));
  const convs = arr(rawConvs);
  const feeds = arr(rawFeeds);
  const shelf = arr(rawShelf);
  const np = rawNp && typeof rawNp === "object" ? rawNp : null;
  return {
    cards: [...inboxCards(convs), ...feedCards(feeds), ...todayCards(events, now), ...shelfCards(shelf), ...nowPlayingCards(np)],
    unread: convs.reduce((n, c) => n + Math.max(0, c.unread), 0),
    shelfCount: shelf.length,
    next: nextEvent(events, now),
    nowPlaying: np,
  };
}

/** The context strip, now with what's playing (all from the snapshot; nothing new is read). */
export function stripItems(base: string[], snap: Pick<Snapshot, "nowPlaying">): string[] {
  const np = snap.nowPlaying;
  return np && np.hasSession && np.isPlaying && np.title ? [...base, `Playing ${np.title}`] : base;
}
