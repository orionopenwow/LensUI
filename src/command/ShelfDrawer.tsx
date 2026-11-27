// The Shelf drawer: named shelves of context items. Tick items to use them as context; drag text
// or files in; drag items out into other apps; drag to reorder.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { contextOrigin, LensContextMenu, type MenuAt } from "../magic/LensContextMenu";
import { removedLine, restoreInput, SHELF_UNDO_MS } from "../shelf/restore";
import { failLine, logFail, quiet } from "../failsafe/calls";
import { NotePreview } from "../shelf/NotePreview";
import { noteSource } from "../shelf/NoteSheet.model";
import { Archive, Check, NotebookPen, Undo2, X, ClipboardCopy, Download, FileText, Globe, Image as ImageIcon, MessageSquare, Pin, Plus, Trash2, Captions, TextSelect, File } from "lucide-react";
import {
  DEFAULT_SHELF, formatTokens, onShelfChanged, shelfAdd, shelfClear, shelfCreate, shelfDelete, shelfExport,
  shelfList, shelfPin, shelfRemove, shelfReorder, shelvesList, type ShelfInfo, type ShelfItem, type ShelfKind,
} from "../shelf/contract";

export const KIND_ICON: Record<ShelfKind, React.ComponentType<{ size?: number; strokeWidth?: number }>> = {
  text: FileText,
  page: Globe,
  selection: TextSelect,
  file: File,
  image: ImageIcon,
  transcript: Captions,
  answer: MessageSquare,
};

export function useShelf(shelf: string) {
  const [items, setItems] = useState<ShelfItem[]>([]);
  const [shelves, setShelves] = useState<ShelfInfo[]>([]);
  const reload = useCallback(() => {
    shelfList(shelf).then((v) => setItems(v ?? [])).catch((e) => (setItems([]), logFail("Shelf", "read the shelf")(e)));
    shelvesList().then((v) => setShelves(v ?? [])).catch(logFail("Shelf", "list your shelves"));
  }, [shelf]);
  useEffect(() => {
    reload();
    const un = onShelfChanged(() => reload());
    return () => {
      un.then((u) => u()).catch(quiet);
    };
  }, [reload]);
  return { items, shelves, reload };
}

