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
import { captureFlip, glide, usePresence } from "../ui/motion";
import { usePressWeight } from "./press";
import { DURATION_MS, EASE, reducedMotion } from "../ui/motion/tokens";
import { EMPTY_STORE, WIDGETS_CHANGED, widgetsApi, type WidgetStore } from "../widgets/api";
import { addItem, gridFor, layout, moveTo, newId, rectOf, removeItem, resize, settle, snapCell, cellAt, type Grid, type GridItem, type Size } from "./grid";
import { flyFrom, flyStagger, kindDef, SIZE_LABEL } from "./model";
import { WIDGETS } from "./Widgets";
import { EditGallery, WidgetEditor, type AddRequest } from "./EditGallery";
import { setTickPaused as pauseTick } from "./tick";

/** The one clock stops, and so do the CSS sweeps, while nothing can be seen. */
function setTickPaused(p: boolean) {
  pauseTick(p);
  document.documentElement.classList.toggle("dwg-paused", p);
}
import { deskApi, EVT_EDIT, EVT_FLYOUT, EVT_STATE, type DeskApi, type FlyoutEvent } from "./api";
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
  /** Where the pointer holds the carried preview, and its size (CSS px). */
  ox: number;
  oy: number;
  w: number;
  h: number;
}

type Box = { x: number; y: number; w: number; h: number };

const toItems = (d: DeskItem[]): GridItem[] => d.map((i) => ({ ...i }));
const toDesk = (g: GridItem[]): DeskItem[] => g.map((i) => ({ id: i.id, kind: i.kind, size: i.size, col: i.col, row: i.row, params: i.params }));
const quiet = () => {};

export interface DeskWidgetsProps {
  api?: DeskApi;
  /** Parity/preview: start from these instead of asking Lens. */
  initial?: { key: string; items: DeskItem[]; editing?: boolean; flyout?: boolean; out?: boolean };
}

/** One fly-out (or draw-in) leg: the widgets travel this long, plus the stagger. */
const FLY_MS = DURATION_MS.slower;
const FLY_SPAN = 160;

/**
 * Flies every widget out of `origin` to its place (dir "out"), or draws it back in ("in").
 * Each widget has one animation from "shrunk onto the origin" to "in place"; drawing in plays the
 * same animation backwards, so the two legs mirror each other and either can turn round mid-way
 * (an Alt+W pressed again while they are still flying). Transform and opacity only.
 */
