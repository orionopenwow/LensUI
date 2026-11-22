// Lens Mini: the pocket version of Command. Same state and thread as the full view; Expand ↗ grows
// it in place. Top to bottom: input · context · tiles (or latest answer) · Shelf strip · recent clips · footer.
import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Archive, ArrowUpRight, ClipboardPaste, Copy, Languages, LayoutGrid, Lock, MessageSquare, Pause, PenLine,
  Play, SkipForward, Sparkles, Square, TextSelect, Moon, Wand2, Bug, TerminalSquare, ListChecks, Globe, FileText,
  Captions, Scissors, GitCompare, X,
} from "lucide-react";
import type { ThreadItem, ContextChip } from "../thread";
import type { CommandTemplate, Destination } from "../parse";
import { CATEGORY_LABEL, SPECIAL_PROMPTS, type AppCategory } from "../contextProviders";
import { formatTokens, shelfAdd, type ShelfItem } from "../../shelf/contract";
import { relativeTime, sourceAppName, type ClipView } from "../../clip/contract";
import { Markdown } from "../cards/Markdown";
import type { MiniCard } from "../settings";
import { KIND_ICON } from "../ShelfDrawer";
import "./mini.css";

type IconT = React.ComponentType<{ size?: number; strokeWidth?: number }>;
const TILE_ICON: Record<string, IconT> = {
  summarise: Sparkles, explain: MessageSquare, translate: Languages, rewrite: PenLine, ask: Sparkles,
  "shelf-add": Archive, fix: Wand2, review: Bug, "explain-error": TerminalSquare, todo: ListChecks,
  "ask-page": Globe, extract: Scissors, compare: GitCompare, transcribe: Captions, note: FileText,
};
const TILE_LABEL: Record<string, string> = { ask: "Ask", "shelf-add": "Add to Shelf" };

export interface MiniProps {
  input: React.ReactNode;
  chips: ContextChip[];
  removeChip: (key: string) => void;
  app: { name: string; category: AppCategory } | null;
  tiles: string[];
  templates: CommandTemplate[];
  activeTile: number;
  setActiveTile: (i: number) => void;
  runTile: (id: string) => void;
  latest: Extract<ThreadItem, { kind: "answer" }> | null;
  onPaste: (t: string) => void;
  onCopy: (t: string) => void;
  onToShelf: (t: string) => void;
  onStop: () => void;
  shelfItems: ShelfItem[];
  useShelfItem: (it: ShelfItem) => void;
  clips: ClipView[];
  clipsOn: boolean;
  pasteClip: (c: ClipView) => void;
  dest: Destination;
  privacy: string;
  providerLabel: string;
  onExpand: () => void;
  tab: "actions" | "dashboard";
  setTab: (t: "actions" | "dashboard") => void;
  cards: MiniCard[];
  sessionTokens: number;
  aiReady: boolean;
  anchor: "cursor" | "dock";
  expanding?: boolean;
  onNotice: (t: string, ok?: boolean) => void;
}

export function tileName(id: string, templates: CommandTemplate[]): string {
  return TILE_LABEL[id] ?? SPECIAL_PROMPTS[id]?.name ?? templates.find((t) => t.id === id)?.name.replace(/ &.*$/, "") ?? id;
}

