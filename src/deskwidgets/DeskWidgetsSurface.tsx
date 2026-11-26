// The desktop widgets host window (`deskwidgets`; docs/features/desktop-widgets.md). It covers the
// work area of Lens's monitor, just above the desktop and below every app window; Rust makes it
// click-through except over the rectangles this page reports, hides it for fullscreen apps and
// protected games, and brings it to the front only in edit mode.
//
// Widgets sit on a snapping grid from the top-left. Moving, adding, resizing and removing reflow
// the others with FLIP (transform and opacity only, through src/ui/motion; reduced motion: none).
// Right-click a widget: Small / Medium / Large, Edit "<name>"…, Remove Widget, Edit Widgets….
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { Minus } from "lucide-react";
import type { DeskItem } from "../types/generated";
import { useLensState } from "../hooks/useLensState";
import { captureFlip, glide } from "../ui/motion";
import { reducedMotion } from "../ui/motion/tokens";
import { EMPTY_STORE, WIDGETS_CHANGED, widgetsApi, type WidgetStore } from "../widgets/api";
import { addItem, gridFor, layout, moveTo, newId, rectOf, removeItem, resize, settle, snapCell, cellAt, type Grid, type GridItem, type Size } from "./grid";
import { kindDef, SIZE_LABEL } from "./model";
import { WIDGETS } from "./Widgets";
import { EditGallery, WidgetEditor, type AddRequest } from "./EditGallery";
import { setTickPaused as pauseTick } from "./tick";

/** The one clock stops, and so do the CSS sweeps, while nothing can be seen. */
function setTickPaused(p: boolean) {
  pauseTick(p);
  document.documentElement.classList.toggle("dwg-paused", p);
}
import { deskApi, EVT_EDIT, EVT_STATE, type DeskApi } from "./api";
import "./deskwidgets.css";

interface Menu {
  id: string;
  x: number;
  y: number;
}

interface Drag {
  id: string;
  /** Pointer offset inside the widget. */
  ox: number;
  oy: number;
  x: number;
  y: number;
  moved: boolean;
  startX: number;
  startY: number;
}

/** A drag that started from a gallery preview. */
interface NewDrag {
  req: AddRequest;
  x: number;
  y: number;
}

const toItems = (d: DeskItem[]): GridItem[] => d.map((i) => ({ ...i }));
const toDesk = (g: GridItem[]): DeskItem[] => g.map((i) => ({ id: i.id, kind: i.kind, size: i.size, col: i.col, row: i.row, params: i.params }));
const quiet = () => {};

export interface DeskWidgetsProps {
  api?: DeskApi;
  /** Parity/preview: start from these instead of asking Lens. */
  initial?: { key: string; items: DeskItem[]; editing?: boolean };
}

