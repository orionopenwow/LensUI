import React, { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AudioLines, BookmarkPlus, Captions, Download, MessageSquare, Sparkles } from "lucide-react";
import { shelfAdd } from "../shelf/contract";
import { captions, seek, type CaptionReply } from "./api";
import { clock, cueAt, parseCaptions, toMarkdown, toSrt, toText, type Cue } from "./captions";
import { oops } from "./oops";

export interface TranscriptSeed {
  reply: CaptionReply;
  url: string;
  playing?: number;
}

function save(name: string, body: string, type: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([body], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/** YouTube transcript from the captions the page itself loads; falls back to local whisper. */
export function TranscriptPanel({ url, seed, onAsk }: { url: string; seed?: TranscriptSeed; onAsk(prompt: string, text: string): void }) {
  const [reply, setReply] = useState<CaptionReply | null>(seed?.reply ?? null);
  const [err, setErr] = useState<string | null>(null);
  const [whisper, setWhisper] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const playing = seed?.playing ?? -1;

  useEffect(() => {
    if (seed) return;
    setReply(null);
    setErr(null);
    captions(navigator.language.slice(0, 2) || "en").then(setReply).catch((e) => setErr(String(e)));
  }, [url, seed]);

  const cues: Cue[] = useMemo(() => (reply?.body ? parseCaptions(reply.body) : []), [reply]);
  const shown = filter ? cues.filter((c) => c.text.toLowerCase().includes(filter.toLowerCase())) : cues;
  const meta = { title: reply?.video?.title, author: reply?.video?.author, url };
  const base = (reply?.video?.title || "transcript").replace(/[\\/:*?"<>|]+/g, " ").slice(0, 80).trim() || "transcript";
  const active = playing >= 0 ? cueAt(cues, playing) : -1;

  if (err) return <div className="lb-empty"><p>Couldn't read captions: {err}</p></div>;
  if (!reply) return <div className="lb-empty"><p className="lb-dim">Reading captions…</p></div>;
  if (reply.error === "not_youtube") {
    return <div className="lb-empty"><Captions size={18} /><p>Open a YouTube video to see its transcript here.</p></div>;
  }
  if (reply.error) {
    return (
      <div className="lb-empty">
        <AudioLines size={18} />
        <p>This video has no captions.</p>
        <p className="lb-dim">Lens can transcribe it on this PC with whisper. Downloading video from YouTube needs yt-dlp, which you set up in Settings › Transcription, and may be against the site's terms; only use it for videos you're allowed to save.</p>
        <button data-weight="medium"
          className="lb-btn"
          onClick={() => invoke<string>("transcribe_url", { url, options: { srt: true, translate: false, model: null, language: null } }).then(() => setWhisper("Started. You'll get a notification when it's done.")).catch((e) => setWhisper(String(e)))}
        >
          Transcribe on this PC
        </button>
        {whisper ? <p className="lb-dim">{whisper}</p> : null}
      </div>
    );
  }

  return (
    <div className="lb-transcript">
      <div className="lb-tr-head">
        <div className="lb-tr-title">{reply.video?.title}</div>
        <div className="lb-mono lb-dim">
          {reply.video?.author} · {reply.track?.name}{reply.track?.auto ? " (auto)" : ""} · {cues.length} lines
        </div>
        <div className="lb-tr-actions">
          <button data-weight="light" className="lb-chip" onClick={() => onAsk("Summarise this video: key points with timestamps", toMarkdown(cues, meta))}><Sparkles size={12} /> Summarise</button>
          <button data-weight="light" className="lb-chip" onClick={() => onAsk("Answer questions about this video", toMarkdown(cues, meta))}><MessageSquare size={12} /> Ask about it</button>
          <button data-weight="light" className="lb-chip" onClick={() => void shelfAdd({ kind: "transcript", title: reply.video?.title || "Transcript", text: toMarkdown(cues, meta), url }).catch(oops("add the transcript to the Shelf"))}><BookmarkPlus size={12} /> Add to Shelf</button>
          <span className="lb-push" />
          <button data-weight="light" className="lb-chip" aria-label="Save as text" onClick={() => save(`${base}.txt`, toText(cues), "text/plain")}><Download size={12} /> .txt</button>
          <button data-weight="light" className="lb-chip" aria-label="Save as SRT" onClick={() => save(`${base}.srt`, toSrt(cues), "application/x-subrip")}>.srt</button>
          <button data-weight="light" className="lb-chip" aria-label="Save as Markdown" onClick={() => save(`${base}.md`, toMarkdown(cues, meta), "text/markdown")}>.md</button>
        </div>
        <input className="lb-input" placeholder="Find in transcript" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Find in transcript" />
      </div>
      <ol className="lb-cues">
        {shown.map((c) => {
          const i = cues.indexOf(c);
          return (
            <li key={`${c.start}-${i}`} className={i === active ? "is-now" : ""}>
              <button data-weight="light" className="lb-cue-t lb-mono" onClick={() => void seek(c.start).catch(oops("jump to that moment"))} aria-label={`Play from ${clock(c.start)}`}>{clock(c.start)}</button>
              <span>{c.text}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
