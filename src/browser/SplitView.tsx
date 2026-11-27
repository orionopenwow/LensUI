// Split view (two tabs side by side) and the address bar's ads-and-trackers shield.
//
// The pages are native webviews placed by the core (host.rs `placements`); the frame only draws
// what sits between and around them: the divider in the 6 px gap, the drop zones while a tab is
// dragged over the page (the page is hidden then, so the frame can be seen), and the split pill
// in the toolbar. Layout maths: split.ts (mirrors model.rs).
import React, { useRef, useState } from "react";
import { ArrowLeftRight, Columns2, Shield, ShieldOff, X } from "lucide-react";
import type { Shield as ShieldState, Split, Tab } from "./api";
import { dropSide, ratioAt, ratioKey, splitRects, type Rect } from "./split";
import { tabLabel } from "./model";
import { Avatar } from "./Sidebar";

/** The divider between the two pages: drag it, or focus it and use the arrow keys. */
export function SplitDivider({ area, split, onRatio, onCommit }: { area: Rect; split: Split; onRatio(r: number): void; onCommit(r: number): void }) {
  const [, right] = splitRects({ ...area, x: 0, y: 0 }, split.ratio);
  const dragging = useRef(false);
  const last = useRef(split.ratio);
  // Transform only: the divider never changes the layout around it.
  const pos: React.CSSProperties = { transform: `translateX(${right.x - 6}px)` };
  return (
    <div
      className="lb-split-divider"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize split view"
      aria-valuemin={20}
      aria-valuemax={80}
      aria-valuenow={Math.round(split.ratio * 100)}
      tabIndex={0}
      data-weight="light"
      style={pos}
      onPointerDown={(e) => {
        dragging.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!dragging.current) return;
        const r = ratioAt(e.clientX, area);
        last.current = r;
        onRatio(r);
      }}
      onPointerUp={() => {
        if (!dragging.current) return;
        dragging.current = false;
        onCommit(last.current);
      }}
      onKeyDown={(e) => {
        const r = ratioKey(e.key, split.ratio);
        if (r == null) return;
        e.preventDefault();
        onRatio(r);
        onCommit(r);
      }}
    >
      <span className="lb-split-grip" aria-hidden />
    </div>
  );
}

/** Shown over the page while a tab is dragged: drop it on a half to open it there. */
export function SplitDropZone({ area, dragged, onDrop, onCancel }: { area: Rect; dragged: Tab | null; onDrop(side: "left" | "right", tabId: string): void; onCancel(): void }) {
  const [side, setSide] = useState<"left" | "right" | null>(null);
  return (
    <div
      className="lb-split-drop"
      onDragOver={(e) => {
        e.preventDefault();
        setSide(dropSide(e.clientX, area));
      }}
      onDragLeave={() => setSide(null)}
      onDrop={(e) => {
        e.preventDefault();
        const id = e.dataTransfer.getData("text/lens-tab") || dragged?.id;
        if (id) onDrop(dropSide(e.clientX, area), id);
        else onCancel();
      }}
    >
      {(["left", "right"] as const).map((s) => (
        <div key={s} className={`lb-split-half${side === s ? " is-on" : ""}`} aria-hidden>
          <Columns2 size={18} />
          <span>{s === "left" ? "Open on the left" : "Open on the right"}</span>
          {dragged ? <span className="lb-dim lb-mono">{tabLabel(dragged)}</span> : null}
        </div>
      ))}
    </div>
  );
}

/** Toolbar pill while the active tab is split: both sides (click to switch), swap, close. */
export function SplitPill({ split, tabs, active, onActivate, onSwap, onClose }: { split: Split; tabs: Tab[]; active: string; onActivate(id: string): void; onSwap(): void; onClose(): void }) {
  const side = (id: string) => tabs.find((t) => t.id === id);
  return (
    <span className="lb-split-pill" role="group" aria-label="Split view">
      {[split.left, split.right].map((id, i) => {
        const t = side(id);
        return (
          <button key={id} className={`lb-split-side${id === active ? " is-on" : ""}`} data-weight="light" aria-pressed={id === active} aria-label={`${i === 0 ? "Left" : "Right"}: ${t ? tabLabel(t) : "tab"}`} onClick={() => onActivate(id)}>
            {t ? <Avatar url={t.url} title={t.title} size={12} /> : null}
          </button>
        );
      })}
      <button className="lb-icon-btn sm" data-weight="medium" aria-label="Swap sides" onClick={onSwap}><ArrowLeftRight size={12} /></button>
      <button className="lb-icon-btn sm" data-weight="medium" aria-label="Close split view (Ctrl+Shift+S)" onClick={onClose}><X size={12} /></button>
    </span>
  );
}

/** "Lens blocks ads and trackers" in the address bar: the count, and the per-site switch. */
export function ShieldButton({ shield, onToggle }: { shield: ShieldState; onToggle(): void }) {
  if (!shield.on || !shield.site) return null;
  const label = shield.allowed
    ? `Ads and trackers allowed on ${shield.site}. Block them again`
    : `${shield.blocked} ad and tracker request${shield.blocked === 1 ? "" : "s"} blocked on this page. Allow on ${shield.site}`;
  return (
    <button className={`lb-icon-btn sm lb-shield${shield.allowed ? " is-off" : ""}`} data-weight="medium" aria-label={label} onClick={onToggle}>
      {shield.allowed ? <ShieldOff size={13} /> : <Shield size={13} />}
      {!shield.allowed && shield.blocked > 0 ? <span className="lb-shield-n lb-mono" aria-hidden>{shield.blocked > 99 ? "99+" : shield.blocked}</span> : null}
    </button>
  );
}
