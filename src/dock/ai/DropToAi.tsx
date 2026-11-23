/**
 * The Dock's sparkle as a drop target: drop files on it and pick Summarise, Transcribe, Suggest better
 * names, Ask about it, or Add to Shelf. Transcription runs through W6-C's transcribe_file and shows live
 * progress; the other actions open the compact Ask panel with the files attached as chips.
 *
 * File paths come from the Dock's existing Tauri drag-drop handler (DOM drops have no paths in WebView2),
 * so the Dock passes them in. DockSurface integration: docs/AI_SURFACES.md §3c.
 */
import React, { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { AudioLines, FileText, Layers, MessageCircleQuestion, PencilLine, Sparkles, X } from "lucide-react";
import { actionsForFiles, fileActionPrompt, type FileActionId } from "../../ai/actions";
import { AI_EVENTS, transcribeFile, type AiContext, type TranscribeDone, type TranscribeProgress } from "../../ai/surfaceApi";
import { shelfAdd } from "../../ai/shelfLink";
import "../../ai/AskPanel.css";
import "./aiDock.css";

export const DropSparkle: React.FC<{ active: boolean; onClick?: () => void; label?: string }> = ({ active, onClick, label = "Ask AI" }) => (
  <button type="button" data-guide-id="dock.sparkle" className={`ai-sparkle ${active ? "is-drop" : ""}`} aria-label={active ? "Drop files to use them with AI" : label} onClick={onClick}>
    <Sparkles size={18} strokeWidth={2.3} aria-hidden="true" />
  </button>
);

const ICON: Record<FileActionId, React.ReactNode> = {
  summarise: <FileText size={14} strokeWidth={2.3} />,
  transcribe: <AudioLines size={14} strokeWidth={2.3} />,
  rename: <PencilLine size={14} strokeWidth={2.3} />,
  ask: <MessageCircleQuestion size={14} strokeWidth={2.3} />,
};

const base = (p: string) => p.split(/[\\/]/).pop() ?? p;

export interface DropToAiMenuProps {
  paths: string[];
  onClose: () => void;
  /** Open the compact Ask panel with this prompt and context (AskDockPopover). */
  onAsk: (prompt: string, context: AiContext) => void;
  /** Where to show a finished transcript; default: open it in the Ask panel as text. */
  onTranscript?: (text: string, srtPath?: string) => void;
}

type Job = { id: string | null; pct: number; stage: string; error?: string; done?: boolean };

export const DropToAiMenu: React.FC<DropToAiMenuProps> = ({ paths, onClose, onAsk, onTranscript }) => {
  const actions = actionsForFiles(paths);
  const [job, setJob] = useState<Job | null>(null);
  const [srt, setSrt] = useState(true);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (!job?.id) return;
    const id = job.id;
    const subs = [
      listen<TranscribeProgress>(AI_EVENTS.transcribeProgress, (e) => {
        if (e.payload.id === id) setJob((j) => (j ? { ...j, pct: e.payload.pct, stage: e.payload.stage } : j));
      }),
      listen<TranscribeDone>(AI_EVENTS.transcribeDone, (e) => {
        if (e.payload.id !== id) return;
        if (e.payload.error) setJob((j) => (j ? { ...j, error: e.payload.error } : j));
        else {
          setJob((j) => (j ? { ...j, pct: 100, done: true, stage: "Done" } : j));
          const text = e.payload.text ?? "";
          if (onTranscript) onTranscript(text, e.payload.srt_path);
          else onAsk("Here's the transcript. Give me a short summary and the key points.", { page_text: text, files: paths });
        }
      }),
    ];
    return () => subs.forEach((p) => p.then((f) => f()));
  }, [job?.id, onAsk, onTranscript, paths]);

  const run = async (id: FileActionId) => {
    if (id === "transcribe") {
      setJob({ id: null, pct: 0, stage: "Starting…" });
      try {
        // One file at a time keeps progress honest; the menu only offers it for media files.
        const jid = await transcribeFile(paths[0], { srt });
        setJob({ id: jid, pct: 0, stage: "Loading model…" });
      } catch (e) {
        setJob({ id: null, pct: 0, stage: "", error: String(e) });
      }
      return;
    }
    const p = fileActionPrompt(id, paths);
    onAsk(p.prompt, p.context);
    onClose();
  };

  const addToShelf = async () => {
    try {
      for (const p of paths) await shelfAdd({ kind: "file", title: base(p), path: p });
      setNote(paths.length === 1 ? "Added to Shelf" : `${paths.length} files added to Shelf`);
      window.setTimeout(onClose, 900);
    } catch {
      setNote("Couldn't add to Shelf");
    }
  };

  return (
    <div className="ai-drop-menu" role="menu" aria-label={`Use ${paths.length === 1 ? base(paths[0]) : `${paths.length} files`} with AI`}>
      <div className="ai-drop-head">
        <Sparkles size={13} strokeWidth={2.4} aria-hidden="true" />
        <span className="ai-drop-title">{paths.length === 1 ? base(paths[0]) : `${paths.length} files`}</span>
        <button type="button" className="ai-icon-btn" aria-label="Close" onClick={onClose}>
          <X size={13} strokeWidth={2.4} />
        </button>
      </div>
      {job ? (
        <div className="ai-drop-job" role="status" aria-live="polite">
          <div className="ai-drop-job-row">
            <AudioLines size={14} strokeWidth={2.3} aria-hidden="true" />
            <span>{job.error ? "Transcription failed" : job.done ? "Transcript ready" : `Transcribing · ${job.stage}`}</span>
            {!job.error && <span className="ai-drop-pct">{Math.round(job.pct)}%</span>}
          </div>
          {job.error ? (
            <div className="ai-drop-err">{job.error}</div>
          ) : (
            <div className="ai-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(job.pct)}>
              <span style={{ width: `${Math.max(3, job.pct)}%` }} />
            </div>
          )}
          <div className="ai-drop-note">Runs on this PC. The audio never leaves it.</div>
        </div>
      ) : (
        <>
          {actions.map((a) => (
            <button key={a.id} type="button" role="menuitem" className="ai-drop-item" onClick={() => run(a.id)}>
              {ICON[a.id]}
              <span>{a.title}</span>
              {a.id === "transcribe" && (
                <span
                  className={`ai-drop-opt ${srt ? "on" : ""}`}
                  role="checkbox"
                  aria-checked={srt}
                  aria-label="Also save subtitles (.srt)"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSrt((x) => !x);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === " " || e.key === "Enter") {
                      e.preventDefault();
                      e.stopPropagation();
                      setSrt((x) => !x);
                    }
                  }}
                >
                  + .srt
                </span>
              )}
            </button>
          ))}
          <button type="button" role="menuitem" className="ai-drop-item" onClick={addToShelf}>
            <Layers size={14} strokeWidth={2.3} />
            <span>Add to Shelf</span>
          </button>
          {note && <div className="ai-drop-note" role="status">{note}</div>}
        </>
      )}
    </div>
  );
};
