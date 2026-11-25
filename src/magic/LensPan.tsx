// "Lens ›" in Lens's own right-click menus (docs/RIGHTCLICK.md, "Lens in every menu").
//
//   <LensPan item={{ kind: "dockItem", id, label, path }} itemClassName="dock-ctx-item" onClose={close}>
//     …the menu's usual rows…
//     <LensMenuRow className="dock-ctx-item" />
//   </LensPan>
//
// The row pans the menu sideways into the Magic actions for the same item (hover after a short
// intent delay, click, → / Enter). ← / Esc / Backspace pan back. Picking an action opens the Magic
// window for that item and runs it there, so AI answers, confirmations and undo look the same as
// everywhere else. Only one panel is in the page at a time, so a menu's own arrow-key navigation
// keeps working inside the panel when the panel's rows use the same class.
import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";
import { ActionIcon } from "../context/ActionIcon";
import { DEFAULT_PREFS, type MenuPrefs, type UsageCounts } from "../context/actions";
import { contextMenuGet } from "../context/contract";
import { LensCloud } from "../presence/LensCloud";
import { captureFlip, glide } from "../ui/motion";
import { DEFAULT_MAGIC, magicGetConfig, magicOpen, type MagicConfig } from "./contract";
import { inputFor, PAN_INTENT_MS, panelRows, panKey, type LensItem } from "./lensPanModel";
import type { Row } from "./model";
import "./lens-pan.css";

interface PanCtx {
  item: LensItem;
  panned: boolean;
  /** `byKey`: show the focus ring on the row that receives focus (not for pointer pans). */
  pan: (byKey?: boolean) => void;
  rowRef: React.MutableRefObject<HTMLButtonElement | null>;
}

const Ctx = createContext<PanCtx | null>(null);

/** The small Lens logo used for the row: the rainbow cloud in a 14 px circle. */
export function LensMark() {
  return (
    <span className="lens-pan-mark" aria-hidden="true">
      <LensCloud />
    </span>
  );
}

