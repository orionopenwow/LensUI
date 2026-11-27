import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown, ChevronsLeft, Columns2, ChevronsRight, ChevronRight, Copy, Folder as FolderIcon, FolderPlus, Loader2, Lock, LockOpen, MoonStar, PanelLeft, Pause, Pin, PinOff,
  Plus, Search, Settings, Volume2, VolumeX, X,
} from "lucide-react";
import { LensCloud } from "../presence/LensCloud";
import { captureFlip, type FlipCapture } from "../ui/motion";
import { DEFAULT_SIDEBAR, media as mediaCmd, SLEEP_SAVING_MB, type BrowserView, type SidebarPrefs, type Tab } from "./api";
import { avatar, hostOf, relTime, sidebarModel, tabLabel } from "./model";
import { duplicateTabs, tabSections, type TabActionKind, type TabProposal } from "./tabAi";
import { oops } from "./oops";
import { useIcon } from "./icons";

export interface ChatRef {
  id: string;
  title: string;
  at: number;
}

interface Props {
  view: BrowserView;
  chats: ChatRef[];
  activeChat: string | null;
  onSearch(): void;
  onSpace(id: string): void;
  onNewSpace(): void;
  onNewTab(): void;
  onNewFolder(): void;
  onActivate(id: string): void;
  onClose(id: string): void;
  onMute(id: string, on: boolean): void;
  onPin(id: string, on: boolean): void;
  onDuplicate?(id: string): void;
  /** The active tab is loading a page. */
  loading?: boolean;
  onToggleFolder(id: string): void;
  onDrop(tabId: string, beforeId: string | null, folder: string | null): void;
  onOpenUrl(url: string, background?: boolean): void;
  onChat(id: string): void;
  onCollapse(): void;
  onLock?(): void;
  onSettings?(): void;
  sleeping?: number;
  media?: { id: string; title: string; url: string; muted: boolean } | null;
  now?: number;
  /** Sidebar look (width, full/stack, side, grouping, which sections show). */
  prefs?: SidebarPrefs;
  onPrefs?(patch: Partial<SidebarPrefs>): void;
  /** Lens acting on tabs: plans shown before anything changes. */
  ai?: boolean;
  proposal?: TabProposal | null;
  onPropose?(kind: TabActionKind): void;
  onApplyProposal?(): void;
  onCancelProposal?(): void;
  /** Bumped by Ctrl+Shift+A to focus "Find a tab". */
  findSignal?: number;
  /** Icon stack: the Lens menu is open over the page. */
  onPopover?(open: boolean): void;
  /** A tab started (id) or stopped (null) being dragged: the page shows split drop zones. */
  onDragTab?(id: string | null): void;
}

export function Avatar({ url, title, size = 16 }: { url: string; title?: string; size?: number }) {
  const a = avatar(url, title);
  // The real icon when the core has fetched one; the letter avatar otherwise.
  const icon = useIcon(url);
  if (icon) return <img className="lb-av is-icon" src={icon} width={size} height={size} alt="" aria-hidden draggable={false} />;
  return (
    <span className="lb-av" style={{ width: size, height: size, fontSize: Math.round(size * 0.62), background: `hsl(${a.hue} 46% 42%)` }} aria-hidden>
      {a.letter}
    </span>
  );
}

/** The small Lens cloud, still until its row is hovered. */
function LensMark() {
  return (
    <span className="lb-lens-mark" aria-hidden>
      <LensCloud />
    </span>
  );
}

type RowProps = Props & { arm(): void; stack: boolean };

