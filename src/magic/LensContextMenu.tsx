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

/**
 * Where a context menu opens and how it was asked for. A right-click opens at the pointer. The
 * Menu key and Shift+F10 also arrive as a `contextmenu` event, but with no pointer behind them:
 * the menu then opens on the item itself and is marked as keyboard-opened, so focus lands on
 * "Lens ›" with a visible ring (docs/features/magic.md, "Magic everywhere via the keyboard").
 */
export function contextOrigin(e: { button: number; clientX: number; clientY: number }, rect: { left: number; top: number; bottom: number; width: number }): { at: MenuAt; byKeyboard: boolean } {
  const byKeyboard = e.button !== 2;
  return byKeyboard
    ? { at: { x: Math.round(rect.left + Math.min(28, rect.width / 2)), y: Math.round(rect.bottom - 4) }, byKeyboard }
    : { at: { x: e.clientX, y: e.clientY }, byKeyboard };
}

export function LensContextMenu({
  at,
  item,
  actions,
  onClose,
  initialPanned = false,
  byKeyboard = false,
}: {
  /** Opened with the Menu key or Shift+F10: focus starts on "Lens ›", with a ring. */
  byKeyboard?: boolean;
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
    const first = byKeyboard ? el.querySelector<HTMLElement>(".lens-pan-row") ?? el.querySelector<HTMLElement>("[role=menuitem]") : el.querySelector<HTMLElement>("[role=menuitem]");
    first?.focus({ preventScroll: true, focusVisible: byKeyboard } as FocusOptions);
  }, [at, byKeyboard]);

  // Focus goes back to where it was when the menu closes, so the keyboard never loses its place.
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    return () => {
      const now = document.activeElement;
      if (before && before.isConnected && (!now || now === document.body || !now.isConnected)) before.focus({ preventScroll: true });
    };
  }, []);

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
              data-weight="light"
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
