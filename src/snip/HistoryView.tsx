// The local snip library: OCR-searchable, tags, pin to keep, reopen in the studio.
// Removing a snip waits a few seconds first, with Undo, before it is really deleted.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pin as PinIcon, Search, Trash2, Undo2 } from "lucide-react";
import type { SnipEntry } from "./api";
import { EVT, on, snipHistory, snipHistoryDelete, snipHistoryOpen, snipHistoryPin } from "./api";
import { latestOnly, NO_PENDING, queueDelete, removedLine, UNDO_MS, undoDeletes, withoutPending, type PendingDeletes } from "./historyModel";
import { Tip } from "./Tip";
import { failLine, quiet } from "../failsafe/calls";

const when = (ms: number) => {
  const d = new Date(ms);
  const today = new Date();
  return d.toDateString() === today.toDateString()
    ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString([], { month: "short", day: "numeric" });
};

export const HistoryView: React.FC<{ demo?: SnipEntry[]; compact?: boolean; demoPending?: string[] }> = ({ demo, compact, demoPending }) => {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<SnipEntry[]>(demo ?? []);
  const [err, setErr] = useState("");
  const [pending, setPending] = useState<PendingDeletes>(demoPending ? { ids: demoPending } : NO_PENDING);
  const tickets = useRef(latestOnly());
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (demo) {
      const t = q.trim().toLowerCase();
      setItems(t ? demo.filter((e) => `${e.ocrText} ${e.windowTitle} ${e.sourceApp} ${e.tags.join(" ")}`.toLowerCase().includes(t)) : demo);
      return;
    }
    // Answers can arrive out of order while you type; only the newest search may be shown.
    const load = () => {
      const ticket = tickets.current.next();
      snipHistory(q)
        .then((list) => {
          if (!tickets.current.isCurrent(ticket)) return;
          setItems(list);
          setErr("");
        })
        .catch((e) => tickets.current.isCurrent(ticket) && setErr(failLine("Snip", "read your snip history", e)));
    };
    load();
    const un = on(EVT.history, load);
    return () => {
      un.then((f) => f()).catch(quiet);
    };
  }, [q, demo]);

  /** Really deletes what is waiting. Runs when the Undo time is up and when the view goes away. */
  const commit = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = undefined;
    const ids = pendingRef.current.ids;
    if (!ids.length || demo) return;
    setPending(NO_PENDING);
    pendingRef.current = NO_PENDING;
    for (const id of ids) snipHistoryDelete(id).catch((e) => setErr(failLine("Snip", "remove that snip", e)));
  }, [demo]);
  useEffect(() => commit, [commit]);

  const remove = (id: string) => {
    setPending((p) => queueDelete(p, id));
    if (demo) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(commit, UNDO_MS);
  };
  const undo = () => {
    window.clearTimeout(timer.current);
    timer.current = undefined;
    setPending(undoDeletes);
  };

  const visible = useMemo(() => withoutPending(items, pending), [items, pending]);

  return (
    <div className="snip-history">
      <div style={{ position: "relative" }}>
        <Search size={14} style={{ position: "absolute", left: 10, top: 9, opacity: 0.6 }} aria-hidden />
        <input className="snip-input" style={{ paddingLeft: 30 }} placeholder="Search text in your snips, apps or #tags" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search snips" />
      </div>
      {err ? (
        <div className="snip-muted" role="alert">
          {err}
        </div>
      ) : null}
      {pending.ids.length ? (
        <div className="snip-undo" role="status">
          <span>{removedLine(pending.ids.length)}</span>
          <span className="grow" />
          <button type="button" className="snip-btn" data-weight="medium" onClick={undo}>
            <Undo2 size={13} aria-hidden /> Undo
          </button>
        </div>
      ) : null}
      {!visible.length ? (
        q ? (
          <div className="snip-muted">No snips match “{q.trim()}”.</div>
        ) : pending.ids.length ? null : (
          <div className="snip-empty">
            <span className="snip-empty-frame" aria-hidden />
            <b>Nothing snipped yet</b>
            <span>Snips you copy, save, pin or share are kept here, searchable by the words in them. They stay on this PC, encrypted.</span>
          </div>
        )
      ) : (
        <div className="snip-grid">
          {visible.slice(0, compact ? 8 : 200).map((e) => (
            <div key={e.id} className={`snip-thumb ${e.pinned ? "pinned" : ""}`}>
              <button
                type="button"
                data-weight="heavy"
                className="snip-thumb-open"
                onClick={() => void snipHistoryOpen(e.id).catch((x) => setErr(failLine("Snip", "open that snip", x)))}
                aria-label={`Open snip from ${e.windowTitle || e.sourceApp || "the screen"}, ${when(e.createdMs)}`}
              >
                <img src={e.thumb} alt="" />
                <div className="meta">
                  <b>{e.windowTitle || e.sourceApp || "Snip"}</b>
                  {when(e.createdMs)} · {e.w}×{e.h}
                  {e.tags.length ? ` · ${e.tags.map((t) => `#${t}`).join(" ")}` : ""}
                </div>
              </button>
              <div className="tools">
                <Tip text={e.pinned ? "Kept. Retention won't remove it" : "Keep this snip"} below>
                  <button
                    type="button"
                    data-weight="medium"
                    className={`snip-btn icon ${e.pinned ? "on" : ""}`}
                    aria-label="Keep"
                    aria-pressed={e.pinned}
                    onClick={() => void snipHistoryPin(e.id, !e.pinned).catch((x) => setErr(failLine("Snip", "change that snip", x)))}
                  >
                    <PinIcon size={12} />
                  </button>
                </Tip>
                <Tip text="Remove from history" below>
                  <button type="button" data-weight="medium" className="snip-btn icon danger" aria-label="Remove from history" onClick={() => remove(e.id)}>
                    <Trash2 size={12} />
                  </button>
                </Tip>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
