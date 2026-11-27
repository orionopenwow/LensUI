// Horizontal tabs for Lens Browser, in the five styles of tabModes.ts. One component draws them
// all; the style only changes classes and which parts show. Keyboard: Left/Right/Home/End move
// between tabs (roving focus), Enter or Space opens, Delete closes. Folders are a chip that opens
// a list; the active space is a chip too. While a list is open the page hides (onPopover), since
// the native page draws above the frame.
import React, { useEffect, useRef, useState } from "react";
import { ChevronDown, Columns2, Folder as FolderIcon, Plus, X } from "lucide-react";
import type { BrowserState, Tab } from "./api";
import { hostOf, tabLabel } from "./model";
import { Avatar } from "./Sidebar";
import { stripKey, type TabStyle } from "./tabModes";

export interface StripProps {
  state: BrowserState;
  style: TabStyle;
  /** Merged: drawn in place of the active tab. */
  addressSlot?: React.ReactNode;
  ai?: boolean;
  onActivate(id: string): void;
  onClose(id: string): void;
  onNewTab(): void;
  onSpace(id: string): void;
  /** A list (folder, spaces) opened over the page. */
  onPopover?(open: boolean): void;
  /** A tab started (id) or stopped (null) being dragged (split view drop zones). */
  onDragTab?(id: string | null): void;
}

/** Tabs of the active space in strip order: pinned first, loose tabs, then folder chips. */
export function stripModel(s: BrowserState) {
  const tabs = s.tabs.filter((t) => t.spaceId === s.activeSpace && !t.archivedMs).sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.order - b.order);
  const folders = s.folders.filter((f) => f.spaceId === s.activeSpace);
  const inFolder = (t: Tab) => !!t.folderId && folders.some((f) => f.id === t.folderId);
  // The active tab always shows in the strip, even when it lives in a folder.
  const loose = tabs.filter((t) => !inFolder(t) || t.id === s.activeTab);
  const chips = folders.map((f) => ({ folder: f, tabs: tabs.filter((t) => t.folderId === f.id) })).filter((c) => c.tabs.length > 0);
  return { loose, chips };
}

