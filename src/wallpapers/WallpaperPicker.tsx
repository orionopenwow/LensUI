/**
 * Lens Studio › Wallpapers: the Wallpaper Switcher's picker. A curved fan of cards over a backdrop
 * in the focused wallpaper's own colours; five palette chips per card; everything on the keyboard.
 * Your files come from the folders you add; Backdrop Lab presets and living wallpapers sit beside
 * them. Choosing one shows it through the Lens wallpaper host: the Windows wallpaper is never
 * changed. See docs/WALLPAPER_SWITCHER.md.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Clock, EyeOff, FolderOpen, Heart, Images, Layers, Palette, Play, Search, Shuffle, Sparkles, Tag, Trash2, X } from "lucide-react";
import { ToastHost, toast } from "../ui";
import { usePresence } from "../ui/motion";
import { useLensState } from "../hooks/useLensState";
import { presetById } from "../studio/backdrop/engine";
import { makeTheme, setLiveWallpaper } from "../studio/backdrop/apply";
import { vars } from "../studio/backdrop/ui/vars";
import type { WallpaperSettings } from "../surfaces/wallpaperTypes";
import type { LensConfig } from "../types/lens";
import type { LibraryView, Switched, SwitcherSettings } from "../types/generated";
import { wallpapersApi } from "./api";
import { AutoChangeControls } from "./AutoChangeControls";
import { indexMissing, originalBlob } from "./indexer";
import {
  FIT_LABEL,
  autoSummary,
  byLightness,
  duplicateGroups,
  fanPose,
  fanWindow,
  fileCard,
  isLive,
  moveIndex,
  nextFit,
  sizeLabel,
  sourceOptions,
  toggleLabel,
  visibleCards,
  type Card,
} from "./model";
import { themeFromPalette } from "./theme";
import { virtualCards } from "./virtual";
import "./wallpapers.css";

type Panel = null | "folders" | "schedule" | "tags" | "collections" | "delete";

const errorText = (e: unknown, fallback: string) => (typeof e === "string" && e ? e : fallback);

const KIND_BADGE: Record<string, string> = { video: "Loop", preset: "Backdrop", living: "Living" };

const FanCard: React.FC<{
  card: Card;
  offset: number;
  current: boolean;
  full: string | null;
  onPick: () => void;
}> = ({ card, offset, current, full, onPick }) => {
  const pose = fanPose(offset);
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(false), [full]);
  const focused = offset === 0;
  return (
    <button
      type="button"
      role="option"
      id={`wsw-card-${card.id}`}
      aria-selected={focused}
      aria-label={`${card.name}${current ? ", on your desktop" : ""}`}
      tabIndex={-1}
      className={`wsw-card ${focused ? "is-focus" : ""} ${current ? "is-current" : ""}`}
      data-card={card.id}
      data-offset={offset}
      ref={vars<HTMLButtonElement>({
        "--x": String(pose.x),
        "--z": String(pose.z),
        "--turn": String(pose.turn),
        "--scale": String(pose.scale),
        "--o": String(pose.opacity),
        "--dim": String(pose.dim),
        "z-index": String(pose.layer),
      })}
      onClick={onPick}
    >
      <span className="wsw-art" ref={vars<HTMLSpanElement>({ "--art": card.art })} />
      {card.thumb && <img className="wsw-img" src={convertFileSrc(card.thumb)} alt="" draggable={false} decoding="async" />}
      {focused && full && <img className={`wsw-img wsw-full ${ready ? "is-ready" : ""}`} src={full} alt="" draggable={false} onLoad={() => setReady(true)} />}
      <span className="wsw-badges">
        {card.meta.favorite && (
          <span className="wsw-badge">
            <Heart size={11} aria-hidden fill="currentColor" /> Favourite
          </span>
        )}
        {KIND_BADGE[card.kind] && (
          <span className="wsw-badge">
            {card.kind === "video" ? <Play size={10} aria-hidden fill="currentColor" /> : <Sparkles size={11} aria-hidden />} {KIND_BADGE[card.kind]}
          </span>
        )}
      </span>
      <span className="wsw-foot">
        <span className="wsw-name">{card.name}</span>
        <span className="wsw-chips" aria-hidden>
          {card.palette.slice(0, 5).map((hex, i) => (
            <i key={`${hex}-${i}`} className="wsw-chip" data-hex={hex} ref={vars<HTMLElement>({ "--sw": hex })} />
          ))}
        </span>
      </span>
    </button>
  );
};

const Key: React.FC<{ k: string; children: React.ReactNode; extra?: boolean }> = ({ k, children, extra }) => (
  <span className={`wsw-key ${extra ? "is-extra" : ""}`}>
    <kbd>{k}</kbd>
    {children}
  </span>
);

export const WallpaperPicker: React.FC<{ windowControls?: React.ReactNode; onOpenLab?: () => void }> = ({ windowControls, onOpenLab }) => {
  const { config, updateConfig } = useLensState();
  const [view, setView] = useState<LibraryView | null>(null);
  const [host, setHost] = useState<WallpaperSettings | null>(null);
  const [source, setSource] = useState("");
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const [panel, setPanel] = useState<Panel>(null);
  const [full, setFull] = useState<{ id: string; url: string } | null>(null);
  const [left, setLeft] = useState(0);
  // `rev` moves when a card's labels, thumbnail or palette change (cards are updated in place);
  // `hashRev` when enough new hashes exist to look for look-alikes again.
  const [rev, setRev] = useState(0);
  const [hashRev, setHashRev] = useState(0);
  const [folderText, setFolderText] = useState("");
  const [labelText, setLabelText] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const indexRef = useRef(0);
  indexRef.current = index;

  const load = useCallback(() => {
    wallpapersApi
      .library()
      .then(setView)
      .catch((e) => toast.error(errorText(e, "The wallpaper library could not be read.")));
    wallpapersApi.host().then(setHost).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const un1 = listen<Switched>("lens://wallpapers-switched", (e) => setView((v) => (v ? { ...v, current: e.payload.id } : v)));
    const un2 = listen("lens://wallpaper-changed", () => wallpapersApi.host().then(setHost).catch(() => {}));
    rootRef.current?.focus();
    return () => {
      un1.then((f) => f());
      un2.then((f) => f());
    };
  }, [load]);

  const items = view?.items;
  const settings = view?.settings ?? null;
  const cards = useMemo(() => [...(items ?? []).map(fileCard), ...virtualCards()], [items]);
  const groups = useMemo(() => duplicateGroups(cards.filter((c) => !isLive(c)).map((c) => ({ id: c.id, phash: c.meta.phash }))), [cards, hashRev]);
  const sources = useMemo(() => sourceOptions(settings, cards, groups), [settings, cards, groups, rev]);
  const shown = useMemo(() => visibleCards(cards, source, query, groups), [cards, source, query, groups, rev]);
  // Automatic changes rotate your own files, so their "Choose from" counts leave Lens' own ones out.
  const fileSources = useMemo(() => sourceOptions(settings, cards.filter((c) => !!c.item)), [settings, cards, rev]);
  const at = Math.min(index, Math.max(0, shown.length - 1));
  const focus: Card | undefined = shown[at];
  const fileCount = view?.items.length ?? 0;

  // Thumbnails, palettes and hashes for pictures that have none yet, nearest the focus first.
  const shownRef = useRef(shown);
  shownRef.current = shown;
  useEffect(() => {
    if (!cards.length) return;
    const focusIn = () => {
      const id = shownRef.current[indexRef.current]?.id;
      return Math.max(0, cards.findIndex((c) => c.id === id));
    };
    let done = 0;
    return indexMissing(
      cards,
      focusIn,
      () => {
        setRev((n) => n + 1);
        if (++done % 24 === 0) setHashRev((n) => n + 1);
      },
      (n) => {
        setLeft(n);
        if (n === 0 && done > 0) setHashRev((h) => h + 1);
      }
    );
  }, [cards]);

  // A sharp copy of the picture in focus, once the fan has settled on it.
  useEffect(() => {
    if (!focus || focus.kind !== "image") return;
    let alive = true;
    let url = "";
    const t = window.setTimeout(() => {
      wallpapersApi
        .read(focus.id)
        .then((o) => {
          if (!alive) return;
          url = URL.createObjectURL(originalBlob(o));
          setFull({ id: focus.id, url });
        })
        .catch(() => {});
    }, 260);
    return () => {
      alive = false;
      window.clearTimeout(t);
      if (url) URL.revokeObjectURL(url);
    };
  }, [focus?.id, focus?.kind]);

  const go = useCallback((delta: number) => setIndex((i) => moveIndex(Math.min(i, Math.max(0, shownRef.current.length - 1)), delta, shownRef.current.length)), []);
  const focusOn = useCallback(
    (id: string) => {
      const i = shownRef.current.findIndex((c) => c.id === id);
      if (i >= 0) setIndex(i);
      else {
        setSource("");
        setQuery("");
        const j = cards.filter((c) => !c.meta.hidden).findIndex((c) => c.id === id);
        if (j >= 0) setIndex(j);
      }
    },
    [cards]
  );

  const saveSettings = useCallback((next: SwitcherSettings) => {
    setView((v) => (v ? { ...v, settings: next } : v));
    wallpapersApi
      .saveSettings(next)
      .then(setView)
      .catch((e) => toast.error(errorText(e, "That could not be saved.")));
  }, []);

  const setMeta = useCallback((card: Card, patch: Partial<Card["meta"]>) => {
    if (!card.item) return;
    const meta = { ...card.meta, ...patch };
    card.meta = meta;
    card.item.meta = meta;
    setRev((n) => n + 1);
    wallpapersApi.setMeta(card.id, meta).catch((e) => toast.error(errorText(e, "That could not be saved.")));
  }, []);

  const apply = useCallback(
    async (card: Card) => {
      try {
        const prev = await wallpapersApi.host();
        const undo = { label: "Undo", onClick: () => void wallpapersApi.setHost(prev).catch(() => {}) };
        if (card.kind === "preset") {
          const preset = presetById(card.id.slice("preset:".length));
          if (!preset) return;
          await setLiveWallpaper(preset.state);
        } else if (card.kind === "living") {
          await wallpapersApi.setHost({ ...prev, enabled: true, scene: card.id.slice("living:".length), calm: false });
        } else {
          await wallpapersApi.set(card.id);
        }
        toast.success(`${card.name} is on your desktop.`, { action: undo });
      } catch (e) {
        toast.error(errorText(e, "That wallpaper could not be shown."));
      }
    },
    []
  );

  const random = useCallback(() => {
    wallpapersApi
      .step("random")
      .then((s) => {
        focusOn(s.id);
        toast.success(`${s.name.replace(/\.[^.]+$/, "")} is on your desktop.`);
      })
      .catch((e) => toast.error(errorText(e, "There is nothing to shuffle yet.")));
  }, [focusOn]);

  const cycleFit = useCallback(() => {
    wallpapersApi
      .host()
      .then((h) => wallpapersApi.setHost({ ...h, fit: nextFit(h.fit) }))
      .then((st) => {
        setHost(st.settings as WallpaperSettings);
        toast(`Fit: ${FIT_LABEL[st.settings.fit] ?? st.settings.fit}`);
      })
      .catch(() => {});
  }, []);

  const themeFrom = useCallback(
    async (card: Card) => {
      if (!config) return;
      try {
        const undo = (prev: LensConfig) => ({ label: "Undo", onClick: () => updateConfig(prev) });
        if (card.kind === "preset") {
          const preset = presetById(card.id.slice("preset:".length));
          if (!preset) return;
          const r = await makeTheme(preset.state, card.name, config, updateConfig);
          toast.success(`Theme made from ${card.name} and applied.`, { action: undo(r.prevConfig) });
          return;
        }
        if (card.palette.length < 3 || (card.kind === "image" && !card.meta.palette.length)) {
          toast("Still reading this picture's colours. Try again in a moment.");
          return;
        }
        const r = await themeFromPalette(byLightness(card.palette), card.name, config, updateConfig);
        toast.success(`Theme "${r.label}" made from this wallpaper and applied.`, { action: undo(r.prevConfig) });
      } catch (e) {
        toast.error(errorText(e, "A theme could not be made from this one."));
      }
    },
    [config, updateConfig]
  );

  const recycle = useCallback(
    (card: Card) => {
      wallpapersApi
        .recycle(card.id)
        .then(() => {
          setPanel(null);
          setView((v) => (v ? { ...v, items: v.items.filter((it) => it.id !== card.id) } : v));
          toast.success(`${card.name} is in the Recycle Bin. You can restore it from there.`);
        })
        .catch((e) => toast.error(errorText(e, "That file could not be moved to the Recycle Bin.")));
    },
    []
  );

  const addFolder = useCallback(
    (path: string) => {
      const p = path.trim().replace(/^"|"$/g, "");
      if (!p || !view) return;
      setFolderText("");
      saveSettings({ ...view.settings, folders: [...view.settings.folders.filter((f) => f.toLowerCase() !== p.toLowerCase()), p] });
    },
    [view, saveSettings]
  );

  const isFile = !!focus?.item;
  const onKey = (e: React.KeyboardEvent) => {
    const typing = (e.target as HTMLElement).closest("input, select, textarea");
    if (e.key === "Escape") {
      if (panel) setPanel(null);
      else if (query) setQuery("");
      else getCurrentWindow().hide().catch(() => {});
      rootRef.current?.focus();
      e.preventDefault();
      return;
    }
    if (typing || e.ctrlKey || e.altKey || e.metaKey) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const act: Record<string, () => void> = {
      ArrowRight: () => go(1),
      ArrowLeft: () => go(-1),
      PageDown: () => go(5),
      PageUp: () => go(-5),
      Home: () => setIndex(0),
      End: () => setIndex(Math.max(0, shown.length - 1)),
      Enter: () => focus && void apply(focus),
      "/": () => searchRef.current?.focus(),
      r: random,
      v: cycleFit,
      s: () => setPanel((p) => (p === "schedule" ? null : "schedule")),
      m: () => focus && void themeFrom(focus),
      f: () => focus && isFile && setMeta(focus, { favorite: !focus.meta.favorite }),
      h: () => focus && isFile && setMeta(focus, { hidden: !focus.meta.hidden }),
      t: () => isFile && setPanel((p) => (p === "tags" ? null : "tags")),
      c: () => isFile && setPanel((p) => (p === "collections" ? null : "collections")),
      o: () => focus && isFile && void wallpapersApi.reveal(focus.id).catch(() => {}),
      Delete: () => isFile && setPanel("delete"),
    };
    const run = act[k];
    if (run) {
      e.preventDefault();
      run();
    }
  };

  // The wheel turns the fan, one card per notch.
  const wheelAt = useRef(0);
  const onWheel = (e: React.WheelEvent) => {
    const now = performance.now();
    if (now - wheelAt.current < 90 || Math.abs(e.deltaY) + Math.abs(e.deltaX) < 8) return;
    wheelAt.current = now;
    go(e.deltaY + e.deltaX > 0 ? 1 : -1);
  };

  const palette = focus?.palette?.length ? byLightness(focus.palette) : [];
  const bg: Record<string, string | undefined> = {};
  for (let i = 0; i < 5; i++) bg[`--wsw-c${i + 1}`] = palette[Math.min(i, palette.length - 1)];
  const [from, to] = fanWindow(at, shown.length);
  const panelPresence = usePresence<HTMLDivElement>(!!panel, { enter: { x: 16, opacity: 0 }, exit: { x: 12, opacity: 0 } });
  const lastPanel = useRef<Panel>(null);
  if (panel) lastPanel.current = panel;
  const openPanel = panel ?? lastPanel.current;
  const labelKind = openPanel === "collections" ? "collections" : "tags";
  const known = labelKind === "collections" ? sources.filter((s) => s.id.startsWith("c:")).map((s) => s.label) : sources.filter((s) => s.id.startsWith("t:")).map((s) => s.label.slice(1));

  const setLabels = (card: Card, next: string[]) => setMeta(card, labelKind === "tags" ? { tags: next } : { collections: next });

  return (
    <div className="wsw" ref={vars<HTMLDivElement>(bg, rootRef)} tabIndex={-1} onKeyDown={onKey} data-wallpaper-picker data-focus={focus?.id ?? ""}>
      <div className="wsw-bg" aria-hidden />
      <header className="wsw-top" data-tauri-drag-region>
        <div className="wsw-title" data-tauri-drag-region>
          <span>Lens Studio</span>
          <span aria-hidden>›</span> Wallpapers
        </div>
        <label className="wsw-search">
          <Search size={13} aria-hidden />
          <input
            ref={searchRef}
            value={query}
            placeholder="Search names, folders, tags"
            aria-label="Search wallpapers"
            onChange={(e) => {
              setQuery(e.target.value);
              setIndex(0);
            }}
          />
        </label>
        <div className="wsw-sources" role="tablist" aria-label="Show">
          {sources.map((s) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={source === s.id}
              className={`wsw-src ${source === s.id ? "on" : ""}`}
              data-source={s.id}
              onClick={() => {
                setSource(s.id);
                setIndex(0);
              }}
            >
              {s.label} <small>{s.count}</small>
            </button>
          ))}
        </div>
        <div className="wsw-top-end">
          <button type="button" className={`wsw-btn ${panel === "folders" ? "on" : ""}`} aria-pressed={panel === "folders"} onClick={() => setPanel((p) => (p === "folders" ? null : "folders"))}>
            <FolderOpen size={13} aria-hidden /> Folders
          </button>
          <button type="button" className={`wsw-btn ${panel === "schedule" ? "on" : ""}`} aria-pressed={panel === "schedule"} aria-keyshortcuts="S" onClick={() => setPanel((p) => (p === "schedule" ? null : "schedule"))}>
            <Clock size={13} aria-hidden /> {view?.settings.auto.enabled ? "Changing automatically" : "Change automatically"}
          </button>
          {onOpenLab && (
            <button type="button" className="wsw-btn" onClick={onOpenLab}>
              <Layers size={13} aria-hidden /> Backdrop Lab
            </button>
          )}
          {windowControls}
        </div>
      </header>

      <div
        className="wsw-stage"
        role={shown.length ? "listbox" : undefined}
        aria-label={shown.length ? "Wallpapers" : undefined}
        aria-activedescendant={focus ? `wsw-card-${focus.id}` : undefined}
        onWheel={onWheel}
      >
        {shown.length === 0 ? (
          <div className="wsw-empty">
            <Images size={30} aria-hidden />
            <h2>{query || source ? "Nothing matches" : "Add a folder of wallpapers"}</h2>
            <p>
              {query || source
                ? "Try another word, or show everything."
                : "Lens lists the pictures and loops in the folders you choose. It never moves or changes them, and your Windows wallpaper stays as it is."}
            </p>
            <div className="wsw-empty-row">
              {query || source ? (
                <button
                  type="button"
                  className="wsw-btn primary"
                  onClick={() => {
                    setQuery("");
                    setSource("");
                  }}
                >
                  Show everything
                </button>
              ) : (
                <button type="button" className="wsw-btn primary" onClick={() => setPanel("folders")}>
                  Add a folder
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="wsw-fan">
            {shown.slice(from, to + 1).map((card, i) => (
              <FanCard
                key={card.id}
                card={card}
                offset={from + i - at}
                current={!!view && view.current === card.id && !host?.scene}
                full={full && full.id === card.id ? full.url : null}
                onPick={() => (from + i === at ? void apply(card) : setIndex(from + i))}
              />
            ))}
          </div>
        )}
      </div>

      <div className="wsw-info">
        {focus && (
          <>
            <div className="wsw-meta" aria-live="polite">
              <b>
                {at + 1} of {shown.length}
              </b>
              <span>{focus.detail}</span>
              {focus.meta.width > 0 && (
                <span>
                  {focus.meta.width} × {focus.meta.height}
                </span>
              )}
              {focus.item && <span>{sizeLabel(focus.item.bytes)}</span>}
              {(focus.meta.collections.length > 0 || (isFile && focus.meta.tags.length > 0)) && (
                <span className="wsw-labels">
                  {focus.meta.collections.map((c) => (
                    <span key={`c-${c}`} className="wsw-label">
                      {c}
                    </span>
                  ))}
                  {isFile &&
                    focus.meta.tags.map((t) => (
                      <span key={`t-${t}`} className="wsw-label">
                        #{t}
                      </span>
                    ))}
                </span>
              )}
            </div>
            <div className="wsw-actions">
              <button type="button" className="wsw-btn primary" data-act="set" onClick={() => void apply(focus)}>
                Set as wallpaper
              </button>
              <button type="button" className={`wsw-btn ${focus.meta.favorite ? "on" : ""}`} aria-pressed={focus.meta.favorite} disabled={!isFile} onClick={() => setMeta(focus, { favorite: !focus.meta.favorite })}>
                <Heart size={13} aria-hidden /> Favourite
              </button>
              <button type="button" className={`wsw-btn ${focus.meta.hidden ? "on" : ""}`} aria-pressed={focus.meta.hidden} disabled={!isFile} onClick={() => setMeta(focus, { hidden: !focus.meta.hidden })}>
                <EyeOff size={13} aria-hidden /> {focus.meta.hidden ? "Hidden" : "Hide"}
              </button>
              <button type="button" className={`wsw-btn ${panel === "tags" ? "on" : ""}`} disabled={!isFile} onClick={() => setPanel((p) => (p === "tags" ? null : "tags"))}>
                <Tag size={13} aria-hidden /> Tags
              </button>
              <button type="button" className={`wsw-btn ${panel === "collections" ? "on" : ""}`} disabled={!isFile} onClick={() => setPanel((p) => (p === "collections" ? null : "collections"))}>
                <Layers size={13} aria-hidden /> Collection
              </button>
              <button type="button" className="wsw-btn" onClick={random} disabled={fileCount === 0}>
                <Shuffle size={13} aria-hidden /> Random
              </button>
              <button type="button" className="wsw-btn" onClick={cycleFit}>
                Fit: {FIT_LABEL[host?.fit ?? "cover"] ?? "Fill the screen"}
              </button>
              <button type="button" className="wsw-btn" data-act="theme" onClick={() => void themeFrom(focus)} disabled={focus.kind === "living" || focus.kind === "video"}>
                <Palette size={13} aria-hidden /> Make a theme from this
              </button>
              <button type="button" className="wsw-btn" disabled={!isFile} onClick={() => void wallpapersApi.reveal(focus.id).catch(() => {})}>
                <FolderOpen size={13} aria-hidden /> Open folder
              </button>
              <button type="button" className="wsw-btn danger" disabled={!isFile} onClick={() => setPanel("delete")}>
                <Trash2 size={13} aria-hidden /> Delete
              </button>
            </div>
          </>
        )}
      </div>

      <footer className="wsw-keys" aria-label="Keyboard">
        <Key k="← →">Browse</Key>
        <Key k="Enter">Set</Key>
        <Key k="/">Search</Key>
        <Key k="F">Favourite</Key>
        <Key k="H">Hide</Key>
        <Key k="T" extra>
          Tags
        </Key>
        <Key k="C" extra>
          Collection
        </Key>
        <Key k="R">Random</Key>
        <Key k="V" extra>
          Fit
        </Key>
        <Key k="M" extra>
          Theme
        </Key>
        <Key k="O" extra>
          Open folder
        </Key>
        <Key k="Del" extra>
          Recycle Bin
        </Key>
        <Key k="Esc">Close</Key>
        {left > 0 && <span className="wsw-progress">Making previews: {left} to go</span>}
      </footer>

      {panelPresence.mounted && (
        <div className="wsw-panel" ref={panelPresence.ref} role="dialog" aria-label={openPanel ?? "Panel"} data-panel={openPanel ?? ""}>
          {openPanel === "folders" && view && (
            <>
              <div className="wsw-panel-head">
                <h3>Folders</h3>
                <button type="button" className="wsw-btn" aria-label="Close" onClick={() => setPanel(null)}>
                  <X size={13} aria-hidden />
                </button>
              </div>
              <p>Lens lists the pictures and video loops in these folders, four levels deep. It never moves or changes them.</p>
              <ul className="wsw-list">
                {view.settings.folders.map((f) => (
                  <li key={f} className={view.missing.includes(f) ? "is-missing" : ""}>
                    <span>{f}</span>
                    <button type="button" className="wsw-btn" onClick={() => saveSettings({ ...view.settings, folders: view.settings.folders.filter((x) => x !== f) })}>
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
              {view.missing.length > 0 && <p>A folder shown in red could not be read. It may be on a drive that is not connected.</p>}
              <form
                className="wsw-row"
                onSubmit={(e) => {
                  e.preventDefault();
                  addFolder(folderText);
                }}
              >
                <input className="wsw-input" value={folderText} placeholder="Paste a folder path" aria-label="Folder path" onChange={(e) => setFolderText(e.target.value)} />
                <button type="submit" className="wsw-btn primary" disabled={!folderText.trim()}>
                  Add
                </button>
              </form>
              {view.suggested.length > 0 && (
                <>
                  <p>On this PC:</p>
                  <ul className="wsw-list">
                    {view.suggested.map((f) => (
                      <li key={f}>
                        <span>{f}</span>
                        <button type="button" className="wsw-btn" onClick={() => addFolder(f)}>
                          Add
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {view.truncated && <p>This library is very large: only the first 5,000 files are listed.</p>}
            </>
          )}
          {openPanel === "schedule" && view && (
            <>
              <div className="wsw-panel-head">
                <h3>Change automatically</h3>
                <button type="button" className="wsw-btn" aria-label="Close" onClick={() => setPanel(null)}>
                  <X size={13} aria-hidden />
                </button>
              </div>
              <AutoChangeControls settings={view.settings} sources={fileSources} onChange={saveSettings} />
              <p>{autoSummary(view.settings.auto)}</p>
            </>
          )}
          {(openPanel === "tags" || openPanel === "collections") && focus && (
            <>
              <div className="wsw-panel-head">
                <h3>{labelKind === "tags" ? "Tags" : "Collections"}</h3>
                <button type="button" className="wsw-btn" aria-label="Close" onClick={() => setPanel(null)}>
                  <X size={13} aria-hidden />
                </button>
              </div>
              <p>
                {labelKind === "tags" ? "Words to find this wallpaper by." : "Sets you can browse, and that automatic changes can draw from."} For <b>{focus.name}</b>:
              </p>
              <div className="wsw-toggles">
                {[...new Set([...known, ...focus.meta[labelKind]])].map((l) => {
                  const on = focus.meta[labelKind].some((x) => x.toLowerCase() === l.toLowerCase());
                  return (
                    <button key={l} type="button" className={`wsw-btn ${on ? "on" : ""}`} aria-pressed={on} onClick={() => setLabels(focus, toggleLabel(focus.meta[labelKind], l))}>
                      {l}
                    </button>
                  );
                })}
              </div>
              <form
                className="wsw-row"
                onSubmit={(e) => {
                  e.preventDefault();
                  setLabels(focus, toggleLabel(focus.meta[labelKind], labelText));
                  setLabelText("");
                }}
              >
                <input className="wsw-input" value={labelText} placeholder={labelKind === "tags" ? "New tag" : "New collection"} aria-label={labelKind === "tags" ? "New tag" : "New collection"} onChange={(e) => setLabelText(e.target.value)} />
                <button type="submit" className="wsw-btn primary" disabled={!labelText.trim()}>
                  Add
                </button>
              </form>
            </>
          )}
          {openPanel === "delete" && focus && (
            <>
              <div className="wsw-panel-head">
                <h3>Move to the Recycle Bin?</h3>
              </div>
              <p>
                <b>{focus.item?.name ?? focus.name}</b> will leave its folder and go to the Windows Recycle Bin, where you can restore it. Nothing is deleted for good.
              </p>
              <div className="wsw-row">
                <button type="button" className="wsw-btn danger" data-act="recycle" onClick={() => recycle(focus)}>
                  Move to Recycle Bin
                </button>
                <button type="button" className="wsw-btn primary" autoFocus onClick={() => setPanel(null)}>
                  Keep it
                </button>
              </div>
            </>
          )}
        </div>
      )}
      <ToastHost />
    </div>
  );
};
