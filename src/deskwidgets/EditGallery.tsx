// Edit mode for desktop widgets: the gallery panel at the bottom (search, a sidebar of kinds, the
// chosen kind at each size; click a preview or drag it onto the desktop; Done), and the small
// editor for one widget's settings ("Edit “Clock”…"). Previews are the real widgets drawn with
// invented sample data, scaled down; they make no calls.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import type { WidgetStore } from "../widgets/api";
import type { GridItem, Size } from "./grid";
import { rectOf, gridFor } from "./grid";
import { DEFAULT_ZONES, KINDS, SIZE_LABEL, kindDef, parseZones, searchKinds, validZone, type KindDef } from "./model";
import { WIDGETS } from "./Widgets";

export interface AddRequest {
  kind: string;
  size: Size;
  params?: Record<string, string>;
  /** The preview's box on screen (CSS px), so the new widget grows from it. */
  from?: { x: number; y: number; w: number; h: number };
}

type Box = { x: number; y: number; w: number; h: number };
const boxOf = (el: Element | null): Box | undefined => {
  const r = el?.getBoundingClientRect();
  return r ? { x: r.left, y: r.top, w: r.width, h: r.height } : undefined;
};

const PREVIEW_SCALE = 0.5;
const boxStyle = (width: number, height: number): React.CSSProperties => ({ width, height });
const scaledStyle = (width: number, height: number): React.CSSProperties => ({ width, height, transform: `scale(${PREVIEW_SCALE})` });
const PREVIEW_GRID = gridFor(4000, 4000);

/** The Dashboard widgets a weather or gallery kind can show. */
function choices(kind: string, store: WidgetStore | null | undefined) {
  const all = store?.widgets ?? [];
  return kind === "weather" ? all.filter((w) => w.galleryId === "weather") : kind === "gallery" ? all.filter((w) => w.galleryId !== "weather") : [];
}

const Preview: React.FC<{ kind: string; size: Size; params: Record<string, string>; onAdd: (from?: Box) => void; onDrag: (x: number, y: number, box: Box) => void }> = ({ kind, size, params, onAdd, onDrag }) => {
  const box = useRef<HTMLSpanElement>(null);
  const Widget = WIDGETS[kind];
  const r = rectOf(0, 0, size, PREVIEW_GRID);
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const dragged = useRef(false);
  const name = kindDef(kind)?.name ?? kind;
  return (
    <button
      type="button"
      className="dwg-preview"
      data-weight="heavy"
      data-preview={`${kind}:${size}`}
      aria-label={`Add ${name}, ${SIZE_LABEL[size].toLowerCase()}`}
      onPointerDown={(e) => {
        dragged.current = false;
        start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
      }}
      onPointerMove={(e) => {
        const s = start.current;
        if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > 6) {
          start.current = null;
          dragged.current = true;
          onDrag(e.clientX, e.clientY, boxOf(box.current) ?? { x: e.clientX, y: e.clientY, w: 0, h: 0 });
        }
      }}
      onPointerUp={() => (start.current = null)}
      onClick={() => {
        // A drag that just ended drops the widget itself; only a plain click (or Enter) adds here.
        if (dragged.current) dragged.current = false;
        else onAdd(boxOf(box.current));
      }}
    >
      <span ref={box} className="dwg-preview-box" style={boxStyle(r.w * PREVIEW_SCALE, r.h * PREVIEW_SCALE)}>
        <span className={`dwg-item is-${size} is-preview`} style={scaledStyle(r.w, r.h)} aria-hidden>
          {Widget && <Widget size={size} params={params} preview />}
        </span>
      </span>
      <span className="dwg-preview-label">{SIZE_LABEL[size]}</span>
    </button>
  );
};

