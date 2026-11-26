// Magic Dashboard shell (docs/plans/MAGIC_WAVES.md §4, wave M0). Renders lanes for the chosen
// layout with their empty states; no source is connected and nothing is fetched yet. Only shown
// when config.magicWaves.dashboard is on (or in the parity harness / Tester preview).
import React, { useMemo, useReducer } from "react";
import { X } from "lucide-react";
import { LensCloud } from "../presence/LensCloud";
import { LAYOUTS, initialState, laneCards, reduce, visibleLanes, contextStrip, type LayoutId } from "./store";
import { Lane } from "./Lane";
import { ContextStrip } from "./ContextStrip";
import "./dashboard.css";

export interface DashboardProps {
  flags: { widgets: boolean; learn: boolean };
  layout?: LayoutId;
  /** Fixed clock for tests and the parity harness. */
  now?: Date;
  onClose?: () => void;
}

export const DashboardSurface = ({ flags, layout = "glance", now, onClose }: DashboardProps) => {
  const [state, dispatch] = useReducer(reduce, undefined, () => initialState({ layout, learn: flags.learn }));
  const lanes = visibleLanes(state.layout, flags);
  const strip = useMemo(() => contextStrip({ now: now ?? new Date(), unread: 0, nextEvent: null, shelfCount: 0 }), [now]);

  return (
    <section className="mdb" aria-label="Magic Dashboard" data-layout={state.layout}>
      <header className="mdb-head">
        <span className="mdb-orb" aria-hidden="true">
          <LensCloud />
        </span>
        <h1 className="mdb-title">Dashboard</h1>
        <div className="mdb-layouts" role="radiogroup" aria-label="Layout">
          {LAYOUTS.map((l) => (
            <button
              key={l.id}
              type="button"
              role="radio"
              aria-checked={state.layout === l.id}
              className={`mdb-layout${state.layout === l.id ? " on" : ""}`}
              onClick={() => dispatch({ type: "layout", layout: l.id })}
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
      <ContextStrip items={strip} />
      <div className="mdb-lanes">
        {lanes.map((l) => (
          <Lane
            key={l.id}
            spec={l}
            cards={laneCards(state, l.id)}
            onDismiss={(id) => dispatch({ type: "dismiss", id })}
            onOpen={(id) => dispatch({ type: "opened", id })}
          />
        ))}
      </div>
      <footer className="mdb-foot">
        Everything here stays on this PC. Each source asks before it connects.
        {flags.learn ? " Learned ordering is on; cards say why they moved." : ""}
      </footer>
    </section>
  );
};