function TabRow({ t, active, p, nested }: { t: Tab; active: boolean; p: RowProps; nested?: boolean }) {
  const sleeping = t.life === "sleeping" && !active;
  const label = tabLabel(t);
  return (
    <div
      role="tab"
      aria-selected={active}
      aria-label={p.stack ? `${label}${sleeping ? ", sleeping" : ""}${t.audible ? ", playing" : ""}` : undefined}
     
      tabIndex={0}
      draggable
      className={`lb-tab${active ? " is-active" : ""}${sleeping ? " is-sleeping" : ""}${nested ? " is-nested" : ""}${t.audible && !t.muted ? " is-audible" : ""}`}
      onClick={() => p.onActivate(t.id)}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); p.onActivate(t.id); }
        if (e.key === "Delete") { p.arm(); p.onClose(t.id); }
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          // Move through the tab list without leaving it.
          e.preventDefault();
          const rows = Array.from(e.currentTarget.closest(".lb-scroll")?.querySelectorAll<HTMLElement>(".lb-tab") ?? []);
          rows[rows.indexOf(e.currentTarget) + (e.key === "ArrowDown" ? 1 : -1)]?.focus();
        }
      }}
      onAuxClick={(e) => e.button === 1 && p.onClose(t.id)}
      data-weight="light"
      onDragStart={(e) => { e.dataTransfer.setData("text/lens-tab", t.id); p.onDragTab?.(t.id); }}
      onDragEnd={() => p.onDragTab?.(null)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        const id = e.dataTransfer.getData("text/lens-tab");
        if (id && id !== t.id) { e.stopPropagation(); p.arm(); p.onDrop(id, t.id, t.folderId ?? null); }
      }}
    >
      {active && p.loading ? <Loader2 size={16} className="lb-spin lb-dim" aria-label="Loading" /> : <Avatar url={t.url} title={t.title} />}
      {p.stack ? null : (
        <>
          <span className="lb-tab-title">{label}</span>
          {t.badge === "approve" ? <span className="lb-pill">approve</span> : null}
          {(p.view.state.splits ?? []).some((x) => x.left === t.id || x.right === t.id) ? <Columns2 size={12} className="lb-dim" aria-label="In split view" /> : null}
          {t.busy ? <span className="lb-dot is-amber" aria-label="Unsaved changes" /> : null}
          {/* Quiet details: only while the row is hovered or focused. */}
          {sleeping ? <MoonStar size={12} className="lb-dim lb-tab-quiet" aria-label="Sleeping" /> : null}
          {t.audible || t.muted ? (
            <button className="lb-icon-btn sm lb-tab-quiet" aria-label={t.muted ? "Unmute tab" : "Mute tab"} onClick={(e) => { e.stopPropagation(); p.onMute(t.id, !t.muted); }}>
              {t.muted ? <VolumeX size={12} /> : <Volume2 size={12} />}
            </button>
          ) : null}
          <button className="lb-icon-btn sm lb-tab-act" aria-label={t.pinned ? "Unpin tab" : "Pin tab"} onClick={(e) => { e.stopPropagation(); p.arm(); p.onPin(t.id, !t.pinned); }}>
            {t.pinned ? <PinOff size={12} /> : <Pin size={12} />}
          </button>
          {p.onDuplicate ? (
            <button className="lb-icon-btn sm lb-tab-act" aria-label="Duplicate tab" onClick={(e) => { e.stopPropagation(); p.arm(); p.onDuplicate!(t.id); }}>
              <Copy size={12} />
            </button>
          ) : null}
          <button className="lb-icon-btn sm lb-tab-x" aria-label="Close tab" onClick={(e) => { e.stopPropagation(); p.arm(); p.onClose(t.id); }}>
            <X size={12} />
          </button>
        </>
      )}
    </div>
  );
}

