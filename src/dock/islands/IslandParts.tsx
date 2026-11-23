import React from "react";
import { ShapeGlyph } from "../../themes/shapes/Expressive";
import { normalizeShapeStyle } from "../../themes/shapes/shapes";
import "./islands.css";

/**
 * Pieces of the Islands Dock that the regular Dock doesn't have: the left island (launcher grid,
 * search, overview, workspace indicator) and the centre chips (media, weather). DockSurface mounts
 * them for `dock.style === "islands"` (see docs/PACK_EXPRESSIVE.md, snippet D1).
 */

export interface WorkspaceIndicatorProps {
  count: number;
  active: number;
  /** "classic" | "expressive" | "dotmatrix" — picks the indicator shape. */
  shapeStyle?: string;
  onSwitch?: (index: number) => void;
}

/** Expressive: the active workspace is a cookie shape. Dot Matrix: a long dash. Classic: a wide dot. */
export const WorkspaceIndicator: React.FC<WorkspaceIndicatorProps> = ({ count, active, shapeStyle, onSwitch }) => {
  const raw = shapeStyle === "dotmatrix" ? "dotmatrix" : normalizeShapeStyle(shapeStyle);
  return (
    <div className="lds-ws" role="tablist" aria-label="Workspaces">
      {Array.from({ length: Math.max(1, count) }, (_, i) => {
        const on = i === active;
        let mark: React.ReactNode = <span className="lds-ws-dot" />;
        if (on && raw === "expressive") mark = <ShapeGlyph shape="flower" size={16} />;
        else if (on && raw === "dotmatrix") mark = <span className="lds-ws-dash" />;
        else if (on) mark = <span className="lds-ws-dash" style={{ width: 14 }} />;
        return (
          <button
            key={i}
            type="button"
            role="tab"
            aria-selected={on}
            aria-label={`Workspace ${i + 1}`}
            className={`lds-ws-btn ${on ? "is-active" : ""}`}
            onClick={() => onSwitch?.(i)}
          >
            {mark}
          </button>
        );
      })}
    </div>
  );
};

const Icon: React.FC<{ d: string }> = ({ d }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
    <path d={d} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const LeftIsland: React.FC<
  WorkspaceIndicatorProps & { onLauncher?: () => void; onSearch?: () => void; onOverview?: () => void }
> = ({ onLauncher, onSearch, onOverview, ...ws }) => (
  <div className="lds-island" role="group" aria-label="Launcher and workspaces">
    <button type="button" className="lds-btn" aria-label="Open Launcher" onClick={onLauncher}>
      <Icon d="M5 5h3v3H5zM10.5 5h3v3h-3zM16 5h3v3h-3zM5 10.5h3v3H5zM10.5 10.5h3v3h-3zM16 10.5h3v3h-3zM5 16h3v3H5zM10.5 16h3v3h-3zM16 16h3v3h-3z" />
    </button>
    <button type="button" className="lds-btn" aria-label="Search" onClick={onSearch}>
      <Icon d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4" />
    </button>
    <button type="button" className="lds-btn" aria-label="Overview" onClick={onOverview}>
      <Icon d="M4 6h16M4 12h16M4 18h10" />
    </button>
    <WorkspaceIndicator {...ws} />
  </div>
);

export const ChipsIsland: React.FC<{ media?: string; weather?: string; children?: React.ReactNode }> = ({ media, weather, children }) =>
  media || weather || children ? (
    <div className="lds-island lds-chip" role="group" aria-label="Now">
      {media && <span>{media}</span>}
      {weather && <span>{weather}</span>}
      {children}
    </div>
  ) : null;
