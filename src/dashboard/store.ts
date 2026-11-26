// Magic Dashboard model (docs/plans/MAGIC_WAVES.md §4). Lanes, layouts, cards and the
// "why this is here" reasons. Pure: no fetching, no timers. Sources fill lanes in later waves,
// each only after the person connects it.

export type LaneId = "inbox" | "feeds" | "today" | "shelf" | "widgets" | "nowplaying";
export type LayoutId = "glance" | "focus" | "board";

export interface Card {
  id: string;
  lane: LaneId;
  title: string;
  detail?: string;
  /** When it happened or arrived (ms since epoch). */
  at?: number;
  /** Where it came from, in plain words ("Lens Messages", "Feeds · The Verge"). */
  source: string;
  /** Set when learned ordering moved this card; shown as "Why this is here". */
  why?: string;
}

export interface LaneSpec {
  id: LaneId;
  label: string;
  /** What the empty lane says, and the action that fills it. */
  empty: { text: string; action: string };
  /** The flag that must be on for this lane to show (besides magicWaves.dashboard). */
  needs?: "widgets";
}

export const LANES: readonly LaneSpec[] = [
  { id: "inbox", label: "Inbox", empty: { text: "Messages from the apps you connect show up here.", action: "Connect a source" } },
  { id: "feeds", label: "Feeds", empty: { text: "Follow sites and posts in Lens Feeds to see them here.", action: "Open Feeds" } },
  { id: "today", label: "Today", empty: { text: "Your calendar and reminders for today.", action: "Connect a calendar" } },
  { id: "shelf", label: "Shelf", empty: { text: "Things you put on the Shelf, ready to use or turn into a note.", action: "Open the Shelf" } },
  { id: "widgets", label: "Widgets", empty: { text: "Small widgets from the gallery. Each one asks before it fetches anything.", action: "Add a widget" }, needs: "widgets" },
  { id: "nowplaying", label: "Now playing", empty: { text: "What's playing on this PC.", action: "Open Lens Music" } },
];

export interface LayoutSpec {
  id: LayoutId;
  label: string;
  desc: string;
  /** Lanes shown, in order. */
  lanes: LaneId[];
}

export const LAYOUTS: readonly LayoutSpec[] = [
  { id: "glance", label: "Glance", desc: "A little of everything, at a look.", lanes: ["today", "inbox", "shelf", "nowplaying"] },
  { id: "focus", label: "Focus", desc: "Only what needs you: inbox and today.", lanes: ["inbox", "today"] },
  { id: "board", label: "Board", desc: "Every lane side by side.", lanes: ["inbox", "feeds", "today", "shelf", "widgets", "nowplaying"] },
];

export interface DashboardState {
  layout: LayoutId;
  cards: Card[];
  /** Cards the person dismissed (by id). */
  dismissed: string[];
  /** Learned ordering is on (magicWaves.learn). */
  learn: boolean;
  /** Per-card open counts, kept only while learning is on. */
  opens: Record<string, number>;
}

export function initialState(opts: { layout?: LayoutId; learn?: boolean } = {}): DashboardState {
  return { layout: opts.layout ?? "glance", cards: [], dismissed: [], learn: !!opts.learn, opens: {} };
}

export function layoutSpec(id: LayoutId): LayoutSpec {
  return LAYOUTS.find((l) => l.id === id) ?? LAYOUTS[0];
}

/** The lanes to show for a layout, dropping lanes whose flag is off. */
export function visibleLanes(layout: LayoutId, flags: { widgets: boolean }): LaneSpec[] {
  return layoutSpec(layout)
    .lanes.map((id) => LANES.find((l) => l.id === id)!)
    .filter((l) => !l.needs || flags[l.needs]);
}

/** Cards for a lane: newest first, or by use when learning is on (with a reason on moved cards). */
export function laneCards(s: DashboardState, lane: LaneId): Card[] {
  const cards = s.cards.filter((c) => c.lane === lane && !s.dismissed.includes(c.id));
  const byTime = [...cards].sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
  if (!s.learn) return byTime.map(({ why: _why, ...c }) => c);
  const rank = new Map(byTime.map((c, i) => [c.id, i]));
  const sorted = [...byTime].sort((a, b) => (s.opens[b.id] ?? 0) - (s.opens[a.id] ?? 0) || rank.get(a.id)! - rank.get(b.id)!);
  return sorted.map((c, i) => {
    const moved = rank.get(c.id)! > i;
    const n = s.opens[c.id] ?? 0;
    return moved && n > 0 ? { ...c, why: `You opened this ${n === 1 ? "once" : `${n} times`} recently` } : (({ why: _why, ...rest }) => rest)(c);
  });
}

export type Action =
  | { type: "layout"; layout: LayoutId }
  | { type: "cards"; cards: Card[] }
  | { type: "dismiss"; id: string }
  | { type: "opened"; id: string }
  | { type: "learn"; on: boolean }
  | { type: "forget" };

export function reduce(s: DashboardState, a: Action): DashboardState {
  switch (a.type) {
    case "layout":
      return { ...s, layout: a.layout };
    case "cards":
      return { ...s, cards: a.cards };
    case "dismiss":
      return s.dismissed.includes(a.id) ? s : { ...s, dismissed: [...s.dismissed, a.id] };
    case "opened":
      return s.learn ? { ...s, opens: { ...s.opens, [a.id]: (s.opens[a.id] ?? 0) + 1 } } : s;
    case "learn":
      // Turning learning off forgets what it learned.
      return a.on ? { ...s, learn: true } : { ...s, learn: false, opens: {} };
    case "forget":
      return { ...s, opens: {} };
  }
}

/** The context strip: a short, local summary built when the Dashboard opens (never in between). */
export function contextStrip(input: { now: Date; unread: number; nextEvent?: { title: string; at: Date } | null; shelfCount: number }): string[] {
  const out: string[] = [];
  const h = input.now.getHours();
  out.push(h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening");
  if (input.unread > 0) out.push(`${input.unread} unread`);
  if (input.nextEvent) {
    const mins = Math.round((input.nextEvent.at.getTime() - input.now.getTime()) / 60000);
    if (mins >= 0 && mins <= 120) out.push(`${input.nextEvent.title} in ${mins} min`);
  }
  if (input.shelfCount > 0) out.push(`${input.shelfCount} on the Shelf`);
  return out;
}
