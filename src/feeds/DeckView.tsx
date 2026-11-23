import React, { useMemo } from "react";
import { X } from "lucide-react";
import { FeedRow, SourceDot, type ItemActions } from "./FeedColumn";
import { deckColumns, lanes, type ItemDto, type SourceView } from "./model";

/** Deck view: one narrow lane per enabled source (TweetDeck-style), cross-posts in each lane. */
export function DeckView({ items, sources, now, onClose, actions }: { items: ItemDto[]; sources: SourceView[]; now?: number; onClose?(): void; actions?: ItemActions }) {
  const cols = useMemo(() => deckColumns(sources), [sources]);
  const byLane = useMemo(() => lanes(items, cols), [items, cols]);
  const t = now ?? Date.now();
  return (
    <section className="lf-deck" aria-label="Feeds deck">
      <header className="lf-deck-head">
        <span className="lf-h1">Deck</span>
        <span className="lf-sub">{cols.length} lanes</span>
        <span className="lf-spacer" />
        {onClose ? <button className="lf-ico" aria-label="Back to column" onClick={onClose}><X size={15} /></button> : null}
      </header>
      <div className="lf-lanes">
        {cols.map((c) => (
          <div key={c.id} className="lf-lane">
            <div className="lf-lane-head">
              <SourceDot source={c.kind} size={14} />
              <span className="lf-lane-title">{c.label}</span>
              <span className="lf-sub">{byLane.get(c.id)?.length ?? 0}</span>
            </div>
            <div className="lf-list">
              {(byLane.get(c.id) ?? []).map((it) => <FeedRow key={it.key} it={it} now={t} actions={actions} compact />)}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
