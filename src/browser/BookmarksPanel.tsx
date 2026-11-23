import React, { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Pencil, Trash2 } from "lucide-react";
import { bookmarkRemove, bookmarkUpdate, type Bookmark, type BrowserView } from "./api";
import { Key } from "./ApprovalCard";
import { Avatar } from "./Sidebar";

interface Node {
  name: string;
  path: string;
  marks: Bookmark[];
  children: Node[];
}

/** Builds the folder tree from "A / B / C" paths. */
export function bookmarkTree(marks: Bookmark[]): Node {
  const root: Node = { name: "", path: "", marks: [], children: [] };
  for (const b of marks) {
    let n = root;
    const parts = (b.folder ?? "").split("/").map((p) => p.trim()).filter(Boolean);
    let path = "";
    for (const p of parts) {
      path = path ? `${path} / ${p}` : p;
      let c = n.children.find((x) => x.name === p);
      if (!c) {
        c = { name: p, path, marks: [], children: [] };
        n.children.push(c);
      }
      n = c;
    }
    n.marks.push(b);
  }
  return root;
}

function Row({ b, onOpen, onView, live }: { b: Bookmark; onOpen(url: string, bg: boolean): void; onView(v: BrowserView): void; live: boolean }) {
  const [edit, setEdit] = useState(false);
  const [title, setTitle] = useState(b.title);
  const [folder, setFolder] = useState(b.folder ?? "");
  if (edit) {
    return (
      <form
        className="lb-bm-edit"
        onSubmit={(e) => {
          e.preventDefault();
          setEdit(false);
          if (live) void bookmarkUpdate(b.id, title, folder).then(onView).catch(() => {});
        }}
      >
        <input className="lb-input" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Name" autoFocus />
        <input className="lb-input lb-mono" value={folder} onChange={(e) => setFolder(e.target.value)} aria-label="Folder (use / to nest)" placeholder="Folder / Subfolder" />
        <div className="lb-ok-actions">
          <span className="lb-push" />
          <button type="button" className="lb-btn lb-btn-sm" onClick={() => setEdit(false)}>Cancel <Key k="Esc" /></button>
          <button type="submit" className="lb-btn lb-btn-sm lb-btn-primary">Save <Key k="⏎" /></button>
        </div>
      </form>
    );
  }
  return (
    <div className="lb-row lb-bm" onAuxClick={(e) => e.button === 1 && onOpen(b.url, true)}>
      <button className="lb-bm-open" onClick={(e) => onOpen(b.url, e.ctrlKey || e.metaKey)}>
        <Avatar url={b.url} title={b.title} size={14} />
        <span className="lb-tab-title">{b.title || b.url}</span>
      </button>
      <button className="lb-icon-btn sm" aria-label={`Edit ${b.title}`} onClick={() => setEdit(true)}><Pencil size={12} /></button>
      <button className="lb-icon-btn sm" aria-label={`Remove ${b.title}`} onClick={() => live && void bookmarkRemove(b.id).then(onView).catch(() => {})}><Trash2 size={12} /></button>
    </div>
  );
}

function Folder({ n, depth, ...p }: { n: Node; depth: number; onOpen(url: string, bg: boolean): void; onView(v: BrowserView): void; live: boolean }) {
  const [open, setOpen] = useState(depth < 1);
  return (
    <div className="lb-bm-folder" style={{ marginLeft: depth ? 12 : 0 }}>
      <button className="lb-folder-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span>{n.name}</span>
        <span className="lb-mono lb-dim lb-push">{n.marks.length + n.children.length}</span>
      </button>
      {open ? (
        <>
          {n.children.map((c) => <Folder key={c.path} n={c} depth={depth + 1} {...p} />)}
          {n.marks.map((b) => <Row key={b.id} b={b} {...p} />)}
        </>
      ) : null}
    </div>
  );
}

/** Bookmarks: folders nest with " / "; rename, move and remove in place. Ctrl- or middle-click
 * opens in the background. */
export function BookmarksPanel({ view, onView, onOpen, live }: { view: BrowserView; onView(v: BrowserView): void; onOpen(url: string, bg: boolean): void; live: boolean }) {
  const [q, setQ] = useState("");
  const marks = view.state.bookmarks.filter((b) => !q || `${b.title} ${b.url} ${b.folder ?? ""}`.toLowerCase().includes(q.toLowerCase()));
  const tree = useMemo(() => bookmarkTree(marks), [marks]);
  return (
    <div className="lb-list lb-bookmarks">
      <input className="lb-input" placeholder="Find a bookmark" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a bookmark" />
      {marks.length === 0 ? <div className="lb-empty"><p className="lb-dim">No bookmarks{q ? " match" : " yet. Press Ctrl D on a page"}.</p></div> : null}
      {tree.children.map((c) => <Folder key={c.path} n={c} depth={0} onOpen={onOpen} onView={onView} live={live} />)}
      {tree.marks.map((b) => <Row key={b.id} b={b} onOpen={onOpen} onView={onView} live={live} />)}
      <p className="lb-mono lb-dim lb-note">Ctrl-click or middle-click opens in the background.</p>
    </div>
  );
}
