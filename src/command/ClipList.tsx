// Clipboard mode: history list with type filters. Enter pastes, Shift+Enter pastes plain text,
// Ctrl+S sends to the Shelf, Ctrl+P pins, Delete removes, Ctrl+Enter attaches as context.
import React, { useCallback, useEffect, useState } from "react";
import { Archive, ClipboardPaste, Copy, Files, Image as ImageIcon, Link, Lock, Pin, Trash2, Type } from "lucide-react";
import { quiet } from "../failsafe/calls";
import {
  clipList, clipStatus, onClipChanged, relativeTime, sourceAppName, type ClipKind, type ClipStatus, type ClipView,
} from "../clip/contract";

const FILTERS: { id: ClipKind | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "text", label: "Text" },
  { id: "link", label: "Links" },
  { id: "image", label: "Images" },
  { id: "files", label: "Files" },
];

const KIND_ICON: Record<ClipKind, React.ComponentType<{ size?: number; strokeWidth?: number }>> = {
  text: Type,
  link: Link,
  image: ImageIcon,
  files: Files,
};

export function useClips(query: string, kind: ClipKind | "all") {
  const [clips, setClips] = useState<ClipView[]>([]);
  const [status, setStatus] = useState<ClipStatus | null>(null);
  const reload = useCallback(() => {
    clipStatus().then(setStatus).catch(() => setStatus(null));
    clipList(query, kind === "all" ? undefined : kind).then((v) => setClips(v ?? [])).catch(() => setClips([]));
  }, [query, kind]);
  useEffect(() => {
    reload();
    const un = onClipChanged(reload);
    return () => {
      un.then((u) => u()).catch(quiet);
    };
  }, [reload]);
  return { clips, status, reload };
}

export function ClipList({
  clips, status, active, setActive, kind, setKind, onPaste, onCopy, onShelf, onPin, onDelete, onEnable,
}: {
  clips: ClipView[];
  status: ClipStatus | null;
  active: number;
  setActive: (i: number) => void;
  kind: ClipKind | "all";
  setKind: (k: ClipKind | "all") => void;
  onPaste: (c: ClipView, plain?: boolean) => void;
  onCopy: (c: ClipView) => void;
  onShelf: (c: ClipView) => void;
  onPin: (c: ClipView) => void;
  onDelete: (c: ClipView) => void;
  onEnable: () => void;
}) {
  if (status && !status.enabled) {
    return (
      <div className="cmd-empty">
        <p className="cmd-empty-title">Clipboard history is off</p>
        <p>Lens can keep what you copy, encrypted on this PC, so you can paste it again later. Password managers and anything marked private are never recorded.</p>
        <button type="button" className="ct-btn is-primary" onClick={onEnable}>Turn on clipboard history</button>
      </div>
    );
  }
  const paused = status && status.pausedUntilMs > Date.now();
  return (
    <div className="cmd-clips">
      <div className="cmd-filters" role="tablist" aria-label="Clip type">
        {FILTERS.map((f) => (
          <button key={f.id} type="button" role="tab" aria-selected={kind === f.id} className={`cmd-filter${kind === f.id ? " is-on" : ""}`} onClick={() => setKind(f.id)}>
            {f.label}
          </button>
        ))}
        {paused ? <span className="cmd-paused">Paused until {new Date(status!.pausedUntilMs).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span> : null}
      </div>
      {clips.length === 0 ? (
        <div className="cmd-empty"><p>Nothing copied yet{kind !== "all" ? " of this type" : ""}.</p></div>
      ) : (
        <ol className="cmd-list" role="listbox" aria-label="Clipboard history">
          {clips.map((c, i) => {
            const Icon = KIND_ICON[c.kind];
            const app = sourceAppName(c.sourceApp);
            return (
              <li
                key={c.id}
                role="option"
                aria-selected={i === active}
                className={`cmd-row${i === active ? " is-active" : ""}`}
                onMouseMove={() => i !== active && setActive(i)}
                onClick={() => onPaste(c)}
              >
                {c.kind === "image" && c.thumbPng ? (
                  <img className="cmd-thumb" alt="" src={`data:image/png;base64,${c.thumbPng}`} />
                ) : (
                  <span className="cmd-row-icon"><Icon size={14} strokeWidth={2} /></span>
                )}
                <span className="cmd-row-main">
                  <span className="cmd-row-title">
                    {c.title || (c.kind === "image" && c.imageSize ? `Image ${c.imageSize[0]}×${c.imageSize[1]}` : c.preview) || "(empty)"}
                  </span>
                  <span className="cmd-row-sub">
                    {c.pinned ? <Pin size={11} strokeWidth={2.4} /> : null}
                    {c.localOnly ? <Lock size={11} strokeWidth={2.4} aria-label="Stays on this PC" /> : null}
                    {app ? <span>{app}</span> : null}
                    <span>{relativeTime(c.tsMs)}</span>
                    {c.kind === "text" ? <span>{c.chars.toLocaleString()} chars</span> : null}
                    {c.kind === "files" ? <span>{c.fileCount} file{c.fileCount === 1 ? "" : "s"}</span> : null}
                  </span>
                </span>
                {i === active ? (
                  <span className="cmd-row-tools" onClick={(e) => e.stopPropagation()}>
                    <button type="button" className="cmd-icon" aria-label="Paste" onClick={() => onPaste(c)}><ClipboardPaste size={14} /></button>
                    <button type="button" className="cmd-icon" aria-label="Copy" onClick={() => onCopy(c)}><Copy size={14} /></button>
                    <button type="button" className="cmd-icon" aria-label="To Shelf" onClick={() => onShelf(c)}><Archive size={14} /></button>
                    <button type="button" className={`cmd-icon${c.pinned ? " is-on" : ""}`} aria-label={c.pinned ? "Unpin" : "Pin"} onClick={() => onPin(c)}><Pin size={14} /></button>
                    <button type="button" className="cmd-icon" aria-label="Delete" onClick={() => onDelete(c)}><Trash2 size={14} /></button>
                  </span>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
