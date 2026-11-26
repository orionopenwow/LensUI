// Magic Dashboard panel (docs/plans/MAGIC_WAVES.md §4). Shows the lanes for the chosen layout.
// It renders whatever cards it's given: the Dashboard window (DashboardWindow.tsx) fills them from
// Lens's own data when it opens; the Tester preview passes none and shows the empty states.
import React, { useEffect, useMemo, useReducer, useRef } from "react";
import { X } from "lucide-react";
import { LensCloud } from "../presence/LensCloud";
import { LAYOUTS, initialState, laneCards, reduce, visibleLanes, contextStrip, type Card, type LaneId, type LayoutId } from "./store";
import { Lane } from "./Lane";
import { ContextStrip } from "./ContextStrip";
import "./dashboard.css";

export interface DashboardProps {
  flags: { widgets: boolean; learn: boolean };
  layout?: LayoutId;
  /** Fixed clock for tests and the parity harness. */
  now?: Date;
  /** Cards from local sources (none: every lane shows its empty state). */
  cards?: Card[];
  /** The context strip; built from `now` alone when not given. */
  strip?: string[];
  /** Open counts remembered while learning is on (local only). */
  opens?: Record<string, number>;
  onOpensChange?: (opens: Record<string, number>) => void;
  onLayoutChange?: (layout: LayoutId) => void;
  onCardOpen?: (card: Card) => void;
  /** The empty lane's button ("Open Feeds", "Open the Shelf"…); disabled when not given. */
  onEmptyAction?: (lane: LaneId) => void;
  onClose?: () => void;
}

export const DashboardSurface = ({
  flags,
  layout = "glance",
  now,
  cards,
  strip,
  opens,
  onOpensChange,
  onLayoutChange,
  onCardOpen,
  onEmptyAction,
  onClose,
}: DashboardProps) => {
  const [state, dispatch] = useReducer(reduce, undefined, () => ({ ...initialState({ layout, learn: flags.learn }), opens: flags.learn ? opens ?? {} : {} }));
  useEffect(() => dispatch({ type: "cards", cards: cards ?? [] }), [cards]);
  useEffect(() => dispatch({ type: "learn", on: flags.learn }), [flags.learn]);
  useEffect(() => dispatch({ type: "layout", layout }), [layout]);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    onOpensChange?.(state.opens);
  }, [state.opens]); // eslint-disable-line react-hooks/exhaustive-deps

  const lanes = visibleLanes(state.layout, flags);
  const shownStrip = useMemo(() => strip ?? contextStrip({ now: now ?? new Date(), unread: 0, nextEvent: null, shelfCount: 0 }), [strip, now]);
  const byId = useMemo(() => new Map(state.cards.map((c) => [c.id, c])), [state.cards]);

  const pickLayout = (id: LayoutId) => {
    dispatch({ type: "layout", layout: id });
    onLayoutChange?.(id);
  };

  // Arrow keys move between the layout buttons (a radio group).
  const onLayoutKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const i = LAYOUTS.findIndex((l) => l.id === state.layout);
    const next = LAYOUTS[(i + (e.key === "ArrowRight" ? 1 : LAYOUTS.length - 1)) % LAYOUTS.length];
    pickLayout(next.id);
    const btn = (e.currentTarget as HTMLElement).querySelector<HTMLButtonElement>(`[data-layout-id="${next.id}"]`);
    btn?.focus();
  };

  return (
    <section className="mdb" aria-label="Magic Dashboard" data-layout={state.layout}>
      <header className="mdb-head">
        <span className="mdb-orb" aria-hidden="true">
          <LensCloud />
        </span>
        <h1 className="mdb-title">Dashboard</h1>
        <div className="mdb-layouts" role="radiogroup" aria-label="Layout" onKeyDown={onLayoutKey}>
          {LAYOUTS.map((l) => (
            <button
              key={l.id}
              type="button"
              role="radio"
              data-layout-id={l.id}
              aria-checked={state.layout === l.id}
              tabIndex={state.layout === l.id ? 0 : -1}
              className={`mdb-layout${state.layout === l.id ? " on" : ""}`}
              onClick={() => pickLayout(l.id)}
            >
              {l.label}
            </button>
          ))}
        </div>
        {onClose && (
          <button type="button" className="mdb-close" aria-label="Close" onClick={onClose}>
            <X size={14} aria-hidden />
          </button>
        )}
      </header>
      <ContextStrip items={shownStrip} />
      <div className="mdb-lanes">
        {lanes.map((l) => (
          <Lane
            key={l.id}
            spec={l}
            cards={laneCards(state, l.id)}
            onDismiss={(id) => dispatch({ type: "dismiss", id })}
            onOpen={(id) => {
              dispatch({ type: "opened", id });
              const c = byId.get(id);
              if (c) onCardOpen?.(c);
            }}
            onEmptyAction={onEmptyAction ? () => onEmptyAction(l.id) : undefined}
          />
        ))}
      </div>
      <footer className="mdb-foot">
        Everything here comes from Lens on this PC and stays here.
        {flags.learn ? (
          <>
            {" "}Learned ordering is on; moved cards say why.{" "}
            <button type="button" className="mdb-forget" onClick={() => dispatch({ type: "forget" })}>
              Forget what it learned
            </button>
          </>
        ) : null}
      </footer>
    </section>
  );
};
