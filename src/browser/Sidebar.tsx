import React from "react";
import { ChevronDown, ChevronRight, FolderPlus, Lock, LockOpen, MoonStar, PanelLeft, Pause, Plus, Search, Settings, Sparkles, Volume2, VolumeX, X } from "lucide-react";
import { media as mediaCmd, SLEEP_SAVING_MB, type BrowserView, type Tab } from "./api";
import { avatar, relTime, sidebarModel, tabLabel } from "./model";

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
  onToggleFolder(id: string): void;
  onDrop(tabId: string, beforeId: string | null, folder: string | null): void;
  onOpenUrl(url: string, background?: boolean): void;
  onChat(id: string): void;
  onCollapse(): void;
  onTidy?(): void;
  onLock?(): void;
  onSettings?(): void;
  sleeping?: number;
  media?: { id: string; title: string; url: string; muted: boolean } | null;
  now?: number;
}

export function Avatar({ url, title, size = 16 }: { url: string; title?: string; size?: number }) {
  const a = avatar(url, title);
  return (
    <span className="lb-av" style={{ width: size, height: size, fontSize: Math.round(size * 0.62), background: `hsl(${a.hue} 46% 42%)` }} aria-hidden>
      {a.letter}
    </span>
  );
}

function TabRow({ t, active, p, depth }: { t: Tab; active: boolean; p: Props; depth: number }) {
  const sleeping = t.life === "sleeping" && !active;
  return (
    <div
      role="tab"
      aria-selected={active}
      tabIndex={0}
      draggable
      className={`lb-tab${active ? " is-active" : ""}${sleeping ? " is-sleeping" : ""}`}
      style={{ paddingLeft: 8 + depth * 12 }}
      onClick={() => p.onActivate(t.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter") p.onActivate(t.id);
        if (e.key === "Delete") p.onClose(t.id);
      }}
      onAuxClick={(e) => e.button === 1 && p.onClose(t.id)}
      onDragStart={(e) => e.dataTransfer.setData("text/lens-tab", t.id)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        const id = e.dataTransfer.getData("text/lens-tab");
        if (id && id !== t.id) p.onDrop(id, t.id, t.folderId ?? null);
      }}
    >
      <Avatar url={t.url} title={t.title} />
      <span className="lb-tab-title">{tabLabel(t)}</span>
      {t.badge === "approve" ? <span className="lb-pill">approve</span> : null}
      {t.busy ? <span className="lb-dot is-amber" aria-label="Unsaved changes" /> : null}
      {sleeping ? <MoonStar size={12} className="lb-dim" aria-label="Sleeping" /> : null}
      {t.audible || t.muted ? (
        <button className="lb-icon-btn sm" aria-label={t.muted ? "Unmute tab" : "Mute tab"} onClick={(e) => { e.stopPropagation(); p.onMute(t.id, !t.muted); }}>
          {t.muted ? <VolumeX size={12} /> : <Volume2 size={12} />}
        </button>
      ) : null}
      <button className="lb-icon-btn sm lb-tab-x" aria-label="Close tab" onClick={(e) => { e.stopPropagation(); p.onClose(t.id); }}>
        <X size={12} />
      </button>
    </div>
  );
}