export function ShelfDrawer({
  shelf, setShelf, picked, togglePick, onUse, onNotice, notesOn = false,
}: {
  shelf: string;
  setShelf: (id: string) => void;
  picked: Set<string>;
  togglePick: (id: string) => void;
  onUse: () => void;
  onNotice: (title: string, ok?: boolean) => void;
  /** magicWaves.shelfNotes: shows "Make a note" (docs/SHELF.md "Shelf → Notes"). */
  notesOn?: boolean;
}) {
  const { items, shelves } = useShelf(shelf);
  const [naming, setNaming] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | "clear" | "delete">(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ at: MenuAt; item: ShelfItem; byKeyboard: boolean } | null>(null);
  // The last removed item can be put back for a few seconds.
  const [removed, setRemoved] = useState<ShelfItem | null>(null);
  const undoTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(undoTimer.current), []);
  const remove = (it: ShelfItem) => {
    shelfRemove(it.id)
      .then(() => {
        setRemoved(it);
        window.clearTimeout(undoTimer.current);
        undoTimer.current = window.setTimeout(() => setRemoved(null), SHELF_UNDO_MS);
      })
      .catch((err) => onNotice(failLine("Shelf", "remove that", err), false));
  };
  const undoRemove = async () => {
    const it = removed;
    if (!it) return;
    window.clearTimeout(undoTimer.current);
    setRemoved(null);
    try {
      const id = await shelfAdd(restoreInput(it), it.shelf);
      if (it.pinned) await shelfPin(id, true);
    } catch (err) {
      onNotice(failLine("Shelf", "put that back", err), false);
    }
  };
  const closeMenu = useCallback(() => setMenu(null), []);
  const [over, setOver] = useState(false);
  const [noting, setNoting] = useState(false);
  const info = shelves.find((s) => s.id === shelf);
  const pickedTokens = useMemo(() => items.filter((i) => picked.has(i.id)).reduce((n, i) => n + i.approx_tokens, 0), [items, picked]);

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setOver(false);
    if (dragId) return;
    const files = Array.from(e.dataTransfer.files ?? []);
    try {
      if (files.length) {
        for (const f of files.slice(0, 20)) {
          const path = (f as unknown as { path?: string }).path ?? f.name;
          await shelfAdd({ kind: "file", title: f.name, path }, shelf);
        }
        onNotice(`Added ${files.length} file${files.length > 1 ? "s" : ""} to ${info?.name ?? "Shelf"}`);
        return;
      }
      const url = e.dataTransfer.getData("text/uri-list");
      const text = e.dataTransfer.getData("text/plain");
      if (text || url) {
        await shelfAdd(url && !text ? { kind: "page", url, title: url } : { kind: "text", text: text || url, url: url || undefined }, shelf);
        onNotice(`Added to ${info?.name ?? "Shelf"}`);
      }
    } catch (err) {
      onNotice(String(err), false);
    }
  };

  const exportShelf = async (format: "md" | "json") => {
    try {
      const text = await shelfExport(shelf, format);
      await navigator.clipboard.writeText(text);
      onNotice(`Copied ${info?.name ?? "Shelf"} as ${format === "md" ? "Markdown" : "JSON"}`);
    } catch (err) {
      onNotice(String(err), false);
    }
  };

  return (
    <aside
      className={`cmd-shelf${over ? " is-drop" : ""}`}
      aria-label="Shelf"
      onDragOver={(e) => {
        e.preventDefault();
        if (!dragId) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
    >
      <header className="cmd-shelf-head">
        <Archive size={14} strokeWidth={2.2} />
        {naming !== null ? (
          <form
            className="cmd-shelf-name"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                const s = await shelfCreate(naming);
                setShelf(s.id);
                setNaming(null);
              } catch (err) {
                onNotice(String(err), false);
              }
            }}
          >
            <input autoFocus value={naming} onChange={(e) => setNaming(e.target.value)} placeholder="New shelf name" aria-label="New shelf name"
              onKeyDown={(e) => e.key === "Escape" && (e.stopPropagation(), setNaming(null))} />
          </form>
        ) : (
          <select className="cmd-shelf-pick" value={shelf} onChange={(e) => setShelf(e.target.value)} aria-label="Shelf">
            {shelves.map((s) => (
              <option key={s.id} value={s.id}>{s.name} · {s.item_count}</option>
            ))}
          </select>
        )}
        <button type="button" className="cmd-icon" aria-label="New shelf" onClick={() => setNaming("")}><Plus size={14} /></button>
        <button type="button" className="cmd-icon" aria-label="Copy shelf as Markdown" onClick={() => exportShelf("md")}><Download size={14} /></button>
      </header>

      <ol className="cmd-shelf-list">
        {items.length === 0 ? (
          <li className="cmd-shelf-empty">
            <p>This shelf is empty.</p>
            <p>Drop text, links or files here, or use “To Shelf” on any answer or clip. What you keep here stays on this PC until you use it.</p>
          </li>
        ) : null}
        {items.map((it, idx) => {
          const Icon = KIND_ICON[it.kind] ?? FileText;
          const on = picked.has(it.id);
          return (
            <li
              key={it.id}
              className={`cmd-shelf-item${on ? " is-picked" : ""}${dragId === it.id ? " is-drag" : ""}`}
              draggable
              onDragStart={(e) => {
                setDragId(it.id);
                e.dataTransfer.setData("text/plain", it.text || it.url || it.path || it.title);
                if (it.url) e.dataTransfer.setData("text/uri-list", it.url);
                e.dataTransfer.effectAllowed = "copyMove";
              }}
              onDragEnd={() => setDragId(null)}
              onContextMenu={(e) => {
                // Right-click a Shelf item: its own actions, then "Lens ›" for the Magic actions.
                // The Menu key and Shift+F10 open the same menu on the item, with "Lens ›" focused.
                e.preventDefault();
                setMenu({ ...contextOrigin(e.nativeEvent, e.currentTarget.getBoundingClientRect()), item: it });
              }}
              onDragOver={(e) => dragId && dragId !== it.id && e.preventDefault()}
              onDrop={(e) => {
                if (!dragId || dragId === it.id) return;
                e.preventDefault();
                e.stopPropagation();
                const visible = items.filter((x) => !x.pinned);
                const to = visible.findIndex((x) => x.id === it.id);
                shelfReorder(dragId, Math.max(0, to)).catch((err) => onNotice(String(err), false));
                setDragId(null);
              }}
            >
              <button type="button" role="checkbox" aria-checked={on} className="cmd-shelf-check" onClick={() => togglePick(it.id)}
                aria-label={`Use “${it.title}” as context`}>
                {on ? <Check size={12} strokeWidth={3} /> : null}
              </button>
              <Icon size={14} strokeWidth={2} />
              <span className="cmd-shelf-title" data-index={idx}>{it.title}</span>
              <span className="cmd-shelf-tok">{it.approx_tokens ? formatTokens(it.approx_tokens) : it.kind}</span>
              <span className="cmd-shelf-tools">
                <button type="button" className={`cmd-icon${it.pinned ? " is-on" : ""}`} aria-label={it.pinned ? "Unpin" : "Pin"} onClick={() => void shelfPin(it.id, !it.pinned).catch((err) => onNotice(failLine("Shelf", it.pinned ? "unpin that" : "pin that", err), false))}>
                  <Pin size={12} />
                </button>
                <button type="button" className="cmd-icon" aria-label={`Remove “${it.title}”`} onClick={() => remove(it)}>
                  <Trash2 size={12} />
                </button>
              </span>
            </li>
          );
        })}
      </ol>

      {removed ? (
        <div className="cmd-shelf-undo" role="status">
          <span>{removedLine(removed.title)}</span>
          <button type="button" className="ct-btn" data-weight="medium" onClick={() => void undoRemove()}>
            <Undo2 size={13} strokeWidth={2.4} aria-hidden /> Undo
          </button>
        </div>
      ) : null}
      <footer className="cmd-shelf-foot">
        {confirm ? (
          <div className="cmd-confirm" role="alertdialog" aria-label="Confirm">
            <span>
              {confirm === "clear"
                ? `Remove ${items.filter((i) => !i.pinned).length} unpinned items?`
                : `Delete “${info?.name}” and its ${items.length} items?`}
            </span>
            <button type="button" className="ct-btn is-primary is-danger" data-weight="heavy" onClick={async () => {
              try {
                if (confirm === "clear") await shelfClear(shelf);
                else {
                  await shelfDelete(shelf);
                  setShelf(DEFAULT_SHELF);
                }
              } catch (err) {
                onNotice(String(err), false);
              }
              setConfirm(null);
            }}>{confirm === "clear" ? "Remove" : "Delete"}</button>
            <button type="button" className="ct-btn" data-weight="medium" onClick={() => setConfirm(null)}>Keep</button>
          </div>
        ) : (
          <>
            <button type="button" className="ct-btn is-primary" data-weight="heavy" disabled={picked.size === 0} onClick={onUse}>
              Use {picked.size || ""} as context{picked.size ? ` · ${formatTokens(pickedTokens)}` : ""}
            </button>
            {notesOn ? (
              <button type="button" className="ct-btn" disabled={items.length === 0} onClick={() => setNoting(true)}>
                <NotebookPen size={13} strokeWidth={2.4} aria-hidden /> Make a note
              </button>
            ) : null}
            <span className="cmd-shelf-total">{info ? formatTokens(info.approx_tokens) : ""}</span>
            <button type="button" className="cmd-icon" aria-label="Clear shelf" onClick={() => setConfirm("clear")}><Trash2 size={14} /></button>
            {shelf !== DEFAULT_SHELF ? (
              <button type="button" className="cmd-link" onClick={() => setConfirm("delete")}>Delete shelf</button>
            ) : null}
          </>
        )}
      </footer>
      {menu ? (
        <LensContextMenu
          at={menu.at}
          byKeyboard={menu.byKeyboard}
          item={{ kind: "shelfItem", id: menu.item.id, label: menu.item.title, path: menu.item.path || menu.item.url || null }}
          onClose={closeMenu}
          actions={[
            {
              id: "use",
              label: picked.has(menu.item.id) ? "Don't use as context" : "Use as context",
              icon: <Check size={14} strokeWidth={2.4} aria-hidden />,
              onSelect: () => togglePick(menu.item.id),
            },
            {
              id: "copy",
              label: "Copy",
              icon: <ClipboardCopy size={14} strokeWidth={2.4} aria-hidden />,
              onSelect: () => void navigator.clipboard.writeText(menu.item.text || menu.item.url || menu.item.path || menu.item.title).catch((err) => onNotice(failLine("Shelf", "copy that", err), false)),
            },
            {
              id: "pin",
              label: menu.item.pinned ? "Unpin" : "Pin",
              icon: <Pin size={14} strokeWidth={2.4} aria-hidden />,
              onSelect: () => void shelfPin(menu.item.id, !menu.item.pinned).catch((err) => onNotice(String(err), false)),
            },
            {
              id: "remove",
              label: "Remove",
              danger: true,
              icon: <Trash2 size={14} strokeWidth={2.4} aria-hidden />,
              onSelect: () => remove(menu.item),
            },
          ]}
        />
      ) : null}
      {notesOn && noting ? (
        <div className="cmd-note-sheet" role="dialog" aria-label="Make a note">
          <button type="button" className="cmd-icon cmd-note-close" aria-label="Close the note" onClick={() => setNoting(false)}>
            <X size={14} strokeWidth={2.4} />
          </button>
          <NotePreview items={noteSource(items, picked)} />
        </div>
      ) : null}
    </aside>
  );
}
