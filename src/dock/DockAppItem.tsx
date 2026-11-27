// One app on the Dock: a pinned app (running or not) or a running app that isn't pinned. Both
// used to be drawn by two near-identical blocks in DockSurface.tsx; this is the one drawing. The
// Dock decides what the item is (`DockItemView`) and what its gestures do; this file owns the
// markup, so every style's CSS sees the same elements in the same order.
import React from "react";
import { X } from "lucide-react";
import type { RunningWindow } from "../types/lens";
import { windowMarkClass } from "./marks";
import { dockBadgeLabel, pickBadge } from "./model";

export interface DockItemView {
  /** Drag / hover / reflow key ("pin-<id>" or "unpin-<process>"). */
  itemKey: string;
  pinnedId?: string;
  /** Path a dropped file is opened with. */
  launchPath: string;
  /** Name for the tooltip, the label under the icon and announcements. */
  name: string;
  /** Start of the icon's accessible name (the state and badge are added here). */
  ariaName: string;
  /** What the hover × closes, by name. */
  closeName: string;
  wins: RunningWindow[];
  primaryWin?: RunningWindow;
  icon: React.ReactNode;
  /** Text next to the icon on bar styles with labels on. */
  barLabel: string;
  /** A hover card (windows or music) replaces the name tooltip. */
  hasHoverCard: boolean;
  unread: number;
  urgent: { since: number; count: number } | null | undefined;
  /** Text badge from a Lens core app ("12:04" on Lens Timer). */
  coreBadge?: string;
}

export interface DockAppItemProps {
  view: DockItemView;
  dragging: boolean;
  dragOver: boolean;
  fileDrop: boolean;
  launching: boolean;
  pulsing: boolean;
  showLabels: boolean;
  isBar: boolean;
  onWheel?: (e: React.WheelEvent) => void;
  onPointerDown: (e: React.PointerEvent) => void;
  onHover: (el: HTMLElement) => void;
  onLeave: () => void;
  onCloseAll: () => void;
  onActivate: () => void;
  onContextMenu: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onAuxClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
}

export function DockAppItem({ view, dragging, dragOver, fileDrop, launching, pulsing, showLabels, isBar, onWheel, onPointerDown, onHover, onLeave, onCloseAll, onActivate, onContextMenu, onAuxClick }: DockAppItemProps) {
  const { wins, primaryWin, urgent } = view;
  const pinned = view.pinnedId !== undefined;
  const state = primaryWin?.isFocused ? " (focused)" : wins.length ? " (running)" : "";
  const badge = pickBadge({ coreBadge: view.coreBadge, unread: view.unread, urgentCount: urgent?.count ?? 0, windows: wins.length });
  return (
    <div
      className={`dock-item-wrap ${dragging ? "is-dragging" : ""} ${dragOver ? "is-drag-over" : ""} ${fileDrop ? "is-file-drop" : ""} ${urgent ? "is-attention" : ""}`}
      data-attention={urgent ? urgent.since.toFixed(0) : undefined}
      data-dock-drag-key={view.itemKey}
      data-dock-pinned={pinned ? "true" : "false"}
      data-dock-pinned-id={view.pinnedId}
      data-dock-launch-path={view.launchPath}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onMouseEnter={(e) => onHover(e.currentTarget)}
      onMouseLeave={onLeave}
    >
      {pinned && !view.hasHoverCard && <span className="dock-tooltip">{view.name}</span>}
      {wins.length > 0 && (
        <button
          type="button"
          className="dock-close-badge"
          aria-label={`Close ${view.closeName}`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onCloseAll();
          }}
        >
          <X size={9} strokeWidth={3} />
        </button>
      )}
      <button
        type="button"
        aria-label={`${view.ariaName}${state}${dockBadgeLabel(view.unread, wins.length)}`}
        className={`dock-item ${primaryWin?.isFocused ? "is-focused" : ""} ${launching ? "is-launching" : ""} ${pulsing ? "is-pulse" : ""} ${showLabels && isBar ? "has-label" : ""}`}
        onClick={onActivate}
        onContextMenu={onContextMenu}
        onAuxClick={onAuxClick}
      >
        {view.icon}
        {badge?.kind === "text" ? (
          <span className="dock-notif-badge dock-text-badge" aria-hidden="true">
            {badge.text}
          </span>
        ) : badge?.kind === "unread" ? (
          <span className="dock-notif-badge" aria-hidden="true">
            {badge.text}
          </span>
        ) : badge?.kind === "attention" ? (
          <span className="dock-notif-badge dock-attention-badge" aria-hidden="true">{badge.text}</span>
        ) : (
          badge?.kind === "windows" && <span className="dock-instance-badge" aria-hidden="true">{badge.text}</span>
        )}
        {showLabels && isBar && <span className="dock-label">{view.barLabel}</span>}
      </button>
      {showLabels && !isBar && <span className="dock-label">{view.name}</span>}
      {(wins.length > 0 || urgent) && (
        <span className={`dock-indicator ${windowMarkClass(wins.length)} ${primaryWin?.isFocused ? "focused" : ""} ${urgent ? "attention" : ""}`} />
      )}
      {urgent && <span className="dock-attention-sr">{view.name} needs your attention</span>}
    </div>
  );
}