export function TabStrip(p: StripProps) {
  const s = p.state;
  const { loose, chips } = stripModel(s);
  const [open, setOpen] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const splitIds = new Set((s.splits ?? []).flatMap((x) => [x.left, x.right]));
  const space = s.spaces.find((x) => x.id === s.activeSpace);
  const iconOnly = p.style === "compact";

  useEffect(() => p.onPopover?.(open !== null), [open]);
  useEffect(() => {
    if (open === null) return;
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(null);
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);

  const focusTab = (i: number) => ref.current?.querySelectorAll<HTMLElement>("[role='tab']")[i]?.focus();
  const onKey = (e: React.KeyboardEvent<HTMLElement>, t: Tab, i: number) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); p.onActivate(t.id); return; }
    if (e.key === "Delete") { e.preventDefault(); p.onClose(t.id); return; }
    const to = stripKey(e.key, i, loose.length);
    if (to !== null) { e.preventDefault(); focusTab(to); }
  };

  return (
    <div className={`lb-strip lb-strip-${p.style}`} ref={ref} data-tauri-drag-region={p.style === "curved" || p.style === "joined" ? true : undefined}>
      {s.spaces.length > 1 ? (
        <div className="lb-strip-pop-wrap">
          <button className="lb-strip-chip" data-weight="light" aria-haspopup="menu" aria-expanded={open === "spaces"} aria-label={`Space: ${space?.name ?? ""}. Switch space`} onClick={() => setOpen(open === "spaces" ? null : "spaces")}>
            <span className="lb-strip-dot" aria-hidden />
            {iconOnly ? null : <span>{space?.name}</span>}
            <ChevronDown size={11} />
          </button>
          {open === "spaces" ? (
            <ul className="lb-strip-pop" role="menu" aria-label="Spaces">
              {s.spaces.map((x) => (
                <li key={x.id} role="menuitemradio" aria-checked={x.id === s.activeSpace} tabIndex={0} data-weight="light" onClick={() => { setOpen(null); p.onSpace(x.id); }} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(null); p.onSpace(x.id); } if (e.key === "Escape") setOpen(null); }}>
                  {x.icon ? <span aria-hidden>{x.icon}</span> : null}
                  {x.name}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      <div className="lb-strip-tabs" role="tablist" aria-label="Tabs">
        {loose.map((t, i) => {
          const active = t.id === s.activeTab;
          if (active && p.addressSlot) {
            // Merged: the open tab is the address box itself.
            return (
              <div data-weight="light" key={t.id} role="tab" aria-selected tabIndex={-1} className="lb-stab is-active is-address" aria-label={`${tabLabel(t)} (current tab, address)`}>
                {p.addressSlot}
              </div>
            );
          }
          const label = tabLabel(t);
          const compactIcon = (iconOnly || t.pinned) && !active;
          return (
            <div
              key={t.id}
              role="tab"
              aria-selected={active}
              aria-label={`${label}${t.pinned ? ", pinned" : ""}${t.life === "sleeping" ? ", sleeping" : ""}${splitIds.has(t.id) ? ", in split view" : ""}`}
              tabIndex={active ? 0 : -1}
              draggable
              data-weight="light"
              className={`lb-stab${active ? " is-active" : ""}${t.life === "sleeping" ? " is-sleeping" : ""}${compactIcon ? " is-icon" : ""}${t.pinned ? " is-pinned" : ""}${splitIds.has(t.id) ? " is-split" : ""}`}
              onClick={() => p.onActivate(t.id)}
              onAuxClick={(e) => e.button === 1 && p.onClose(t.id)}
              onKeyDown={(e) => onKey(e, t, i)}
              onDragStart={(e) => { e.dataTransfer.setData("text/lens-tab", t.id); p.onDragTab?.(t.id); }}
              onDragEnd={() => p.onDragTab?.(null)}
            >
              <Avatar url={t.url} title={t.title} size={14} />
              {compactIcon ? null : <span className="lb-tab-title">{label || hostOf(t.url)}</span>}
              {splitIds.has(t.id) && !compactIcon ? <Columns2 size={11} className="lb-dim" aria-hidden /> : null}
              {t.badge === "approve" && p.ai && !compactIcon ? <span className="lb-pill">approve</span> : null}
              {compactIcon || t.pinned ? null : (
                <button className="lb-icon-btn sm lb-tab-x" data-weight="medium" tabIndex={-1} aria-label={`Close ${label}`} onClick={(e) => { e.stopPropagation(); p.onClose(t.id); }}><X size={11} /></button>
              )}
            </div>
          );
        })}
      </div>
      {chips.map(({ folder, tabs }) => (
        <div key={folder.id} className="lb-strip-pop-wrap">
          <button className="lb-strip-chip" data-weight="light" aria-haspopup="menu" aria-expanded={open === folder.id} aria-label={`Folder ${folder.name}, ${tabs.length} tabs`} onClick={() => setOpen(open === folder.id ? null : folder.id)}>
            <FolderIcon size={12} />
            {iconOnly ? null : <span>{folder.name}</span>}
            <span className="lb-mono lb-dim">{tabs.length}</span>
            <ChevronDown size={11} />
          </button>
          {open === folder.id ? (
            <ul className="lb-strip-pop" role="menu" aria-label={folder.name}>
              {tabs.map((t) => (
                <li key={t.id} role="menuitem" tabIndex={0} data-weight="light" className={t.id === s.activeTab ? "is-on" : undefined} onClick={() => { setOpen(null); p.onActivate(t.id); }} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(null); p.onActivate(t.id); } if (e.key === "Escape") setOpen(null); }}>
                  <Avatar url={t.url} title={t.title} size={14} />
                  <span className="lb-tab-title">{tabLabel(t)}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ))}
      <button className="lb-icon-btn sm lb-strip-new" data-weight="medium" aria-label="New tab (Ctrl+T)" onClick={p.onNewTab}><Plus size={13} /></button>
    </div>
  );
}
