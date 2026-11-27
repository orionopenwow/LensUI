// Live text in the studio: the word boxes over the image, the small bar that follows a selection
// (Copy, Highlight, Hide) and the one-press chips for links, emails, phone numbers and codes.
// Presentational; the model is liveText.ts and the studio owns the state.
import React from "react";
import { Copy, EyeOff, Highlighter } from "lucide-react";
import type { Rect } from "./geom";
import { ENTITY_LABEL, isSelected, selectedCount, selectionRects, shortValue, wordsLabel, type Entity, type Line, type Sel } from "./liveText";

/** Inside the studio's SVG (image px). Words are faintly underlined so text reads as selectable. */
export const LiveTextLayer: React.FC<{ lines: readonly Line[]; sel: Sel | null; hidden: (r: Rect) => boolean; flash: number; stroke: number }> = ({ lines, sel, hidden, flash, stroke }) => (
  <g className="snip-live" aria-hidden="true">
    {lines.map((l, li) =>
      l.words.map((w, wi) =>
        hidden(w.rect) || isSelected(sel, { line: li, word: wi }) ? null : (
          <line key={`${li}-${wi}`} className="snip-live-word" x1={w.rect.x} x2={w.rect.x + w.rect.w} y1={w.rect.y + w.rect.h + stroke} y2={w.rect.y + w.rect.h + stroke} strokeWidth={stroke} />
        )
      )
    )}
    {/* Re-keyed on every copy so the wash plays once per copy. */}
    <g key={flash} className={flash ? "snip-live-sel is-copied" : "snip-live-sel"}>
      {selectionRects(lines, sel).map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} rx={Math.min(4, r.h / 4)} />
      ))}
    </g>
  </g>
);

export interface LiveTextPillProps {
  lines: readonly Line[];
  sel: Sel;
  /** Image px → stage CSS px. */
  scale: number;
  stage: { w: number; h: number };
  onCopy: () => void;
  onHighlight: () => void;
  onHide: () => void;
}

/** Where the bar sits: above the first selected line, or under the last when there is no room. */
export function pillPlace(rects: readonly Rect[], scale: number, stage: { w: number; h: number }, size = { w: 268, h: 36 }): { left: number; top: number; below: boolean } {
  const first = rects[0];
  const last = rects[rects.length - 1];
  if (!first || !last) return { left: 0, top: 0, below: false };
  const above = first.y * scale - size.h - 8;
  const below = above < 4;
  const top = below ? Math.min(stage.h - size.h - 4, (last.y + last.h) * scale + 8) : above;
  const anchor = below ? last : first;
  const left = Math.max(4, Math.min(stage.w - size.w - 4, (anchor.x + anchor.w / 2) * scale - size.w / 2));
  return { left, top: Math.max(4, top), below };
}

export const LiveTextPill: React.FC<LiveTextPillProps> = ({ lines, sel, scale, stage, onCopy, onHighlight, onHide }) => {
  const place = pillPlace(selectionRects(lines, sel, 0), scale, stage);
  const n = selectedCount(lines, sel);
  const at: React.CSSProperties = { left: place.left, top: place.top };
  return (
    <div className={`snip-live-pill${place.below ? " is-below" : ""}`} style={at} role="toolbar" aria-label="Selected text" onPointerDown={(e) => e.stopPropagation()}>
      <span className="snip-live-count" role="status">
        {wordsLabel(n)}
      </span>
      <button type="button" className="snip-btn" data-weight="medium" onClick={onCopy} aria-keyshortcuts="Control+C">
        <Copy size={13} aria-hidden /> Copy
      </button>
      <button type="button" className="snip-btn" data-weight="medium" onClick={onHighlight}>
        <Highlighter size={13} aria-hidden /> Highlight
      </button>
      <button type="button" className="snip-btn" data-weight="medium" onClick={onHide}>
        <EyeOff size={13} aria-hidden /> Hide
      </button>
    </div>
  );
};

/** Links, emails, phone numbers and codes found in the snip: one press copies one. */
export const EntityChips: React.FC<{ entities: readonly Entity[]; onCopy: (e: Entity) => void }> = ({ entities, onCopy }) =>
  entities.length ? (
    <div className="snip-entities" role="group" aria-label="Found in this snip">
      {entities.map((e) => (
        <button key={`${e.kind}-${e.value}`} type="button" className="snip-entity" data-weight="light" onClick={() => onCopy(e)} aria-label={`Copy ${ENTITY_LABEL[e.kind].toLowerCase()} ${e.value}`}>
          <span className="k">{ENTITY_LABEL[e.kind]}</span>
          <span className="v">{shortValue(e.value)}</span>
          <Copy size={11} aria-hidden />
        </button>
      ))}
    </div>
  ) : null;
