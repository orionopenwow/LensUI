// Obviously fictional sample data for tests and the parity gallery (tools/parity/feeds).
// No real people, handles, or posts. Avatars are monograms.
import type { Conversation, ItemDto, SourceView, TimelineDto } from "../types/generated";

export const NOW = 1_763_830_000_000;
const min = (m: number) => NOW - m * 60_000;

const item = (key: string, source: string, kind: string, author: string, handle: string | null, text: string, mins: number, o: Partial<ItemDto> = {}): ItemDto => ({
  key, source, kind, author, authorHandle: handle, title: null, text, media: [], url: `https://example.org/${key.replace(/[^a-z0-9]/gi, "")}`,
  ts: min(mins), reply: false, replies: null, reposts: null, likes: null, repostedBy: [], also: [], feed: "", ...o,
});

export const SAMPLE_SOURCES: SourceView[] = [
  { id: "bluesky:pip.example", kind: "bluesky", label: "@pip.example", enabled: true, url: null, host: "https://bsky.example", account: "did:plc:fictional", vaultKey: "bluesky:pip.example", kindOverride: null, dailyCap: null, folder: null, connected: true },
  { id: "mastodon:toot.example", kind: "mastodon", label: "Mastodon · toot.example", enabled: true, url: null, host: "toot.example", account: null, vaultKey: "mastodon:toot.example", kindOverride: null, dailyCap: null, folder: null, connected: true },
  { id: "rss:aa11", kind: "rss", label: "The Daily Teapot", enabled: true, url: "https://teapot.example/feed.xml", host: null, account: null, vaultKey: null, kindOverride: null, dailyCap: null, folder: "News", connected: true },
  { id: "reddit:me", kind: "reddit", label: "Reddit · u/quietfern", enabled: true, url: null, host: null, account: "quietfern", vaultKey: "reddit:me", kindOverride: null, dailyCap: null, folder: null, connected: true },
  { id: "github:octo-fern", kind: "github", label: "GitHub · octo-fern", enabled: true, url: null, host: null, account: "octo-fern", vaultKey: "github:octo-fern", kindOverride: null, dailyCap: null, folder: null, connected: true },
  { id: "youtube:bb22", kind: "youtube", label: "Marmalade Workshop", enabled: true, url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCfictional", host: null, account: null, vaultKey: null, kindOverride: null, dailyCap: null, folder: null, connected: true },
];

const IMG = "data:image/svg+xml;utf8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#334155"/><stop offset="1" stop-color="#0f172a"/></linearGradient></defs><rect width="320" height="180" fill="url(#g)"/><circle cx="240" cy="60" r="26" fill="#fbbf24" opacity=".85"/><path d="M0 150 L90 90 L150 130 L220 80 L320 150 V180 H0Z" fill="#1e293b"/></svg>`);

export const SAMPLE_ITEMS: ItemDto[] = [
  item("bluesky:1", "bluesky", "people", "Pip Thistlewood", "@pip.example", "Shipped the tiny kettle-timer app today. Local-first, no accounts, works offline. Feedback welcome!", 4, { replies: 12, reposts: 31, likes: 204, also: [["mastodon", "https://toot.example/@pip/1"]], feed: "bluesky:pip.example" }),
  item("rss:2", "rss", "news", "The Daily Teapot", null, "Town council approves a second lending library for garden tools, opening next spring near the canal path.", 18, { title: "Garden tool library gets the green light", feed: "rss:aa11" }),
  item("mastodon:3", "mastodon", "people", "Juniper Quill", "@juniper@toot.example", "Reminder that the community print zine is due Friday. Drop sketches in the shared folder 🌿", 26, { replies: 3, likes: 48, repostedBy: ["Odo Brambleton"], feed: "mastodon:toot.example" }),
  item("youtube:4", "youtube", "video", "Marmalade Workshop", null, "", 52, { title: "Building a walnut desk organiser — part 2", media: [{ url: IMG, kind: "video", alt: "Workshop bench at dusk" }], feed: "youtube:bb22" }),
  item("github:5", "github", "dev", "octo-fern/kettle-timer", null, "Review requested: Add quiet-hours schedule (#42)", 61, { title: "PullRequest · review_requested", feed: "github:octo-fern" }),
  item("reddit:6", "reddit", "news", "r/woodworking", "u/mossy_plank", "First dovetail joint that actually closed without gaps. Took 14 tries.", 95, { title: "Finally!", replies: 88, likes: 2400, media: [{ url: IMG, kind: "image", alt: "A dovetail joint" }], feed: "reddit:me" }),
  item("bluesky:7", "bluesky", "people", "Wren Halloway", "@wren.example", "Hot take: every settings page should have a search box and a reset button.", 140, { replies: 21, reposts: 9, likes: 133, feed: "bluesky:pip.example" }),
  item("github:8", "github", "dev", "octo-fern/fern-ui", null, "CI failed on main: lint step", 190, { title: "CheckSuite · ci_activity", feed: "github:octo-fern" }),
];

export const SAMPLE_TIMELINE: TimelineDto = {
  items: SAMPLE_ITEMS,
  hiddenByMutes: 3,
  quiet: false,
  sources: SAMPLE_SOURCES.map((s) => ({ id: s.id, ok: s.kind !== "reddit", items: 10, message: s.kind === "reddit" ? "Reddit asked Lens to slow down — retrying in 2 min." : null, nextMs: NOW + 120_000 })),
};

export const SAMPLE_DIGEST = {
  text: [
    "- Pip launched a small offline kettle-timer app and is asking for feedback [1]",
    "- The town approved a garden-tool lending library opening next spring [2]",
    "- Community zine submissions are due Friday [3]",
    "- A review is waiting on you for the quiet-hours PR in kettle-timer [5]",
    "- CI is red on fern-ui main because of a lint step [8]",
  ].join("\n"),
  sources: SAMPLE_ITEMS.map((i) => [`${i.source} · ${i.authorHandle ?? i.author}`, i.url] as [string, string]),
};

const conv = (id: string, app: string, title: string, unread: number, mins: number, o: Partial<Conversation> = {}): Conversation => ({
  id, source: `space:${app}`, app, title, unread, mentions: 0, lastPreview: null, lastTs: mins ? min(mins) : 0,
  url: `https://example.org/${app}`, vip: false, canReply: false, ...o,
});

