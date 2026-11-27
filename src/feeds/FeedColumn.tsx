import React, { useMemo, useState } from "react";
import { BookmarkPlus, Columns3, MessageCircle, PenLine, Repeat2, RefreshCw, Heart, Sparkles, Clock3, Layers, Rss } from "lucide-react";
import { EmptyState, Skeleton } from "../ui";
import { FILTERS, ago, bySourceChips, count, newSince, sourceMeta, statusLine, type FilterId, type ItemDto, type SourceView, type TimelineDto } from "./model";

export function SourceDot({ source, size = 16 }: { source: string; size?: number }) {
  const m = sourceMeta(source);
  return (
    <span className="lf-dot" style={{ width: size, height: size, background: m.color, fontSize: Math.round(size * 0.58) }} aria-label={m.label}>
      {m.mono}
    </span>
  );
}

export interface ItemActions {
  onOpen?(it: ItemDto): void;
  onReadLater?(it: ItemDto): void;
  onSave?(it: ItemDto): void;
}

export function FeedRow({ it, now, actions, compact }: { it: ItemDto; now: number; actions?: ItemActions; compact?: boolean }) {
  const img = it.media.find((m) => m.kind === "image" || m.kind === "video");
  return (
    <article className={`lf-row ${compact ? "compact" : ""}`} onClick={() => actions?.onOpen?.(it)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && actions?.onOpen?.(it)}>
      <div className="lf-row-side">
        <span className="lf-avatar" aria-hidden>{it.author.slice(0, 1).toUpperCase()}</span>
        <SourceDot source={it.source} size={14} />
      </div>
      <div className="lf-row-main">
        {it.repostedBy.length ? (
          <div className="lf-repost"><Repeat2 size={11} /> {it.repostedBy.slice(0, 2).join(", ")}{it.repostedBy.length > 2 ? ` +${it.repostedBy.length - 2}` : ""}</div>
        ) : null}
        <div className="lf-row-head">
          <span className="lf-author">{it.author}</span>
          {it.authorHandle ? <span className="lf-handle">{it.authorHandle}</span> : null}
          <span className="lf-ago">{ago(it.ts, now)}</span>
        </div>
        {it.title ? <div className="lf-title">{it.title}</div> : null}
        {it.text ? <div className="lf-text">{it.text}</div> : null}
        {img && !compact ? (
          <div className={`lf-media ${img.kind}`} aria-label={img.alt ?? "Media"}>
            {img.url.startsWith("data:") || img.url.startsWith("https://") ? <img src={img.url} alt={img.alt ?? ""} loading="lazy" draggable={false} /> : null}
            {img.kind === "video" ? <span className="lf-play" aria-hidden>▶</span> : null}
          </div>
        ) : null}
        <div className="lf-row-foot">
          {it.replies ? <span><MessageCircle size={12} /> {count(it.replies)}</span> : null}
          {it.reposts ? <span><Repeat2 size={12} /> {count(it.reposts)}</span> : null}
          {it.likes ? <span><Heart size={12} /> {count(it.likes)}</span> : null}
          {it.also.length ? (
            <span className="lf-also" aria-label="Also posted on">
              <Layers size={12} /> {it.also.map(([s]) => <SourceDot key={s} source={s} size={12} />)}
            </span>
          ) : null}
          <span className="lf-spacer" />
          <button data-weight="medium" className="lf-ico" aria-label="Read later (Shelf)" onClick={(e) => { e.stopPropagation(); actions?.onReadLater?.(it); }}><Clock3 size={13} /></button>
          <button data-weight="medium" className="lf-ico" aria-label="Save to context pack" onClick={(e) => { e.stopPropagation(); actions?.onSave?.(it); }}><BookmarkPlus size={13} /></button>
        </div>
      </div>
    </article>
  );
}

export interface FeedColumnProps {
  timeline: TimelineDto | null;
  sources: SourceView[];
  filter: FilterId;
  onFilter(f: FilterId): void;
  now?: number;
  seenTs?: number;
  width?: number;
  busy?: boolean;
  onRefresh?(): void;
  onDigest?(): void;
  onCompose?(): void;
  onDeck?(): void;
  actions?: ItemActions;
  /** Rendered above the list (digest card, composer). */
  children?: React.ReactNode;
}

/** The slim column: header, source chips, filter tabs, the merged list. 320–380 px wide. */
export function FeedColumn(p: FeedColumnProps) {
  const now = p.now ?? Date.now();
  const [off, setOff] = useState<Set<string>>(new Set());
  const chips = useMemo(() => [...new Set(p.sources.filter((s) => s.enabled).map((s) => s.kind))], [p.sources]);
  const items = useMemo(() => bySourceChips(p.timeline?.items ?? [], off), [p.timeline, off]);
  const fresh = p.seenTs ? newSince(items, p.seenTs) : 0;
  const status = statusLine(p.timeline);
  const toggle = (k: string) =>
    setOff((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  return (
    <section className="lf-col" style={{ width: Math.min(380, Math.max(320, p.width ?? 352)) }} aria-label="Feeds">
      <header className="lf-head">
        <span className="lf-h1">Feeds</span>
        {fresh ? <span className="lf-new">{fresh} new</span> : null}
        <span className="lf-spacer" />
        <button data-weight="medium" className="lf-ico" aria-label="AI digest" onClick={p.onDigest}><Sparkles size={15} /></button>
        <button data-weight="medium" className="lf-ico" aria-label="New post" onClick={p.onCompose}><PenLine size={15} /></button>
        <button data-weight="medium" className="lf-ico" aria-label="Deck view" onClick={p.onDeck}><Columns3 size={15} /></button>
        <button data-weight="medium" className={`lf-ico ${p.busy ? "spin" : ""}`} aria-label="Refresh" onClick={p.onRefresh}><RefreshCw size={15} /></button>
      </header>
      {chips.length ? (
        <div className="lf-chips" role="group" aria-label="Sources">
          {chips.map((k) => (
            <button data-weight="light" key={k} className={`lf-chip ${off.has(k) ? "off" : ""}`} aria-pressed={!off.has(k)} onClick={() => toggle(k)}>
              <SourceDot source={k} size={12} /> {sourceMeta(k).label}
            </button>
          ))}
        </div>
      ) : null}
      <nav className="lf-tabs" role="tablist" aria-label="Filter">
        {FILTERS.map((f) => (
          <button data-weight="light" key={f.id} role="tab" aria-selected={p.filter === f.id} className={p.filter === f.id ? "on" : ""} onClick={() => p.onFilter(f.id)}>
            {f.label}
          </button>
        ))}
      </nav>
      {status ? <div className="lf-status">{status}</div> : null}
      {p.children}
      <div className="lf-list">
        {items.length ? (
          items.map((it) => <FeedRow key={it.key} it={it} now={now} actions={p.actions} />)
        ) : p.busy && p.sources.length ? (
          <Skeleton label="Loading feeds" shape="lines" rows={6} className="lf-skeleton" />
        ) : (
          <EmptyState
            compact
            className="lf-empty"
            icon={<Rss size={15} />}
            title={p.sources.length ? "You're all caught up" : "No feeds yet"}
            body={p.sources.length ? "Lens checks again on your refresh schedule." : "Add a feed in Settings › Feeds — paste any site, or connect Bluesky, Mastodon, Reddit or GitHub."}
          />
        )}
      </div>
    </section>
  );
}
