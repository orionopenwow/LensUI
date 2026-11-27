import React, { useMemo, useState } from "react";
import { AtSign, Search, Star } from "lucide-react";
import { ago } from "../feeds/model";
import { appColor, filterInbox, totals, type Conversation, type InboxTab } from "./model";
import { FocusNotch } from "./FocusNotch";
import "../feeds/Feeds.css";
import "./Messages.css";

export function AppGlyph({ app, title, size = 30 }: { app: string; title: string; size?: number }) {
  return (
    <span className="lm-glyph" style={{ width: size, height: size, background: appColor(app), fontSize: Math.round(size * 0.42) }} aria-hidden>
      {title.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function InboxRow({ c, now, active, onOpen }: { c: Conversation; now: number; active?: boolean; onOpen?(c: Conversation): void }) {
  return (
    <button data-weight="light" className={`lm-row ${active ? "on" : ""} ${c.unread ? "unread" : ""}`} onClick={() => onOpen?.(c)} aria-label={`${c.title}${c.unread ? `, ${c.unread} unread` : ""}`}>
      <AppGlyph app={c.app} title={c.title} />
      <span className="lm-row-main">
        <span className="lm-row-head">
          <span className="lm-title">{c.title}</span>
          {c.vip ? <Star size={11} className="lm-vip" aria-label="VIP" /> : null}
          <span className="lf-spacer" />
          {c.lastTs ? <span className="lf-ago">{ago(c.lastTs, now)}</span> : null}
        </span>
        <span className="lm-preview">{c.lastPreview ?? (c.unread ? `${c.unread} unread` : "No new messages")}</span>
      </span>
      <span className="lm-badges">
        {c.mentions ? <span className="lm-mention"><AtSign size={10} />{c.mentions}</span> : null}
        {c.unread ? <span className="lm-count">{c.unread > 99 ? "99+" : c.unread}</span> : null}
      </span>
    </button>
  );
}

export interface InboxProps {
  rows: Conversation[];
  now?: number;
  activeId?: string | null;
  focus: string;
  onFocus(mode: "all" | "vip" | "snooze", minutes?: number): void;
  onOpen?(c: Conversation): void;
  width?: number;
}

/** The unified inbox: one row per messenger space, Matrix room, or mirrored app. */
export function Inbox({ rows, now, activeId, focus, onFocus, onOpen, width = 352 }: InboxProps) {
  const [tab, setTab] = useState<InboxTab>("all");
  const [q, setQ] = useState("");
  const t = now ?? Date.now();
  const shown = useMemo(() => filterInbox(rows, tab, q), [rows, tab, q]);
  const tot = totals(rows);
  return (
    <section className="lm-inbox" style={{ width }} aria-label="Messages">
      <header className="lf-head">
        <span className="lf-h1">Messages</span>
        {tot.unread ? <span className="lf-new">{tot.unread}</span> : null}
        <span className="lf-spacer" />
        <FocusNotch focus={focus} onFocus={onFocus} />
      </header>
      <label className="lm-search">
        <Search size={13} />
        <input aria-label="Search conversations" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      <nav className="lf-tabs" role="tablist" aria-label="Inbox filter">
        {(["all", "unread", "mentions", "vip"] as InboxTab[]).map((id) => (
          <button data-weight="light" key={id} role="tab" aria-selected={tab === id} className={tab === id ? "on" : ""} onClick={() => setTab(id)}>
            {id === "all" ? "All" : id === "unread" ? "Unread" : id === "mentions" ? `Mentions${tot.mentions ? ` ${tot.mentions}` : ""}` : "VIP"}
          </button>
        ))}
      </nav>
      <div className="lf-list">
        {shown.length ? (
          shown.map((c) => <InboxRow key={c.id} c={c} now={t} active={c.id === activeId} onOpen={onOpen} />)
        ) : (
          <div className="lf-empty">{rows.length ? "Nothing here." : "Turn on the messengers you use in Settings › Messages. Each opens in its own sandboxed space."}</div>
        )}
      </div>
    </section>
  );
}