export const EditGallery: React.FC<{
  store: WidgetStore | null;
  preview?: boolean;
  onAdd: (r: AddRequest) => void;
  onDragStart: (r: AddRequest, x: number, y: number, box: Box) => void;
  panelRef?: React.Ref<HTMLElement>;
  /** Gliding back to the bottom after Done: no longer interactive. */
  leaving?: boolean;
  onDone: () => void;
  onOpenDashboard: () => void;
}> = ({ store, preview, onAdd, onDragStart, onDone, onOpenDashboard, panelRef, leaving }) => {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string>("clock");
  const [pick, setPick] = useState<string>("");
  const search = useRef<HTMLInputElement>(null);
  const list = useMemo(() => searchKinds(q, KINDS), [q]);
  const kind: KindDef | undefined = list.find((k) => k.id === sel) ?? list[0];
  const opts = kind ? choices(kind.id, store) : [];
  const ref = opts.find((o) => o.id === pick)?.id ?? opts[0]?.id;
  const needsDashboard = !!kind?.fetches && !preview && opts.length === 0;

  useEffect(() => {
    if (!preview) search.current?.focus();
  }, [preview]);

  const req = (size: Size): AddRequest => ({ kind: kind!.id, size, params: kind?.fetches && ref ? { ref } : kind?.id === "clock" ? { zones: DEFAULT_ZONES.join(",") } : {} });

  return (
    <section ref={panelRef} className="dwg-panel" aria-label="Widget gallery" inert={leaving || undefined}>
      <header className="dwg-panel-head">
        <label className="dwg-search">
          <Search size={13} aria-hidden />
          <input ref={search} value={q} onChange={(e) => setQ(e.currentTarget.value)} placeholder="Search widgets" aria-label="Search widgets" />
        </label>
        <span className="dwg-hint">Click a widget to add it, or drag it onto the desktop.</span>
        <button type="button" data-weight="heavy" className="dwg-done" onClick={onDone}>
          Done
        </button>
      </header>
      <div className="dwg-panel-body">
        <ul className="dwg-kinds" role="listbox" aria-label="Kinds of widget">
          {list.map((k) => (
            <li key={k.id} role="presentation">
              <button type="button" data-weight="light" role="option" aria-selected={k.id === kind?.id} className={`dwg-kind${k.id === kind?.id ? " is-on" : ""}`} data-kind={k.id} onClick={() => setSel(k.id)}>
                {k.name}
              </button>
            </li>
          ))}
          {!list.length && <li role="presentation" className="dwg-kind-none">No widget matches “{q}”.</li>}
        </ul>
        {kind && (
          <div className="dwg-kind-detail">
            <div className="dwg-kind-head">
              <h3>{kind.name}</h3>
              <p>{kind.desc}</p>
              {opts.length > 1 && (
                <label className="dwg-pick">
                  Show
                  <select value={ref} onChange={(e) => setPick(e.currentTarget.value)}>
                    {opts.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.title}
                        {o.params.place ? ` · ${o.params.place}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            {needsDashboard ? (
              <div className="dwg-needs">
                <p>
                  {kind.id === "weather"
                    ? "Weather comes from a Weather widget on the Dashboard: add it there first. It asks which site Lens may fetch from before anything is fetched."
                    : "Add a widget on the Dashboard first; it can then sit on your desktop too."}
                </p>
                <button type="button" data-weight="heavy" className="dwg-done" onClick={onOpenDashboard}>
                  Open the Dashboard
                </button>
              </div>
            ) : (
              <div className="dwg-previews">
                {kind.sizes.map((s) => (
                  <Preview key={s} kind={kind.id} size={s} params={req(s).params ?? {}} onAdd={(from) => onAdd({ ...req(s), from })} onDrag={(x, y, b) => onDragStart(req(s), x, y, b)} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
};

/** "Edit “Clock”…": the few settings a widget has. */
export const WidgetEditor: React.FC<{ item: GridItem; store: WidgetStore | null; onChange: (p: Record<string, string>) => void; onClose: () => void }> = ({ item, store, onChange, onClose }) => {
  const def = kindDef(item.kind);
  const [zones, setZones] = useState(() => parseZones(item.params.zones));
  const opts = choices(item.kind, store);
  const bad = zones.filter((z) => !validZone(z.trim()));
  return (
    <section className="dwg-editor" role="dialog" aria-label={`Edit ${def?.name ?? "widget"}`}>
      <h3>Edit “{def?.name ?? item.kind}”</h3>
      {item.kind === "clock" ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!bad.length) {
              onChange({ ...item.params, zones: zones.map((z) => z.trim()).join(",") });
              onClose();
            }
          }}
        >
          <p className="dwg-fine">Four places for the world clock (medium and large). Time zone names such as Europe/Paris; “local” is this PC.</p>
          {zones.map((z, i) => (
            <label key={i} className="dwg-field">
              <span>City {i + 1}</span>
              <input value={z} aria-invalid={!validZone(z.trim())} onChange={(e) => setZones(zones.map((x, j) => (j === i ? e.currentTarget.value : x)))} />
            </label>
          ))}
          {bad.length > 0 && <p className="dwg-fine is-bad">Not a time zone: {bad.join(", ")}</p>}
          <div className="dwg-editor-bar">
            <button type="submit" data-weight="heavy" className="dwg-done" disabled={bad.length > 0}>
              Save
            </button>
            <button type="button" data-weight="medium" className="dwg-plain" onClick={onClose}>
              Cancel
            </button>
          </div>
        </form>
      ) : opts.length ? (
        <>
          <label className="dwg-field">
            <span>Show</span>
            <select value={item.params.ref ?? opts[0].id} onChange={(e) => onChange({ ...item.params, ref: e.currentTarget.value })}>
              {opts.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.title}
                  {o.params.place ? ` · ${o.params.place}` : ""}
                </option>
              ))}
            </select>
          </label>
          <p className="dwg-fine">Change its place or address on the Dashboard; its approved sites are under Sources there.</p>
          <div className="dwg-editor-bar">
            <button type="button" data-weight="heavy" className="dwg-done" onClick={onClose}>
              Done
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="dwg-fine">{def?.id === "notes" ? "Shows your newest Lens Notes. Click one to open it." : def?.id === "today" ? "Shows today's open items from the Lens calendar; tick one to mark it done." : "Nothing to set for this widget. Change its size from its menu."}</p>
          <div className="dwg-editor-bar">
            <button type="button" data-weight="heavy" className="dwg-done" onClick={onClose}>
              Done
            </button>
          </div>
        </>
      )}
    </section>
  );
};
