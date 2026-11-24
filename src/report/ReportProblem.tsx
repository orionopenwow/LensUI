// Settings › About & Testing › Report a problem (docs/REPORTING.md). Also opened from the tray
// menu, `/report` in Command, and the card a crashed window shows. Lens uploads nothing: the
// person opens a prefilled GitHub issue, copies the report, or saves it as a file.
import React, { useEffect, useRef, useState } from "react";
import { Row, StateNote, Toggle } from "../settings/ui/primitives";
import { ATTACHMENTS, canSend, emptyRequest, openNote, type ReportPreview, type ReportRequest } from "./model";
import { copyText, reportApi } from "./api";
import "./report.css";

export const ReportProblem: React.FC = () => {
  const [req, setReq] = useState<ReportRequest>(emptyRequest);
  const [preview, setPreview] = useState<ReportPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState<{ kind: "info" | "error"; text: string } | null>(null);
  const seq = useRef(0);

  // The preview follows the form (debounced), so it always shows exactly what will be shared.
  useEffect(() => {
    const mine = ++seq.current;
    setLoading(true);
    const t = window.setTimeout(() => {
      reportApi
        .preview(req)
        .then((p) => mine === seq.current && setPreview(p))
        .catch((e) => mine === seq.current && setNote({ kind: "error", text: `Couldn't build the report: ${String(e)}` }))
        .finally(() => mine === seq.current && setLoading(false));
    }, 350);
    return () => window.clearTimeout(t);
  }, [req]);

  const set = <K extends keyof ReportRequest>(k: K, v: ReportRequest[K]) => {
    setNote(null);
    setReq((r) => ({ ...r, [k]: v }));
  };
  const ready = canSend(req) && !!preview && !loading;

  const openGithub = async () => {
    if (!preview) return;
    if (preview.needsPaste && !(await copyText(preview.text))) {
      setNote({ kind: "error", text: "Couldn't copy the report. Use Save to file and attach it to the issue instead." });
      return;
    }
    reportApi
      .openIssue(preview.issueUrl)
      .then(() => setNote({ kind: "info", text: openNote(preview) }))
      .catch((e) => setNote({ kind: "error", text: String(e) }));
  };

  return (
    <div className="rp-sheet">
      <p className="cc-desc">
        Tell us what went wrong. You see the whole report before anything leaves this PC, and Lens never uploads it for you: you open it as
        a GitHub issue, copy it, or save it.
      </p>
      <label className="rp-field">
        <span className="sh-row-label">What happened?</span>
        <textarea
          className="cc-input rp-text"
          rows={3}
          value={req.whatHappened}
          placeholder="The Dock stayed open after I closed Settings…"
          onChange={(e) => set("whatHappened", e.target.value)}
        />
      </label>
      <label className="rp-field">
        <span className="sh-row-label">Steps to make it happen again (optional)</span>
        <textarea
          className="cc-input rp-text"
          rows={2}
          value={req.steps}
          placeholder={"1. Open Settings\n2. Drag it to the left"}
          onChange={(e) => set("steps", e.target.value)}
        />
      </label>

      <div className="rp-attach" role="group" aria-label="What to attach">
        {ATTACHMENTS.map((a) => (
          <Row key={a.key} label={a.label} desc={a.desc}>
            <Toggle label={a.label} checked={req[a.key]} onChange={(v) => set(a.key, v)} />
          </Row>
        ))}
      </div>

      <details className="rp-preview">
        <summary className="cc-desc">{loading ? "Updating the preview…" : "Preview exactly what will be shared"}</summary>
        <pre className="cc-input rp-pre" aria-live="polite">
          {preview?.text ?? ""}
        </pre>
      </details>

      <div className="rp-actions">
        <button type="button" className="cc-btn" disabled={!ready} onClick={() => void openGithub()}>
          Open on GitHub
        </button>
        <button
          type="button"
          className="cc-btn-ghost"
          disabled={!ready}
          onClick={() =>
            preview &&
            void copyText(preview.text).then((ok) =>
              setNote(ok ? { kind: "info", text: "Report copied." } : { kind: "error", text: "Couldn't copy the report." }),
            )
          }
        >
          Copy report
        </button>
        <button
          type="button"
          className="cc-btn-ghost"
          disabled={!ready}
          onClick={() =>
            preview &&
            reportApi
              .save(preview.text)
              .then((where) => setNote({ kind: "info", text: `Saved to ${where}` }))
              .catch((e) => setNote({ kind: "error", text: `Couldn't save: ${String(e)}` }))
          }
        >
          Save to file
        </button>
      </div>
      {!canSend(req) && <div className="cc-desc rp-hint">Write a few words about what happened to send the report.</div>}
      {note && <StateNote kind={note.kind}>{note.text}</StateNote>}
    </div>
  );
};

export default ReportProblem;
