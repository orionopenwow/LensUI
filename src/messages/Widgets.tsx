import React from "react";
import { MessageSquare, Rss } from "lucide-react";
import { SourceDot } from "../feeds/FeedColumn";
import { ago, type ItemDto } from "../feeds/model";
import { AppGlyph } from "./Inbox";
import { pillLabel, totals, type Conversation, type UnreadDto } from "./model";
import "../feeds/Feeds.css";
import "./Messages.css";

/** Widgets-board tile: the newest few posts. */
export function FeedsWidget({ items, now, onOpen }: { items: ItemDto[]; now?: number; onOpen?(): void }) {
  const t = now ?? Date.now();
  return (
    <section className="lw-widget" aria-label="Feeds widget">
      <button data-weight="medium" className="lw-head" onClick={onOpen}>
        <Rss size={13} /> <span>Feeds</span>
        <span className="lf-spacer" />
        <span className="lf-sub">{items.length ? `${items.length} new` : "Up to date"}</span>
      </button>
      {items.slice(0, 4).map((it) => (
        <div key={it.key} className="lw-line">
          <SourceDot source={it.source} size={12} />
          <span className="lw-text"><b>{it.author}</b> {it.title || it.text}</span>
          <span className="lf-ago">{ago(it.ts, t)}</span>
        </div>
      ))}
    </section>
  );
}

/** Widgets-board tile: who's waiting on you. */
export function MessagesWidget({ rows, focus, onOpen }: { rows: Conversation[]; focus: string; onOpen?(): void }) {
  const tot = totals(rows);
  const waiting = rows.filter((r) => r.unread || r.mentions).slice(0, 5);
  return (
    <section className="lw-widget" aria-label="Messages widget">
      <button data-weight="medium" className="lw-head" onClick={onOpen}>
        <MessageSquare size={13} /> <span>Messages</span>
        <span className="lf-spacer" />
        <span className="lf-sub">{focus === "snoozed" ? "Snoozed" : tot.unread ? `${tot.unread} unread` : "All caught up"}</span>
      </button>
      <div className="lw-apps">
        {waiting.map((r) => (
          <span key={r.id} className="lw-app">
            <AppGlyph app={r.app} title={r.title} size={30} />
            {r.unread ? <span className="lm-count lw-count">{r.unread > 99 ? "99+" : r.unread}</span> : null}
            <span className="lw-app-name">{r.title}</span>
          </span>
        ))}
        {waiting.length === 0 ? <span className="lf-sub" style={{ padding: "6px 2px" }}>Nothing waiting.</span> : null}
      </div>
    </section>
  );
}

/** Top-bar unread pill. Hidden when there's nothing; a mention dot when someone needs you. */
export function UnreadPill({ unread, onClick }: { unread: UnreadDto | null; onClick?(): void }) {
  const label = pillLabel(unread);
  if (!label) return null;
  return (
    <button data-weight="medium" className={`lm-pill ${unread?.focus === "snoozed" ? "snoozed" : ""}`} onClick={onClick} aria-label={`Messages: ${label}${unread?.mentions ? `, ${unread.mentions} mentions` : ""}`}>
      <MessageSquare size={12} />
      <span>{label}</span>
      {unread?.mentions && unread.focus !== "snoozed" ? <span className="lm-pill-dot" aria-hidden /> : null}
    </button>
  );
}
