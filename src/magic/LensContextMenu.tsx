// A small right-click menu for Lens items that had none of their own (Shelf items): the item's
// usual actions, then "Lens ›", which pans into the Magic actions (src/magic/LensPan.tsx).
// Placed at the pointer and kept inside the window; closes on Esc, outside click, blur or a pick.
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { glideIn } from "../ui/motion";
import { LensMenuRow, LensPan } from "./LensPan";
import type { LensItem } from "./lensPanModel";
import "./lens-pan.css";

export interface MenuAction {
  id: string;
  label: string;
  icon?: React.ReactNode;
  danger?: boolean;
  onSelect: () => void;
}

export interface MenuAt {
  x: number;
  y: number;
}

/** Keeps a menu of size w×h inside the viewport, opening down-right of the pointer when it fits. */
export function placeMenu(at: MenuAt, w: number, h: number, vw: number, vh: number, margin = 6): { left: number; top: number } {
  const left = at.x + w + margin > vw ? Math.max(margin, at.x - w) : at.x;
  const top = at.y + h + margin > vh ? Math.max(margin, at.y - h) : at.y;
  return { left: Math.max(margin, Math.min(left, vw - w - margin)), top: Math.max(margin, Math.min(top, vh - h - margin)) };
}

export function LensContextMenu({
  at,
  item,
  actions,
  onClose,
  initialPanned = false,
}: {
  at: MenuAt;
  item: LensItem;
  actions: MenuAction[];
  onClose: () => void;
  /** Parity scenes only. */
  initialPanned?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: at.x, top: at.y });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos(placeMenu(at, r.width, r.height, window.innerWidth, window.innerHeight));
    glideIn(el, { scale: 0.97, opacity: 0 }, { duration: "fast" });
    // Focus goes into the menu for the keyboard, without a ring for a menu opened by the mouse.
    el.querySelector<HTMLElement>("[role=menuitem]")?.focus({ preventScroll: true, focusVisible: false } as FocusOptions);
  }, [at]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onBlur = () => onClose();
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", onBlur);
    };
  }, [onClose]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>(".lens-pan-item:not(:disabled)"));
    if (!items.length) return;
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    let next = -1;
    if (e.key === "ArrowDown") next = i < 0 ? 0 : (i + 1) % items.length;
    else if (e.key === "ArrowUp") next = i < 0 ? items.length - 1 : (i - 1 + items.length) % items.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = items.length - 1;
    if (next >= 0) {
      e.preventDefault();
      items[next].focus({ preventScroll: true });
    }
  };

  return (
    <>
      <div
        className="lens-ctx-backdrop"
        onPointerDown={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <div ref={ref} role="menu" aria-label={item.label} className="lens-ctx-menu" style={pos} onKeyDown={onKeyDown}>
        <LensPan item={item} onClose={onClose} initialPanned={initialPanned}>
          {actions.map((a) => (
            <button
              key={a.id}
              type="button"
              role="menuitem"
              className={`lens-pan-item${a.danger ? " is-danger" : ""}`}
              onClick={() => {
                a.onSelect();
                onClose();
              }}
            >
              {a.icon}
              <span className="lens-pan-label">{a.label}</span>
            </button>
          ))}
          {actions.length ? <div className="lens-pan-sep" role="separator" /> : null}
          <LensMenuRow />
        </LensPan>
      </div>
    </>
  );
}