export const DeskWidgetsSurface: React.FC<DeskWidgetsProps> = ({ api = deskApi, initial }) => {
  const { config } = useLensState();
  const [key, setKey] = useState(initial?.key ?? "");
  const [items, setItems] = useState<GridItem[]>(initial ? toItems(initial.items) : []);
  const [ready, setReady] = useState(!!initial);
  const [editing, setEditing] = useState(!!initial?.editing);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [editor, setEditor] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [newDrag, setNewDrag] = useState<NewDrag | null>(null);
  const [store, setStore] = useState<WidgetStore>(EMPTY_STORE);
  const [view, setView] = useState({ w: window.innerWidth, h: window.innerHeight });
  const [error, setError] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const flip = useRef<{ play: () => void } | null>(null);

  useEffect(() => {
    document.documentElement.classList.add("dwg-page");
    const on = () => setView({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);

  // The Top Bar keeps its strip; widgets start below it.
  const topInset = config?.topBar?.enabled ? (config.topBar.height ?? 34) + (config.topBar.floating ? 10 : 0) : 0;
  const grid: Grid = useMemo(() => gridFor(view.w, view.h, { topInset }), [view.w, view.h, topInset]);
  const { placed, overflow } = useMemo(() => layout(items, grid), [items, grid]);

  const load = useCallback(async () => {
    if (initial) return;
    try {
      const s = await api.state();
      setKey(s.key);
      setItems(toItems(s.items));
      setEditing(s.editing);
      setTickPaused(!s.shown || s.covered);
      setReady(true);
    } catch (e) {
      setError(typeof e === "string" ? e : "Desktop widgets couldn't load.");
    }
  }, [api, initial]);

  useEffect(() => {
    void load();
    if (initial) return;
    let alive = true;
    const offs: (() => void)[] = [];
    const keep = (p: Promise<() => void>) => p.then((u) => (alive ? offs.push(u) : u())).catch(quiet);
    keep(listen<boolean>(EVT_EDIT, (e) => {
      setEditing(!!e.payload);
      if (!e.payload) {
        setEditor(null);
        setNewDrag(null);
      }
    }));
    keep(
      listen<{ shown: boolean; covered: boolean; key: string }>(EVT_STATE, (e) => {
        const p = e.payload;
        // Nothing ticks while the widgets can't be seen (a game in front, covered by windows).
        setTickPaused(!p.shown || p.covered);
        if (p.key) {
          setKey((k) => {
            if (k && k !== p.key) void load();
            return p.key;
          });
        }
      }),
    );
    keep(listen<WidgetStore>(WIDGETS_CHANGED, (e) => setStore(e.payload ?? EMPTY_STORE)));
    void widgetsApi.state().then(setStore);
    return () => {
      alive = false;
      offs.forEach((u) => u());
    };
  }, [load, initial]);

  // Every change the person makes: animate neighbours from where they were (FLIP), then store it.
  const commit = useCallback(
    (next: GridItem[], opts: { resized?: string } = {}) => {
      const els = root.current?.querySelectorAll(".dwg-item") ?? null;
      const cap = reducedMotion() ? null : captureFlip(els);
      flip.current = cap ? { play: () => cap.play({ duration: "slow", ease: "out", mode: (el) => ((el as HTMLElement).dataset.id === opts.resized ? "clip" : "move") }) } : null;
      const settled = settle(next, grid);
      setItems(settled);
      if (!initial && key) void api.save(key, toDesk(settled)).catch((e) => setError(typeof e === "string" ? e : "Couldn't save the layout."));
    },
    [api, grid, initial, key],
  );
  useLayoutEffect(() => {
    flip.current?.play();
    flip.current = null;
  }, [items]);

  // Tell Rust where the widgets are, so only they take the pointer.
  const lastHits = useRef("");
  useLayoutEffect(() => {
    if (initial) return;
    const rects: [number, number, number, number][] = [];
    root.current?.querySelectorAll<HTMLElement>(".dwg-item, .dwg-menu").forEach((el) => {
      const r = el.getBoundingClientRect();
      rects.push([Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]);
    });
    const hold = !!menu || !!drag || !!newDrag;
    const sig = JSON.stringify([rects, hold]);
    if (sig === lastHits.current) return;
    lastHits.current = sig;
    void api.hits(rects, hold);
  });

  // Esc leaves the menu, then the editor, then edit mode.
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (menu) setMenu(null);
      else if (editor) setEditor(null);
      else if (editing) leaveEdit();
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  });

  const leaveEdit = () => {
    setEditor(null);
    setMenu(null);
    if (initial) setEditing(false);
    else void api.edit(false).catch(quiet);
  };
  const enterEdit = async (openEditor?: string) => {
    setMenu(null);
    if (initial) setEditing(true);
    else {
      try {
        await api.edit(true);
        setEditing(true);
      } catch (e) {
        setError(typeof e === "string" ? e : "Edit mode couldn't open.");
        return;
      }
    }
    if (openEditor) setEditor(openEditor);
  };

  const setSize = (id: string, size: Size) => {
    setMenu(null);
    commit(resize(items, id, size, grid), { resized: id });
  };
  const remove = async (id: string) => {
    setMenu(null);
    if (editor === id) setEditor(null);
    const el = root.current?.querySelector(`.dwg-item[data-id="${CSS.escape(id)}"]`);
    await glide(el, { opacity: 1, scale: 1 }, { opacity: 0, scale: 0.9 }, { duration: "fast", ease: "exit", hold: true }).finished;
    commit(removeItem(items, id));
  };
  const add = (req: AddRequest, at?: { col: number; row: number }) => {
    commit(addItem(items, { id: newId(req.kind), kind: req.kind, size: req.size, params: req.params ?? {}, ...(at ?? {}) }, grid));
  };
  const setParams = (id: string, params: Record<string, string>) => commit(items.map((i) => (i.id === id ? { ...i, params } : i)));

  // ---- dragging a widget ----
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>, id: string) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("button, a, input, select, textarea")) return;
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ id, ox: e.clientX - r.left, oy: e.clientY - r.top, x: r.left, y: r.top, moved: false, startX: e.clientX, startY: e.clientY });
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const moved = drag.moved || Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 4;
    setDrag({ ...drag, x: e.clientX - drag.ox, y: e.clientY - drag.oy, moved });
  };
  const onPointerUp = () => {
    if (!drag) return;
    const d = drag;
    setDrag(null);
    if (!d.moved) return;
    const me = placed.find((p) => p.id === d.id);
    if (!me) return;
    const to = snapCell(d.x, d.y, me.size, grid);
    commit(moveTo(items, d.id, to.col, to.row, grid));
  };
  const dragging = drag?.moved ? placed.find((p) => p.id === drag.id) : undefined;
  const snap = dragging && drag ? snapCell(drag.x, drag.y, dragging.size, grid) : null;

  // ---- dragging a new widget out of the gallery ----
  const newDragCell = newDrag ? cellAt(newDrag.x, newDrag.y, grid) : null;
  const newDragRef = useRef<NewDrag | null>(null);
  newDragRef.current = newDrag;
  const addRef = useRef(add);
  addRef.current = add;
  useEffect(() => {
    if (!newDrag) return;
    const move = (e: PointerEvent) => setNewDrag((d) => (d ? { ...d, x: e.clientX, y: e.clientY } : d));
    const up = (e: PointerEvent) => {
      const d = newDragRef.current;
      setNewDrag(null);
      if (!d) return;
      const overPanel = document.elementFromPoint(e.clientX, e.clientY)?.closest(".dwg-panel");
      const cell = overPanel ? null : cellAt(e.clientX, e.clientY, grid);
      if (cell) addRef.current(d.req, cell);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!newDrag, grid]);

  const editorItem = editor ? items.find((i) => i.id === editor) : undefined;
  const menuItem = menu ? placed.find((p) => p.id === menu.id) : undefined;

  return (
    <div
      ref={root}
      className={`dwg${editing ? " is-editing" : ""}${drag?.moved ? " is-dragging" : ""}`}
      data-ready={ready ? "1" : undefined}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => setDrag(null)}
    >
      {editing && <div className="dwg-dim" aria-hidden />}
      {(menu || editing) && <div className="dwg-catch" onPointerDown={() => setMenu(null)} aria-hidden />}
      {snap && dragging && <div className="dwg-ghost" style={ghostStyle(rectOf(snap.col, snap.row, dragging.size, grid))} aria-hidden />}
      {newDrag && newDragCell && <div className="dwg-ghost" style={ghostStyle(rectOf(newDragCell.col, newDragCell.row, newDrag.req.size, grid))} aria-hidden />}
      {placed.map((p) => {
        const Widget = WIDGETS[p.kind];
        const r = rectOf(p.col, p.row, p.size, grid);
        const isDrag = drag?.moved && drag.id === p.id;
        const name = kindDef(p.kind)?.name ?? p.kind;
        return (
          <div
            key={p.id}
            className={`dwg-item is-${p.size}${isDrag ? " is-lifted" : ""}`}
            data-id={p.id}
            data-kind={p.kind}
            data-size={p.size}
            role="group"
            aria-label={`${name} widget, ${SIZE_LABEL[p.size].toLowerCase()}`}
            style={itemStyle(r, isDrag && drag ? { x: drag.x - r.x, y: drag.y - r.y } : null)}
            onPointerDown={(e) => onPointerDown(e, p.id)}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenu({ id: p.id, x: e.clientX, y: e.clientY });
            }}
          >
            {editing && (
              <button type="button" className="dwg-remove" aria-label={`Remove ${name}`} onClick={() => void remove(p.id)}>
                <Minus size={12} aria-hidden />
              </button>
            )}
            {Widget ? <Widget size={p.size} params={p.params} store={store} preview={!!initial && p.kind !== "clock"} /> : <p className="dw-empty">Unknown widget</p>}
          </div>
        );
      })}
      {menu && menuItem && (
        <div className="dwg-menu" role="menu" aria-label={`${kindDef(menuItem.kind)?.name ?? "Widget"} menu`} style={menuStyle(menu, view)}>
          {(["small", "medium", "large"] as Size[]).map((s) => (
            <button key={s} type="button" role="menuitemradio" aria-checked={menuItem.size === s} className="dwg-menu-row" onClick={() => setSize(menuItem.id, s)}>
              <span className="dwg-menu-check" aria-hidden>{menuItem.size === s ? "✓" : ""}</span>
              {SIZE_LABEL[s]}
            </button>
          ))}
          <hr />
          <button type="button" role="menuitem" className="dwg-menu-row" onClick={() => void enterEdit(menuItem.id)}>
            <span className="dwg-menu-check" aria-hidden />
            Edit “{kindDef(menuItem.kind)?.name ?? "widget"}”…
          </button>
          <button type="button" role="menuitem" className="dwg-menu-row" onClick={() => void remove(menuItem.id)}>
            <span className="dwg-menu-check" aria-hidden />
            Remove Widget
          </button>
          <hr />
          <button type="button" role="menuitem" className="dwg-menu-row" onClick={() => void enterEdit()}>
            <span className="dwg-menu-check" aria-hidden />
            Edit Widgets…
          </button>
        </div>
      )}
      {editing && overflow.length > 0 && <p className="dwg-overflow">{overflow.length === 1 ? "One widget doesn't fit on this screen." : `${overflow.length} widgets don't fit on this screen.`} Make room or remove one.</p>}
      {editing && (
        <EditGallery
          store={store}
          preview={!!initial}
          onAdd={(req) => add(req)}
          onDragStart={(req, x, y) => setNewDrag({ req, x, y })}
          onDone={leaveEdit}
          onOpenDashboard={() => {
            leaveEdit();
            void invoke("open_dashboard").catch((e) => setError(typeof e === "string" ? e : "The Dashboard couldn't open."));
          }}
        />
      )}
      {editing && editorItem && <WidgetEditor item={editorItem} store={store} onChange={(p) => setParams(editorItem.id, p)} onClose={() => setEditor(null)} />}
      {error && (
        <p className="dwg-error" role="alert" onClick={() => setError(null)}>
          {error}
        </p>
      )}
    </div>
  );
};

/** A widget's cell, and while it is dragged, how far the pointer has carried it (transform only). */
function itemStyle(r: { x: number; y: number; w: number; h: number }, carry: { x: number; y: number } | null): React.CSSProperties {
  return { left: r.x, top: r.y, width: r.w, height: r.h, ...(carry ? { transform: `translate(${carry.x}px, ${carry.y}px)` } : {}) };
}

function ghostStyle(r: { x: number; y: number; w: number; h: number }): React.CSSProperties {
  return { left: r.x, top: r.y, width: r.w, height: r.h };
}

function menuStyle(m: Menu, view: { w: number; h: number }): React.CSSProperties {
  const W = 220;
  const H = 210;
  return { left: Math.min(m.x, view.w - W - 8), top: Math.min(m.y, view.h - H - 8) };
}

/** The host window for the main entry (src/main.tsx). */
export const DeskWidgetsWindow: React.FC = () => <DeskWidgetsSurface />;