/** The Lens row: one quiet line that opens to a few actions on your tabs, and the plan card. */
function LensRow({ p, duplicates }: { p: RowProps; duplicates: number }) {
  const [open, setOpen] = useState(false);
  const proposal = p.proposal ?? null;
  const applyRef = useRef<HTMLButtonElement>(null);
  const onPopover = p.onPopover;
  useEffect(() => {
    onPopover?.(p.stack && open);
  }, [onPopover, p.stack, open]);
  useEffect(() => {
    if (proposal) applyRef.current?.focus();
  }, [proposal]);
  const pick = (k: TabActionKind) => {
    setOpen(false);
    p.onPropose?.(k);
  };
  return (
    <div className={`lb-lens${open || proposal ? " is-open" : ""}`}>
      {p.stack ? (
        <button className="lb-stile lb-lens-tile" aria-label="Lens: tidy, group or summarise tabs" aria-expanded={open} aria-controls="lb-lens-actions" onClick={() => setOpen((o) => !o)}>
          <LensMark />
          {duplicates ? <span className="lb-stile-badge" aria-hidden>{duplicates}</span> : null}
        </button>
      ) : (
        <button className="lb-lens-row" aria-expanded={open} aria-controls="lb-lens-actions" onClick={() => setOpen((o) => !o)}>
          <LensMark />
          <span className="lb-lens-text">Lens</span>
          <span className="lb-lens-hint">{duplicates ? `${duplicates} duplicate${duplicates === 1 ? "" : "s"}` : "Tidy · group · ask"}</span>
        </button>
      )}
      {open && !proposal ? (
        <div className="lb-lens-actions" id="lb-lens-actions" role="menu" aria-label="Lens tab actions">
          <button role="menuitem" onClick={() => pick("tidy")}>Tidy tabs <kbd className="lb-kbd">Ctrl Shift K</kbd></button>
          <button role="menuitem" onClick={() => pick("duplicates")} disabled={!duplicates}>Close duplicates{duplicates ? ` (${duplicates})` : ""}</button>
          <button role="menuitem" onClick={() => pick("group-site")}>Group by site</button>
          {p.ai ? <button role="menuitem" onClick={() => pick("summarise")}>Summarise open tabs</button> : null}
        </div>
      ) : null}
      {proposal ? (
        <div className="lb-plan" role="group" aria-label={`Lens plan: ${proposal.title}`}
          onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); p.onCancelProposal?.(); } }}>
          <div className="lb-plan-title">{proposal.title}</div>
          <ul className="lb-plan-list">
            {proposal.lines.slice(0, 8).map((l) => (
              <li key={`${l.id}:${l.detail}`}>
                <span className="lb-tab-title">{l.text}</span>
                {l.detail ? <span className="lb-mono lb-dim">{l.detail}</span> : null}
              </li>
            ))}
            {proposal.lines.length > 8 ? <li className="lb-dim">and {proposal.lines.length - 8} more</li> : null}
          </ul>
          <p className="lb-plan-note">Nothing changes until you apply. Closed tabs can be reopened with Ctrl Shift T.</p>
          <div className="lb-plan-actions">
            <button className="lb-btn lb-btn-sm lb-btn-ghost" onClick={p.onCancelProposal}>Cancel</button>
            <button ref={applyRef} className="lb-btn lb-btn-sm lb-btn-primary" onClick={p.onApplyProposal}>Apply</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function Sidebar(props: Props) {
  const s = props.view.state;
  const prefs = props.prefs ?? DEFAULT_SIDEBAR;
  const stack = prefs.mode === "stack";
  const m = sidebarModel(s);
  const now = props.now ?? Date.now();
  // Reorders glide (FLIP): remember where every row is just before a change, then move each one
  // from there to its new place once React has laid the list out again.
  const listRef = useRef<HTMLDivElement>(null);
  const flip = useRef<FlipCapture | null>(null);
  const arm = () => {
    flip.current = captureFlip(listRef.current?.querySelectorAll(".lb-tab, .lb-folder-head"));
  };
  const p: RowProps = { ...props, arm, stack };

  const [find, setFind] = useState("");
  const findRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (props.findSignal) findRef.current?.focus();
  }, [props.findSignal]);
  const q = find.trim().toLowerCase();
  const match = (t: Tab) => !q || tabLabel(t).toLowerCase().includes(q) || hostOf(t.url).includes(q);

  const sections = useMemo(() => tabSections(m.loose.filter(match), prefs.group, now), [m.loose, prefs.group, now, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const [chatsOpen, setChatsOpen] = useState(false);
  const duplicates = duplicateTabs(s).length;

  const layoutKey = [...m.pinned, ...m.folders.flatMap((f) => [{ id: `${f.folder.id}:${f.folder.collapsed}` }, ...f.tabs]), ...m.loose].map((t) => t.id).join(",") + `|${prefs.group}|${q}`;
  useLayoutEffect(() => {
    flip.current?.play({ mode: "move", duration: "base" });
    flip.current = null;
  }, [layoutKey]);

  const space = s.spaces.find((x) => x.id === s.activeSpace);
  const openUrls = new Set(m.pinned.map((t) => t.url));
  const pins = s.bookmarks.filter((b) => !openUrls.has(b.url)).slice(0, Math.max(0, 6 - m.pinned.length));
  const dropLoose = (e: React.DragEvent) => {
    const id = e.dataTransfer.getData("text/lens-tab");
    if (id) { arm(); props.onDrop(id, null, null); }
  };
  const foldersShown = m.folders.filter((f) => !q || f.tabs.some(match) || f.folder.name.toLowerCase().includes(q));

  return (
    <nav className={`lb-side${stack ? " is-stack" : ""}`} aria-label="Tabs and spaces">
      <div className="lb-side-top">
        {stack ? null : (
          <button className="lb-space-btn" aria-label={`Space: ${space?.name ?? "Space"}. Switch space`} onClick={() => {
            const i = s.spaces.findIndex((x) => x.id === s.activeSpace);
            p.onSpace(s.spaces[(i + 1) % s.spaces.length].id);
          }}>
            <span className="lb-space-dot" />
            <span>{space?.name ?? "Space"}</span>
            {s.spaces.length > 1 ? <ChevronDown size={14} className="lb-dim" /> : null}
          </button>
        )}
        {stack ? null : (
          <button className="lb-icon-btn lb-side-quiet" aria-label={space?.locked ? "Unlock space settings" : "Lock this space"} onClick={p.onLock}>
            {space?.locked ? <Lock size={14} /> : <LockOpen size={14} />}
          </button>
        )}
        {props.onPrefs ? (
          <button className="lb-icon-btn" aria-label={stack ? "Show tab titles" : "Show icons only"} aria-pressed={stack} onClick={() => props.onPrefs!({ mode: stack ? "full" : "stack" })}>
            {stack ? <ChevronsRight size={14} /> : <ChevronsLeft size={14} />}
          </button>
        ) : null}
        {stack ? null : <button className="lb-icon-btn" aria-label="Hide sidebar" onClick={p.onCollapse}><PanelLeft size={16} /></button>}
      </div>

      {stack ? (
        <button className="lb-stile" aria-label="Find a tab (Ctrl Shift A)" onClick={() => props.onPrefs?.({ mode: "full" })}>
          <Search size={15} />
        </button>
      ) : (
        <label className="lb-find">
          <Search size={14} aria-hidden />
          <input
            ref={findRef}
            value={find}
            placeholder="Find a tab"
            aria-label="Find a tab"
            onChange={(e) => setFind(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") { e.preventDefault(); setFind(""); e.currentTarget.blur(); }
              if (e.key === "Enter") {
                const first = sections.flatMap((x) => x.tabs)[0] ?? foldersShown.flatMap((f) => f.tabs.filter(match))[0];
                if (first) { p.onActivate(first.id); setFind(""); }
              }
              if (e.key === "ArrowDown") { e.preventDefault(); listRef.current?.querySelector<HTMLElement>(".lb-tab")?.focus(); }
            }}
          />
          {find ? <button className="lb-icon-btn sm" aria-label="Clear" onClick={() => setFind("")}><X size={12} /></button> : <kbd className="lb-kbd">Ctrl Shift A</kbd>}
        </label>
      )}

      {m.pinned.length || pins.length ? (
        <div className="lb-stiles" aria-label="Pinned">
          {m.pinned.filter(match).map((t) => (
            <button
              key={t.id}
              className={`lb-stile${t.id === s.activeTab ? " is-active" : ""}`}
              aria-label={`Pinned: ${tabLabel(t)}`}
              aria-current={t.id === s.activeTab ? "page" : undefined}
             
              onClick={() => p.onActivate(t.id)}
              onAuxClick={(e) => e.button === 1 && p.onPin(t.id, false)}
            >
              <Avatar url={t.url} title={t.title} size={18} />
            </button>
          ))}
          {pins.map((b) => (
            <button key={b.id} className="lb-stile is-bookmark" aria-label={b.title || b.url} onClick={(e) => p.onOpenUrl(b.url, e.ctrlKey || e.metaKey)} onAuxClick={(e) => e.button === 1 && p.onOpenUrl(b.url, true)}>
              <Avatar url={b.url} title={b.title} size={18} />
            </button>
          ))}
        </div>
      ) : null}

      <LensRow p={p} duplicates={duplicates} />

      <div className="lb-scroll" ref={listRef} role="tablist" aria-orientation="vertical" aria-label="Open tabs">
        <div className="lb-tabs-zone" onDragOver={(e) => e.preventDefault()} onDrop={dropLoose}>
          {sections.map((sec) => (
            <div key={sec.id} className="lb-section" role="presentation">
              {sec.label && !stack ? <div className="lb-section-label">{sec.label}</div> : null}
              {sec.label && stack ? <div className="lb-section-gap" aria-hidden /> : null}
              {sec.tabs.map((t) => <TabRow key={t.id} t={t} active={t.id === s.activeTab} p={p} />)}
            </div>
          ))}
          {q && !sections.some((x) => x.tabs.length) && !foldersShown.length ? <p className="lb-find-none">No tab matches “{find}”.</p> : null}
          <button className={stack ? "lb-stile lb-new-tab" : "lb-new-tab"} aria-label="New tab" onClick={p.onNewTab}>
            <Plus size={14} />
            {stack ? null : <span>New tab</span>}
          </button>
        </div>

        {/* Folders sit at the bottom, one quiet line each. Drop a tab on one to file it. */}
        <div className="lb-folders" aria-label="Folders">
          {foldersShown.map(({ folder, tabs, badges }) => {
            const shown = q ? tabs.filter(match) : tabs;
            const open = !folder.collapsed || (!!q && shown.length > 0);
            return (
              <div
                key={folder.id}
                className="lb-folder"
                onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("is-drop"); }}
                onDragLeave={(e) => e.currentTarget.classList.remove("is-drop")}
                onDrop={(e) => {
                  e.currentTarget.classList.remove("is-drop");
                  const id = e.dataTransfer.getData("text/lens-tab");
                  if (id) { e.stopPropagation(); arm(); props.onDrop(id, null, folder.id); }
                }}
              >
                <button
                  className={stack ? "lb-stile lb-folder-head" : "lb-folder-head"}
                  aria-expanded={open}
                  aria-label={stack ? `Folder ${folder.name}, ${tabs.length} tabs` : undefined}
                 
                  onClick={() => { arm(); p.onToggleFolder(folder.id); }}
                >
                  {stack ? <FolderIcon size={15} /> : open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                  {stack ? null : (
                    <>
                      <span className="lb-folder-name">{folder.name}</span>
                      {badges ? <span className="lb-pill">approve</span> : null}
                      <span className="lb-mono lb-dim lb-push">{tabs.length}</span>
                    </>
                  )}
                </button>
                {open ? shown.map((t) => <TabRow key={t.id} t={t} active={t.id === s.activeTab} p={p} nested />) : null}
              </div>
            );
          })}
          {stack ? null : (
            <button className="lb-folder-add" onClick={props.onNewFolder}>
              <FolderPlus size={13} />
              <span>New folder</span>
            </button>
          )}
        </div>

        {prefs.showChats && props.chats.length && !stack ? (
          <div className="lb-chats">
            <button className="lb-folder-head lb-chats-head" aria-expanded={chatsOpen} onClick={() => setChatsOpen((o) => !o)}>
              {chatsOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              <span className="lb-folder-name">Chats</span>
              <span className="lb-mono lb-dim lb-push">{props.chats.length}</span>
            </button>
            {chatsOpen
              ? props.chats.map((c) => (
                  <button key={c.id} className={`lb-chat${c.id === props.activeChat ? " is-active" : ""}`} onClick={() => props.onChat(c.id)}>
                    <span className="lb-tab-title">{c.title}</span>
                    <span className="lb-mono lb-dim">{relTime(c.at, props.now)}</span>
                  </button>
                ))
              : null}
          </div>
        ) : null}
      </div>

      {prefs.showMedia && props.media && !stack ? (
        <div className="lb-mini-player" aria-label="Playing">
          <Avatar url={props.media.url} title={props.media.title} size={16} />
          <span className="lb-tab-title">{props.media.title}</span>
          <button className="lb-icon-btn sm" aria-label="Play or pause" onClick={() => void mediaCmd(props.media!.id, "toggle").catch(oops("play or pause"))}><Pause size={12} /></button>
          <button className="lb-icon-btn sm" aria-label={props.media.muted ? "Unmute" : "Mute"} onClick={() => props.onMute(props.media!.id, !props.media!.muted)}>{props.media.muted ? <VolumeX size={12} /> : <Volume2 size={12} />}</button>
        </div>
      ) : null}

      <div className="lb-side-foot">
        {prefs.showSpaces && !stack && s.spaces.length > 1
          ? s.spaces.map((sp) => (
              <button key={sp.id} className={`lb-space-pick${sp.id === s.activeSpace ? " is-active" : ""}`} aria-label={`Space: ${sp.name}`} aria-pressed={sp.id === s.activeSpace} onClick={() => p.onSpace(sp.id)}>
                {sp.name.slice(0, 1).toUpperCase()}
              </button>
            ))
          : null}
        {prefs.showSpaces && !stack ? <button className="lb-icon-btn sm" aria-label="New space" onClick={p.onNewSpace}><Plus size={13} /></button> : null}
        {stack ? null : (
          <span className="lb-mono lb-dim lb-sleep-stat">
            {props.view.live.length} awake{props.sleeping ? ` · ${props.sleeping} asleep · ~${(props.sleeping * SLEEP_SAVING_MB / 1000).toFixed(1)} GB saved` : ""}
          </span>
        )}
        {p.onSettings ? <button className="lb-icon-btn sm lb-push" aria-label="Browser settings" onClick={p.onSettings}><Settings size={14} /></button> : null}
      </div>
    </nav>
  );
}
