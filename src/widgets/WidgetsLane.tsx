// The Dashboard's Widgets lane (wave M2): your widgets in order, the gallery with a consent screen
// that names every site a widget will fetch from, a Sources page to take approvals back, and one
// switch that stops all widget fetching. Lens fetches; widgets never touch the network.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, LayoutGrid, Plus, ShieldCheck, X } from "lucide-react";
import { AdaptiveCard } from "./AdaptiveCard";
import { validateCard, type CardElement } from "./format";
import { GALLERY, galleryDef, initialParams, type WidgetDef } from "./gallery";
import { EMPTY_STORE, WIDGETS_CHANGED, widgetsApi, type WidgetInstance, type WidgetStore, type WidgetsApi } from "./api";
import { PluginSlot } from "../components/PluginSlot";
import "./widgets.css";

type View = { kind: "list" } | { kind: "gallery" } | { kind: "form"; def: WidgetDef } | { kind: "consent"; def: WidgetDef; params: Record<string, string> } | { kind: "sources" };

/** What a widget shows: its card, or a plain problem. */
export function useWidgetCard(inst: WidgetInstance, def: WidgetDef | undefined, api: WidgetsApi, fetchOff: boolean, tick: number) {
  const [state, setState] = useState<{ body: CardElement[]; note: string | null; loading: boolean }>({ body: [], note: null, loading: true });
  useEffect(() => {
    let live = true;
    const done = (body: CardElement[], note: string | null) => live && setState({ body, note, loading: false });
    if (!def) {
      done([], "This widget isn't in the gallery any more. Remove it?");
      return;
    }
    const now = new Date();
    if (def.local) {
      (def.id === "system" ? api.telemetry() : Promise.resolve(null)).then((telemetry) => {
        const c = validateCard(def.toCard("", inst.params, { now, telemetry }), []);
        done(c.body, null);
      });
      return () => void (live = false);
    }
    const url = def.url(inst.params);
    if (fetchOff) return done([], "Widget fetching is turned off."), void 0;
    if (!url) return done([], "This widget's settings aren't complete."), void 0;
    api
      .fetch(inst.id, url, def.refreshMinutes)
      .then((f) => {
        // No remote images yet: the window's CSP keeps img-src local, so cards stay text.
        const c = validateCard(def.toCard(f.body, inst.params, { now }), []);
        done(c.body, c.body.length ? null : "Nothing to show yet.");
      })
      .catch((e) => done([], typeof e === "string" ? e : "The site couldn't be reached."));
    return () => void (live = false);
  }, [inst.id, inst.params, inst.hosts, def, api, fetchOff, tick]);
  return state;
}

const WidgetTile: React.FC<{ inst: WidgetInstance; api: WidgetsApi; fetchOff: boolean; tick: number; first: boolean; last: boolean; onMove: (d: number) => void; onRemove: () => void }> = ({ inst, api, fetchOff, tick, first, last, onMove, onRemove }) => {
  const def = galleryDef(inst.galleryId);
  const card = useWidgetCard(inst, def, api, fetchOff, tick);
  return (
    <li className="mwg-tile" data-widget={inst.galleryId}>
      <div className="mwg-tile-head">
        <span className="mwg-tile-name">{inst.title}</span>
        <span className="mwg-tile-tools">
          <button type="button" aria-label={`Move ${inst.title} up`} disabled={first} onClick={() => onMove(-1)}>
            <ArrowUp size={12} aria-hidden />
          </button>
          <button type="button" aria-label={`Move ${inst.title} down`} disabled={last} onClick={() => onMove(1)}>
            <ArrowDown size={12} aria-hidden />
          </button>
          <button type="button" aria-label={`Remove ${inst.title}`} onClick={onRemove}>
            <X size={12} aria-hidden />
          </button>
        </span>
      </div>
      {card.loading ? <p className="mwg-note">Loading…</p> : card.note ? <p className="mwg-note">{card.note}</p> : <AdaptiveCard body={card.body} onOpenUrl={(u) => void api.openUrl(u)} />}
    </li>
  );
};

