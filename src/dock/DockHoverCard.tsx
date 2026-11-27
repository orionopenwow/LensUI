// The card above a hovered Dock icon: the window carousel (2+ windows), the live preview strip,
// the plain titles list, or the music card. The Dock owns which icon it belongs to and where it
// goes; this file owns what is in it.
import React from "react";
import { AppWindow, X } from "lucide-react";
import { DockPreviewStrip } from "../components/DockPreviewStrip";
import { DockWindowCarousel } from "./DockWindowCarousel";
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
  /** The music card (media-mini), drawn by the host so this file does not reach into it. */
  musicCard: React.ReactNode;
}

export function DockHoverCard({ card: shownCard, cardRef, leaving, edge, livePreviews, mode: cardMode, style, onMouseEnter, onMouseLeave, onFocusWindow, onCloseWindow, musicCard }: DockHoverCardProps) {
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
            <div className="dock-win-list">
              <div className="dock-win-list-head">
                <span>{shownCard.title}</span>
                <span className="dock-win-count">{shownCard.windows.length}</span>
              </div>
              {shownCard.windows.slice(0, 7).map((w) => (
                <div key={w.hwnd} className={`dock-win-row ${w.isFocused ? "focused" : ""}`}>
                  <button
                    type="button"
                    className="dock-win-row-main"
                    onClick={() => onFocusWindow(w.hwnd)}
                  >
                    {w.iconDataUrl || shownCard.iconUrl ? (
                      <img src={w.iconDataUrl || shownCard.iconUrl || ""} alt="" className="dock-win-row-icon" />
                    ) : (
                      <AppWindow size={13} color="#38BDF8" className="dock-win-row-icon is-fallback" />
                    )}
                    <span className="dock-win-row-title">
                      {w.title || w.processName.replace(/\.exe$/i, "")}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="dock-win-row-close"
                    aria-label="Close window"
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
          )}
        </div>
  );
}
