import React, { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Pause, Pin, Play, Search, Trash2, X } from "lucide-react";
import { useLensState } from "../hooks/useLensState";
import { AskPanel } from "../ai/AskPanel";
import { clipboardActions } from "../ai/actions";
import type { AiContext } from "../ai/surfaceApi";
import "./ClipboardPane.css";

interface ClipEntryView {
  id: number;
  preview: string;
  chars: number;
  tsMs: number;
  pinned: boolean;
}

interface ClipboardSnapshot {
  entries: ClipEntryView[];
  paused: boolean;
}

interface Props {
  /** Tighter rows for the Widget Drawer. */
  compact?: boolean;
  /** Called after an entry was put back on the clipboard (e.g. to close the Command Palette). */
  onCopied?: () => void;
}

function ago(tsMs: number, now: number): string {
  const s = Math.max(0, Math.round((now - tsMs) / 1000));
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/**
 * Clipboard history: the last 50 pieces of text you copied. Kept in memory only (never saved to
 * disk, gone when Lens exits); entries marked private by password managers are never recorded.
 */
export const ClipboardPane: React.FC<Props> = ({ compact = false, onCopied }) => {
  const [query, setQuery] = useState("");
  const [snap, setSnap] = useState<ClipboardSnapshot>({ entries: [], paused: false });
  // AI quick actions on a clip (only while Lens Intelligence is on; docs/AI_SURFACES.md §5).
  const { config } = useLensState();
  const aiOn = !!config?.ai?.enabled;
  const [ask, setAsk] = useState<{ prompt: string; context: AiContext } | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const queryRef = useRef(query);
  queryRef.current = query;

  const refresh = useCallback(() => {
    invoke<ClipboardSnapshot>("clipboard_list_cmd", { query: queryRef.current })
      .then((s) => {
        setSnap(s);
        setNow(Date.now());
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    const unlisten = listen("lens://clipboard-changed", refresh);
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [refresh]);

  useEffect(refresh, [query, refresh]);

  const run = (cmd: string, args?: Record<string, unknown>) =>
    invoke(cmd, args)
      .then(() => setError(null))
      .catch((e) => setError(String(e)))
      .finally(refresh);

  const copy = (entry: ClipEntryView) => {
    invoke("clipboard_copy_cmd", { id: entry.id })
      .then(() => {
        setError(null);
        setCopiedId(entry.id);
        window.setTimeout(() => setCopiedId((cur) => (cur === entry.id ? null : cur)), 900);
        onCopied?.();
      })
      .catch((e) => setError(String(e)));
  };

  const hasUnpinned = snap.entries.some((e) => !e.pinned);

  return (
    <div className={`clip-pane ${compact ? "is-compact" : ""}`}>
      <div className="clip-head">
        <label className="clip-search">
          <Search size={13} strokeWidth={2.5} />
          <input
            value={query}
            placeholder="Search clipboard"
            aria-label="Search clipboard history"
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button
              type="button"
              className="clip-mini-btn"
              aria-label="Clear search"
              onClick={() => setQuery("")}
            >
              <X size={12} strokeWidth={2.5} />
            </button>
          )}
        </label>
        <button
          type="button"
          className={`clip-icon-btn ${snap.paused ? "is-on" : ""}`}
          aria-label={snap.paused ? "Resume recording" : "Pause recording"}
          aria-pressed={snap.paused}
          onClick={() => run("clipboard_pause_cmd", { paused: !snap.paused })}
        >
          {snap.paused ? <Play size={12} strokeWidth={2.5} /> : <Pause size={12} strokeWidth={2.5} />}
          {snap.paused ? "Paused" : "Pause"}
        </button>
        <button
          type="button"
          className="clip-icon-btn"
          aria-label="Clear clipboard history"
          disabled={!hasUnpinned}
          style={{ opacity: hasUnpinned ? 1 : 0.4 }}
          onClick={() => run("clipboard_clear_cmd")}
        >
          <Trash2 size={12} strokeWidth={2.5} />
          Clear
        </button>
      </div>

      {ask && (
        <AskPanel
          key={ask.prompt + (ask.context.clipboard ?? "")}
          initialPrompt={ask.prompt}
          initialContext={ask.context}
          autoSend
          compact
          onClose={() => setAsk(null)}
        />
      )}

      {snap.entries.length === 0 ? (
        <div className="clip-empty">
          {query ? (
            <span>Nothing in your clipboard history matches “{query}”.</span>
          ) : snap.paused ? (
            <span>Recording is paused.</span>
          ) : (
            <span>Copy some text and it will show up here.</span>
          )}
          <small>Text only · kept in memory, never saved · private copies are skipped</small>
        </div>
      ) : (
        <div className="clip-list">
          {snap.entries.map((entry) => (
            <div
              key={entry.id}
              className={`clip-row ${entry.pinned ? "is-pinned" : ""} ${
                copiedId === entry.id ? "is-copied" : ""
              }`}
            >
              <button
                type="button"
                className="clip-main"
                aria-label="Copy this entry back to the clipboard"
                onClick={() => copy(entry)}
              >
                <span className="clip-text">{entry.preview}</span>
                <span className="clip-meta">
                  {copiedId === entry.id
                    ? "Copied — ready to paste"
                    : `${ago(entry.tsMs, now)} · ${entry.chars.toLocaleString()} characters`}
                </span>
              </button>
              <div className="clip-actions">
                {aiOn &&
                  clipboardActions().map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      className="clip-mini-btn ai-chipbtn"
                      aria-label={a.title}
                      onClick={() => setAsk(a.build({ text: entry.preview }))}
                    >
                      {a.short}
                    </button>
                  ))}
                <button
                  type="button"
                  className={`clip-mini-btn ${entry.pinned ? "is-on" : ""}`}
                  aria-label={entry.pinned ? "Unpin" : "Pin"}
                  aria-pressed={entry.pinned}
                  onClick={() => run("clipboard_pin_cmd", { id: entry.id, pinned: !entry.pinned })}
                >
                  <Pin size={12.5} strokeWidth={2.4} fill={entry.pinned ? "currentColor" : "none"} />
                </button>
                <button
                  type="button"
                  className="clip-mini-btn"
                  aria-label="Remove from history"
                  onClick={() => run("clipboard_delete_cmd", { id: entry.id })}
                >
                  <X size={12.5} strokeWidth={2.4} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {error && <div className="clip-foot">{error}</div>}
    </div>
  );
};
