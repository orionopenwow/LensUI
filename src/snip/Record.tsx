// Recording frame: a border just outside the recorded area and a small bar with the timer, Stop
// and — after stopping — Trim. Both windows exclude themselves from capture, so they never end up
// in the video.
import React, { useEffect, useState } from "react";
import { Scissors, Square } from "lucide-react";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import type { RecordState } from "./api";
import { EVT, on, snipRecordState, snipRecordStop, snipRecordTrim } from "./api";

export const RecBorder: React.FC = () => <div className="snip-root snip-rec-border" aria-hidden />;

const fmt = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

export const RecBar: React.FC<{ demo?: RecordState }> = ({ demo }) => {
  const [st, setSt] = useState<RecordState | null>(demo ?? null);
  const [now, setNow] = useState(Date.now());
  const [startedAt, setStartedAt] = useState(Date.now() - (demo?.elapsedMs ?? 0));
  const [trim, setTrim] = useState<{ start: string; end: string } | null>(null);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (demo) return;
    snipRecordState().then((s) => {
      setSt(s);
      setStartedAt(Date.now() - s.elapsedMs);
    });
    const un = on<RecordState>(EVT.record, (s) => {
      setSt(s);
      if (s.recording) setStartedAt(Date.now() - s.elapsedMs);
    });
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => {
      window.clearInterval(t);
      un.then((f) => f()).catch(() => {});
    };
  }, [demo]);

  const stop = async () => {
    try {
      const s = await snipRecordStop();
      setSt(s);
      void getCurrentWindow().setSize(new LogicalSize(360, 40)).catch(() => {});
      void getCurrentWindow().show().catch(() => {});
    } catch (e) {
      setMsg(String(e));
    }
  };

  if (!st) return null;
  if (st.recording) {
    return (
      <div className="snip-root snip-recbar" role="toolbar" aria-label="Recording">
        <span className="snip-recdot" aria-hidden />
        <span aria-live="off">{fmt(demo ? st.elapsedMs : now - startedAt)}</span>
        <span className="grow" />
        <button type="button" className="snip-btn danger" onClick={stop} aria-label="Stop recording">
          <Square size={13} fill="currentColor" /> Stop
        </button>
      </div>
    );
  }
  const name = st.path?.split(/[\\/]/).pop() ?? "Recording";
  const isMp4 = !!st.path?.toLowerCase().endsWith(".mp4");
  return (
    <div className="snip-root snip-recbar" role="status" aria-label="Recording saved">
      {trim ? (
        <>
          <input className="snip-input" style={{ width: 64, height: 28 }} aria-label="Start (seconds)" value={trim.start} onChange={(e) => setTrim({ ...trim, start: e.target.value })} />
          <span>–</span>
          <input className="snip-input" style={{ width: 64, height: 28 }} aria-label="End (seconds)" value={trim.end} onChange={(e) => setTrim({ ...trim, end: e.target.value })} />
          <button
            type="button"
            className="snip-btn primary"
            onClick={async () => {
              try {
                const out = await snipRecordTrim(st.path!, Number(trim.start) || 0, Number(trim.end) || st.elapsedMs / 1000);
                setMsg(`Saved ${out.split(/[\\/]/).pop()}`);
                setTrim(null);
              } catch (e) {
                setMsg(String(e));
              }
            }}
          >
            Trim
          </button>
        </>
      ) : (
        <>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{msg || `Saved · ${name}`}</span>
          <span className="grow" />
          {isMp4 ? (
            <button type="button" className="snip-btn" onClick={() => setTrim({ start: "0", end: (st.elapsedMs / 1000).toFixed(1) })}>
              <Scissors size={13} /> Trim
            </button>
          ) : null}
          <button type="button" className="snip-btn" onClick={() => void getCurrentWindow().hide()}>
            Done
          </button>
        </>
      )}
    </div>
  );
};
