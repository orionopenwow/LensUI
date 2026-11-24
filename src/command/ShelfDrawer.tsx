// The Shelf drawer: named shelves of context items. Tick items to use them as context; drag text
// or files in; drag items out into other apps; drag to reorder.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { magicOpenFor } from "../magic/contract";
import { Archive, Check, Download, FileText, Globe, Image as ImageIcon, MessageSquare, Pin, Plus, Trash2, Captions, TextSelect, File } from "lucide-react";
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
    shelfList(shelf).then((v) => setItems(v ?? [])).catch(() => setItems([]));
    shelvesList().then((v) => setShelves(v ?? [])).catch(() => {});
  }, [shelf]);
  useEffect(() => {
    reload();
    const un = onShelfChanged(() => reload());
    return () => {
      un.then((u) => u()).catch(() => {});
    };
  }, [reload]);
  return { items, shelves, reload };
}

export function ShelfDrawer({
  shelf, setShelf, picked, togglePick, onUse, onNotice,
}: {
  shelf: string;
  setShelf: (id: string) => void;
  picked: Set<string>;
  togglePick: (id: string) => void;
  onUse: () => void;
  onNotice: (title: string, ok?: boolean) => void;
}) {
  const { items, shelves } = useShelf(shelf);
  const [naming, setNaming] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | "clear" | "delete">(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState(false);
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
            <p>Nothing here yet.</p>
            <p>Drop text, links or files here, or use “To Shelf” on any answer or clip.</p>
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
                // Right-click a Shelf item: the magic window, with this item as its target.
                e.preventDefault();
                magicOpenFor("shelfItem", it.id, it.title, it.path || it.url || null);
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
                <button type="button" className={`cmd-icon${it.pinned ? " is-on" : ""}`} aria-label={it.pinned ? "Unpin" : "Pin"} onClick={() => shelfPin(it.id, !it.pinned)}>
                  <Pin size={12} />
                </button>
                <button type="button" className="cmd-icon" aria-label="Remove" onClick={() => shelfRemove(it.id)}>
                  <Trash2 size={12} />
                </button>
              </span>
            </li>
          );
        })}
      </ol>

      <footer className="cmd-shelf-foot">
        {confirm ? (
          <div className="cmd-confirm" role="alertdialog" aria-label="Confirm">
            <span>
              {confirm === "clear"
                ? `Remove ${items.filter((i) => !i.pinned).length} unpinned items?`
                : `Delete “${info?.name}” and its ${items.length} items?`}
            </span>
            <button type="button" className="ct-btn is-primary is-danger" onClick={async () => {
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
            <button type="button" className="ct-btn" onClick={() => setConfirm(null)}>Keep</button>
          </div>
        ) : (
          <>
            <button type="button" className="ct-btn is-primary" disabled={picked.size === 0} onClick={onUse}>
              Use {picked.size || ""} as context{picked.size ? ` · ${formatTokens(pickedTokens)}` : ""}
            </button>
            <span className="cmd-shelf-total">{info ? formatTokens(info.approx_tokens) : ""}</span>
            <button type="button" className="cmd-icon" aria-label="Clear shelf" onClick={() => setConfirm("clear")}><Trash2 size={14} /></button>
            {shelf !== DEFAULT_SHELF ? (
              <button type="button" className="cmd-link" onClick={() => setConfirm("delete")}>Delete shelf</button>
            ) : null}
          </>
        )}
      </footer>
    </aside>
  );
}
