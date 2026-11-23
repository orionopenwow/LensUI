// The local snip library: OCR-searchable, tags, pin to keep, reopen in the studio.
import React, { useEffect, useState } from "react";
import { Pin as PinIcon, Search, Trash2 } from "lucide-react";
import type { SnipEntry } from "./api";
import { EVT, on, snipHistory, snipHistoryDelete, snipHistoryOpen, snipHistoryPin } from "./api";
import { Tip } from "./Tip";

const when = (ms: number) => {
  const d = new Date(ms);
  const today = new Date();
  return d.toDateString() === today.toDateString()
    ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString([], { month: "short", day: "numeric" });
};

export const HistoryView: React.FC<{ demo?: SnipEntry[]; compact?: boolean }> = ({ demo, compact }) => {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<SnipEntry[]>(demo ?? []);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (demo) {
      const t = q.trim().toLowerCase();
      setItems(t ? demo.filter((e) => `${e.ocrText} ${e.windowTitle} ${e.sourceApp} ${e.tags.join(" ")}`.toLowerCase().includes(t)) : demo);
      return;
    }
    const load = () => snipHistory(q).then(setItems).catch((e) => setErr(String(e)));
    load();
    const un = on(EVT.history, load);
    return () => {
      un.then((f) => f()).catch(() => {});
    };
  }, [q, demo]);

  return (
    <div className="snip-history">
      <div style={{ position: "relative" }}>
        <Search size={14} style={{ position: "absolute", left: 10, top: 9, opacity: 0.6 }} />
        <input className="snip-input" style={{ paddingLeft: 30 }} placeholder="Search text in your snips, apps or #tags" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search snips" />
      </div>
      {err ? <div className="snip-muted">{err}</div> : null}
      {!items.length ? (
        <div className="snip-muted">{q ? "No snips match." : "Snips you copy, save, pin or share appear here. They stay on this PC, encrypted."}</div>
      ) : (
        <div className="snip-grid">
          {items.slice(0, compact ? 8 : 200).map((e) => (
            <div key={e.id} className={`snip-thumb ${e.pinned ? "pinned" : ""}`}>
              <button type="button" style={{ all: "unset", cursor: "pointer", display: "block", width: "100%" }} onClick={() => void snipHistoryOpen(e.id).catch((x) => setErr(String(x)))} aria-label={`Open snip from ${e.sourceApp || "screen"}`}>
                <img src={e.thumb} alt="" />
                <div className="meta">
                  <b>{e.windowTitle || e.sourceApp || "Snip"}</b>
                  {when(e.createdMs)} · {e.w}×{e.h}
                  {e.tags.length ? ` · ${e.tags.map((t) => `#${t}`).join(" ")}` : ""}
                </div>
              </button>
              <div className="tools">
                <Tip text={e.pinned ? "Kept — retention won't remove it" : "Keep this snip"} below>
                  <button type="button" className={`snip-btn icon ${e.pinned ? "on" : ""}`} aria-label="Keep" aria-pressed={e.pinned} onClick={() => void snipHistoryPin(e.id, !e.pinned)}>
                    <PinIcon size={12} />
                  </button>
                </Tip>
                <Tip text="Delete from history" below>
                  <button type="button" className="snip-btn icon danger" aria-label="Delete" onClick={() => void snipHistoryDelete(e.id)}>
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