function fly(root: HTMLElement | null, anims: Map<string, Animation>, dir: "out" | "in", origin: { x: number; y: number }): Promise<void> {
  const els = Array.from(root?.querySelectorAll<HTMLElement>(".dwg-item[data-id]") ?? []);
  const reduce = reducedMotion();
  const rects = els.map((el) => ({ x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight }));
  const delays = flyStagger(rects, origin, 32, FLY_SPAN);
  const max = Math.max(0, ...delays);
  const done: Promise<unknown>[] = [];
  els.forEach((el, i) => {
    const id = el.dataset.id!;
    let a = anims.get(id);
    if (!a) {
      const f = flyFrom(rects[i], origin);
      const from = reduce ? { opacity: 0 } : { transform: `translate(${f.dx}px, ${f.dy}px) scale(${f.scale})`, opacity: 0 };
      const to = reduce ? { opacity: 1 } : { transform: "translate(0px, 0px) scale(1)", opacity: 1 };
      a = el.animate([from, { opacity: 1, offset: 0.4 }, to], {
        duration: reduce ? DURATION_MS.fast : FLY_MS,
        delay: reduce ? 0 : delays[i],
        endDelay: reduce ? 0 : max - delays[i],
        easing: EASE.out,
        fill: "both",
      });
      anims.set(id, a);
      if (dir === "in") {
        // Already out without an animation (the page loaded while out): start from "in place".
        a.finish();
        a.reverse();
      }
    } else if ((dir === "out") !== a.playbackRate > 0) {
      a.reverse();
    } else if (a.playState !== "finished") {
      a.play();
    }
    done.push(a.finished.catch(quiet));
  });
  return Promise.all(done).then(quiet);
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
  // Widget flyout: widgets tucked away until called, then flown out over the desktop.
  const [flyMode, setFlyMode] = useState(!!initial?.flyout);
  /** The widgets are on screen in flyout mode (out, or flying either way). */
  const [flown, setFlown] = useState(!!initial?.out);
  const [flyOut, setFlyOut] = useState(!!initial?.out);
  const flyAnims = useRef(new Map<string, Animation>());
  const flyDir = useRef<{ dir: "out" | "in"; origin: { x: number; y: number } | null; gen: number } | null>(null);
  const flyGen = useRef(0);
  const [flyTick, setFlyTick] = useState(0);
  const lastOrigin = useRef<{ x: number; y: number } | null>(null);
  const keyRef = useRef(key);
  keyRef.current = key;
  const root = useRef<HTMLDivElement>(null);
  const flip = useRef<{ play: () => void } | null>(null);
  /** A widget just added from the gallery grows from its preview (DESIGN.md §5.3). */
  const grow = useRef<{ id: string; from: Box } | null>(null);
  usePressWeight(root);
  // The gallery rises from the bottom and returns there; the dim fades. Both interruptible.
  const panel = usePresence<HTMLElement>(editing, { animateEnter: false, enter: { y: 28, opacity: 0 }, enterOptions: { duration: "slow", ease: "out", additive: true }, exit: { y: 28, opacity: 0 }, exitOptions: { duration: "exit", ease: "exit", additive: true } });
  const dim = usePresence<HTMLDivElement>(editing, { animateEnter: false, exit: { opacity: 0 }, exitOptions: { duration: "exit", ease: "exit" } });

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

  /** Everything from Lens; `layoutOnly` (the host moved to another monitor) keeps the flyout as it is. */
  const load = useCallback(async (layoutOnly = false) => {
    if (initial) return;
    try {
      const s = await api.state();
      setKey(s.key);
      setItems(toItems(s.items));
      if (layoutOnly) return;
      setEditing(s.editing);
      setFlyMode(s.flyout);
      setFlown(s.out);
      setFlyOut(s.out);
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
            if (k && k !== p.key) void load(true);
            return p.key;
          });
        }
      }),
    );
    keep(
      listen<FlyoutEvent>(EVT_FLYOUT, async (e) => {
        const p = e.payload;
        const gen = ++flyGen.current;
        if (typeof p.mode === "boolean") {
          // The setting itself changed: start tucked away (or, turned off, just on the desktop).
          flyAnims.current.forEach((a) => a.cancel());
          flyAnims.current.clear();
          setFlyMode(p.mode);
          setFlown(false);
          setFlyOut(false);
          return;
        }
        if (p.out) {
          // Out on another monitor: that monitor's widgets first, then they fly.
          if (p.key && p.key !== keyRef.current) {
            try {
              const s = await api.state();
              if (gen !== flyGen.current) return;
              setKey(s.key);
              setItems(toItems(s.items));
            } catch {
              /* the widgets this page has */
            }
          }
          flyDir.current = { dir: "out", origin: p.origin ? { x: p.origin[0], y: p.origin[1] } : null, gen };
          setFlown(true);
          setFlyOut(true);
        } else {
          flyDir.current = { dir: "in", origin: null, gen };
          setFlyOut(false);
        }
        setFlyTick((t) => t + 1);
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
    const g = grow.current;
    grow.current = null;
    const el = g && root.current?.querySelector<HTMLElement>(`.dwg-item[data-id="${CSS.escape(g.id)}"]`);
    if (g && el && !reducedMotion()) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        glide(el, { x: g.from.x - r.left, y: g.from.y - r.top, scaleX: g.from.w / r.width, scaleY: g.from.h / r.height, opacity: 0.9 }, { opacity: 1 }, { duration: "slow", ease: "out", origin: "0 0" });
      }
    }
  }, [items]);

  // The flyout's legs, once the widgets for this leg are on the page. They fly from the origin
  // Lens sent (a hot corner) or from the top-left cell, where the Calendar lives.
  useLayoutEffect(() => {
    const d = flyDir.current;
    if (!d) return;
    flyDir.current = null;
    const corner = rectOf(0, 0, "small", grid);
    const origin = d.dir === "out" ? (d.origin ?? { x: corner.x, y: corner.y }) : (lastOrigin.current ?? { x: corner.x, y: corner.y });
    lastOrigin.current = origin;
    void fly(root.current, flyAnims.current, d.dir, origin).then(() => {
      if (flyGen.current !== d.gen) return; // turned round mid-way: the newer leg finishes the job
      // Done: drop the animations (in place they change nothing, and they would hold a drag still).
      flyAnims.current.forEach((a) => a.cancel());
      flyAnims.current.clear();
      if (d.dir === "in") setFlown(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyTick]);

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
      else if (flyMode && flyOut) putAway();
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  });

  const putAway = () => {
    setMenu(null);
    if (initial) {
      flyDir.current = { dir: "in", origin: null, gen: ++flyGen.current };
      setFlyOut(false);
      setFlyTick((t) => t + 1);
    } else void api.flyout(false).catch(quiet);
  };
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
    const id = newId(req.kind);
    if (req.from) grow.current = { id, from: req.from };
    commit(addItem(items, { id, kind: req.kind, size: req.size, params: req.params ?? {}, ...(at ?? {}) }, grid));
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
      if (cell) addRef.current({ ...d.req, from: { x: e.clientX - d.ox, y: e.clientY - d.oy, w: d.w, h: d.h } }, cell);
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
      className={`dwg${editing ? " is-editing" : ""}${drag?.moved ? " is-dragging" : ""}${flyMode ? " is-fly" : ""}${flyMode && flown ? (flyOut ? " is-out" : " is-tucking") : ""}`}
      data-ready={ready ? "1" : undefined}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => setDrag(null)}
    >
      {flyMode && flown && !editing && <div className={`dwg-flydim${flyOut ? "" : " is-leaving"}`} onPointerDown={putAway} aria-hidden />}
      {dim.mounted && <div ref={dim.ref} className="dwg-dim" aria-hidden />}
      {(menu || editing) && <div className="dwg-catch" onPointerDown={() => setMenu(null)} aria-hidden />}
      {snap && dragging && <div className="dwg-ghost" style={ghostStyle(rectOf(snap.col, snap.row, dragging.size, grid))} aria-hidden />}
      {newDrag && newDragCell && <div className="dwg-ghost" style={ghostStyle(rectOf(newDragCell.col, newDragCell.row, newDrag.req.size, grid))} aria-hidden />}
      {newDrag && <CarriedPreview drag={newDrag} />}
      {(!flyMode || flown || editing) && placed.map((p) => {
        const Widget = WIDGETS[p.kind];
        const r = rectOf(p.col, p.row, p.size, grid);
        const isDrag = drag?.moved && drag.id === p.id;
        const name = kindDef(p.kind)?.name ?? p.kind;
        return (
          <div
            key={p.id}
            className={`dwg-item is-${p.size}${isDrag ? " is-lifted" : ""}`}
            data-weight="medium"
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
              <button type="button" data-weight="medium" className="dwg-remove" aria-label={`Remove ${name}`} onClick={() => void remove(p.id)}>
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
            <button key={s} type="button" role="menuitemradio" aria-checked={menuItem.size === s} data-weight="light" className="dwg-menu-row" onClick={() => setSize(menuItem.id, s)}>
              <span className="dwg-menu-check" aria-hidden>{menuItem.size === s ? "✓" : ""}</span>
              {SIZE_LABEL[s]}
            </button>
          ))}
          <hr />
          <button type="button" role="menuitem" data-weight="light" className="dwg-menu-row" onClick={() => void enterEdit(menuItem.id)}>
            <span className="dwg-menu-check" aria-hidden />
            Edit “{kindDef(menuItem.kind)?.name ?? "widget"}”…
          </button>
          <button type="button" role="menuitem" data-weight="light" className="dwg-menu-row" onClick={() => void remove(menuItem.id)}>
            <span className="dwg-menu-check" aria-hidden />
            Remove Widget
          </button>
          <hr />
          <button type="button" role="menuitem" data-weight="light" className="dwg-menu-row" onClick={() => void enterEdit()}>
            <span className="dwg-menu-check" aria-hidden />
            Edit Widgets…
          </button>
        </div>
      )}
      {editing && overflow.length > 0 && <p className="dwg-overflow">{overflow.length === 1 ? "One widget doesn't fit on this screen." : `${overflow.length} widgets don't fit on this screen.`} Make room or remove one.</p>}
      {panel.mounted && (
        <EditGallery
          panelRef={panel.ref}
          leaving={!editing}
          store={store}
          preview={!!initial}
          onAdd={(req) => add(req)}
          onDragStart={(req, x, y, box) => setNewDrag({ req, x, y, ox: x - box.x, oy: y - box.y, w: box.w, h: box.h })}
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

/** The preview being carried out of the gallery, under the pointer where it was picked up. */
const CarriedPreview: React.FC<{ drag: NewDrag }> = ({ drag }) => {
  const Widget = WIDGETS[drag.req.kind];
  const full = rectOf(0, 0, drag.req.size, gridFor(4000, 4000));
  return (
    <div className="dwg-carry" style={ghostStyle({ x: drag.x - drag.ox, y: drag.y - drag.oy, w: drag.w, h: drag.h })} aria-hidden>
      <span className={`dwg-item is-${drag.req.size} is-preview`} style={scaleStyle(full.w, full.h, drag.w / full.w)}>
        {Widget && <Widget size={drag.req.size} params={drag.req.params ?? {}} preview />}
      </span>
    </div>
  );
};

function scaleStyle(width: number, height: number, k: number): React.CSSProperties {
  return { width, height, transform: `scale(${k})` };
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