export function Sidebar(p: Props) {
  const s = p.view.state;
  const m = sidebarModel(s);
  const space = s.spaces.find((x) => x.id === s.activeSpace);
  const pins = s.bookmarks.slice(0, 5);
  return (
    <nav className="lb-side" aria-label="Tabs and spaces">
      <div className="lb-side-top">
        <button className="lb-space-btn" aria-label="Switch space" onClick={() => {
          const i = s.spaces.findIndex((x) => x.id === s.activeSpace);
          p.onSpace(s.spaces[(i + 1) % s.spaces.length].id);
        }}>
          <span className="lb-space-dot" />
          <span>{space?.name ?? "Space"}</span>
          <ChevronDown size={14} className="lb-dim" />
        </button>
        <button className="lb-icon-btn" aria-label={space?.locked ? "Unlock space settings" : "Lock this space"} onClick={p.onLock}>
          {space?.locked ? <Lock size={14} /> : <LockOpen size={14} />}
        </button>
        <button className="lb-icon-btn" aria-label="Hide sidebar" onClick={p.onCollapse}><PanelLeft size={16} /></button>
      </div>
      <button className="lb-search" onClick={p.onSearch}>
        <Search size={14} />
        <span>Search anything</span>
        <kbd>Ctrl L</kbd>
      </button>
      {pins.length ? (
        <div className="lb-pins" aria-label="Pinned sites">
          {pins.map((b) => (
            <button key={b.id} className="lb-pin" aria-label={b.title || b.url} onClick={(e) => p.onOpenUrl(b.url, e.ctrlKey || e.metaKey)} onAuxClick={(e) => e.button === 1 && p.onOpenUrl(b.url, true)}>
              <Avatar url={b.url} title={b.title} size={18} />
            </button>
          ))}
        </div>
      ) : null}

      <div className="lb-scroll">
        <div className="lb-head">
          <span>Tabs</span>
          <span className="lb-head-right">
            <span className="lb-mono">{m.count}</span>
            {p.onTidy ? <button className="lb-icon-btn sm" aria-label="Tidy tabs (Ctrl Shift K)" onClick={p.onTidy}><Sparkles size={12} /></button> : null}
            <button className="lb-icon-btn sm" aria-label="New folder" onClick={p.onNewFolder}><FolderPlus size={12} /></button>
            <button className="lb-icon-btn sm" aria-label="New tab" onClick={p.onNewTab}><Plus size={12} /></button>
          </span>
        </div>
        {m.pinned.length ? (
          <div className="lb-group">
            {m.pinned.map((t) => <TabRow key={t.id} t={t} active={t.id === s.activeTab} p={p} depth={0} />)}
            <div className="lb-rule" />
          </div>
        ) : null}
        {m.folders.map(({ folder, tabs, badges }) => (
          <div
            key={folder.id}
            className="lb-folder"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              const id = e.dataTransfer.getData("text/lens-tab");
              if (id) p.onDrop(id, null, folder.id);
            }}
          >
            <button className="lb-folder-head" aria-expanded={!folder.collapsed} onClick={() => p.onToggleFolder(folder.id)}>
              {folder.collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
              <span>{folder.name}</span>
              {badges ? <span className="lb-pill">approve</span> : null}
              <span className="lb-mono lb-dim lb-push">{tabs.length}</span>
            </button>
            {folder.collapsed ? null : tabs.map((t) => <TabRow key={t.id} t={t} active={t.id === s.activeTab} p={p} depth={1} />)}
          </div>
        ))}
        <div
          className="lb-group"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            const id = e.dataTransfer.getData("text/lens-tab");
            if (id) p.onDrop(id, null, null);
          }}
        >
          {m.loose.map((t) => <TabRow key={t.id} t={t} active={t.id === s.activeTab} p={p} depth={0} />)}
        </div>

        {p.chats.length ? (
          <>
            <div className="lb-head"><span>Chats</span></div>
            {p.chats.map((c) => (
              <button key={c.id} className={`lb-chat${c.id === p.activeChat ? " is-active" : ""}`} onClick={() => p.onChat(c.id)}>
                <span className="lb-tab-title">{c.title}</span>
                <span className="lb-mono lb-dim">{relTime(c.at, p.now)}</span>
              </button>
            ))}
          </>
        ) : null}
      </div>

      {p.media ? (
        <div className="lb-mini-player" aria-label="Playing">
          <Avatar url={p.media.url} title={p.media.title} size={16} />
          <span className="lb-tab-title">{p.media.title}</span>
          <button className="lb-icon-btn sm" aria-label="Play or pause" onClick={() => void mediaCmd(p.media!.id, "toggle").catch(() => {})}><Pause size={12} /></button>
          <button className="lb-icon-btn sm" aria-label={p.media.muted ? "Unmute" : "Mute"} onClick={() => p.onMute(p.media!.id, !p.media!.muted)}>{p.media.muted ? <VolumeX size={12} /> : <Volume2 size={12} />}</button>
        </div>
      ) : null}

      <div className="lb-side-foot">
        {s.spaces.map((sp) => (
          <button key={sp.id} className={`lb-space-pick${sp.id === s.activeSpace ? " is-active" : ""}`} aria-label={`Space: ${sp.name}`} onClick={() => p.onSpace(sp.id)}>
            {sp.name.slice(0, 1).toUpperCase()}
          </button>
        ))}
        <button className="lb-icon-btn" aria-label="New space" onClick={p.onNewSpace}><Plus size={14} /></button>
        <span className="lb-push" />
        <span className="lb-mono lb-dim lb-sleep-stat">
          {p.view.live.length} awake{p.sleeping ? ` · ${p.sleeping} asleep · ~${(p.sleeping * SLEEP_SAVING_MB / 1000).toFixed(1)} GB saved` : ""}
        </span>
        {p.onSettings ? <button className="lb-icon-btn" aria-label="Browser settings" onClick={p.onSettings}><Settings size={14} /></button> : null}
      </div>
    </nav>
  );
}
