// Lens Notes: notes and to-dos with markdown-lite, kept in the Shelf (a shelf called "Notes"),
// so they show up in Command and context packs too. Any note can be pinned to the desktop as a
// small always-on-top sticky that can be made click-through.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import type { LensConfig } from "../../types/generated";
import { EVT_SHELF_CHANGED, shelfAdd, shelfCreate, shelfGet, shelfList, shelfPin, shelfRemove, shelfUpdate, shelvesList, type ShelfInfo, type ShelfItem } from "../../shelf/contract";
import { AppShell, isKey } from "../shell/AppShell";
import { Button, Card, Confirm, Empty, ErrorNote, Search, Skeleton, Tabs, Toast, cx } from "../shell/ui";
import { ago, plural } from "../shell/format";
import { NEW_NOTE, NEW_TODO, NOTES_SHELF_NAME, NOTE_TAG, parse, searchNotes, titleOf, todoProgress, toggleTodo, type Block, type Inline, type NoteLite } from "../models/notes";
import { friendlyError } from "../models/load";
import { coreApp } from "../registry";

const Inl: React.FC<{ parts: Inline[] }> = ({ parts }) => (
  <>
    {parts.map((p, i) =>
      p.t === "b" ? (
        <strong key={i}>{p.v}</strong>
      ) : p.t === "i" ? (
        <em key={i}>{p.v}</em>
      ) : p.t === "code" ? (
        <code key={i}>{p.v}</code>
      ) : p.t === "link" ? (
        <a key={i} href={p.href} onClick={(e) => (e.preventDefault(), invoke("launch_app_cmd", { path: p.href }).catch(() => {}))}>
          {p.v}
        </a>
      ) : (
        <React.Fragment key={i}>{p.v}</React.Fragment>
      )
    )}
  </>
);

/** Markdown-lite, rendered without HTML injection; to-dos are real checkboxes. */
export const NoteView: React.FC<{ text: string; onToggle?: (line: number) => void }> = ({ text, onToggle }) => (
  <div className="nt-view">
    {parse(text).map((b: Block) =>
      b.t === "gap" ? (
        <div key={b.line} className="nt-gap" />
      ) : b.t === "h" ? (
        React.createElement(`h${b.level + 1}`, { key: b.line, className: "nt-h" }, <Inl parts={b.inl} />)
      ) : b.t === "todo" ? (
        <label key={b.line} className={cx("nt-todo", b.done && "done")}>
          <input type="checkbox" checked={b.done} disabled={!onToggle} onChange={() => onToggle?.(b.line)} />
          <span>
            <Inl parts={b.inl} />
          </span>
        </label>
      ) : b.t === "li" ? (
        <div key={b.line} className="nt-li">
          <Inl parts={b.inl} />
        </div>
      ) : (
        <p key={b.line} className="nt-p">
          <Inl parts={b.inl} />
        </p>
      )
    )}
  </div>
);

const toLite = (i: ShelfItem): NoteLite => ({ id: i.id, title: i.title, text: i.text, pinned: i.pinned, updated_ms: i.updated_ms, tags: i.tags });

async function notesShelf(): Promise<string> {
  const all = await shelvesList();
  const found = all.find((s) => s.name === NOTES_SHELF_NAME);
  return found ? found.id : (await shelfCreate(NOTES_SHELF_NAME)).id;
}

export interface NotesDemo {
  notes: NoteLite[];
  packs?: ShelfInfo[];
  selected?: string;
  edit?: boolean;
}

