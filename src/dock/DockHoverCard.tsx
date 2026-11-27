// The card above a hovered Dock icon: the window carousel (2+ windows), the live preview strip,
// the plain titles list, or the music card. The Dock owns which icon it belongs to and where it
// goes; this file owns what is in it.
import React from "react";
import { AppWindow, X } from "lucide-react";
import { DockPreviewStrip } from "../components/DockPreviewStrip";
import { DockWindowCarousel } from "./DockWindowCarousel";
import { listKeyAction } from "./keys";
import type { DockEdge, DockHoverCardState } from "./model";
import "./DockHoverCard.css";

export type DockCardMode = "spotify" | "carousel" | "strip" | "list";

export interface DockHoverCardProps {
  card: DockHoverCardState;
  cardRef: React.Ref<HTMLDivElement>;
  /** Gliding out: nothing in it takes focus or shows native thumbnails. */
  leaving: boolean;
  edge: DockEdge;
  livePreviews: boolean;
  mode: DockCardMode | null;
  style: React.CSSProperties;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  /** Switch to a window and close the card. */
  onFocusWindow: (hwnd: number) => void;
  /** Close a window; the card stays with the rest. */
  onCloseWindow: (hwnd: number) => void;
  /** Esc, or focus moved out of the card: close it and give focus back to the icon. */
  onBack: (refocus: boolean) => void;
  /** The music card (media-mini), drawn by the host so this file does not reach into it. */
  musicCard: React.ReactNode;
}

const ROWS = ".dock-win-row-main";

export function DockHoverCard({ card: shownCard, cardRef, leaving, edge, livePreviews, mode: cardMode, style, onMouseEnter, onMouseLeave, onFocusWindow, onCloseWindow, onBack, musicCard }: DockHoverCardProps) {
  // Dock keys inside the card: Esc goes back to the icon; in the titles list Up/Down/Home/End move
  // between windows and Delete closes the one in focus (Enter switches to it, as a button does).
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const rows = cardMode === "list" ? Array.from(e.currentTarget.querySelectorAll<HTMLElement>(ROWS)) : [];
    const at = rows.findIndex((r) => r.parentElement?.contains(document.activeElement));
    const action = e.key === "Escape" ? ({ kind: "back" } as const) : at >= 0 ? listKeyAction(e.key, at, rows.length) : null;
    if (!action) return;
    e.preventDefault();
    e.stopPropagation();
    if (action.kind === "back") onBack(true);
    else if (action.kind === "move") rows[action.to]?.focus({ preventScroll: true });
    else {
      // Focus moves to a neighbour first, so it is never left on a row that is about to go.
      const next = rows[at + 1] ?? rows[at - 1];
      if (next) next.focus({ preventScroll: true });
      else onBack(true);
      onCloseWindow(Number(rows[at].dataset.hwnd));
    }
  };
  return (
        <div
          ref={cardRef}
          inert={leaving}
          className={`dock-hover-card dock-hover-edge-${edge} ${shownCard.isSpotify ? "is-music" : ""} ${
            livePreviews && !shownCard.isSpotify && shownCard.windows.length > 0 ? "has-previews" : ""
          } ${cardMode === "carousel" ? "has-carousel" : ""}`}
          style={style}
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}
          onKeyDown={onKeyDown}
          onBlur={(e) => {
            // Tabbing out of the card closes it; a click elsewhere is the Dock's to handle.
            if (e.relatedTarget instanceof Node && !e.currentTarget.contains(e.relatedTarget)) onBack(false);
          }}
        >
          {shownCard.isSpotify ? (
            musicCard
          ) : cardMode === "carousel" ? (
            <DockWindowCarousel
              key={shownCard.key}
              title={shownCard.title}
              active={!leaving}
              windows={shownCard.windows}
              iconUrl={shownCard.iconUrl}
              onFocus={onFocusWindow}
              onClose={onCloseWindow}
            />
          ) : livePreviews ? (
            <DockPreviewStrip
              key={shownCard.key}
              active={!leaving}
              windows={shownCard.windows}
              iconUrl={shownCard.iconUrl}
              onFocus={onFocusWindow}
              onClose={onCloseWindow}
            />
          ) : (
            <div className="dock-win-list" role="group" aria-label={`${shownCard.title} windows`}>
              <div className="dock-win-list-head">
                <span>{shownCard.title}</span>
                <span className="dock-win-count" aria-hidden="true">{shownCard.windows.length}</span>
              </div>
              {/* Every window, however many (the list scrolls); it used to stop at seven. */}
              <div className="dock-win-rows">
              {shownCard.windows.map((w) => (
                <div key={w.hwnd} className={`dock-win-row ${w.isFocused ? "focused" : ""}`}>
                  <button
                    type="button"
                    className="dock-win-row-main"
                    data-weight="light"
                    data-hwnd={w.hwnd}
                    aria-current={w.isFocused ? "true" : undefined}
                    onClick={() => onFocusWindow(w.hwnd)}
                  >
                    {w.iconDataUrl || shownCard.iconUrl ? (
                      <img src={w.iconDataUrl || shownCard.iconUrl || ""} alt="" className="dock-win-row-icon" />
                    ) : (
                      <AppWindow size={13} className="dock-win-row-icon is-fallback" />
                    )}
                    <span className="dock-win-row-title">
                      {w.title || w.processName.replace(/\.exe$/i, "")}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="dock-win-row-close"
                    data-weight="medium"
                    tabIndex={-1}
                    aria-label={`Close ${w.title || "window"}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onCloseWindow(w.hwnd);
                    }}
                  >
                    <X size={11} strokeWidth={2.8} />
                  </button>
                </div>
              ))}
              </div>
            </div>
          )}
        </div>
  );
}