export function LensPan({
  item,
  children,
  itemClassName = "lens-pan-item",
  onClose,
  className,
  initialPanned = false,
}: {
  item: LensItem;
  children: React.ReactNode;
  /** Class for the panel's rows: use the host menu's row class so it looks and navigates the same. */
  itemClassName?: string;
  /** Close the whole menu (after an action is picked). */
  onClose: () => void;
  className?: string;
  /** Parity scenes only: start panned into the Lens panel. */
  initialPanned?: boolean;
}) {
  const [panned, setPanned] = useState(initialPanned);
  const [cfg, setCfg] = useState<MagicConfig>(DEFAULT_MAGIC);
  const [prefs, setPrefs] = useState<MenuPrefs>(DEFAULT_PREFS);
  const [usage, setUsage] = useState<UsageCounts>({});
  const boxRef = useRef<HTMLDivElement>(null);
  const paneRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLButtonElement | null>(null);
  const flipRef = useRef<ReturnType<typeof captureFlip> | null>(null);
  const loaded = useRef(false);
  const byKeyRef = useRef(false);

  const change = useCallback((next: boolean, byKey = false) => {
    byKeyRef.current = byKey;
    // The menu changes size in one frame; the box glides from its old size (clip, no layout).
    flipRef.current = captureFlip(boxRef.current ? [boxRef.current] : []);
    setPanned(next);
  }, []);
  const pan = useCallback((byKey = false) => change(true, byKey), [change]);
  const back = useCallback((byKey = false) => change(false, byKey), [change]);

  useLayoutEffect(() => {
    const flip = flipRef.current;
    flipRef.current = null;
    if (!flip) return;
    flip.play({ mode: "clip", duration: "base", ease: "out" });
    glide(paneRef.current, { x: panned ? 22 : -22, opacity: 0 }, { x: 0, opacity: 1 }, { duration: "base", ease: "out" });
    // Focus follows the pan: the first action in, the Lens row back out.
    // `focusVisible` (Chromium/WebView2): a ring only when the pan came from the keyboard.
    const opts = { preventScroll: true, focusVisible: byKeyRef.current } as FocusOptions;
    if (panned) paneRef.current?.querySelector<HTMLElement>("[data-lens-first]")?.focus(opts);
    else rowRef.current?.focus(opts);
  }, [panned]);

  // Settings and right-click order are read the first time the panel opens (cheap, local).
  useEffect(() => {
    if (!panned || loaded.current) return;
    loaded.current = true;
    magicGetConfig().then((c) => c && setCfg(c)).catch(() => {});
    contextMenuGet()
      .then((s) => {
        if (s?.prefs) setPrefs({ ...DEFAULT_PREFS, ...s.prefs });
        setUsage(s?.usage ?? {});
      })
      .catch(() => {});
  }, [panned]);

  const open = (run: string | null) => {
    void magicOpen(inputFor(item, run)).catch(() => {});
    onClose();
  };

  const { rows, more } = panelRows(item, cfg, prefs, usage);

  return (
    <Ctx.Provider value={{ item, panned, pan, rowRef }}>
      <div ref={boxRef} className={`lens-pan${panned ? " is-panned" : ""}${className ? ` ${className}` : ""}`}>
        <div ref={paneRef} className="lens-pan-pane">
          {panned ? (
            <div
              role="menu"
              aria-label={`Lens actions for ${item.label}`}
              className="lens-pan-panel"
              onKeyDown={(e) => {
                if (panKey(e.key, true) === "back") {
                  e.preventDefault();
                  e.stopPropagation();
                  back(true);
                }
              }}
            >
              <button type="button" role="menuitem" className={`${itemClassName} lens-pan-back`} onClick={() => back()}>
                <ChevronLeft size={14} strokeWidth={2.4} aria-hidden />
                <LensMark />
                <span className="lens-pan-title">{item.label}</span>
              </button>
              <div className="lens-pan-sep" role="separator" />
              {rows.map((r: Row, i) => (
                <button
                  key={r.id}
                  type="button"
                  role="menuitem"
                  className={itemClassName}
                  data-lens-first={i === 0 ? "" : undefined}
                  onClick={() => open(r.id)}
                >
                  <ActionIcon name={r.icon} size={14} />
                  <span className="lens-pan-label">{r.label}</span>
                  {r.hint ? <span className="lens-pan-hint">{r.hint}</span> : null}
                </button>
              ))}
              <button
                type="button"
                role="menuitem"
                className={itemClassName}
                data-lens-first={rows.length === 0 ? "" : undefined}
                onClick={() => open(null)}
              >
                <MoreHorizontal size={14} strokeWidth={2.4} aria-hidden />
                <span className="lens-pan-label">{more > 0 ? `More in Lens (${more})…` : "Ask Lens about this…"}</span>
              </button>
            </div>
          ) : (
            children
          )}
        </div>
      </div>
    </Ctx.Provider>
  );
}

/** The "Lens ›" row. Put it inside a <LensPan>'s children, next to the menu's own rows. */
export function LensMenuRow({ className = "lens-pan-item", hint }: { className?: string; hint?: string }) {
  const ctx = useContext(Ctx);
  const timer = useRef<number | null>(null);
  const clear = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => clear, []);
  if (!ctx) return null;
  return (
    <button
      ref={(el) => {
        ctx.rowRef.current = el;
      }}
      type="button"
      role="menuitem"
      aria-haspopup="menu"
      aria-expanded={ctx.panned}
      className={`${className} lens-pan-row`}
      onClick={() => {
        clear();
        ctx.pan();
      }}
      onPointerEnter={(e) => {
        if (e.pointerType !== "mouse") return;
        clear();
        timer.current = window.setTimeout(() => {
          timer.current = null;
          ctx.pan();
        }, PAN_INTENT_MS);
      }}
      onPointerLeave={clear}
      onKeyDown={(e) => {
        if (panKey(e.key, false) === "pan") {
          e.preventDefault();
          e.stopPropagation();
          clear();
          ctx.pan(true);
        }
      }}
    >
      <LensMark />
      <span className="lens-pan-label">Lens</span>
      {hint ? <span className="lens-pan-hint">{hint}</span> : null}
      <ChevronRight size={14} strokeWidth={2.4} className="lens-pan-chev" aria-hidden />
    </button>
  );
}