export const Notes: React.FC<{ config: LensConfig | null; updateConfig: (c: LensConfig) => Promise<void>; demo?: NotesDemo }> = ({ config, updateConfig, demo }) => {
  const app = coreApp("notes")!;
  const [shelf, setShelf] = useState<string | null>(demo ? "notes" : null);
  const [notes, setNotes] = useState<NoteLite[] | null>(demo?.notes ?? null);
  const [packs, setPacks] = useState<ShelfInfo[]>(demo?.packs ?? []);
  const [error, setError] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(demo?.selected ?? null);
  const [draft, setDraft] = useState<string>("");
  const [mode, setMode] = useState<"read" | "edit">(demo?.edit ? "edit" : "read");
  const [query, setQuery] = useState("");
  const [confirmDel, setConfirmDel] = useState<NoteLite | null>(null);
  const [sendTo, setSendTo] = useState(false);
  const [toast, setToast] = useState<{ text: string; tone: "ok" | "bad" } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const editRef = useRef<HTMLTextAreaElement>(null);
  const saveTimer = useRef<number>(0);

  const load = useCallback(async () => {
    if (demo) return;
    try {
      const id = shelf ?? (await notesShelf());
      setShelf(id);
      const items = await shelfList(id);
      setNotes(items.filter((i) => i.kind === "text").map(toLite));
      setPacks((await shelvesList()).filter((s) => s.id !== id));
      setError(null);
    } catch (e) {
      setError(friendlyError(String(e)));
    }
  }, [shelf, demo]);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (demo) return;
    const un = listen(EVT_SHELF_CHANGED, () => load());
    return () => {
      un.then((f) => f()).catch(() => {});
    };
  }, [load, demo]);

  const list = useMemo(() => searchNotes(notes ?? [], query), [notes, query]);
  const current = (notes ?? []).find((n) => n.id === sel) ?? list[0] ?? null;
  useEffect(() => {
    if (current) setDraft(current.text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  const save = (id: string, text: string) => {
    setNotes((ns) => (ns ?? []).map((n) => (n.id === id ? { ...n, text, title: titleOf(text), updated_ms: Date.now() } : n)));
    if (demo) return;
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      shelfUpdate(id, { text, title: titleOf(text) }).catch((e) => setToast({ text: friendlyError(String(e)), tone: "bad" }));
    }, 400);
  };
  const create = async (template: string) => {
    if (demo || !shelf) return;
    try {
      const id = await shelfAdd({ kind: "text", title: titleOf(template), text: template, tags: [NOTE_TAG], source_app: "Lens Notes" }, shelf);
      await load();
      setSel(id);
      setMode("edit");
      setTimeout(() => editRef.current?.focus(), 0);
    } catch (e) {
      setToast({ text: friendlyError(String(e)), tone: "bad" });
    }
  };
  const toggle = (line: number) => {
    if (!current) return;
    const t = toggleTodo(current.text, line);
    setDraft(t);
    save(current.id, t);
  };
  const pinSticky = () =>
    current &&
    invoke<string>("coreapp_sticky_open", { noteId: current.id })
      .then(() => setToast({ text: "Pinned to the desktop. Close it from its ✕.", tone: "ok" }))
      .catch((e) => setToast({ text: friendlyError(String(e)), tone: "bad" }));
  const send = async (pack: ShelfInfo) => {
    if (!current) return;
    setSendTo(false);
    try {
      await shelfAdd({ kind: "text", title: current.title, text: current.text, source_app: "Lens Notes", tags: [NOTE_TAG] }, pack.id);
      setToast({ text: `Added to “${pack.name}”.`, tone: "ok" });
    } catch (e) {
      setToast({ text: friendlyError(String(e)), tone: "bad" });
    }
  };

  const keys = [
    { keys: "Ctrl+N", label: "New note", match: (e: KeyboardEvent) => isKey(e, "n", { ctrl: true }), run: () => create(NEW_NOTE) },
    { keys: "Ctrl+Shift+N", label: "New checklist", match: (e: KeyboardEvent) => isKey(e, "n", { ctrl: true, shift: true }), run: () => create(NEW_TODO) },
    { keys: "Ctrl+F", label: "Search notes", match: (e: KeyboardEvent) => isKey(e, "f", { ctrl: true }), run: () => searchRef.current?.focus() },
    { keys: "Ctrl+E", label: "Edit / read", match: (e: KeyboardEvent) => isKey(e, "e", { ctrl: true }), run: () => setMode((m) => (m === "edit" ? "read" : "edit")) },
    { keys: "Ctrl+D", label: "Pin to desktop", match: (e: KeyboardEvent) => isKey(e, "d", { ctrl: true }), run: () => pinSticky() },
    {
      keys: "Ctrl+Shift+U",
      label: "Make every sticky clickable again",
      match: (e: KeyboardEvent) => isKey(e, "u", { ctrl: true, shift: true }),
      run: () => invoke<number>("coreapp_stickies_release").then((n) => setToast({ text: `${plural(n, "sticky", "stickies")} clickable again.`, tone: "ok" })),
    },
  ];

  return (
    <AppShell
      app={app}
      config={config}
      updateConfig={updateConfig}
      keys={keys}
      toolbar={
        <>
          <Button small onClick={() => create(NEW_NOTE)} disabled={!shelf}>
            New note
          </Button>
          <Button small onClick={() => create(NEW_TODO)} disabled={!shelf}>
            New checklist
          </Button>
          <div className="ca-spacer" />
          <Search value={query} onChange={setQuery} placeholder="Search notes" inputRef={searchRef} />
        </>
      }
      meta={notes ? `${plural(notes.length, "note")} · saved in the Shelf as you type` : "Loading…"}
      actions={
        current && (
          <>
            <Button onClick={() => setSendTo((v) => !v)} aria-expanded={sendTo} disabled={!packs.length}>
              Send to context pack
            </Button>
            <Button variant="primary" onClick={pinSticky}>
              Pin to desktop
            </Button>
          </>
        )
      }
    >
      {error && <ErrorNote onRetry={load}>{error}</ErrorNote>}
      {!notes && !error && <Skeleton rows={6} />}
      {notes && notes.length === 0 && (
        <Empty title="No notes yet" config={config} action={<Button variant="primary" onClick={() => create(NEW_NOTE)}>Write a note</Button>}>
          Notes live in your Shelf, so Command can use them as context. Pin any note to the desktop as a sticky.
        </Empty>
      )}
      {notes && notes.length > 0 && (
        <div className="nt-split">
          <nav className="nt-list" aria-label="Notes">
            {list.length === 0 && <p className="ca-muted">Nothing matches “{query}”.</p>}
            <ul className="ca-list" role="listbox" aria-label="Notes">
              {list.map((n) => {
                const p = todoProgress(n.text);
                return (
                  <li
                    key={n.id}
                    role="option"
                    aria-selected={n.id === current?.id}
                    tabIndex={0}
                    className={cx("ca-item", n.id === current?.id && "selected")}
                    onClick={() => setSel(n.id)}
                    onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setSel(n.id))}
                  >
                    <div className="ca-item-main">
                      <div className="ca-item-title">
                        {n.pinned && <span aria-label="Pinned">● </span>}
                        {n.title || titleOf(n.text)}
                      </div>
                      <div className="ca-item-sub">
                        {p.total ? `${p.done}/${p.total} done · ` : ""}
                        {ago(n.updated_ms)}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </nav>
          {current && (
            <Card
              className="nt-editor"
              meta={`edited ${ago(current.updated_ms)}`}
              actions={
                <>
                  <Tabs label="Mode" value={mode} onChange={setMode} options={[{ id: "read", label: "Read" }, { id: "edit", label: "Edit" }]} />
                  <Button small variant="quiet" onClick={() => !demo && shelfPin(current.id, !current.pinned).then(load)} aria-pressed={current.pinned}>
                    {current.pinned ? "Unpin" : "Pin"}
                  </Button>
                  <Button small variant="quiet" onClick={() => setConfirmDel(current)}>
                    Delete
                  </Button>
                </>
              }
            >
              {sendTo && (
                <div className="nt-send" role="menu" aria-label="Context packs">
                  {packs.map((p) => (
                    <button key={p.id} type="button" role="menuitem" className="ca-btn small" onClick={() => send(p)}>
                      {p.name} <span className="ca-muted">{p.item_count}</span>
                    </button>
                  ))}
                </div>
              )}
              {mode === "edit" ? (
                <textarea
                  ref={editRef}
                  className="nt-text"
                  value={draft}
                  spellCheck
                  aria-label="Note text. Markdown: # heading, - list, - [ ] to-do, **bold**, *italic*, `code`."
                  onChange={(e) => (setDraft(e.target.value), save(current.id, e.target.value))}
                />
              ) : (
                <NoteView text={draft} onToggle={toggle} />
              )}
              <p className="ca-mono" style={{ margin: "12px 0 0" }}>
                # heading · - list · - [ ] to-do · **bold** · *italic* · `code`
              </p>
            </Card>
          )}
        </div>
      )}
      {confirmDel && (
        <Confirm
          title={`Delete “${confirmDel.title || "this note"}”?`}
          body={<p>It's removed from the Shelf. Copies you sent to other context packs stay.</p>}
          confirmLabel="Delete note"
          danger
          onCancel={() => setConfirmDel(null)}
          onConfirm={() => {
            const n = confirmDel;
            setConfirmDel(null);
            shelfRemove(n.id)
              .then(() => (setSel(null), load()))
              .catch((e) => setToast({ text: friendlyError(String(e)), tone: "bad" }));
          }}
        />
      )}
      <Toast text={toast?.text ?? null} tone={toast?.tone} onDone={() => setToast(null)} />
    </AppShell>
  );
};

/** A note pinned to the desktop: always on top, optionally click-through. */
export const Sticky: React.FC<{ noteId: string; demo?: NoteLite }> = ({ noteId, demo }) => {
  const [note, setNote] = useState<NoteLite | null>(demo ?? null);
  const [gone, setGone] = useState(false);
  const [through, setThrough] = useState(false);
  const label = `coreapp-sticky-${noteId}`;
  const load = useCallback(() => {
    if (demo) return;
    shelfGet(noteId)
      .then((i) => setNote(toLite(i)))
      .catch(() => setGone(true));
  }, [noteId, demo]);
  useEffect(() => {
    load();
    getCurrentWindow()
      .show()
      .catch(() => {});
    if (demo) return;
    const un = listen(EVT_SHELF_CHANGED, load);
    const un2 = listen<boolean>("lens://sticky-click-through", (e) => setThrough(e.payload));
    return () => {
      un.then((f) => f()).catch(() => {});
      un2.then((f) => f()).catch(() => {});
    };
  }, [load, demo]);
  const toggle = (line: number) => {
    if (!note) return;
    const text = toggleTodo(note.text, line);
    setNote({ ...note, text });
    shelfUpdate(note.id, { text }).catch(() => {});
  };
  return (
    <div className={cx("nt-sticky", through && "through")}>
      <header className="nt-sticky-bar" data-tauri-drag-region>
        <span className="nt-sticky-title" data-tauri-drag-region>
          {note ? note.title || titleOf(note.text) : "Note"}
        </span>
        <button
          type="button"
          className="ca-icon-btn"
          aria-pressed={through}
          aria-label="Click-through: let clicks pass to what's behind. Undo from Lens Notes with Ctrl+Shift+U."
          onClick={() => invoke("coreapp_sticky_click_through", { label, on: true }).catch(() => {})}
        >
          ◌
        </button>
        <button type="button" className="ca-icon-btn" aria-label="Open in Lens Notes" onClick={() => invoke("coreapp_open", { id: "notes", view: null }).catch(() => {})}>
          ↗
        </button>
        <button type="button" className="ca-icon-btn ca-close" aria-label="Close sticky" onClick={() => invoke("coreapp_sticky_close", { label }).catch(() => getCurrentWindow().close())}>
          ✕
        </button>
      </header>
      <div className="nt-sticky-body">{gone ? <p className="ca-muted">This note was deleted.</p> : note ? <NoteView text={note.text} onToggle={toggle} /> : null}</div>
    </div>
  );
};