/** The "Desktop widgets" switch in the lane's header (docs/features/desktop-widgets.md). */
export interface DesktopSwitch {
  on: boolean;
  onToggle: (on: boolean) => void;
  onEdit: () => void;
}

export const WidgetsLane: React.FC<{ api?: WidgetsApi; initial?: WidgetStore; listen?: (cb: (s: WidgetStore) => void) => () => void; plugins?: boolean; desktop?: DesktopSwitch }> = ({ api = widgetsApi, initial, listen, plugins = true, desktop }) => {
  const [store, setStore] = useState<WidgetStore>(initial ?? EMPTY_STORE);
  const [view, setView] = useState<View>({ kind: "list" });
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!initial) void api.state().then(setStore);
    return listen?.(setStore);
  }, [api, initial, listen]);
  // Refresh once a minute while the Dashboard is showing (cached answers don't refetch early).
  useEffect(() => {
    const t = window.setInterval(() => document.visibilityState === "visible" && setTick((n) => n + 1), 60_000);
    return () => window.clearInterval(t);
  }, []);

  const run = useCallback(async (p: Promise<WidgetStore>) => {
    setError(null);
    try {
      setStore(await p);
      return true;
    } catch (e) {
      setError(typeof e === "string" ? e : "That didn't work.");
      return false;
    }
  }, []);

  const head = (
    <div className="mwg-bar">
      <button type="button" className="mwg-btn" onClick={() => setView({ kind: "gallery" })}>
        <Plus size={12} aria-hidden /> Add a widget
      </button>
      <button type="button" className="mwg-btn" onClick={() => setView({ kind: "sources" })}>
        <ShieldCheck size={12} aria-hidden /> Sources
      </button>
      {desktop && (
        <span className="mwg-desk">
          <label className="mwg-switch">
            <input type="checkbox" checked={desktop.on} onChange={(e) => desktop.onToggle(e.currentTarget.checked)} />
            Desktop widgets
          </label>
          {desktop.on && (
            <button type="button" className="mwg-btn" onClick={desktop.onEdit}>
              <LayoutGrid size={12} aria-hidden /> Edit widgets…
            </button>
          )}
        </span>
      )}
    </div>
  );

  if (view.kind === "gallery") {
    return (
      <div className="mwg" data-view="gallery">
        <div className="mwg-sub">
          <h3>Widget gallery</h3>
          <button type="button" className="mwg-link" onClick={() => setView({ kind: "list" })}>
            Back
          </button>
        </div>
        <ul className="mwg-gallery" role="list">
          {GALLERY.map((g) => (
            <li key={g.id}>
              <button type="button" className="mwg-gallery-item" data-gallery-id={g.id} onClick={() => (g.params.length ? setView({ kind: "form", def: g }) : setView({ kind: "consent", def: g, params: {} }))}>
                <span className="mwg-gallery-name">{g.name}</span>
                <span className="mwg-gallery-desc">{g.desc}</span>
                <span className="mwg-gallery-net">{g.local ? "Works offline" : `Fetches from ${g.hosts(initialParams(g)).join(", ") || "the site you choose"}`}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (view.kind === "form") {
    return <WidgetForm def={view.def} onBack={() => setView({ kind: "gallery" })} onNext={(params) => setView({ kind: "consent", def: view.def, params })} />;
  }

  if (view.kind === "consent") {
    const hosts = view.def.hosts(view.params);
    return (
      <div className="mwg mwg-consent" data-view="consent" role="group" aria-label={`Add ${view.def.name}`}>
        <h3>Add {view.def.name}?</h3>
        {view.def.local ? (
          <p>This widget works on this PC only. It doesn't use the network.</p>
        ) : (
          <>
            <p>Lens will fetch data for this widget from:</p>
            <ul className="mwg-hosts">
              {hosts.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
            <p className="mwg-fine">
              Only these sites, only while the Dashboard (or this widget on your desktop) is showing, at most every {view.def.refreshMinutes} minutes. The widget itself never gets network access. You can take this back any time under Sources.
            </p>
          </>
        )}
        <p className="mwg-fine">Data: {view.def.credit}</p>
        {error && <p className="mwg-error" role="alert">{error}</p>}
        <div className="mwg-bar">
          <button
            type="button"
            className="mwg-btn mwg-primary"
            onClick={async () => {
              if (await run(api.add(view.def.id, view.def.name, view.params, hosts))) setView({ kind: "list" });
            }}
          >
            {view.def.local ? "Add" : "Allow and add"}
          </button>
          <button type="button" className="mwg-btn" onClick={() => setView({ kind: "list" })}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (view.kind === "sources") {
    const remote = store.widgets.filter((w) => w.hosts.length);
    return (
      <div className="mwg" data-view="sources">
        <div className="mwg-sub">
          <h3>Sources</h3>
          <button type="button" className="mwg-link" onClick={() => setView({ kind: "list" })}>
            Back
          </button>
        </div>
        <label className="mwg-switch">
          <input type="checkbox" checked={store.fetchOff} onChange={(e) => void run(api.setFetchOff(e.currentTarget.checked))} />
          Stop all widget fetching
        </label>
        {remote.length === 0 ? (
          <p className="mwg-note">No widget fetches from anywhere.</p>
        ) : (
          <ul className="mwg-sources" role="list">
            {remote.map((w) =>
              w.hosts.map((h) => (
                <li key={`${w.id}:${h}`}>
                  <span>
                    <b>{h}</b> for {w.title}
                  </span>
                  <button type="button" className="mwg-link" onClick={() => void run(api.revokeHost(w.id, h))}>
                    Remove
                  </button>
                </li>
              )),
            )}
          </ul>
        )}
        {error && <p className="mwg-error" role="alert">{error}</p>}
      </div>
    );
  }

  return (
    <div className="mwg" data-view="list">
      {head}
      {store.fetchOff && <p className="mwg-note">Widget fetching is turned off. Local widgets still work.</p>}
      {error && <p className="mwg-error" role="alert">{error}</p>}
      {store.widgets.length === 0 ? (
        <p className="mwg-note">No widgets yet. Each one asks before it fetches anything.</p>
      ) : (
        <ul className="mwg-list" role="list">
          {store.widgets.map((w, i) => (
            <WidgetTile
              key={w.id}
              inst={w}
              api={api}
              fetchOff={store.fetchOff}
              tick={tick}
              first={i === 0}
              last={i === store.widgets.length - 1}
              onMove={(d) => void run(api.move(w.id, d))}
              onRemove={() => void run(api.remove(w.id))}
            />
          ))}
        </ul>
      )}
      {/* Richer widgets from plugins: sandboxed frames with no network (connect-src 'none'). */}
      {plugins && <PluginSlot slot="widgets" />}
    </div>
  );
};

const WidgetForm: React.FC<{ def: WidgetDef; onBack: () => void; onNext: (p: Record<string, string>) => void }> = ({ def, onBack, onNext }) => {
  const [params, setParams] = useState<Record<string, string>>(() => initialParams(def));
  const problem = useMemo(() => def.check?.(params) ?? null, [def, params]);
  return (
    <form
      className="mwg mwg-form"
      data-view="form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!problem) onNext(params);
      }}
    >
      <div className="mwg-sub">
        <h3>{def.name}</h3>
        <button type="button" className="mwg-link" onClick={onBack}>
          Back
        </button>
      </div>
      {def.params.map((p) => (
        <label key={p.key} className="mwg-field">
          <span>{p.label}</span>
          <input value={params[p.key] ?? ""} placeholder={p.placeholder} onChange={(e) => setParams({ ...params, [p.key]: e.currentTarget.value })} />
          {p.help && <small>{p.help}</small>}
        </label>
      ))}
      {problem && <p className="mwg-note">{problem}</p>}
      <div className="mwg-bar">
        <button type="submit" className="mwg-btn mwg-primary" disabled={!!problem}>
          Next
        </button>
      </div>
    </form>
  );
};
