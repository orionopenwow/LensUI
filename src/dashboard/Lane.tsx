import React from "react";
import { X } from "lucide-react";
import type { Card, LaneSpec } from "./store";

export const Lane: React.FC<{
  spec: LaneSpec;
  cards: Card[];
  onDismiss: (id: string) => void;
  onOpen: (id: string) => void;
}> = ({ spec, cards, onDismiss, onOpen }) => (
  <section className="mdb-lane" aria-labelledby={`mdb-lane-${spec.id}`} data-lane={spec.id}>
    <h2 id={`mdb-lane-${spec.id}`} className="mdb-lane-title">
      {spec.label}
      {cards.length > 0 && <span className="mdb-count">{cards.length}</span>}
    </h2>
    {cards.length === 0 ? (
      <div className="mdb-empty">
        <p>{spec.empty.text}</p>
        {/* Sources connect in later waves; the button is shown but does nothing yet. */}
        <button type="button" className="mdb-empty-action" disabled aria-disabled="true">
          {spec.empty.action}
        </button>
      </div>
    ) : (
      <ul className="mdb-cards" role="list">
        {cards.map((c) => (
          <li key={c.id} className="mdb-card">
            <button type="button" className="mdb-card-main" onClick={() => onOpen(c.id)}>
              <span className="mdb-card-title">{c.title}</span>
              {c.detail && <span className="mdb-card-detail">{c.detail}</span>}
              <span className="mdb-card-source">{c.source}</span>
              {c.why && <span className="mdb-why">Why this is here: {c.why}</span>}
            </button>
            <button type="button" className="mdb-card-dismiss" aria-label={`Dismiss ${c.title}`} onClick={() => onDismiss(c.id)}>
              <X size={12} aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    )}
  </section>
);