export function MiniView(p: MiniProps) {
  const showAnswer = p.latest && (p.latest.status === "streaming" || p.latest.text);
  return (
    <div className={`mini${p.anchor === "dock" ? " is-dock" : ""}${p.expanding ? " is-expanding" : ""}`} role="dialog" aria-label="Lens Mini">
      <div className="mini-top">{p.input}</div>

      <div className="mini-ctx" aria-label="Context">
        {p.app ? (
          <span className="mini-app">
            <span className="mini-app-dot" aria-hidden />
            {CATEGORY_LABEL[p.app.category]} · {p.app.name}
          </span>
        ) : null}
        {p.chips.map((c) => (
          <span key={c.key} className={`mini-chip${c.localOnly && p.dest === "Claude" ? " is-blocked" : ""}`}>
            {c.source === "selection" ? <TextSelect size={11} strokeWidth={2.4} /> : null}
            <span className="mini-chip-label">{c.label}</span>
            <span className="mini-chip-detail">{formatTokens(c.tokens)}</span>
            <button type="button" aria-label={`Remove ${c.label}`} onClick={() => p.removeChip(c.key)}><X size={10} strokeWidth={2.8} /></button>
          </span>
        ))}
      </div>

      <div className="mini-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={p.tab === "actions"} className={p.tab === "actions" ? "is-on" : ""} onClick={() => p.setTab("actions")}>
          <Sparkles size={12} strokeWidth={2.4} /> Actions
        </button>
        <button type="button" role="tab" aria-selected={p.tab === "dashboard"} className={p.tab === "dashboard" ? "is-on" : ""} onClick={() => p.setTab("dashboard")}>
          <LayoutGrid size={12} strokeWidth={2.4} /> Glance
        </button>
      </div>

      <div className="mini-body">
        {p.tab === "dashboard" ? (
          <MiniDashboard {...p} />
        ) : showAnswer && p.latest ? (
          <div className={`mini-answer is-${p.latest.status}`} aria-live="polite">
            <div className="mini-answer-text">
              {p.latest.text ? <Markdown text={p.latest.text} /> : <p className="mini-muted">Thinking…</p>}
            </div>
            <div className="mini-answer-actions">
              {p.latest.status === "streaming" ? (
                <button type="button" className="mini-btn" onClick={p.onStop}><Square size={12} /> Stop</button>
              ) : (
                <>
                  <button type="button" className="mini-btn is-primary" onClick={() => p.onPaste(p.latest!.text)}><ClipboardPaste size={12} /> Paste</button>
                  <button type="button" className="mini-btn" onClick={() => p.onCopy(p.latest!.text)}><Copy size={12} /> Copy</button>
                  <button type="button" className="mini-btn" onClick={() => p.onToShelf(p.latest!.text)}><Archive size={12} /> Shelf</button>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="mini-tiles" role="listbox" aria-label="Quick actions">
            {p.tiles.map((id, i) => {
              const Icon = TILE_ICON[id] ?? Sparkles;
              return (
                <button
                  key={id}
                  type="button"
                  role="option"
                  aria-selected={i === p.activeTile}
                  className={`mini-tile${i === p.activeTile ? " is-active" : ""}`}
                  onMouseMove={() => p.activeTile !== i && p.setActiveTile(i)}
                  onClick={() => p.runTile(id)}
                >
                  <Icon size={16} strokeWidth={2} />
                  <span>{tileName(id, p.templates)}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {p.tab === "actions" ? (
        <>
          <div className="mini-strip-head">
            <span>Shelf</span>
            <span className="mini-muted">drag in or out</span>
          </div>
          <ol className="mini-strip" aria-label="Shelf">
            {p.shelfItems.slice(0, 8).map((it) => {
              const Icon = KIND_ICON[it.kind] ?? FileText;
              return (
                <li key={it.id}>
                  <button
                    type="button"
                    className="mini-shelf-card"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", it.text || it.url || it.path || it.title);
                      if (it.url) e.dataTransfer.setData("text/uri-list", it.url);
                    }}
                    onClick={() => p.useShelfItem(it)}
                    aria-label={`Use “${it.title}” as context`}
                  >
                    <Icon size={12} strokeWidth={2.2} />
                    <span>{it.title}</span>
                  </button>
                </li>
              );
            })}
            {p.shelfItems.length === 0 ? <li className="mini-muted mini-strip-empty">Drop anything here to keep it</li> : null}
          </ol>
          {p.clipsOn && p.clips.length ? (
            <div className="mini-clips" aria-label="Recent clipboard">
              {p.clips.slice(0, 3).map((c) => (
                <button key={c.id} type="button" className="mini-clip" onClick={() => p.pasteClip(c)} title={undefined}>
                  {c.localOnly ? <Lock size={10} strokeWidth={2.6} /> : null}
                  <span>{c.title || c.preview || (c.kind === "image" ? "Image" : "Clip")}</span>
                </button>
              ))}
            </div>
          ) : null}
        </>
      ) : null}

      <footer className="mini-foot">
        <span className={`mini-dest is-${p.dest.toLowerCase()}`}>
          {p.dest === "Claude" ? null : <Lock size={10} strokeWidth={2.6} />}
          {p.providerLabel}
        </span>
        <span className="mini-muted">{p.privacy}</span>
        <button type="button" className="mini-expand" onClick={p.onExpand} aria-label="Expand to full Lens Command">
          Expand <ArrowUpRight size={12} strokeWidth={2.4} />
        </button>
      </footer>
    </div>
  );
}

function MiniDashboard(p: MiniProps) {
  const [media, setMedia] = useState<{ hasSession: boolean; isPlaying: boolean; title: string; artist: string } | null>(null);
  const [dnd, setDnd] = useState<boolean | null>(null);
  const [note, setNote] = useState("");
  useEffect(() => {
    if (p.cards.includes("media")) invoke<typeof media>("get_media_now_playing_cmd").then(setMedia).catch(() => setMedia(null));
    if (p.cards.includes("focus")) invoke<boolean>("get_dnd_cmd").then(setDnd).catch(() => setDnd(null));
  }, [p.cards]);
  return (
    <div className="mini-dash">
      {p.cards.includes("shelf") ? (
        <section className="mini-card">
          <h3><Archive size={12} /> Shelf <span className="mini-muted">{p.shelfItems.length}</span></h3>
          {p.shelfItems.slice(0, 3).map((it) => (
            <p key={it.id} className="mini-line">{it.title}</p>
          ))}
          {p.shelfItems.length === 0 ? <p className="mini-muted">Empty</p> : null}
        </section>
      ) : null}
      {p.cards.includes("clipboard") ? (
        <section className="mini-card">
          <h3><ClipboardPaste size={12} /> Clipboard</h3>
          {p.clipsOn && p.clips[0] ? (
            <>
              <p className="mini-line">{p.clips[0].title || p.clips[0].preview || "Image"}</p>
              <p className="mini-muted">{sourceAppName(p.clips[0].sourceApp) ?? ""} · {relativeTime(p.clips[0].tsMs)}</p>
            </>
          ) : (
            <p className="mini-muted">{p.clipsOn ? "Nothing yet" : "History is off"}</p>
          )}
        </section>
      ) : null}
      {p.cards.includes("ai") ? (
        <section className="mini-card">
          <h3><span className={`mini-status${p.aiReady ? " is-on" : ""}`} aria-hidden /> AI</h3>
          <p className="mini-line">{p.providerLabel}</p>
          <p className="mini-muted">{p.sessionTokens ? `${formatTokens(p.sessionTokens)} this session` : p.privacy}</p>
        </section>
      ) : null}
      {p.cards.includes("media") && media?.hasSession ? (
        <section className="mini-card">
          <h3>{media.isPlaying ? <Play size={12} /> : <Pause size={12} />} Now playing</h3>
          <p className="mini-line">{media.title}</p>
          <div className="mini-media">
            <span className="mini-muted mini-line">{media.artist}</span>
            <button type="button" className="mini-icon" aria-label={media.isPlaying ? "Pause" : "Play"}
              onClick={() => invoke("media_control_cmd", { action: "play_pause" }).then(() => setMedia({ ...media, isPlaying: !media.isPlaying }))}>
              {media.isPlaying ? <Pause size={12} /> : <Play size={12} />}
            </button>
            <button type="button" className="mini-icon" aria-label="Next" onClick={() => invoke("media_control_cmd", { action: "next" })}><SkipForward size={12} /></button>
          </div>
        </section>
      ) : null}
      {p.cards.includes("focus") && dnd !== null ? (
        <section className="mini-card">
          <h3><Moon size={12} /> Focus</h3>
          <button type="button" role="switch" aria-checked={dnd} className={`mini-toggle${dnd ? " is-on" : ""}`}
            onClick={() => invoke("set_dnd_cmd", { enabled: !dnd }).then(() => setDnd(!dnd))}>
            <span />{dnd ? "Do Not Disturb on" : "Notifications on"}
          </button>
        </section>
      ) : null}
      {p.cards.includes("note") ? (
        <section className="mini-card is-wide">
          <h3><FileText size={12} /> Quick note</h3>
          <form onSubmit={(e) => {
            e.preventDefault();
            if (!note.trim()) return;
            shelfAdd({ kind: "text", text: note.trim() }).then(() => { setNote(""); p.onNotice("Saved to Shelf"); }).catch((err) => p.onNotice(String(err), false));
          }}>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Jot something — Enter saves to the Shelf" aria-label="Quick note" />
          </form>
        </section>
      ) : null}
    </div>
  );
}
