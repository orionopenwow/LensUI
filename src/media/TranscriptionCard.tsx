import React, { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type * as Gen from "../types/generated";

/**
 * Control Center › Transcription: local whisper.cpp. Choose your own whisper.cpp + model, or opt
 * in to a verified download (shown in full before anything is fetched). Transcribe a file and
 * watch progress; transcripts go to %APPDATA%\LensUI\transcripts unless you choose otherwise.
 */

interface Progress {
  id: string;
  pct: number;
  stage: string;
}

const col: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 6 };
const row: React.CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" };

export const TranscriptionCard: React.FC = () => {
  const [setup, setSetup] = useState<Gen.TranscribeSetup | null>(null);
  const [draft, setDraft] = useState<Gen.TranscribeSettings | null>(null);
  const [plan, setPlan] = useState<Gen.DownloadPlan | null>(null);
  const [jobs, setJobs] = useState<Gen.JobStatus[]>([]);
  const [progress, setProgress] = useState<Record<string, Progress>>({});
  const [file, setFile] = useState("");
  const [srt, setSrt] = useState(true);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    invoke<Gen.TranscribeSetup>("transcribe_settings_get")
      .then((s) => {
        setSetup(s);
        setDraft((d) => d ?? s.settings);
      })
      .catch(() => setSetup(null));
    invoke<Gen.JobStatus[]>("transcribe_status").then(setJobs).catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    const p = listen<Progress>("lens://transcribe/progress", (e) => setProgress((x) => ({ ...x, [e.payload.id]: e.payload })));
    const d = listen("lens://transcribe/done", refresh);
    return () => {
      p.then((f) => f());
      d.then((f) => f());
    };
  }, [refresh]);

  const save = async (next: Gen.TranscribeSettings) => {
    setDraft(next);
    try {
      setSetup(await invoke<Gen.TranscribeSetup>("transcribe_settings_save", { settings: next }));
      setNote(null);
    } catch (e) {
      setNote(String(e));
    }
  };

  const field = (key: keyof Gen.TranscribeSettings, label: string, placeholder: string) =>
    draft && (
      <input
        className="cc-input"
        aria-label={label}
        placeholder={placeholder}
        value={(draft[key] as string | null) ?? ""}
        onChange={(e) => setDraft({ ...draft, [key]: e.target.value || null })}
        onBlur={() => save(draft)}
      />
    );

  const toggle = (on: boolean, label: string, onClick: () => void) => (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className={`cc-toggle ${on ? "on" : ""}`} onClick={onClick} />
  );

  const start = async () => {
    setBusy(true);
    setNote(null);
    try {
      await invoke<string>("transcribe_file", { path: file.trim().replace(/^"|"$/g, ""), options: { srt, translate: false, model: null, language: null } });
      refresh();
    } catch (e) {
      setNote(String(e));
    } finally {
      setBusy(false);
    }
  };

  const download = async () => {
    if (!plan) return;
    setBusy(true);
    try {
      await invoke("transcribe_setup_download", { ids: plan.items.map((i) => i.id), confirm: true });
      setPlan(null);
      refresh();
    } catch (e) {
      setNote(String(e));
    } finally {
      setBusy(false);
    }
  };

  const tools = setup?.tools;

  return (
    <div className="cc-card">
      <div className="cc-label">Transcription</div>
      <div className="cc-desc">
        Turns audio and video into text on this PC with whisper.cpp. Nothing is uploaded.
        {tools?.ready ? " Ready." : " Set it up below."}
      </div>
      {tools?.notes.map((n) => (
        <div key={n} className="cc-desc">• {n}</div>
      ))}

      {draft && (
        <div style={col}>
          <div className="cc-label">Your tools</div>
          {field("whisperBin", "whisper.cpp path", tools?.whisperBin ?? "C:\\tools\\whisper\\whisper-cli.exe")}
          {field("modelPath", "Model path", tools?.modelPath ?? "C:\\tools\\whisper\\ggml-base.en.bin")}
          {field("ffmpegPath", "ffmpeg path", tools?.ffmpegPath ?? "ffmpeg.exe (found on PATH if empty)")}
          <div style={row}>
            <button
              type="button"
              className="cc-btn-ghost"
              onClick={async () => setPlan(await invoke<Gen.DownloadPlan>("transcribe_setup_plan", { ids: ["whisper-cpp", "model-base-en"] }))}
            >
              Or download a verified copy…
            </button>
          </div>
          {plan && (
            <div style={col}>
              {plan.items.map((i) => (
                <div key={i.id} className="cc-desc" style={{ overflowWrap: "anywhere" }}>
                  {i.label} · about {i.approxMb} MB · {i.license}
                  <br />
                  {i.url}
                </div>
              ))}
              <div className="cc-desc">To: {plan.destination} · about {plan.totalApproxMb} MB in total.</div>
              {!plan.verified && (
                <div className="cc-desc">This build doesn't have verified checksums for these files yet, so the download is off. Point Lens at your own copy instead.</div>
              )}
              <div style={row}>
                <button type="button" className="cc-btn" disabled={busy || !plan.verified} onClick={download}>Download</button>
                <button type="button" className="cc-btn-ghost" onClick={() => setPlan(null)}>Cancel</button>
              </div>
            </div>
          )}

          <div className="cc-row">
            <div>
              <div className="cc-label">Save next to the original file</div>
              <div className="cc-desc">Otherwise transcripts go to {setup?.transcriptsDir}.</div>
            </div>
            {toggle(draft.nextToSource, "Save next to the original file", () => save({ ...draft, nextToSource: !draft.nextToSource }))}
          </div>
          <div className="cc-row">
            <div>
              <div className="cc-label">Transcribe web links</div>
              <div className="cc-desc">
                Uses yt-dlp, if you've installed it. Many sites' terms don't allow downloading; only use this where you're allowed to.
              </div>
            </div>
            {toggle(draft.urlTranscription, "Transcribe web links", () =>
              save({ ...draft, urlTranscription: !draft.urlTranscription, urlTermsAcknowledged: !draft.urlTranscription ? true : draft.urlTermsAcknowledged }),
            )}
          </div>
          {draft.urlTranscription && field("ytdlpPath", "yt-dlp path", tools?.ytdlpPath ?? "yt-dlp.exe (found on PATH if empty)")}
          <div className="cc-row">
            <div>
              <div className="cc-label">Live captions (experimental)</div>
              <div className="cc-desc">Captions for whatever your PC is playing. Not finished yet.</div>
            </div>
            {toggle(draft.liveCaptionsExperimental, "Live captions (experimental)", () => save({ ...draft, liveCaptionsExperimental: !draft.liveCaptionsExperimental }))}
          </div>
        </div>
      )}

      <div style={col}>
        <div className="cc-label">Transcribe a file</div>
        <input className="cc-input" aria-label="File to transcribe" placeholder="Paste a file path, e.g. C:\Videos\talk.mp4" value={file} onChange={(e) => setFile(e.target.value)} />
        <div style={row}>
          <label className="cc-desc" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
            <input type="checkbox" checked={srt} onChange={(e) => setSrt(e.target.checked)} /> Also save subtitles (.srt)
          </label>
          <span style={{ flex: 1 }} />
          <button type="button" className="cc-btn" disabled={busy || !file.trim() || !tools?.ready} onClick={start}>Transcribe</button>
        </div>
      </div>

      {jobs.length > 0 && (
        <div style={col}>
          {[...jobs].reverse().slice(0, 6).map((j) => {
            const p = progress[j.id];
            const pct = j.state === "running" && p ? p.pct : j.pct;
            const name = j.source.split(/[\\/]/).pop();
            return (
              <div key={j.id} className="cc-row" style={{ gap: 10 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="cc-label" style={{ overflowWrap: "anywhere" }}>{name}</div>
                  <div className="cc-desc">
                    {j.state === "running" ? `${p?.stage ?? j.stage} · ${pct}%` : j.state}
                    {j.error ? ` — ${j.error}` : ""}
                    {j.txtPath ? ` · ${j.txtPath}` : ""}
                  </div>
                  {j.state === "running" && (
                    <div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} className="lens-meter" style={{ height: 4, borderRadius: 2, background: "rgb(var(--lens-ink) / 0.08)", marginTop: 4 }}>
                      <div className="lens-meter-fill" style={{ "--fill": Math.max(0, Math.min(100, pct)) / 100, borderRadius: 2, background: "var(--lens-fg)" } as React.CSSProperties} />
                    </div>
                  )}
                </div>
                {j.state === "running" && (
                  <button type="button" className="cc-btn-ghost" onClick={() => invoke("transcribe_cancel", { id: j.id }).then(refresh)}>Cancel</button>
                )}
              </div>
            );
          })}
        </div>
      )}
      {note && <div className="cc-desc" role="status">{note}</div>}
    </div>
  );
};
