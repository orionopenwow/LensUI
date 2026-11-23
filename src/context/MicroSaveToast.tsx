// The micro-save toast: one line near the bottom of the screen, no window, no focus steal.
// Mount once in the notification / toast surface (snippet in docs/RIGHTCLICK.md). "Add note"
// opens a small field that appends a note to the item that was just saved.
import React, { useEffect, useRef, useState } from "react";
import { BookmarkCheck, Layers, Copy } from "lucide-react";
import { onMicroSaved, type MicroSaved } from "./contract";
import { shelfGet, shelfUpdate } from "../shelf/contract";
import { TOAST_MS, TOAST_NOTE_MS, microToastText, withNote } from "./microToast";
import "./context.css";

export const MicroSaveToastView: React.FC<{
  saved: MicroSaved;
  noteOpen?: boolean;
  onNote?: () => void;
  onSubmitNote?: (note: string) => void;
  onClose?: () => void;
}> = ({ saved, noteOpen, onNote, onSubmitNote, onClose }) => {
  const { title, detail } = microToastText(saved);
  const Icon = saved.duplicate ? Copy : saved.merged ? Layers : BookmarkCheck;
  const [note, setNote] = useState("");
  return (
    <div className="rc-toast" role="status" aria-live="polite">
      <span className={`rc-toast-icon ${saved.duplicate ? "is-muted" : ""}`}>
        <Icon size={16} aria-hidden />
      </span>
      <div className="rc-toast-text">
        <div className="rc-toast-title">{title}</div>
        {noteOpen ? (
          <input
            className="rc-toast-note"
            autoFocus
            placeholder="Add a note, then Enter"
            value={note}
            aria-label="Note"
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSubmitNote?.(note);
              if (e.key === "Escape") onClose?.();
            }}
          />
        ) : (
          <div className="rc-toast-detail">{detail}</div>
        )}
      </div>
      {!noteOpen && !saved.duplicate && (
        <button type="button" className="rc-toast-btn" onClick={onNote}>
          Add note
        </button>
      )}
    </div>
  );
};

export const MicroSaveToast: React.FC = () => {
  const [saved, setSaved] = useState<MicroSaved | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  const arm = (ms: number) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setSaved(null);
      setNoteOpen(false);
    }, ms);
  };

  useEffect(() => {
    const un = onMicroSaved((m) => {
      setSaved(m);
      setNoteOpen(false);
      arm(TOAST_MS);
    });
    return () => {
      un.then((f) => f()).catch(() => {});
      window.clearTimeout(timer.current);
    };
  }, []);

  if (!saved) return null;
  return (
    <div className="rc-toast-wrap">
      <MicroSaveToastView
        saved={saved}
        noteOpen={noteOpen}
        onNote={() => {
          setNoteOpen(true);
          arm(TOAST_NOTE_MS);
        }}
        onClose={() => setSaved(null)}
        onSubmitNote={async (note) => {
          try {
            const item = await shelfGet(saved.id);
            await shelfUpdate(saved.id, { text: withNote(item.text, note) });
          } catch {
            /* the item may have been removed meanwhile */
          }
          setSaved(null);
        }}
      />
    </div>
  );
};