export const SAMPLE_INBOX: Conversation[] = [
  conv("matrix:!garden", "matrix", "Allotment Committee", 4, 3, { source: "matrix", mentions: 1, lastPreview: "marigold: @pip can you bring the spare hose on Saturday?", vip: true, canReply: true }),
  conv("space:slack", "slack", "Slack", 7, 9, { mentions: 2, lastPreview: "Fernbrook Studio: standup moved to 10:30" }),
  conv("space:discord", "discord", "Discord", 12, 15),
  conv("space:telegram", "telegram", "Telegram", 2, 34, { lastPreview: "Aunt Clementine: photos from the picnic 📷" }),
  conv("space:gmail", "gmail", "Gmail", 3, 60),
  conv("space:whatsapp", "whatsapp", "WhatsApp", 0, 180),
  conv("space:teams", "teams", "Microsoft Teams", 0, 400),
  conv("matrix:!book", "matrix", "Book Club", 0, 720, { source: "matrix", lastPreview: "tansy: chapter 9 for next week", canReply: true }),
];

export const SAMPLE_LINES = [
  { who: "marigold", text: "Plot 14 is finally weeded!", ts: min(40) },
  { who: "odo", text: "Nice. Water butt is half full after the rain.", ts: min(30) },
  { who: "you", text: "I'll bring seedlings on Saturday.", ts: min(12), me: true },
  { who: "marigold", text: "@pip can you bring the spare hose on Saturday?", ts: min(3) },
];
